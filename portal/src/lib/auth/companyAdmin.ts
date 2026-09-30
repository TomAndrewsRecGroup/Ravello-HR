// Core-OS 360 Completion Programme, Phase 28, Group 1 (closes
// gap-ledger row C1.13 — "UI still uses legacy role checks in
// places", Phase 1 handover §H item 1).
//
// NOT a capability check — checked live, not assumed, before writing
// this: every table these 7 pages write to (policy_acknowledgements,
// onboarding/offboarding instances + templates, employee_records,
// company_calendar_events) is gated purely by is_company_super_user()
// OR is_tps_staff() at the database, a predicate the Phase 1
// capability model (117/122/132/144/...) never migrated onto. There
// is no finer capability that actually governs these writes today —
// inventing one here would be a false abstraction, not a real fix.
//
// This function is the single, named mirror of that exact predicate,
// replacing 7 independently-spelled copies of the same OR'd string
// comparison (a genuine duplication-drift risk: a future change to
// what counts as a company's super-user was a seven-file hunt).
// companySuperUserSql.test.ts pins it against the LIVE
// is_company_super_user()/is_tps_staff() definitions.
//
// get_my_role() (what mints the `role` claim this reads) is already
// grant-aware: a read_only consultant's grant resolves legacy_role =
// 'client_user', never 'client_admin', so this correctly evaluates
// false for them — the "42501 on a button the UI shouldn't have
// shown" scenario Phase 1's own §H worried about does not reproduce
// here. See docs/CORE_OS_360_PHASE28_PLAN.md for the full
// investigation.

export function isCompanySuperUser(session: { role: string; isTpsStaff: boolean }): boolean {
  return session.isTpsStaff || session.role === 'client_admin';
}
