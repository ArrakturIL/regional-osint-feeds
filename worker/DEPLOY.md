# Worker deployment and rollback checklist

Production Workers: `regional-osint-monitor` (OSINT) and `regional-watch-editor` (news + analysts v1.1). GitHub stores **source snapshots**, not an automatic deployment pipeline. The existing Worker and its deployable versions are the rollback mechanism; **do not create backup Workers**.

## Before deployment

1. Confirm the exact deployed version ID, existing bindings and settings; commit the current running code to GitHub before changing it. Use Cloudflare's existing version history for rollback, **never create new backup Workers**.
2. Read and record the current Worker settings, binding **names and types**, compatibility date and cron schedules. As of 2026-11-11, compatibility date is **`2026-11-10`** and cron is **`*/1 * * * *`**.
3. Confirm the source contains **no embedded credentials**; keys stay in Cloudflare secret bindings.
4. Upload a **new version** using `/workers/scripts/{script_name}/versions` with explicit compatibility date, modules and inherited bindings; this compiles the candidate without replacing production. Use a short-lived staging Worker only for an independent end-to-end test; remove it afterwards.
5. Apply additive D1 migrations before code that depends on the new table. For the AvioADSB quota guard, the table is:

```sql
CREATE TABLE IF NOT EXISTS worker_provider_quota (
  provider TEXT PRIMARY KEY,
  remaining INTEGER NOT NULL,
  reset_at INTEGER NOT NULL,
  checked_at INTEGER NOT NULL
);
```

### Observation history query index

The additive migration `migrations/2026-11-11_observations_source_time.sql` adds `observations_source_time(source, observed_at DESC)` to D1 `regional-osint`. Keep the existing `observations_time(observed_at)` index for cross-source chronological reads. Applied to production on 2026-11-11; the aviation-history query then read approximately 415 rows rather than 838 for the same 200-row result.

Verify the query plan after applying migrations:

```sql
EXPLAIN QUERY PLAN
SELECT observed_at,payload FROM observations
WHERE source='airbridge_context' AND observed_at>=0
ORDER BY observed_at DESC LIMIT 30;
```

It should use `observations_source_time` without a temporary sort.

### Version-first deployments

For source-only Worker changes, upload a new `/workers/scripts/{script_name}/versions` version with explicit `compatibility_date` and `keep_bindings: ["secret_text","d1","plain_text"]`. Before deploying, inspect the new version's `resources.bindings` to verify all five original binding names and the D1 ID. Run offline GitHub tests, then explicitly deploy the validated version at 100%. The previous Worker version remains available for rollback. Do not recreate or expose secret values.

## Upload metadata

**Important:** A Worker multipart upload that omits `compatibility_date` can reset the existing date to an empty value even if bindings are inherited. This happened during testing and was caught by post-deployment validation.

For production uploads, explicitly provide:

- `main_module: "worker.js"`
- `compatibility_date: "2026-11-10"`
- `compatibility_flags: []`
- `bindings_inherit: "strict"`
- `bindings`: inherit the **existing** names and types rather than re-creating or exposing secrets.

Never upload an empty `bindings` array to the production Worker.

## Post-deployment gates

1. Re-fetch the production source and compare it **byte-for-byte** to the staged source and the version-controlled file.
2. Verify all bindings remain present, including `DB`, `AIS_KEY`, `FIRMS_KEY`, `REGION` and `SUMMARY_TOKEN`.
3. Verify the compatibility date and the original minute cron.
4. Check a real manual or scheduled D1 collection result and the `source_status` entry. For skipped quota polls, verify that `succeeded_at` is **not** advanced.
5. Run `node worker/test-aviation.mjs` and the GitHub workflow `Validate Regional Watch Worker` for the version-controlled source. A workflow being committed does **not** imply its result was verified.
6. Delete the temporary staging Worker after success. Rollback via a previously deployed Cloudflare version; do not retain copies as separate Workers.

## Rollback

If a post-deployment gate fails, deploy the recorded previous Cloudflare version at 100%, preserving its existing binding configuration. Verify exact version, bindings, compatibility date, API and cron. D1 migrations do not automatically roll back; never drop tables to roll back Worker code.

The Pages site is deployed separately. Updating the Worker does not automatically change the Pages frontend or its Functions.

## Integrated news + analyst editor (`regional-watch-editor`)

- Canonical source is `worker/regional-watch-editor.js`, importing `analysts-editor.mjs` and `analysts-translation.mjs`. The original pre-integration source is retained in Git history (commit `8e246b2fd1eb38ba73968b0aea50f7c3efa9bf90`).
- Preserve bindings **AI**, **NEWS_DB** (`regional-watch-news`) and **CORE_DB** (`regional-osint`) and compatibility date `2026-11-10`.
- Preserve its existing `*/5 * * * *` cron; the independent analyst editor runs only at minute **:30 UTC** each hour after the `:17` GitHub collector update. Do not introduce a second production cron or third permanent Worker.
- Public read-only endpoints: `/api/analysts`, `/api/analyst-posts`, `/api/analyst-posts/{id}`. Existing `/health` stays the news editor health; analyst processing status is read from `analyst_runs` in `regional-osint` D1 (do not expose unpublished originals or translations).
- Deploy three modules together with metadata `main_module: "regional-watch-editor.js"` and explicit inherited AI/D1 bindings. The frontend must use the production `regional-watch-editor` endpoint, not staging. Test the news health, analyst read routes, analyst D1 writes, and translation gates before deleting staging.
- The GitHub mirror of Telegram/YouTube content is not full YouTube transcripts. Metadata-only material must **never** be fabricated or auto-published. RSS author feeds currently provide metadata only and are not auto-published.
