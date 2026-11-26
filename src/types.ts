import type { Directory } from './directory';
import type { Room } from './room';

export interface Env {
  ASSETS: Fetcher;
  DIRECTORY: DurableObjectNamespace<Directory>;
  ROOM: DurableObjectNamespace<Room>;
  /** GL Account 내부 API 키 (GL Chat·EDRPG와 공용) */
  GL_ACCOUNT_KEY: string;
  /** 세션 서명 키. 없으면 GL_ACCOUNT_KEY에서 파생해서 쓴다. */
  SESSION_SECRET?: string;
  /** 로컬 개발용: "1"이면 /api/auth/dev?name=... 로 GL Account 없이 로그인 가능 */
  DEV_LOGIN?: string;
}

export interface SessionUser {
  id: string;   // GL Account user.id
  name: string; // 표시 이름
}

export interface RoomInfo {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string;
  created_at: number;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
