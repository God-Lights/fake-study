/* core.js — 상태, API, WebSocket(또는 미리보기용 로컬 서버), 공용 유틸 */
(function () {
  const GL = (window.GL = {
    state: { me: null, token: '', rooms: [], room: null, online: [], tabs: [], demo: false, connected: false },
  });

  // ── 이벤트 버스 ──
  const bus = new EventTarget();
  GL.on = (t, f) => bus.addEventListener(t, e => f(e.detail));
  GL.emit = (t, d) => bus.dispatchEvent(new CustomEvent(t, { detail: d }));

  // ── localStorage ──
  GL.store = {
    get(k, d) { try { const v = localStorage.getItem('fs_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('fs_' + k, JSON.stringify(v)); } catch { /* 용량 초과 등 */ } },
    del(k) { try { localStorage.removeItem('fs_' + k); } catch { } },
  };

  // ── DOM 헬퍼 ──
  GL.$ = (s, r) => (r || document).querySelector(s);
  GL.$$ = (s, r) => [...(r || document).querySelectorAll(s)];
  GL.h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };
  GL.add = (el, ...kids) => { el.append(...kids.flat().filter(k => k != null && k !== false)); return el; };
  GL.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  GL.uid = (p = '') => p + Math.random().toString(36).slice(2, 10);

  const ICONS = {
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    hl: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
    eraser: '<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 19"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    page: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6M9 15h6"/>',
    finger: '<path d="M12 22v-4"/><path d="M8 14V6a2 2 0 1 1 4 0v6"/><path d="M12 12V9.5a2 2 0 1 1 4 0V13"/><path d="M16 12a2 2 0 1 1 4 0v3a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.4L4 15.5a2 2 0 0 1 3.4-2.1L8 14"/>',
    board: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    game: '<rect x="2" y="6" width="20" height="12" rx="4"/><path d="M6 12h4M8 10v4M15 11h.01M18 13h.01"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a2 2 0 0 1 2-2h11"/>',
    thumb: '<path d="M7 10v11"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 18.5 21H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3l4-8a3 3 0 0 1 3 3.9Z"/>',
    speaker: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    share: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    pin: '<path d="M12 17v5"/><path d="M9 10.8V5h6v5.8l2 2.2v2H7v-2z"/>',
    retry: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  };
  GL.icon = (name, size) => `<svg class="i" viewBox="0 0 24 24"${size ? ` style="width:${size}px;height:${size}px"` : ''}>${ICONS[name] || ''}</svg>`;

  // ── 토스트 ──
  GL.toast = (msg, action, ms = 3500) => {
    const el = GL.h('div', { class: 'toast', role: 'status' }, msg);
    if (action) el.append(GL.h('button', { onclick: () => { action.fn(); el.remove(); } }, action.label));
    GL.$('#toasts').append(el);
    setTimeout(() => el.remove(), action ? ms * 2 : ms);
  };

  // ── 팝오버 ──
  let openPop = null;
  GL.closePop = () => { if (openPop) { openPop.remove(); openPop = null; } };
  GL.pop = (anchor, build) => {
    GL.closePop();
    const el = GL.h('div', { class: 'pop' });
    build(el);
    document.body.append(el);
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth, hgt = el.offsetHeight;
    let x = Math.min(r.left, innerWidth - w - 8), y = r.bottom + 6;
    if (y + hgt > innerHeight - 8) y = Math.max(8, r.top - hgt - 6);
    el.style.left = Math.max(8, x) + 'px';
    el.style.top = y + 'px';
    openPop = el;
    setTimeout(() => document.addEventListener('pointerdown', function off(e) {
      if (!el.contains(e.target)) { GL.closePop(); document.removeEventListener('pointerdown', off, true); }
    }, true));
    return el;
  };

  // ── 모달 ──
  GL.modal = build => {
    const m = GL.$('#modal');
    m.innerHTML = '';
    const box = GL.h('div', { class: 'mbox', role: 'dialog' });
    m.append(box);
    build(box, () => { m.hidden = true; m.innerHTML = ''; });
    m.hidden = false;
    const f = box.querySelector('input'); if (f) setTimeout(() => f.focus(), 50);
  };

  // ── REST ──
  GL.api = async (method, path, body) => {
    const headers = { 'Content-Type': 'application/json' };
    if (GL.state.token) headers.Authorization = 'Bearer ' + GL.state.token;
    const res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) throw new Error('no-api');
    const data = await res.json();
    if (!res.ok) { const e = new Error(data.error || '오류'); e.status = res.status; throw e; }
    return data;
  };

  // ── 실시간 연결 ──
  let ws = null, wsTimer = null, pingTimer = null, backoff = 800, wantRoom = null;

  GL.connect = roomId => {
    wantRoom = roomId;
    if (GL.state.demo) return GL.local.connect();
    if (ws) { ws.onclose = null; try { ws.close(); } catch { } }
    clearTimeout(wsTimer);
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/api/ws?token=${encodeURIComponent(GL.state.token)}&room=${encodeURIComponent(roomId)}`);
    ws.onopen = () => { backoff = 800; GL.state.connected = true; GL.emit('conn', true); };
    ws.onmessage = e => { let d; try { d = JSON.parse(e.data); } catch { return; } if (d.type !== 'pong') GL.emit('srv:' + d.type, d); };
    ws.onclose = () => {
      GL.state.connected = false; GL.emit('conn', false);
      if (wantRoom === roomId) wsTimer = setTimeout(() => GL.connect(roomId), backoff = Math.min(backoff * 1.7, 15000));
    };
    clearInterval(pingTimer);
    pingTimer = setInterval(() => GL.send({ type: 'ping' }), 25000);
  };

  GL.send = obj => {
    if (GL.state.demo) return GL.local.handle(obj);
    if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; }
    return false;
  };

  // ── 미리보기(서버 없이 열었을 때) — Room DO와 같은 규칙으로 흉내 낸다 ──
  GL.local = {
    db: null,
    load() {
      this.db = GL.store.get('demo_room', null) || {
        messages: [], lecture: null,
        tabs: [{ id: 'bdemo1', title: '수업 필기', paper: 'grid', pages: 1, ord: 0, created_by: 'me' }],
        strokes: {},
      };
    },
    save() { GL.store.set('demo_room', this.db); },
    connect() {
      this.load();
      const me = GL.state.me;
      setTimeout(() => {
        GL.state.connected = true; GL.emit('conn', true);
        GL.emit('srv:init', {
          type: 'init', me: { ...me, color: '#30d158' }, room: GL.state.room,
          messages: this.db.messages.slice(-150), tabs: this.db.tabs, lecture: this.db.lecture,
          online: [{ id: me.id, name: me.name, color: '#30d158', tab: null }],
        });
      });
    },
    handle(d) {
      const db = this.db, me = GL.state.me, out = (t, x) => setTimeout(() => GL.emit('srv:' + t, { type: t, ...x }));
      switch (d.type) {
        case 'chat': {
          const msg = { id: Date.now(), uid: me.id, name: me.name, text: d.text, at: Date.now() };
          db.messages.push(msg); db.messages = db.messages.slice(-300); out('chat', { msg }); break;
        }
        case 'lecture': db.lecture = { vid: d.vid, title: d.title, t: d.t, by: me.name, at: Date.now() }; break;
        case 'tab_add': db.tabs.push({ id: d.id, title: d.title, paper: d.paper || 'grid', pages: 1, ord: db.tabs.length, created_by: me.id }); out('tabs', { tabs: db.tabs }); break;
        case 'tab_update': {
          const t = db.tabs.find(t => t.id === d.id); if (!t) break;
          if (d.title) t.title = d.title; if (d.paper) t.paper = d.paper; if (d.pages) t.pages = d.pages;
          out('tabs', { tabs: db.tabs }); break;
        }
        case 'tab_del':
          if (db.tabs.length <= 1) { out('error', { message: '마지막 필기 탭은 지울 수 없습니다.' }); break; }
          db.tabs = db.tabs.filter(t => t.id !== d.id); delete db.strokes[d.id]; out('tabs', { tabs: db.tabs }); break;
        case 'view': if (d.tab) out('strokes', { tab: d.tab, strokes: db.strokes[d.tab] || [] }); break;
        case 'stroke': (db.strokes[d.tab] ||= []).push({ ...d.s, uid: me.id }); break;
        case 'erase': db.strokes[d.tab] = (db.strokes[d.tab] || []).filter(s => !d.ids.includes(s.id)); break;
        case 'clear': db.strokes[d.tab] = []; out('clear', { tab: d.tab, by: me.name }); break;
        default: return true;
      }
      clearTimeout(this._t); this._t = setTimeout(() => this.save(), 400);
      return true;
    },
  };
})();
