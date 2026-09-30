# Core-OS 360 Phase 28 Handover — UX role-check consolidation & optimistic locking completion

Part of the Core-OS 360 Completion Programme (Phases 20-29), per
`Core-OS 360_Remaining-Phases_Claude-Code_Master-Spec.docx`. Closes the
two gap-ledger rows Phase 20 assigned to Phase 28 (C1.12, C1.13), read
fresh from `docs/CORE_OS_360_COMPLETION_MATRIX.md`'s own gap ledger at
the start of this phase — the "repository reality beats handover
narrative" discipline every phase since Phase 20 has used, not assumed
from any prior summary. Full survey and design reasoning:
`docs/CORE_OS_360_PHASE28_PLAN.md`.

## What was required

Per the completion matrix's own gap ledger for this phase:

1. **C1.13** — "UI still uses legacy role checks in places" (Phase 1
   handover §H, item 1): app code compares `role === 'client_admin'`
   independently in ~8 places rather than through one named
   abstraction.
2. **C1.12** — "There is no optimistic locking" (Phase 1 handover §H,
   item 9): "two people editing the same employee means the last write
   wins." The Phase 24 slice (`consultancy_visit_reports`) was already
   closed; the general hardening across the rest of the app remained
   assigned here.

## What was found before any code was written

- **The "42501 on a shown button" scenario §H worried about does not
  reproduce.** `get_my_role()` is already grant-aware — a `read_only`
  consultant's grant resolves `legacy_role = 'client_user'`, never
  `'client_admin'` — verified against the live function and
  `access_roles.legacy_role`, not assumed.
- **Every one of the 8 pages' backing tables is gated by
  `is_company_super_user()`**, a predicate that was NEVER migrated onto
  the Phase 1 capability model — `SELECT get_my_role() = 'client_admin'`.
  There is no finer capability that actually governs any of these
  writes today; inventing one in the UI would have been a false
  abstraction, not a fix. What remained real was pure duplication-drift
  risk: the same `role === 'client_admin' || <staff check>` spelled out
  independently across many files.
- **`employee_records` has no `row_version` column.**
  `EmployeeRecordsClient.tsx`'s edit-form save was an unconditional
  `.update(body).eq('id', editingId)` — the exact scenario §H
  described, confirmed live.
- **A re-survey during Group 2, not trusted from the plan doc's own
  first pass, found a second unconditional write on the same rows**:
  `OrgChartClient.tsx`'s drag-and-drop `persistChange()`. See "What
  the plan doc got wrong" below.

## What was built

### Group 1: consolidate legacy role checks (C1.13)

`portal/src/lib/auth/companyAdmin.ts` — one function,
`isCompanySuperUser({ role, isTpsStaff })`, mirroring
`is_company_super_user() OR is_tps_staff()` exactly.
`companySuperUserSql.test.ts` pins it against migration 117's own text
for `is_company_super_user()` (the only migration that ever defines
it) and against a live-read snapshot of `is_tps_staff()` (which no
migration in this repo defines at all — it predates the migration
history, created directly in the Supabase SQL editor; its body was
read live via `execute_sql` and embedded as a documented snapshot,
never guessed).

Converted to the shared helper: `employee-records`,
`policy-acknowledgements`, `offboarding`, `onboarding`, `calendar`,
`org-chart` (its general `canEdit` gate only — the file's OWN,
deliberately different self-seed check at a different line, gated on
the bare `client_admin` role alone by design, is untouched),
`billing` (both the page and its `portal-session` API route), and — a
genuine ninth site found only by grepping API routes, not just pages —
`POST /api/portal/policy-acks/[id]/resend`. That last one is
`requireLiveSession()`-shaped, whose `LiveSession.role` can literally
BE `'tps_admin'` (unlike `getSessionProfile()`'s always-legacy-mapped
`role`, with `isTpsStaff` carried alongside it) — `isTpsStaff` is
derived inline as `role === 'tps_admin'`, mutation-tested (reverted to
`isTpsStaff: false`, watched the new staff-allowed test case fail,
restored).

