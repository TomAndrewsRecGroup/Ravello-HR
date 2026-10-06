// Core-OS 360 Completion Programme, Phase 25, Group 4 (closes gap-ledger
// row C9.4 — "a client-facing, safely-scoped version for their own
// organisation"). `platform_events` has been staff-only SELECT RLS since
// migration 096 (verified live before writing this, not assumed: the
// only policies on the table are `platform_events_staff_read`
// (is_tps_staff() only) and the write-guard restrictive policies — no
// client SELECT policy exists), so a portal read must go through the
// SERVICE ROLE, scoped to the caller's own `company_id` — the same
// "bulk read pattern 2" precedent Phase 6's own portfolio reads already
// established for exactly this "RLS is staff-only, but a client-facing
// scoped view is genuinely needed" shape.
//
// Scoping by `company_id` alone is NOT enough. `computeWhatChanged()`
// (lib/whatChanged/compute.ts) groups by entity_type with no opinion on
// which types are appropriate for a client to see — it was built
// staff-only from day one (Phase 9) and never had to draw this line.
// Some entity types are staff-internal workflow concepts EVEN WHEN
// scoped to a real company_id, and their very presence on a "what
// changed for your organisation" page would be confusing or a premature
// disclosure, not merely noise:
//
//   - internal_tasks      — a staff work-queue item, never shown anywhere
//                            in the portal.
//   - companies            — the client's own administrative row itself
//                            (feature_flags, Manatal/IvyLens ids, contact
//                            details) — internal bookkeeping, not a
//                            record ABOUT something that happened to
//                            their organisation.
//   - enquiries             — a pre-client BD/prospecting concept; has no
//                            real client company_id (CLAUDE.md: "the
//                            table's own `company_id` "NULL" shape).
//   - bd_companies          — a BD prospect row, not a real client; same
//                            reasoning.
//   - referral_scan_runs    — company_id is NULL on every row this table
//                            emits (CLAUDE.md, "the table is now in the
//                            outbox with company NULL") — excluded by
//                            name for defence in depth, the scoping
//                            filter would already exclude it.
//   - board_assurance_reports — a DRAFT report's very EXISTENCE is
//                            staff-controlled disclosure until the
//                            explicit Issue action (migration 178's own
//                            draft->issued guard: "nothing here is
//                            self-certified... a client never gets a
//                            write path"). Showing "1 board_assurance_
//                            reports created" before a report is issued
//                            would hint at a document the client is not
//                            meant to know exists yet.
//
// This list is pinned against the REAL TRIGGERED_ENTITIES array in
// admin/src/lib/whatChanged/__tests__/clientScope.test.ts — since only
// admin can import both files, that test is the one place this module
// is checked for drift as TRIGGERED_ENTITIES grows. Portal carries this
// same literal list (a shared-dupe pair) because it has no access to
// admin's events/types.ts to derive it from.
const EXCLUDED_ENTITY_TYPES: readonly string[] = [
  'internal_tasks', 'companies', 'enquiries', 'bd_companies', 'referral_scan_runs', 'board_assurance_reports',
];

export const CLIENT_VISIBLE_ENTITY_TYPES: readonly string[] = [
  'service_requests', 'absence_records', 'actions', 'documents', 'employee_documents',
  'policy_acknowledgements', 'performance_reviews', 'requisitions', 'candidates', 'offers',
  'compliance_items', 'hs_register_completions', 'hs_activities', 'hs_files', 'hs_documents',
  'hs_audits', 'hs_incidents', 'onboarding_instances', 'onboarding_task_progress',
  'offboarding_instances', 'offboarding_task_progress', 'employee_records', 'interview_schedules',
  'hazards', 'risk_assessments', 'method_statements', 'coshh_assessments', 'substances',
  'incident_investigations', 'deployment_status_log', 'inspections', 'puwer_assessments',
  'hs_equipment_inspections', 'contractors', 'permits', 'isolations', 'emergency_plans',
  'emergency_drills', 'environmental_aspects', 'environmental_spills', 'waste_movements',
  'environmental_monitoring', 'environmental_permits', 'permit_conditions',
  'organisation_legal_obligations', 'compliance_evaluations', 'objectives', 'management_reviews',
  'audit_findings', 'consultation_records', 'environmental_complaints', 'consultancy_visits',
  'reports', 'training_records', 'visit_observations',
  // Migration 213: document_instances already has a full client-read
  // policy INCLUDING drafts (document_instances_client_select) — unlike
  // board_assurance_reports, there is no "premature disclosure" concern
  // here, since the client can already see the row directly.
  'document_instances',
];

const CLIENT_VISIBLE_SET = new Set(CLIENT_VISIBLE_ENTITY_TYPES);

export function isClientVisibleEntityType(entityType: string): boolean {
  return CLIENT_VISIBLE_SET.has(entityType);
}

/** Filters a raw event array down to client-appropriate entity types —
 *  applied AFTER the company_id scoping read, before computeWhatChanged(). */
export function filterClientVisible<T extends { entity_type: string }>(events: T[]): T[] {
  return events.filter(e => CLIENT_VISIBLE_SET.has(e.entity_type));
}

export { EXCLUDED_ENTITY_TYPES };
