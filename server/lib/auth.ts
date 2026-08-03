/**
 * Shared-password gate. One password (env APP_PASSWORD) shared by Amelia + Wesley.
 * On success we set a signed, http-only session cookie (HMAC-signed, with expiry)
 * so the browser stays logged in without ever storing the password.
 *
 * This is defense-in-depth: in production the app also sits behind Pangolin's
 * own auth. When APP_PASSWORD is unset, the gate is disabled (dev convenience).
 */
import { createHmac, timingSafeEqual, createHash, type BinaryLike } from 'node:crypto';

const PASSWORD = process.env.APP_PASSWORD?.trim() ?? '';
// Cookie signing secret: explicit AUTH_SECRET, else derived from the password
// (so rotating the password also invalidates old sessions — fine for us).
const SECRET =
  process.env.AUTH_SECRET?.trim() ||
  (PASSWORD ? createHash('sha256').update(`im-auth:${PASSWORD}`).digest('hex') : 'disabled');

export const COOKIE_NAME = 'im_session';
const TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export const authEnabled = (): boolean => PASSWORD.length > 0;

function eq(a: BinaryLike, b: BinaryLike): boolean {
  const ba = Buffer.from(a as any);
  const bb = Buffer.from(b as any);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function checkPassword(input: string): boolean {
  if (!PASSWORD) return true;
  return eq(input ?? '', PASSWORD);
}

export function issueToken(): string {
  const expiry = String(Date.now() + TTL_MS);
  const mac = createHmac('sha256', SECRET).update(expiry).digest('base64url');
  return `${Buffer.from(expiry).toString('base64url')}.${mac}`;
}

export function verifyToken(token?: string): boolean {
  if (!token) return false;
  const [b64, mac] = token.split('.');
  if (!b64 || !mac) return false;
  let expiry: string;
  try {
    expiry = Buffer.from(b64, 'base64url').toString();
  } catch {
    return false;
  }
  const expected = createHmac('sha256', SECRET).update(expiry).digest('base64url');
  if (!eq(mac, expected)) return false;
  const ms = Number(expiry);
  return Number.isFinite(ms) && ms > Date.now();
}

export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  return `${COOKIE_NAME}=${token}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${Math.floor(TTL_MS / 1000)}`;
}

export function clearCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}
