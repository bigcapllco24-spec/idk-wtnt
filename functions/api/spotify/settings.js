import { ensureSchema, handle, HttpError, json, readJson, requireAdmin, setSetting } from '../../_lib.js';
import { parseLink } from './_spotify.js';

// POST /api/spotify/settings (admin) {mode:'auto'|'chosen', playlists:[ids], links:[urls]}
// 'auto' shows every public playlist you made; 'chosen' shows only the ones you tick.
export const onRequestPost = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  await ensureSchema(env);
  const b = await readJson(request);
  const mode = b.mode === 'chosen' ? 'chosen' : 'auto';
  const playlists = Array.isArray(b.playlists) ? b.playlists.filter((x) => /^[A-Za-z0-9]{22}$/.test(x)).slice(0, 60) : [];
  const links = [];
  for (const l of Array.isArray(b.links) ? b.links : []) {
    if (!String(l).trim()) continue;
    if (!parseLink(l)) throw new HttpError(400, `That doesn't look like a Spotify link: ${String(l).slice(0, 80)}`);
    links.push(String(l).trim());
  }
  await setSetting(env, 'spotify_shelf', { mode, playlists, links: links.slice(0, 30) });
  await setSetting(env, 'spotify_public_cache', null);
  return json({ saved: true });
});
