import { Env, SessionUser, json } from './types';

// KV 없이 HMAC 서명 토큰으로 세션을 처리한다.
// 토큰 = base64url(payload JSON) + "." + base64url(HMAC-SHA256)
//   payload.t = 's'(세션, 30일) | 'c'(로그인 직후 1회용 교환 코드, 60초)

const SESSION_TTL = 60 * 60 * 24 * 30;
const CODE_TTL = 60;

interface Payload { t: 's' | 'c'; u: string; n: string; e: number }

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str: string): Uint8Array {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function key(env: Env): Promise<CryptoKey> {
  const secret = env.SESSION_SECRET || `gl-study:${env.GL_ACCOUNT_KEY || 'dev-only-secret'}`;
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function sign(env: Env, p: Payload): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(p)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(env), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

async function verify(env: Env, token: string, type: Payload['t']): Promise<SessionUser | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(env), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Payload;
    if (p.t !== type || p.e < Math.floor(Date.now() / 1000)) return null;
    return { id: p.u, name: p.n };
  } catch {
    return null;
  }
}

const now = () => Math.floor(Date.now() / 1000);

export function issueSession(env: Env, u: SessionUser) {
  return sign(env, { t: 's', u: u.id, n: u.name, e: now() + SESSION_TTL });
}

export function issueCode(env: Env, u: SessionUser) {
  return sign(env, { t: 'c', u: u.id, n: u.name, e: now() + CODE_TTL });
}

export function verifySessionToken(env: Env, token: string) {
  return verify(env, token, 's');
}

export async function getSessionUser(request: Request, env: Env): Promise<SessionUser | null> {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return verify(env, auth.slice(7), 's');
}

// 로그인 직후 받은 1회용 코드를 30일 세션 토큰으로 교환
export async function handleRedeem(request: Request, env: Env): Promise<Response> {
  const code = new URL(request.url).searchParams.get('code') ?? '';
  const user = await verify(env, code, 'c');
  if (!user) return json({ error: '로그인 코드가 만료되었습니다. 다시 로그인해 주세요.' }, 400);
  return json({ token: await issueSession(env, user), user });
}

// 로컬 개발 전용 로그인 (DEV_LOGIN=1 일 때만)
export async function handleDevLogin(request: Request, env: Env): Promise<Response> {
  if (env.DEV_LOGIN !== '1') return json({ error: 'Not Found' }, 404);
  const name = (new URL(request.url).searchParams.get('name') || 'tester').slice(0, 20);
  const user = { id: `dev-${name}`, name };
  return Response.redirect(`${new URL(request.url).origin}/?gc=${encodeURIComponent(await issueCode(env, user))}`, 302);
}
