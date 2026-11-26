import { DurableObject } from 'cloudflare:workers';
import { Env } from './types';

// 수강반 하나 = Room DO 하나 (idFromName(roomId)).
// GL Chat ChatHub의 역할(WebSocket 중계)에 더해 채팅·화이트보드·공유 강의를 SQLite에 저장한다.

interface Att { uid: string; name: string; color: string; tab: string | null }

interface Stroke {
  id: string;
  uid?: string;
  tool: 'pen' | 'hl';
  color: string;
  w: number;
  pts: number[];
}

const MAX_MESSAGES = 500;
const MAX_STROKES_PER_TAB = 4000;
const MAX_PTS = 8000;
const MAX_TABS = 30;
const PALETTE = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#e03131', '#5f3dc4', '#c2255c', '#087f5b'];
const PAPERS = ['grid', 'lined', 'dot', 'blank'];

function colorFor(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const isId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v);

export class Room extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL, name TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tabs (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, paper TEXT NOT NULL,
        pages INTEGER NOT NULL DEFAULT 1, ord INTEGER NOT NULL, created_by TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS strokes (
        id TEXT PRIMARY KEY, tab_id TEXT NOT NULL, uid TEXT NOT NULL, data TEXT NOT NULL, seq INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_strokes_tab ON strokes(tab_id, seq);
    `);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  // ── helpers ─────────────────────────────────────────────────────────────
  private meta(k: string): string | null {
    const r = this.sql.exec('SELECT v FROM meta WHERE k = ?', k).toArray()[0];
    return r ? (r.v as string) : null;
  }
  private setMeta(k: string, v: string) {
    this.sql.exec('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, v);
  }
  private tabs() {
    return this.sql.exec('SELECT id, title, paper, pages, ord, created_by FROM tabs ORDER BY ord ASC').toArray();
  }
  private att(ws: WebSocket): Att | null {
    return (ws.deserializeAttachment() as Att | null) ?? null;
  }
  private send(ws: WebSocket, payload: unknown) {
    try { ws.send(JSON.stringify(payload)); } catch { /* closed */ }
  }
  private broadcast(payload: unknown, except?: WebSocket) {
    const msg = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(msg); } catch { /* closed */ }
    }
  }
  private online(except?: WebSocket) {
    const seen = new Map<string, Att>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const a = this.att(ws);
      if (a) seen.set(a.uid, a);
    }
    return [...seen.values()].map(a => ({ id: a.uid, name: a.name, color: a.color, tab: a.tab }));
  }
  private ensureDefaultTab(uid: string) {
    if ((this.sql.exec('SELECT COUNT(*) AS c FROM tabs').one().c as number) === 0) {
      this.sql.exec('INSERT INTO tabs (id, title, paper, pages, ord, created_by) VALUES (?, ?, ?, 1, 0, ?)',
        'b' + crypto.randomUUID().slice(0, 8), '수업 필기', 'grid', uid);
    }
  }

  // ── WebSocket 연결 (Worker에서 멤버십 검증 후 넘어옴) ─────────────────────
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const url = new URL(request.url);
    const uid = url.searchParams.get('uid') ?? '';
    const name = url.searchParams.get('name') ?? '익명';
    const roomId = url.searchParams.get('room') ?? '';
    const roomName = url.searchParams.get('roomName') ?? '';
    if (!uid) return new Response('Missing user', { status: 400 });

    if (roomId) this.setMeta('id', roomId);
    if (roomName) this.setMeta('name', roomName);
    this.ensureDefaultTab(uid);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    const att: Att = { uid, name, color: colorFor(uid), tab: null };
    server.serializeAttachment(att);
    this.ctx.acceptWebSocket(server);

    const messages = this.sql.exec(
      'SELECT * FROM (SELECT id, uid, name, text, at FROM messages ORDER BY id DESC LIMIT 150) ORDER BY id ASC',
    ).toArray();
    const lecture = this.meta('lecture');
    this.send(server, {
      type: 'init',
      me: { id: uid, name, color: att.color },
      room: { id: this.meta('id'), name: this.meta('name') },
      messages,
      tabs: this.tabs(),
      lecture: lecture ? JSON.parse(lecture) : null,
      online: this.online(),
    });
    this.broadcast({ type: 'presence', online: this.online() }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string' || raw.length > 200_000) return;
    const me = this.att(ws);
    if (!me) return;
    let d: Record<string, unknown>;
    try { d = JSON.parse(raw); } catch { return; }

    switch (d.type) {
      case 'ping':
        this.send(ws, { type: 'pong' });
        return;

      // ── 채팅 ──
      case 'chat': {
        const text = str(d.text, 2000).trim();
        if (!text) return;
        const at = Date.now();
        const id = this.sql.exec('INSERT INTO messages (uid, name, text, at) VALUES (?, ?, ?, ?) RETURNING id',
          me.uid, me.name, text, at).one().id as number;
        this.sql.exec('DELETE FROM messages WHERE id <= ?', id - MAX_MESSAGES);
        this.broadcast({ type: 'chat', msg: { id, uid: me.uid, name: me.name, text, at } });
        return;
      }

      // ── 공유 강의 (같이 듣기) ──
      case 'lecture': {
        const vid = str(d.vid, 20);
        if (!/^[A-Za-z0-9_-]{6,20}$/.test(vid)) return;
        const lecture = { vid, title: str(d.title, 120), t: Math.max(0, Number(d.t) || 0), by: me.name, at: Date.now() };
        this.setMeta('lecture', JSON.stringify(lecture));
        this.broadcast({ type: 'lecture', lecture }, ws);
        return;
      }

      // ── 노트 탭 ──
      case 'tab_add': {
        if ((this.sql.exec('SELECT COUNT(*) AS c FROM tabs').one().c as number) >= MAX_TABS) {
          this.send(ws, { type: 'error', message: `필기 탭은 ${MAX_TABS}개까지 만들 수 있습니다.` });
          return;
        }
        const id = isId(d.id) ? d.id : 'b' + crypto.randomUUID().slice(0, 8);
        const paper = PAPERS.includes(d.paper as string) ? (d.paper as string) : 'grid';
        const ord = (this.sql.exec('SELECT COALESCE(MAX(ord), -1) + 1 AS o FROM tabs').one().o as number);
        this.sql.exec('INSERT OR IGNORE INTO tabs (id, title, paper, pages, ord, created_by) VALUES (?, ?, ?, 1, ?, ?)',
          id, str(d.title, 40) || '새 필기', paper, ord, me.uid);
        this.broadcast({ type: 'tabs', tabs: this.tabs() });
        return;
      }
      case 'tab_update': {
        if (!isId(d.id)) return;
        if (typeof d.title === 'string' && d.title.trim()) this.sql.exec('UPDATE tabs SET title = ? WHERE id = ?', str(d.title, 40).trim(), d.id);
        if (PAPERS.includes(d.paper as string)) this.sql.exec('UPDATE tabs SET paper = ? WHERE id = ?', d.paper as string, d.id);
        if (typeof d.pages === 'number') this.sql.exec('UPDATE tabs SET pages = ? WHERE id = ?', Math.min(20, Math.max(1, Math.floor(d.pages))), d.id);
        this.broadcast({ type: 'tabs', tabs: this.tabs() });
        return;
      }
      case 'tab_del': {
        if (!isId(d.id)) return;
        if ((this.sql.exec('SELECT COUNT(*) AS c FROM tabs').one().c as number) <= 1) {
          this.send(ws, { type: 'error', message: '마지막 필기 탭은 지울 수 없습니다.' });
          return;
        }
        this.sql.exec('DELETE FROM tabs WHERE id = ?', d.id);
        this.sql.exec('DELETE FROM strokes WHERE tab_id = ?', d.id);
        this.broadcast({ type: 'tabs', tabs: this.tabs() });
        return;
      }

      // ── 화이트보드 ──
      case 'view': {
        // 지금 보고 있는 탭 (탭 위 접속자 점 표시용)
        me.tab = isId(d.tab) ? d.tab : null;
        ws.serializeAttachment(me);
        this.broadcast({ type: 'presence', online: this.online() });
        if (me.tab) {
          const strokes = this.sql.exec('SELECT data FROM strokes WHERE tab_id = ? ORDER BY seq ASC', me.tab)
            .toArray().map(r => JSON.parse(r.data as string));
          this.send(ws, { type: 'strokes', tab: me.tab, strokes });
        }
        return;
      }
      case 'stroke': {
        if (!isId(d.tab)) return;
        const s = d.s as Stroke | undefined;
        if (!s || !isId(s.id) || !Array.isArray(s.pts) || s.pts.length < 2 || s.pts.length > MAX_PTS) return;
        if (!s.pts.every(n => typeof n === 'number' && Number.isFinite(n))) return;
        const stroke: Stroke = {
          id: s.id, uid: me.uid,
          tool: s.tool === 'hl' ? 'hl' : 'pen',
          color: /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : '#222222',
          w: Math.min(60, Math.max(0.5, Number(s.w) || 2)),
          pts: s.pts.map(n => Math.round(n * 10) / 10),
        };
        const exists = this.sql.exec('SELECT 1 FROM tabs WHERE id = ?', d.tab).toArray().length > 0;
        if (!exists) return;
        const n = this.sql.exec('SELECT COUNT(*) AS c FROM strokes WHERE tab_id = ?', d.tab).one().c as number;
        if (n >= MAX_STROKES_PER_TAB) {
          this.send(ws, { type: 'error', message: '이 페이지에 필기가 너무 많습니다. 새 탭을 만들어 주세요.' });
          return;
        }
        const seq = Date.now() * 1000 + Math.floor(Math.random() * 1000);
        this.sql.exec('INSERT OR REPLACE INTO strokes (id, tab_id, uid, data, seq) VALUES (?, ?, ?, ?, ?)',
          stroke.id, d.tab, me.uid, JSON.stringify(stroke), seq);
        this.broadcast({ type: 'stroke', tab: d.tab, s: stroke }, ws);
        return;
      }
      case 'live': {
        // 그리는 중인 획 — 저장하지 않고 중계만
        if (!isId(d.tab) || !Array.isArray(d.pts) || d.pts.length > MAX_PTS) return;
        this.broadcast({ type: 'live', tab: d.tab, uid: me.uid, id: d.id, tool: d.tool, color: d.color, w: d.w, pts: d.pts }, ws);
        return;
      }
      case 'erase': {
        if (!isId(d.tab) || !Array.isArray(d.ids)) return;
        const ids = (d.ids as unknown[]).filter(isId).slice(0, 500);
        for (const id of ids) this.sql.exec('DELETE FROM strokes WHERE id = ? AND tab_id = ?', id, d.tab);
        if (ids.length) this.broadcast({ type: 'erase', tab: d.tab, ids }, ws);
        return;
      }
      case 'clear': {
        if (!isId(d.tab)) return;
        this.sql.exec('DELETE FROM strokes WHERE tab_id = ?', d.tab);
        this.broadcast({ type: 'clear', tab: d.tab, by: me.name });
        return;
      }
      case 'cursor': {
        if (!isId(d.tab)) return;
        const x = Number(d.x), y = Number(d.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        this.broadcast({ type: 'cursor', tab: d.tab, uid: me.uid, name: me.name, color: me.color, x, y }, ws);
        return;
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try { ws.close(); } catch { /* already closed */ }
    this.broadcast({ type: 'presence', online: this.online(ws) }, ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }
}
