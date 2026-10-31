// GET /media/<key> -> streams a file from R2 storage.
// Supports byte ranges so audio and video can seek without downloading the whole file.
async function serve(request, env, params, headOnly) {
  if (!env.MEDIA) return new Response('Storage not connected', { status: 500 });
  const key = (params.path || []).join('/');
  if (!key) return new Response('Not found', { status: 404 });

  const obj = headOnly
    ? await env.MEDIA.head(key)
    : await env.MEDIA.get(key, { range: request.headers, onlyIf: request.headers });
  if (obj === null) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'public, max-age=31536000, immutable');

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
