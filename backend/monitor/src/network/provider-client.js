import { HOUR, MINUTE } from '../config/constants.js';
export async function providerGet(env, provider, url) {
  const db = env.DB;
  await db.prepare("INSERT OR IGNORE INTO worker_provider_state(provider) VALUES (?)").bind(provider).run();
  let claim;
  for (let attempt = 0; attempt < 3; attempt++) {
    const now = Date.now();
    claim = await db.prepare(`UPDATE worker_provider_state SET lease_until=?
      WHERE provider=? AND next_allowed_at<=? AND lease_until<=? RETURNING *`)
      .bind(now + 30000, provider, now, now).first();
    if (claim) break;
    const state = await db.prepare("SELECT * FROM worker_provider_state WHERE provider=?").bind(provider).first();
    const until = Math.max(state.next_allowed_at, state.lease_until);
    if (state.lease_until <= now && until - now <= 2000 && attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, Math.max(1, until - now + 20)));
      continue;
    }
    throw new Error("upstream " + provider + " paused until " + new Date(until).toISOString()
      + (state.last_error ? "; " + state.last_error : state.lease_until > now ? "; request in progress" : "; recovery pacing"));
  }
  if (!claim) throw new Error("upstream " + provider + " request busy");
  let response;
  let data;
  let failure;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (provider === "avioadsb.org") {
      const rh=response.headers.get("X-RateLimit-Remaining"), sh=response.headers.get("X-RateLimit-Reset");
      const remaining=Number(rh), resetSeconds=Number(sh);
      if (rh!==null && sh!==null && Number.isInteger(remaining) && remaining>=0 &&
          Number.isFinite(resetSeconds) && resetSeconds>=0 && resetSeconds<=172800) {
        await db.prepare(`INSERT INTO worker_provider_quota(provider,remaining,reset_at,checked_at)
          VALUES(?,?,?,?) ON CONFLICT(provider) DO UPDATE SET
          remaining=excluded.remaining,reset_at=excluded.reset_at,checked_at=excluded.checked_at`)
          .bind(provider,remaining,Date.now()+resetSeconds*1000,Date.now()).run().catch(()=>{});
      }
    }
    if (!response.ok) throw new Error("upstream HTTP " + response.status);
    data = await response.json();
    if (!Array.isArray(data.ac) || !Number.isFinite(data.now)) throw new Error("unexpected ADS-B response");
    const timestamp = data.now < 1e12 ? data.now * 1000 : data.now;
    if (Math.abs(Date.now() - timestamp) > 5 * MINUTE) throw new Error("unexpected stale ADS-B response");
  } catch (error) {
    failure = /^(upstream |unexpected )/.test(error.message) ? error.message : "upstream unavailable";
  }
  const now = Date.now();
  if (failure) {
    const failures = Math.min(12, claim.failures + 1);
    const status = response?.status || 0;
    const base = status === 429 ? 10 * MINUTE : status === 401 || status === 403 ? 6 * HOUR : MINUTE;
    const delay = Math.min(6 * HOUR, base * 2 ** Math.min(8, failures - 1));
    const header = response?.headers.get("Retry-After")?.trim();
    let retryAt = 0;
    if (header && /^\d+$/.test(header)) retryAt = now + Number(header) * 1000;
    else if (header) retryAt = Date.parse(header);
    const until = Math.max(now + delay, Number.isFinite(retryAt) ? retryAt : 0);
    await response?.body?.cancel().catch(() => {});
    await db.prepare(`UPDATE worker_provider_state SET next_allowed_at=?,lease_until=0,
      failures=?,last_status=?,last_error=? WHERE provider=? AND lease_until=?`)
      .bind(until, failures, status, failure, provider, claim.lease_until).run();
    throw new Error(failure + "; " + provider + " retry after " + new Date(until).toISOString());
  }
  const remainingFailures = Math.max(0, claim.failures - 1);
  // Recover gradually: a successful probe does not immediately restore burst traffic.
  const gap = remainingFailures ? Math.min(10 * MINUTE, MINUTE * 2 ** (remainingFailures - 1)) : 1500;
  await db.prepare(`UPDATE worker_provider_state SET next_allowed_at=?,lease_until=0,
    failures=?,last_status=200,last_error=NULL WHERE provider=? AND lease_until=?`)
    .bind(now + gap, remainingFailures, provider, claim.lease_until).run();
  return data;
}

