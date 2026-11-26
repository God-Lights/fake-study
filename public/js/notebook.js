/* notebook.js — 굿노트식 파일 탭. 화이트보드 탭(수강반 공유) + 게임 탭(내 기기에만) */
(function () {
  const { $, h, store, icon } = GL;
  const tabsEl = $('#noteTabs'), gameHost = $('#gameHost');
  let boards = [];                                   // 서버 탭
  let games = store.get('gameTabs', []);             // [{id, game, title}]
  let active = store.get('activeTab', null);
  const inst = new Map();                            // game tab id -> {el, api}

  const isGame = id => games.some(g => g.id === id);
  const all = () => [...boards.map(b => ({ ...b, kind: 'board' })), ...games.map(g => ({ ...g, kind: 'game' }))];

  function render() {
    tabsEl.innerHTML = '';
    const online = GL.state.online || [];
    for (const t of all()) {
      const here = t.kind === 'board' ? online.filter(u => u.tab === t.id && (!GL.state.me || u.id !== GL.state.me.id)) : [];
      const el = h('div', { class: 'ntab' + (t.id === active ? ' on' : ''), role: 'tab', tabindex: '0', title: t.kind === 'board' ? '수강반 공유 노트' : '내 기기에만 있는 노트' },
        h('span', { class: 'kind', html: icon(t.kind === 'board' ? 'board' : 'page', 14) }),
        h('span', { class: 'nt-t' }, t.title),
        here.length ? h('span', { class: 'dots' }, here.slice(0, 4).map(u => h('i', { style: `background:${u.color}`, title: u.name }))) : null,
        h('button', { class: 'nt-x', title: '탭 닫기', 'aria-label': '탭 닫기', html: icon('x'), onclick: e => { e.stopPropagation(); closeTab(t); } }));
      el.addEventListener('click', () => activate(t.id));
      el.addEventListener('dblclick', () => rename(t));
      el.addEventListener('keydown', e => { if (e.key === 'Enter') activate(t.id); });
      let lp; // iPad: 길게 눌러 이름 바꾸기
      el.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') lp = setTimeout(() => rename(t), 550); });
      el.addEventListener('pointerup', () => clearTimeout(lp));
      el.addEventListener('pointerleave', () => clearTimeout(lp));
      tabsEl.append(el);
    }
    tabsEl.append(h('button', { id: 'addTab', title: '새 탭', 'aria-label': '새 탭', html: icon('plus'), onclick: e => addMenu(e.currentTarget) }));
  }

  function activate(id) {
    const list = all();
    if (!list.find(t => t.id === id)) id = list[0] && list[0].id;
    if (!id) return;
    active = id; store.set('activeTab', id);
    const t = list.find(t => t.id === id);
    inst.forEach((g, gid) => { const on = gid === id; g.el.classList.toggle('on', on); if (!on) g.api.pause(); });
    if (t.kind === 'board') {
      gameHost.classList.remove('on');
      if ($('#stage').dataset.mode === 'note') GL.board.open(t);
    } else {
      GL.board.hide();
      gameHost.classList.add('on');
      let g = inst.get(id);
      if (!g) {
        const el = h('div', { class: 'game on' });
        gameHost.append(el);
        g = { el, api: GL.games[t.game].mount(el, id, t) };
        inst.set(id, g);
      }
      g.el.classList.add('on'); g.api.resume();
    }
    render();
  }

  function addMenu(anchor) {
    GL.pop(anchor, el => {
      el.append(h('h4', {}, '공유 노트 (수강반 모두 보임)'));
      [['grid', '모눈 노트'], ['lined', '줄 노트'], ['dot', '점 노트'], ['blank', '무지 노트']].forEach(([paper, name]) =>
        el.append(h('button', { html: icon('board', 18) + `<span>${name}</span>`, onclick: () => { GL.closePop(); addBoard(paper); } })));
      el.append(h('hr'), h('h4', {}, '내 노트 (나만 보임)'));
      Object.entries(GL.games).forEach(([key, g]) =>
        el.append(h('button', { onclick: () => { GL.closePop(); addGame(key); } }, h('span', { html: icon('page', 18) }), g.label, h('small', {}, g.title))));
    });
  }

  const SUBJECTS = ['수학Ⅱ', '미적분', '확률과 통계', '기하', '물리학Ⅰ', '화학Ⅰ', '영어 독해', '국어 문학'];
  function addBoard(paper) {
    const id = 'b' + Math.random().toString(36).slice(2, 10);
    const n = boards.length + 1;
    GL.send({ type: 'tab_add', id, title: `${SUBJECTS[n % SUBJECTS.length]} 필기 ${n}`, paper });
    active = id; store.set('activeTab', id);
  }
  function addGame(key, extra) {
    if (extra && extra.online) {
      const ex = games.find(g => g.online === extra.online);
      if (ex) return activate(ex.id);
    }
    const id = 'g' + Math.random().toString(36).slice(2, 10);
    const same = games.filter(g => g.game === key).length;
    games.push({ id, game: key, title: GL.games[key].title + (same ? ` ${same + 1}` : ''), ...(extra || {}) });
    store.set('gameTabs', games);
    activate(id);
  }
  function closeTab(t) {
    if (t.kind === 'game') {
      const g = inst.get(t.id);
      if (g) { g.api.destroy(); g.el.remove(); inst.delete(t.id); }
      games = games.filter(x => x.id !== t.id); store.set('gameTabs', games); store.del('chess_' + t.id);
      if (active === t.id) activate((all()[0] || {}).id);
      else render();
      return;
    }
    GL.modal((box, close) => {
      box.append(h('h2', {}, `'${t.title}' 탭을 지울까요?`), h('p', {}, '공유 노트라서 수강반 모두에게서 사라집니다.'),
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, '취소'),
          h('button', { class: 'btn primary', onclick: () => { GL.send({ type: 'tab_del', id: t.id }); close(); } }, '탭 지우기')));
    });
  }
  function rename(t) {
    GL.modal((box, close) => {
      const inp = h('input', { value: t.title, maxlength: '40' });
      const ok = () => {
        const v = inp.value.trim(); if (!v) return;
        if (t.kind === 'board') GL.send({ type: 'tab_update', id: t.id, title: v });
        else { const g = games.find(x => x.id === t.id); g.title = v; store.set('gameTabs', games); render(); }
        close();
      };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
      box.append(h('h2', {}, '탭 이름 바꾸기'), h('label', {}, '이름'), inp,
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, '취소'), h('button', { class: 'btn primary', onclick: ok }, '저장')));
    });
  }

  GL.on('srv:init', d => { boards = d.tabs || []; GL.state.tabs = boards; if (!all().some(t => t.id === active)) active = boards[0] && boards[0].id; activate(active); });
  GL.on('srv:tabs', d => {
    boards = d.tabs; GL.state.tabs = boards;
    const cur = boards.find(b => b.id === active);
    if (cur) GL.board.update(cur);
    if (!all().some(t => t.id === active)) activate((boards[0] || {}).id);
    else if (cur && !GL.board.current() && $('#stage').dataset.mode === 'note') activate(active);
    else render();
  });
  GL.on('srv:presence', () => render());
  GL.on('srv:error', d => GL.toast(d.message));

  GL.notebook = {
    shown() { if (active && !isGame(active)) { const t = boards.find(b => b.id === active); if (t) GL.board.open(t); } else if (active) activate(active); },
    hidden() { inst.forEach(g => g.api.pause()); },
    // 보스키: 게임 탭이면 첫 공유 노트로
    study() { if (isGame(active) && boards[0]) activate(boards[0].id); },
    onGame: () => isGame(active),
    addGame: (key, extra) => { if (GL.$('#stage').dataset.mode !== 'note') GL.setMode('note'); addGame(key, extra); },
    activate: id => { if (GL.$('#stage').dataset.mode !== 'note') GL.setMode('note'); activate(id); },
    active: () => active,
  };
})();
