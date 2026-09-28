-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 4, Group 10: isolation / lockout-tag-out (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- An isolation de-energises ONE energy source on an asset (electrical,
-- mechanical, hydraulic, pneumatic, thermal, chemical, other) so work
-- can be done safely. `isolation_locks` is the GROUP/multi-lock layer:
-- a single job may need several workers each applying their own
-- personal lock to the same isolation point, and the asset may not be
-- re-energised until every one of those locks is cleared by its own
-- owner — never by whoever happens to be doing the paperwork.
--
-- Optionally linked to a `permits` row (a permit to work often requires
-- an isolation first), but an isolation can equally stand alone —
-- `permit_id` is nullable, not a hard dependency.
--
-- VERIFICATION BY ANOTHER PERSON is a hard rule, twice over — the same
-- "nobody approves their own work" posture this file already applies
-- everywhere else (Phase 2's hs_doc_guard, incident/investigation
-- guards): the person who VERIFIES an isolation is effective must not
-- be the person who APPLIED it, and the person who VERIFIES it is safe
-- to remove must not be the person who REMOVED it. Both are enforced by
-- trigger, not by the UI.
--
-- Lifecycle is applied -> verified -> removed, enforced by
-- isolations_lifecycle_guard() (BEFORE UPDATE): work may not even be
-- confirmed isolated until a second person verifies it, and the
-- isolation cannot be marked removed until EVERY personal lock on it
-- has been cleared by its own owner (or a supervised override) AND a
-- second person verifies the removal itself is safe.
--
-- ASSET AVAILABILITY: applying an isolation moves the asset to
-- 'out_of_service' (never 'quarantined' — that status is reserved for
-- a Group-4 safety DEFECT, a different concern with a different
-- meaning; isolation is a planned, controlled unavailability). Removing
-- the LAST open isolation on an asset restores it to 'in_service' —
-- but only from 'out_of_service': a 'quarantined' or 'decommissioned'
-- asset is never silently reopened by an isolation being cleared.
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.isolations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  asset_id              uuid NOT NULL REFERENCES public.hs_equipment(id) ON DELETE RESTRICT,
  permit_id             uuid REFERENCES public.permits(id) ON DELETE SET NULL,
  isolation_type        text NOT NULL CHECK (isolation_type IN ('electrical', 'mechanical', 'hydraulic', 'pneumatic', 'thermal', 'chemical', 'other')),
  description           text CHECK (length(description) <= 2000),
  status                text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'verified', 'removed')),
  applied_by            uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  applied_at            timestamptz NOT NULL DEFAULT now(),
  verified_by           uuid REFERENCES public.people(id) ON DELETE SET NULL,
  verified_at           timestamptz,
  removed_by            uuid REFERENCES public.people(id) ON DELETE SET NULL,
  removed_at            timestamptz,
  removal_verified_by   uuid REFERENCES public.people(id) ON DELETE SET NULL,
  removal_verified_at   timestamptz,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS isolations_company_status_idx ON public.isolations (company_id, status);
CREATE INDEX IF NOT EXISTS isolations_asset_idx ON public.isolations (asset_id);
CREATE INDEX IF NOT EXISTS isolations_permit_idx ON public.isolations (permit_id) WHERE permit_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.isolations_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS isolations_touch ON public.isolations;
CREATE TRIGGER isolations_touch BEFORE UPDATE ON public.isolations
  FOR EACH ROW EXECUTE FUNCTION public.isolations_touch();

CREATE OR REPLACE FUNCTION public.isolations_org_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.assert_same_org(NEW.company_id, 'hs_equipment', NEW.asset_id);
  PERFORM public.assert_same_org(NEW.company_id, 'permits', NEW.permit_id);
  PERFORM public.assert_same_org(NEW.company_id, 'people', NEW.applied_by);
  PERFORM public.assert_same_org(NEW.company_id, 'people', NEW.verified_by);
  PERFORM public.assert_same_org(NEW.company_id, 'people', NEW.removed_by);
  PERFORM public.assert_same_org(NEW.company_id, 'people', NEW.removal_verified_by);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.isolations_org_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS isolations_org_guard ON public.isolations;
