import { ensureSchema, handle, HttpError, json, publicItem, readJson, requireAdmin, TYPES } from '../_lib.js';
import { checkKey } from './files/_keys.js';

// GET /api/items?type=track         -> published items of one type, newest first
// GET /api/items?all=1  (admin)     -> everything, including hidden items
export const onRequestGet = handle(async ({ request, env }) => {
  await ensureSchema(env);
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const all = url.searchParams.get('all') === '1';
  if (all) await requireAdmin(request, env);
  if (type && !TYPES.includes(type)) return json({ error: 'Unknown type.' }, 400);

  const where = [], args = [];
  if (!all) where.push('published = 1');
  if (type) { where.push('type = ?'); args.push(type); }
  const sql = `SELECT * FROM items ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 500`;
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  return json({ items: results.map(publicItem) });
});

// POST /api/items (admin) {type, title, artist?, description?, fileKey, coverKey?}
// Called after the file is stored: creates the entry that shows on the site.
export const onRequestPost = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  await ensureSchema(env);
  const b = await readJson(request);
  if (!TYPES.includes(b.type)) throw new HttpError(400, 'Unknown type.');
  const fileKey = checkKey(b.fileKey);
  if (!fileKey.startsWith(b.type + '/')) throw new HttpError(400, 'File and type do not match.');
  const coverKey = b.coverKey ? checkKey(b.coverKey) : null;
  const head = await env.MEDIA.head(fileKey);
  if (!head) throw new HttpError(400, 'The file did not finish uploading. Try again.');
  if (coverKey && !(await env.MEDIA.head(coverKey))) throw new HttpError(400, 'The cover did not finish uploading.');

  const id = fileKey.split('/')[1];
  const title = String(b.title || '').trim().slice(0, 200) || fileKey.split('/')[2].replace(/\.[^.]+$/, '');
  const artist = String(b.artist || '').trim().slice(0, 200) || null;
  const description = String(b.description || '').trim().slice(0, 2000) || null;
  await env.DB.prepare(
    `INSERT INTO items (id, type, title, artist, description, file_key, file_type, file_size, cover_key, published, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, b.type, title, artist, description, fileKey, head.httpMetadata?.contentType || null, head.size,
         coverKey, b.published === false ? 0 : 1, new Date().toISOString()).run();
  const row = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
  return json({ item: publicItem(row) }, 201);
});
