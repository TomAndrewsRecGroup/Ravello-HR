# Core-OS 360 Completion Programme, Phase 28: UX/navigation/legacy-role
# closure + optimistic locking (C1.12, C1.13)

No detailed operator brief exists for this phase (the same situation
every phase since 8 has been in). Scope read fresh from
`docs/CORE_OS_360_COMPLETION_MATRIX.md`'s own gap ledger, not assumed
from any prior phase's handover: exactly two rows are assigned here —
**C1.12** ("optimistic locking on shared records" — the general
hardening left over after Phase 24 Group 1 closed the
`consultancy_visit_reports` slice) and **C1.13** ("UI still uses
legacy role checks in places" — Phase 1 handover §H, item 1).

This document records a live-code investigation performed BEFORE
writing anything, per this codebase's own "survey scope against live
code before building" discipline (Phase 20, 26, 27 all opened the same
way) — and the investigation changed the shape of the work
substantially from what the debt item's own wording implies.

## What Phase 1's §H actually said

> 1. **`role === …` checks in app code were not rewritten to
>    capabilities.** There are about 30 portal sites... The database
>    is the boundary, so this is UI courtesy only.
>    - Consequence: a `read_only` consultant can see Save buttons
>      whose writes the database refuses with a 42501.
> ...
> 9. **There is no optimistic locking.** Two people editing the same
>    employee means the last write wins. This was pre-existing.

## C1.13: the investigation

A repo-wide grep for `role === 'client_admin'`-shaped UI gates in the
portal app (excluding the unrelated `role: 'admin'|'portal'`
caller-context parameter used by the `ConnectionsPanel.tsx`/
`RiskGraphClient.tsx`/`EvidenceEngineClient.tsx`/`entityLabels.ts`
shared-dupe family, and excluding `IncidentReportForm.tsx`'s
`p.role === 'injured_person'`, an unrelated domain field on an
incident-report person row) found **8 real UI-gating sites**:
`policy-acknowledgements`, `offboarding`, `onboarding`, `org-chart`,
`employee-records`, `hire/internal`, `calendar`, `billing`.

For each, the backing table's LIVE RLS (read via `pg_policies`, this
codebase's own standing rule that a migration file on disk is a record
of intent, not what the database contains) was checked, not assumed:

| Page | Backing table(s) | Live write RLS |
|---|---|---|
| policy-acknowledgements | `policy_acknowledgements` | `is_company_super_user() OR is_tps_staff()` |
| offboarding | `offboarding_instances`/`_templates` | same |
| onboarding | `onboarding_instances`/`_templates` | same |
| employee-records | `employee_records` | `is_company_super_user() OR is_tps_staff()` |
| org-chart | `employee_records` | same |
| calendar | `company_calendar_events` | same |
| hire/internal | `requisitions` (unrestricted by role) + `employee_records` (super-user) | mixed |
| billing | no direct write; page-level redirect | matches the same predicate, by its own comment |

**Every one of these tables is gated by `is_company_super_user()`** —
a function that has never been migrated onto the Phase 1 capability
model at all: `SELECT get_my_role() = 'client_admin'`. There is no
finer `people.write`/`documents.manage`/`training.manage` capability
that actually governs any of these tables' writes today — inventing
one in the UI would be adding a false abstraction, not closing a real
gap.

