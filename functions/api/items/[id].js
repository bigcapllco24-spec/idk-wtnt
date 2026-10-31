import { ensureSchema, forgetFiles, handle, HttpError, json, publicItem, readJson, requireAdmin } from '../../_lib.js';

async function load(env, id) {
  const row = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
  if (!row) throw new HttpError(404, 'That item no longer exists.');
  return row;
}

// PATCH /api/items/:id  (admin) -> edit title, artist, description, or show/hide
export const onRequestPatch = handle(async ({ request, env, params }) => {
  requireAdmin(request, env);
  await ensureSchema(env);
  await load(env, params.id);
  const body = await readJson(request);
  const fields = [], args = [];
  for (const k of ['title', 'artist', 'description']) {
    if (typeof body[k] === 'string') { fields.push(`${k} = ?`); args.push(body[k].slice(0, k === 'description' ? 2000 : 200)); }
  }
  if (typeof body.published === 'boolean') { fields.push('published = ?'); args.push(body.published ? 1 : 0); }
  if (fields.length) await env.DB.prepare(`UPDATE items SET ${fields.join(', ')} WHERE id = ?`).bind(...args, params.id).run();
  return json({ item: publicItem(await load(env, params.id)) });
});

// DELETE /api/items/:id  (admin) -> removes the files from storage and the row
export const onRequestDelete = handle(async ({ request, env, params }) => {
  requireAdmin(request, env);
  await ensureSchema(env);
  const row = await load(env, params.id);
  const keys = [row.file_key, row.cover_key].filter(Boolean);
  if (keys.length) { await env.MEDIA.delete(keys); await forgetFiles(env, keys); }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM items WHERE id = ?').bind(params.id),
    env.DB.prepare('DELETE FROM views WHERE item_id = ?').bind(params.id),
    env.DB.prepare('DELETE FROM likes WHERE item_id = ?').bind(params.id),
  ]);
  return json({ deleted: params.id });
});
