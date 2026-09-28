-- ═══════════════════════════════════════════════════════════════════
-- 120: actions can be raised by anyone holding actions.assign (2026-09-26)
-- ═══════════════════════════════════════════════════════════════════
--
-- Found by the Phase 1 tenancy probe: `actions` had no client INSERT
-- policy — only staff and the service-role automation could create one —
-- so a consultant working inside a client (or a client's own HSE
-- manager) could not raise an action at all. The universal action engine
-- needs that. Gated by capability, scoped to the ACTIVE organisation,
-- and ANDed with the read-only write guard like every other write.

DROP POLICY IF EXISTS actions_org_insert ON public.actions;
CREATE POLICY actions_org_insert ON public.actions
  FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND public.has_capability(company_id, 'actions.assign'));
