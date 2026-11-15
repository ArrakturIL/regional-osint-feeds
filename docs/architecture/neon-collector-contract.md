# Neon collector mirror contract (2026-11-15)

## Existing project
Organization plan Free. Project regional-watch-data, ID weathered-resonance-71661530; database regional_watch, region aws-eu-central-1, PostgreSQL 18. Do not create another project while this one is available.

## Data
Table public.regional_collector_snapshots contains an atomic pair of JSONB data_payload and status_payload per allowlisted collector, SHA256 hashes of canonical UTF-8 JSON, checked_at UTC and persisted_at UTC.
Datasets: analysts, centcom, copernicus, gdelt, marad, satellite, unosat and news_translation (the latter synthesizes status from generated_at). Path mapping is fixed in scripts/neon_mirror.py; no arbitrary paths or database identifiers are taken from user inputs. Each JSON document is capped at 1 MiB. For unknown source, invalid JSON, invalid status, missing file, or timestamp more than 20 min in the future, the loader refuses the entire pair.

Upsert semantics: NEW record is accepted; newer checked_at replaces the entire pair; older run is rejected as stale; equal checked_at + identical hashes is idempotent unchanged; equal time + different hashes is conflict, never overwritten silently. The UPSERT time check is one PostgreSQL statement and therefore race-safe. No raw data is translated, inferred or converted into 'verified' by this storage layer.

## Execution
Test without network: python -m unittest scripts.test_neon_mirror -v
Schema: storage/neon/001_collector_snapshots.sql; additive DDL.
Application writes will eventually use a pooled secret NEON_DATABASE_URL stored in GitHub Actions secrets (not connected yet). Keep legacy JSON commit/writeback until shadow mirroring AND a tested authenticated reader both work. During shadow, Neon errors should not hide failure of the collector.

## Security and free quota
Only server-side scripts/service adapters may access Neon. Never embed DATABASE_URL in HTML/JS, GitHub commits, logs, or public error responses. The public Monitor API still shows source attribution and no-event-missing coverage accurately. Monitor Free limits for compute, transfer and storage; no unlimited per-viewer Neon query. D1 and the existing Cloudflare AI pipeline are not replaced.
