-- Regional Watch D1: additive index for bounded, source-specific observation history.
-- Existing observations_time(observed_at) remains for global recent observations.
-- This migration does not alter or delete observations and is safe to reapply.
CREATE INDEX IF NOT EXISTS observations_source_time
  ON observations(source, observed_at DESC);
