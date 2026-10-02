-- ═══════════════════════════════════════════════════════════════════
-- 208: compliance_twin_thresholds gains a client-read policy (go-live
-- gap list, item 7, 2026-10-02)
-- ═══════════════════════════════════════════════════════════════════
--
-- 189 (Phase 23 Group 5) gave `compliance_twin_thresholds` staff-ONLY
-- RLS, deliberately: deciding a client's own red/amber/green bands is
-- not something a client writes for themselves, the standing "nothing
-- here is self-certified" posture every H&S register table already
-- takes. That part is correct and unchanged.
--
-- What was never built, and was recorded at the time as "an accepted,
-- documented consequence of this scope, not an oversight": the portal
-- side never READ this table at all, so a client whose admin set a
-- threshold override for them saw the plain documented defaults on
-- every Digital-Twin-descended page regardless — an admin/portal
-- reporting asymmetry. Closed now: a client may SELECT their own
-- company's threshold row (never write it — there is still no client
-- INSERT/UPDATE/DELETE policy on this table, and 189's write guard was
-- never built for it either, since there is still nothing client-
-- writable here to guard).
--
-- Mirrors `board_assurance_reports_client_read`'s own shape exactly
-- (company scope + `risk.read`, the broadest existing "may see the
-- register/compliance posture" capability every Phase 5+ client-read
-- policy on a staff-authored table already reuses) rather than
-- inventing a new capability for one more config table.

CREATE POLICY compliance_twin_thresholds_client_read ON public.compliance_twin_thresholds
  FOR SELECT TO authenticated
  USING (company_id = public.my_company_id() AND public.has_capability(public.my_company_id(), 'risk.read'));
