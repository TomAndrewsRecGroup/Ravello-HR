-- ═══════════════════════════════════════════════════════════════════
-- 202: Learning assignments — real LMS assignment + progress tracking
-- for the e-learning marketplace (006).
-- ═══════════════════════════════════════════════════════════════════
--
-- learning_purchases (006) grants COMPANY-WIDE access for a window —
-- "anyone at your company can access this content" (LearningDetailClient
-- .tsx's own copy). That is a real, working marketplace model and is
-- untouched here. What it never had: a way to assign a SPECIFIC piece
-- of content to a SPECIFIC employee and track THEIR OWN progress and
-- completion — the literal "Learning Assignments" / "Learning Progress
-- Tracking" gap. development_items.linked_course_id (134) links to
-- training_courses, a different catalogue (the formal H&S/workforce
-- training register) — this table is deliberately separate, keyed to
-- learning_content, and is never a duplicate of it.
--
-- Progress is self-reported (status + progress_percent), the same
-- honest default this codebase already uses throughout rather than
-- fabricate a number: there is no video-player hook to read actual
-- watch time from, so the learner's own "mark complete" is the real
-- signal, the same way an audit/inspection response is a human's own
-- recorded judgement, never an inferred one.
--
-- UNIQUE (content_id, person_id): one assignment per person per piece
-- of content — a re-assignment upserts the same row rather than
-- creating a duplicate, the idempotency discipline this codebase uses
-- throughout (referral_applications, consultancy_service_ledger, …).
--
-- company_id is ALWAYS derived from the person, never trusted from
-- the caller (learning_assignments_fill(), the person_id-fill
-- discipline every H&S sub-record trigger already uses).
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.learning_assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  content_id       uuid NOT NULL REFERENCES public.learning_content(id) ON DELETE CASCADE,
  person_id        uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  assigned_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at      timestamptz NOT NULL DEFAULT now(),
  due_date         date,
  status           text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed')),
  progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  started_at       timestamptz,
  completed_at     timestamptz,
  notes            text CHECK (notes IS NULL OR length(notes) <= 1000),
  row_version      integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_id, person_id),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS learning_assignments_company_idx  ON public.learning_assignments (company_id);
CREATE INDEX IF NOT EXISTS learning_assignments_person_idx   ON public.learning_assignments (person_id);
CREATE INDEX IF NOT EXISTS learning_assignments_due_idx      ON public.learning_assignments (due_date) WHERE due_date IS NOT NULL AND status <> 'completed';

-- company_id derived from the person (never trusted from the caller,
-- via the existing workforce_person_company() DEFINER helper, 134a —
-- reused rather than a second raw SELECT, so the inserting session
-- never needs its own read access to the person's row just to derive
-- which company a new assignment belongs to); content_id must resolve
-- to a real, published piece of content. row_version is forced
-- regardless of what the caller sends — the same optimistic-lock
-- discipline 123/176/190/197 already use.
--
-- SECURITY INVOKER, not DEFINER: this function's own self-restriction
-- branch below keys on current_user IN ('authenticated','anon') — a
-- guard keyed on current_user only works as the CALLER (088's own
-- rule; 134 shipped a DEFINER version of a different guard and a
-- self-submitted certificate was stored as verified until 134a caught
-- it live). Under DEFINER, current_user becomes this function's OWNER,
-- never 'authenticated'/'anon', which would have silently skipped the
-- whole self-restriction for every session.
CREATE OR REPLACE FUNCTION public.learning_assignments_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE derived uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    derived := public.workforce_person_company(NEW.person_id);
    IF derived IS NULL THEN
      RAISE EXCEPTION 'learning_assignments: unknown person_id' USING ERRCODE = '23503';
    END IF;
    NEW.company_id := derived;
    IF NOT EXISTS (SELECT 1 FROM public.learning_content WHERE id = NEW.content_id) THEN
      RAISE EXCEPTION 'learning_assignments: unknown content_id' USING ERRCODE = '23503';
    END IF;
    NEW.row_version := 1;
    IF NEW.status = 'completed' THEN NEW.completed_at := COALESCE(NEW.completed_at, now()); END IF;
    RETURN NEW;
  END IF;

  -- Organisation, content and person never move after creation —
  -- re-pointing an assignment is a new row, not an edit.
  IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.content_id IS DISTINCT FROM OLD.content_id
     OR NEW.person_id IS DISTINCT FROM OLD.person_id THEN
    RAISE EXCEPTION 'learning_assignments: organisation, content and person cannot change' USING ERRCODE = '23514';
  END IF;
  NEW.row_version := OLD.row_version + 1;
  IF NEW.status = 'completed' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  ELSE
    NEW.completed_at := NULL;
  END IF;

  -- A session with training.manage on this organisation may change
  -- anything. Otherwise, only the assigned person themselves (via
  -- their own linked portal login) may act, and only on their own
  -- progress — never the due date, notes, or who assigned it.
  IF current_user IN ('authenticated', 'anon') AND NOT public.has_capability(OLD.company_id, 'training.manage') THEN
    IF NOT EXISTS (SELECT 1 FROM public.people WHERE id = OLD.person_id AND user_id = auth.uid()) THEN
      RAISE EXCEPTION 'You do not have permission to change this assignment' USING ERRCODE = '42501';
    END IF;
    IF NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at THEN
      RAISE EXCEPTION 'You may only update your own progress' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS learning_assignments_fill ON public.learning_assignments;
CREATE TRIGGER learning_assignments_fill BEFORE INSERT OR UPDATE ON public.learning_assignments
  FOR EACH ROW EXECUTE FUNCTION public.learning_assignments_fill();

ALTER TABLE public.learning_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learning_assignments_staff_all ON public.learning_assignments;
CREATE POLICY learning_assignments_staff_all ON public.learning_assignments FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

DROP POLICY IF EXISTS learning_assignments_manage ON public.learning_assignments;
CREATE POLICY learning_assignments_manage ON public.learning_assignments FOR ALL TO authenticated
  USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), 'training.manage')))
  WITH CHECK (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), 'training.manage')));

-- The assigned person's own linked portal login sees and updates only
-- their own row — the trigger above decides which columns they may
-- actually change.
DROP POLICY IF EXISTS learning_assignments_self ON public.learning_assignments;
CREATE POLICY learning_assignments_self ON public.learning_assignments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.people p WHERE p.id = person_id AND p.user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS learning_assignments_self_update ON public.learning_assignments;
CREATE POLICY learning_assignments_self_update ON public.learning_assignments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.people p WHERE p.id = person_id AND p.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.people p WHERE p.id = person_id AND p.user_id = (SELECT auth.uid())));

SELECT public.apply_write_guard('public.learning_assignments');

DROP TRIGGER IF EXISTS learning_assignments_audit ON public.learning_assignments;
CREATE TRIGGER learning_assignments_audit AFTER INSERT OR UPDATE OR DELETE ON public.learning_assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('learning_assignment', 'company_id', 'content_id', 'person_id', 'status', 'due_date', 'progress_percent');
