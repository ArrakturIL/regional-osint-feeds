export const statusSql = `INSERT INTO source_status VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(source) DO UPDATE SET attempted_at=excluded.attempted_at,
  succeeded_at=MAX(COALESCE(source_status.succeeded_at, 0), COALESCE(excluded.succeeded_at, 0)),
  state=excluded.state, detail=excluded.detail
  WHERE excluded.attempted_at >= source_status.attempted_at`;

