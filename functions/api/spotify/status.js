import { ensureSchema, getSetting, handle, json, requireAdmin } from '../../_lib.js';
import { myPlaylists, SCOPES } from './_spotify.js';

// GET /api/spotify/status (admin) -> is Spotify connected, whose account, what's shown on the laptop
export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  await ensureSchema(env);
  const user = await getSetting(env, 'spotify_user');
  const shelf = (await getSetting(env, 'spotify_shelf')) || { mode: 'auto', playlists: [], links: [] };
  let playlists = [];
  let error = null;
  if (user) { try { playlists = await myPlaylists(env); } catch (e) { error = e.message; } }
  return json({ clientId: env.SPOTIFY_CLIENT_ID || null, scopes: SCOPES, user, shelf, playlists, error });
});
