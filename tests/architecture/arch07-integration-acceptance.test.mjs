import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handlePages } from '../../backend/pages/src/index.js';
import editor from '../../backend/editor/src/index.js';
import monitor from '../../backend/monitor/src/index.js';
import { auditActiveArchitecture } from '../../scripts/audit_active_architecture.mjs';
import { expectedWorkerConfig } from '../../scripts/release/build.mjs';
import { validatePages, validateWorker, validateSubdomain } from '../../scripts/release/cloudflare-gate.mjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const read = p => readFileSync(resolve(root, p), 'utf8');
const contract = JSON.parse(read('deploy/release-contract.json'));
const request = (path, options) => new Request('https://regional-watch.pages.dev' + path, options);
const recentDate = new Date(Date.now() - 86400000).toISOString();
function d1({ easa = [], statuses = [] } = {}) {
  const queries = [];
  return {
    queries,
    DB: {
      async batch(statements) {
        const sql = statements.map(stmt => stmt.sql);
        queries.push(...sql);
        if (sql.length !== 2) throw Error('unexpected D1 request batch length');
        if (sql[0].includes("WHERE source='easa'")) return [{ results: easa }, { results: statuses }];
        if (sql[0].includes('FROM satellite_analysis')) return [{ results: [] }, { results: [] }];
        throw Error('unexpected D1 source read: ' + sql[0]);
      },
      prepare(sql) {
        return { sql };
      },
    },
  };
}
function services(options = {}) {
  const d = d1(options),
    invocations = [];
  const pages = {
    EDITOR: {
      fetch: req =>
        editor.fetch(req, {
          NEWS_DB: {
            prepare() {
              throw Error('unexpected NEWS DB read');
            },
          },
          CORE_DB: {
            prepare() {
              throw Error('unexpected CORE DB read');
            },
          },
        }),
    },
    MONITOR: {
      fetch(req) {
        invocations.push({
          pathname: new URL(req.url).pathname,
          lang: new URL(req.url).searchParams.get('lang'),
        });
        return monitor.fetch(req, { DB: d.DB });
      },
    },
  };
  return { pages, invocations, queries: d.queries };
}

test('ARCH-07: actual Pages -> Monitor aviation service returns only EASA-authored RU and HE bulletin; never sampled aircraft', async () => {
  const bulletin = {
    id: 'easa-report',
    observed_at: Date.now(),
    payload: JSON.stringify({
      url: 'https://www.easa.europa.eu/domains/air-operations/czibs/2026-11-safety',
      title: 'Conflict Zone Information Bulletin',
      published: recentDate,
      area: 'Middle East',
      // Additional untrusted raw monitoring fields must not leak to public DTOs.
      observed_aircraft: 10000,
      secret: 'never-expose',
    }),
  };
  const fixture = services({
    easa: [bulletin],
    statuses: [{ source: 'easa', state: 'ok', attempted_at: Date.now() }],
  });
  const ru = await handlePages(request('/api/rw/aviation'), fixture.pages);
  const he = await handlePages(request('/api/rw-localized/aviation'), fixture.pages);
  assert.equal(ru.status, 200);
  assert.equal(he.status, 200);
  const ruPayload = await ru.json(),
    hePayload = await he.json();
  assert.equal(ruPayload.display_policy, 'show');
  assert.equal(ruPayload.has_publishable_content, true);
  assert.equal(ruPayload.signals.length, 1);
  assert.equal(ruPayload.signals[0].category, 'official_aviation_advisory');
  assert.equal(ruPayload.signals[0].source.name, 'EASA');
  assert.equal(hePayload.display_policy, 'show');
  assert.equal(hePayload.has_publishable_content, true);
  assert.equal(hePayload.signals.length, 1);
  assert.equal(hePayload.items.length, 1);
  assert.equal(hePayload.items[0].content_language, 'he');
  assert.deepEqual(fixture.invocations, [
    { pathname: '/api/aviation-analysis', lang: 'ru' },
    { pathname: '/api/aviation-analysis', lang: 'he' },
  ]);
  for (const body of [ruPayload, hePayload]) {
    assert.ok(!JSON.stringify(body).includes('observed_aircraft'));
    assert.ok(!JSON.stringify(body).includes('never-expose'));
    assert.ok(!JSON.stringify(body).includes('secret'));
  }
  assert.equal(fixture.queries.length, 4, 'exactly two private D1 batch statements per service call');
});

