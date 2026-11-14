import { bump, ensureSchema, handle, HttpError, isBot, json, overBudget, readJson, tooFast, visitorId } from '../_lib.js';

// GET /api/notes -> latest guestbook notes
export const onRequestGet = handle(async ({ env }) => {
  await ensureSchema(env);
  const { results } = await env.DB.prepare('SELECT id, name, body, created_at FROM notes ORDER BY created_at DESC LIMIT 100').all();
  return json({ notes: results.map((n) => ({ id: n.id, name: n.name, body: n.body, createdAt: n.created_at })) });
});

// POST /api/notes {name, body} -> one note per visitor per minute
export const onRequestPost = handle(async ({ request, env }) => {
  await ensureSchema(env);
  const data = await readJson(request);
  const name = String(data.name || '').trim().slice(0, 60);
  const body = String(data.body || '').trim().slice(0, 600);
  // spam guards: bots, a hidden field only bots fill in, links, and daily caps
  if (isBot(request) || data.website) return json({ note: { id: 'x', name, body, createdAt: new Date().toISOString() } }, 201);
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|ru|xyz|top|info|io|co|shop|click|link)\b/i.test(name + ' ' + body)) throw new HttpError(400, "Links aren't allowed in notes.");
  if (!name) throw new HttpError(400, 'Add your name.');
  if (!body) throw new HttpError(400, 'Write a note first.');
  const visitor = await visitorId(request, env);
  const recent = await env.DB.prepare("SELECT 1 FROM notes WHERE visitor = ? AND created_at > ?")
    .bind(visitor, new Date(Date.now() - 60_000).toISOString()).first();
  if (recent) throw new HttpError(429, 'You just left a note. Try again in a minute.');
  if (tooFast('n' + visitor, 5) || await overBudget(env)) throw new HttpError(429, 'Try again in a minute.');
  const dayAgo = new Date(Date.now() - 864e5).toISOString();
  const c = await env.DB.prepare('SELECT COALESCE(SUM(visitor = ?), 0) AS mine, COUNT(*) AS everyone FROM notes WHERE created_at > ?').bind(visitor, dayAgo).first();
  if (c.mine >= 5) throw new HttpError(429, "That's enough notes for today. Come back tomorrow.");
  if (c.everyone >= 60) throw new HttpError(429, 'The notebook is full for today. Try again tomorrow.');
  const note = { id: crypto.randomUUID(), name, body, createdAt: new Date().toISOString() };
  await env.DB.prepare('INSERT INTO notes (id, name, body, visitor, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(note.id, name, body, visitor, note.createdAt).run();
  await bump(env, 'notes');
  return json({ note }, 201);
});
