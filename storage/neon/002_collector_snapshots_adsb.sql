-- Q12 (19.11): ADS-B collected by GitHub Actions (adsb.yml, adsb-mil.yml).
-- Widens the allowed source keys in one atomic statement; rows untouched.
-- Applied to production 19.11. Idempotent.
ALTER TABLE public.regional_collector_snapshots
  DROP CONSTRAINT IF EXISTS rw_source_key,
  ADD CONSTRAINT rw_source_key CHECK (source_key IN (
    'analysts','centcom','copernicus','gdelt',
    'marad','satellite','unosat','news_translation',
    'adsb','adsb_mil'
  ));