**Deliberately left alone**: `hire/internal/page.tsx`'s `isAdmin =
role === 'client_admin' || isTpsStaff` already spells the correct
predicate, just not through the named function — its own `isAdmin`
prop conflates two DIFFERENT authorisations (`requisitions`,
unrestricted by role, and `employee_records`, super-user only) under
one flag, and splitting that is a product decision out of scope here.

### Group 2: employee_records optimistic lock (C1.12)

Migration 197: `row_version integer NOT NULL DEFAULT 1`, forced to 1
on INSERT and `OLD.row_version + 1` on every UPDATE by a trigger pair
regardless of whatever the caller sends. `SECURITY INVOKER`, not
`DEFINER` — matches this table's OWN existing trigger convention
(`person_same_org_guard`/`person_sync_from_source`/`employee_records_
sensitive_write_guard`, none of which are DEFINER), a deliberate
departure from migration 190's own DEFINER choice for
`consultancy_visit_reports`, whose fill function needs a cross-table
lookup this one does not. An additive `GRANT SELECT (row_version)`
mirrors 131's own "a new column needs its own additive grant"
discipline exactly, rather than rewriting 131's whole column list.

Two call sites made conditional on `row_version`, both with a clear
message on a lost race:
- `EmployeeRecordsClient.tsx`'s edit-form save — `editingVersion` is
  captured at `openEdit()` time from the row the drawer was populated
  from, never re-read from `employees` state at save time (a
  background `router.refresh()` could have already moved that state on
  without the open form knowing, silently defeating the lock).
- `OrgChartClient.tsx`'s drag-and-drop `persistChange()` — the expected
  version is read from current `employees` state at drag time (no
  long-lived form to go stale against here; the drag is a single
  synchronous action).

`row_version` is added to neither `employee_records_audit`'s
`audit_row()` whitelist nor `employee_records_platform_event`'s
`platform_event_row()` whitelist — bookkeeping, not a fact worth
reporting, the identical choice migration 190 made for its own column.

## What the plan doc got wrong, and how it was caught

The plan doc's own first-draft C1.12 investigation claimed
`EmployeeRecordsClient.tsx`'s save handler was "the only real edit-form
UPDATE site on this table — the other two `.update()` call sites...
neither a concurrent-edit risk." This was **incomplete**, not
incorrect about what it checked — a re-run of the same exhaustive grep
immediately before writing migration 197, per this codebase's own
"repository reality beats handover narrative" discipline, found
`OrgChartClient.tsx`'s drag-and-drop `persistChange()`: a second,
genuinely unconditional edit surface on the SAME rows (reassigning
`line_manager` by dragging one person onto another). Guarding only the
form's own save would have left the race **half-closed**: a form save
that wins its own conditional check could still be silently
overwritten a moment later by the drag-and-drop's unguarded write, or
vice versa. Both are now guarded. The plan doc's own C1.12 section was
corrected in place to record this, rather than left to mislead a
future reader.

The bulk CSV import inside the same `OrgChartClient.tsx` file
(`ImportModal`'s per-row reconcile-with-CSV update) is deliberately
**left unguarded** — not an oversight, a documented, already-accepted
limitation from Phase 21 Group 4 ("the by-name matching... left
untouched as outside this phase's safe, minimal scope"), and a bulk
"make this row match the CSV" reconciliation is a genuinely different
act from two humans independently drafting changes to the same record
— the actual risk Phase 1 §H names. Two leave-token rotation routes
also write this table and are left unguarded too: a narrow, single-
field security rotation is never in practice racing a full HR edit on
the same fields, and any concurrent write still correctly bumps
`row_version` regardless, so the edit form's own lock stays safe
against them — it may simply refuse slightly more often than strictly
necessary, the accepted cost of a whole-row version lock every
`row_version` implementation in this codebase already carries.

## Adversarial review (this group)

Beyond the OrgChartClient finding above (caught mid-Group-2, not held
back for a separate pass), a dedicated adversarial review before
writing this handover found and closed one real test-coverage gap,
mutation-tested:

- **The resend route's existing 2-test suite never exercised the
  staff-allowed path at all** — only `client_admin` (allowed) and
  `client_user` (refused). Since the Group 1 edit to this ONE route
  specifically touches how staff are recognised (the inline
  `role === 'tps_admin'` derivation, unique among the 9 converted
  sites), this was the one site genuinely at risk of a silent
  regression the existing suite could not have caught. A new test case
  (`role: 'tps_admin'` → 200) was added and mutation-verified: reverted
  the derivation to `isTpsStaff: false`, watched the new case fail
  (403 instead of 200), restored, re-verified green.
- **Cross-tenant scoping on both new row_version UPDATE call sites**:
  neither relies on the client-side filter alone for isolation — both
  predate and postdate this change with RLS (`company_id =
  my_company_id() AND is_company_super_user() OR is_tps_staff()`) as
  the real boundary, unchanged by this migration; the client-side
  `.eq('company_id', ...)` on `OrgChartClient.tsx`'s write (preserved
  from the original code) and the absence of one on
  `EmployeeRecordsClient.tsx`'s write (also preserved, unchanged from
  before this fix) are both pre-existing, not introduced or worsened
  here.
- **Lost-race UX**: on a lost race, neither call site closes its form —
  `EmployeeRecordsClient.tsx` keeps the drawer open with the user's
  typed edits intact (an `alert()` tells them to refresh and redo);
  `OrgChartClient.tsx` rolls its optimistic UI update back via
  `router.refresh()`. Neither destroys in-progress work silently.
- **True concurrent transactions**: Postgres row-level locking means a
  genuinely simultaneous pair of UPDATEs serialises — the second
  transaction blocks until the first commits, then evaluates `OLD`
  fresh, so the forcing trigger's `OLD.row_version + 1` is correct
  under real concurrency, not just sequential requests. The same
  reasoning this codebase already relies on for 123/124/125/176/190.
- **`isCompanySuperUser()`'s own OR-vs-AND mutation** was caught and
  restored during Group 1 itself (`companySuperUserSql.test.ts`'s own
  "is an OR, never an AND" test) — re-confirmed still passing here.

Everything else checked and found clean: the live probe for migration
197 (5/5 checks, a rolled-back transaction, zero leftover rows
confirmed afterward) proves the trigger overwrites a caller-sent
`row_version` unconditionally, a stale conditional update is a genuine
0-row no-op with the stale write never landing, and a fresh conditional
update succeeds and advances the version; `employeePrivate.test.ts`'s
grant-list pin now reads the UNION of 131's and 197's own grant
statements rather than only 131's, so a future edit to either cannot
silently drift `EMPLOYEE_SAFE_COLUMNS` out of step with what is
actually granted.

## Known remaining issues, with severity

None carried forward as new gap-ledger rows. Both findings above (the
OrgChartClient gap, the resend-route test-coverage gap) were found and
closed within this same phase, not deferred.

## Full regression

tsc clean both apps throughout every group and after the adversarial
additions. Final counts: portal vitest **912 passed / 65 test files**
(up from 903 at the start of the phase — Group 1 added
`companySuperUserSql.test.ts` (8); Group 2 added
`employeeRecordsRowVersionSql.test.ts` (8) and widened
`employeePrivate.test.ts` (unchanged count, same 9 cases, now pinning
both migrations); the adversarial pass added 1 more to the resend
route's own suite); admin vitest **1821 passed / 181 test files**,
unchanged — this phase touched no admin file. All six CI guards pass:
`check-shared-dupes.sh` — 72 shared-dupe pairs, unchanged (every file
this phase touched is portal-only, none are shared-dupe pairs);
`check-row-cap.sh` — clean; `check-route-validation.sh` — 44
unvalidated routes, unchanged; `check-admin-routes-linked.sh` — 43
static admin routes, all reachable, unchanged (this phase touched no
admin route); `check-blind-updates.sh` — **101, down from 102**
(`OrgChartClient.tsx`'s drag-and-drop write is now counted;
`EmployeeRecordsClient.tsx`'s was already recognised safe by the
guard's own heuristic via its pre-existing `.select().single()`, so
adding `{ count: 'exact' }` there did not change its classification) —
the ratchet's own baseline was lowered in the same commit, per the
script's own instruction; `check-paged-order.sh` — clean, no
regression. Both production builds compile (portal's one prerender
failure is the long-documented, sandbox-only missing-
`NEXT_PUBLIC_SUPABASE_*`-env-var limitation on `/auth/reset-password`,
unrelated to this phase and present since Phase 5 — confirmed
"Compiled successfully" completes cleanly before that unrelated page's
static-export step fails).

Migration 197 applied live and verified (not trusted from the apply
call's own success response): the column, its NOT NULL default, the
additive grant, both triggers, and both functions' `SECURITY INVOKER`
status all read back directly from `information_schema`/`pg_trigger`/
`pg_proc`. Live-probed in a rolled-back transaction
(`supabase/probes/197_employee_records_row_version.sql`, 5/5 checks,
zero leftover rows confirmed after rollback).

## Gate status

**PASS.** Both gap-ledger rows assigned to this phase are fully closed
with test and live-database evidence. A mid-implementation re-survey
(not a separate, later adversarial pass) found the plan doc's own
first-draft C1.12 investigation was incomplete and corrected it before
shipping, closing a second genuine race surface (`OrgChartClient.tsx`)
rather than leaving the fix half-done. A dedicated adversarial review
before writing this handover found one real, mutation-tested test-
coverage gap in the resend route and closed it within this same phase.

**Phase 29 may begin** once this branch merges, per the Master Spec's
own sequential-gate rule. Its scope should be read fresh from
`docs/CORE_OS_360_COMPLETION_MATRIX.md`'s own gap ledger rather than
assumed, following the same "repository reality beats handover
narrative" discipline this phase and every phase since Phase 20 has
used.
