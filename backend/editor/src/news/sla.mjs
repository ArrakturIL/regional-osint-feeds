// B5: translation latency per importance tier, collection -> page language.
// SLA (owner, 18.11): urgent <= 15 min, important <= 60 min, normal by quota.
// One additive table, created lazily like ai_daily_neurons (B1); a row is
// written once, when the first accepted translation for an item appears.
import {newsTier, TIERS, TIER_SLA_MIN} from './tier.mjs';
import {scriptLanguage} from '../localization/display-policy.mjs';

const DAY = 86400000;
const ensured = new WeakMap();
export function ensureLatencyTable(db) {
  if (!ensured.has(db)) ensured.set(db, db.prepare('CREATE TABLE IF NOT EXISTS translation_latency(kind TEXT NOT NULL,item_id TEXT NOT NULL,language TEXT NOT NULL,' +
    'tier TEXT NOT NULL,discovered_ms INTEGER NOT NULL,shown_ms INTEGER NOT NULL,PRIMARY KEY(kind,item_id,language))').run()
    .catch(e => { ensured.delete(db); throw e; }));
  return ensured.get(db);
}

export async function recordShown(db, {kind = 'news', id, language, tier, discoveredMs, shownMs = Date.now()}) {
  if (!id || !Number.isSafeInteger(discoveredMs) || discoveredMs <= 0) return;
  await ensureLatencyTable(db);
  await db.prepare('INSERT OR IGNORE INTO translation_latency(kind,item_id,language,tier,discovered_ms,shown_ms) VALUES(?,?,?,?,?,?)')
    .bind(kind, id, language, tier, discoveredMs, Math.max(shownMs, discoveredMs)).run();
}

const percentile = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null;

/**
 * Last-24h SLA picture per language and tier: how many items were translated,
 * how many within SLA, p50/p90 minutes, and how many still wait beyond SLA.
 * Items already in the page language need no translation and are excluded.
 */
export async function slaSummary(db, now = Date.now()) {
  await ensureLatencyTable(db);
  const since = now - DAY;
  const shown = (await db.prepare('SELECT item_id,language,tier,discovered_ms,shown_ms FROM translation_latency WHERE kind=? AND discovered_ms>?')
    .bind('news', since).all()).results || [];
  const items = (await db.prepare("SELECT n.id,n.headline,n.summary,n.headline_ru,n.discovered_ms,t.item_id he_id FROM news_items n " +
    "LEFT JOIN regional_i18n t ON t.kind='news' AND t.item_id=n.id AND t.language='he' WHERE n.discovered_ms>?").bind(since).all()).results || [];
  const out = {generated_at: new Date(now).toISOString(), window_hours: 24, sla_minutes: TIER_SLA_MIN, languages: {}};
  for (const language of ['ru', 'he']) {
    const per = Object.fromEntries(TIERS.map(t => [t, {translated: 0, within_sla: 0, p50_min: null, p90_min: null, waiting: 0, overdue: 0}]));
    const minutes = Object.fromEntries(TIERS.map(t => [t, []]));
    for (const r of shown) {
      if (r.language !== language || !per[r.tier]) continue;
      const m = Math.round((r.shown_ms - r.discovered_ms) / 60000);
      per[r.tier].translated++; minutes[r.tier].push(m);
      if (TIER_SLA_MIN[r.tier] === null || m <= TIER_SLA_MIN[r.tier]) per[r.tier].within_sla++;
    }
    for (const t of TIERS) {
      const s = minutes[t].sort((a, b) => a - b);
      per[t].p50_min = percentile(s, 0.5); per[t].p90_min = percentile(s, 0.9);
    }
    for (const n of items) {
      if (scriptLanguage(n.headline) === language) continue; // native, nothing to translate
      const done = language === 'ru' ? /\p{Script=Cyrillic}/u.test(n.headline_ru || '') : Boolean(n.he_id);
      if (done) continue;
      const {tier} = newsTier(n);
      per[tier].waiting++;
      const limit = TIER_SLA_MIN[tier];
      if (limit !== null && now - n.discovered_ms > limit * 60000) per[tier].overdue++;
    }
    out.languages[language] = per;
  }
  return out;
}