CREATE TRIGGER isolations_org_guard BEFORE INSERT OR UPDATE ON public.isolations
  FOR EACH ROW EXECUTE FUNCTION public.isolations_org_guard();

-- ── the group/multi-lock layer: one row per worker's own personal lock
--    on an isolation point ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.isolation_locks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isolation_id          uuid NOT NULL REFERENCES public.isolations(id) ON DELETE CASCADE,
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id             uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  lock_number           text CHECK (length(lock_number) <= 100),
  applied_at            timestamptz NOT NULL DEFAULT now(),
  removed_at            timestamptz,
  removed_by            uuid REFERENCES public.people(id) ON DELETE SET NULL,
  -- A lock is normally removed by its own owner. Removing someone
  -- else's lock (they are off site, unreachable, etc.) is a real LOTO
  -- scenario, but only ever under a recorded, authorised override —
  -- never silently, and never self-authorised.
  override_reason       text CHECK (length(override_reason) <= 2000),
  override_authorised_by uuid REFERENCES public.people(id) ON DELETE SET NULL,
  UNIQUE (isolation_id, person_id)
);
CREATE INDEX IF NOT EXISTS isolation_locks_isolation_idx ON public.isolation_locks (isolation_id);

CREATE OR REPLACE FUNCTION public.isolation_locks_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  iso record;
  removal_is_new boolean;
BEGIN
  SELECT company_id, status INTO iso FROM public.isolations WHERE id = NEW.isolation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Isolation not found' USING ERRCODE = '23503';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF iso.status = 'removed' THEN
      RAISE EXCEPTION 'This isolation has already been removed — locks cannot be added to it' USING ERRCODE = '23514';
    END IF;
    NEW.company_id := iso.company_id;
    PERFORM public.assert_same_org(iso.company_id, 'people', NEW.person_id);
    removal_is_new := NEW.removed_at IS NOT NULL;
  ELSE
    removal_is_new := NEW.removed_at IS NOT NULL AND OLD.removed_at IS NULL;
  END IF;

  IF removal_is_new THEN
    IF NEW.removed_by IS NULL THEN
      RAISE EXCEPTION 'Say who removed this lock' USING ERRCODE = '23514';
    END IF;
    IF NEW.removed_by IS DISTINCT FROM NEW.person_id THEN
      -- Someone other than the lock's owner is removing it: this is
      -- ONLY ever allowed with a recorded, authorised override, and the
      -- authoriser cannot be the same person doing the removing.
      IF NEW.override_authorised_by IS NULL OR length(btrim(COALESCE(NEW.override_reason, ''))) = 0 THEN
        RAISE EXCEPTION 'Removing another person''s lock needs a reason and an authorising person' USING ERRCODE = '23514';
      END IF;
      IF NEW.override_authorised_by = NEW.removed_by THEN
        RAISE EXCEPTION 'The person removing the lock cannot also authorise their own override' USING ERRCODE = '23514';
      END IF;
      PERFORM public.assert_same_org(NEW.company_id, 'people', NEW.override_authorised_by);
    END IF;
    PERFORM public.assert_same_org(NEW.company_id, 'people', NEW.removed_by);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.isolation_locks_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS isolation_locks_guard ON public.isolation_locks;
CREATE TRIGGER isolation_locks_guard BEFORE INSERT OR UPDATE ON public.isolation_locks
  FOR EACH ROW EXECUTE FUNCTION public.isolation_locks_guard();

-- ── the lifecycle guard: applied -> verified -> removed, with the
--    every-lock-cleared check gating the final step ───────────────────

