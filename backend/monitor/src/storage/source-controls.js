// H-04: per-source rollback without a release. A row in source_controls stops one
// collector; deleting it (or until_ms passing) resumes it. Reads fail open so a
// missing table or a D1 hiccup never stops every source at once.
// Schema: storage/cloudflare/004_source_controls.sql; operated by source-control.yml.
export async function disabledSources(db, now = Date.now()) {
  try {
    const rows =
      (
        await db
          .prepare(
            'SELECT source,reason,until_ms FROM source_controls WHERE disabled=1 AND (until_ms IS NULL OR until_ms>?)',
          )
          .bind(now)
          .all()
      )?.results || [];
    return new Map(
      rows
        .filter(row => typeof row.source === 'string' && row.source)
        .map(row => [row.source, String(row.reason || 'disabled by operator').slice(0, 300)]),
    );
  } catch {
    return new Map();
  }
}
