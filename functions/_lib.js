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
  `CREATE TABLE IF NOT EXISTS notes (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, body TEXT NOT NULL,
     visitor TEXT, created_at TEXT NOT NULL
   )`,
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

// Admin = the request carries the ADMIN_PASSWORD set in the Cloudflare dashboard.
export function requireAdmin(request, env) {
  const expected = env.ADMIN_PASSWORD;
  if (!expected) throw new HttpError(503, 'Uploads are switched off: set ADMIN_PASSWORD in the Cloudflare dashboard.');
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!safeEqual(given, expected)) throw new HttpError(401, 'Wrong password.');
}

function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

// An anonymous visitor id: a hash of IP + browser + a salt. Never stores the IP itself.
export async function visitorId(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local';
  const ua = request.headers.get('user-agent') || '';
  const salt = env.VISITOR_SALT || env.ADMIN_PASSWORD || 'idk-wtnt';
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
