-- ═══════════════════════════════════════════════════════════════════
-- 178: Board Assurance & Executive Reporting — Phase 13, Group 1
-- ═══════════════════════════════════════════════════════════════════
--
-- A periodic (quarterly, matching the existing Value Report cadence),
-- DISTRIBUTABLE, SIGN-OFF-ABLE document assembling facts this codebase
-- already computes: the Compliance Digital Twin (Phase 12), the
-- portfolio-count facts (lib/health/portfolioCounts.ts, Phase 6,
-- already computed for the internal, staff-only client_health_
-- snapshots but never shown to a client's own board), and the most
-- recently COMPLETED management review's decisions (Phase 5 Group 6).
-- No new raw fact is computed anywhere in this migration or the
-- TypeScript it ships with — see docs/CORE_OS_360_PHASE13_PLAN.md.
--
-- `report_data` is an IMMUTABLE JSONB SNAPSHOT, generated once and
-- never recomputed after the fact — the exact management_review_
-- data_pack precedent (161): "a stored snapshot, never recomputed...
-- generating a new pack inserts a fresh row rather than overwriting
-- the old one." Draft -> issued is the ONE transition a session may
-- make after insert; every other column is frozen once written.
--
-- Trend needs no new snapshot-history table: the quarterly cadence is
-- coarse enough that the sequence of PAST STORED REPORTS already is
-- the trend history (read the immediately prior (year, quarter) row's
-- own report_data.overallBand) — avoiding a near-duplicate of
-- client_health_snapshots (107), which stays exactly what it already
-- is: an internal, staff-only, DAILY BD signal, never shown to a
-- client. This table is the opposite in every relevant way: quarterly,
-- client-visible once issued, and a formal document, not a trend line.
--
-- Capabilities REUSED, not invented: risk.read / risk.create (117) —
-- the same broadest existing "can see/add to the register" pair
-- Phase 5's Groups 3-8 already reused repeatedly for exactly this
-- reason. Both already exist and are already granted to the relevant
-- roles; this migration adds no capability-seeding block at all.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── board_assurance_reports ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.board_assurance_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  year          integer NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  quarter       integer NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued')),
  report_data   jsonb NOT NULL,
  generated_at  timestamptz NOT NULL DEFAULT now(),
  generated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_at     timestamptz,
  issued_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, year, quarter)
);
CREATE INDEX IF NOT EXISTS board_assurance_reports_company_idx
  ON public.board_assurance_reports (company_id, year DESC, quarter DESC);

-- Content is frozen at generation; only status (and the issued_at/
-- issued_by it stamps together) may move, and only forward
-- (draft -> issued, never back). Staff excepted nowhere — this exists
-- for the TRANSACTION and the invariant, not to escalate privilege
-- (the 155 self-authorisation precedent: DEFINER is for the guard's
-- own logic, never a bypass).
CREATE OR REPLACE FUNCTION public.board_assurance_reports_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.generated_by := auth.uid();
    NEW.status := 'draft';
    NEW.issued_at := NULL;
    NEW.issued_by := NULL;
  ELSE
    IF NEW.report_data IS DISTINCT FROM OLD.report_data
       OR NEW.year <> OLD.year
       OR NEW.quarter <> OLD.quarter
       OR NEW.company_id <> OLD.company_id
       OR NEW.generated_at <> OLD.generated_at
       OR NEW.generated_by IS DISTINCT FROM OLD.generated_by THEN
      RAISE EXCEPTION 'board_assurance_reports: only status (and the issue stamp it carries) may change after generation';
    END IF;
    IF OLD.status = 'issued' AND NEW.status <> 'issued' THEN
      RAISE EXCEPTION 'board_assurance_reports: an issued report cannot be un-issued';
    END IF;
    IF NEW.status = 'issued' AND OLD.status <> 'issued' THEN
      NEW.issued_at := now();
      NEW.issued_by := auth.uid();
    ELSE
      NEW.issued_at := OLD.issued_at;
      NEW.issued_by := OLD.issued_by;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.board_assurance_reports_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS board_assurance_reports_guard ON public.board_assurance_reports;
CREATE TRIGGER board_assurance_reports_guard BEFORE INSERT OR UPDATE ON public.board_assurance_reports
  FOR EACH ROW EXECUTE FUNCTION public.board_assurance_reports_guard();

-- ── board_assurance_acknowledgements ────────────────────────────────
-- Insert-only — a board member's own read-and-sign-off of an ISSUED
-- report. One row per person per report (UNIQUE, a duplicate-click
-- guard, not a "no corrections" statement); a correction is a new
-- report, never an edited acknowledgement.

CREATE TABLE IF NOT EXISTS public.board_assurance_acknowledgements (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id             uuid NOT NULL REFERENCES public.board_assurance_reports(id) ON DELETE CASCADE,
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  acknowledged_by       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acknowledged_by_name  text NOT NULL,
  comment               text CHECK (comment IS NULL OR length(comment) <= 2000),
  acknowledged_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, acknowledged_by)
);
CREATE INDEX IF NOT EXISTS board_assurance_acknowledgements_report_idx
  ON public.board_assurance_acknowledgements (report_id);

