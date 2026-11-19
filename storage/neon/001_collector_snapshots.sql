-- Regional Watch Free Neon: one atomic pair of public collector JSON files per source.
-- Deliberately additive. Never remove GitHub collection fallback before read parity.
CREATE TABLE IF NOT EXISTS public.regional_collector_snapshots (
    source_key TEXT PRIMARY KEY,
    data_payload JSONB NOT NULL,
    status_payload JSONB NOT NULL,
    data_sha256 CHAR(64) NOT NULL,
    status_sha256 CHAR(64) NOT NULL,
    checked_at TIMESTAMPTZ NOT NULL,
    persisted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT rw_source_key CHECK (source_key IN (
        'analysts','centcom','copernicus','gdelt',
        'marad','satellite','unosat','news_translation',
        'adsb','adsb_mil'
    )),
    CONSTRAINT rw_payload_object CHECK (jsonb_typeof(data_payload) IN ('object','array')),
    CONSTRAINT rw_status_object CHECK (jsonb_typeof(status_payload) = 'object'),
    CONSTRAINT rw_data_digest CHECK (data_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT rw_status_digest CHECK (status_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS regional_collector_snapshots_checked_idx
    ON public.regional_collector_snapshots (checked_at DESC);
