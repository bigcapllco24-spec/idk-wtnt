import { checkRoom, ensureSchema, handle, HttpError, json, readJson, recordFile, requireAdmin, TYPES } from '../../_lib.js';
import { checkKey, checkKind, newKey } from './_keys.js';

// Large files (music videos) go up in chunks so no single request is too big.
// POST {action:'start', type, name, contentType}        -> {key, uploadId}
// PUT  ?key=..&uploadId=..&part=N   (raw chunk body)     -> {partNumber, etag}
// POST {action:'complete', key, uploadId, parts:[...]}   -> {key}
// POST {action:'abort', key, uploadId}                   -> {aborted}
export const onRequestPost = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  if (!env.MEDIA) throw new HttpError(500, 'File storage is not connected.');
  const body = await readJson(request);
  if (body.action === 'start') {
    if (!TYPES.includes(body.type)) throw new HttpError(400, 'Unknown type.');
    const contentType = body.contentType || 'application/octet-stream';
    checkKind(body.type, 'file', contentType);
    await ensureSchema(env);
    await checkRoom(env, body.size);
    const key = newKey(body.type, body.name);
    const up = await env.MEDIA.createMultipartUpload(key, { httpMetadata: { contentType } });
    return json({ key: up.key, uploadId: up.uploadId });
  }
  const key = checkKey(body.key);
  const up = env.MEDIA.resumeMultipartUpload(key, String(body.uploadId || ''));
  if (body.action === 'complete') {
    if (!Array.isArray(body.parts) || !body.parts.length) throw new HttpError(400, 'No parts to join.');
    const obj = await up.complete(body.parts.map((p) => ({ partNumber: Number(p.partNumber), etag: String(p.etag) })));
    await ensureSchema(env);
    await recordFile(env, key, obj.size);
    return json({ key });
  }
  if (body.action === 'abort') { await up.abort(); return json({ aborted: true }); }
  throw new HttpError(400, 'Unknown action.');
});

export const onRequestPut = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  const url = new URL(request.url);
  const key = checkKey(url.searchParams.get('key'));
  const part = Number(url.searchParams.get('part'));
  if (!Number.isInteger(part) || part < 1 || part > 10000) throw new HttpError(400, 'Bad part number.');
  if (!request.body) throw new HttpError(400, 'Empty chunk.');
  const up = env.MEDIA.resumeMultipartUpload(key, url.searchParams.get('uploadId') || '');
  const done = await up.uploadPart(part, request.body);
  return json({ partNumber: done.partNumber, etag: done.etag });
});
