// GET /media/<key> -> streams a file from R2 storage.
// Supports byte ranges so audio and video can seek without downloading the whole file.
import { isAdmin } from '../_lib.js';

async function serve(request, env, params, headOnly) {
  if (!env.MEDIA) return new Response('Storage not connected', { status: 500 });
  const key = (params.path || []).join('/');
  if (!key) return new Response('Not found', { status: 404 });

  // files of hidden items are only served to the signed-in owner
  let hidden = false;
  try {
    const row = env.DB && await env.DB.prepare('SELECT MIN(published) AS p FROM items WHERE file_key = ? OR cover_key = ?').bind(key, key).first();
    hidden = !!row && row.p === 0;
  } catch {}
  if (hidden && !(await isAdmin(request, env))) return new Response('Not found', { status: 404 });

  const obj = headOnly
    ? await env.MEDIA.head(key)
    : await env.MEDIA.get(key, { range: request.headers, onlyIf: request.headers });
  if (obj === null) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', hidden ? 'private, no-store' : 'public, max-age=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');
  // anything that isn't plain media (an uploaded web page, an SVG) is boxed in: it can't touch the site or the login
  const ct = headers.get('content-type') || '';
  if (!/^(audio|video|model)\/|^image\/(?!svg)/.test(ct)) headers.set('content-security-policy', "sandbox allow-scripts; frame-ancestors 'self'");

  if (headOnly) { headers.set('content-length', String(obj.size)); return new Response(null, { headers }); }
  if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers });

  if (request.headers.has('range') && obj.range) {
    const r = obj.range;
    const isSuffix = typeof r.suffix === 'number';
    const start = isSuffix ? obj.size - r.suffix : (r.offset || 0);
    const length = isSuffix ? r.suffix : (typeof r.length === 'number' ? r.length : obj.size - start);
    headers.set('content-range', `bytes ${start}-${start + length - 1}/${obj.size}`);
    headers.set('content-length', String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('content-length', String(obj.size));
  return new Response(obj.body, { headers });
}

export const onRequestGet = ({ request, env, params }) => serve(request, env, params, false);
export const onRequestHead = ({ request, env, params }) => serve(request, env, params, true);
