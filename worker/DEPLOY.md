# Worker deployment and rollback checklist

Production Worker: `regional-osint-monitor`. GitHub stores a **source snapshot**, not an automatic deployment pipeline.

## Before deployment

1. Fetch and save the exact production Worker source to a separate, non-routed backup Worker. Keep at least one previous working version.
2. Read and record the current Worker settings, binding **names and types**, compatibility date and cron schedules. As of 2026-11-11, compatibility date is **`2026-11-10`** and cron is **`*/1 * * * *`**.
3. Confirm the source contains **no embedded credentials**; keys stay in Cloudflare secret bindings.
4. Stage the new JavaScript module under a separate Worker name and require Cloudflare to accept/compile it. No staging cron should be added.
5. Apply additive D1 migrations before code that depends on the new table. For the AvioADSB quota guard, the table is:

```sql
CREATE TABLE IF NOT EXISTS worker_provider_quota (
  provider TEXT PRIMARY KEY,
  remaining INTEGER NOT NULL,
  reset_at INTEGER NOT NULL,
  checked_at INTEGER NOT NULL
);
```

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
6. Delete the temporary staging Worker after success, **not** the backups.

## Rollback

If any post-deployment gate fails, restore the exact backup Worker source using the same explicit compatibility date and inherited production bindings. Verify source, bindings and cron again. An additive D1 table can remain after a code rollback.

The Pages site is deployed separately. Updating the Worker does not automatically change the Pages frontend or its Functions.
