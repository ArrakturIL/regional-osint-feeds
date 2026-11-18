export function createSourceIngestion({ HOUR, DAY, plain, assertString }) {
  const MIRROR_BASE = 'https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/';
  const MAX_SOURCE_BYTES = 135_000;
  const MAX_BODY = 6_500;
  const VALID_STATES = new Set(['full_text', 'metadata_only', 'truncated']);
  async function sha256(s) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  async function readMirror(name) {
    if (!['analyst-source-items.json', 'analyst-source-status.json'].includes(name))
      throw Error('invalid mirror path');
    const res = await fetch(MIRROR_BASE + name, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw Error('mirror_http_' + res.status);
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_SOURCE_BYTES) throw Error('mirror_oversized');
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function validateInput(raw, source, analyst, now) {
    if (
      !raw ||
      typeof raw !== 'object' ||
      raw.source_id !== source.id ||
      raw.analyst_id !== analyst.id ||
      !assertString(raw.id, 5, 120) ||
      !assertString(raw.canonical_url, 16, 350) ||
      !raw.id.startsWith(source.id + ':') ||
      !VALID_STATES.has(raw.text_status)
    )
      return null;
    if (
      !['ru', 'he', 'en'].includes(source.language || 'ru') ||
      (raw.language && raw.language !== (source.language || 'ru'))
    )
      return null;
    if (source.type === 'telegram_public') {
      const prefix = source.canonical_prefix;
      if (
        !raw.canonical_url.startsWith(prefix) ||
        !/^\d+$/.test(raw.canonical_url.slice(prefix.length)) ||
        raw.type !== 'telegram_post'
      )
        return null;
    } else if (source.type === 'youtube_rss') {
      if (
        !raw.canonical_url.startsWith(source.canonical_prefix) ||
        !/^[\w-]{11}$/.test(raw.canonical_url.slice(source.canonical_prefix.length)) ||
        raw.type !== 'youtube_video' ||
        raw.text_status !== 'metadata_only'
      )
        return null;
    } else return null;
    const published = Date.parse(raw.published_at);
    if (!Number.isFinite(published) || published > now + HOUR * 3 || published < now - DAY * 7) return null;
    if (!assertString(raw.content_hash, 64, 64) || !/^[a-f0-9]{64}$/.test(raw.content_hash)) return null;
    if (
      typeof raw.body !== 'string' ||
      raw.body.length > MAX_BODY ||
      raw.body.includes('\u0000') ||
      raw.body.includes('\u0001')
    )
      return null;
    if (raw.text_status === 'full_text' && raw.body.length < 5) return null;
    if (raw.text_status !== 'full_text' && raw.type === 'youtube_video' && raw.body.length) return null;
    return {
      id: raw.id,
      analyst_id: analyst.id,
      source_id: source.id,
      canonical_url: raw.canonical_url,
      published_at_ms: published,
      title: plain(raw.title, 240),
      body: plain(raw.body, MAX_BODY),
      text_status: raw.text_status,
      content_hash: raw.content_hash,
      original_language: source.language || 'ru',
      type: raw.type,
    };
  }
  async function insertItem(db, it, now) {
    const got = await db
      .prepare(
        `INSERT OR IGNORE INTO analyst_items
      (id,analyst_id,source_id,canonical_url,source_type,source_published_at_ms,title,body,text_status,content_hash,state,created_at_ms)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        it.id,
        it.analyst_id,
        it.source_id,
        it.canonical_url,
        it.type,
        it.published_at_ms,
        it.title,
        it.body,
        it.text_status,
        it.content_hash,
        'pending',
        now,
      )
      .run();
    await db
      .prepare(
        `INSERT OR IGNORE INTO analyst_item_revisions(item_id,content_hash,body,discovered_at_ms)
      VALUES(?,?,?,?)`,
      )
      .bind(it.id, it.content_hash, it.body, now)
      .run();
    const existing = await db
      .prepare('SELECT content_hash,state FROM analyst_items WHERE id=?')
      .bind(it.id)
      .first();
    if (existing && existing.content_hash !== it.content_hash) {
      // Keep published text unchanged; create revision and log that original changed.
      await db
        .prepare(
          `UPDATE analyst_items SET state='source_changed',last_error='Original source changed after initial ingestion'
      WHERE id=? AND state='published'`,
        )
        .bind(it.id)
        .run();
      await db
        .prepare(
          `UPDATE analyst_items SET content_hash=?,body=?,state='pending',last_error=NULL
      WHERE id=? AND state IN ('pending','skipped','needs_data')`,
        )
        .bind(it.content_hash, it.body, it.id)
        .run();
    }
    return got?.meta?.changes === 1;
  }
  return { sha256, readMirror, validateInput, insertItem };
}
