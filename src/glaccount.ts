import { Env } from './types';
import { issueCode } from './auth';

// GL Chat과 같은 방식: account.officialgl.com의 gl_session 쿠키(.officialgl.com 공유)를
// /api/internal/verify-session 으로 검증한다.
const GL_ACCOUNT_ORIGIN = 'https://account.officialgl.com';

interface GLUser {
  id: string;
  email: string;
  username: string;
  nickname: string;
}

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function verifyGLSession(token: string, env: Env): Promise<GLUser | null> {
  const res = await fetch(`${GL_ACCOUNT_ORIGIN}/api/internal/verify-session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GL_ACCOUNT_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) return null;
  const data = await res.json<{ user?: GLUser }>();
  return data.user ?? null;
}

export async function handleGLAccountLogin(request: Request, env: Env): Promise<Response> {
  const origin = new URL(request.url).origin;
  const returnUrl = `${GL_ACCOUNT_ORIGIN}/?return=${encodeURIComponent(`${origin}/api/auth/gl`)}`;

  const token = getCookie(request, 'gl_session');
  if (!token) return Response.redirect(returnUrl, 302);

  try {
    const gl = await verifyGLSession(token, env);
    if (!gl) return Response.redirect(returnUrl, 302);
    const name = (gl.nickname || gl.username || gl.email?.split('@')[0] || 'GL').slice(0, 20);
    const code = await issueCode(env, { id: gl.id, name });
    return Response.redirect(`${origin}/?gc=${encodeURIComponent(code)}`, 302);
  } catch (e) {
    console.error('GL Account login error:', e);
    return Response.redirect(`${origin}/?ge=exception`, 302);
  }
}
