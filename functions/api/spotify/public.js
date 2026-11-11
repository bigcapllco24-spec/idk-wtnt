import { ensureSchema, getSetting, handle, json, setSetting } from '../../_lib.js';
import { api, myPlaylists, parseLink } from './_spotify.js';

const FRESH_MS = 15 * 60 * 1000;

// GET /api/spotify/public -> what visitors see on the laptop: your chosen playlists and links.
// Cached for 15 minutes so visitors never hit Spotify's limits.
export const onRequestGet = handle(async ({ env }) => {
  await ensureSchema(env);
  const user = await getSetting(env, 'spotify_user');
  if (!user || !env.SPOTIFY_CLIENT_ID) return json({ connected: false, items: [] }, 200, { 'cache-control': 'public, max-age=60' });

  const cache = await getSetting(env, 'spotify_public_cache');
  if (cache && cache.at > Date.now() - FRESH_MS) return json(cache.data, 200, { 'cache-control': 'public, max-age=120' });

  try {
    const shelf = (await getSetting(env, 'spotify_shelf')) || { mode: 'auto', playlists: [], links: [] };
    const all = await myPlaylists(env);
    const picked = shelf.mode === 'chosen'
      ? shelf.playlists.map((id) => all.find((p) => p.id === id)).filter(Boolean)
      : all.filter((p) => p.public && p.mine === user.id);
    const items = picked.map((p) => ({ type: 'playlist', id: p.id, name: p.name, image: p.image, count: p.count, url: p.url }));
    for (const link of shelf.links || []) {
      const l = parseLink(link);
      if (!l) continue;
      try {
        const d = await api(env, `/${l.type}s/${l.id}`);
        const img = d.images?.[0]?.url || d.album?.images?.[0]?.url || null;
        const by = d.artists?.map((a) => a.name).join(', ') || d.publisher || null;
        items.push({ type: l.type, id: l.id, name: d.name, by, image: img, url: d.external_urls?.spotify || `https://open.spotify.com/${l.type}/${l.id}` });
      } catch { items.push({ type: l.type, id: l.id, name: `Spotify ${l.type}`, image: null, url: `https://open.spotify.com/${l.type}/${l.id}` }); }
    }
    const data = { connected: true, owner: { name: user.name, url: user.url }, items };
    await setSetting(env, 'spotify_public_cache', { at: Date.now(), data });
    return json(data, 200, { 'cache-control': 'public, max-age=120' });
  } catch (e) {
    if (cache) return json(cache.data, 200);
    return json({ connected: true, items: [], error: 'Spotify is not answering right now.' }, 200);
  }
});
