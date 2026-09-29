-- Core-OS 360 Phase 6, Group 7 (section 13: Events and Audit).
--
-- The spec names five events: consultancy.client_accessed,
-- service_scope.updated, client_roadmap.updated, value_report.generated,
-- service_ledger.entry_created.
--
-- service_scope.updated ALREADY fires — migration 168's own
-- consultancy_service_scopes_audit trigger (audit_row('service_scope',
-- 'client_organisation_id', ...)) has produced it since Group 2. No
-- change needed here.
--
-- client_roadmap.updated is the one gap this migration closes with the
-- SAME mechanism: audit_row()'s own verb convention
-- (<entity>.<created|updated|deleted>) is an EXACT match for this one
-- ('client_roadmap' + 'updated' = 'client_roadmap.updated'), so a row
-- trigger is the right tool — one line, no app code, and it also
-- produces 'client_roadmap.created'/'client_roadmap.deleted' for free.
--
-- value_report.generated and service_ledger.entry_created are
-- DELIBERATELY NOT given a row trigger here: their spec-literal verbs
-- ("generated", "entry_created") do not match the generic
-- <entity>.<created|updated|deleted> shape, and a second, differently-
-- worded event alongside a generic one would be confusing rather than
-- additive. Both are fired as explicit app-level auditLog() calls
-- instead — see admin/src/lib/audit.ts and portal/src/lib/audit.ts.
-- consultancy.client_accessed is inherently app-level (a page view is
-- not a database write) and is fired from the portal's Client 360 page.

-- description is free text and is deliberately excluded from the
-- whitelist — the same rule this codebase applies to every audit_row
-- call (never salary, NI, notes, free text).
DROP TRIGGER IF EXISTS milestones_audit ON public.milestones;
CREATE TRIGGER milestones_audit AFTER INSERT OR UPDATE OR DELETE ON public.milestones
  FOR EACH ROW EXECUTE FUNCTION public.audit_row(
    'client_roadmap', 'company_id',
    'pillar', 'title', 'owner', 'due_date', 'status', 'quarter', 'sort_order'
  );
