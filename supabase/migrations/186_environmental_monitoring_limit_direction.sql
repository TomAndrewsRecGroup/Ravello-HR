-- ═══════════════════════════════════════════════════════════════════
-- 186: environmental_monitoring gains lower-bound and range-bound
-- limit evaluation (Core-OS 360 Completion Programme, Phase 22,
-- closes C5.3)
-- ═══════════════════════════════════════════════════════════════════
--
-- 157's own header comment already flagged this, explicitly, as a
-- known, documented simplification: "the comparison direction (value
-- <= limit = 'within') assumes an UPPER-bound limit... a lower-bound
-- limit (e.g. minimum flow rate) is a known, documented simplification
-- for a later group, not silently guessed at."
--
-- Never a guessed default. `limit_direction` is a real, human-set
-- vocabulary (`upper | lower | range`), defaulting to `upper` — the
-- exact behaviour every existing row already has, so backfilling this
-- column changes NOTHING about what any existing row's `within_limit`
-- evaluates to.
--
-- `recorded_limit` keeps its existing meaning for `upper` and gains
-- the symmetric meaning "minimum allowed value" for `lower`. A genuine
-- RANGE needs a second bound, `recorded_limit_upper` — nullable, used
-- only when `limit_direction = 'range'`. Both bounds must be on file
-- for a range reading to evaluate; one alone is `within_limit = NULL`
-- ("no limit on file" is a real, honest state this table already
-- distinguishes from a limit that IS on file and was met — see 157's
-- own "never defaulted true or false" rule, unchanged here).
--
-- Postgres cannot ALTER a GENERATED column's expression in place —
-- the column is dropped and re-added. Recomputes every existing row,
-- but the `upper` branch is byte-identical to the original expression,
-- so no existing row's stored value changes.

ALTER TABLE public.environmental_monitoring
  ADD COLUMN IF NOT EXISTS limit_direction text NOT NULL DEFAULT 'upper'
    CHECK (limit_direction IN ('upper', 'lower', 'range')),
  ADD COLUMN IF NOT EXISTS recorded_limit_upper numeric;

ALTER TABLE public.environmental_monitoring DROP COLUMN IF EXISTS within_limit;
ALTER TABLE public.environmental_monitoring ADD COLUMN within_limit boolean GENERATED ALWAYS AS (
  CASE
    WHEN limit_direction = 'upper' THEN
      CASE WHEN recorded_limit IS NULL THEN NULL ELSE (value <= recorded_limit) END
    WHEN limit_direction = 'lower' THEN
      CASE WHEN recorded_limit IS NULL THEN NULL ELSE (value >= recorded_limit) END
    WHEN limit_direction = 'range' THEN
      CASE WHEN recorded_limit IS NULL OR recorded_limit_upper IS NULL THEN NULL
           ELSE (value >= recorded_limit AND value <= recorded_limit_upper) END
    ELSE NULL
  END
) STORED;

-- A range needs its upper bound to be the larger of the two — refused
-- at insert time rather than silently evaluating a reading against an
-- inverted (and therefore permanently unsatisfiable) range.
CREATE OR REPLACE FUNCTION public.environmental_monitoring_range_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.limit_direction = 'range' AND NEW.recorded_limit IS NOT NULL AND NEW.recorded_limit_upper IS NOT NULL
     AND NEW.recorded_limit_upper < NEW.recorded_limit THEN
    RAISE EXCEPTION 'The upper bound of a range must not be less than the lower bound' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.environmental_monitoring_range_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS environmental_monitoring_range_guard ON public.environmental_monitoring;
CREATE TRIGGER environmental_monitoring_range_guard BEFORE INSERT ON public.environmental_monitoring
  FOR EACH ROW EXECUTE FUNCTION public.environmental_monitoring_range_guard();

-- Re-created (not just redefined) audit/outbox triggers to widen their
-- column whitelists to the two new classifying columns — never a free
-- text field, the same discipline every other whitelist in this file
-- already follows. "Latest definition wins": migration 186 added to
-- platformEventsSql.test.ts's own LATER list for this table.
DROP TRIGGER IF EXISTS environmental_monitoring_audit ON public.environmental_monitoring;
CREATE TRIGGER environmental_monitoring_audit AFTER INSERT ON public.environmental_monitoring
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('environmental_monitoring', 'company_id', 'category', 'parameter', 'limit_direction', 'within_limit');

DROP TRIGGER IF EXISTS environmental_monitoring_platform_event ON public.environmental_monitoring;
CREATE TRIGGER environmental_monitoring_platform_event AFTER INSERT ON public.environmental_monitoring
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('site_id', 'category', 'parameter', 'limit_direction', 'recorded_limit', 'recorded_limit_upper', 'within_limit');
