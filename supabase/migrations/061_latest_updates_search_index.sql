-- Phase 61: GIN tsvector index on latest_updates for /latest-updates keyword filter.
-- The current `ilike '%X%'` query path does a sequential scan; with the table
-- approaching 50K+ rows this becomes too slow. A GIN index on a tsvector of
-- (title || ' ' || description) lets the search use full-text matching with
-- to_tsquery / plainto_tsquery and stay fast.

CREATE INDEX IF NOT EXISTS latest_updates_search_idx
  ON latest_updates
  USING GIN (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '')));
