# fake-study — GL STUDY

`study.officialgl.com`에서 서빙되는 "공부하는 척" 웹사이트. 겉보기엔 인강 수강 화면 + 필기 노트 + AI 질문창인데, 실제로는 수강반 친구들과 채팅하고 화이트보드 공유하고 게임하는 곳. iPad(Safari, 홈 화면에 추가)와 PC 기준.

## 화면

| 보기 | 정체 |
|---|---|
| **강의** | 유튜브 플레이어 + 커리큘럼(링크 붙여넣으면 1강, 2강…). 진도율은 실제 재생 위치. **같이 듣기**로 수강반에 강의 공유 |
| **노트** | 굿노트식 파일 탭. `+` → 공유 노트(모눈/줄/점/무지, 수강반 전원 실시간 필기·커서) 또는 내 노트(체스·2048·지뢰찾기·오목·스네이크). 게임도 종이·잉크 스타일, 탭 이름은 "좌표평면 연습" 같은 식 |
| **질문** | GL Chat 재구현. AI 채팅 화면 구조의 그룹 채팅, 스킨 2개(블랙/차콜, 사이드바 하단 버튼으로 전환). 상단 오른쪽 버튼으로 노트·강의 옆에 패널로 띄울 수 있음 |

- **보스키**: `Esc` 또는 왼쪽 위 GL 로고 탭 → 게임 탭이면 공유 노트로, 강의가 있으면 강의 보기로 가서 재생, 질문창 닫힘
- 오늘 학습시간: 페이지가 보이는 동안 올라감
- 노트 단축키: `P` 펜, `H` 형광펜, `E` 지우개, `⌘/Ctrl+Z` 되돌리기
- iPad: Apple Pencil로 그리고 손가락은 스크롤. 툴바의 손가락 버튼을 켜면 손가락으로도 그림. 탭 길게 눌러 이름 바꾸기, 지뢰찾기는 길게 눌러 깃발

## 구조

GL Chat(edrpg/gl-chat)과 같은 패턴이지만 **D1·KV 없이** SQLite 기반 Durable Object만 쓴다 → `wrangler.toml`에 리소스 ID가 필요 없다.

- `src/index.ts` — 라우팅 (`/api/*`만 Worker, 나머지는 `public/` 정적 파일)
- `src/auth.ts` — HMAC 서명 세션 토큰(30일) + 로그인 직후 1회용 코드(60초)
- `src/glaccount.ts` — GL Account 로그인 (`gl_session` 쿠키 → `verify-session`)
- `src/directory.ts` — `Directory` DO 1개: 수강반 목록·초대코드·멤버십
- `src/room.ts` — `Room` DO (수강반당 1개): WebSocket 중계 + 채팅/노트 탭/필기/공유 강의 저장
- `public/` — 프론트엔드 (`js/core.js` 상태·연결, `lecture.js`, `board.js` 화이트보드, `notebook.js` 탭, `games.js`, `chess.js`, `chat.js`, `main.js`)

서버 없이 `public/index.html`만 열면 **미리보기 모드**(로그인·수강반 없이 이 기기 안에서만 동작)로 뜬다.

## 배포

`main`에 push하면 `.github/workflows/deploy.yml`이 타입체크 → Workers 배포 → 시크릿 등록.

### 필요한 GitHub Secrets (이 레포에 새로 등록)

- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — EDRPG/GL Chat과 같은 값
- `GL_ACCOUNT_KEY` — GL Chat과 같은 값
- (선택) `SESSION_SECRET`을 Worker 시크릿으로 따로 넣으면 세션 서명에 그걸 쓴다. 없으면 `GL_ACCOUNT_KEY`에서 파생.

## 로컬 개발

```bash
npm install
printf 'GL_ACCOUNT_KEY=dev\nDEV_LOGIN=1\n' > .dev.vars
npm run dev
# http://localhost:8787/api/auth/dev?name=테스트  ← GL Account 없이 로그인
```
