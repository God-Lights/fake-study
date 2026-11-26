/* games.js — 노트 탭에 들어가는 게임들. 전부 종이·잉크 스타일이라 멀리서 보면 필기처럼 보인다.
   GL.games[key] = { label, title, mount(el) -> { pause(), resume(), destroy() } } */
(function () {
  const { h, store } = GL;
  const G = (GL.games = {});
  const INK = '#1d1d1f', BLUE = '#1f4fa8', RED = '#c92a2a';

  function sheet(el, title, sub) {
    const s = h('div', { class: 'sheet' }, h('h3', {}, title), h('div', { class: 'sub' }, sub));
    el.append(s);
    return s;
  }
  function swipe(target, cb) {
    let sx = 0, sy = 0, id = null;
    target.addEventListener('pointerdown', e => { id = e.pointerId; sx = e.clientX; sy = e.clientY; });
    target.addEventListener('pointerup', e => {
      if (e.pointerId !== id) return; id = null;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
      cb(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U'));
    });
  }
  const keyDir = k => ({ ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D', a: 'L', d: 'R', w: 'U', s: 'D' }[k]);

  // ─────────────────────────── 2048 ───────────────────────────
  G['2048'] = {
    label: '2048', title: '수열 정리 노트',
    mount(el) {
      const s = sheet(el, '등비수열 정리', '공비 2인 수열의 항을 합쳐 2048을 만드시오.');
      let grid, score, best = store.get('g2048_best', 0), active = true;
      const bar = h('div', { class: 'bar' }), board = h('div', { class: 'g2048' });
      s.append(bar, h('div', { class: 'gstage' }, board));
      const reset = () => { grid = Array(16).fill(0); score = 0; spawn(); spawn(); draw(); };
      function spawn() {
        const empty = grid.map((v, i) => v ? -1 : i).filter(i => i >= 0);
        if (empty.length) grid[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < 0.9 ? 2 : 4;
      }
      function line(arr) {
        const a = arr.filter(Boolean), out = [];
        for (let i = 0; i < a.length; i++) {
          if (a[i] === a[i + 1]) { out.push(a[i] * 2); score += a[i] * 2; i++; } else out.push(a[i]);
        }
        while (out.length < 4) out.push(0);
        return out;
      }
      function move(dir) {
        const before = grid.join();
        for (let r = 0; r < 4; r++) {
          const idx = [0, 1, 2, 3].map(c => dir === 'L' || dir === 'R' ? r * 4 + c : c * 4 + r);
          if (dir === 'R' || dir === 'D') idx.reverse();
          const res = line(idx.map(i => grid[i]));
          idx.forEach((i, k) => grid[i] = res[k]);
        }
        if (grid.join() !== before) { spawn(); if (score > best) { best = score; store.set('g2048_best', best); } }
        draw();
      }
      const canMove = () => grid.some((v, i) => !v || (i % 4 < 3 && v === grid[i + 1]) || (i < 12 && v === grid[i + 4]));
      function draw() {
        bar.innerHTML = '';
        GL.add(bar, h('span', {}, '점수 ', h('b', {}, score)), h('span', {}, '최고 ', h('b', {}, best)),
          h('button', { class: 'hbtn', onclick: reset }, '새로 풀기'));
        if (!canMove()) GL.add(bar, h('span', {}, h('b', {}, '더 이상 합칠 수 없음')));
        board.innerHTML = '';
        grid.forEach(v => board.append(h('div', { class: 'c' + (v ? ' v' + Math.min(v, 4096) : '') }, v || '')));
      }
      const onKey = e => { if (!active || e.target.closest('input,textarea')) return; const d = keyDir(e.key); if (d) { e.preventDefault(); move(d); } };
      document.addEventListener('keydown', onKey);
      swipe(board, move);
      reset();
      return { pause() { active = false; }, resume() { active = true; }, destroy() { document.removeEventListener('keydown', onKey); } };
    },
  };

  // ─────────────────────────── 지뢰찾기 ───────────────────────────
  G.mines = {
    label: '지뢰찾기', title: '확률과 통계 문제지',
    mount(el) {
      const s = sheet(el, '조건부확률 연습', '각 칸의 수는 이웃한 8칸 중 표시된 칸의 개수이다.');
      const SIZES = { 초급: [9, 9, 10], 중급: [16, 16, 40] };
      let level = store.get('mines_lv', '초급'), R, C, N, cells, over, flagMode = false, started, timer, t0, opened;
      const bar = h('div', { class: 'bar' }), board = h('div', { class: 'gmines' });
      s.append(bar, h('div', { class: 'gstage' }, board));
      function reset() {
        [R, C, N] = SIZES[level];
        cells = Array.from({ length: R * C }, () => ({ m: false, o: false, f: false, n: 0 }));
        over = false; started = false; opened = 0; clearInterval(timer); t0 = 0;
        board.style.gridTemplateColumns = `repeat(${C}, var(--mc))`;
        draw();
      }
      const nb = i => { const r = Math.floor(i / C), c = i % C, out = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc; if ((dr || dc) && rr >= 0 && rr < R && cc >= 0 && cc < C) out.push(rr * C + cc); } return out; };
      function plant(safe) {
        const ban = new Set([safe, ...nb(safe)]);
        let k = 0;
        while (k < N) { const i = Math.floor(Math.random() * R * C); if (!cells[i].m && !ban.has(i)) { cells[i].m = true; k++; } }
        cells.forEach((c, i) => c.n = nb(i).filter(j => cells[j].m).length);
        started = true; t0 = Date.now(); timer = setInterval(drawBar, 1000);
      }
      function open(i) {
        const c = cells[i];
        if (over || c.o || c.f) return;
        if (!started) plant(i);
        c.o = true; opened++;
        if (c.m) { over = 'lose'; cells.forEach(x => { if (x.m) x.o = true; }); clearInterval(timer); return; }
        if (!c.n) nb(i).forEach(open);
        if (opened === R * C - N) { over = 'win'; clearInterval(timer); }
      }
      function chord(i) {
        const c = cells[i];
        if (!c.o || !c.n) return;
        if (nb(i).filter(j => cells[j].f).length === c.n) nb(i).forEach(open);
      }
      function act(i, flag) {
        if (over) return;
        const c = cells[i];
        if (c.o) chord(i);
        else if (flag) c.f = !c.f;
        else open(i);
        draw();
      }
      function drawBar() {
        bar.innerHTML = '';
        const left = N - cells.filter(c => c.f).length;
        GL.add(bar, 
          ...Object.keys(SIZES).map(k => h('button', { class: 'hbtn', 'aria-pressed': String(level === k), onclick: () => { level = k; store.set('mines_lv', k); reset(); } }, k)),
          h('button', { class: 'hbtn', 'aria-pressed': String(flagMode), title: '켜면 탭할 때 깃발을 꽂습니다', onclick: () => { flagMode = !flagMode; drawBar(); } }, '깃발 모드'),
          h('span', {}, '남은 지뢰 ', h('b', {}, left)),
          h('span', {}, '시간 ', h('b', {}, started ? Math.floor(((over ? Date.now() : Date.now()) - t0) / 1000) : 0)),
          over ? h('span', {}, h('b', {}, over === 'win' ? '정답!' : '오답 — 다시 풀기')) : null,
          h('button', { class: 'hbtn', onclick: reset }, '새 문제'));
      }
      function draw() {
        drawBar();
        board.innerHTML = '';
        cells.forEach((c, i) => {
          const d = h('button', { class: 'm' + (c.o ? ' o' : '') + (c.o && c.m ? ' boom' : ''), 'data-n': c.o ? c.n : '' },
            c.o ? (c.m ? '✕' : (c.n || '')) : (c.f ? '✓' : ''));
          let lp = null;
          d.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') lp = setTimeout(() => { lp = 'done'; act(i, true); }, 380); });
          d.addEventListener('pointerup', e => {
            if (lp === 'done') { lp = null; return; }
            clearTimeout(lp); lp = null;
            if (e.button === 2) return;
            act(i, flagMode);
          });
          d.addEventListener('pointerleave', () => { if (lp && lp !== 'done') { clearTimeout(lp); lp = null; } });
          d.addEventListener('contextmenu', e => { e.preventDefault(); act(i, true); });
          board.append(d);
        });
      }
      reset();
      return { pause() { }, resume() { }, destroy() { clearInterval(timer); } };
    },
  };

  // ─────────────────────────── 스네이크 ───────────────────────────
  G.snake = {
    label: '스네이크', title: '함수 그래프 추적',
    mount(el) {
      const s = sheet(el, '점의 자취 추적', '점 P가 격자 위를 움직일 때, 점 Q를 지나도록 자취를 그리시오.');
      const N = 20, cv = h('canvas', { class: 'gcanvas' }), bar = h('div', { class: 'bar' });
      s.append(bar, h('div', { class: 'gstage' }, cv));
      const ctx = cv.getContext('2d');
      let snake, dir, nextDir, food, score, best = store.get('snake_best', 0), alive, active = true, paused = true, loop;
      function reset() {
        snake = [[10, 10], [9, 10], [8, 10]]; dir = 'R'; nextDir = 'R'; score = 0; alive = true; paused = true; place(); drawBar(); draw();
      }
      function place() { do { food = [Math.floor(Math.random() * N), Math.floor(Math.random() * N)]; } while (snake.some(p => p[0] === food[0] && p[1] === food[1])); }
      function step() {
        if (!alive || paused || !active) return;
        const opp = { L: 'R', R: 'L', U: 'D', D: 'U' };
        if (nextDir !== opp[dir]) dir = nextDir;
        const [x, y] = snake[0], d = { L: [-1, 0], R: [1, 0], U: [0, -1], D: [0, 1] }[dir];
        const nx = x + d[0], ny = y + d[1];
        if (nx < 0 || ny < 0 || nx >= N || ny >= N || snake.some(p => p[0] === nx && p[1] === ny)) { alive = false; drawBar(); draw(); return; }
        snake.unshift([nx, ny]);
        if (nx === food[0] && ny === food[1]) { score++; if (score > best) { best = score; store.set('snake_best', best); } place(); drawBar(); }
        else snake.pop();
        draw();
      }
      function drawBar() {
        bar.innerHTML = '';
        GL.add(bar, h('span', {}, '지난 점 ', h('b', {}, score)), h('span', {}, '최고 ', h('b', {}, best)),
          h('button', { class: 'hbtn', onclick: () => { if (!alive) reset(); paused = !paused; drawBar(); } }, !alive ? '다시' : paused ? '시작' : '멈춤'),
          !alive ? h('span', {}, h('b', {}, '자취가 끊김')) : null);
      }
      function draw() {
        const size = Math.min(560, s.clientWidth - 20);
        const dpr = Math.min(2, devicePixelRatio || 1), cell = size / N;
        if (cv.width !== Math.round(size * dpr)) { cv.width = cv.height = Math.round(size * dpr); cv.style.width = cv.style.height = size + 'px'; }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size, size);
        ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(1, 1, size - 2, size - 2);
        // 자취(뱀)는 펜 선으로
        ctx.strokeStyle = BLUE; ctx.lineWidth = cell * 0.42; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        snake.forEach(([x, y], i) => { const px = (x + .5) * cell, py = (y + .5) * cell; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
        ctx.stroke();
        ctx.fillStyle = BLUE; ctx.beginPath(); ctx.arc((snake[0][0] + .5) * cell, (snake[0][1] + .5) * cell, cell * 0.32, 0, 7); ctx.fill();
        ctx.fillStyle = INK; ctx.font = `${cell * 0.9}px 'Nanum Pen Script'`; ctx.fillText('P', (snake[0][0] + .75) * cell, (snake[0][1]) * cell + 2);
        ctx.strokeStyle = RED; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc((food[0] + .5) * cell, (food[1] + .5) * cell, cell * 0.28, 0, 7); ctx.stroke();
        ctx.fillStyle = RED; ctx.fillText('Q', (food[0] + .8) * cell, food[1] * cell + 2);
      }
      const onKey = e => {
        if (!active || e.target.closest('input,textarea')) return;
        const d = keyDir(e.key);
        if (d) { e.preventDefault(); nextDir = d; if (paused && alive) { paused = false; drawBar(); } }
        if (e.key === ' ') { e.preventDefault(); paused = !paused; drawBar(); }
      };
      document.addEventListener('keydown', onKey);
      swipe(cv, d => { nextDir = d; if (paused && alive) { paused = false; drawBar(); } });
      loop = setInterval(step, 120);
      reset();
      requestAnimationFrame(draw);
      return {
        pause() { active = false; paused = true; drawBar(); }, resume() { active = true; draw(); },
        destroy() { clearInterval(loop); document.removeEventListener('keydown', onKey); },
      };
    },
  };

  // ─────────────────────────── 오목 ───────────────────────────
  G.omok = {
    label: '오목', title: '행렬 연습장',
    mount(el) {
      const s = sheet(el, '15×15 행렬의 성분 배치', '같은 기호가 가로·세로·대각선으로 연속 5개가 되면 완성.');
      const N = 15, cv = h('canvas', { class: 'gcanvas' }), bar = h('div', { class: 'bar' });
      s.append(bar, h('div', { class: 'gstage' }, cv));
      const ctx = cv.getContext('2d');
      let b, turn, winner, vsAI = store.get('omok_ai', true), hist, last;
      const reset = () => { b = Array(N * N).fill(0); turn = 1; winner = 0; hist = []; last = -1; draw(); };
      const at = (r, c) => (r < 0 || c < 0 || r >= N || c >= N) ? -1 : b[r * N + c];
      function five(i) {
        const r = Math.floor(i / N), c = i % N, p = b[i];
        return [[0, 1], [1, 0], [1, 1], [1, -1]].some(([dr, dc]) => {
          let n = 1;
          for (let k = 1; at(r + dr * k, c + dc * k) === p; k++) n++;
          for (let k = 1; at(r - dr * k, c - dc * k) === p; k++) n++;
          return n >= 5;
        });
      }
      function play(i) {
        if (winner || b[i]) return false;
        b[i] = turn; hist.push(i); last = i;
        if (five(i)) winner = turn;
        else if (!b.includes(0)) winner = 3;
        turn = 3 - turn;
        return true;
      }
      // 간단한 AI: 각 빈 칸을 공격/수비 점수로 평가
      function score(i, p) {
        const r = Math.floor(i / N), c = i % N;
        let total = 0;
        for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
          let n = 1, open = 0, k;
          for (k = 1; at(r + dr * k, c + dc * k) === p; k++) n++;
          if (at(r + dr * k, c + dc * k) === 0) open++;
          for (k = 1; at(r - dr * k, c - dc * k) === p; k++) n++;
          if (at(r - dr * k, c - dc * k) === 0) open++;
          total += n >= 5 ? 1e6 : n === 4 ? (open === 2 ? 5e4 : open ? 4e3 : 0) : n === 3 ? (open === 2 ? 2e3 : open ? 150 : 0) : n === 2 ? (open === 2 ? 80 : open ? 10 : 0) : open;
        }
        return total;
      }
      function ai() {
        let best = -1, bi = Math.floor(N * N / 2);
        for (let i = 0; i < N * N; i++) {
          if (b[i]) continue;
          const sc = score(i, 2) * 1.1 + score(i, 1) + Math.random();
          if (sc > best) { best = sc; bi = i; }
        }
        play(bi);
      }
      let geom = { size: 400, cell: 26, pad: 13 };
      function draw() {
        bar.innerHTML = '';
        GL.add(bar, 
          h('button', { class: 'hbtn', 'aria-pressed': String(vsAI), onclick: () => { vsAI = true; store.set('omok_ai', true); reset(); } }, '혼자 (vs 컴퓨터)'),
          h('button', { class: 'hbtn', 'aria-pressed': String(!vsAI), onclick: () => { vsAI = false; store.set('omok_ai', false); reset(); } }, '둘이서'),
          h('span', {}, winner === 3 ? '무승부' : winner ? h('b', {}, (winner === 1 ? '○' : '×') + ' 완성!') : `차례: ${turn === 1 ? '○' : '×'}`),
          h('button', { class: 'hbtn', onclick: () => { const n = vsAI ? 2 : 1; for (let k = 0; k < n && hist.length; k++) { b[hist.pop()] = 0; turn = 3 - turn; } winner = 0; last = hist[hist.length - 1] ?? -1; draw(); } }, '한 수 무르기'),
          h('button', { class: 'hbtn', onclick: reset }, '새 판'));
        const size = Math.min(600, s.clientWidth - 20), dpr = Math.min(2, devicePixelRatio || 1);
        const pad = size / (N * 2), cell = (size - pad * 2) / (N - 1);
        geom = { size, cell, pad };
        cv.width = cv.height = Math.round(size * dpr); cv.style.width = cv.style.height = size + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size, size);
        ctx.strokeStyle = '#7a8796'; ctx.lineWidth = 1;
        for (let k = 0; k < N; k++) {
          ctx.beginPath(); ctx.moveTo(pad, pad + k * cell); ctx.lineTo(size - pad, pad + k * cell); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(pad + k * cell, pad); ctx.lineTo(pad + k * cell, size - pad); ctx.stroke();
        }
        b.forEach((p, i) => {
          if (!p) return;
          const x = pad + (i % N) * cell, y = pad + Math.floor(i / N) * cell, r = cell * 0.34;
          ctx.lineWidth = 2.2; ctx.strokeStyle = p === 1 ? BLUE : RED;
          ctx.beginPath();
          if (p === 1) ctx.arc(x, y, r, 0, 7);
          else { ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); }
          ctx.stroke();
          if (i === last) { ctx.fillStyle = 'rgba(255,214,10,.45)'; ctx.fillRect(x - cell / 2, y - cell / 2, cell, cell); }
        });
      }
      cv.addEventListener('click', e => {
        const r = cv.getBoundingClientRect();
        const c = Math.round((e.clientX - r.left - geom.pad) / geom.cell), rr = Math.round((e.clientY - r.top - geom.pad) / geom.cell);
        if (c < 0 || rr < 0 || c >= N || rr >= N) return;
        if (vsAI && turn === 2) return;
        if (play(rr * N + c)) { draw(); if (vsAI && !winner) setTimeout(() => { ai(); draw(); }, 250); }
      });
      reset();
      const ro = new ResizeObserver(() => draw()); ro.observe(s);
      return { pause() { }, resume() { draw(); }, destroy() { ro.disconnect(); } };
    },
  };
})();
