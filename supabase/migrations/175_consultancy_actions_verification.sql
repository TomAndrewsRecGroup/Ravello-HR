-- Core-OS 360 Phase 7, Group 4 (Universal Actions integration; "verify
-- previous actions"). Live inspection before writing this (pg_policy,
-- pg_constraint) found the exact same single-tenant gap Group 3 found
-- in the H&S evidence infrastructure, here in the universal Actions
-- table itself: `actions_org_insert` / `client_actions_select` /
-- `client_actions_update` all gate on `company_id = my_company_id()`
-- — the currently ACTIVE organisation — which a portfolio-wide
-- consultant who never switches into the client can never satisfy.
--
-- Fixed the SAME way: three NEW, narrowly-scoped, ADDITIVE policies
-- (RLS ORs permissive policies), never modifying the three existing
-- ones every other write path in this codebase already relies on.
--
-- No trigger changes needed. `actions_lifecycle()` (its live, latest
-- definition read via pg_get_functiondef before writing this) already
-- lets anyone holding `actions.assign` on the action's own company_id
-- verify, reject, or otherwise progress an action — and the seeded
-- `consultant` role (117) already carries `actions.assign` — so once
-- the RLS gate below opens, a consultant's own capability grant is
-- already everything actions_lifecycle()/actions_party_guard() (126)
-- need to let them act as a genuine, non-self, verifier. "Nobody
-- verifies their own work" is unaffected: NEW.verified_by = NEW.
-- completed_by is still refused by actions_lifecycle() regardless of
-- who is calling.

CREATE POLICY actions_consultancy_select ON public.actions FOR SELECT TO authenticated
  USING ((SELECT public.has_capability(company_id, 'consultancy.service_manage')));

CREATE POLICY actions_consultancy_insert ON public.actions FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_capability(company_id, 'consultancy.service_manage')));

CREATE POLICY actions_consultancy_update ON public.actions FOR UPDATE TO authenticated
  USING ((SELECT public.has_capability(company_id, 'consultancy.service_manage')))
  WITH CHECK ((SELECT public.has_capability(company_id, 'consultancy.service_manage')));
