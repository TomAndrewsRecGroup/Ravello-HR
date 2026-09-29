-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 4, Group 14 security review fix (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- Found by the Phase 4 adversarial security review (Medium): a person
-- could issue a permit naming THEMSELVES as `authorised_person_id`.
-- `isolations_lifecycle_guard()` and `isolation_locks_guard()` (153)
-- both enforce "nobody approves their own work" — the same posture
-- Phase 2's document/incident guards already established across this
-- codebase — but `permits_lifecycle_guard()` (152) never checked it:
-- it verified the authorising person HOLDS the required authorisation,
-- but never that they are not the same person doing the issuing.
--
-- Reproduced live before this fix: a permit template with no required
-- authorisation, `authorised_person_id` set to a `people` row whose
-- `user_id` matched the acting session's `auth.uid()`, issued cleanly
-- with no exception.
--
-- The check only fires when the acting session IS linked to a `people`
-- row (`people.user_id = auth.uid()`) — a staff member issuing a
-- permit on behalf of a contractor from the admin app, with no `people`
-- row of their own, is unaffected; the rule only ever blocks a person
-- from naming THEMSELVES, never blocks staff administering the record.
--
-- Idempotent. Safe to re-run — re-creates permits_lifecycle_guard()
-- with every existing branch unchanged, plus the one new check.

CREATE OR REPLACE FUNCTION public.permits_lifecycle_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  tmpl record;
  bad_person uuid;
  hours integer;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'issued' AND OLD.status IN ('draft', 'suspended') THEN
      -- Live re-check, every time — a suspension may have existed for
      -- exactly the reason this check would catch, so revalidation runs
      -- the identical checks as a first issue, never a bare flag flip.
      IF NEW.asset_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.hs_equipment WHERE id = NEW.asset_id AND status = 'quarantined') THEN
          RAISE EXCEPTION 'This asset is quarantined and cannot be covered by an issued permit' USING ERRCODE = '23514';
        END IF;
      END IF;

      -- Nobody approves their own work: the person issuing this permit
      -- may not also be the person named as authorising it. Only fires
      -- when the acting session is itself linked to a people row —
      -- staff administering the record on a contractor's behalf are
      -- never blocked by this.
      IF NEW.authorised_person_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.people WHERE id = NEW.authorised_person_id AND user_id = auth.uid()) THEN
        RAISE EXCEPTION 'The person issuing this permit cannot also be the authorising person' USING ERRCODE = '23514';
      END IF;

      SELECT required_authorisation_type_id INTO tmpl FROM public.permit_templates WHERE id = NEW.template_id;
      IF tmpl.required_authorisation_type_id IS NOT NULL THEN
        IF NEW.authorised_person_id IS NULL
           OR NOT public.person_holds_authorisation(NEW.authorised_person_id, tmpl.required_authorisation_type_id, NEW.site_id) THEN
          RAISE EXCEPTION 'The authorising person does not hold the required authorisation for this permit type' USING ERRCODE = '23514';
        END IF;
      END IF;

      SELECT pp.person_id INTO bad_person FROM public.permit_people pp
        WHERE pp.permit_id = NEW.id
          AND COALESCE((public.person_deployment_status(pp.person_id, public.workforce_today()) ->> 'status'), 'REVIEW_REQUIRED') <> 'READY'
        LIMIT 1;
      IF bad_person IS NOT NULL THEN
        RAISE EXCEPTION 'A person named on this permit is not currently Safe to Deploy' USING ERRCODE = '23514';
      END IF;

      IF OLD.status = 'draft' THEN
        NEW.issued_by := COALESCE(NEW.issued_by, auth.uid());
        NEW.issued_at := now();
        NEW.valid_from := COALESCE(NEW.valid_from, now());
        IF NEW.valid_until IS NULL THEN
          SELECT default_validity_hours INTO hours FROM public.permit_templates WHERE id = NEW.template_id;
          NEW.valid_until := NEW.valid_from + make_interval(hours => COALESCE(hours, 8));
        END IF;
      ELSE
        NEW.revalidated_by := COALESCE(NEW.revalidated_by, auth.uid());
        NEW.revalidated_at := now();
        NEW.suspended_at := NULL; NEW.suspended_by := NULL; NEW.suspended_reason := NULL;
      END IF;

    ELSIF NEW.status = 'suspended' AND OLD.status = 'issued' THEN
      IF length(btrim(COALESCE(NEW.suspended_reason, ''))) = 0 THEN
        RAISE EXCEPTION 'Say why the permit is being suspended' USING ERRCODE = '23514';
      END IF;
      NEW.suspended_by := COALESCE(NEW.suspended_by, auth.uid());
      NEW.suspended_at := now();

    ELSIF NEW.status = 'closed' AND OLD.status IN ('issued', 'suspended') THEN
      IF length(btrim(COALESCE(NEW.closeout_notes, ''))) = 0 THEN
        RAISE EXCEPTION 'Add closeout notes before closing a permit' USING ERRCODE = '23514';
      END IF;
      NEW.closed_by := COALESCE(NEW.closed_by, auth.uid());
      NEW.closed_at := now();

    ELSIF NEW.status = 'revoked' AND OLD.status <> 'closed' AND OLD.status <> 'revoked' THEN
      IF length(btrim(COALESCE(NEW.revoked_reason, ''))) = 0 THEN
        RAISE EXCEPTION 'Say why the permit is being revoked' USING ERRCODE = '23514';
      END IF;
      NEW.revoked_by := COALESCE(NEW.revoked_by, auth.uid());
      NEW.revoked_at := now();

    ELSE
      RAISE EXCEPTION 'Cannot move a permit from % to %', OLD.status, NEW.status USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.permits_lifecycle_guard() FROM PUBLIC, anon, authenticated;
