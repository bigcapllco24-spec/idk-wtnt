import { ensureSchema, handle, json, requireAdmin, storageLimit, storageUsed } from '../_lib.js';

// GET /api/usage (admin) -> how much of the free storage is used
export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  await ensureSchema(env);
  return json({ used: await storageUsed(env), limit: storageLimit(env) });
});
