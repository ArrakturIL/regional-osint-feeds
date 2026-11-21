import { publicAviationApi } from './aviation.js';
import { json } from './json.js';
import { localizedAnalyticsResponse } from './localization.js';
import { publicSatelliteApi } from './satellite.js';
import { aviation } from '../collectors/aviation/adsb.js';
import { AIRBRIDGE_REGIONS } from '../collectors/aviation/airbridge-types.js';
import { vessels } from '../collectors/maritime/ais.js';
import { HOUR, MINUTE } from '../config/constants.js';
import { settings } from '../config/settings.js';
import { sources } from '../schedule/sources.js';
export async function read(request, env) {
  const { pathname, searchParams } = new URL(request.url);
  if (pathname === '/api/satellite-analysis')
    return localizedAnalyticsResponse(await publicSatelliteApi(env, request), request, 'satellite');
  if (pathname === '/api/aviation-analysis')
    return localizedAnalyticsResponse(await publicAviationApi(env, request), request, 'aviation');
  if (request.method !== 'GET' || !['/summary', '/satellite-analysis'].includes(pathname))
    return json({ error: 'not found' }, 404);
  if (!env.SUMMARY_TOKEN || request.headers.get('Authorization') !== 'Bearer ' + env.SUMMARY_TOKEN) {
    return json({ error: 'unauthorized' }, 401);
  }
  if (pathname === '/satellite-analysis') {
    const [list, states] = await env.DB.batch([
      env.DB.prepare(
        'SELECT source,artifact_id,analysis_type,region,observed_from,observed_to,source_url,interpretation,collected_at_ms,payload FROM satellite_analysis ORDER BY collected_at_ms DESC LIMIT 80',
      ),
      env.DB.prepare(
        "SELECT source,state,attempted_at,succeeded_at,detail FROM source_status WHERE source IN ('firms','gfw_sar','copernicus_ems','unosat_analysis')",
      ),
    ]);
    return json({
      as_of: new Date().toISOString(),
      coverage: states.results || [],
      studies: (list.results || []).map(({ payload, ...row }) => ({ ...row, data: JSON.parse(payload) })),
      caveat:
        'Data are delayed or sampled. Thermal anomalies and SAR detections are not confirmations of military incidents.',
    });
  }
  const hours = Number(searchParams.get('hours') ?? 1);
  if (!Number.isInteger(hours) || hours < 1 || hours > 24) return json({ error: 'hours must be 1–24' }, 400);
  const now = Date.now();
  const [events, status, providers, aviationRows, airbridgeRows, quotas] = await env.DB.batch([
    env.DB.prepare(
      `SELECT source,id,observed_at,payload FROM observations
      WHERE observed_at >= ? AND observed_at <= ? ORDER BY observed_at DESC LIMIT 501`,
    ).bind(now - hours * HOUR, now),
    env.DB.prepare('SELECT * FROM source_status'),
    env.DB.prepare(
      'SELECT provider,next_allowed_at,lease_until,failures,last_status,last_error FROM worker_provider_state',
    ),
    env.DB.prepare(
      "SELECT source,observed_at,payload FROM observations WHERE source IN ('adsb','adsb_alt') AND observed_at >= ? ORDER BY observed_at DESC LIMIT 200",
    ).bind(now - 24 * HOUR),
    env.DB.prepare(
      "SELECT observed_at,payload FROM observations WHERE source='airbridge_context' AND observed_at >= ? ORDER BY observed_at DESC LIMIT 30",
    ).bind(now - 24 * HOUR),
    env.DB.prepare('SELECT provider,remaining,reset_at,checked_at FROM worker_provider_quota'),
  ]);
  const states = new Map(status.results.map(row => [row.source, row]));
  const airSamples = aviationRows.results.map(row => ({
    source: row.source,
    observed_at: row.observed_at,
    data: JSON.parse(row.payload),
  }));
  const focusArea = settings(env).air_focus[0];
  const aviationFocus = ['adsb', 'adsb_alt'].map(source => {
    const focusSamples = airSamples.filter(row => row.source === source && row.data.area === focusArea);
    const last = focusSamples[0],
      previous = focusSamples[1];
    const sourceState = states.get(source);
    const maxAge = (source === 'adsb' ? 90 : 150) * MINUTE;
    const currentStatus =
      sourceState?.state === 'error'
        ? 'source_unavailable'
        : !last || now - last.observed_at > maxAge
          ? 'no_recent_sample'
          : last.data.observed_aircraft === 0
            ? 'zero_in_sample'
            : 'aircraft_observed';
    return {
      source,
      area: focusArea,
      status: currentStatus,
      current_count: ['zero_in_sample', 'aircraft_observed'].includes(currentStatus)
        ? last.data.observed_aircraft
        : null,
      last_sample_at: last?.observed_at ?? null,
      last_sample_count: last?.data.observed_aircraft ?? null,
      sample_count_24h: focusSamples.length,
      previous_sample_at: previous?.observed_at ?? null,
      previous_sample_count: previous?.data.observed_aircraft ?? null,
      comparison:
        !['zero_in_sample', 'aircraft_observed'].includes(currentStatus) ||
        !previous ||
        last.observed_at - previous.observed_at > 3 * HOUR
          ? null
          : {
              status: 'two_snapshots_only',
              gap_minutes: Math.round((last.observed_at - previous.observed_at) / MINUTE),
              count_difference: last.data.observed_aircraft - previous.data.observed_aircraft,
              evidence: 'Change in provider snapshot counts only; not a flight movement or verified trend.',
            },
      receiver_coverage_verified: false,
      source_state: sourceState?.state || 'pending',
      note: 'Zero is a single receiver-network observation, never proof of empty airspace.',
    };
  });
  // Cross-source comparison is only meaningful for successful, near-simultaneous
  // Tehran samples. Both networks can miss aircraft, even when both report zero.
  const [focusA, focusB] = aviationFocus;
  const bothCurrent = [focusA, focusB].every(x => x.current_count !== null);
  const sampleGap =
    focusA.last_sample_at !== null && focusB.last_sample_at !== null
      ? Math.abs(focusA.last_sample_at - focusB.last_sample_at)
      : null;
  const paired = bothCurrent && sampleGap !== null && sampleGap <= 10 * MINUTE;
  const aviationFocusComparison = {
    area: focusArea,
    status: !paired
      ? 'not_comparable'
      : (focusA.current_count === 0) !== (focusB.current_count === 0)
        ? 'source_disagreement'
        : focusA.current_count === 0
          ? 'both_report_zero'
          : 'both_report_aircraft',
    sample_gap_minutes: paired ? Math.round(sampleGap / MINUTE) : null,
    compared_sources: ['adsb', 'adsb_alt'],
    confirmed_empty_airspace: false,
    note: 'Only near-simultaneous provider snapshots are compared; agreement does not verify full airspace coverage.',
  };
  const quotaMap = new Map(quotas.results.map(q => [q.provider, q]));
  const corridorSamples = airbridgeRows.results.map(r => ({
    observed_at: r.observed_at,
    data: JSON.parse(r.payload),
  }));
  const airbridgeSummary = AIRBRIDGE_REGIONS.map(([area]) => {
    const samples = corridorSamples.filter(x => x.data.area === area),
      latest = samples[0] || null,
      previous = samples[1] || null;
    const status = !latest
      ? 'no_recent_sample'
      : now - latest.observed_at > 8 * HOUR
        ? 'stale_sample'
        : 'sampled';
    const comparable =
      status === 'sampled' &&
      previous &&
      latest.observed_at - previous.observed_at <= 12 * HOUR &&
      [latest.data.observed_aircraft, previous.data.observed_aircraft].every(Number.isFinite);
    return {
      area,
      sample_count_24h: samples.length,
      last_sample_at: latest?.observed_at ?? null,
      last_observed_aircraft: latest?.data.observed_aircraft ?? null,
      last_airlift_type_observed: latest?.data.airlift_type_observed ?? null,
      last_tanker_type_observed: latest?.data.tanker_type_observed ?? null,
      previous_sample_at: previous?.observed_at ?? null,
      previous_observed_aircraft: previous?.data.observed_aircraft ?? null,
      comparison: comparable
        ? {
            status: 'two_snapshots_only',
            gap_minutes: Math.round((latest.observed_at - previous.observed_at) / MINUTE),
            count_difference: latest.data.observed_aircraft - previous.data.observed_aircraft,
            evidence:
              'Different point-in-time counts in one region; not arrivals, departures, unique flights, or a transit route.',
          }
        : null,
      flagged_logistics_snapshots_24h: samples.reduce((n, x) => n + (x.data.flagged_logistics_type || 0), 0),
      status,
    };
  });
  return json({
    aviation_focus: aviationFocus,
    aviation_focus_comparison: aviationFocusComparison,
    airbridge_context: {
      status: 'context_only_not_route_tracking',
      sampling_interval_minutes: 60,
      planned_requests_per_day: 24,
      regions: airbridgeSummary,
      attribution: 'Data: AvioADSB (CC BY-NC 4.0)',
      attribution_url: 'https://avioadsb.org',
      note: 'Independent snapshots. No origin/destination, unique flight counts or verified US military air bridge can be inferred.',
    },
    from: now - hours * HOUR,
    until: now,
    truncated: events.results.length > 500,
    interpretation: {
      adsb: 'One adsb.lol sample every 15 minutes, collected by GitHub Actions: every other sample is the configured focus area, the rest rotate through context regions. Zero in a sample is not empty airspace.',
      airbridge_context:
        'AvioADSB corridor context: 24 requests/day in 6 rotating 100 NM zones; counts are snapshots, not unique flights or a confirmed US air bridge. Database military flags and type hints are not proof of affiliation.',
      adsb_alt:
        'AvioADSB community data, up to 48 requests/day, adaptively throttled to protect Tehran when the shared-network quota is low: 32 focus, 16 context. Each <=100NM sample has unverified receiver coverage. Data: AvioADSB (CC BY-NC 4.0), https://avioadsb.org — personal/noncommercial use only.',
      centcom_dvids:
        'Official CENTCOM Public Affairs news via DVIDS, mirrored by GitHub Actions. /news/ entries only, not all CENTCOM press releases. Check original publication dates and collector heartbeat.',
      satellite_context:
        'NASA GIBS NOAA-20 optical center-tile previews and NASA EONET natural events. Visual differences are not evidence of military activity. Coverage can be partial.',
      gdelt_context:
        'GDELT Project automated machine-coded news events from official 15-minute public exports, mirrored hourly by GitHub. These are media signals, NOT verified incidents; count and domains are not independent confirmations.',
      marad_official:
        'Official active US MARAD maritime advisories. Collection date is NOT publication date; no event should be treated as newly issued merely by first ingestion.',
      mil_lol:
        'Hourly military-tagged snapshot (adsb.lol, else adsb.fi), collected by GitHub Actions. IDs in broad overlapping areas. Never infer sorties from samples.',
      fcdo: 'Official UK travel advisories; not a real-time alert source.',
      us_dod_rss:
        'Official U.S. Department of Defense RSS; filtered regional coverage only, NOT an exhaustive CENTCOM feed.',
      idf_official: 'Verified IDF Telegram public channel; not Home Front Command real-time warnings.',
      polymarket: 'Market prices indicate sentiment, not confirmed facts or calibrated attack odds.',
      state_dept:
        'Country Travel Advisories; changes may lag embassy security alerts, and poll timestamps are not publication times.',
      ais: 'Counts of distinct observed vessels per short sample; not transit counts.',
      firms: 'Satellite heat detections do not identify a cause.',
      empty: 'Successful poll without matching records; not proof of no activity.',
    },
    provider_health: providers.results.map(p => ({
      provider: p.provider,
      backoff_active: p.next_allowed_at > now,
      quota_remaining: quotaMap.get(p.provider)?.remaining ?? null,
      quota_reset_at: quotaMap.get(p.provider)?.reset_at ?? null,
      next_allowed_at: p.next_allowed_at,
      request_in_progress: p.lease_until > now,
      failures: p.failures,
      last_http_status: p.last_status,
      last_error: p.last_error,
    })),
    sources: sources.map(source => {
      const state = states.get(source.name);
      const enabled = !source.secret || Boolean(env[source.secret]);
      return {
        source: source.name,
        interval_minutes: source.every,
        enabled,
        state: !enabled ? 'key_missing' : state?.state || 'pending',
        data_quality: !enabled
          ? 'disabled'
          : !state
            ? 'unobserved'
            : state.state === 'ok'
              ? 'recent_records'
              : state.state === 'partial'
                ? 'coverage_limited'
                : state.state === 'empty'
                  ? 'no_matching_records'
                  : 'unavailable',
        attempted_at: state?.attempted_at ?? null,
        succeeded_at: state?.succeeded_at || null,
        stale: enabled && (!state?.succeeded_at || now - state.succeeded_at > source.every * 2 * MINUTE),
        detail: state?.detail ?? null,
      };
    }),
    observations: events.results.slice(0, 500).map(({ payload, observed_at, ...row }) => ({
      ...row,
      first_seen_at: observed_at,
      data: JSON.parse(payload),
    })),
  });
}
