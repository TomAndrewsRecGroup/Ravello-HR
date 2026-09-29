-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 5, Group 5: Controlled Document Management
-- (2026-09-29)
-- ═══════════════════════════════════════════════════════════════════
--
-- Builds on Groups 1-4 (156-159). Read docs/CORE_OS_360_PHASE5_
-- GOVERNANCE_MAP.md before touching this. EXTENDS hs_documents (106)
-- in place — never a second document table, per the governance map's
-- own verdict on hs_documents ("EXTEND (pattern reused, table not)").
--
-- 106's discipline ("a new version is a new row, old row flips to
-- superseded") is preserved and extended with a formal author/
-- reviewer/approver workflow, a stricter lifecycle, effective-date
-- separation, retention metadata, acknowledgement version-pinning and
-- obsolete-document protection.
--
-- Absolute rules this migration is built to:
--   1. Workflow lives in a BEFORE trigger (hs_document_lifecycle_guard),
--      never only in the UI — the exact discipline hs_doc_guard() (123)
--      already established for risk assessments/RAMS/COSHH.
--   2. Every INSERT is a DRAFT, whatever status the caller sends — this
--      is what makes rule 4 (below) trivially true for every new
--      version created via the existing "supersedes" flow.
--   3. A document naming a reviewer MUST pass through pending_review;
--      one naming an approver MUST pass through pending_approval. One
--      naming neither may go draft -> active directly.
--   4. Nobody approves their own work — staff excepted, the EXACT
--      phrasing and mechanism 123's hs_doc_guard already uses
--      (`NOT is_tps_staff() AND auth.uid() IN (author, reviewer)`).
--      Additionally, approver_id can never equal author_id or
--      reviewer_id on the same row (a CHECK the trigger enforces,
--      independent of who is acting).
--   5. Approved/active/review_due/superseded/withdrawn/archived content
--      (title/category/description) is immutable — an edit request is
--      always a NEW VERSION (a fresh INSERT with supersedes_id set),
--      never an UPDATE. Administrative metadata (review_due_at,
--      effective_from, retention_period_months, reviewer_id/
--      approver_id while still draft, status itself) may still move
--      within the lifecycle's own rules.
--   6. effective_from may be in the FUTURE. A document may only reach
--      'active' when effective_from IS NULL or already <= today — the
--      database's own gate, not a read-side filter alone. Because of
--      this, `status = 'active'` ALONE already implies "currently
--      effective"; read queries add the effective_from check too, as
--      defence in depth per the task brief.
--   7. Superseding an OLDER version happens automatically, but only
--      once the NEW version actually reaches 'active' — not at the
--      moment a replacement is drafted (hs_document_supersede_roll,
--      AFTER UPDATE). This keeps exactly one document "current" at any
--      time: the old version stays active throughout the new one's
--      review/approval, and flips to superseded the instant the new
--      one is published, never leaving a continuity gap.
--   8. No automatic deletion, ever, of any hs_documents row regardless
--      of status or how far past its review_due_at/retention_until it
--      is — retention_period_months/retention_until are METADATA ONLY.
--      A review period passing moves a document toward 'review_due'
--      (a reminder), never removes it. No DELETE grant exists on this
--      table for any session role (106 already revoked it; nothing
--      here reverses that).
--   9. policy_acknowledgements gains a nullable hs_document_id
--      (REFERENCES hs_documents(id)) alongside the existing document_id
--      (REFERENCES documents(id)) — exactly one of the two is set
--      (a CHECK). Because a NEW hs_documents VERSION IS a new row (rule
--      2 above), pinning an acknowledgement to a specific hs_documents.id
--      already pins it to a specific VERSION for ever: publishing v4
--      does not, and cannot, retroactively change what an employee's
--      acknowledgement of v3 (a row naming v3's own id) means.
--  10. RLS is UNCHANGED (staff ALL, client SELECT own company) — this
--      migration adds columns and workflow, never changes who may read
--      or write hs_documents.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── new columns ──────────────────────────────────────────────────

ALTER TABLE public.hs_documents
  ADD COLUMN IF NOT EXISTS author_id               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewer_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approver_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at              timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at              timestamptz,
  -- Nullable: NULL means "effective immediately on approval" (rule 6).
  ADD COLUMN IF NOT EXISTS effective_from           date,
  ADD COLUMN IF NOT EXISTS retention_period_months  integer,
  -- Computed by the trigger from approved_at + retention_period_months
  -- (metadata only — nothing anywhere reads this to delete a row).
  ADD COLUMN IF NOT EXISTS retention_until          date,
  ADD COLUMN IF NOT EXISTS withdrawn_at             timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.hs_documents DROP CONSTRAINT IF EXISTS hs_documents_retention_period_months_check;
ALTER TABLE public.hs_documents ADD CONSTRAINT hs_documents_retention_period_months_check
  CHECK (retention_period_months IS NULL OR retention_period_months BETWEEN 1 AND 1200);

-- Rule 4's data-level half: approver_id may never equal author_id or
-- reviewer_id on the SAME row, independent of who is acting.
ALTER TABLE public.hs_documents DROP CONSTRAINT IF EXISTS hs_documents_approver_distinct;
ALTER TABLE public.hs_documents ADD CONSTRAINT hs_documents_approver_distinct CHECK (
  (approver_id IS NULL OR approver_id <> author_id)
  AND (approver_id IS NULL OR reviewer_id IS NULL OR approver_id <> reviewer_id)
);

-- ── extended lifecycle CHECK ─────────────────────────────────────

ALTER TABLE public.hs_documents DROP CONSTRAINT IF EXISTS hs_documents_status_check;
ALTER TABLE public.hs_documents ADD CONSTRAINT hs_documents_status_check CHECK (status IN (
  'draft', 'pending_review', 'pending_approval', 'approved', 'active',
  'review_due', 'superseded', 'withdrawn', 'archived'
));
ALTER TABLE public.hs_documents ALTER COLUMN status SET DEFAULT 'draft';

-- ── the lifecycle guard (rules 1-6) ──────────────────────────────

CREATE OR REPLACE FUNCTION public.hs_document_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ok boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Rule 2: every insert is a draft, whatever the caller sent —
    -- this is what makes "editing is always a new draft version,
    -- never an overwrite" true by construction for the existing
    -- "New version" (supersedes_id) flow.
    NEW.status       := 'draft';
    NEW.author_id    := COALESCE(NEW.author_id, auth.uid());
    NEW.reviewed_at  := NULL;
    NEW.approved_at  := NULL;
    NEW.withdrawn_at := NULL;
    NEW.withdrawn_by := NULL;
  ELSE
    -- Rule 5: content is immutable once approved/active/review_due/
    -- superseded/withdrawn/archived — only administrative columns and
    -- the status itself may still move within the lifecycle below.
    IF OLD.status IN ('approved', 'active', 'review_due', 'superseded', 'withdrawn', 'archived')
       AND (NEW.title IS DISTINCT FROM OLD.title
         OR NEW.category IS DISTINCT FROM OLD.category
         OR NEW.description IS DISTINCT FROM OLD.description) THEN
      RAISE EXCEPTION 'This version is approved and its content is immutable; create a new version instead' USING ERRCODE = '23514';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      ok := (OLD.status, NEW.status) IN (
        ('draft', 'pending_review'), ('draft', 'pending_approval'), ('draft', 'active'), ('draft', 'withdrawn'),
        ('pending_review', 'pending_approval'), ('pending_review', 'active'), ('pending_review', 'draft'), ('pending_review', 'withdrawn'),
        ('pending_approval', 'approved'), ('pending_approval', 'draft'), ('pending_approval', 'withdrawn'),
        ('approved', 'active'), ('approved', 'withdrawn'), ('approved', 'superseded'),
        ('active', 'review_due'), ('active', 'superseded'), ('active', 'withdrawn'),
        ('review_due', 'active'), ('review_due', 'superseded'), ('review_due', 'withdrawn'),
        ('superseded', 'archived'), ('withdrawn', 'archived')
      );
      IF NOT ok THEN
        RAISE EXCEPTION 'A document cannot move from % to %', OLD.status, NEW.status USING ERRCODE = '23514';
      END IF;

      CASE NEW.status
        WHEN 'pending_review' THEN
          IF NEW.reviewer_id IS NULL THEN
            RAISE EXCEPTION 'Name a reviewer before submitting for review' USING ERRCODE = '23514';
          END IF;
        WHEN 'pending_approval' THEN
          IF NEW.approver_id IS NULL THEN
            RAISE EXCEPTION 'Name an approver before submitting for approval' USING ERRCODE = '23514';
          END IF;
          -- Rule 3: a named reviewer may not be bypassed.
          IF OLD.status = 'draft' AND NEW.reviewer_id IS NOT NULL THEN
            RAISE EXCEPTION 'This document names a reviewer; it must go through review before approval' USING ERRCODE = '23514';
          END IF;
          IF OLD.status = 'pending_review' THEN NEW.reviewed_at := now(); END IF;
        WHEN 'active' THEN
          IF OLD.status = 'pending_review' THEN NEW.reviewed_at := now(); END IF;
          -- Rule 6: never active before its own effective date.
          IF NEW.effective_from IS NOT NULL AND NEW.effective_from > current_date THEN
            RAISE EXCEPTION 'This document is not effective until %', NEW.effective_from USING ERRCODE = '23514';
          END IF;
        WHEN 'approved' THEN
          IF NEW.approver_id IS NULL THEN
            RAISE EXCEPTION 'Name an approver before approving' USING ERRCODE = '23514';
          END IF;
          -- Rule 4: nobody approves their own work. Unlike hs_doc_guard()
          -- (123), which exempts staff because a NON-staff client can be
          -- the author there, hs_documents is staff-only end to end (RLS
          -- lets nobody else write it) — exempting staff here would
          -- exempt EVERY possible writer and make the rule a no-op.
          -- The 155 precedent (permits' self-authorisation fix) is the
          -- right template instead: a bare auth.uid() comparison, no
          -- role exemption, because there is no "somebody administering
          -- on another party's behalf" case to protect here.
          IF auth.uid() = NEW.author_id OR auth.uid() = NEW.reviewer_id THEN
            RAISE EXCEPTION 'You cannot approve a document you authored or reviewed; another approver must do it' USING ERRCODE = '42501';
          END IF;
          NEW.approved_at := now();
        WHEN 'withdrawn' THEN
          NEW.withdrawn_at := now();
          NEW.withdrawn_by := auth.uid();
        ELSE
          NULL;
      END CASE;
    END IF;
  END IF;

  -- Retention is metadata only, recomputed whenever either input
  -- changes; never read by anything that deletes a row (rule 8).
  IF NEW.retention_period_months IS NOT NULL AND NEW.approved_at IS NOT NULL THEN
    NEW.retention_until := (NEW.approved_at::date + (NEW.retention_period_months || ' months')::interval)::date;
  ELSE
    NEW.retention_until := NULL;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.hs_document_lifecycle_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS hs_document_lifecycle_guard ON public.hs_documents;
CREATE TRIGGER hs_document_lifecycle_guard
  BEFORE INSERT OR UPDATE ON public.hs_documents
  FOR EACH ROW EXECUTE FUNCTION public.hs_document_lifecycle_guard();

-- ── auto-supersede on publish (rule 7) ───────────────────────────

CREATE OR REPLACE FUNCTION public.hs_document_supersede_roll()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' AND NEW.supersedes_id IS NOT NULL THEN
    UPDATE public.hs_documents
    SET status = 'superseded'
    WHERE id = NEW.supersedes_id
      AND status IN ('active', 'review_due', 'approved');
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.hs_document_supersede_roll() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS hs_document_supersede_roll ON public.hs_documents;
CREATE TRIGGER hs_document_supersede_roll
  AFTER UPDATE ON public.hs_documents
  FOR EACH ROW EXECUTE FUNCTION public.hs_document_supersede_roll();

-- ── Safety Timeline: one line per meaningful transition ──────────

CREATE OR REPLACE FUNCTION public.hs_document_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.hs_log(NEW.company_id, 'document', NEW.id, 'document_drafted',
      'Document drafted: ' || NEW.title || ' (v' || NEW.version || ')');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    CASE NEW.status
      WHEN 'pending_review' THEN
        PERFORM public.hs_log(NEW.company_id, 'document', NEW.id, 'document_submitted_for_review',
          'Submitted for review: ' || NEW.title);
      WHEN 'pending_approval' THEN
        PERFORM public.hs_log(NEW.company_id, 'document', NEW.id, 'document_submitted_for_approval',
          'Submitted for approval: ' || NEW.title);
      WHEN 'approved' THEN
        PERFORM public.hs_log(NEW.company_id, 'document', NEW.id, 'document_approved',
          'Approved: ' || NEW.title || ' (v' || NEW.version || ')');
      WHEN 'active' THEN
        PERFORM public.hs_log(NEW.company_id, 'document', NEW.id, 'document_published',
          'Published: ' || NEW.title || ' (v' || NEW.version || ')');
      WHEN 'superseded' THEN
        PERFORM public.hs_log(NEW.company_id, 'document', NEW.id, 'document_superseded',
          'Document superseded: ' || NEW.title);
      WHEN 'withdrawn' THEN
        PERFORM public.hs_log(NEW.company_id, 'document', NEW.id, 'document_withdrawn',
          'Withdrawn: ' || NEW.title);
      ELSE
        NULL;
    END CASE;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS hs_documents_hs_event ON public.hs_documents;
CREATE TRIGGER hs_documents_hs_event
  AFTER INSERT OR UPDATE ON public.hs_documents
  FOR EACH ROW EXECUTE FUNCTION public.hs_document_event();
REVOKE ALL ON FUNCTION public.hs_document_event() FROM PUBLIC, anon, authenticated;

-- ── audit trail (117) — identifying/classifying only ─────────────

DROP TRIGGER IF EXISTS hs_documents_audit ON public.hs_documents;
CREATE TRIGGER hs_documents_audit AFTER INSERT OR UPDATE ON public.hs_documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('hs_document', 'company_id',
    'title', 'category', 'status', 'author_id', 'reviewer_id', 'approver_id', 'effective_from');

-- ── outbox: re-create with the extended whitelist ────────────────

DROP TRIGGER IF EXISTS hs_documents_platform_event ON public.hs_documents;
CREATE TRIGGER hs_documents_platform_event AFTER INSERT OR UPDATE ON public.hs_documents
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row(
    'category', 'title', 'version', 'review_due_at', 'status', 'effective_from', 'reviewer_id', 'approver_id');

-- ── grants: the administrative columns a session may set directly ─
-- (title/description/category/site_id/review_due_at/status already
-- granted by 106; author_id/reviewed_at/approved_at/retention_until/
-- withdrawn_at/withdrawn_by are trigger-stamped only, never granted.)

GRANT UPDATE (reviewer_id, approver_id, effective_from, retention_period_months) ON public.hs_documents TO authenticated;

-- No DELETE grant exists, and none is added here (rule 8) — 106's own
-- REVOKE UPDATE, DELETE, TRUNCATE FROM PUBLIC, anon, authenticated
-- already covers DELETE and is not reversed.

-- ── policy_acknowledgements: version-pinned acknowledgement of an
--    hs_documents row (rule 9) ────────────────────────────────────

ALTER TABLE public.policy_acknowledgements ALTER COLUMN document_id DROP NOT NULL;
ALTER TABLE public.policy_acknowledgements
  ADD COLUMN IF NOT EXISTS hs_document_id uuid REFERENCES public.hs_documents(id) ON DELETE CASCADE;

ALTER TABLE public.policy_acknowledgements DROP CONSTRAINT IF EXISTS policy_acknowledgements_doc_xor_hsdoc;
ALTER TABLE public.policy_acknowledgements ADD CONSTRAINT policy_acknowledgements_doc_xor_hsdoc CHECK (
  (document_id IS NOT NULL AND hs_document_id IS NULL) OR (document_id IS NULL AND hs_document_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS policy_acknowledgements_hsdoc_employee_uidx
  ON public.policy_acknowledgements (hs_document_id, employee_id) WHERE hs_document_id IS NOT NULL;

DROP TRIGGER IF EXISTS policy_acknowledgements_platform_event ON public.policy_acknowledgements;
CREATE TRIGGER policy_acknowledgements_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.policy_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status', 'document_id', 'hs_document_id', 'employee_id', 'acknowledged_at');

DROP TRIGGER IF EXISTS policy_acknowledgements_audit ON public.policy_acknowledgements;
CREATE TRIGGER policy_acknowledgements_audit AFTER INSERT OR UPDATE OR DELETE ON public.policy_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('policy_ack', 'company_id', 'status', 'acknowledged_at',
    'acknowledged_via', 'document_id', 'hs_document_id', 'document_version_id', 'employee_id');