**The "42501" scenario does not reproduce.** `get_my_role()` is
ALREADY grant-aware — verified by reading its own live definition and
`access_roles.legacy_role`: a `read_only` grant resolves
`legacy_role = 'client_user'`, never `'client_admin'`, so a read-only
consultant acting in a client organisation correctly gets `isAdmin =
false` on every one of these 8 pages. `get_my_role()` is also what
`middleware.ts` calls to mint the session cookie's `role` claim
(confirmed by reading the middleware's own RPC call), and switching
organisations deletes the cookie outright (`organisation/switch/
route.ts`) so the next request re-derives it fresh — there is no stale
cache window where an old, wrong role claim could survive a switch.

So the literal, named failure mode in Phase 1's own §H — a button
shown that the database then refuses — is **not live** for any of
these 8 pages today. This is not a claim that C1.13 was already
closed; it is a correction, in the same spirit as Phase 21 Group 4's
"bulk CSV import already existed" and Phase 20's own stale-comment
correction: the debt item's premise doesn't hold as stated, and
re-deriving the same understanding from scratch every time it's
touched would be wasted work.

### What IS real and worth fixing

- **Duplication drift risk.** The identical `role === 'client_admin'
  || role === 'tps_admin'` (or `isTpsStaff` in one case, `isAdmin ||
  role === 'client_editor'` in another) is independently spelled out
  seven times. A future change to what counts as a company's
  super-user — the actual, intentional definition, not a capability
  substitute — is a seven-file hunt today. Group 1 consolidates this
  into ONE named, tested helper.
- **`hire/internal`'s single `isAdmin` prop is used for two
  DIFFERENT DB authorisations** (an unrestricted `requisitions` write
  and a super-user-gated `employee_records` write) — left AS IS. The
  DB being looser on `requisitions` than the UI does not mean the UI
  should widen to match: which staff may propose an internal role
  listing is a product choice, not a capability-migration gap, and
  changing who can see that button is out of this phase's scope
  (fixing legacy-role UI debt, not making an unrequested access
  decision).
- **Admin app**: checked and found clean — every `role === ` site
  there is either the same `role: 'admin'|'portal'` caller-context
  parameter, or `(admin)/layout.tsx`'s deliberate `tps_admin`-only
  gate, which is correct by design (`ADMIN_APP_ROLES = [STAFF_ROLE]`,
  Phase 5's own H&S-staff-delivered pivot) — admin has no
  portfolio-consultant concept to get wrong.

## C1.12: the investigation

The three tables already checked in Phase 24 Group 1
(`consultancy_visit_reports` closed, `consultancy_service_scopes`/
`consultancy_visits` found to need no lock) are the only prior work.
Phase 1 §H's own item 9 names the next candidate explicitly: "two
people editing the same employee means the last write wins."

Checked live: `employee_records` has no `row_version` column.
`EmployeeRecordsClient.tsx`'s save handler (the only real edit-form
UPDATE site on this table — the other two `.update()` call sites
across both apps are the offboarding-start route's `end_date` stamp
and the reminders cron's automated `employee_terminated` write,
neither a concurrent-edit risk) is an unconditional
`.update(body).eq('id', editingId)` with no version check at all —
confirmed, not assumed: the exact "last write wins" scenario Phase 1
described. This is the one genuine, live gap. Closed in Group 2 with
the established 123/190 pattern: `row_version` forced by a BEFORE
INSERT OR UPDATE trigger regardless of caller input, a conditional
`.eq('row_version', ...)` client update, a clear message on a lost
race.

No other table surveyed (the 8 pages' backing tables above, all
super-user-single-editor in practice) showed the same multi-editor
risk profile `employee_records` has — HR data genuinely is edited by
more than one admin over time, unlike e.g. `company_calendar_events`.

## Groups

1. **C1.13**: `portal/src/lib/auth/companyAdmin.ts` — one function,
   `isCompanySuperUser({ role, isTpsStaff })`, mirroring
   `is_company_super_user() OR is_tps_staff()` exactly; a SQL-shape
   test pins it against the live predicate text. All 7 duplicated
   sites (the 8th, `hire/internal`, already spells the `isTpsStaff`
   form correctly and is left untouched since splitting its two
   authorisations is out of scope) call the shared helper instead.
2. **C1.12**: migration 197 — `employee_records.row_version`, the
   guard trigger, the additive `GRANT SELECT (row_version)`
   (`employee_records` is column-grant-restricted since 131 — a new
   column needs its own grant, unlike a table with a plain `GRANT
   SELECT`). `EMPLOYEE_SAFE_COLUMNS` gains the column.
   `EmployeeRecordsClient.tsx`'s save becomes a conditional, counted
   update; a lost race surfaces the established "someone else changed
   this record" message.
3. Full regression, adversarial QA, handover, PR, merge.
