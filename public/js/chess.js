/* chess.js — 체스 (혼자 vs 컴퓨터 / 둘이서). 기물은 잉크 글씨, 칸은 연필 빗금. */
(function () {
  const { h, store } = GL;
  const FILES = 'abcdefgh';
  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  // 간단한 위치 점수 (백 기준, 0 = a8)
  const PST = {
    p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  };
  const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const isW = p => p && p === p.toUpperCase();
  const color = p => (p ? (isW(p) ? 'w' : 'b') : null);
  const sq = i => FILES[i % 8] + (8 - Math.floor(i / 8));

  function initial() {
    const b = Array(64).fill(null);
    'rnbqkbnr'.split('').forEach((p, i) => { b[i] = p; b[56 + i] = p.toUpperCase(); b[8 + i] = 'p'; b[48 + i] = 'P'; });
    return { b, turn: 'w', castle: { K: true, Q: true, k: true, q: true }, ep: -1, moves: [] };
  }
  const clone = s => ({ b: s.b.slice(), turn: s.turn, castle: { ...s.castle }, ep: s.ep, moves: s.moves });

  function attacked(b, i, by) {
    const r = Math.floor(i / 8), c = i % 8;
    const at = (rr, cc) => (rr < 0 || cc < 0 || rr > 7 || cc > 7) ? undefined : b[rr * 8 + cc];
    const own = p => p && color(p) === by;
    const pr = by === 'w' ? 1 : -1; // 백 폰은 아래(행+1)에서 공격
    for (const dc of [-1, 1]) { const p = at(r + pr, c + dc); if (own(p) && p.toLowerCase() === 'p') return true; }
    for (const [dr, dc] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) { const p = at(r + dr, c + dc); if (own(p) && p.toLowerCase() === 'n') return true; }
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const p = at(r + dr, c + dc); if (own(p) && p.toLowerCase() === 'k') return true; }
    for (const [dr, dc, kinds] of [[1, 0, 'rq'], [-1, 0, 'rq'], [0, 1, 'rq'], [0, -1, 'rq'], [1, 1, 'bq'], [1, -1, 'bq'], [-1, 1, 'bq'], [-1, -1, 'bq']]) {
      for (let k = 1; ; k++) {
        const p = at(r + dr * k, c + dc * k);
        if (p === undefined) break;
        if (p) { if (own(p) && kinds.includes(p.toLowerCase())) return true; break; }
      }
    }
    return false;
  }
  const kingAt = (b, col) => b.findIndex(p => p === (col === 'w' ? 'K' : 'k'));
  const inCheck = (s, col) => attacked(s.b, kingAt(s.b, col), col === 'w' ? 'b' : 'w');

  function pseudo(s) {
    const out = [], b = s.b, me = s.turn;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p || color(p) !== me) continue;
      const r = Math.floor(i / 8), c = i % 8, t = p.toLowerCase();
      const push = (to, extra) => out.push({ from: i, to, piece: p, cap: b[to], ...extra });
      const tryTo = (rr, cc) => {
        if (rr < 0 || cc < 0 || rr > 7 || cc > 7) return false;
        const to = rr * 8 + cc, q = b[to];
        if (q && color(q) === me) return false;
        push(to); return !q;
      };
      if (t === 'p') {
        const d = me === 'w' ? -1 : 1, start = me === 'w' ? 6 : 1, last = me === 'w' ? 0 : 7;
        const one = (r + d) * 8 + c;
        const promo = (to, cap) => (Math.floor(to / 8) === last ? push(to, { promo: me === 'w' ? 'Q' : 'q', cap }) : push(to, { cap }));
        if (r + d >= 0 && r + d <= 7 && !b[one]) {
          promo(one, null);
          const two = (r + 2 * d) * 8 + c;
          if (r === start && !b[two]) push(two, { double: true });
        }
        for (const dc of [-1, 1]) {
          const cc = c + dc; if (cc < 0 || cc > 7 || r + d < 0 || r + d > 7) continue;
          const to = (r + d) * 8 + cc;
          if (b[to] && color(b[to]) !== me) promo(to, b[to]);
          else if (to === s.ep) push(to, { epCap: r * 8 + cc, cap: b[r * 8 + cc] });
        }
      } else if (t === 'n') {
        for (const [dr, dc] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) tryTo(r + dr, c + dc);
      } else if (t === 'k') {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) tryTo(r + dr, c + dc);
        const home = me === 'w' ? 60 : 4, opp = me === 'w' ? 'b' : 'w';
        if (i === home && !attacked(b, home, opp)) {
          const [K, Q] = me === 'w' ? ['K', 'Q'] : ['k', 'q'];
          if (s.castle[K] && !b[home + 1] && !b[home + 2] && !attacked(b, home + 1, opp) && !attacked(b, home + 2, opp)) push(home + 2, { castle: 'K' });
          if (s.castle[Q] && !b[home - 1] && !b[home - 2] && !b[home - 3] && !attacked(b, home - 1, opp) && !attacked(b, home - 2, opp)) push(home - 2, { castle: 'Q' });
        }
      } else {
        const dirs = t === 'r' ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : t === 'b' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
        for (const [dr, dc] of dirs) for (let k = 1; tryTo(r + dr * k, c + dc * k); k++);
      }
    }
    return out;
  }

  function apply(s, m) {
    const n = clone(s), b = n.b;
    b[m.to] = m.promo || m.piece; b[m.from] = null;
    if (m.epCap != null) b[m.epCap] = null;
    if (m.castle) {
      const row = m.from - (m.from % 8);
      if (m.castle === 'K') { b[row + 5] = b[row + 7]; b[row + 7] = null; } else { b[row + 3] = b[row]; b[row] = null; }
    }
    n.ep = m.double ? (m.from + m.to) / 2 : -1;
    const lose = { 60: 'KQ', 4: 'kq', 63: 'K', 56: 'Q', 7: 'k', 0: 'q' };
    for (const i of [m.from, m.to]) if (lose[i]) for (const ch of lose[i]) n.castle[ch] = false;
    n.turn = s.turn === 'w' ? 'b' : 'w';
    return n;
  }
  const legal = s => pseudo(s).filter(m => !inCheck(apply(s, m), s.turn));

  function san(s, m, all) {
    if (m.castle) return m.castle === 'K' ? 'O-O' : 'O-O-O';
    const t = m.piece.toLowerCase();
    let out = '';
    if (t === 'p') { if (m.cap) out = FILES[m.from % 8]; }
    else {
      out = t.toUpperCase();
      const twins = all.filter(o => o.from !== m.from && o.to === m.to && o.piece === m.piece);
      if (twins.length) out += twins.some(o => o.from % 8 === m.from % 8) ? sq(m.from)[1] : FILES[m.from % 8];
    }
    if (m.cap) out += 'x';
    out += sq(m.to);
    if (m.promo) out += '=Q';
    const n = apply(s, m);
    if (inCheck(n, n.turn)) out += legal(n).length ? '+' : '#';
    return out;
  }

  // ── AI: 알파베타 ──
  function evaluate(s) {
    let v = 0;
    s.b.forEach((p, i) => {
      if (!p) return;
      const t = p.toLowerCase();
      const pos = isW(p) ? PST[t][i] : PST[t][(7 - Math.floor(i / 8)) * 8 + (i % 8)];
      v += (isW(p) ? 1 : -1) * (VAL[t] + pos);
    });
    return s.turn === 'w' ? v : -v;
  }
  function search(s, depth, alpha, beta, deadline) {
    if (depth === 0 || Date.now() > deadline) return evaluate(s);
    const ms = legal(s);
    if (!ms.length) return inCheck(s, s.turn) ? -100000 - depth : 0;
    ms.sort((a, b) => (b.cap ? VAL[b.cap.toLowerCase()] : 0) - (a.cap ? VAL[a.cap.toLowerCase()] : 0));
    for (const m of ms) {
      const v = -search(apply(s, m), depth - 1, -beta, -alpha, deadline);
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }
  function bestMove(s) {
    const ms = legal(s), deadline = Date.now() + 1500;
    let best = null, bestV = -Infinity;
    ms.sort(() => Math.random() - 0.5).sort((a, b) => (b.cap ? 1 : 0) - (a.cap ? 1 : 0));
    for (const m of ms) {
      const v = -search(apply(s, m), 2, -Infinity, -bestV, deadline);
      if (v > bestV) { bestV = v; best = m; }
    }
    return best || ms[0];
  }

  // ── 온라인 대국 상태 (수강반 서버에 저장) ──
  const games = new Map();      // id -> game row {id,w,wn,b,bn,moves:[{f,t,p}],result}
  const views = new Map();      // id -> redraw()
  GL.on('srv:init', d => { games.clear(); (d.games || []).forEach(g => games.set(g.id, g)); views.forEach(f => f()); });
  GL.on('srv:game', d => {
    const g = d.game; if (!g) return;
    const isNew = !games.has(g.id);
    games.set(g.id, g);
    if (views.has(g.id)) views.get(g.id)();
    const me = GL.state.me && GL.state.me.id;
    if (!isNew || (g.w !== me && g.b !== me)) return;
    const opp = g.w === me ? g.bn : g.wn;
    if (d.by === me) GL.notebook.addGame('chess', { online: g.id, title: `좌표평면 연습 (vs ${opp})` });
    else GL.toast(`${opp}님이 체스 대국을 신청했습니다.`, { label: '받기', fn: () => { GL.setMode('note'); GL.notebook.addGame('chess', { online: g.id, title: `좌표평면 연습 (vs ${opp})` }); } }, 8000);
  });
  GL.on('srv:game_move', d => {
    const g = games.get(d.id); if (!g) return;
    if (g.moves.length === d.ply) g.moves.push(d.mv);
    if (views.has(d.id)) views.get(d.id)();
  });
  function replay(moves) {
    const h = [initial()];
    for (const mv of moves) {
      const s = h[h.length - 1], all = legal(s);
      const m = all.find(x => x.from === mv.f && x.to === mv.t);
      if (!m) break;
      const n = apply(s, m); n.moves = [...s.moves, san(s, m, all)]; n.last = [m.from, m.to];
      h.push(n);
    }
    return h;
  }
  function challenge(anchor) {
    const me = GL.state.me && GL.state.me.id;
    const others = (GL.state.online || []).filter(u => u.id !== me);
    const mine = [...games.values()].filter(g => !g.result && (g.w === me || g.b === me));
    GL.pop(anchor, el => {
      el.append(h('h4', {}, '대국 신청 (지금 접속 중)'));
      if (!others.length) el.append(h('button', { disabled: true }, '접속 중인 친구가 없습니다'));
      others.forEach(u => el.append(h('button', { onclick: () => {
        GL.closePop();
        GL.send({ type: 'game_new', id: 'c' + Math.random().toString(36).slice(2, 10), kind: 'chess', opp: u.id, color: Math.random() < .5 ? 'w' : 'b' });
        GL.toast(`${u.name}님에게 대국을 신청했습니다.`);
      } }, h('span', { class: 'c-dot', style: `background:${u.color};width:8px;height:8px;border-radius:50%;display:inline-block` }), u.name, h('small', {}, '색은 랜덤'))));
      if (mine.length) {
        el.append(h('hr'), h('h4', {}, '진행 중인 내 대국'));
        mine.forEach(g => el.append(h('button', { onclick: () => { GL.closePop(); GL.notebook.addGame('chess', { online: g.id, title: `좌표평면 연습 (vs ${g.w === me ? g.bn : g.wn})` }); } },
          `vs ${g.w === me ? g.bn : g.wn}`, h('small', {}, `${g.moves.length}수`))));
      }
    });
  }

  GL.games.chess = {
    label: '체스', title: '좌표평면 연습',
    mount(el, tabId, tab) {
      const key = 'chess_' + tabId;
      const online = tab && tab.online;
      const sheetEl = h('div', { class: 'sheet' }, h('h3', {}, '좌표평면 위의 점 이동'), h('div', { class: 'sub' }, '각 점의 이동 규칙을 지켜 상대 K를 더 이상 움직일 수 없게 만드시오.'));
      el.append(sheetEl);
      const bar = h('div', { class: 'bar' }), boardEl = h('div', { class: 'gchess' }), movesEl = h('ol', { class: 'gchess-moves' });
      sheetEl.append(bar, h('div', { class: 'gchess-wrap' }, boardEl, movesEl));

      let saved = online ? null : store.get(key, null);
      let hist = saved ? saved.hist : [initial()]; // 상태 스택 (무르기용)
      let mode = online ? 'online' : saved ? saved.mode : 'ai';   // 'ai' | 'two' | 'online'
      let flip = saved ? saved.flip : false;
      let sel = -1, thinking = false;
      const S = () => hist[hist.length - 1];
      const save = () => { if (!online) store.set(key, { hist: hist.slice(-120), mode, flip }); };
      const myId = () => GL.state.me && GL.state.me.id;
      const G = () => games.get(online);
      const myColor = () => { const g = G(); return !g ? null : g.w === myId() ? 'w' : g.b === myId() ? 'b' : null; };

      function syncOnline() {
        const g = G();
        if (!g) { draw(); return; }
        hist = replay(g.moves);
        if (myColor() === 'b' && flip === false && !syncOnline.flipped) { flip = true; syncOnline.flipped = true; }
        sel = -1;
        draw();
      }

      function status() {
        const s = S(), ms = legal(s), chk = inCheck(s, s.turn);
        if (online) {
          const g = G();
          if (!g) return '대국 정보를 불러오는 중…';
          if (g.result) return g.result === '1/2' ? '무승부' : (g.result === '1-0' ? `${g.wn} 승` : `${g.bn} 승`) + (g.reason ? ` (${g.reason})` : '');
          const turnName = s.turn === 'w' ? g.wn : g.bn;
          return (s.turn === myColor() ? '내 차례' : `${turnName}님 차례`) + (chk ? ' · 체크!' : '');
        }
        if (!ms.length) return chk ? (s.turn === 'w' ? '흑 승 (체크메이트)' : '백 승 (체크메이트)') : '무승부 (스테일메이트)';
        return (s.turn === 'w' ? '백' : '흑') + ' 차례' + (chk ? ' · 체크!' : '') + (thinking ? ' · 컴퓨터 생각 중…' : '');
      }
      function push(s, m) {
        const all = legal(s), n = apply(s, m);
        n.moves = [...s.moves, san(s, m, all)]; n.last = [m.from, m.to];
        hist.push(n);
        return n;
      }
      function doMove(m) {
        const s = S();
        const n = push(s, m);
        sel = -1;
        if (online) {
          const g = G();
          g.moves.push({ f: m.from, t: m.to, p: m.promo ? 'q' : undefined });
          GL.send({ type: 'game_move', id: online, ply: g.moves.length - 1, mv: { f: m.from, t: m.to, p: m.promo ? 'q' : undefined } });
          if (!legal(n).length) GL.send({ type: 'game_end', id: online, result: inCheck(n, n.turn) ? (n.turn === 'w' ? '0-1' : '1-0') : '1/2', reason: inCheck(n, n.turn) ? '체크메이트' : '스테일메이트' });
          draw(); return;
        }
        save(); draw();
        if (mode === 'ai' && n.turn === 'b' && legal(n).length) {
          thinking = true; draw();
          setTimeout(() => {
            const cur = S(), bm = bestMove(cur);
            thinking = false;
            if (bm) { push(cur, bm); save(); }
            draw();
          }, 60);
        }
      }
      function click(i) {
        const s = S();
        if (thinking || (mode === 'ai' && s.turn === 'b')) return;
        if (online) { const g = G(); if (!g || g.result || s.turn !== myColor()) return; }
        const ms = legal(s);
        if (sel >= 0) {
          const m = ms.find(m => m.from === sel && m.to === i);
          if (m) return doMove(m);
        }
        sel = s.b[i] && color(s.b[i]) === s.turn && ms.some(m => m.from === i) ? i : -1;
        draw();
      }
      const newLocal = m => { mode = m; hist = [initial()]; sel = -1; save(); draw(); };
      function draw() {
        const s = S(), ms = legal(s), targets = new Set(ms.filter(m => m.from === sel).map(m => m.to));
        const chkK = inCheck(s, s.turn) ? kingAt(s.b, s.turn) : -1;
        bar.innerHTML = '';
        if (online) {
          const g = G();
          GL.add(bar,
            g ? h('span', {}, `${g.wn}(백) vs ${g.bn}(흑)`) : null,
            h('span', {}, h('b', {}, status())),
            g && !g.result && myColor() ? h('button', { class: 'hbtn', onclick: () => GL.send({ type: 'game_end', id: online, result: myColor() === 'w' ? '0-1' : '1-0', reason: '기권' }) }, '기권') : null,
            g && !g.result && myColor() ? h('button', { class: 'hbtn', onclick: () => GL.send({ type: 'game_end', id: online, result: '1/2', reason: '합의 무승부' }) }, '무승부') : null,
            h('button', { class: 'hbtn', onclick: () => { flip = !flip; draw(); } }, '판 뒤집기'));
        } else {
          GL.add(bar,
            h('button', { class: 'hbtn', 'aria-pressed': String(mode === 'ai'), onclick: () => newLocal('ai') }, '혼자 (vs 컴퓨터)'),
            h('button', { class: 'hbtn', 'aria-pressed': String(mode === 'two'), onclick: () => newLocal('two') }, '둘이서'),
            GL.state.demo ? null : h('button', { class: 'hbtn', onclick: e => challenge(e.currentTarget) }, '친구랑 (온라인)'),
            h('span', {}, h('b', {}, status())),
            h('button', { class: 'hbtn', onclick: () => { if (thinking) return; const n = mode === 'ai' ? 2 : 1; for (let k = 0; k < n && hist.length > 1; k++) hist.pop(); sel = -1; save(); draw(); } }, '무르기'),
            h('button', { class: 'hbtn', onclick: () => { flip = !flip; save(); draw(); } }, '판 뒤집기'),
            h('button', { class: 'hbtn', onclick: () => newLocal(mode) }, '새 판'));
        }
        boardEl.innerHTML = '';
        for (let k = 0; k < 64; k++) {
          const i = flip ? 63 - k : k, r = Math.floor(i / 8), c = i % 8, p = s.b[i];
          const cls = ['q', (r + c) % 2 ? 'dk' : 'lt'];
          if (i === sel) cls.push('sel');
          if (s.last && s.last.includes(i)) cls.push('last');
          if (i === chkK) cls.push('chk');
          const cell = h('button', { class: cls.join(' '), 'aria-label': sq(i) + (p ? ' ' + p : ''), onclick: () => click(i) });
          if (p) cell.append(h('span', { class: 'pc ' + (isW(p) ? 'w' : 'b') }, GLYPH[p.toLowerCase()] + '︎'));
          if (targets.has(i)) cell.append(h('i', { class: p ? 'cap' : 'dot' }));
          if ((flip ? r === 0 : r === 7)) cell.append(h('small', { class: 'f' }, FILES[c]));
          if ((flip ? c === 7 : c === 0)) cell.append(h('small', { class: 'r' }, 8 - r));
          boardEl.append(cell);
        }
        movesEl.innerHTML = '';
        for (let k = 0; k < s.moves.length; k += 2) movesEl.append(h('li', {}, s.moves[k] + (s.moves[k + 1] ? '   ' + s.moves[k + 1] : '')));
        movesEl.scrollTop = movesEl.scrollHeight;
      }
      if (online) { views.set(online, syncOnline); syncOnline(); }
      else {
        draw();
        if (mode === 'ai' && S().turn === 'b') { hist.pop(); if (!hist.length) hist = [initial()]; draw(); }
      }
      return { pause() { }, resume() { }, destroy() { if (online) views.delete(online); } };
    },
  };
})();
