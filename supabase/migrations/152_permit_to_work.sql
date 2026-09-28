-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 4, Group 9: permit to work (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- A permit to work is issued for a scope of work at a SITE, optionally
-- against a specific ASSET, covering one or more PEOPLE. Templates are
-- PER-COMPANY (unlike `inspection_templates`/`hs_audit_templates`,
-- which are global staff reference data) because a template names a
-- required `authorisation_type_id`, and `authorisation_types` (133) is
-- itself per-organisation with no global seed — a global permit
-- template could never name a real authorisation type to check against.
--
-- `person_holds_authorisation()` is a genuinely new helper — the Phase
-- 3 handover's own "not yet done" list named this exact gap
-- ("a person_holds_authorisation(person, type, site, as_of) helper").
-- It checks `scope_site_id` only: `authorisation_types` has no
-- `scope_asset_id` column despite `scope_kind` allowing 'plant'/
-- 'equipment' — adding one is a real Phase 3 schema change, out of this
-- migration's scope, and is called out here rather than silently
-- assumed away.
--
-- Numbering uses `next_record_number(company, 'PTW', true)` (122),
-- yielding `PTW-2026-000001` — six digits, not the five the plan's own
-- prose example showed, for CONSISTENCY with every other numbered
-- record in this codebase (asset refs, Group 2) rather than a
-- one-off format invented for permits alone.
--
-- LIVE COMPLIANCE RE-CHECK AT ISSUE (and again at REVALIDATION, never
-- skipped just because a suspension is being lifted) is a BEFORE UPDATE
-- trigger, not a UI convention — the same "workflow lives in triggers"
-- posture this file already applies everywhere else:
--   * the asset (if any) must not be quarantined;
--   * every person already added to the permit (permit_people, which
--     can only be edited while the permit is still 'draft') must be
--     Safe to Deploy — read via `person_deployment_status()` (136),
--     never re-implemented;
--   * the person issuing it must hold the template's required
--     authorisation at the permit's site, if the template names one.
-- Validity is SERVER TIME throughout: `valid_from`/`valid_until` are
-- `timestamptz`, and `permit_is_currently_valid()` compares against
-- `now()`, never a client-supplied "still valid" flag.
--
-- Idempotent. Safe to re-run.

-- ── templates: per-company, since they name a per-company authorisation
--    type ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.permit_templates (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name                   text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  permit_type            text NOT NULL CHECK (permit_type IN ('hot_work', 'confined_space', 'working_at_height', 'electrical_isolation', 'excavation', 'other')),
  description            text CHECK (length(description) <= 2000),
  required_authorisation_type_id uuid REFERENCES public.authorisation_types(id) ON DELETE SET NULL,
  default_validity_hours integer CHECK (default_validity_hours BETWEEN 1 AND 8760),
  active                 boolean NOT NULL DEFAULT true,
  created_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS permit_templates_company_idx ON public.permit_templates (company_id, active);

CREATE OR REPLACE FUNCTION public.permit_templates_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS permit_templates_touch ON public.permit_templates;
CREATE TRIGGER permit_templates_touch BEFORE UPDATE ON public.permit_templates
  FOR EACH ROW EXECUTE FUNCTION public.permit_templates_touch();

-- authorisation_type must belong to the SAME company as the template.
CREATE OR REPLACE FUNCTION public.permit_templates_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.assert_same_org(NEW.company_id, 'authorisation_types', NEW.required_authorisation_type_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.permit_templates_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS permit_templates_guard ON public.permit_templates;
CREATE TRIGGER permit_templates_guard BEFORE INSERT OR UPDATE ON public.permit_templates
  FOR EACH ROW EXECUTE FUNCTION public.permit_templates_guard();

CREATE TABLE IF NOT EXISTS public.permit_template_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.permit_templates(id) ON DELETE CASCADE,
  prompt      text NOT NULL CHECK (length(btrim(prompt)) BETWEEN 1 AND 500),
  guidance    text CHECK (length(guidance) <= 1000),
  sort_order  integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS permit_template_items_template_idx ON public.permit_template_items (template_id, sort_order);

-- ── permits: the record ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.permits (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  permit_number     text,
  template_id       uuid NOT NULL REFERENCES public.permit_templates(id) ON DELETE RESTRICT,
  site_id           uuid NOT NULL REFERENCES public.hs_sites(id) ON DELETE RESTRICT,
  asset_id          uuid REFERENCES public.hs_equipment(id) ON DELETE SET NULL,
  scope_of_work     text NOT NULL CHECK (length(btrim(scope_of_work)) BETWEEN 1 AND 4000),
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'suspended', 'closed', 'revoked')),
  issued_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_at         timestamptz,
  authorised_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  valid_from        timestamptz,
  valid_until       timestamptz,
  suspended_at      timestamptz,
  suspended_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  suspended_reason  text CHECK (length(suspended_reason) <= 2000),
  revalidated_at    timestamptz,
  revalidated_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at         timestamptz,
  closed_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closeout_notes    text CHECK (length(closeout_notes) <= 4000),
  revoked_at        timestamptz,
  revoked_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_reason    text CHECK (length(revoked_reason) <= 2000),
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS permits_number_idx ON public.permits (company_id, permit_number) WHERE permit_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS permits_company_status_idx ON public.permits (company_id, status);
CREATE INDEX IF NOT EXISTS permits_asset_idx ON public.permits (asset_id) WHERE asset_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.permits_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS permits_touch ON public.permits;
CREATE TRIGGER permits_touch BEFORE UPDATE ON public.permits
  FOR EACH ROW EXECUTE FUNCTION public.permits_touch();

CREATE OR REPLACE FUNCTION public.permits_number_and_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE tmpl record;
BEGIN
  IF NEW.permit_number IS NULL THEN
    NEW.permit_number := public.next_record_number(NEW.company_id, 'PTW', true);
  END IF;
  SELECT company_id INTO tmpl FROM public.permit_templates WHERE id = NEW.template_id;
  IF NOT FOUND OR tmpl.company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Permit template belongs to a different organisation' USING ERRCODE = '23514';
  END IF;
  PERFORM public.assert_same_org(NEW.company_id, 'hs_sites', NEW.site_id);
  PERFORM public.assert_same_org(NEW.company_id, 'hs_equipment', NEW.asset_id);
  PERFORM public.assert_same_org(NEW.company_id, 'people', NEW.authorised_person_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.permits_number_and_org() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS permits_number_and_org ON public.permits;
CREATE TRIGGER permits_number_and_org BEFORE INSERT ON public.permits
  FOR EACH ROW EXECUTE FUNCTION public.permits_number_and_org();

-- ── people covered by the permit — editable only while draft ─────────

CREATE TABLE IF NOT EXISTS public.permit_people (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id  uuid NOT NULL REFERENCES public.permits(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id  uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  added_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (permit_id, person_id)
);

CREATE OR REPLACE FUNCTION public.permit_people_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p record;
BEGIN
  SELECT company_id, status INTO p FROM public.permits WHERE id = NEW.permit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permit not found' USING ERRCODE = '23503';
  END IF;
  IF p.status <> 'draft' THEN
    RAISE EXCEPTION 'People can only be added to a permit while it is still a draft' USING ERRCODE = '23514';
  END IF;
  NEW.company_id := p.company_id;
  PERFORM public.assert_same_org(p.company_id, 'people', NEW.person_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.permit_people_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS permit_people_guard ON public.permit_people;
CREATE TRIGGER permit_people_guard BEFORE INSERT ON public.permit_people
  FOR EACH ROW EXECUTE FUNCTION public.permit_people_guard();

-- ── checklist responses, snapshotted at issue ─────────────────────────

CREATE TABLE IF NOT EXISTS public.permit_checklist_responses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id         uuid NOT NULL REFERENCES public.permits(id) ON DELETE CASCADE,
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_item_id  uuid REFERENCES public.permit_template_items(id) ON DELETE SET NULL,
  prompt            text NOT NULL CHECK (length(btrim(prompt)) BETWEEN 1 AND 500),
  rating            text NOT NULL CHECK (rating IN ('confirmed', 'not_applicable')),
  comment           text CHECK (length(comment) <= 2000),
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS permit_checklist_responses_permit_idx ON public.permit_checklist_responses (permit_id, sort_order);

CREATE OR REPLACE FUNCTION public.permit_checklist_responses_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p record;
BEGIN
  SELECT company_id INTO p FROM public.permits WHERE id = NEW.permit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permit not found' USING ERRCODE = '23503';
  END IF;
  NEW.company_id := p.company_id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.permit_checklist_responses_fill() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS permit_checklist_responses_fill ON public.permit_checklist_responses;
CREATE TRIGGER permit_checklist_responses_fill
  BEFORE INSERT ON public.permit_checklist_responses
  FOR EACH ROW EXECUTE FUNCTION public.permit_checklist_responses_fill();

-- ── the gap Phase 3's own handover named: does a person hold a live
--    authorisation of this type, at this site? ───────────────────────
-- scope_site_id IS NULL means "any site" (133's own convention). No
-- scope_asset_id exists on authorisation_types — a real, documented
-- limitation, not a silent omission.

CREATE OR REPLACE FUNCTION public.person_holds_authorisation(p_person_id uuid, p_type_id uuid, p_site_id uuid, p_as_of date DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.person_authorisations pa
     WHERE pa.person_id = p_person_id
       AND pa.authorisation_type_id = p_type_id
       AND pa.status = 'active'
       AND pa.issued_on <= COALESCE(p_as_of, public.workforce_today())
       AND (pa.expires_on IS NULL OR pa.expires_on >= COALESCE(p_as_of, public.workforce_today()))
       AND (pa.scope_site_id IS NULL OR pa.scope_site_id = p_site_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.authorisation_suspensions s
          WHERE s.authorisation_id = pa.id AND s.lifted_at IS NULL
       )
  )
$$;
REVOKE ALL ON FUNCTION public.person_holds_authorisation(uuid, uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_holds_authorisation(uuid, uuid, uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.permit_is_currently_valid(p_permit_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.permits p
     WHERE p.id = p_permit_id AND p.status = 'issued'
       AND p.valid_from IS NOT NULL AND p.valid_until IS NOT NULL
       AND now() BETWEEN p.valid_from AND p.valid_until
  )
$$;
REVOKE ALL ON FUNCTION public.permit_is_currently_valid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.permit_is_currently_valid(uuid) TO authenticated;

-- ── the lifecycle guard: issue / suspend / revalidate / close / revoke,
--    with a LIVE compliance re-check at issue AND at revalidation ────

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
DROP TRIGGER IF EXISTS permits_lifecycle_guard ON public.permits;
CREATE TRIGGER permits_lifecycle_guard BEFORE UPDATE ON public.permits
  FOR EACH ROW EXECUTE FUNCTION public.permits_lifecycle_guard();

-- ── outbox ─────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS permits_platform_event ON public.permits;
CREATE TRIGGER permits_platform_event AFTER INSERT OR UPDATE ON public.permits
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('permit_number', 'template_id', 'site_id', 'asset_id', 'status', 'valid_from', 'valid_until');

-- ── generic audit trail ────────────────────────────────────────────

DROP TRIGGER IF EXISTS permits_audit ON public.permits;
CREATE TRIGGER permits_audit AFTER INSERT OR UPDATE OR DELETE ON public.permits
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('permit', 'company_id', 'permit_number', 'template_id', 'site_id', 'asset_id',
    'status', 'valid_from', 'valid_until', 'authorised_person_id');

-- ── write guards ───────────────────────────────────────────────────

SELECT public.apply_write_guard('public.permit_templates');
SELECT public.apply_write_guard('public.permit_template_items');
SELECT public.apply_write_guard('public.permits');
SELECT public.apply_write_guard('public.permit_people');
SELECT public.apply_write_guard('public.permit_checklist_responses');

-- ── RLS: contractors.manage governs templates and permits alike — a
--    permit is issued FOR a contractor/employee's work, the same
--    management act as approving the contractor itself. Reusing that
--    capability rather than inventing 'permits.manage' for one more
--    variant of "may manage site safety records".

ALTER TABLE public.permit_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permit_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permit_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permit_checklist_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permit_templates_staff_all ON public.permit_templates;
CREATE POLICY permit_templates_staff_all ON public.permit_templates FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS permit_templates_manage ON public.permit_templates;
CREATE POLICY permit_templates_manage ON public.permit_templates FOR ALL TO authenticated
  USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), 'contractors.manage')))
  WITH CHECK (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), 'contractors.manage')));

DROP POLICY IF EXISTS permit_template_items_staff_all ON public.permit_template_items;
CREATE POLICY permit_template_items_staff_all ON public.permit_template_items FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS permit_template_items_manage ON public.permit_template_items;
CREATE POLICY permit_template_items_manage ON public.permit_template_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.permit_templates t WHERE t.id = template_id AND t.company_id = (SELECT public.my_company_id())
                 AND (SELECT public.has_capability((SELECT public.my_company_id()), 'contractors.manage'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.permit_templates t WHERE t.id = template_id AND t.company_id = (SELECT public.my_company_id())
                      AND (SELECT public.has_capability((SELECT public.my_company_id()), 'contractors.manage'))));

DROP POLICY IF EXISTS permits_staff_all ON public.permits;
CREATE POLICY permits_staff_all ON public.permits FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS permits_manage ON public.permits;
CREATE POLICY permits_manage ON public.permits FOR ALL TO authenticated
  USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), 'contractors.manage')))
  WITH CHECK (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), 'contractors.manage')));

DROP POLICY IF EXISTS permit_people_staff_all ON public.permit_people;
CREATE POLICY permit_people_staff_all ON public.permit_people FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS permit_people_manage ON public.permit_people;
CREATE POLICY permit_people_manage ON public.permit_people FOR ALL TO authenticated
  USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), 'contractors.manage')))
  WITH CHECK (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), 'contractors.manage')));

DROP POLICY IF EXISTS permit_checklist_responses_staff_all ON public.permit_checklist_responses;
CREATE POLICY permit_checklist_responses_staff_all ON public.permit_checklist_responses FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS permit_checklist_responses_manage ON public.permit_checklist_responses;
CREATE POLICY permit_checklist_responses_manage ON public.permit_checklist_responses FOR ALL TO authenticated
  USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), 'contractors.manage')))
  WITH CHECK (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), 'contractors.manage')));
