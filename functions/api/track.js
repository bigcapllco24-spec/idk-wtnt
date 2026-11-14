import { bump, bumpStmt, dayOf, deviceOf, ensureSchema, handle, isBot, overBudget, readJson, today, tooFast, visitorId } from '../_lib.js';

const ROOMS = ['video', 'sound', 'art', 'photos', 'tees', 'misc', 'archive', 'about', 'spotify'];

function referrerHost(ref, request) {
  try {
    const host = new URL(ref).hostname.replace(/^www\./, '');
    const own = new URL(request.url).hostname;
    if (!host || host === own) return null;
    if (/(^|\.)google\./.test(host)) return 'Google';
    if (/instagram\.com$/.test(host)) return 'Instagram';
    if (/(^|\.)(t\.co|twitter\.com|x\.com)$/.test(host)) return 'X / Twitter';
    if (/youtube\.com$|youtu\.be$/.test(host)) return 'YouTube';
    if (/facebook\.com$|fb\.me$/.test(host)) return 'Facebook';
    if (/linkedin\.com$|lnkd\.in$/.test(host)) return 'LinkedIn';
    if (/reddit\.com$/.test(host)) return 'Reddit';
    if (/whatsapp/.test(host)) return 'WhatsApp';
    return host;
  } catch { return null; }
}

// POST /api/track {type:'pageview', ref} | {type:'room', room}
// Counts a page view; the first one per visitor per day also counts a visitor,
// their country, device and where they came from. Bots are ignored.
export const onRequestPost = handle(async ({ request, env }) => {
  if (isBot(request)) return new Response(null, { status: 204 });
  await ensureSchema(env);
  const body = await readJson(request);
  const visitor = await visitorId(request, env);
  if (tooFast('t' + visitor, 40) || await overBudget(env)) return new Response(null, { status: 204 });

  if (body.type === 'room') {
    if (ROOMS.includes(body.room)) await bump(env, 'room', body.room);
    return new Response(null, { status: 204 });
  }
  if (body.type !== 'pageview') return new Response(null, { status: 204 });

  const day = today();
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO visits (day, visitor) VALUES (?, ?)').bind(day, visitor).run();
  const stmts = [bumpStmt(env, 'pageviews')];
  if (ins.meta.changes) {
    const country = (request.cf && request.cf.country) || request.headers.get('cf-ipcountry') || 'XX';
    stmts.push(
      bumpStmt(env, 'visitors'),
      bumpStmt(env, 'country', country),
      bumpStmt(env, 'device', deviceOf(request)),
      bumpStmt(env, 'referrer', referrerHost(String(body.ref || ''), request) || 'Direct'),
    );
    // keep the per-visitor table tiny: only today and yesterday are ever needed
    if (Math.random() < 0.05) {
      const cutoff = dayOf(Date.now() - 2 * 864e5);
      stmts.push(env.DB.prepare('DELETE FROM visits WHERE day < ?').bind(cutoff));
    }
  }
  await env.DB.batch(stmts);
  return new Response(null, { status: 204 });
});
