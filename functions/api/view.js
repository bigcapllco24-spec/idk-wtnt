import { bump, dayOf, ensureSchema, handle, HttpError, isBot, json, overBudget, readJson, today, tooFast, visitorId } from '../_lib.js';

// POST /api/view {id}
// Counts one view per visitor per item per day, so refreshing doesn't inflate the number.
export const onRequestPost = handle(async ({ request, env }) => {
  await ensureSchema(env);
  const { id } = await readJson(request);
  if (typeof id !== 'string') throw new HttpError(400, 'Missing id.');
  const visitor = await visitorId(request, env);
  if (tooFast('v' + visitor, 40) || await overBudget(env)) throw new HttpError(429, 'Slow down a little.');
  // the per-day rows are only needed to stop double counting today: drop old ones now and then
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM views WHERE day < ?').bind(dayOf(Date.now() - 2 * 864e5)).run();
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO views (item_id, visitor, day) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM items WHERE id = ? AND published = 1)')
    .bind(id, visitor, today(), id).run();
  if (ins.meta.changes) {
    await env.DB.prepare('UPDATE items SET views = views + 1 WHERE id = ?').bind(id).run();
    if (!isBot(request)) await bump(env, 'plays');
  }
  const row = await env.DB.prepare('SELECT views FROM items WHERE id = ?').bind(id).first();
  if (!row) throw new HttpError(404, 'That item no longer exists.');
  return json({ views: row.views, counted: !!ins.meta.changes });
});
