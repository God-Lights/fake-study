/* main.js — 부팅, 로그인, 수강반, 보기 전환, 보스키, 학습시간 */
(function () {
  const { $, $$, h, store, state } = GL;
  const stage = $('#stage');

  // ── 보기 전환 ──
  GL.setMode = mode => {
    const prev = stage.dataset.mode;
    stage.dataset.mode = mode;
    store.set('mode', mode);
    $$('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    if (prev === 'note' && mode !== 'note') GL.notebook.hidden();
    if (mode === 'note') GL.notebook.shown();
    if (mode === 'lecture') GL.lecture.shown();
    applyChatLayout();
    document.title = { lecture: 'GL STUDY · 강의 수강 중', note: 'GL STUDY · 필기 노트', chat: 'GL 튜터' }[mode];
  };
  GL.setSideChat = on => {
    if (stage.dataset.mode === 'chat' && !on) { GL.setMode(store.get('lastPane', 'note')); return; }
    stage.classList.toggle('side', on);
    store.set('side', on);
    $('#sideBtn').setAttribute('aria-pressed', String(on));
    applyChatLayout();
  };
  function applyChatLayout() {
    const mode = stage.dataset.mode;
    if (mode !== 'chat') store.set('lastPane', mode);
    const side = stage.classList.contains('side') && mode !== 'chat';
    GL.chat.layout(mode === 'chat' ? 'full' : side ? 'side' : 'hidden');
    if (mode === 'chat' || side) GL.chat.seen();
    if (mode === 'chat') GL.chat.focus();
  }
  $$('.seg button').forEach(b => b.addEventListener('click', () => GL.setMode(b.dataset.mode)));
  $('#sideBtn').addEventListener('click', () => GL.setSideChat(!stage.classList.contains('side')));

  // ── 보스키: Esc / 왼쪽 위 로고 ──
  function boss() {
    GL.closePop();
    GL.notebook.study();
    if (GL.lecture.has()) { GL.setMode('lecture'); GL.lecture.play(); }
    else GL.setMode('note');
    GL.setSideChat(false);
  }
  $('#logo').addEventListener('click', boss);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('#modal').hidden) { $('#modal').hidden = true; return; }
      e.preventDefault(); boss();
    }
  });
  // 백그라운드로 가면 게임 멈춤
  document.addEventListener('visibilitychange', () => { if (document.hidden) GL.notebook.hidden(); });

  // ── 오늘 학습시간 (페이지가 보이는 동안 계속 올라감) ──
  const today = () => new Date().toISOString().slice(0, 10);
  let study = store.get('study', { d: today(), s: 0 });
  setInterval(() => {
    if (document.hidden) return;
    if (study.d !== today()) study = { d: today(), s: 0 };
    study.s++;
    if (study.s % 10 === 0) store.set('study', study);
    const s = study.s;
    $('#studyTime').textContent = `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }, 1000);

  // ── 수강반 ──
  GL.switchRoom = room => {
    state.room = room;
    store.set('lastRoom', room.id);
    $('#roomName').textContent = room.name;
    GL.emit('rooms');
    GL.connect(room.id);
  };
  GL.roomMenu = anchor => {
    GL.pop(anchor, el => {
      el.append(h('h4', {}, '내 수강반'));
      state.rooms.forEach(r => el.append(h('button', { onclick: () => { GL.closePop(); if (!state.room || r.id !== state.room.id) GL.switchRoom(r); } },
        r.name, h('small', {}, state.room && r.id === state.room.id ? '수강 중' : r.invite_code || ''))));
      GL.add(el, h('hr'),
        h('button', { onclick: () => { GL.closePop(); GL.roomDialog(); } }, '수강반 만들기 / 참여'),
        state.room && state.room.invite_code ? h('button', { onclick: () => { GL.closePop(); navigator.clipboard?.writeText(state.room.invite_code); GL.toast(`초대코드 ${state.room.invite_code} 복사했습니다.`); } }, '초대코드 복사', h('small', {}, state.room.invite_code)) : null,
        !state.demo ? h('button', { onclick: () => { GL.closePop(); store.del('token'); location.href = '/'; } }, '로그아웃') : null);
    });
  };
  GL.roomDialog = (firstTime) => {
    if (state.demo) { GL.toast('미리보기에서는 수강반을 만들 수 없습니다. 배포된 사이트에서 이용하세요.'); return; }
    GL.modal((box, close) => {
      const name = h('input', { placeholder: '예) 3반 수학 스터디', maxlength: '30' });
      const code = h('input', { placeholder: '초대코드 6자리', maxlength: '6', style: 'text-transform:uppercase', autocapitalize: 'characters' });
      const err = h('div', { class: 'err' });
      const done = room => {
        if (!state.rooms.find(r => r.id === room.id)) state.rooms.push(room);
        close(); GL.switchRoom(room);
      };
      const create = async () => {
        try { done((await GL.api('POST', '/rooms', { name: name.value })).room); } catch (e) { err.textContent = e.message; }
      };
      const join = async () => {
        try { done((await GL.api('POST', '/rooms/join', { code: code.value })).room); } catch (e) { err.textContent = e.message; }
      };
      name.addEventListener('keydown', e => { if (e.key === 'Enter') create(); });
      code.addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
      GL.add(box,
        h('h2', {}, firstTime ? '수강반을 정해 주세요' : '수강반'),
        h('p', {}, '같은 수강반 사람들과 질문창·공유 노트·같이 듣기를 함께 씁니다.'),
        h('label', {}, '새 수강반 만들기'), name,
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: create }, '만들기')),
        h('p', { class: 'or' }, '또는 친구한테 받은 초대코드로'),
        h('label', {}, '수강반 참여'), code,
        h('div', { class: 'row' }, firstTime ? null : h('button', { class: 'btn', onclick: close }, '닫기'), h('button', { class: 'btn primary', onclick: join }, '참여')),
        err);
    });
  };
  $('#roomBtn').addEventListener('click', e => GL.roomMenu(e.currentTarget));

  // ── 서버 상태 반영 ──
  GL.on('srv:init', d => { state.me = d.me; state.online = d.online || []; GL.emit('rooms'); });
  GL.on('srv:presence', d => { state.online = d.online; });

  // ── 부팅 ──
  async function boot() {
    const params = new URLSearchParams(location.search);
    state.token = store.get('token', '');
    if (params.get('ge')) showLogin('로그인 중 문제가 생겼습니다. 다시 시도해 주세요.');

    try {
      const gc = params.get('gc');
      if (gc) {
        history.replaceState(null, '', '/');
        const r = await GL.api('GET', '/auth/redeem?code=' + encodeURIComponent(gc));
        state.token = r.token; store.set('token', r.token);
      }
      if (!state.token) { await GL.api('GET', '/me').catch(e => { if (e.message === 'no-api') throw e; }); return showLogin(); }
      state.me = (await GL.api('GET', '/me')).user;
      state.rooms = (await GL.api('GET', '/rooms')).rooms;
    } catch (e) {
      if (e.message === 'no-api' || e instanceof TypeError) return startDemo();
      if (e.status === 401) { store.del('token'); return showLogin(); }
      return showLogin(e.message);
    }
    start();
    const last = store.get('lastRoom', null);
    const room = state.rooms.find(r => r.id === last) || state.rooms[0];
    if (room) GL.switchRoom(room); else GL.roomDialog(true);
  }
  function showLogin(msg) {
    $('#login').hidden = false; $('#app').hidden = true;
    if (msg) { $('#loginMsg').textContent = msg; $('#loginMsg').hidden = false; }
  }
  function start() {
    $('#login').hidden = true; $('#app').hidden = false;
    GL.setSideChat(store.get('side', innerWidth > 1180));
    GL.setMode(store.get('mode', 'note'));
  }
  function startDemo() {
    state.demo = true;
    state.me = { id: 'me', name: store.get('demo_name', '나') };
    state.rooms = [{ id: 'demo', name: '미리보기 수강반', invite_code: '' }];
    $('#demoBanner').hidden = false;
    start();
    GL.switchRoom(state.rooms[0]);
  }

  boot();
})();
