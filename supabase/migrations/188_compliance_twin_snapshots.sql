-- Core-OS 360 Completion Programme, Phase 23, Group 4 (closes gap-
-- ledger row C12.4 — "stored snapshot / history for posture trend").
--
-- Explicit, human-triggered capture — never a blind daily per-company
-- loop. Checked before deciding: the existing daily
-- /api/cron/health-snapshot computes computePortfolioCounts() via
-- WHOLE-PORTFOLIO batched reads (readAllPages with no per-company
-- filter, grouped in memory) — cheap regardless of company count. The
-- Digital Twin's loadComplianceTwinSnapshot() is the opposite shape:
-- ~15 PER-COMPANY-SCOPED queries. Looping it over every active
-- company inside the existing cron would multiply that cost by
-- company count — a real, avoidable regression the existing cron's
-- own design doesn't have anywhere else. Board Assurance (Phase 13)
-- already solved "posture trend" for a structurally identical problem
-- with an EXPLICIT, human-triggered generate-then-store action, never
-- an automatic daily one — the same precedent applies here.
--
-- Staff-only RLS, the exact management_review_data_pack (161)
-- precedent — a staff action's internal artefact, never client-facing.
-- No apply_write_guard(): that guard protects a read-only CONSULTANCY
-- grant from writing to a CLIENT-readable table; this table has no
-- client policy at all, the same "staff-only tables don't get the
-- write guard" precedent 158's own management_system_standards/
-- standard_clauses already established.

CREATE TABLE IF NOT EXISTS public.compliance_twin_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT current_date,
  overall_band  text NOT NULL CHECK (overall_band IN ('red', 'amber', 'green')),
  areas         jsonb NOT NULL,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS compliance_twin_snapshots_company_idx
  ON public.compliance_twin_snapshots (company_id, snapshot_date DESC);

-- A same-day re-save UPSERTs rather than duplicating (rule: "UNIQUE
-- (company_id, snapshot_date) so a same-day re-save upserts rather
-- than duplicating"). created_by is always the ACTING staff member,
-- never trusted blindly from the client for a second save of the same
-- day — the upsert path below (ON CONFLICT DO UPDATE) refreshes it.

ALTER TABLE public.compliance_twin_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compliance_twin_snapshots_staff_all ON public.compliance_twin_snapshots;
CREATE POLICY compliance_twin_snapshots_staff_all ON public.compliance_twin_snapshots FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

-- The generic audit trail, the same discipline every client-facing
-- record insert already gets — a snapshot is a real staff action worth
-- an audit_events row, never free text (areas' own reasons[] strings
-- ARE potentially long, so only overall_band/snapshot_date are
-- whitelisted, never the areas jsonb blob itself).
DROP TRIGGER IF EXISTS compliance_twin_snapshots_audit ON public.compliance_twin_snapshots;
CREATE TRIGGER compliance_twin_snapshots_audit AFTER INSERT OR UPDATE OR DELETE ON public.compliance_twin_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('compliance_twin_snapshot', 'company_id', 'overall_band', 'snapshot_date');