test('ARCH-07: without independently publishable evidence, four real RU/HE aviation/satellite routes fail closed', async () => {
  const fixture = services({
    easa: [
      {
        id: 'stale',
        observed_at: Date.now() - 40 * 86400000,
        payload: JSON.stringify({
          title: 'Old safety notice',
          url: 'https://www.easa.europa.eu/domains/air-operations/czibs/old',
          published: new Date(Date.now() - 40 * 86400000).toISOString(),
        }),
      },
    ],
  });
  for (const path of [
    '/api/rw/aviation',
    '/api/rw-localized/aviation',
    '/api/rw/satellite',
    '/api/rw-localized/satellite',
  ]) {
    const res = await handlePages(request(path), fixture.pages);
    assert.equal(res.status, 200, path);
    const payload = await res.json();
    assert.equal(payload.display_policy, 'hide', path);
    assert.equal(payload.has_publishable_content, false, path);
    assert.deepEqual(payload.signals, [], path);
  }
  assert.deepEqual(
    fixture.invocations.map(x => x.pathname),
    [
      '/api/aviation-analysis',
      '/api/aviation-analysis',
      '/api/satellite-analysis',
      '/api/satellite-analysis',
    ],
  );
});

test('ARCH-07: private Monitor summary and Editor queue never become Pages routes, even with a bearer header', async () => {
  const fixture = services();
  for (const path of ['/summary', '/api/translation-queue', '/api/nonexistent', '/api/../summary']) {
    const res = await handlePages(
      request(path, { headers: { Authorization: 'Bearer local-fixture' } }),
      fixture.pages,
    );
    assert.equal(res.status, 404, path);
    assert.equal((await res.json()).error, 'not_found', path);
  }
  assert.deepEqual(fixture.invocations, []);
  let dbRead = false;
  const direct = await monitor.fetch(new Request('https://monitor.example/summary'), {
    SUMMARY_TOKEN: 'local-fixture',
    DB: {
      batch() {
        dbRead = true;
        throw Error('private data query');
      },
    },
  });
  assert.equal(direct.status, 401);
  assert.equal(dbRead, false);
});

test('ARCH-07: missing Pages service bindings return safe 503 JSON, not secrets or a misleading empty feed', async () => {
  for (const path of ['/api/languages?lang=ru', '/api/rw/aviation']) {
    const old = console.error;
    console.error = () => {};
    try {
      const response = await handlePages(request(path), {});
      assert.equal(response.status, 503, path);
      assert.deepEqual(await response.json(), { error: 'upstream_unavailable' }, path);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    } finally {
      console.error = old;
    }
  }
});

