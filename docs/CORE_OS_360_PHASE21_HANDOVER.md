# Core-OS 360 Phase 21 Handover — People, LMS, Competency & Safe-to-Deploy Closure

Part of the Core-OS 360 Completion Programme (Phases 20-29), per
`Core-OS 360_Remaining-Phases_Claude-Code_Master-Spec.docx`. Closes the
five gap-ledger rows Phase 20 assigned to Phase 21: C1.10, C3.7, C3.8,
C3.9, C3.10.

## What was required

Per the Master Spec's own "Mandatory engineering requirements" for this
phase:

1. Fix employee/person document linkage through the UI (expiry,
   evidence type, verification, secure storage).
2. Complete E-Learning mapping: course admin sets `learning_content_id`.
3. `hs_tests` pass events satisfy the intended training requirement via
   an explicit, auditable `course_id` mapping.
4. Complete the lifecycle: requirement → gap → assigned learning →
   completion → evidence → training record → requirement status.
5. Complete employee self-service policy acknowledgement; no staff
   impersonation without an audited exception.
6. Verify requirement effective-dates/versioning/supersede and
   historical Safe-to-Deploy reconstruction.
7. Complete reports/exports: training compliance/expiry, competency,
   qualifications, Safe-to-Deploy, induction, OH due dates, site/role
   compliance, safety-critical gaps.
8. Person Compliance PDF/export, excluding clinical detail unless
   authorised.
9. Verify/implement controlled CSV imports for people/training/
   competency.
10. Every readiness calculation fails safe to REVIEW_REQUIRED/
    NOT_READY, never READY, on missing/failed evidence.

## What was found before any code was written

