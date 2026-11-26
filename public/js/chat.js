/* chat.js — 질문창 (GL Chat 재구현). 스킨 2개: black(검정 AI 채팅형) / charcoal(차콜 AI 채팅형) */
(function () {
  const { $, h, store, icon, esc } = GL;
  const chat = $('#chat'), main = $('#cMain'), msgsEl = $('#cMsgs'), scrollEl = $('#cScroll'), input = $('#cInput');
  let skin = store.get('c_skin', 'black');
  let msgs = [], unread = 0, filter = '';

  const SVG = {
    newchat: '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
    play: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>',
    note: '<path d="M4 4h12l4 4v12H4z"/><path d="M8 10h8M8 14h8M8 18h5"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    projects: '<path d="M4 7h16M6 4h12"/><rect x="3" y="10" width="18" height="10" rx="2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    grid: '<circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    filter: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    dots: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    pin: '<path d="M12 17v5"/><path d="M9 10.8V5h6v5.8l2 2.2v2H7v-2z"/>',
    devices: '<rect x="2" y="4" width="15" height="11" rx="2"/><rect x="15" y="9" width="7" height="11" rx="2"/>',
    wave: '<path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    share: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    ghost: '<path d="M5 20V10a7 7 0 0 1 14 0v10l-2.5-2-2.3 2-2.2-2-2.2 2-2.3-2z"/><path d="M9.5 11h.01M14.5 11h.01"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a2 2 0 0 1 2-2h11"/>',
    thumbs: '<path d="M7 10v11"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 18.5 21H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3l4-8a3 3 0 0 1 3 3.9Z"/>',
    speaker: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    retry: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor" stroke="none"/>',
  };
  const ic = (n, s) => `<svg class="i" viewBox="0 0 24 24"${s ? ` style="width:${s}px;height:${s}px"` : ''}>${SVG[n]}</svg>`;

  // ── 스킨별 화면 문구/구성 (스크린샷 구조 그대로, 브랜드 자리만 GL) ──
  const SKINS = {
    black: {
      greet: '준비되면 말씀하세요.',
      placeholder: '무엇이든 물어보세요',
      note: 'AI는 실수할 수 있습니다. 중요한 정보는 확인하세요.',
      nav: [['newchat', '새 채팅', 'new'], ['play', '강의', 'lecture'], ['note', '노트', 'note'], ['clock', '예약됨', 'time'], ['grid', '탐색', 'search']],
      roomsTitle: '프로젝트', recentTitle: '최근 항목',
    },
    charcoal: {
      greet: '무엇을 함께 생각해볼까요?',
      placeholder: '오늘 어떤 도움을 드릴까요?',
      note: '',
      nav: [['plus', '새로 만들기', 'new'], ['search', '검색', 'search'], ['projects', '프로젝트', 'rooms'], ['play', '강의', 'lecture'], ['note', '노트', 'note'], ['clock', '예약됨', 'time']],
      roomsTitle: '고정됨', recentTitle: '최근 항목',
    },
  };

  function initials(name) { return (name || '?').trim().slice(0, 2).toUpperCase(); }

  function renderSide() {
    const side = $('.c-side', chat), K = SKINS[skin], st = GL.state;
    side.innerHTML = '';
    const hd = h('div', { class: 'c-side-hd' });
    if (skin === 'black') {
      hd.append(h('span', { class: 'c-brand' }), h('span', { class: 'sp' }),
        h('button', { class: 'c-ico', title: '검색', html: ic('search'), onclick: toggleSearch }),
        h('button', { class: 'c-ico', title: '사이드바 닫기', html: ic('sidebar'), onclick: () => setSide(false) }));
    } else {
      hd.append(h('button', { class: 'c-ico', title: '사이드바 닫기', html: ic('sidebar'), onclick: () => setSide(false) }),
        h('span', { class: 'c-brand serif' }), h('span', { class: 'sp' }),
        h('span', { class: 'c-pillbtns' },
          h('button', { class: 'c-ico on', title: '채팅', html: ic('newchat', 18) }),
          h('button', { class: 'c-ico', title: '노트', html: ic('note', 18), onclick: () => GL.setMode('note') })));
    }
    side.append(hd);

    const act = {
      new: () => { input.focus(); if (filter) toggleSearch(); },
      lecture: () => GL.setMode('lecture'), note: () => GL.setMode('note'),
      search: toggleSearch, rooms: () => GL.roomMenu($('#roomBtn')), time: () => GL.setMode('lecture'),
    };
    K.nav.forEach(([icn, label, a], i) =>
      side.append(h('button', { class: 'c-item' + (i === 0 && skin === 'black' ? ' on' : '') + (i === 0 && skin === 'charcoal' ? ' on' : ''), html: ic(icn) + `<span>${label}</span>`, onclick: act[a] })));

    // 수강반 (= 프로젝트 / 고정됨)
    const sec1 = h('div', { class: 'c-sec' }, h('span', {}, K.roomsTitle, skin === 'charcoal' ? h('span', { html: ic('down', 14) }) : null));
    const tools1 = h('span', { class: 'c-sec-tools' });
    if (skin === 'black') tools1.append(h('button', { title: '정렬', html: ic('filter', 18) }));
    tools1.append(h('button', { title: '수강반 만들기 / 참여', html: ic(skin === 'black' ? 'plus' : 'dots', 18), onclick: () => GL.roomDialog() }));
    sec1.append(tools1);
    side.append(sec1);
    const rooms = h('div', { class: 'c-list c-rooms' });
    (st.rooms || []).forEach(r => {
      const on = st.room && st.room.id === r.id;
      rooms.append(h('button', { class: 'c-item room' + (on ? ' on' : ''), onclick: () => GL.switchRoom(r) },
        skin === 'black' ? h('span', { html: ic('chevron', 16) }) : h('span', { html: ic('projects', 18) }),
        h('span', { class: 'lbl' }, r.name),
        h('span', { class: 'row-tools' }, h('span', { html: ic('dots', 18) }), skin === 'black' ? h('span', { html: ic('edit', 16) }) : null)));
    });
    side.append(rooms);

    // 최근 항목 = 지금 접속 중인 사람들 + 최근 질문 몇 개
    const sec2 = h('div', { class: 'c-sec' }, h('span', {}, K.recentTitle, skin === 'charcoal' ? h('span', { html: ic('down', 14) }) : null));
    if (skin === 'black') sec2.append(h('span', { class: 'c-sec-tools' }, h('button', { html: ic('filter', 18) }), h('button', { html: ic('edit', 18), onclick: act.new })));
    else sec2.append(h('span', { class: 'c-sec-tools' }, h('button', { html: ic('filter', 18) })));
    side.append(sec2);
    const recent = h('div', { class: 'c-list c-recent' });
    const meId = st.me && st.me.id;
    (st.online || []).filter(u => u.id !== meId).forEach(u =>
      recent.append(h('div', { class: 'c-item recent', title: '접속 중' }, h('span', { class: 'lbl' }, `${u.name}님과의 대화`),
        h('span', { class: 'c-dot', style: `background:${skin === 'black' ? '#4c8dff' : u.color}` }),
        skin === 'black' ? h('span', { class: 'row-tools' }, h('span', { html: ic('pin', 17) }), h('span', { html: ic('dots', 18) })) : null)));
    const seen = new Set();
    for (let i = msgs.length - 1; i >= 0 && seen.size < 8; i--) {
      const t = msgs[i].text.split('\n')[0].slice(0, 28);
      if (t.length < 2 || seen.has(t)) continue;
      seen.add(t);
      recent.append(h('button', { class: 'c-item recent', onclick: () => jumpTo(msgs[i].id) }, h('span', { class: 'lbl' }, t),
        skin === 'black' ? h('span', { class: 'row-tools' }, h('span', { html: ic('pin', 17) }), h('span', { html: ic('dots', 18) })) : null));
    }
    side.append(recent);

    // 하단 프로필
    const me = st.me || { name: '나' };
    const foot = h('div', { class: 'c-foot' },
      h('span', { class: 'c-avatar', style: skin === 'black' ? 'background:#1fa463' : '' }, skin === 'black' ? initials(me.name) : me.name.slice(0, 1)),
      h('span', { class: 'who' }, h('b', {}, me.name), h('small', {}, st.room ? (skin === 'black' ? (st.room.invite_code || '미리보기') : st.room.name) : '')));
    if (skin === 'black') foot.append(h('button', { class: 'c-upbtn', title: '초대코드 복사', onclick: copyInvite }, '초대'));
    else foot.append(h('span', { html: ic('down', 16) }), h('span', { class: 'sp' }), h('button', { class: 'c-ico', title: '화면 스타일', html: ic('devices'), onclick: toggleSkin }));
    if (skin === 'black') foot.append(h('button', { class: 'c-ico', title: '화면 스타일', html: ic('devices', 18), onclick: toggleSkin }));
    side.append(foot);
  }

  function renderHeader() {
    const hd = $('.c-hd', chat);
    hd.innerHTML = '';
    const st = GL.state, empty = !msgs.length;
    hd.append(h('button', { class: 'c-ico c-open', title: '사이드바 열기', html: ic('sidebar'), onclick: () => setSide(true) }));
    if (!empty || skin === 'black') hd.append(h('span', { class: 'title' }, empty ? '' : (st.room ? st.room.name : '')));
    hd.append(h('span', { class: 'sp' }));
    if (skin === 'black') {
      if (!empty) hd.append(h('button', { class: 'c-ico', title: '더보기', html: ic('dots') }), h('button', { class: 'c-ico', title: '초대코드 복사', html: ic('share'), onclick: copyInvite }));
      else hd.append(h('button', { class: 'c-ico', title: '초대코드 복사', html: ic('ghost'), onclick: copyInvite }));
    } else {
      hd.append(h('button', { class: 'c-ico', title: '초대코드 복사', html: ic(empty ? 'ghost' : 'share'), onclick: copyInvite }));
    }
    hd.append(h('button', { class: 'c-ico c-close', title: '질문창 닫기', html: ic('x'), onclick: () => GL.setSideChat(false) }));
  }

  function renderComposer() {
    const K = SKINS[skin], f = $('#cForm');
    f.innerHTML = '';
    input.placeholder = K.placeholder;
    const send = h('button', { type: 'submit', class: 'c-send', id: 'cSend', title: '보내기', html: ic('up') });
    if (skin === 'black') {
      f.append(h('button', { type: 'button', class: 'c-ico', title: '노트 열기', html: ic('plus'), onclick: () => GL.setMode('note') }), input,
        h('button', { type: 'button', class: 'c-ico', tabindex: '-1', title: '음성 입력', html: ic('mic') }), send);
    } else {
      f.append(input, h('button', { type: 'button', class: 'c-ico', title: '노트 열기', html: ic('plus'), onclick: () => GL.setMode('note') }), h('span', { class: 'grow' }),
        h('button', { type: 'button', class: 'c-ico', tabindex: '-1', title: '음성 입력', html: ic('mic') }), send);
    }
    $('#cNote').textContent = K.note;
    $('#cUnder').hidden = skin !== 'charcoal';
    $('#cUnderRoom').textContent = GL.state.room ? GL.state.room.name : '수강반';
    $('#cGreet').textContent = K.greet;
    updateSend();
  }

  function updateSend() {
    const has = input.value.trim().length > 0;
    const s = $('#cSend'); if (!s) return;
    s.disabled = !has;
    s.innerHTML = has || skin === 'charcoal' ? ic('up') : ic('wave');
    s.classList.toggle('voice', !has && skin === 'black');
    if (skin === 'black' && !has) s.disabled = false;
  }

  function linkify(text) {
    return esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }
  function fmtTime(at) { const d = new Date(at); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; }

  function msgEl(m) {
    const mine = GL.state.me && m.uid === GL.state.me.id;
    if (mine) {
      return h('div', { class: 'c-msg me', 'data-id': m.id },
        h('div', { class: 'bub', html: linkify(m.text) }),
        h('div', { class: 'c-acts' },
          h('span', { class: 'c-time' }, fmtTime(m.at)),
          h('button', { title: '복사', html: ic('copy'), onclick: () => copy(m.text) }),
          skin === 'black' ? h('button', { title: '공유', html: ic('share') }) : null,
          h('button', { title: '수정', html: ic('edit') })));
    }
    const color = (GL.state.online.find(u => u.id === m.uid) || {}).color || '#8e8e93';
    return h('div', { class: 'c-msg you', 'data-id': m.id },
      h('div', { class: 'who' }, h('span', { class: 'c-dot', style: `background:${color}` }), m.name, h('span', { class: 'c-time' }, fmtTime(m.at))),
      h('div', { class: 'body', html: linkify(m.text) }),
      h('div', { class: 'c-acts' },
        h('button', { title: '복사', html: ic('copy'), onclick: () => copy(m.text) }),
        h('button', { title: '좋아요', html: ic('thumbs') }),
        skin === 'black' ? h('button', { title: '소리 내어 읽기', html: ic('speaker'), onclick: () => speak(m.text) }) : h('button', { title: '다시 시도', html: ic('retry') }),
        skin === 'black' ? h('button', { title: '공유', html: ic('share') }) : null,
        h('button', { title: '더보기', html: ic('dots') })));
  }

  function renderMsgs() {
    msgsEl.innerHTML = '';
    const list = filter ? msgs.filter(m => (m.text + m.name).toLowerCase().includes(filter)) : msgs;
    list.forEach(m => msgsEl.append(msgEl(m)));
    main.classList.toggle('is-empty', !msgs.length);
    renderHeader();
    scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  function append(m) {
    msgs.push(m);
    if (msgs.length > 500) msgs.shift();
    const wasEmpty = main.classList.contains('is-empty');
    if (wasEmpty) return renderAll();
    const nearBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 160;
    if (!filter || (m.text + m.name).toLowerCase().includes(filter)) msgsEl.append(msgEl(m));
    const mine = GL.state.me && m.uid === GL.state.me.id;
    if (nearBottom || mine) scrollEl.scrollTop = scrollEl.scrollHeight;
    if (!mine && !visible()) { unread++; badge(); }
    clearTimeout(append._t); append._t = setTimeout(renderSide, 300);
  }

  function jumpTo(id) {
    const el = msgsEl.querySelector(`[data-id="${id}"]`);
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.animate([{ opacity: .3 }, { opacity: 1 }], 600); }
  }

  const visible = () => { const st = $('#stage'); return st.dataset.mode === 'chat' || st.classList.contains('side'); };
  function badge() { const b = $('#unread'); b.hidden = !unread; b.textContent = unread > 99 ? '99+' : unread; }

  function copy(t) { navigator.clipboard?.writeText(t).then(() => GL.toast('복사했습니다.'), () => { }); }
  function speak(t) { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'ko-KR'; speechSynthesis.speak(u); } catch { } }
  function copyInvite() {
    const r = GL.state.room;
    if (!r) return;
    const code = r.invite_code || '';
    navigator.clipboard?.writeText(code).catch(() => { });
    GL.toast(code ? `초대코드 ${code} 복사했습니다. 친구는 수강반 → 참여에 입력하면 됩니다.` : '미리보기에선 초대코드가 없습니다.');
  }
  function toggleSearch() {
    const s = $('#cSearch');
    s.hidden = !s.hidden;
    if (!s.hidden) $('#cSearchInput').focus();
    else { filter = ''; $('#cSearchInput').value = ''; renderMsgs(); }
  }
  function toggleSkin() { skin = skin === 'black' ? 'charcoal' : 'black'; store.set('c_skin', skin); applySkin(); }
  function applySkin() {
    chat.classList.toggle('skin-black', skin === 'black');
    chat.classList.toggle('skin-charcoal', skin === 'charcoal');
    renderAll();
  }
  function setSide(open) { chat.classList.toggle('side-closed', !open); store.set('c_sideOpen', open); }

  function renderAll() { renderSide(); renderComposer(); renderMsgs(); }

  // ── 입력 ──
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(200, input.scrollHeight) + 'px';
    updateSend();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#cForm').requestSubmit(); }
  });
  $('#cForm').addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (!GL.send({ type: 'chat', text })) { GL.toast('연결이 끊겼습니다. 잠시 후 다시 보내 주세요.'); return; }
    input.value = ''; input.style.height = 'auto'; updateSend();
  });
  $('#cSearchInput').addEventListener('input', e => { filter = e.target.value.trim().toLowerCase(); renderMsgs(); });
  $('#cUnderRoomBtn').addEventListener('click', e => GL.roomMenu(e.currentTarget));

  // ── 서버 이벤트 ──
  GL.on('srv:init', d => { msgs = d.messages || []; renderAll(); });
  GL.on('srv:chat', d => append(d.msg));
  GL.on('srv:presence', () => renderSide());
  GL.on('rooms', () => { renderSide(); renderComposer(); renderHeader(); });

  GL.chat = {
    seen() { unread = 0; badge(); scrollEl.scrollTop = scrollEl.scrollHeight; },
    layout(mode) {
      chat.classList.toggle('side', mode === 'side');
      if (mode === 'full') chat.classList.toggle('side-closed', !store.get('c_sideOpen', innerWidth > 900));
    },
    focus() { setTimeout(() => input.focus(), 50); },
    render: renderAll,
  };
  applySkin();
})();
