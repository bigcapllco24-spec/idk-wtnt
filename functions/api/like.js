import { bump, ensureSchema, handle, HttpError, json, overBudget, readJson, tooFast, visitorId } from '../_lib.js';

// POST /api/like {id, liked: true|false}  -> one like per visitor per item
export const onRequestPost = handle(async ({ request, env }) => {
  await ensureSchema(env);
  const { id, liked } = await readJson(request);
  if (typeof id !== 'string') throw new HttpError(400, 'Missing id.');
  const exists = await env.DB.prepare('SELECT 1 FROM items WHERE id = ? AND published = 1').bind(id).first();
  if (!exists) throw new HttpError(404, 'That item no longer exists.');
  const visitor = await visitorId(request, env);
  if (tooFast('l' + visitor, 20) || await overBudget(env)) throw new HttpError(429, 'Slow down a little.');
  if (liked === false) {
    const del = await env.DB.prepare('DELETE FROM likes WHERE item_id = ? AND visitor = ?').bind(id, visitor).run();
    if (del.meta.changes) await env.DB.prepare('UPDATE items SET likes = MAX(likes - 1, 0) WHERE id = ?').bind(id).run();
  } else {
    const ins = await env.DB.prepare('INSERT OR IGNORE INTO likes (item_id, visitor) VALUES (?, ?)').bind(id, visitor).run();
    if (ins.meta.changes) { await env.DB.prepare('UPDATE items SET likes = likes + 1 WHERE id = ?').bind(id).run(); await bump(env, 'likes'); }
  }
  const row = await env.DB.prepare('SELECT likes FROM items WHERE id = ?').bind(id).first();
  return json({ likes: row.likes, liked: liked !== false });
});

// GET /api/like -> ids this visitor has liked, so hearts show filled on return visits
export const onRequestGet = handle(async ({ request, env }) => {
  await ensureSchema(env);
  const visitor = await visitorId(request, env);
  const { results } = await env.DB.prepare('SELECT item_id FROM likes WHERE visitor = ?').bind(visitor).all();
  return json({ liked: results.map((r) => r.item_id) });
});
