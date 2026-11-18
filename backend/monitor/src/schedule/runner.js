import { AIS, HOUR, MINUTE } from '../config/constants.js';
import { collect } from './collect.js';
import { claimManualRun } from './manual.js';
import { sources } from './sources.js';
import { statusSql } from '../storage/sql.js';
import { disabledSources } from '../storage/source-controls.js';
export function scheduledSourceNames(minute) {
  // Each schedule has its own CPU budget. AIS must not delay HTTP collectors.
  const group =
    minute % 15 === 0
      ? ['adsb']
      : minute % 5 === 1
        ? ['ais']
        : minute % 15 === 2
          ? ['easa', 'mscio', 'ioda']
          : minute % 60 === 3
            ? ['firms']
            : minute % 60 === 4
              ? ['mil_lol']
              : minute % 480 === 128
                ? ['state_dept']
                : minute % 480 === 7
                  ? ['fcdo']
                  : minute % 240 === 8
                    ? ['us_dod_rss']
                    : minute % 120 === 12
                      ? ['idf_official']
                      : minute % 360 === 13
                        ? ['polymarket']
                        : [];
  // Added only in a previously unused slot; existing source timing is unchanged.
  const supplemental = [
    ...(minute % 240 === 18 ? ['centcom_rss'] : []),
    ...(minute % 30 === 9 ? ['centcom_dvids'] : []),
    ...(minute % 360 === 61 ? ['marad_official'] : []),
    ...(minute % 720 === 53 ? ['satellite_context'] : []),
    ...(minute % 60 === 55 ? ['gdelt_context'] : []),
    ...(minute % 180 === 44 ? ['sentinel_catalog'] : []),
    ...(minute % 1440 === 49 ? ['aerial_archive'] : []),
    ...(minute % 30 === 22 ? ['adsb_alt'] : []),
    ...(minute % 60 === 37 ? ['airbridge_context'] : []),
    ...(minute % 1440 === 51 ? ['gfw_token'] : []),
    ...(minute % 1440 === 54 ? ['gfw_sar'] : []),
    ...(minute % 1440 === 57 ? ['gfw_sar_baseline'] : []),
    ...(minute % 360 === 83 ? ['copernicus_ems'] : []),
    ...(minute % 720 === 86 ? ['unosat_analysis'] : []),
  ];
  return [...new Set([...group, ...supplemental])];
}
export async function runSchedule(controller, env) {
  const slot = Math.floor(controller.scheduledTime / MINUTE) * MINUTE;
  const minute = slot / MINUTE;
  const manual = await claimManualRun(env.DB, slot);
  const selected = new Set([...scheduledSourceNames(minute), ...(manual?.wanted || [])]);

  // Shared adsb.lol quota: skip redundant automatic attempts during cooldown.
  // While recovering, reserve the first successful probe for the Tehran-priority collector,
  // not for the broad /mil endpoint. Explicit manual requests still report their result.
  // mil_lol is not gated here: it picks adsb.lol only when healthy, else adsb.fi.
  const autoAdsb = ['adsb'].filter(name => selected.has(name) && !(manual?.wanted || []).includes(name));
  if (autoAdsb.length) {
    const health = await env.DB.prepare(
      'SELECT failures,next_allowed_at,lease_until FROM worker_provider_state WHERE provider=?',
    )
      .bind('adsb.lol')
      .first();
    const now = Date.now();
    if ((health?.next_allowed_at || 0) > now || (health?.lease_until || 0) > now) {
      for (const name of autoAdsb) selected.delete(name);
    }
  }
  // Operator kill switch (H-04): a disabled source makes no upstream request in either
  // automatic or manual runs; its status says so instead of keeping a stale "ok".
  const disabled = selected.size ? await disabledSources(env.DB, Date.now()) : new Map();
  const blocked = [...selected].filter(name => disabled.has(name));
  for (const name of blocked) selected.delete(name);
  if (blocked.length) {
    await env.DB.batch(
      blocked.map(name => env.DB.prepare(statusSql).bind(name, slot, null, 'disabled', disabled.get(name))),
    );
  }
  const due = sources.filter(s => selected.has(s.name) && (!s.secret || env[s.secret]));
  const results = await Promise.allSettled(due.map(source => collect(env.DB, env, source, slot)));
  if (manual) {
    const states = await env.DB.prepare('SELECT source,state,detail,attempted_at FROM source_status').all();
    const names = new Set(manual.wanted);
    // A source may keep an older status after a skipped run; only this
    // manual slot can establish what actually happened for this request.
    const observed = (states.results || []).filter(x => names.has(x.source) && x.attempted_at === slot);
    const report = {
      requested: manual.wanted,
      observed,
      rejected: results.map((x, i) => (x.status === 'rejected' ? due[i].name : null)).filter(Boolean),
      disabled: manual.wanted.filter(name => disabled.has(name)),
      missing_secrets: manual.wanted.filter(name => !disabled.has(name) && !due.some(x => x.name === name)),
    };
    const complete =
      manual.wanted.length > 0 &&
      report.rejected.length === 0 &&
      report.disabled.length === 0 &&
      report.missing_secrets.length === 0 &&
      observed.length === manual.wanted.length &&
      observed.every(x => x.state === 'ok' || x.state === 'empty');
    await env.DB.prepare(
      "UPDATE worker_manual_runs SET status=?, finished_ms=?, result_json=? WHERE id=? AND status='running'",
    )
      .bind(complete ? 'done' : 'partial', Date.now(), JSON.stringify(report), manual.id)
      .run();
  }
  if (minute % 1440 === 3) {
    await env.DB.prepare('DELETE FROM observations WHERE observed_at < ?')
      .bind(slot - 90 * 24 * HOUR)
      .run();
  }
  if (results.some(result => result.status === 'rejected')) throw new Error('D1 write failed');
}
