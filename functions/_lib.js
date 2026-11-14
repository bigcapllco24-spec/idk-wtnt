// Shared helpers for the API. Files starting with "_" are not routes.

export const TYPES = ['track', 'photo', 'video', 'art', 'tee', 'project'];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS items (
     id TEXT PRIMARY KEY,
     type TEXT NOT NULL,
     title TEXT NOT NULL,
     artist TEXT,
     description TEXT,
     file_key TEXT NOT NULL,
     file_type TEXT,
     file_size INTEGER,
     cover_key TEXT,
     published INTEGER NOT NULL DEFAULT 1,
     views INTEGER NOT NULL DEFAULT 0,
     likes INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS items_type ON items(type, created_at)`,
  `CREATE TABLE IF NOT EXISTS views (
     item_id TEXT NOT NULL, visitor TEXT NOT NULL, day TEXT NOT NULL,
     PRIMARY KEY (item_id, visitor, day)
   )`,
  `CREATE TABLE IF NOT EXISTS likes (
     item_id TEXT NOT NULL, visitor TEXT NOT NULL,
     PRIMARY KEY (item_id, visitor)
   )`,
  `CREATE TABLE IF NOT EXISTS files (
     key TEXT PRIMARY KEY, size INTEGER NOT NULL, created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS stats (
     day TEXT NOT NULL, metric TEXT NOT NULL, key TEXT NOT NULL DEFAULT '', n INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (day, metric, key)
   )`,
  `CREATE TABLE IF NOT EXISTS visits (
     day TEXT NOT NULL, visitor TEXT NOT NULL, PRIMARY KEY (day, visitor)
   )`,
  `CREATE TABLE IF NOT EXISTS settings (
     key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS notes (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, body TEXT NOT NULL,
     visitor TEXT, created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS fails (who TEXT NOT NULL, at INTEGER NOT NULL)`,
];

let schemaReady = false;
// Creates the tables the first time the API is used, so there's no setup script to run.
export async function ensureSchema(env) {
  setTimezone(env);
  if (schemaReady) return;
  if (!env.DB) throw new HttpError(500, 'The database is not connected. Add a D1 binding named DB in the Cloudflare dashboard.');
  await env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql)));
  schemaReady = true;
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}

// Wraps a handler so thrown errors come back as clear JSON messages.
export function handle(fn) {
  return async (ctx) => {
    try {
      return await fn(ctx);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Something went wrong on the server.' }, 500);
    }
  };
}

// ---------- admin login ----------
// The password is only ever sent to POST /api/login. That answers with a signed, expiring token in an
// HttpOnly cookie (page scripts can't read it), and every admin route checks the cookie.
// Changing ADMIN_PASSWORD signs everyone out.
export const adminPassword = (env) => String(env.ADMIN_PASSWORD || '').trim();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function sign(env, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('idk-admin|' + adminPassword(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}
export async function makeToken(env, ttlMs) {
  const exp = Date.now() + ttlMs;
  return `t1.${exp}.${await sign(env, 't1.' + exp)}`;
}
export function cookieOf(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : '';
}
export async function isAdmin(request, env) {
  if (!adminPassword(env)) return false;
  const [v, exp, sig] = cookieOf(request, 'idk_admin').split('.');
  if (v !== 't1' || !sig || !(Number(exp) > Date.now())) return false;
  return safeEqual(sig, await sign(env, 't1.' + exp));
}
export async function requireAdmin(request, env) {
  if (!adminPassword(env)) throw new HttpError(503, 'Uploads are switched off: set ADMIN_PASSWORD in the Cloudflare dashboard.');
  if (!(await isAdmin(request, env))) throw new HttpError(401, 'Log in again.');
}

// ---------- limits on what visitors can make the site write ----------
// 1) per visitor, per minute (kept in memory: cheap, resets when the server instance recycles)
const hits = new Map();
export function tooFast(who, max = 40, windowMs = 60000) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const h = hits.get(who);
  if (!h || now - h.t > windowMs) { hits.set(who, { t: now, n: 1 }); return false; }
  return ++h.n > max;
}
// 2) for the whole site, per day: once the day's counters pass the budget, visitor writes stop until tomorrow,
//    so nobody can run the free database quota dry. (DAILY_WRITE_BUDGET, default 15000.)
let budget = { day: '', n: 0, at: 0 };
export async function overBudget(env) {
  const day = today(), now = Date.now();
  if (budget.day !== day || now - budget.at > 30000) {
    const row = await env.DB.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM stats WHERE day = ? AND metric IN ('pageviews','room','plays','likes','notes')").bind(day).first();
    budget = { day, n: row.n, at: now };
  }
  budget.n++;
  return budget.n > (Number(env.DAILY_WRITE_BUDGET) || 15000);
}

export function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

// The salt is a random value made once and kept in the database (or VISITOR_SALT if set), not the admin password.
let saltCache = '';
async function visitorSalt(env) {
  if (env.VISITOR_SALT) return env.VISITOR_SALT;
  if (saltCache) return saltCache;
  try {
    let v = await getSetting(env, 'visitor_salt');
    if (!v) { v = crypto.randomUUID() + crypto.randomUUID(); await setSetting(env, 'visitor_salt', v); v = (await getSetting(env, 'visitor_salt')) || v; }
    saltCache = v;
  } catch { return 'idk-wtnt'; }
  return saltCache;
}
// An anonymous visitor id: a hash of IP + browser + a salt. Never stores the IP itself.
export async function visitorId(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local';
  const ua = request.headers.get('user-agent') || '';
  const salt = await visitorSalt(env);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${ip}|${ua}`));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Days roll over at midnight in the site owner's time zone (India by default; set TZ_OFFSET_MINUTES to change).
let tzOffsetMin = 330;
export function setTimezone(env) { const v = Number(env.TZ_OFFSET_MINUTES); if (Number.isFinite(v)) tzOffsetMin = v; }
export const dayOf = (ms) => new Date(ms + tzOffsetMin * 60000).toISOString().slice(0, 10);
export const today = () => dayOf(Date.now());

export function publicItem(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    artist: row.artist,
    description: row.description,
    url: `/media/${row.file_key}`,
    fileType: row.file_type,
    cover: row.cover_key ? `/media/${row.cover_key}` : null,
    views: row.views,
    likes: row.likes,
    published: !!row.published,
    createdAt: row.created_at,
  };
}

export async function readJson(request) {
  try { return await request.json(); } catch { throw new HttpError(400, 'Expected a JSON body.'); }
}

// Storage cap: uploads are refused before the R2 free tier (10 GB) could be exceeded.
const GB = 1024 ** 3;
export function storageLimit(env) {
  const gb = Number(env.STORAGE_LIMIT_GB || 9);
  return Math.max(0.1, Math.min(gb, 9.5)) * GB;
}
export async function storageUsed(env) {
  const row = await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS used FROM files').first();
  return row.used;
}
export async function checkRoom(env, incoming) {
  const size = Number(incoming);
  if (!Number.isFinite(size) || size <= 0) throw new HttpError(411, 'File size is missing.');
  const used = await storageUsed(env), limit = storageLimit(env);
  if (used + size > limit) {
    const free = Math.max(0, limit - used);
    throw new HttpError(507, `Not enough free space: ${(size / 1048576).toFixed(0)} MB needed, ${(free / 1048576).toFixed(0)} MB left under the free limit. Delete something first.`);
  }
}
export async function recordFile(env, key, size) {
  await env.DB.prepare('INSERT OR REPLACE INTO files (key, size, created_at) VALUES (?, ?, ?)').bind(key, size, new Date().toISOString()).run();
}
// Files that were uploaded but never became an item (an upload that was abandoned) are removed after a week.
export async function sweepOrphans(env) {
  const cutoff = new Date(Date.now() - 7 * 864e5).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT key FROM files WHERE created_at < ? AND key NOT IN (SELECT file_key FROM items) AND key NOT IN (SELECT cover_key FROM items WHERE cover_key IS NOT NULL) LIMIT 50`
  ).bind(cutoff).all();
  const keys = results.map((r) => r.key);
  if (keys.length) { await env.MEDIA.delete(keys); await forgetFiles(env, keys); }
  return keys.length;
}
export async function forgetFiles(env, keys) {
  for (const k of keys) await env.DB.prepare('DELETE FROM files WHERE key = ?').bind(k).run();
}

// ---------- analytics: one row per day per metric per key, so the dashboard stays cheap to read ----------
export function bumpStmt(env, metric, key = '', n = 1, day = today()) {
  return env.DB.prepare(
    `INSERT INTO stats (day, metric, key, n) VALUES (?, ?, ?, ?)
     ON CONFLICT(day, metric, key) DO UPDATE SET n = n + excluded.n`
  ).bind(day, metric, String(key).slice(0, 120), n);
}
export async function bump(env, metric, key = '', n = 1) {
  await bumpStmt(env, metric, key, n).run();
}
export function isBot(request) {
  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  return !ua || /bot|crawl|spider|slurp|preview|fetch|monitor|curl|wget|python|headless|lighthouse|scan/.test(ua);
}
export function deviceOf(request) {
  const ua = request.headers.get('user-agent') || '';
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return 'Tablet';
  if (/mobi|iphone|android/i.test(ua)) return 'Phone';
  return 'Computer';
}

// ---------- small key/value settings (Spotify tokens, choices, caches) ----------
export async function getSetting(env, key) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}
export async function setSetting(env, key, value) {
  if (value === null || value === undefined) { await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(key).run(); return; }
  await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    .bind(key, JSON.stringify(value), new Date().toISOString()).run();
}
