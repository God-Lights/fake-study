/* board.js — 공유 화이트보드 (Apple Pencil / 마우스 / 손가락)
   좌표계: 페이지 너비 1000, 페이지 높이 1414 (A4 비율). 문서 y = 페이지번호*1414 + 페이지 내 y */
(function () {
  const { $, h, store, icon } = GL;
  const W = 1000, H = 1414, MAX_PAGES = 10;
  const INKS = ['#1d1d1f', '#1f4fa8', '#c92a2a', '#2b8a3e', '#e8590c'];
  const HL_INKS = ['#ffd60a', '#69db7c', '#74c0fc', '#f783ac', '#ffa94d'];
  const WIDTHS = { pen: [2, 3.6, 6.5], hl: [14, 22, 32] };

  const S = {
    tab: null, strokes: new Map(), pages: [], loaded: false,
    tool: store.get('b_tool', 'pen'), ink: store.get('b_ink', 0), hlInk: store.get('b_hlInk', 0), wi: store.get('b_wi', 1),
    finger: store.get('b_finger', !matchMedia('(pointer: coarse)').matches ? true : false),
    pencilSeen: false, drawing: null, undo: new Map(), live: new Map(), cursors: new Map(),
    scale: 1, dpr: 1,
  };
  const pagesEl = $('#pages'), scroller = $('#boardScroll'), cursorsEl = $('#cursors'), tools = $('#boardTools');

  // ── 페이지(캔버스) ──
  function buildPages(n) {
    n = Math.max(1, Math.min(MAX_PAGES, n || 1));
    if (S.pages.length === n) return;
    while (S.pages.length > n) S.pages.pop().el.remove();
    while (S.pages.length < n) {
      const i = S.pages.length;
      const base = h('canvas');
      const el = h('div', { class: 'page', 'data-i': i }, base, h('span', { class: 'page-no' }, String(i + 1)));
      pagesEl.append(el);
      S.pages.push({ el, base, ctx: base.getContext('2d'), live: null, liveCtx: null, liveT: 0 });
    }
    resize();
  }

  function resize() {
    if (!S.pages.length) return;
    const pw = S.pages[0].el.clientWidth;
    if (!pw) return;
    S.scale = pw / W;
    S.dpr = Math.min(devicePixelRatio || 1, S.pages.length > 4 ? 1.5 : 2);
    pagesEl.style.setProperty('--cell', (40 * S.scale) + 'px');
    for (const p of S.pages) {
      p.base.width = Math.round(pw * S.dpr);
      p.base.height = Math.round(pw * H / W * S.dpr);
      if (p.live) { p.live.width = p.base.width; p.live.height = p.base.height; }
    }
    redrawAll();
    placeCursors();
  }
  new ResizeObserver(() => resize()).observe(pagesEl);

  const pageOf = s => Math.max(0, Math.floor(s.pts[1] / H));

  function drawStroke(ctx, s, pageIdx) {
    const k = S.scale * S.dpr, oy = pageIdx * H, p = s.pts;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
    ctx.globalAlpha = s.tool === 'hl' ? 0.38 : 1;
    ctx.lineWidth = s.w * k;
    ctx.beginPath();
    if (p.length <= 2) {
      ctx.arc(p[0] * k, (p[1] - oy) * k, s.w * k / 2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.moveTo(p[0] * k, (p[1] - oy) * k);
      for (let i = 2; i < p.length - 2; i += 2) {
        const mx = (p[i] + p[i + 2]) / 2, my = (p[i + 1] + p[i + 3]) / 2;
        ctx.quadraticCurveTo(p[i] * k, (p[i + 1] - oy) * k, mx * k, (my - oy) * k);
      }
      ctx.lineTo(p[p.length - 2] * k, (p[p.length - 1] - oy) * k);
      ctx.stroke();
    }
    ctx.restore();
  }

  function redrawPage(i) {
    const p = S.pages[i]; if (!p) return;
    p.ctx.clearRect(0, 0, p.base.width, p.base.height);
    // 형광펜을 먼저 깔고 그 위에 펜 (굿노트처럼 글씨가 형광펜에 묻히지 않게)
    for (const pass of ['hl', 'pen'])
      for (const s of S.strokes.values()) if (s.tool === pass && pageOf(s) === i) drawStroke(p.ctx, s, i);
  }
  function redrawAll() { S.pages.forEach((_, i) => redrawPage(i)); }

  // 라이브(그리는 중) 레이어 — 필요할 때만 만든다 (iPad 메모리 절약)
  function liveCanvas(i) {
    const p = S.pages[i];
    if (!p.live) {
      p.live = h('canvas'); p.live.width = p.base.width; p.live.height = p.base.height;
      p.el.insertBefore(p.live, p.el.querySelector('.page-no'));
      p.liveCtx = p.live.getContext('2d');
    }
    p.liveT = Date.now();
    return p.liveCtx;
  }
  let liveQueued = false;
  function queueLive() { if (!liveQueued) { liveQueued = true; requestAnimationFrame(renderLive); } }
  function renderLive() {
    liveQueued = false;
    const byPage = new Map();
    const add = s => { const i = pageOf(s); if (S.pages[i]) (byPage.get(i) || byPage.set(i, []).get(i)).push(s); };
    if (S.drawing && S.drawing.pts.length >= 2) add(S.drawing);
    for (const l of S.live.values()) if (l.pts && l.pts.length >= 2) add(l);
    S.pages.forEach((p, i) => {
      const list = byPage.get(i);
      if (!list && !p.live) return;
      const ctx = liveCanvas(i);
      ctx.clearRect(0, 0, p.live.width, p.live.height);
      if (list) list.forEach(s => drawStroke(ctx, s, i));
    });
  }
  setInterval(() => {
    const now = Date.now();
    for (const [k, l] of S.live) if (now - l.t > 2500) S.live.delete(k);
    for (const p of S.pages) if (p.live && now - p.liveT > 4000 && !S.drawing) { p.live.remove(); p.live = null; p.liveCtx = null; }
    for (const [k, c] of S.cursors) if (now - c.t > 4000) { c.el.remove(); S.cursors.delete(k); }
    if (S.live.size) queueLive();
  }, 1000);

  // ── 입력 ──
  function docPoint(e, pageEl) {
    const r = pageEl.getBoundingClientRect(), i = +pageEl.dataset.i;
    const x = (e.clientX - r.left) / S.scale, y = (e.clientY - r.top) / S.scale;
    return [Math.round(Math.max(-20, Math.min(W + 20, x)) * 10) / 10, Math.round((i * H + Math.max(-20, Math.min(H + 20, y))) * 10) / 10];
  }

  const canDraw = e => {
    if (!S.tab || S.tool === 'hand') return false;
    if (e.pointerType === 'pen') { S.pencilSeen = true; return true; }
    if (e.pointerType === 'touch') return S.finger;
    return e.button === 0;
  };

  // Apple Pencil로 그릴 땐 스크롤 막기 (손가락은 스크롤)
  scroller.addEventListener('touchstart', e => {
    if (S.tool !== 'hand' && [...e.touches].some(t => t.touchType === 'stylus')) e.preventDefault();
  }, { passive: false });
  scroller.addEventListener('touchmove', e => {
    if (S.drawing) e.preventDefault();
  }, { passive: false });

  pagesEl.addEventListener('pointerdown', e => {
    const pageEl = e.target.closest('.page');
    if (!pageEl || !canDraw(e)) return;
    e.preventDefault();
    pageEl.setPointerCapture(e.pointerId);
    const pt = docPoint(e, pageEl);
    if (S.tool === 'eraser') { S.drawing = { eraser: true, pageEl, pid: e.pointerId }; eraseAt(pt); return; }
    const hl = S.tool === 'hl';
    S.drawing = {
      id: GL.uid('s'), tool: hl ? 'hl' : 'pen', color: hl ? HL_INKS[S.hlInk] : INKS[S.ink],
      w: WIDTHS[hl ? 'hl' : 'pen'][S.wi], pts: [...pt], pageEl, pid: e.pointerId, lastSend: 0,
    };
    queueLive();
  });

  let lastCursor = 0;
  pagesEl.addEventListener('pointermove', e => {
    const d = S.drawing;
    const pageEl = d ? d.pageEl : e.target.closest('.page');
    if (!pageEl || !S.tab) return;
    const now = performance.now();
    if (d && e.pointerId === d.pid) {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of (evs.length ? evs : [e])) {
        const pt = docPoint(ev, pageEl);
        if (d.eraser) { eraseAt(pt); continue; }
        const n = d.pts.length;
        if (Math.hypot(pt[0] - d.pts[n - 2], pt[1] - d.pts[n - 1]) < 0.8) continue;
        if (n >= 7900) continue;
        d.pts.push(pt[0], pt[1]);
      }
      if (!d.eraser) {
        queueLive();
        if (now - d.lastSend > 70) { d.lastSend = now; GL.send({ type: 'live', tab: S.tab.id, id: d.id, tool: d.tool, color: d.color, w: d.w, pts: d.pts }); }
      }
    }
    if (now - lastCursor > 60) {
      lastCursor = now;
      const pt = docPoint(e, pageEl);
      GL.send({ type: 'cursor', tab: S.tab.id, x: pt[0], y: pt[1] });
    }
  });

  function endStroke(e) {
    const d = S.drawing;
    if (!d || e.pointerId !== d.pid) return;
    S.drawing = null;
    if (d.eraser || !S.tab) return;
    const s = { id: d.id, tool: d.tool, color: d.color, w: d.w, pts: d.pts };
    if (s.pts.length < 2) return;
    S.strokes.set(s.id, s);
    const i = pageOf(s);
    if (S.pages[i]) { if (s.tool === 'hl') redrawPage(i); else drawStroke(S.pages[i].ctx, s, i); }
    queueLive();
    myUndo().push(s.id);
    GL.send({ type: 'stroke', tab: S.tab.id, s });
  }
  pagesEl.addEventListener('pointerup', endStroke);
  pagesEl.addEventListener('pointercancel', endStroke);

  const myUndo = () => { const k = S.tab.id; if (!S.undo.has(k)) S.undo.set(k, []); return S.undo.get(k); };

  function distSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy;
    let t = l ? ((px - x1) * dx + (py - y1) * dy) / l : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
  function eraseAt([x, y]) {
    const R = 10, hit = [];
    for (const s of S.strokes.values()) {
      const p = s.pts, r = R + s.w / 2;
      for (let i = 0; i < p.length; i += 2) {
        const x2 = p[i + 2] ?? p[i], y2 = p[i + 3] ?? p[i + 1];
        if (Math.abs(p[i] - x) > r + 60 && Math.abs(x2 - x) > r + 60) continue;
        if (distSeg(x, y, p[i], p[i + 1], x2, y2) <= r) { hit.push(s.id); break; }
      }
    }
    if (!hit.length) return;
    const pages = new Set(hit.map(id => pageOf(S.strokes.get(id))));
    hit.forEach(id => S.strokes.delete(id));
    pages.forEach(redrawPage);
    GL.send({ type: 'erase', tab: S.tab.id, ids: hit });
  }

  function undo() {
    if (!S.tab) return;
    const st = myUndo();
    while (st.length) {
      const id = st.pop();
      const s = S.strokes.get(id);
      if (!s) continue;
      S.strokes.delete(id); redrawPage(pageOf(s));
      GL.send({ type: 'erase', tab: S.tab.id, ids: [id] });
      return;
    }
    GL.toast('되돌릴 필기가 없습니다.');
  }

  // ── 원격 커서 ("화면공유" 느낌) ──
  function placeCursor(c) {
    const i = Math.max(0, Math.floor(c.y / H)), p = S.pages[i];
    if (!p) { c.el.hidden = true; return; }
    c.el.hidden = false;
    c.el.style.left = (pagesEl.offsetLeft + p.el.offsetLeft + c.x * S.scale) + 'px';
    c.el.style.top = (pagesEl.offsetTop + p.el.offsetTop + (c.y - i * H) * S.scale) + 'px';
  }
  function placeCursors() { S.cursors.forEach(placeCursor); }

  // ── 서버 이벤트 ──
  GL.on('srv:strokes', d => {
    if (!S.tab || d.tab !== S.tab.id) return;
    S.strokes = new Map(d.strokes.map(s => [s.id, s]));
    S.loaded = true;
    const maxPage = d.strokes.reduce((m, s) => Math.max(m, pageOf(s)), 0);
    if (maxPage + 1 > S.pages.length) buildPages(maxPage + 1);
    redrawAll();
  });
  GL.on('srv:stroke', d => {
    if (!S.tab || d.tab !== S.tab.id) return;
    S.strokes.set(d.s.id, d.s);
    for (const [k, l] of S.live) if (l.id === d.s.id) S.live.delete(k);
    const i = pageOf(d.s);
    if (i >= S.pages.length && i < MAX_PAGES) buildPages(i + 1);
    if (S.pages[i]) { if (d.s.tool === 'hl') redrawPage(i); else drawStroke(S.pages[i].ctx, d.s, i); }
    queueLive();
  });
  GL.on('srv:live', d => {
    if (!S.tab || d.tab !== S.tab.id || !Array.isArray(d.pts)) return;
    S.live.set(d.uid, { id: d.id, tool: d.tool === 'hl' ? 'hl' : 'pen', color: d.color, w: +d.w || 2, pts: d.pts, t: Date.now() });
    queueLive();
  });
  GL.on('srv:erase', d => {
    if (!S.tab || d.tab !== S.tab.id) return;
    const pages = new Set();
    d.ids.forEach(id => { const s = S.strokes.get(id); if (s) { pages.add(pageOf(s)); S.strokes.delete(id); } });
    pages.forEach(redrawPage);
  });
  GL.on('srv:clear', d => {
    if (!S.tab || d.tab !== S.tab.id) return;
    S.strokes.clear(); redrawAll();
    if (d.by && d.by !== GL.state.me.name) GL.toast(`${d.by}님이 이 페이지를 지웠습니다.`);
  });
  GL.on('srv:cursor', d => {
    if (!S.tab || d.tab !== S.tab.id) return;
    let c = S.cursors.get(d.uid);
    if (!c) {
      const el = h('div', { class: 'rcur' }, h('i', { style: `background:${d.color}` }), h('span', { style: `background:${d.color}` }, d.name));
      cursorsEl.append(el);
      c = { el }; S.cursors.set(d.uid, c);
    }
    Object.assign(c, { x: d.x, y: d.y, t: Date.now() });
    placeCursor(c);
  });

  // ── 툴바 ──
  function renderTools() {
    const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
    const tb = (tool, ic, label) => h('button', { class: 'tool', title: label, 'aria-label': label, 'aria-pressed': String(S.tool === tool), html: icon(ic), onclick: () => setTool(tool) });
    const inks = S.tool === 'hl' ? HL_INKS : INKS, sel = S.tool === 'hl' ? S.hlInk : S.ink;
    tools.innerHTML = '';
    tools.append(
      tb('pen', 'pen', '펜'), tb('hl', 'hl', '형광펜'), tb('eraser', 'eraser', '지우개'), tb('hand', 'hand', '이동'),
      h('span', { class: 'tsep' }),
      ...inks.map((c, i) => h('button', { class: 'swatch', title: '색', 'aria-pressed': String(sel === i && S.tool !== 'eraser'), onclick: () => { if (S.tool === 'hl') S.hlInk = i; else { S.ink = i; if (S.tool !== 'pen') S.tool = 'pen'; } persist(); renderTools(); } }, h('i', { style: `background:${c}` }))),
      h('span', { class: 'tsep' }),
      ...[0, 1, 2].map(i => h('button', { class: 'width-btn', title: ['가늘게', '보통', '굵게'][i], 'aria-pressed': String(S.wi === i), onclick: () => { S.wi = i; persist(); renderTools(); } }, h('i', { style: `height:${[2, 4, 7][i]}px` }))),
      h('span', { class: 'tsep' }),
      h('button', { class: 'tool', title: '되돌리기', 'aria-label': '되돌리기', html: icon('undo'), onclick: undo }),
      h('div', { class: 'tb-right' },
        isTouch ? h('button', { class: 'tool', title: '손가락으로 그리기', 'aria-label': '손가락으로 그리기', 'aria-pressed': String(S.finger), html: icon('finger'), onclick: () => { S.finger = !S.finger; persist(); renderTools(); GL.toast(S.finger ? '손가락으로도 그립니다.' : '손가락은 스크롤, 펜슬로만 그립니다.'); } }) : null,
        h('button', { class: 'tool', title: '종이 바꾸기', 'aria-label': '종이 바꾸기', html: icon('board'), onclick: e => paperMenu(e.currentTarget) }),
        h('button', { class: 'tool', title: '페이지 추가', 'aria-label': '페이지 추가', html: icon('page'), onclick: addPage }),
        h('button', { class: 'tool', title: '이 노트 전체 지우기', 'aria-label': '전체 지우기', html: icon('trash'), onclick: clearAll }),
      ),
    );
    scroller.classList.toggle('finger', S.finger && S.tool !== 'hand');
  }
  function setTool(t) { S.tool = t; persist(); renderTools(); }
  function persist() { store.set('b_tool', S.tool); store.set('b_ink', S.ink); store.set('b_hlInk', S.hlInk); store.set('b_wi', S.wi); store.set('b_finger', S.finger); }

  function paperMenu(anchor) {
    GL.pop(anchor, el => {
      el.append(h('h4', {}, '종이'));
      [['grid', '모눈'], ['lined', '줄 노트'], ['dot', '점 노트'], ['blank', '무지']].forEach(([k, n]) =>
        el.append(h('button', { onclick: () => { GL.closePop(); GL.send({ type: 'tab_update', id: S.tab.id, paper: k }); } }, n, S.tab.paper === k ? h('small', {}, '사용 중') : null)));
    });
  }
  function addPage() {
    if (S.pages.length >= MAX_PAGES) { GL.toast(`페이지는 ${MAX_PAGES}장까지 쓸 수 있습니다.`); return; }
    GL.send({ type: 'tab_update', id: S.tab.id, pages: S.pages.length + 1 });
    buildPages(S.pages.length + 1);
    setTimeout(() => S.pages[S.pages.length - 1].el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }
  function clearAll() {
    GL.modal((box, close) => {
      box.append(h('h2', {}, '이 노트를 전부 지울까요?'),
        h('p', {}, '수강반 모두의 화면에서 이 탭의 필기가 지워집니다. 되돌릴 수 없습니다.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: close }, '취소'),
          h('button', { class: 'btn primary', onclick: () => { GL.send({ type: 'clear', tab: S.tab.id }); close(); } }, '전부 지우기')));
    });
  }

  document.addEventListener('keydown', e => {
    if (!S.tab || GL.$('#stage').dataset.mode !== 'note' || e.target.closest('input,textarea')) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    const map = { p: 'pen', h: 'hl', e: 'eraser', ' ': null };
    if (!e.metaKey && !e.ctrlKey && map[e.key]) setTool(map[e.key]);
  });

  // ── 외부 API (notebook.js에서 사용) ──
  GL.board = {
    open(tab) {
      const same = S.tab && S.tab.id === tab.id;
      S.tab = tab;
      tools.hidden = false; scroller.hidden = false;
      if (!same) {
        S.strokes.clear(); S.live.clear(); S.loaded = false;
        S.cursors.forEach(c => c.el.remove()); S.cursors.clear();
        S.pages.forEach(p => p.el.remove()); S.pages = [];
        scroller.scrollTop = 0;
      }
      buildPages(tab.pages);
      S.pages.forEach(p => p.el.dataset.paper = tab.paper);
      renderTools();
      if (!same) { redrawAll(); GL.send({ type: 'view', tab: tab.id }); }
    },
    update(tab) {
      if (!S.tab || S.tab.id !== tab.id) return;
      S.tab = tab;
      if (tab.pages > S.pages.length) buildPages(tab.pages);
      S.pages.forEach(p => p.el.dataset.paper = tab.paper);
    },
    hide() { tools.hidden = true; scroller.hidden = true; if (S.tab) { S.tab = null; GL.send({ type: 'view', tab: null }); } },
    current: () => S.tab,
    reopen() { if (S.tab) { const t = S.tab; S.tab = null; GL.board.open(t); } },
  };
})();
