// H-04: per-publisher rollback without a release. A source_controls row whose
// source equals a publisher id from events.FEEDS (bbc, jpost, ...) stops its RSS
// ingestion and hides events it represents from /api/news. Fails open.
export async function disabledPublishers(db, now = Date.now()) {
  try {
    const rows =
      (
        await db
          .prepare('SELECT source FROM source_controls WHERE disabled=1 AND (until_ms IS NULL OR until_ms>?)')
          .bind(now)
          .all()
      )?.results || [];
    return new Set(rows.map(row => row.source).filter(x => typeof x === 'string' && x));
  } catch {
    return new Set();
  }
}
