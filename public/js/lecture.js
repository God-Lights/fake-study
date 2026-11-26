/* lecture.js — 강의(유튜브) 플레이어 + 커리큘럼 + 같이 듣기 */
(function () {
  const { $, h, store, icon } = GL;
  let list = store.get('lectures', []);          // [{vid, title}]
  let cur = store.get('lecCur', null);           // vid
  const prog = store.get('lecProg', {});         // vid -> 0~1 (최대 진도)
  let player = null, apiReady = null, pendingSeek = 0, tick = null;

  function parseVid(url) {
    url = (url || '').trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(url)) return url;
    try {
      const u = new URL(url.startsWith('http') ? url : 'https://' + url);
      if (u.hostname.includes('youtu.be')) return u.pathname.slice(1, 12);
      if (u.searchParams.get('v')) return u.searchParams.get('v').slice(0, 11);
      const m = u.pathname.match(/\/(embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[2];
    } catch { }
    return null;
  }

  function loadApi() {
    if (apiReady) return apiReady;
    apiReady = new Promise(res => {
      if (window.YT && YT.Player) return res();
      window.onYouTubeIframeAPIReady = res;
      document.head.append(h('script', { src: 'https://www.youtube.com/iframe_api' }));
    });
    return apiReady;
  }

  function save() { store.set('lectures', list); store.set('lecCur', cur); }

  function render() {
    const ol = $('#lecList');
    ol.innerHTML = '';
    $('#lecCount').textContent = list.length ? `${list.length}강` : '';
    if (!list.length) ol.append(h('li', { class: 'lec-empty', style: 'cursor:default' }, '아직 추가한 강의가 없습니다.'));
    list.forEach(l => {
      const pct = Math.round((prog[l.vid] || 0) * 100);
      const li = h('li', { class: l.vid === cur ? 'on' : '', onclick: () => play(l.vid) },
        h('span', { class: 't' }, l.title || '제목 불러오는 중…'),
        h('span', { class: 'p' }, pct + '%'),
        h('button', { class: 'x', title: '목록에서 빼기', html: icon('x', 16), onclick: e => { e.stopPropagation(); remove(l.vid); } }));
      ol.append(li);
    });
    if (list.length && ol.firstChild.classList.contains('lec-empty')) ol.firstChild.remove();
    const c = list.find(l => l.vid === cur);
    $('#lecTitle').textContent = c ? (c.title || '강의') : '수강 중인 강의 없음';
    $('#playerEmpty').hidden = !!c;
    updateProg();
  }

  function updateProg() {
    const p = cur ? Math.round((prog[cur] || 0) * 100) : 0;
    $('#lecProg').style.width = p + '%';
    $('#lecPct').textContent = `진도율 ${p}%`;
  }

  function add(vid, title, silent) {
    if (!list.find(l => l.vid === vid)) list.push({ vid, title: title || '' });
    save(); render();
    if (!silent) play(vid);
  }

  function remove(vid) {
    list = list.filter(l => l.vid !== vid);
    if (cur === vid) { cur = null; if (player) player.stopVideo(); }
    save(); render();
  }

  async function play(vid, t = 0, autoplay = true) {
    cur = vid; save(); render();
    await loadApi();
    if (!player) {
      player = new YT.Player('ytPlayer', {
        videoId: vid,
        playerVars: { rel: 0, playsinline: 1, modestbranding: 1, start: Math.floor(t), autoplay: autoplay ? 1 : 0 },
        events: { onReady: onReady, onStateChange: onState },
      });
    } else {
      autoplay ? player.loadVideoById({ videoId: vid, startSeconds: t }) : player.cueVideoById({ videoId: vid, startSeconds: t });
    }
  }

  function onReady() { refreshMeta(); }
  function onState() { refreshMeta(); }

  function refreshMeta() {
    if (!player || !player.getVideoData) return;
    const d = player.getVideoData();
    if (!d || !d.video_id) return;
    const l = list.find(x => x.vid === d.video_id);
    if (l && d.title && l.title !== d.title) { l.title = d.title; save(); render(); }
    $('#lecMeta').textContent = d.author ? `${d.author} 선생님 · 온라인 강의` : '온라인 강의';
  }

  tick = setInterval(() => {
    if (!player || !player.getDuration || !cur) return;
    const dur = player.getDuration(), t = player.getCurrentTime();
    if (dur > 0) {
      const p = Math.min(1, t / dur);
      if (p > (prog[cur] || 0)) { prog[cur] = p; store.set('lecProg', prog); }
      updateProg();
      const li = GL.$('#lecList li.on .p'); if (li) li.textContent = Math.round((prog[cur] || 0) * 100) + '%';
    }
  }, 1000);

  $('#addLec').addEventListener('submit', e => {
    e.preventDefault();
    const vid = parseVid($('#lecUrl').value);
    if (!vid) { GL.toast('유튜브 링크를 확인해 주세요.'); return; }
    $('#lecUrl').value = '';
    add(vid);
  });

  $('#shareLec').addEventListener('click', () => {
    if (!cur) { GL.toast('먼저 강의를 재생해 주세요.'); return; }
    const l = list.find(x => x.vid === cur);
    const t = player && player.getCurrentTime ? player.getCurrentTime() : 0;
    GL.send({ type: 'lecture', vid: cur, title: l ? l.title : '', t });
    GL.toast('수강반에 지금 강의를 공유했습니다.');
  });

  GL.on('srv:lecture', d => {
    const L = d.lecture;
    GL.toast(`${L.by}님이 강의를 공유했습니다: ${L.title || '강의'}`, {
      label: '같이 듣기', fn: () => { add(L.vid, L.title, true); GL.setMode('lecture'); play(L.vid, L.t || 0); },
    });
  });
  GL.on('srv:init', d => { if (d.lecture && !list.find(l => l.vid === d.lecture.vid)) add(d.lecture.vid, d.lecture.title, true); });

  GL.lecture = {
    has: () => !!cur,
    play: () => { if (cur) { if (player && player.playVideo) player.playVideo(); else play(cur); } },
    pause: () => { if (player && player.pauseVideo) player.pauseVideo(); },
    shown: () => { if (cur && !player) play(cur, 0, false); },
  };
  render();
})();