CREATE OR REPLACE FUNCTION public.isolations_lifecycle_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE open_locks integer;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'verified' AND OLD.status = 'applied' THEN
      IF NEW.verified_by IS NULL THEN
        RAISE EXCEPTION 'Say who verified the isolation' USING ERRCODE = '23514';
      END IF;
      IF NEW.verified_by = NEW.applied_by THEN
        RAISE EXCEPTION 'The person who applied the isolation cannot also verify it' USING ERRCODE = '23514';
      END IF;
      NEW.verified_at := COALESCE(NEW.verified_at, now());

    ELSIF NEW.status = 'removed' AND OLD.status = 'verified' THEN
      SELECT count(*) INTO open_locks FROM public.isolation_locks
        WHERE isolation_id = NEW.id AND removed_at IS NULL;
      IF open_locks > 0 THEN
        RAISE EXCEPTION 'Every personal lock must be removed by its own owner (or an authorised override) before the isolation can be removed' USING ERRCODE = '23514';
      END IF;
      IF NEW.removed_by IS NULL THEN
        RAISE EXCEPTION 'Say who removed the isolation' USING ERRCODE = '23514';
      END IF;
      IF NEW.removal_verified_by IS NULL THEN
        RAISE EXCEPTION 'Say who verified it was safe to remove the isolation' USING ERRCODE = '23514';
      END IF;
      IF NEW.removal_verified_by = NEW.removed_by THEN
        RAISE EXCEPTION 'The person who removed the isolation cannot also verify the removal' USING ERRCODE = '23514';
      END IF;
      NEW.removed_at := COALESCE(NEW.removed_at, now());
      NEW.removal_verified_at := COALESCE(NEW.removal_verified_at, now());

    ELSE
      RAISE EXCEPTION 'Cannot move an isolation from % to %', OLD.status, NEW.status USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.isolations_lifecycle_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS isolations_lifecycle_guard ON public.isolations;
CREATE TRIGGER isolations_lifecycle_guard BEFORE UPDATE ON public.isolations
  FOR EACH ROW EXECUTE FUNCTION public.isolations_lifecycle_guard();

-- ── asset availability: out_of_service while any isolation is open,
--    restored to in_service once the LAST one clears — never touching
--    a 'quarantined' or 'decommissioned' asset ────────────────────────

CREATE OR REPLACE FUNCTION public.isolations_asset_availability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE still_open integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.hs_equipment SET status = 'out_of_service'
      WHERE id = NEW.asset_id AND status = 'in_service';
    RETURN NEW;
  END IF;

  IF NEW.status = 'removed' AND OLD.status IS DISTINCT FROM 'removed' THEN
    SELECT count(*) INTO still_open FROM public.isolations
      WHERE asset_id = NEW.asset_id AND status <> 'removed' AND id <> NEW.id;
    IF still_open = 0 THEN
      UPDATE public.hs_equipment SET status = 'in_service'
        WHERE id = NEW.asset_id AND status = 'out_of_service';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.isolations_asset_availability() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS isolations_asset_availability ON public.isolations;
CREATE TRIGGER isolations_asset_availability AFTER INSERT OR UPDATE ON public.isolations
  FOR EACH ROW EXECUTE FUNCTION public.isolations_asset_availability();

-- ── outbox ─────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS isolations_platform_event ON public.isolations;
CREATE TRIGGER isolations_platform_event AFTER INSERT OR UPDATE ON public.isolations
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('asset_id', 'permit_id', 'isolation_type', 'status');

-- ── generic audit trail ────────────────────────────────────────────

DROP TRIGGER IF EXISTS isolations_audit ON public.isolations;
CREATE TRIGGER isolations_audit AFTER INSERT OR UPDATE OR DELETE ON public.isolations
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('isolation', 'company_id', 'asset_id', 'permit_id', 'isolation_type', 'status');

-- ── write guards ───────────────────────────────────────────────────

SELECT public.apply_write_guard('public.isolations');
SELECT public.apply_write_guard('public.isolation_locks');

-- ── RLS: same 'contractors.manage' capability every other Phase 4
--    site-safety-records table reuses — see 152's own header comment.

ALTER TABLE public.isolations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.isolation_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS isolations_staff_all ON public.isolations;
CREATE POLICY isolations_staff_all ON public.isolations FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS isolations_manage ON public.isolations;
CREATE POLICY isolations_manage ON public.isolations FOR ALL TO authenticated
  USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), 'contractors.manage')))
  WITH CHECK (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), 'contractors.manage')));

DROP POLICY IF EXISTS isolation_locks_staff_all ON public.isolation_locks;
CREATE POLICY isolation_locks_staff_all ON public.isolation_locks FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS isolation_locks_manage ON public.isolation_locks;
CREATE POLICY isolation_locks_manage ON public.isolation_locks FOR ALL TO authenticated
  USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), 'contractors.manage')))
  WITH CHECK (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), 'contractors.manage')));