An Explore-agent audit of all ten items, followed by first-hand
verification of every claim before acting on it (per the Master Spec's
own rule and this repo's standing "repository reality beats handover
narrative" discipline), found:

| # | Item | State found |
|---|---|---|
| 1 | Employee documents ↔ person | **PARTIALLY BUILT** — `person_id`/`employee_id` columns and the guard trigger existed (142); no UI ever set them |
| 2 | `learning_content_id` in course admin | **NOT BUILT** — column existed since 133, completely orphaned |
| 3 | `hs_tests` → `course_id` | **NOT BUILT** — no column, no mapping at all |
| 4 | Requirement→learning→status lifecycle | **PARTIALLY BUILT** — evidence/verification/status wired end to end; "see a gap → assign a specific course" step missing |
| 5 | Policy acknowledgement self-service | **FULLY BUILT** — verified, no change made |
| 6 | Requirement versioning + historical STD | **FULLY BUILT** — verified, no change made |
| 7 | Reports/exports | **Initially reported NOT BUILT by the audit; corrected on direct inspection — see Group 5** |
| 8 | Person Compliance PDF | **Initially reported NOT BUILT by the audit; corrected on direct inspection — see Group 5** |
| 9 | Bulk CSV import for people/competency | **Initially reported PARTIAL by Phase 20's own matrix; corrected on direct inspection — see Group 4** |
| 10 | Fail-safe readiness | **FULLY BUILT** (Phase 3's own standing rule, `_wf_deployment_safe`) — verified, no change made |

Items 7-9 are the important lesson of this phase: an Explore-agent's
directory-scoped `grep` search is not the same thing as verifying the
actual implementation. All three were later found to already exist,
in places the initial search did not look (client-side CSV downloads
inside page components rather than API routes; a browser-print page
under a route named `print`, not `export` or `pdf`; a CSV importer
inside the Org Chart page, not `lib/workforce/`). Each correction is
documented with file:line evidence below and in the completion matrix.

## What was changed, by group

### Group 1 — hs_tests course mapping, E-Learning course link, employee-document person linkage (migration 183)

- `hs_tests.course_id` (nullable, must reference a **standard/global**
  `training_courses` row — `hs_tests_course_guard()` refuses any other
  kind, since a test is assigned across many client companies and a
  company-specific course would fail `assert_catalogue()` for every
  other company the moment a pass tried to log it).
  `hs_test_submission_after()` now carries `course_id` onto the
  auto-logged `training_records` row and stamps `source = 'hs_test'`
  (a value the CHECK already allowed but nothing set) — closing the
  gap that made a passed test structurally invisible to
  `_wf_judge`'s `'training'` branch (`t.course_id = p_ref`).
- Admin: a course picker on the "certifies training" test-creation
  form, only standard courses listed; surfaced on the test bank list
  and detail page.
- Portal: the workforce Courses catalogue gained an optional
  "E-Learning content" picker (`learning_content_id`), reading
  published `learning_content`.
- Employee documents: both the admin HR-tab upload form and the
  portal's Employee Documents page gained an "Employee record" picker
  setting `employee_id`, which `employee_document_person_guard()`
  (142) already derived `person_id` from — the trigger was correct,
  waiting for a caller that populated the column. A staff upload
  (service role) is auto-marked `filed_by_authorised = true` the
  instant `person_id` is set — no separate "verify" UI needed; see
  Group 2.

Live-probed (`supabase/probes/183_hs_tests_course_mapping.sql`),
7/7 checks.

### Group 2 — one-click "Assign learning" from an unmet requirement

`AssignLearningButton` on the person profile's requirement table:
inserts a `development_items` row (`source_type: 'competency_gap'`,
`linked_course_id`/`linked_competency_id` from the requirement's own
`reference_id`) — the exact insert shape `AddDevelopmentForm` already
used, pre-filled instead of hand-typed. Shown only for a genuinely
unmet training/competency requirement, gated on `training.manage`,
hidden on a historical (`as_of`) view.

Document verification needed no separate UI: `employee_document_
person_guard()` (142) already derives `filed_by_authorised` from the
session's own identity — Group 1's picker wiring closes that half
structurally.

### Group 3 — people synced back from source rows (migration 184, closes C1.10)

`person_sync_from_source()`: a new AFTER UPDATE trigger on
`candidates`/`athletes`/`employee_records`. `person_link_row()` (118)
only ever linked or created the `people` row once, at INSERT; an edit
made afterward (a corrected name, a new job title, a department move)
silently drifted `people` out of step forever — the row the
Safe-to-Deploy engine, the profile page and every export actually
read.

- `full_name`/`email` always overwrite (both NOT NULL on the source
  side; a corrected typo must always win).
- `phone`/`job_title`/`employee_number`/`department_id`/`site_id` only
  fill a gap (`COALESCE`), mirroring `person_link_row()`'s own
  INSERT-time behaviour exactly.
- Never raises — the source edit must always succeed even if the
  people-row update fails for any reason.
- A no-op when the source row has no `person_id`.

Live-probed (`supabase/probes/184_people_sync_back.sql`), 8/8 checks.

### Group 4 — correction: bulk people CSV import already existed (closes C3.10)

`portal/src/lib/workforce/importCsv.ts:15-17` already covers training,
competency **and credential** (all three `IMPORT_KINDS`), not
"training only" as Phase 20's own matrix claimed.
`portal/src/app/(portal)/lead/org-chart/OrgChartClient.tsx:318-368`
already has a working bulk people-creation CSV import (add new +
update existing, matched by name) — RFC4180-ish quoted-comma parsing,
a header-aliasing scheme, a download-template button. Phase 20's
search was scoped to `lib/workforce/`/`lib/lead/` and never looked
inside the Org Chart page, where this feature actually lives.

One small, safe quality fix made rather than a duplicate rebuild: a
row with no name was silently dropped with zero indication; it is now
reported by line number (`OrgChartClient.tsx`'s `parseCsv`), the same
"fix the file first" pattern the existing missing-column warning
already used. Every other part of this live, working feature —
including the by-name matching, which is a real, accepted limitation
(two people sharing a name could collide) left untouched as out of
this phase's safe, minimal scope — is unchanged.

### Group 5 — reports/exports + Person Compliance PDF: verified already built, no code change

Traced every one of the DoD's eight named report categories to an
existing, already-shipped, filterable CSV export:

| DoD category | Existing coverage |
|---|---|
| Safe-to-Deploy | `portal/src/app/(portal)/lead/workforce/page.tsx:82` — `safe-to-deploy.csv`, `WORKFORCE_CSV_COLUMNS` (`lib/workforce/dashboard.ts:92-99`): name, status, role, site, department, required/met/unmet/review/expiring, **`safety_critical_gap`**, reasons |
| Safety-critical gaps | Same export's `safety_critical_gap` column; also `matrix.csv`'s own `safety_critical` column, filterable via the matrix page's `sc=1` URL param |
| Training compliance/expiry, competency, qualifications, induction, site/role compliance | `portal/src/app/(portal)/lead/workforce/matrix/page.tsx` — one filterable export (`workforce-matrix.csv`, `MATRIX_CSV_COLUMNS` in `lib/workforce/matrix.ts:194-200`: person, requirement_type, requirement, status, expires_on, safety_critical) over EVERY `REQUIREMENT_TYPE` (training/competency/qualification/certification/licence/card/permit/induction/…). The page's own `FilterForm` (site/department/role/manager/worker type/**requirement type**/expiring/unmet/safety-critical) filters server-side BEFORE the CSV is built (`csv = matrixCsvRows(m)`, using the already-filtered pivot), so selecting "Requirement type: Training" then downloading genuinely produces a training-only report, with no separate export needed |
| OH due dates | `portal/src/app/(portal)/lead/workforce/occupational-health/page.tsx:81-84` — `health-surveillance.csv`, explicitly "Clinical detail is never shown here" |

Building eight separate, narrower CSV exports covering the exact same
underlying data would have been the "second source of the same fact"
anti-pattern this codebase explicitly avoids elsewhere (the Digital
Twin, the KPI modules, the governance report — all cite this same
discipline). The existing single filterable matrix export, plus the
two purpose-built ones, is the correct design, not a gap.

**Person Compliance PDF**: `portal/src/app/(portal)/lead/workforce/
people/[id]/print/page.tsx:17-20` — its own header comment: "The
printable person compliance record (spec 103). Structured HTML, the
browser's 'Save as PDF' makes the PDF... Occupational health appears
only for a summary reader, as category and dates — no provider, no
restriction text — and nothing clinical is ever fetched." This
satisfies the DoD's own qualifier ("Person Compliance PDF/export
**where existing reporting tooling supports it**") — a jsPDF rebuild
of an already-correct, already-clinical-safe HTML/print document would
have been redundant, higher-risk (a second place the same data could
drift), and explicitly not what the DoD asked for.

An earlier Explore-agent pass had reported both of these as "NOT
BUILT" — its search matched specific function/string names
(`buildPersonCompliancePdf`, API routes containing `csv`) that this
implementation never used, missing the actual, correctly-designed
features. Corrected on direct inspection before writing a line of new
code, exactly the discipline Phase 20 itself modelled for the stale
`runScan.ts` comment.

### Group 6 — this document, final regression, adversarial QA

## Files/routes/migrations touched

- `supabase/migrations/183_hs_tests_course_mapping.sql` (new)
- `supabase/probes/183_hs_tests_course_mapping.sql` (new)
- `supabase/migrations/184_people_sync_back.sql` (new)
- `supabase/probes/184_people_sync_back.sql` (new)
- `admin/src/lib/hs/testTypes.ts` + `portal/src/lib/hs/testTypes.ts`
  (shared-dupe pair, `course_id` added)
- `admin/src/app/api/admin/hs/tests/route.ts`,
  `admin/src/app/api/admin/hs/tests/[id]/route.ts`
- `admin/src/app/(admin)/health-safety/tests/page.tsx`,
  `.../tests/[id]/page.tsx`
- `admin/src/components/hs/TestsClient.tsx`,
  `admin/src/components/hs/TestDetailClient.tsx`
- `admin/src/app/api/admin/employee-documents/route.ts`
- `admin/src/app/api/client-tab-data/route.ts`
- `admin/src/app/(admin)/clients/[id]/ClientDetailTabs.tsx`,
  `.../tabs/HrTab.tsx`
- `portal/src/app/(portal)/lead/employee-docs/EmployeeDocsClient.tsx`,
  `.../page.tsx`
- `portal/src/app/(portal)/lead/workforce/catalogue/CatalogueClient.tsx`,
  `.../page.tsx`
- `portal/src/lib/workforce/requirements.ts`
- `portal/src/app/(portal)/lead/workforce/people/[id]/ProfileForms.tsx`,
  `.../page.tsx`
- `portal/src/app/(portal)/lead/org-chart/OrgChartClient.tsx`
- `admin/src/lib/workforce/__tests__/peopleSyncBackSql.test.ts` (new)
- `admin/src/app/api/admin/hs/tests/__tests__/route.test.ts` (extended)
- `portal/src/lib/workforce/__tests__/requirements.test.ts` (extended)
- `docs/CORE_OS_360_COMPLETION_MATRIX.md`,
  `docs/core_os_360_completion_manifest.json` (corrected)

## Requirement Traceability Matrix rows closed

C1.10, C3.7, C3.8, C3.9, C3.10 — all five of Phase 21's assigned gap-
ledger rows. Phase 21's gap-ledger entry is now empty.

## Automated tests added/changed

- `admin/src/app/api/admin/hs/tests/__tests__/route.test.ts`: +2
  (`course_id` passthrough on insert; defaults to null).
- `admin/src/lib/workforce/__tests__/peopleSyncBackSql.test.ts`: +6
  (new file — pins migration 184's trigger shape, the never-raises
  discipline, the full_name/email-always-overwrite vs.
  COALESCE-preserve split, and that it never touches
  `employee_records.status`, which stays `person_employee_status()`'s
  own job).
- `portal/src/lib/workforce/__tests__/requirements.test.ts`: +5 (the
  `learning_content` field kind, `cellText`'s new lookup parameter).
- Admin suite: **1640 tests, 161 files** (1632 baseline + 8 new).
- Portal suite: **760 tests, 54 files** (755 baseline + 5 new).

## Live probes performed

- `supabase/probes/183_hs_tests_course_mapping.sql` — 7/7 checks: a
  global course accepted; a company-scoped course refused (23514); an
  unknown course id refused (23503); a passed hs_test writes
  `training_records` with the right `course_id`/`source`/
  `verification_status = 'unverified'`; an unmapped test still logs
  with `course_id = NULL` (backward compatible); the CHECK already
  allowed `'hs_test'`; neither new function is anon/authenticated-
  executable.
- `supabase/probes/184_people_sync_back.sql` — 8/8 checks: name/
  email/phone sync on candidates; clearing a nullable field to NULL
  preserves the existing `people` value (never a regression); the same
  for athletes (name/email only — no phone column); employee
  name/job_title/department_id/site_id sync; clearing
  `employee_number` preserves the existing value; editing an unrelated
  column (salary) raises nothing; editing a row with no `person_id`
  raises nothing; no anon/authenticated execute grant.

## Security and tenancy results

No new attack surface was opened. The two write paths this phase adds
UI for (`employee_documents.employee_id`, `hs_tests.course_id`) both
route through pre-existing, already-hardened guards that predate this
phase and were not modified:

- **Cross-tenant person linkage** (`person_same_org_guard()`, 142) —
  `employee_records`/`candidates`/`athletes`.`person_id` has been
  refused cross-organisation since the Phase 3 adversarial security
  review (QA 42, three CRITICAL findings fixed then). Migration 184's
  new AFTER UPDATE trigger fires only after this BEFORE trigger has
  already validated the row, so it can never see an invalid
  cross-organisation `person_id` — proven by trigger execution order,
  not asserted.
- **Cross-tenant document linkage** (`employee_document_person_guard()`,
  142) — already derives `person_id` from `employee_id` with
  `assert_same_org()`; Group 1's picker only populates a column this
  guard already validated.
- **`hs_tests.course_id` cross-tenant risk** (new in this phase, migration
  183): a company-scoped course would have been silently unusable for
  every OTHER company the same test is assigned to (an availability
  bug, not a data leak) — closed by `hs_tests_course_guard()` refusing
  any non-global course outright, live-probed (check 2).
- **`development_items` writes** (`AssignLearningButton`) reuse the
  exact insert shape and RLS boundary `AddDevelopmentForm` already
  used (`training.manage`-gated, `company_id`/`person_id` from
  server-verified page data, never a client-editable field) — no new
  policy, no new attack surface.
- **Self-verification / colleague-forgery**: an hs_test-sourced
  `training_records` row always lands `verification_status =
  'unverified'` (probe check 4) — rule 143 ("a mandatory item always
  needs verified evidence") is unaffected; nothing in this phase
  auto-verifies anything.

Requirement effective-dates/versioning/supersede and historical
Safe-to-Deploy reconstruction (`person_deployment_status(person,
p_as_of)`, `requirement_rule_guard()`) were verified present and
untouched by this phase — no code change, so no new probe; cited
against Phase 3's own original implementation.

## Protected legacy regression results

Not applicable — this phase touched no protected-legacy system
(Referrals, A2I, Development Plans, E-Learning marketplace, Broadcast,
Billing). The E-Learning `learning_content` table (006) was read from
(a new SELECT for the course-catalogue picker), never written to; its
checkout/webhook/purchase flow is completely untouched.

## Known remaining issues, with severity

- **Low (documented, not fixed)**: the Org Chart bulk-people import
  (Group 4) matches update rows by `full_name.toLowerCase()` alone —
  two people sharing a name in the same organisation would collide.
  This is pre-existing, live behaviour; changing the matching key was
  judged outside this phase's safe, minimal scope (a duplicate-name
  organisation is presumably rare, and the fix would change a working
  feature's behaviour for existing users with no reported problem).
  Left as a known limitation, not carried forward as a numbered gap —
  the DoD asked for a working bulk import, which already exists.
- **Everything else** in the original five-item gap ledger is closed;
  no other issue was found in this phase's own adversarial pass.

## Gate status

**PASS.** Rationale: all five of Phase 21's assigned gap-ledger rows
(C1.10, C3.7, C3.8, C3.9, C3.10) closed with live evidence — two by
real, tested, live-probed schema/UI changes (Groups 1 and 3), three by
verified correction of a prior claim that did not match the actual
implementation (Groups 4 and 5, following the exact "repository
reality beats handover narrative" discipline the Master Spec itself
demands). Every readiness/verification/tenancy guard this phase's new
UI writes through is a pre-existing, already-adversarially-reviewed
guard (Phase 3's own QA 42), not a new one built and hoped to be
correct. No Critical or High defect found. tsc clean both apps, full
vitest green (1640 admin, up from 1632; 760 portal, up from 755), all
six CI guards pass, both production builds compile (portal's one
prerender failure is the long-documented, sandbox-only missing-
Supabase-env-var limitation, unrelated to this phase and present since
Phase 5). Two migrations (183, 184) applied and live-probed in rolled-
back transactions, 15/15 checks total.

**Phase 22 (Operational H&S & Client Workflow Closure) may begin**
once this branch merges, per the Master Spec's own sequential-gate
rule.
