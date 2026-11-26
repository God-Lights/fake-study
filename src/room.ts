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
const QUIZ_MS = 90_000;
const WORDS = ('사과 바나나 수박 포도 딸기 고양이 강아지 토끼 기린 코끼리 펭귄 상어 문어 거북이 나비 ' +
  '자전거 비행기 기차 로켓 우산 안경 시계 가방 연필 지우개 칠판 책상 의자 냉장고 선풍기 ' +
  '눈사람 무지개 화산 등대 피라미드 성 텐트 다리 신호등 소방차 야구 축구공 농구 체스 볼링 ' +
  '햄버거 피자 라면 김밥 떡볶이 아이스크림 케이크 도넛 치킨 팝콘 ' +
  '해바라기 선인장 버섯 나무 별 달 해 구름 번개 눈 ' +
  '기타 피아노 드럼 마이크 헤드폰 카메라 로봇 외계인 유령 해적 왕관 ' +
  '삼각형 원기둥 포물선 저울 현미경 자석 전구 지구본 시험지 급식').split(' ');

interface Quiz {
  tab: string; drawer: string; drawerName: string; word: string; round: number;
  endsAt: number; active: boolean; lastWord?: string; scores: Record<string, { name: string; n: number }>;
}
interface GameRow { id: string; kind: string; w: string; wn: string; b: string; bn: string; moves: unknown[]; result: string | null; reason: string | null; at: number }
const norm = (t: string) => t.replace(/[\s.!?~,'"]/g, '').toLowerCase();

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
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, w TEXT NOT NULL, wn TEXT NOT NULL, b TEXT NOT NULL, bn TEXT NOT NULL,
        moves TEXT NOT NULL DEFAULT '[]', result TEXT, reason TEXT, at INTEGER NOT NULL
      );
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
  private quiz(): Quiz | null {
    const v = this.meta('quiz');
    return v ? (JSON.parse(v) as Quiz) : null;
  }
  private saveQuiz(q: Quiz) { this.setMeta('quiz', JSON.stringify(q)); }
  private publicQuiz(q: Quiz | null) {
    if (!q) return null;
    const { word, ...rest } = q;
    return rest;
  }
  private quizLocked(me: Att, tab: unknown): boolean {
    const q = this.quiz();
    return !!q && q.active && q.tab === tab && q.drawer !== me.uid;
  }
  private sys(text: string) {
    const at = Date.now();
    const id = this.sql.exec("INSERT INTO messages (uid, name, text, at) VALUES ('sys', '', ?, ?) RETURNING id", text, at).one().id as number;
    this.broadcast({ type: 'chat', msg: { id, uid: 'sys', name: '', text, at } });
  }
  private endQuiz(q: Quiz, text: string) {
    q.active = false; q.lastWord = q.word;
    this.saveQuiz(q);
    this.broadcast({ type: 'quiz', quiz: this.publicQuiz(q) });
    this.sys(text);
  }
  private sendWord(q: Quiz) {
    for (const ws of this.ctx.getWebSockets()) {
      const a = this.att(ws);
      if (a && a.uid === q.drawer) this.send(ws, { type: 'quiz_word', round: q.round, word: q.word });
    }
  }
  private games() {
    return this.sql.exec('SELECT * FROM games WHERE at > ? ORDER BY at DESC LIMIT 30', Date.now() - 3 * 86400_000)
      .toArray().map(g => ({ ...g, moves: JSON.parse(g.moves as string) }));
  }
  private game(id: string): GameRow | null {
    const g = this.sql.exec('SELECT * FROM games WHERE id = ?', id).toArray()[0];
    return g ? ({ ...g, moves: JSON.parse(g.moves as string) } as unknown as GameRow) : null;
  }

  async alarm(): Promise<void> {
    const q = this.quiz();
    if (q && q.active && Date.now() >= q.endsAt - 1000) this.endQuiz(q, `⏰ 시간 초과! 정답은 '${q.word}'였습니다.`);
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
      games: this.games(),
      quiz: this.publicQuiz(this.quiz()),
    });
    const q = this.quiz();
    if (q && q.active && q.drawer === uid) this.send(server, { type: 'quiz_word', round: q.round, word: q.word });
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
        const q = this.quiz();
        if (q && q.active) {
          if (q.drawer === me.uid && norm(text).includes(norm(q.word))) {
            this.send(ws, { type: 'error', message: '제시어는 채팅에 쓸 수 없어요.' });
            return;
          }
          if (q.drawer !== me.uid && norm(text) === norm(q.word)) {
            const add = (uid: string, name: string) => { q.scores[uid] = { name, n: (q.scores[uid]?.n ?? 0) + 1 }; };
            add(me.uid, me.name); add(q.drawer, q.drawerName);
            this.endQuiz(q, `🎉 ${me.name}님 정답! '${q.word}' — ${me.name} +1, ${q.drawerName} +1`);
            return;
          }
        }
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

      // ── 입력 중 표시 ──
      case 'typing':
        this.broadcast({ type: 'typing', uid: me.uid, name: me.name }, ws);
        return;

      // ── 캐치마인드 ──
      case 'quiz_start': {
        let q = this.quiz();
        if (q && q.active && Date.now() < q.endsAt) {
          this.send(ws, { type: 'error', message: `${q.drawerName}님이 그리는 중입니다. 끝나면 시작하세요.` });
          return;
        }
        let tab = isId(d.tab) && this.sql.exec('SELECT 1 FROM tabs WHERE id = ?', d.tab).toArray().length ? (d.tab as string) : '';
        if (!tab) {
          tab = 'b' + crypto.randomUUID().slice(0, 8);
          const ord = this.sql.exec('SELECT COALESCE(MAX(ord), -1) + 1 AS o FROM tabs').one().o as number;
          this.sql.exec("INSERT INTO tabs (id, title, paper, pages, ord, created_by) VALUES (?, '캐치마인드', 'blank', 1, ?, ?)", tab, ord, me.uid);
          this.broadcast({ type: 'tabs', tabs: this.tabs() });
        }
        let word = WORDS[Math.floor(Math.random() * WORDS.length)];
        if (q && word === q.lastWord) word = WORDS[(WORDS.indexOf(word) + 1) % WORDS.length];
        q = {
          tab, drawer: me.uid, drawerName: me.name, word, round: (q?.round ?? 0) + 1,
          endsAt: Date.now() + QUIZ_MS, active: true, lastWord: q?.lastWord, scores: q?.scores ?? {},
        };
        this.saveQuiz(q);
        this.sql.exec('DELETE FROM strokes WHERE tab_id = ?', tab);
        this.broadcast({ type: 'clear', tab });
        this.broadcast({ type: 'quiz', quiz: this.publicQuiz(q) });
        this.sendWord(q);
        await this.ctx.storage.setAlarm(q.endsAt);
        this.sys(`✏️ ${me.name}님이 그림을 그립니다. 질문창에 정답을 입력하세요! (90초)`);
        return;
      }
      case 'quiz_stop': {
        const q = this.quiz();
        if (!q || !q.active) return;
        this.endQuiz(q, `${me.name}님이 문제를 넘겼습니다. 정답은 '${q.word}'였습니다.`);
        return;
      }
      case 'quiz_reset': {
        const q = this.quiz();
        if (!q || q.active) return;
        q.scores = {};
        this.saveQuiz(q);
        this.broadcast({ type: 'quiz', quiz: this.publicQuiz(q) });
        return;
      }

      // ── 온라인 대국 (체스) ──
      case 'game_new': {
        if (!isId(d.id) || d.kind !== 'chess') return;
        const opp = this.online().find(u => u.id === d.opp);
        if (!opp || opp.id === me.uid) { this.send(ws, { type: 'error', message: '상대가 접속 중이 아닙니다.' }); return; }
        const meWhite = d.color !== 'b';
        const [w, wn, b, bn] = meWhite ? [me.uid, me.name, opp.id, opp.name] : [opp.id, opp.name, me.uid, me.name];
        this.sql.exec('INSERT OR IGNORE INTO games (id, kind, w, wn, b, bn, moves, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          d.id, 'chess', w, wn, b, bn, '[]', Date.now());
        this.broadcast({ type: 'game', game: this.game(d.id), by: me.uid });
        return;
      }
      case 'game_move': {
        if (!isId(d.id)) return;
        const g = this.game(d.id);
        const mv = d.mv as { f?: unknown; t?: unknown; p?: unknown } | undefined;
        if (!g || g.result || !mv || typeof mv.f !== 'number' || typeof mv.t !== 'number') return;
        const ply = g.moves.length;
        const side = ply % 2 === 0 ? g.w : g.b;
        if (d.ply !== ply || side !== me.uid) { this.send(ws, { type: 'game', game: g }); return; }
        const clean = { f: mv.f | 0, t: mv.t | 0, p: typeof mv.p === 'string' ? mv.p.slice(0, 1) : undefined };
        g.moves.push(clean);
        this.sql.exec('UPDATE games SET moves = ?, at = ? WHERE id = ?', JSON.stringify(g.moves), Date.now(), d.id);
        this.broadcast({ type: 'game_move', id: d.id, ply, mv: clean }, ws);
        return;
      }
      case 'game_end': {
        if (!isId(d.id)) return;
        const g = this.game(d.id);
        if (!g || g.result || (g.w !== me.uid && g.b !== me.uid)) return;
        const result = ['1-0', '0-1', '1/2'].includes(d.result as string) ? (d.result as string) : null;
        if (!result) return;
        this.sql.exec('UPDATE games SET result = ?, reason = ?, at = ? WHERE id = ?', result, str(d.reason, 30), Date.now(), d.id);
        this.broadcast({ type: 'game', game: this.game(d.id) });
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
        if (this.quizLocked(me, d.tab)) return;
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
        if (this.quizLocked(me, d.tab)) return;
        this.broadcast({ type: 'live', tab: d.tab, uid: me.uid, id: d.id, tool: d.tool, color: d.color, w: d.w, pts: d.pts }, ws);
        return;
      }
      case 'erase': {
        if (!isId(d.tab) || !Array.isArray(d.ids)) return;
        if (this.quizLocked(me, d.tab)) return;
        const ids = (d.ids as unknown[]).filter(isId).slice(0, 500);
        for (const id of ids) this.sql.exec('DELETE FROM strokes WHERE id = ? AND tab_id = ?', id, d.tab);
        if (ids.length) this.broadcast({ type: 'erase', tab: d.tab, ids }, ws);
        return;
      }
      case 'clear': {
        if (!isId(d.tab)) return;
        if (this.quizLocked(me, d.tab)) return;
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
