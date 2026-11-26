import { Env, json } from './types';
import { getSessionUser, verifySessionToken, handleRedeem, handleDevLogin } from './auth';
import { handleGLAccountLogin } from './glaccount';
export { Directory } from './directory';
export { Room } from './room';

const directory = (env: Env) => env.DIRECTORY.get(env.DIRECTORY.idFromName('main'));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // 정적 파일은 [assets]가 먼저 처리한다. 여기 오는 건 /api/* 뿐.
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    const api = path.slice(4);

    try {
      // ── 로그인 ────────────────────────────────────────────────────────────
      if (api === '/auth/gl' && method === 'GET') return handleGLAccountLogin(request, env);
      if (api === '/auth/redeem' && method === 'GET') return handleRedeem(request, env);
      if (api === '/auth/dev' && method === 'GET') return handleDevLogin(request, env);

      // ── WebSocket: /api/ws?token=...&room=... ────────────────────────────
      if (api === '/ws' && method === 'GET') {
        const user = await verifySessionToken(env, url.searchParams.get('token') ?? '');
        const roomId = url.searchParams.get('room') ?? '';
        if (!user || !roomId) return new Response('Unauthorized', { status: 401 });

        const dir = directory(env);
        if (!(await dir.isMember(user.id, roomId))) return new Response('Forbidden', { status: 403 });
        const room = await dir.getRoom(roomId);
        if (!room) return new Response('Not Found', { status: 404 });

        const fwd = new URL('https://room/connect');
        fwd.searchParams.set('uid', user.id);
        fwd.searchParams.set('name', user.name);
        fwd.searchParams.set('room', room.id);
        fwd.searchParams.set('roomName', room.name);
        const stub = env.ROOM.get(env.ROOM.idFromName(room.id));
        return stub.fetch(new Request(fwd.toString(), { headers: request.headers }));
      }

      // ── 로그인 필요 ──────────────────────────────────────────────────────
      const user = await getSessionUser(request, env);
      if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
      const dir = directory(env);

      if (api === '/me' && method === 'GET') return json({ user });

      if (api === '/rooms' && method === 'GET') return json({ rooms: await dir.listRooms(user.id) });

      if (api === '/rooms' && method === 'POST') {
        const body = await request.json<{ name?: string }>().catch(() => ({} as { name?: string }));
        const name = (body.name ?? '').trim().slice(0, 30);
        if (name.length < 2) return json({ error: '수강반 이름은 2자 이상이어야 합니다.' }, 400);
        const res = await dir.createRoom(user.id, name);
        if ('error' in res) return json(res, 400);
        return json({ room: res });
      }

      if (api === '/rooms/join' && method === 'POST') {
        const body = await request.json<{ code?: string }>().catch(() => ({} as { code?: string }));
        const code = (body.code ?? '').trim();
        if (!/^[A-Za-z0-9]{6}$/.test(code)) return json({ error: '초대코드 6자리를 입력해 주세요.' }, 400);
        const room = await dir.joinRoom(user.id, code);
        if (!room) return json({ error: '존재하지 않는 초대코드입니다.' }, 404);
        return json({ room });
      }

      if (api === '/rooms/leave' && method === 'POST') {
        const body = await request.json<{ id?: string }>().catch(() => ({} as { id?: string }));
        if (body.id) await dir.leaveRoom(user.id, body.id);
        return json({ success: true });
      }

      return json({ error: 'Not Found' }, 404);
    } catch (e) {
      console.error('Unhandled error:', e);
      return json({ error: '서버 오류가 발생했습니다.' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
