import { ensureSchema, handle, json, requireAdmin } from '../../_lib.js';
import { accessToken } from './_spotify.js';

// GET /api/spotify/token (admin) -> a short-lived token so the owner's browser can play their library
export const onRequestGet = handle(async ({ request, env }) => {
  requireAdmin(request, env);
  await ensureSchema(env);
  return json(await accessToken(env));
});
