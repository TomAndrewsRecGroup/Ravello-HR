-- Core-OS 360 Completion Programme, Phase 23, Group 5 (closes gap-
-- ledger row C12.5 -- "configurable thresholds, safe defaults,
-- audited").
--
-- Deciding these thresholds decides what a CLIENT sees as red/amber/
-- green on their own compliance posture, so -- matching the H&S
-- register's standing "nothing here is self-certified" posture -- a
-- client never gets a write path to loosen their own thresholds.
-- Staff-only RLS, the same management_review_data_pack (161) shape
-- 188's own compliance_twin_snapshots already used.
--
-- Every column is nullable: null/unset means "use the documented
-- default", never a silently guessed number. assembleComplianceTwin()
-- (lib/complianceTwin/assemble.ts) reads `thresholds?.X ?? DEFAULT_X`
-- for every one of these five.

CREATE TABLE IF NOT EXISTS public.compliance_twin_thresholds (
  id                                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                             uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  audit_score_low_threshold              numeric,
  evidence_red_threshold                 numeric,
  evidence_amber_threshold               numeric,
  objectives_on_track_amber_threshold    numeric,
  waste_non_conformance_amber_threshold  numeric,
  updated_by                             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at                             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.compliance_twin_thresholds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compliance_twin_thresholds_staff_all ON public.compliance_twin_thresholds;
CREATE POLICY compliance_twin_thresholds_staff_all ON public.compliance_twin_thresholds FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

-- audit_row (117): whitelists only the five threshold columns
-- themselves -- this table has no other column worth recording (no
-- free text of any kind exists here to accidentally leak).
DROP TRIGGER IF EXISTS compliance_twin_thresholds_audit ON public.compliance_twin_thresholds;
CREATE TRIGGER compliance_twin_thresholds_audit AFTER INSERT OR UPDATE OR DELETE ON public.compliance_twin_thresholds
  FOR EACH ROW EXECUTE FUNCTION public.audit_row(
    'compliance_twin_threshold', 'company_id',
    'audit_score_low_threshold', 'evidence_red_threshold', 'evidence_amber_threshold',
    'objectives_on_track_amber_threshold', 'waste_non_conformance_amber_threshold'
  );
