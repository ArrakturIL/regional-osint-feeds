"""Bounded public collector snapshot contract; Free Neon PostgreSQL mirror.

The collector and its existing JSON files remain the source of data during
shadowing. No database is touched on import. Never put database credentials
or token-bearing URLs in this module or its logs.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from pathlib import Path
import json

SOURCE_FILES: dict[str, tuple[str, str | None]] = {
    "analysts": ("analyst-source-items.json", "analyst-source-status.json"),
    "centcom": ("centcom-news.json", "centcom-status.json"),
    "copernicus": ("copernicus-analyses.json", "copernicus-analyses-status.json"),
    "gdelt": ("gdelt-context.json", "gdelt-status.json"),
    "marad": ("marad-advisories.json", "marad-status.json"),
    "satellite": ("satellite-observations.json", "satellite-status.json"),
    "unosat": ("unosat-analysis.json", "unosat-analysis-status.json"),
    "news_translation": ("news-localization-mirror.json", None),
}
MAX_DOC_BYTES = 1_048_576
MAX_FUTURE_SKEW = timedelta(minutes=20)
VALID_STATES = frozenset(("ok", "partial", "error", "stale"))

UPSERT_SQL = """
INSERT INTO public.regional_collector_snapshots
  (source_key, data_payload, status_payload, data_sha256, status_sha256, checked_at)
VALUES (%s, %s::jsonb, %s::jsonb, %s, %s, %s)
ON CONFLICT (source_key) DO UPDATE SET
  data_payload = EXCLUDED.data_payload,
  status_payload = EXCLUDED.status_payload,
  data_sha256 = EXCLUDED.data_sha256,
  status_sha256 = EXCLUDED.status_sha256,
  checked_at = EXCLUDED.checked_at,
  persisted_at = now()
WHERE EXCLUDED.checked_at > regional_collector_snapshots.checked_at
RETURNING source_key, checked_at, data_sha256, status_sha256
"""

READ_SQL = """
SELECT source_key, checked_at, data_sha256, status_sha256
FROM public.regional_collector_snapshots WHERE source_key = %s
"""


# Full-payload readback is required before a snapshot may be marked mirrored.
# Verifying only stored digest columns would trust those columns even if the
# JSONB data had been altered independently.
READBACK_SQL = """
SELECT source_key, checked_at, data_sha256, status_sha256,
       data_payload, status_payload
