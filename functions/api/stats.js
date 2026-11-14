import { dayOf, ensureSchema, handle, json, requireAdmin, storageLimit, storageUsed, sweepOrphans } from '../_lib.js';

const dayStr = (d) => dayOf(d.getTime());

// GET /api/stats?days=30 (admin) -> everything the dashboard shows
export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  await ensureSchema(env);
  try { if (env.MEDIA) await sweepOrphans(env); } catch (e) { console.error(e); }
  const days = Math.min(365, Math.max(1, Number(new URL(request.url).searchParams.get('days')) || 30));
  const now = new Date();
  const start = new Date(now.getTime() - (days - 1) * 864e5);
  const prevStart = new Date(start.getTime() - days * 864e5);

  const { results } = await env.DB.prepare('SELECT day, metric, key, n FROM stats WHERE day >= ?').bind(dayStr(prevStart)).all();

  const series = [];
  for (let i = 0; i < days; i++) {
    const d = dayStr(new Date(start.getTime() + i * 864e5));
    series.push({ day: d, visitors: 0, pageviews: 0, plays: 0, likes: 0 });
  }
  const byDay = Object.fromEntries(series.map((s) => [s.day, s]));
  const totals = { visitors: 0, pageviews: 0, plays: 0, likes: 0, notes: 0 };
  const previous = { visitors: 0, pageviews: 0, plays: 0, likes: 0, notes: 0 };
  const breakdown = { room: {}, country: {}, device: {}, referrer: {} };
  const startStr = dayStr(start);

  for (const r of results) {
    const current = r.day >= startStr;
    if (r.metric in totals) {
      (current ? totals : previous)[r.metric] += r.n;
      if (current && byDay[r.day] && r.metric in byDay[r.day]) byDay[r.day][r.metric] += r.n;
    } else if (current && r.metric in breakdown) {
      breakdown[r.metric][r.key] = (breakdown[r.metric][r.key] || 0) + r.n;
    }
  }
  const top = (o, n = 8) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, count]) => ({ key, count }));

  const items = (await env.DB.prepare(
    'SELECT id, type, title, views, likes, cover_key, file_key FROM items ORDER BY views DESC, likes DESC LIMIT 10'
  ).all()).results.map((i) => ({
    id: i.id, type: i.type, title: i.title, views: i.views, likes: i.likes,
    thumb: i.cover_key ? `/media/${i.cover_key}` : (i.type === 'photo' || i.type === 'art') ? `/media/${i.file_key}` : null,
  }));
  const allTime = await env.DB.prepare(
    'SELECT COUNT(*) AS items, COALESCE(SUM(views),0) AS views, COALESCE(SUM(likes),0) AS likes FROM items'
  ).first();
  const notes = await env.DB.prepare('SELECT COUNT(*) AS n FROM notes').first();

  return json({
    days, series, totals, previous,
    rooms: top(breakdown.room), countries: top(breakdown.country), devices: top(breakdown.device), referrers: top(breakdown.referrer),
    items, allTime: { ...allTime, notes: notes.n },
    storage: { used: await storageUsed(env), limit: storageLimit(env) },
  });
});