test('ARCH-07: release candidate contains exactly three active module owners and canonical D1/AI/service/cron linkage', () => {
  const audit = auditActiveArchitecture(root);
  assert.equal(audit.graph.activeModuleCount, 107); // +pages api/uniques (21.11), +pages api/tension (21.11), +tension/indicators, +tension/tick (21.11), -satellite/catalog (21.11), +translations/numbers-ru (21.11), +B12 translations/watch, +B11 translations/meaning-check, +B11 translations/glossary-wikidata, +B10 translations/jobs, -Q12 centcom-rss (retired), +ops page API, +Q1 script-guard, +H-04 source-controls (monitor, editor), +SYS-01, +B1 budget, +B2 router/gemini, +B3 glossary, +B3 verify, +B4 display-policy, +B5 tier/sla, +B6 prompts/eval/eval-fixtures
  assert.equal(audit.graph.activeImportEdges, 277); // +1 23.11 (pages ops → api/data githubJson), +2 21.11 (index, ops → api/uniques), +2 21.11 (overview, ops → api/tension), +3 21.11 (index→tension/tick, tick→indicators, tick→news/tier), -4 21.11 (satellite/catalog: its imports and sources→catalog), +2 21.11 (news-mirror, analysts/translation → numbers-ru), +6 B12 (watch→jobs/verify/semantic/fact-guard/shared, index→watch), +4 B11 meaning-check (→router, →prompts; RU/HE schedulers →meaning-check), +1 B11 glossary→glossary-wikidata, +4 B10 (jobs→budget; RU scheduler→jobs/shared; HE scheduler→jobs), -5 Q12 (centcom-rss: its 4 imports + sources→centcom-rss), +1 ops (pages index→api/ops), +2 19.11 (ru scheduler→router, router→prompts), +1 Q1 (verify→script-guard), +5 H-04 (dispatch→source-controls, runner→sql/source-controls, ingestion+api→news/source-controls), +5 B3 verify (verify→glossary/semantic, semantic→glossary, analysts→verify, news-reader→semantic), +5 B4 (policy→shared; api, news-reader, stories-reader, analyst-api→policy), +8 B5 (tier→events, sla→tier/policy, he+ru schedulers→tier/sla, api→tier), +1 news-mirror→shared (HE from original), +8 B6 (eval→fixtures/router/prompts/verify/mirror, index→eval, he+ru schedulers→prompts)
  assert.deepEqual(audit.graph.unreachableModules, []);
  assert.deepEqual(audit.graph.unresolvedImports, []);
  assert.deepEqual(audit.graph.crossWorkerSourceImports, []);
  assert.deepEqual(audit.release.configMismatches, []);
  assert.deepEqual(audit.release.runtimeBindingGaps, []);
  assert.deepEqual(audit.release.services, ['EDITOR', 'MONITOR']);
  assert.deepEqual(audit.release.editorD1, ['CORE_DB', 'NEWS_DB']);
  assert.deepEqual(audit.release.monitorD1, ['DB']);
  assert.equal(audit.release.editorAi, 'AI');
  assert.deepEqual(audit.collectors.workflowGaps, []);
  assert.deepEqual(audit.collectors.integrityGaps, []);
  for (const spec of contract.workers) {
    const config = expectedWorkerConfig(root, spec.key);
    assert.equal(config.main, '../workers/' + spec.key + '.mjs');
    assert.equal(config.keep_vars, true);
    assert.equal(config.preview_urls, false);
  }
});

test('ARCH-07: release gates are ordered before writes; failure after partial publish retains exact rollback and receipt', () => {
  const yaml = read('.github/workflows/regional-watch-app-check.yml');
  const block = yaml.split('\n  release-production:')[1] || '';
  const ordered = [
    'Require identical checked-out code and verified artifact',
    'Require existing Pages and infrastructure Cloudflare credentials',
    'Verify live D1 schema is compatible (read-only',
    'Capture verified production binding and exact rollback versions before any write',
    'Deploy tested Editor module',
    'Deploy tested Monitor module',
    'Check that published Workers preserved cron',
    'Deploy the EXACT same-SHA Pages artifact',
    'Production release technical smoke',
    'Verify production service bindings after Pages publication',
    'Record actual production version IDs',
    'Record coordinated source SHA',
    'Automatic exact-version rollback on any partial publish failure',
  ];
  const positions = ordered.map(name => block.indexOf('name: ' + name));
  for (let i = 0; i < positions.length; i++) {
    assert.ok(positions[i] >= 0, 'Missing release stage ' + ordered[i]);
    if (i > 0) assert.ok(positions[i] > positions[i - 1], 'Unsafe release stage order ' + ordered[i]);
  }
  assert.match(block, /if: failure\(\)/);
  assert.match(block, /cloudflare-gate\.mjs rollback/);
  assert.match(block, /name: rw-coordinated-release-receipt/);
  assert.match(block, /name: rw-coordinated-rollback-baseline/);
  assert.match(block, /node scripts\/release\/verify\.mjs/);
  assert.match(block, /pages deploy release\/pages --project-name=regional-watch --branch=main/);
  assert.ok(!block.includes('wrangler deploy --config backend/'));
  const source = read('scripts/release/cloudflare-gate.mjs');
  assert.ok(source.includes('versions:[{percentage:100,version_id:before.version_id}]'));
  assert.ok(source.includes("/deployments/'+before.deployment_id+'/rollback"));
  const preflight = read('scripts/release/d1-preflight.mjs');
  assert.ok(preflight.includes('PRAGMA table_info'), 'the live schema preflight must use read-only PRAGMA');
  assert.doesNotMatch(
    preflight,
    /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+(?:TABLE|INTO|FROM)\b/i,
    'no migration or destructive D1 SQL in release preflight',
  );
});