-- company_id, who, and when are all derived from the parent report and
-- the session — never trusted from the caller (the person_id-filled-
-- from-parent discipline every H&S sub-record trigger already uses).
-- The report must already be ISSUED: acknowledging a draft would mean
-- signing off on staff working data the client was never shown.
CREATE OR REPLACE FUNCTION public.board_assurance_acknowledgements_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_company uuid;
  v_status  text;
BEGIN
  SELECT company_id, status INTO v_company, v_status
    FROM public.board_assurance_reports WHERE id = NEW.report_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'board_assurance_acknowledgements: unknown report_id';
  END IF;
  IF v_status <> 'issued' THEN
    RAISE EXCEPTION 'board_assurance_acknowledgements: report is not yet issued';
  END IF;
  NEW.company_id := v_company;
  NEW.acknowledged_by := auth.uid();
  NEW.acknowledged_by_name := COALESCE(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'A board member');
  NEW.acknowledged_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.board_assurance_acknowledgements_fill() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS board_assurance_acknowledgements_fill ON public.board_assurance_acknowledgements;
CREATE TRIGGER board_assurance_acknowledgements_fill BEFORE INSERT ON public.board_assurance_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.board_assurance_acknowledgements_fill();

REVOKE UPDATE, DELETE, TRUNCATE ON public.board_assurance_acknowledgements FROM PUBLIC, anon, authenticated;

-- ── write guard (117) — the one client-writable table only, the 158/
--    159 precedent (a staff-only-write table like board_assurance_
--    reports itself gets none) ─────────────────────────────────────

SELECT public.apply_write_guard('public.board_assurance_acknowledgements');

-- ── outbox (096) ─────────────────────────────────────────────────
-- Whitelist: year, quarter, status only — never report_data, which
-- would put a large computed blob into the outbox for no consumer
-- that needs it; the consequence rule reads the row directly instead.

DROP TRIGGER IF EXISTS board_assurance_reports_platform_event ON public.board_assurance_reports;
CREATE TRIGGER board_assurance_reports_platform_event AFTER INSERT OR UPDATE ON public.board_assurance_reports
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('year', 'quarter', 'status');

-- board_assurance_acknowledgements deliberately has NO outbox entry of
-- its own — one meaningful event per REPORT (its own issue), not one
-- per sub-row, the exact "hs_audit_responses is not a source" rule.

-- ── audit trail (117) — identifying/classifying only, never the
--    report's own computed content ─────────────────────────────────

DROP TRIGGER IF EXISTS board_assurance_reports_audit ON public.board_assurance_reports;
CREATE TRIGGER board_assurance_reports_audit AFTER INSERT OR UPDATE OR DELETE ON public.board_assurance_reports
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('board_assurance_report', 'company_id', 'year', 'quarter', 'status');

DROP TRIGGER IF EXISTS board_assurance_acknowledgements_audit ON public.board_assurance_acknowledgements;
CREATE TRIGGER board_assurance_acknowledgements_audit AFTER INSERT ON public.board_assurance_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('board_assurance_acknowledgement', 'company_id', 'report_id', 'acknowledged_by');

-- ── RLS ──────────────────────────────────────────────────────────

ALTER TABLE public.board_assurance_reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_assurance_acknowledgements ENABLE ROW LEVEL SECURITY;

-- board_assurance_reports: staff MANAGE, client READ-ONLY and only
-- once ISSUED — a draft is staff working data the client never sees,
-- the exact management_review_data_pack/management_reviews split
-- (a review's own row is client-readable at any status per its own
-- design, but a report is closer to a document: nothing here is
-- self-certified, and nothing half-finished is shown either).
DROP POLICY IF EXISTS board_assurance_reports_staff_all ON public.board_assurance_reports;
CREATE POLICY board_assurance_reports_staff_all ON public.board_assurance_reports FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

DROP POLICY IF EXISTS board_assurance_reports_client_read ON public.board_assurance_reports;
CREATE POLICY board_assurance_reports_client_read ON public.board_assurance_reports FOR SELECT TO authenticated
  USING (
    status = 'issued'
    AND company_id = (SELECT public.my_company_id())
    AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read'))
  );

-- board_assurance_acknowledgements: staff MANAGE + read; a client may
-- read their own company's acknowledgements (so a board sees who has
-- and hasn't signed off) and INSERT their own (the fill trigger above
-- is the real gate — report status and company_id are never trusted
-- from this policy alone).
DROP POLICY IF EXISTS board_assurance_acknowledgements_staff_all ON public.board_assurance_acknowledgements;
CREATE POLICY board_assurance_acknowledgements_staff_all ON public.board_assurance_acknowledgements FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

DROP POLICY IF EXISTS board_assurance_acknowledgements_client_read ON public.board_assurance_acknowledgements;
CREATE POLICY board_assurance_acknowledgements_client_read ON public.board_assurance_acknowledgements FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.my_company_id())
    AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read'))
  );

DROP POLICY IF EXISTS board_assurance_acknowledgements_client_insert ON public.board_assurance_acknowledgements;
CREATE POLICY board_assurance_acknowledgements_client_insert ON public.board_assurance_acknowledgements FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT public.my_company_id())
    AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create'))
  );
