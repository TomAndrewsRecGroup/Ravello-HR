-- Core-OS 360 Completion Programme, Phase 25, Group 2 (closes gap-ledger
-- row C17.6 — "concurrent review/update handling, no silent overwrite").
--
-- 159's own header already named this as accepted debt: "no `row_version`
-- column" on legal_requirement_research_notes. "Mark reviewed"
-- (LegalRequirementsCatalogueClient.tsx's markReviewed()) has always been
-- an unconditional `.update({ reviewed_by, reviewed_at, action_taken })
-- .eq('id', note.id)` — two staff members reviewing the SAME note at
-- once (a real, if low-stakes, scenario this table's own migration
-- comment explicitly flagged) would have the second save silently
-- overwrite the first's reviewed_by/reviewed_at/action_taken with no
-- detection, exactly the class of bug 123/124/125/176/190 already fixed
-- the same way each time.
--
-- Same pattern, applied here: row_version forced to 1 on INSERT and to
-- OLD+1 on every UPDATE regardless of whatever the caller sent — the
-- trigger's own overwrite is what makes a client's
-- `.eq('row_version', note.row_version)` conditional update an honest
-- optimistic-lock check, not a value the caller could game.
--
-- The research CONTENT (legal_requirement_id, source, query_used,
-- raw_result_summary, created_by, created_at) is also made immutable by
-- the new UPDATE trigger — a record of what was actually found and by
-- whom should never be silently rewritten by a later "reviewed" save;
-- only reviewed_by/reviewed_at/action_taken (the review verdict) may
-- change after creation.

ALTER TABLE public.legal_requirement_research_notes
  ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.legal_requirement_research_notes_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.created_by := auth.uid();
  NEW.row_version := 1;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.legal_requirement_research_notes_fill() FROM PUBLIC, anon, authenticated;
-- Trigger already exists (159); CREATE OR REPLACE FUNCTION above is
-- sufficient — no DROP/CREATE TRIGGER needed since its event/timing
-- (BEFORE INSERT) is unchanged.

CREATE OR REPLACE FUNCTION public.legal_requirement_research_notes_touch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.legal_requirement_id IS DISTINCT FROM OLD.legal_requirement_id
     OR NEW.source             IS DISTINCT FROM OLD.source
     OR NEW.query_used         IS DISTINCT FROM OLD.query_used
     OR NEW.raw_result_summary IS DISTINCT FROM OLD.raw_result_summary
     OR NEW.created_by         IS DISTINCT FROM OLD.created_by
     OR NEW.created_at         IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'The research record itself cannot be changed after creation — only the review (reviewed_by/reviewed_at/action_taken) may be updated' USING ERRCODE = '42501';
  END IF;
  -- Always OLD+1, regardless of whatever row_version the caller sent —
  -- this is what makes the client's own `.eq('row_version', ...)`
  -- conditional update an honest optimistic-lock check.
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.legal_requirement_research_notes_touch() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS legal_requirement_research_notes_touch ON public.legal_requirement_research_notes;
CREATE TRIGGER legal_requirement_research_notes_touch
  BEFORE UPDATE ON public.legal_requirement_research_notes
  FOR EACH ROW EXECUTE FUNCTION public.legal_requirement_research_notes_touch();
