import { ensureSchema, handle, HttpError, json, readJson, requireAdmin } from '../../_lib.js';
import { connect, disconnect } from './_spotify.js';

// POST /api/spotify/connect (admin) {code, verifier, redirectUri} -> links the owner's Spotify
export const onRequestPost = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  await ensureSchema(env);
  const b = await readJson(request);
  if (!b.code || !b.verifier || !b.redirectUri) throw new HttpError(400, 'The Spotify login did not finish. Try connecting again.');
  const user = await connect(env, b);
  return json({ user });
});

// DELETE /api/spotify/connect (admin) -> forget the Spotify connection
export const onRequestDelete = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  await ensureSchema(env);
  await disconnect(env);
  return json({ disconnected: true });
});
