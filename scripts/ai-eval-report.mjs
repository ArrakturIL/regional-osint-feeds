#!/usr/bin/env node
// B6 report from ai_eval_runs rows (D1 export as JSON array).
//   node scripts/ai-eval-report.mjs rows.json [--blind]
// Default: per language x model table (accepted share, reasons, neurons, latency).
// --blind: the same outputs per fixture under shuffled letters A/B/C/D for a
// human or GPT reviewer; the letter -> model key is printed last, separately.
import {readFileSync} from 'node:fs';

export function summarize(rows) {
  const by = new Map();
  for (const r of rows) {
    const k = r.language + '|' + r.candidate;
    const s = by.get(k) || {language: r.language, candidate: r.candidate, n: 0, ok: 0, issues: {}, neurons: 0, latency: 0};
    s.n++; s.ok += r.ok ? 1 : 0; s.neurons += Number(r.neurons) || 0; s.latency += Number(r.latency_ms) || 0;
    if (!r.ok) { const code = String(r.issue || 'unknown').replace(/^(provider_error):.*/, '$1'); s.issues[code] = (s.issues[code] || 0) + 1; }
    by.set(k, s);
  }
  return [...by.values()].map(s => ({...s, ok_share: s.n ? s.ok / s.n : 0, avg_neurons: s.n ? s.neurons / s.n : 0, avg_latency_ms: s.n ? Math.round(s.latency / s.n) : 0}))
    .sort((a, b) => a.language.localeCompare(b.language) || b.ok_share - a.ok_share);
}

// Deterministic shuffle per fixture so a re-run gives the same letters.
function shuffled(list, seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return list.map(x => [x, (h = Math.imul(h ^ 0x9e3779b9, 2654435761) >>> 0)]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
}

export function blindPack(rows) {
  const groups = new Map();
  for (const r of rows) {
    const k = r.fixture_id + '|' + r.language;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const key = [], out = [];
  for (const [k, list] of [...groups].sort()) {
    out.push('## ' + k);
    shuffled(list, k).forEach((r, i) => {
      const letter = 'ABCDEFGH'[i];
      key.push(k + ' ' + letter + ' = ' + r.candidate);
      let o = {}; try { o = JSON.parse(r.output || '{}') || {}; } catch {}
      out.push('- **' + letter + '**: ' + [o.title, o.body].filter(Boolean).join(' / ') + (o.raw ? ' `' + o.raw.slice(0, 120) + '`' : ''));
    });
  }
  return {text: out.join('\n'), key: key.join('\n')};
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const [file, flag] = process.argv.slice(2);
  const raw = readFileSync(file, 'utf8');
  const rows = JSON.parse(raw.slice(raw.indexOf('[')));
  if (flag === '--blind') {
    const b = blindPack(rows);
    console.log(b.text + '\n\n---\nKEY (do not show to the reviewer):\n' + b.key);
  } else {
    console.log('| lang | model | n | accepted | reasons | neurons/call | ms/call |\n|---|---|---|---|---|---|---|');
    for (const s of summarize(rows))
      console.log(`| ${s.language} | ${s.candidate} | ${s.n} | ${Math.round(s.ok_share * 100)}% | ${Object.entries(s.issues).map(([k, v]) => k + ' ' + v).join(', ') || '—'} | ${s.avg_neurons.toFixed(1)} | ${s.avg_latency_ms} |`);
  }
}
