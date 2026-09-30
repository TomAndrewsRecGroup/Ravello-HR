-- Core-OS 360 Completion Programme, Phase 26, Group 2 (C14.7).
--
-- site_checkins (179) has always been badge-scan-only: the public
-- /api/w/[token]/{checkin,checkout} routes are its ONLY writers, via
-- the service role, with `recorded_via` defaulting to 'qr_scan' and a
-- CHECK constraint (site_checkins_recorded_via_check) that refuses
-- anything else. The on-site roster page's own header comment already
-- flagged this: "there is no manual check-in/out control here,
-- deliberately (the plan doc's own flagged debt)." A worker with no
-- badge, a lost badge, or a site running a staffed kiosk has no way
-- onto the roster at all. This closes that gap with an EXPLICIT site
-- selection (the gap-ledger's own wording), never a guessed default.
--
-- Read live before writing a line of this (per this codebase's own
-- "repository reality beats handover narrative" rule): the table has
-- no RLS INSERT/UPDATE policy for `authenticated` at all today (only
-- `site_checkins_staff_all` FOR ALL staff-only and
-- `site_checkins_client_read` FOR SELECT client-read-only), and no
-- column-restriction guard of any kind — unlike most other
-- session-writable tables in later Core-OS 360 phases, which all
-- carry the established allow-list discipline the 088/093 `profiles`
-- guards set (see CLAUDE.md's "The second security review" section).
--
-- `recorded_via` widens from a single-value CHECK to a two-value one
-- ('qr_scan' | 'manual') so a manual row is honestly labelled, never
-- passed off as a badge scan it never was.

ALTER TABLE public.site_checkins DROP CONSTRAINT site_checkins_recorded_via_check;
ALTER TABLE public.site_checkins ADD CONSTRAINT site_checkins_recorded_via_check
  CHECK (recorded_via IN ('qr_scan', 'manual'));

-- A client session may only ever create a 'manual' row for their own
-- company, and only while holding workforce.manage (the same
-- capability every other workforce-record writer in this app already
-- gates on). `site_checkins_fill()` (179) is unchanged and still
-- derives `company_id` from `person_id` and checks `site_id` belongs
-- to the same organisation — this policy is an ADDITIONAL gate, not a
-- replacement for that trigger's own cross-organisation check.
CREATE POLICY site_checkins_client_manual_insert ON public.site_checkins
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT public.my_company_id())
    AND (SELECT public.has_capability((SELECT public.my_company_id()), 'workforce.manage'))
    AND recorded_via = 'manual'
  );

-- Deliberately NOT restricted to recorded_via = 'manual' on the read
-- side of this policy: a manager with workforce.manage may complete a
-- checkout for a worker who originally self-scanned IN too — the
-- manual/qr_scan distinction only matters for how a row was OPENED,
-- never who may close it.
CREATE POLICY site_checkins_client_manual_update ON public.site_checkins
  FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT public.my_company_id())
    AND (SELECT public.has_capability((SELECT public.my_company_id()), 'workforce.manage'))
  )
  WITH CHECK (
    company_id = (SELECT public.my_company_id())
    AND (SELECT public.has_capability((SELECT public.my_company_id()), 'workforce.manage'))
  );

-- The column-restriction guard the table never had. A non-staff
-- session may only ever change checked_out_at — the exact allow-list
-- shape 123's hazard/RA guards and 088/093's profiles guards already
-- established (`session boolean := current_user IN
-- ('authenticated','anon')`, so a service-role caller — the two
-- public scan routes — is exempt entirely and unaffected by this
-- migration; staff are exempt via is_tps_staff()).
CREATE OR REPLACE FUNCTION public.site_checkins_manual_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE session boolean := current_user IN ('authenticated', 'anon');
BEGIN
  IF session AND NOT public.is_tps_staff() THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.person_id IS DISTINCT FROM OLD.person_id
       OR NEW.site_id IS DISTINCT FROM OLD.site_id
       OR NEW.checked_in_at IS DISTINCT FROM OLD.checked_in_at
       OR NEW.recorded_via IS DISTINCT FROM OLD.recorded_via
    THEN
      RAISE EXCEPTION 'site_checkins: only checked_out_at may be changed by this session' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS site_checkins_manual_guard ON public.site_checkins;
CREATE TRIGGER site_checkins_manual_guard BEFORE UPDATE ON public.site_checkins
  FOR EACH ROW EXECUTE FUNCTION public.site_checkins_manual_guard();
