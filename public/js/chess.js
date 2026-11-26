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

  GL.games.chess = {
    label: '체스', title: '좌표평면 연습',
    mount(el, tabId) {
      const key = 'chess_' + tabId;
      const sheetEl = h('div', { class: 'sheet' }, h('h3', {}, '좌표평면 위의 점 이동'), h('div', { class: 'sub' }, '각 점의 이동 규칙을 지켜 상대 K를 더 이상 움직일 수 없게 만드시오.'));
      el.append(sheetEl);
      const bar = h('div', { class: 'bar' }), boardEl = h('div', { class: 'gchess' }), movesEl = h('ol', { class: 'gchess-moves' });
      sheetEl.append(bar, h('div', { class: 'gchess-wrap' }, boardEl, movesEl));

      let saved = store.get(key, null);
      let hist = saved ? saved.hist : [initial()]; // 상태 스택 (무르기용)
      let mode = saved ? saved.mode : 'ai';         // 'ai' | 'two'
      let flip = saved ? saved.flip : false;
      let sel = -1, thinking = false;
      const S = () => hist[hist.length - 1];
      const save = () => store.set(key, { hist: hist.slice(-120), mode, flip });

      function status() {
        const s = S(), ms = legal(s), chk = inCheck(s, s.turn);
        if (!ms.length) return chk ? (s.turn === 'w' ? '흑 승 (체크메이트)' : '백 승 (체크메이트)') : '무승부 (스테일메이트)';
        return (s.turn === 'w' ? '백' : '흑') + ' 차례' + (chk ? ' · 체크!' : '') + (thinking ? ' · 컴퓨터 생각 중…' : '');
      }
      function doMove(m) {
        const s = S(), all = legal(s);
        const n = apply(s, m);
        n.moves = [...s.moves, san(s, m, all)];
        n.last = [m.from, m.to];
        hist.push(n); sel = -1; save(); draw();
        if (mode === 'ai' && n.turn === 'b' && legal(n).length) {
          thinking = true; draw();
          setTimeout(() => {
            const cur = S();
            const bm = bestMove(cur);
            thinking = false;
            if (bm) { const nn = apply(cur, bm); nn.moves = [...cur.moves, san(cur, bm, legal(cur))]; nn.last = [bm.from, bm.to]; hist.push(nn); save(); }
            draw();
          }, 60);
        }
      }
      function click(i) {
        const s = S();
        if (thinking || (mode === 'ai' && s.turn === 'b')) return;
        const ms = legal(s);
        if (sel >= 0) {
          const m = ms.find(m => m.from === sel && m.to === i);
          if (m) return doMove(m);
        }
        sel = s.b[i] && color(s.b[i]) === s.turn && ms.some(m => m.from === i) ? i : -1;
        draw();
      }
      function draw() {
        const s = S(), ms = legal(s), targets = new Set(ms.filter(m => m.from === sel).map(m => m.to));
        const chkK = inCheck(s, s.turn) ? kingAt(s.b, s.turn) : -1;
        bar.innerHTML = '';
        GL.add(bar, 
          h('button', { class: 'hbtn', 'aria-pressed': String(mode === 'ai'), onclick: () => { mode = 'ai'; hist = [initial()]; sel = -1; save(); draw(); } }, '혼자 (vs 컴퓨터)'),
          h('button', { class: 'hbtn', 'aria-pressed': String(mode === 'two'), onclick: () => { mode = 'two'; hist = [initial()]; sel = -1; save(); draw(); } }, '둘이서'),
          h('span', {}, h('b', {}, status())),
          h('button', { class: 'hbtn', onclick: () => { if (thinking) return; const n = mode === 'ai' ? 2 : 1; for (let k = 0; k < n && hist.length > 1; k++) hist.pop(); sel = -1; save(); draw(); } }, '무르기'),
          h('button', { class: 'hbtn', onclick: () => { flip = !flip; save(); draw(); } }, '판 뒤집기'),
          h('button', { class: 'hbtn', onclick: () => { hist = [initial()]; sel = -1; save(); draw(); } }, '새 판'));
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
      draw();
      if (mode === 'ai' && S().turn === 'b') { hist.pop(); if (!hist.length) hist = [initial()]; draw(); }
      return { pause() { }, resume() { }, destroy() { } };
    },
  };
})();
