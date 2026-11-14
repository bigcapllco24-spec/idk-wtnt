import { checkRoom, ensureSchema, handle, HttpError, json, recordFile, requireAdmin, TYPES } from '../_lib.js';
import { checkKind, newKey } from './files/_keys.js';

// PUT /api/files?type=photo&name=pic.jpg  (admin, raw file body, under ~90 MB)
// Stores one file in R2 and returns its key. Bigger files use /api/files/multipart.
export const onRequestPut = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  if (!env.MEDIA) throw new HttpError(500, 'File storage is not connected. Add an R2 binding named MEDIA in the Cloudflare dashboard.');
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const role = url.searchParams.get('role') === 'cover' ? 'cover' : 'file';
  if (!TYPES.includes(type)) throw new HttpError(400, 'Unknown type.');
  const contentType = request.headers.get('content-type') || 'application/octet-stream';
  checkKind(type, role, contentType);
  if (!request.body) throw new HttpError(400, 'Empty file.');
  await ensureSchema(env);
  await checkRoom(env, request.headers.get('content-length'));
  const key = newKey(type, url.searchParams.get('name'), role);
  const obj = await env.MEDIA.put(key, request.body, { httpMetadata: { contentType } });
  await recordFile(env, key, obj.size);
  return json({ key }, 201);
});
