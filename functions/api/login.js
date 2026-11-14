import { adminPassword, ensureSchema, handle, HttpError, isAdmin, json, makeToken, readJson, safeEqual } from '../_lib.js';

const HOUR = 3600e3;
const cookie = (value, maxAge) =>
  `idk_admin=${value}; Path=/; HttpOnly; Secure; SameSite=Strict${maxAge === null ? '' : `; Max-Age=${maxAge}`}`;

async function who(request) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('login|' + ip));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// POST /api/login {password, remember} -> signs you in (cookie). Wrong guesses are limited:
// 8 from one address, or 40 from anywhere, in 15 minutes locks the login for a while.
export const onRequestPost = handle(async ({ request, env }) => {
  const expected = adminPassword(env);
  if (!expected) throw new HttpError(503, 'Uploads are switched off: set ADMIN_PASSWORD in the Cloudflare dashboard.');
  await ensureSchema(env);
  const b = await readJson(request);
  const id = await who(request), since = Date.now() - 15 * 60e3;
  const f = await env.DB.prepare('SELECT COALESCE(SUM(who = ?), 0) AS mine, COUNT(*) AS everyone FROM fails WHERE at > ?').bind(id, since).first();
  if (f.mine >= 8 || f.everyone >= 40) throw new HttpError(429, 'Too many wrong passwords. Wait 15 minutes and try again.');
  if (!safeEqual(String(b.password || '').trim(), expected)) {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO fails (who, at) VALUES (?, ?)').bind(id, Date.now()),
      env.DB.prepare('DELETE FROM fails WHERE at < ?').bind(Date.now() - 24 * HOUR),
    ]);
    throw new HttpError(401, 'Wrong password.');
  }
  const remember = !!b.remember, ttl = (remember ? 30 * 24 : 12) * HOUR;
  const token = await makeToken(env, ttl);
  return json({ ok: true, expires: Date.now() + ttl }, 200, { 'set-cookie': cookie(token, remember ? Math.floor(ttl / 1000) : null) });
});

// GET /api/login -> are you signed in?
export const onRequestGet = handle(async ({ request, env }) => json({ admin: await isAdmin(request, env) }));

// DELETE /api/login -> sign out
export const onRequestDelete = handle(async () => json({ ok: true }, 200, { 'set-cookie': cookie('', 0) }));
