import { disabledSources } from '../storage/source-controls.js';

// SYS-01: GitHub's own schedule fires collector workflows far less often than
// declared (observed 17.11: analysts 4 of ~136 runs in 34 h). Monitor's
// Cloudflare cron is reliable, so it dispatches each workflow on the cadence its
// YAML declares. The YAML cron stays as a fallback; duplicate runs are safe
// because every collector is idempotent and uses a concurrency group.
// `source` (H-04): Monitor source fed by the workflow; a disabled source is not
// dispatched (the workflow's own source-gate job also skips YAML-cron runs).
// Cadence is UTC: minutes-since-epoch % every === offset (every divides 1440).
export const WORKFLOW_CADENCE = [
  { workflow: 'analysts.yml', every: 15, offset: 7 }, // 7,22,37,52 * * * *
  // Q12: ADS-B lands in D1 a few minutes before Monitor reads it (adsb :00/:15/:30/:45,
  // mil_lol :04) and wakes Neon together with analysts.
  { workflow: 'adsb.yml', source: 'adsb', every: 15, offset: 7 }, // 7,22,37,52 * * * *
  { workflow: 'adsb-mil.yml', source: 'mil_lol', every: 60, offset: 52 }, // 52 * * * *
  { workflow: 'centcom-test.yml', source: 'centcom_dvids', every: 15, offset: 0 }, // */15 * * * *
  { workflow: 'gdelt.yml', source: 'gdelt_context', every: 60, offset: 37 }, // 37 * * * *
  { workflow: 'news-open-source-translation.yml', every: 120, offset: 17 }, // 17 */2 * * *
  { workflow: 'collector-shadow-sync.yml', every: 120, offset: 23 }, // 23 */2 * * *
  { workflow: 'copernicus-analytics.yml', source: 'copernicus_ems', every: 360, offset: 13 }, // 13 */6 * * *
  { workflow: 'marad.yml', source: 'marad_official', every: 360, offset: 87 }, // 27 1,7,13,19 * * *
  { workflow: 'unosat-analyses.yml', source: 'unosat_analysis', every: 720, offset: 19 }, // 19 */12 * * *
  { workflow: 'satellite.yml', source: 'satellite_context', every: 1440, offset: 197 }, // 17 3 * * *
];
const REPO = 'ArrakturIL/regional-osint-feeds';
const MINUTE_MS = 60_000;

export function dueWorkflows(timeMs) {
  const minute = Math.floor(timeMs / MINUTE_MS);
  return WORKFLOW_CADENCE.filter(w => minute % w.every === w.offset).map(w => w.workflow);
}

// Never throws: collector dispatch must not affect Monitor's own schedule.
export async function dispatchDueWorkflows(env, timeMs, opts = {}) {
  let due = dueWorkflows(timeMs);
  if (!due.length) return { due, dispatched: [], failed: [] };
  const token = env?.GITHUB_DISPATCH_TOKEN;
  if (!token) return { due, dispatched: [], failed: [], skipped: 'no_token' };
  const sourceOf = new Map(WORKFLOW_CADENCE.map(w => [w.workflow, w.source]));
  const off = due.some(w => sourceOf.get(w)) && env?.DB ? await disabledSources(env.DB, timeMs) : new Map();
  const disabled = due.filter(w => off.has(sourceOf.get(w)));
  due = due.filter(w => !disabled.includes(w));
  const doFetch = opts.fetch || fetch;
  const log = opts.log || (msg => console.warn(msg));
  const dispatched = [],
    failed = [];
  await Promise.all(
    due.map(async workflow => {
      try {
        const res = await doFetch(
          `https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`,
          {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + token,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              'User-Agent': 'regional-watch-monitor',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ref: 'main' }),
            signal: AbortSignal.timeout(10_000),
          },
        );
        if (res.status === 204) dispatched.push(workflow);
        else {
          failed.push({ workflow, status: res.status });
          log('regional_watch dispatch_failed workflow=' + workflow + ' status=' + res.status);
        }
      } catch (e) {
        failed.push({ workflow, status: 'error' });
        log('regional_watch dispatch_failed workflow=' + workflow + ' status=error');
      }
    }),
  );
  return disabled.length ? { due, dispatched, failed, disabled } : { due, dispatched, failed };
}
