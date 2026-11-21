// Pages /api/overview — read-only CORE D1 aggregator.
// Source-of-truth: monitor_runs, monitor_events, source_status.
// Keep public API keys stable; never infer confirmed incidents from monitor claims.
import { ISO, assembleSources } from './sources.js';
export { SOURCE_LABELS } from './sources.js';
const parse = s => {
  try {
    const x = JSON.parse(s || '{}');
    return x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  } catch {
    return {};
  }
};
const text = x => (typeof x === 'string' ? x.trim() : '');
const analysisSchema = Object.freeze({
  no_alert: {
    state: 'normal',
    badge: 'БЕЗ НОВЫХ ПРЕДУПРЕЖДЕНИЙ',
    title: 'Новых существенных сигналов не выявлено',
    description:
      'Последний анализ не нашёл оснований для нового оповещения. Это не означает отсутствия рисков.',
  },
  alert: {
    state: 'attention',
    badge: 'ТРЕБУЕТ ВНИМАНИЯ',
    title: 'Изменения требуют дополнительной оценки',
    description: 'Не все сведения подтверждены. Проверяй первоисточники.',
  },
  // Q4 (19.11): the GPT monitor writes 'partial' when only some sources could
  // be compared; it was shown as "analysis unavailable".
  partial: {
    state: 'partial',
    badge: 'АНАЛИЗ НЕПОЛНЫЙ',
    title: 'Последний анализ выполнен частично',
    description: 'Часть источников не удалось сравнить с прошлой проверкой. Проверяй первоисточники.',
  },
});
export function assembleOverview({
  latestRun = null,
  eventRows = [],
  statusRows = [],
  nowMs = Date.now(),
  lang = 'ru',
} = {}) {
  const outcome = text(latestRun?.outcome);
  const base = analysisSchema[outcome] || {
    state: 'unknown',
    badge: 'СТАТУС НЕДОСТУПЕН',
    title: 'Последний анализ недоступен',
    description: 'Последние результаты мониторинга сейчас нельзя проверить.',
  };
  const analysis = { time: ISO(latestRun?.recorded_at_ms), ...base, reason: '', link: null };
  const events = eventRows.slice(0, 6).map(row => {
    const raw = parse(row.payload);
    const title = text(raw.title_ru) || 'Событие';
    const description = text(raw.summary_ru) || text(raw.finding) || text(raw.assessment) || '';
    return {
      id: String(row.event_id || ''),
      type: 'analysis',
      title,
      description,
      date: ISO(row.updated_at_ms),
      link: null,
    };
  });
  const sources = assembleSources(statusRows);
  // 21.11: the HE page reads only the analysis time and state; the Russian
  // badge/title/description and the Russian event list stay out of ?lang=he.
  const he = lang === 'he';
  return {
    generatedAt: ISO(nowMs),
    analysis: he ? { time: analysis.time, state: analysis.state } : analysis,
    events: he ? [] : events,
    sources: he ? sources.map(x => ({ ...x, label: x.label_he })) : sources,
    available: sources.filter(x => x.state === 'ok' || x.state === 'partial').length,
    total: sources.length,
  };
}
export async function overviewFromD1(env, nowMs = Date.now(), lang = 'ru') {
  const db = env.DB;
  if (!db?.batch) throw new Error('Missing CORE DB binding');
  const [latest, events, status] = await db.batch([
    db.prepare(
      'SELECT outcome,payload,recorded_at_ms FROM monitor_runs ORDER BY recorded_at_ms DESC LIMIT 1',
    ),
    db.prepare(
      'SELECT event_id,category,first_seen,payload,updated_at_ms FROM monitor_events ORDER BY updated_at_ms DESC LIMIT 6',
    ),
    db.prepare('SELECT source,attempted_at,succeeded_at,state,detail FROM source_status ORDER BY source'),
  ]);
  return assembleOverview({
    latestRun: latest.results?.[0] || null,
    eventRows: events.results || [],
    statusRows: status.results || [],
    lang,
    nowMs,
  });
}
