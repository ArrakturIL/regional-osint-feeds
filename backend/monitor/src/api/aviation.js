import { SATELLITE_PUBLIC_HEADERS, satellitePublicResponse } from './satellite.js';
import { EASA } from '../config/constants.js';
import { sources } from '../schedule/sources.js';
export async function publicAviationApi(env, request) {
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: SATELLITE_PUBLIC_HEADERS });
  if (!['GET', 'HEAD'].includes(request.method))
    return satellitePublicResponse({ error: 'method_not_allowed' }, 405);
  const [bulletins, states] = await env.DB.batch([
    env.DB.prepare(
      "SELECT id,payload,observed_at FROM observations WHERE source='easa' ORDER BY observed_at DESC LIMIT 30",
    ),
    env.DB.prepare(
      "SELECT source,state,attempted_at,succeeded_at FROM source_status WHERE source IN ('easa','adsb','adsb_alt','airbridge_context')",
    ),
  ]);
  const now = Date.now();
  const maxAge = 14 * 86400000;
  const signalMap = new Map();
  for (const row of bulletins.results || []) {
    let b;
    try {
      b = JSON.parse(row.payload);
    } catch {
      continue;
    }
    const url = typeof b?.url === 'string' ? b.url : '';
    const title = typeof b?.title === 'string' ? b.title.trim().slice(0, 130) : '';
    const published = Date.parse(b?.published || '');
    if (
      !url.startsWith('https://www.easa.europa.eu/domains/air-operations/czibs/') ||
      !title ||
      !Number.isFinite(published) ||
      published > now + 3600000 ||
      now - published > maxAge
    )
      continue;
    if (signalMap.has(url)) continue;
    signalMap.set(url, {
      id: 'easa:' + url.split('/').pop().slice(0, 50),
      category: 'official_aviation_advisory',
      title: 'EASA: бюллетень по безопасности воздушного пространства — ' + title,
      description:
        'Опубликован официальный бюллетень по безопасности гражданской авиации. Актуальность и точные ограничения необходимо проверять в тексте первоисточника.',
      published_at: new Date(published).toISOString(),
      region: typeof b.area === 'string' ? b.area.slice(0, 130) : null,
      source: { name: 'EASA', url },
      confidence: 'official_published_bulletin',
      severity: 'informational',
      caveat:
        'Сам факт публикации бюллетеня не означает закрытия воздушного пространства или начала военной операции.',
    });
  }
  const signals = [...signalMap.values()]
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .slice(0, 8);
  const statusMap = new Map((states.results || []).map(x => [x.source, x]));
  const sources = ['easa', 'adsb', 'adsb_alt', 'airbridge_context'].map(id => {
    const v = statusMap.get(id);
    return {
      id,
      role: id === 'easa' ? 'official_advisories' : 'internal_context_only',
      state: v?.state || 'unknown',
      last_checked_at: v?.attempted_at ? new Date(v.attempted_at).toISOString() : null,
      display_raw_samples: false,
    };
  });
  return satellitePublicResponse(
    {
      schema_version: 1,
      generated_at: new Date(now).toISOString(),
      signals,
      sources,
      has_publishable_content: signals.length > 0,
      display_policy: signals.length ? 'show' : 'hide',
      data_status: signals.length ? 'recent_official_bulletins' : 'no_recent_verified_advisory',
      interpretation:
        'Разрозненные ADS-B наблюдения, включая нули, остаются внутренними данными мониторинга. Они не доказывают состояние воздушного пространства.',
      attribution: 'EASA',
    },
    200,
    request.method === 'HEAD',
  );
}

// Locale layer for public telemetry summaries. Provider names and machine codes stay stable.
// No unchecked machine translation on public requests; uncertain items remain hidden.
