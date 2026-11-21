// Unique visitors (owner 21.11). Web Analytics counts visits, not people. A
// page view leaves one fingerprint per person per day and one per week:
// SHA-256(period salt | IP | User-Agent). The IP is never stored; each period
// has its own random salt, deleted when the period is over, so a fingerprint
// can be neither reversed nor linked to another day (or another week).
const BOT =
  /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|httpclient|axios|node-fetch|facebookexternalhit|embedly|whatsapp|telegram/i;
const DAY = 86400e3;
export const israelDay = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(ms);
// The Israeli week starts on Sunday: the key is that Sunday's date.
export const israelWeek = ms => {
  const day = israelDay(ms);
  const dow = new Date(day + 'T12:00:00Z').getUTCDay();
  return israelDay(Date.parse(day + 'T12:00:00Z') - dow * DAY);
};
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export async function countUnique(request, env, now = Date.now()) {
  const db = env.DB;
  if (!db || request.method !== 'GET') return false;
  const ua = request.headers.get('user-agent') || '',
    ip = request.headers.get('cf-connecting-ip') || '';
  if (!ua || !ip || BOT.test(ua)) return false;
  const periods = ['D:' + israelDay(now), 'W:' + israelWeek(now)];
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS site_unique_salt(period TEXT PRIMARY KEY,salt TEXT NOT NULL)'),
    db.prepare(
      'CREATE TABLE IF NOT EXISTS site_uniques(period TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(period,hash))',
    ),
    ...periods.map(p =>
      db
        .prepare('INSERT OR IGNORE INTO site_unique_salt(period,salt) VALUES(?,?)')
        .bind(p, hex(crypto.getRandomValues(new Uint8Array(16)))),
    ),
  ]);
  const salts = new Map(
    (
      (
        await db
          .prepare('SELECT period,salt FROM site_unique_salt WHERE period IN (?,?)')
          .bind(...periods)
          .all()
      ).results || []
    ).map(r => [r.period, r.salt]),
  );
  const writes = [];
  for (const p of periods) {
    const salt = salts.get(p);
    if (!salt) continue;
    const hash = hex(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '|' + ip + '|' + ua)),
    ).slice(0, 32);
    writes.push(db.prepare('INSERT OR IGNORE INTO site_uniques(period,hash) VALUES(?,?)').bind(p, hash));
  }
  // Housekeeping on a small share of views: finished periods lose their salt,
  // fingerprints older than ~5 weeks go.
  if (Math.random() < 0.05) {
    const keep = new Set(periods);
    writes.push(
      db.prepare('DELETE FROM site_unique_salt WHERE period NOT IN (?,?)').bind(...keep),
      db.prepare('DELETE FROM site_uniques WHERE substr(period,3)<?').bind(israelDay(now - 35 * DAY)),
    );
  }
  if (writes.length) await db.batch(writes);
  return writes.length > 0;
}

// → { days: [{ day, uniques }] (last 8 days), weeks: [{ week, uniques }] (last 5) }.
export async function uniqueStats(db, now = Date.now()) {
  try {
    const rows =
      (
        await db
          .prepare(
            'SELECT period,count(*) n FROM site_uniques WHERE substr(period,3)>=? GROUP BY period ORDER BY period',
          )
          .bind(israelDay(now - 35 * DAY))
          .all()
      ).results || [];
    return {
      days: rows
        .filter(r => r.period.startsWith('D:') && r.period.slice(2) >= israelDay(now - 7 * DAY))
        .map(r => ({ day: r.period.slice(2), uniques: r.n })),
      weeks: rows
        .filter(r => r.period.startsWith('W:'))
        .map(r => ({ week: r.period.slice(2), uniques: r.n })),
    };
  } catch {
    return { days: [], weeks: [] };
  }
}
