-- ═══════════════════════════════════════════════════════════════════
-- 215: document_instances gets a database-level lifecycle guard
-- (Part 2, Group 6 — tracking UI adds the first control, Void, that
-- could otherwise move a signed/declined document backwards with no
-- guard at all catching it)
-- ═══════════════════════════════════════════════════════════════════
--
-- 213 shipped document_instances with `status` already including
-- 'voided' in its CHECK, but with NO lifecycle guard trigger — status
-- could be moved between ANY two listed values by a plain UPDATE,
-- staff or client, with only the app's own claim-first conditional
-- checks (the send/sign routes, Group 5) narrowing what happens in
-- PRACTICE. The same "workflow lives in BEFORE triggers, never only
-- in the UI, staff included" discipline this codebase applies to
-- permits/isolations/consultancy_visits (152/153/185) is applied here
-- before Group 6 adds the Void control.
--
-- This migration is a STRICT NARROWING versus the status quo (today,
-- with no guard at all, every transition already succeeds) — whatever
-- edges this allow-list contains, it can only make document_instances
-- MORE guarded than it already is, never less.
--
-- The allowed edges are read off the REAL write paths, grepped, not
-- guessed — including the two "revert the claim on failure" paths
-- Group 5 already ships and tests, which make this graph genuinely
-- bidirectional on two edges (a legitimate, narrow failure-recovery
-- window immediately following the claim, inside the SAME request —
-- the exact shape permits_lifecycle_guard() already allows for its own
-- suspended -> issued revalidation move backward):
--
--   draft -> sent_for_signature     (send route: requires_signature=true)
--   sent_for_signature -> draft     (send route: revert on mint/email failure)
--   draft -> signed                 (send route: requires_signature=false)
--   signed -> draft                 (send route: revert on PDF/upload failure)
--   sent_for_signature -> signed    (public sign route: the employee signs)
--   signed -> sent_for_signature    (public sign route: revert on PDF/upload failure)
--   sent_for_signature -> declined  (public sign route: the employee declines)
--   draft -> voided                 (Group 6: cancel before anything is sent)
--   sent_for_signature -> voided    (Group 6: cancel before a decision is made)
--
-- declined/voided are BOTH terminal — once an employee has genuinely
-- declined, or staff/the client has voided a document, nothing moves
-- it again. A changed mind means generating a FRESH instance, never
-- rewriting a record that already holds a real decision.
--
-- `signed -> voided` is deliberately NOT allowed: once a document is
-- genuinely signed (the PDF stored, the employee notified), staff
-- cannot quietly erase that fact by voiding it — a bigger, more
-- consequential action this group does not build. Invalidating a
-- signed document is a decision outside this migration's scope,
-- recorded here rather than silently permitted.

CREATE OR REPLACE FUNCTION public.document_instances_lifecycle_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'draft' AND NEW.status IN ('sent_for_signature', 'signed', 'voided') THEN
      IF NEW.status = 'voided' THEN
        NEW.voided_at := COALESCE(NEW.voided_at, now());
        NEW.voided_by := COALESCE(NEW.voided_by, auth.uid());
      END IF;
    ELSIF OLD.status = 'sent_for_signature' AND NEW.status IN ('draft', 'signed', 'declined', 'voided') THEN
      IF NEW.status = 'voided' THEN
        NEW.voided_at := COALESCE(NEW.voided_at, now());
        NEW.voided_by := COALESCE(NEW.voided_by, auth.uid());
      END IF;
    ELSIF OLD.status = 'signed' AND NEW.status IN ('draft', 'sent_for_signature') THEN
      -- the two narrow revert-on-failure paths; nothing else moves a
      -- genuinely signed document anywhere.
    ELSE
      RAISE EXCEPTION 'Cannot move a document from % to %', OLD.status, NEW.status USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.document_instances_lifecycle_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS document_instances_lifecycle_guard ON public.document_instances;
CREATE TRIGGER document_instances_lifecycle_guard BEFORE UPDATE ON public.document_instances
  FOR EACH ROW EXECUTE FUNCTION public.document_instances_lifecycle_guard();
