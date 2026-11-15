# Regional Watch integrated architecture — 2026-11-15

## Decision
Implement fixes from the new frontend/backend QA **together with** selected low-cost open-source tools and the Neon data layer. Avoid repairing the old pipeline only to replace it later. Preserve production until the new modules pass their own tests and a read-only shadow run.

## Real baseline
- GitHub repository: ArrakturIL/regional-osint-feeds. Baseline main: 83bf314edd26dff4a5718f1791439cbf1d389a24.
- QA files: Regional-Watch-QA-Frontend-86cd2f80.md, Regional-Watch-QA-Backend-86cd2f80.md, Regional-Watch-QA-Plan.md.
- Research: REGIONAL_WATCH_RESEARCH_CONTEXT_2026-11-15.md; its (1) copy is identical; long OSS research is a catalogue, not a deployable infrastructure specification.
- Neon project regional-watch-data (weathered-resonance-71661530), Free organization, EU central, database regional_watch, PostgreSQL 18. Free limits verified: 1 GB storage, 100 CU-hours, 5 GB outbound transfer per project/month.

## Responsibilities and invariant contracts
- GitHub: code, configuration, tests, static reference material. After cutover scheduled collector JSON no longer commits to main.
- GitHub Actions: run existing Python collectors. They own network-heavy extraction and optional small libraries.
- Neon PostgreSQL: versioned data/status JSON snapshots, collection source, hashes, timestamp, explicit freshness, safe writes. No browser SQL credentials.
- Cloudflare D1: existing operational event/translation/editor state; do not move it wholesale.
- Cloudflare Workers AI: existing translation model retained; add deterministic guards and review queue.
- Cloudflare Pages: display reconciled data with RU/HE identity and attribution intact.
- A shared source contract records original URL, original language, original text, collected-at time, digest, independently attributed origin count, and the precise status of each translation/claim. Never interpret source count as verified confirmation.

## Design sequence
1. Build an allowlisted, bounded, paired collector-snapshot contract in Neon, with atomic update, same-data idempotency and protection against stale collector runs.
2. Keep GitHub writes while shadow-writing to Neon. Verify hashes and age against collected JSON; never cut over until both write and read paths have demonstrated parity.
3. Add a secure, cached reader for Monitor and Editor (evaluate private Neon access versus a bounded D1 sync for runtime cost). Convert one collector at a time; only then stop its GitHub JSON commits.
4. Expand existing factual translation guards, using source-vs-translation actor/action/target, negation, condition, quotation and modality tests. No alternative paid AI or local GPU services. Cached high-confidence wrong translations must be marked needs_review and safely republished after validation.
5. Reconcile one-event multi-publisher reports without erasing conflicting claims; archive sorts newest first; homepage freshness and priority are explicitly separate. Keep RU/HE ID and order parity.
6. Fix confirmed UI QA regressions: card gutters with expanded news, Digest/Last Check composition, Hebrew ARIA, editorial verification status, declension and unused background requests.
7. Evaluate only light OSS modules that reduce a measured error in the existing stack: builtin Intl.Segmenter/Unicode/hash first; Cheerio, fast-xml-parser, Readability, franc-min if supported by test fixtures and free quotas. Defer Qdrant, OpenSearch, local translation models, heavyweight crawlers and queues.
8. Stage integration tests, preview and source-by-source rollout; preserve rollback paths and live D1 integrity.

## Safety, constraints and acceptance
- Neon Free has finite compute/egress/storage. Never run a database query for every public visitor or every minute without a measured cache/usage budget.
- No R2 setup or other paid services. Keep all credentials outside Git and never echo them in logs.
- Never send mutable writes to shared preview D1. No production changes until tested.
- P1 examples: 'strike a naval mine/catch fire' must not become an attack by tankers; 'may postpone strikes on Iran barring provocations' must retain actor, target, possibility and condition; Hebrew article-914880 may not reverse the actor.
- P2: five cards reporting one incident collapse into one group with all sources and disagreements preserved. The Latest archive must not rank 11-Nov priority stories above 15-Nov news without an explicit sort label/mode. Reconciliation never calls source echoes independent confirmation.
- Fail closed for bad translations, fail visibly for stale data, keep last good verified snapshot if Neon is unreachable.
