// Spotify connection for the site owner. Uses Authorization Code with PKCE,
// so no client secret is ever stored: only the public Client ID (env.SPOTIFY_CLIENT_ID)
// and the owner's refresh token, kept server-side in the database.
import { getSetting, HttpError, setSetting } from '../../_lib.js';

export const SCOPES = [
  'streaming', 'user-read-email', 'user-read-private',
  'user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing',
  'playlist-read-private', 'playlist-read-collaborative', 'user-library-read', 'user-read-recently-played',
].join(' ');

export function clientId(env) {
  const id = env.SPOTIFY_CLIENT_ID;
  if (!id) throw new HttpError(503, 'Spotify is not set up yet: add SPOTIFY_CLIENT_ID in the Cloudflare dashboard.');
  return id;
}

async function tokenRequest(env, params) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(env), ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status === 400 ? 400 : 502, `Spotify said: ${data.error_description || data.error || res.status}`);
  return data;
}

// Exchange the one-time code from Spotify's login page for tokens and remember them.
export async function connect(env, { code, verifier, redirectUri }) {
  const t = await tokenRequest(env, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier });
  await saveTokens(env, t);
  const me = await api(env, '/me');
  await setSetting(env, 'spotify_user', { id: me.id, name: me.display_name || me.id, image: me.images?.[0]?.url || null, url: me.external_urls?.spotify || null });
  await setSetting(env, 'spotify_public_cache', null);
  return getSetting(env, 'spotify_user');
}

async function saveTokens(env, t) {
  const prev = (await getSetting(env, 'spotify_tokens')) || {};
  await setSetting(env, 'spotify_tokens', {
    access: t.access_token,
    refresh: t.refresh_token || prev.refresh,
    expires: Date.now() + (t.expires_in - 60) * 1000,
    scope: t.scope || prev.scope,
  });
}

// A valid access token for the owner, refreshed when it's about to expire.
export async function accessToken(env) {
  const t = await getSetting(env, 'spotify_tokens');
  if (!t || !t.refresh) throw new HttpError(409, 'Spotify is not connected.');
  if (t.access && t.expires > Date.now()) return { token: t.access, expires: t.expires };
  const fresh = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: t.refresh });
  await saveTokens(env, fresh);
  const n = await getSetting(env, 'spotify_tokens');
  return { token: n.access, expires: n.expires };
}

export async function api(env, path) {
  const { token } = await accessToken(env);
  const res = await fetch('https://api.spotify.com/v1' + path, { headers: { authorization: 'Bearer ' + token } });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, `Spotify said: ${data.error?.message || res.status}`);
  return data;
}

export async function disconnect(env) {
  for (const k of ['spotify_tokens', 'spotify_user', 'spotify_public_cache']) await setSetting(env, k, null);
}

// spotify.com links → {type, id}
export function parseLink(s) {
  const m = String(s).trim().match(/(?:open\.spotify\.com\/(?:intl-[a-z-]+\/)?|spotify:)(track|album|artist|playlist|episode|show)[/:]([A-Za-z0-9]{22})/);
  return m ? { type: m[1], id: m[2] } : null;
}

export async function myPlaylists(env) {
  const out = [];
  let path = '/me/playlists?limit=50';
  for (let i = 0; i < 4 && path; i++) {
    const page = await api(env, path);
    out.push(...page.items.filter(Boolean));
    path = page.next ? page.next.replace('https://api.spotify.com/v1', '') : null;
  }
  return out.map((p) => ({
    id: p.id, name: p.name, public: !!p.public, mine: p.owner?.id,
    image: p.images?.[0]?.url || null,
    count: p.items?.total ?? p.tracks?.total ?? null,
    url: p.external_urls?.spotify || `https://open.spotify.com/playlist/${p.id}`,
  }));
}