FROM public.regional_collector_snapshots
WHERE source_key = %s
"""

@dataclass(frozen=True)
class Snapshot:
    source_key: str
    data: object
    status: dict
    checked_at: datetime
    data_sha256: str
    status_sha256: str
    data_bytes: int
    status_bytes: int


def _normalize_integral_json_floats(value: object) -> object:
    """Align integer-valued JSON numbers with JS JSON.stringify canonical form.

    Our existing JavaScript-based backfill represented 47.0 as 47, while
    Python's json.dumps writes 47.0. Both are the same JSON number.
    """
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, list):
        return [_normalize_integral_json_floats(x) for x in value]
    if isinstance(value, dict):
        return {k: _normalize_integral_json_floats(v) for k, v in value.items()}
    return value


def canonical_bytes(obj: object) -> bytes:
    return json.dumps(
        _normalize_integral_json_floats(obj),
        ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False
    ).encode("utf-8")


def canonical_hash(obj: object) -> str:
    return sha256(canonical_bytes(obj)).hexdigest()


def _load_json(file: Path) -> tuple[object, int]:
    try:
        size = file.stat().st_size
    except FileNotFoundError as e:
        raise ValueError(f"missing collector file: {file.name}") from e
    if size > MAX_DOC_BYTES:
        raise ValueError(f"collector document exceeds cap: {file.name}")
    try:
        raw = file.read_bytes()
        if len(raw) > MAX_DOC_BYTES:
            raise ValueError(f"collector document exceeds cap: {file.name}")
        obj = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise ValueError(f"invalid JSON: {file.name}") from e
    if isinstance(obj, bool) or obj is None or not isinstance(obj, (dict, list)):
        raise ValueError(f"invalid JSON document kind: {file.name}")
    if len(canonical_bytes(obj)) > MAX_DOC_BYTES:
        raise ValueError(f"collector document exceeds cap after normalization: {file.name}")
    return obj, size


def _utc_timestamp(value: object) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("missing checked_at/generated_at")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as e:
        raise ValueError("invalid checked_at timestamp") from e
    if parsed.tzinfo is None:
        raise ValueError("checked_at must include timezone")
    return parsed.astimezone(timezone.utc)


def load_snapshot(
    source_key: str, root: Path | str | None = None,
    *, now: datetime | None = None
) -> Snapshot:
    if source_key not in SOURCE_FILES:
        raise ValueError("unknown collector source_key")
    root = Path(root) if root is not None else Path(__file__).resolve().parents[1]
    data_file, status_file = SOURCE_FILES[source_key]
    data, data_bytes = _load_json(root / "data" / data_file)
    if status_file is None:
        if not isinstance(data, dict):
            raise ValueError("translation mirror must be an object")
        status = {
            "state": "ok", "checked_at": data.get("generated_at"),
            "source": "news_localization",
        }
        status_bytes = len(canonical_bytes(status))
    else:
        status, status_bytes = _load_json(root / "data" / status_file)
    if not isinstance(status, dict):
        raise ValueError("collector status must be an object")
    if status.get("state") not in VALID_STATES:
        raise ValueError("invalid collector status state")
    checked_at = _utc_timestamp(status.get("checked_at"))
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("comparison now must include timezone")
    if checked_at > now.astimezone(timezone.utc) + MAX_FUTURE_SKEW:
        raise ValueError("future checked_at timestamp")
    return Snapshot(
        source_key=source_key,
        data=data,
        status=status,
        checked_at=checked_at,
        data_sha256=canonical_hash(data),
        status_sha256=canonical_hash(status),
        data_bytes=data_bytes,
        status_bytes=status_bytes,
    )


def decide_update(
    old_checked_at: datetime | None,
    old_data_sha256: str | None,
    old_status_sha256: str | None,
    new_checked_at: datetime,
    new_data_sha256: str,
    new_status_sha256: str,
) -> str:
    if old_checked_at is None:
        return "written"
    if new_checked_at > old_checked_at:
        return "written"
    if new_checked_at < old_checked_at:
        return "stale"
    if old_data_sha256 == new_data_sha256 and old_status_sha256 == new_status_sha256:
        return "unchanged"
    return "conflict"


def inspect_snapshot(snapshot: Snapshot, stored: dict | None) -> dict:
    stored = stored or {}
    fields = {
        "source_key": snapshot.source_key,
        "checked_at": snapshot.checked_at,
        "data_sha256": snapshot.data_sha256,
        "status_sha256": snapshot.status_sha256,
    }
    match = all(stored.get(key) == val for key, val in fields.items())
    return {
        "source": snapshot.source_key,
        "match": match,
        "checked_at": snapshot.checked_at.isoformat(),
        "data_sha256": snapshot.data_sha256,
        "status_sha256": snapshot.status_sha256,
    }


def validate_stored_row(row: object) -> Snapshot:
    """Decode one actual Postgres JSONB row, checking its content and metadata."""
    fields = ("source_key", "checked_at", "data_sha256", "status_sha256",
              "data_payload", "status_payload")
    if isinstance(row, dict):
        values = row
    elif isinstance(row, (tuple, list)) and len(row) == len(fields):
        values = dict(zip(fields, row))
    else:
        raise ValueError("invalid stored snapshot shape")
    source = values.get("source_key")
    if source not in SOURCE_FILES:
        raise ValueError("unknown collector in stored snapshot")
    data = values.get("data_payload")
    status = values.get("status_payload")
    if not isinstance(data, (dict, list)) or not isinstance(status, dict):
        raise ValueError("invalid stored JSONB payload kind")
    data_bytes = canonical_bytes(data)
    status_bytes = canonical_bytes(status)
    if len(data_bytes) > MAX_DOC_BYTES or len(status_bytes) > MAX_DOC_BYTES:
        raise ValueError("stored snapshot exceeds cap")
    if status.get("state") not in VALID_STATES:
        raise ValueError("invalid stored status state")
    status_time = _utc_timestamp(status.get("checked_at"))
    checked = values.get("checked_at")
    if isinstance(checked, str):
        checked = _utc_timestamp(checked)
    if not isinstance(checked, datetime) or checked.tzinfo is None:
        raise ValueError("stored timestamp missing timezone")
    checked = checked.astimezone(timezone.utc)
    if checked != status_time:
        raise ValueError("stored timestamp conflicts with status.checked_at")
    data_sha = canonical_hash(data)
    status_sha = canonical_hash(status)
    if data_sha != str(values.get("data_sha256", "")).strip() or \
       status_sha != str(values.get("status_sha256", "")).strip():
        raise ValueError("stored JSONB digest mismatch")
    return Snapshot(source, data, status, checked, data_sha, status_sha,
                    len(data_bytes), len(status_bytes))


def _row_dict(row: object) -> dict | None:
    if row is None:
        return None
    if isinstance(row, dict):
        return row
    return dict(zip(("source_key", "checked_at", "data_sha256", "status_sha256"), row))


def publish_snapshot(connection, snapshot: Snapshot) -> str:
    """Atomic time-guarded UPSERT; transaction commit is owned by caller.

    Newer-only update is a single SQL command. A delayed collector cannot
    overwrite another process. Equal-timestamp divergent payloads are errors.
    """
    cursor = connection.execute(UPSERT_SQL, (
        snapshot.source_key,
        canonical_bytes(snapshot.data).decode("utf8"),
        canonical_bytes(snapshot.status).decode("utf8"),
        snapshot.data_sha256,
        snapshot.status_sha256,
        snapshot.checked_at,
    ))
    row = cursor.fetchone()
    if row is not None:
        return "written"
    stored = _row_dict(connection.execute(READ_SQL, (snapshot.source_key,)).fetchone())
    if stored is None:
        raise RuntimeError("concurrent snapshot disappeared")
    result = decide_update(
        stored["checked_at"], stored["data_sha256"], stored["status_sha256"],
        snapshot.checked_at, snapshot.data_sha256, snapshot.status_sha256,
    )
    if result == "written":
        raise RuntimeError("concurrent snapshot state changed; retry")
    return result


def read_stored_snapshot(connection, source_key: str) -> Snapshot | None:
    """Read a complete trusted Neon snapshot, or None when not yet mirrored.

    Never treat a missing row as an empty but successfully checked source.
    """
    if source_key not in SOURCE_FILES:
        raise ValueError("unknown collector source_key")
    row = connection.execute(READBACK_SQL, (source_key,)).fetchone()
    return None if row is None else validate_stored_row(row)


def verify_snapshot(connection, snapshot: Snapshot) -> dict:
    stored = read_stored_snapshot(connection, snapshot.source_key)
    if stored is None:
        return inspect_snapshot(snapshot, None)
    return inspect_snapshot(snapshot, {
        "source_key": stored.source_key,
        "checked_at": stored.checked_at,
        "data_sha256": stored.data_sha256,
        "status_sha256": stored.status_sha256,
    })
