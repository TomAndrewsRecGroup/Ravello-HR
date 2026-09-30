# Core-OS 360 Phase 27 Handover — Board Assurance completion

Part of the Core-OS 360 Completion Programme (Phases 20-29), per
`Core-OS 360_Remaining-Phases_Claude-Code_Master-Spec.docx`. Closes
all three gap-ledger rows Phase 20 assigned to Phase 27 (C13.6,
C13.7, C13.8), read fresh from `docs/CORE_OS_360_COMPLETION_MATRIX.md`'s
own gap ledger at the start of this phase — the "repository reality
beats handover narrative" discipline every phase since Phase 20 has
used, not assumed from any prior summary. Full survey and design
reasoning: `docs/CORE_OS_360_PHASE27_PLAN.md`.

## What was required

Per the completion matrix's own gap ledger for this phase:

1. A cross-client consultant assurance dashboard — current/overdue/
   missing/deteriorating, with drilldown to the client (C13.6).
2. A draft Board Assurance report regenerate/refresh flow, before
   issue (C13.7).
3. A Core 360 Status view across six named domains — People, Plant,
   Training, Risk Controls, Environmental, Contractors (C13.8).

## What was found before any code was written

- **`report_data` on `board_assurance_reports` (178) is an immutable
  JSONB snapshot once inserted** — `board_assurance_reports_guard()`
  (a `BEFORE INSERT OR UPDATE` trigger) refuses any change to it
  regardless of status, and refuses un-issuing. It has **no `AFTER
  DELETE` branch at all** — there is nothing to protect once a row is
  gone, and the staff `FOR ALL` RLS policy already permits a staff
  session to delete a row outright. `UNIQUE (company_id, year,
  quarter)` meant `POST /generate` always 409'd the moment ANY row
  already existed for a period, draft or issued, with **no
  delete/regenerate control anywhere in the product** — confirmed by
  reading the route and the admin UI before writing anything.
- **No consultancy/portfolio-wide read of `board_assurance_reports`
  exists anywhere** — grepped `portal/src/app/(portal)/consultancy/`
  and `portal/src/lib/consultancy/`, zero references. The table's own
  RLS has exactly two policies: staff `FOR ALL`, and a client read
  limited to `status = 'issued' AND company_id = my_company_id()` —
  the ACTIVE org, which a portfolio-wide consultant who has not
  switched into a specific client can never satisfy (the same
  Phase 6-established architectural fact every portfolio-wide read in
  this codebase since has had to work around).
- **`lib/health/portfolioCounts.ts`** (Phase 6, shared-dupe pair since
  Phase 18) already computes 13 cross-tenant counts at read time, but
  has **no training-expiry count and no risk-control-effectiveness
  count** — genuinely missing signals, not merely unexposed ones.
- **`lib/riskGraph/intelligence.ts`** (Phase 8, shared-dupe pair since
  Phase 23) already computes `uncoveredHazards`/
  `ineffectiveSharedControls` — exactly the Risk Controls domain's own
  raw material, already built, never wired into a domain-status view.
- **`training_records`** (migration 111) has `company_id`,
  `expires_on` but no existing cross-client or per-domain aggregate
  read anywhere.
- **A real finding, checked live rather than assumed**: the Phase 18
  Assurance Today portal page's own header comment claims "contractors/
  permits/isolations/consultancy_visits do not [have a client-read
  policy]" — true for permits/isolations, but checked live against the
  actual migration text and found FALSE for contractors and
  consultancy_visits. `contractors_manage`/`contractor_insurances_manage`
  (150) already grant any session holding `contractors.manage` on its
  own `company_id` — which `client_admin` has held since Phase 4 via
  the `organisation_admin` role mapping (confirmed live by Phase 22's
  own contractors-portal-UI work) — and `consultancy_visits_client_read`
  (168, `client_organisation_id = my_company_id()`) has existed since
  Phase 6 and was never dropped or redefined. Since the Core 360
  Status page's Contractors domain depends entirely on an accurate
  `contractor_expiring` count, this phase's own portal reads include
  these tables properly under the client's own session rather than
  passing empty arrays the way the older, narrower-purposed Phase 18
  page does (that page's own choice remains correct for what IT
  renders; this is a finding about THIS phase's own needs, not a
  defect in Phase 18's unrelated page).

## What was built

### Group 1: draft Board Assurance report regenerate (C13.7)

`POST /api/admin/board-assurance/generate` gains an optional
`regenerate: true` flag. When set and an existing row is found for
that (company, year, quarter): an `issued` row is refused outright
(409) — a distributed, signed-off document is never rewritten, the
same "material change is a new row/new period" discipline every other
document table in this codebase applies; a `draft` row is removed via
a conditional, counted DELETE (`.eq('id', existing.id).eq('status',
'draft')`, `{ count: 'exact' }`) before the normal insert proceeds — a
concurrent issue between the read and the delete leaves the count at
0, refused with a fresh 409 rather than silently inserting a second,
duplicate-period row. `BoardAssuranceClient.tsx` gains a "Regenerate"
button next to "Issue", shown only on `draft` rows. No migration
needed — `board_assurance_reports_staff_all` (178) is already `FOR
ALL`, which already includes DELETE.

### Group 2: cross-client consultant assurance dashboard (C13.6)

`lib/consultancy/boardAssuranceStatus.ts` (portal-only — no admin-side
cross-client consultancy reader exists to share this with):
`classifyBoardAssuranceStatus()`, pure, classifies every authorised
organisation into `missing` (no row of any status, ever), `overdue`
(no `issued` report for the CURRENT quarter, and the quarter is at
least `OVERDUE_GRACE_DAYS` (15) days old), or `current` — plus an
orthogonal `deteriorating` flag read straight off the most recent
ISSUED report's own already-computed `report_data.trend`, never
re-derived. `lib/consultancy/loadBoardAssuranceStatus.ts` reads with
the service role, scoped to `portfolioOrgIds()`, via `readAllPages()`.
`/consultancy/board-assurance`: three columns (Missing/Overdue/
Current), each client linking to Client 360. Client 360 gains its own
Board Assurance summary card, calling the identical
`classifyBoardAssuranceStatus()` so the dashboard and the per-client
card can never disagree about a bucket.

### Group 3: Core 360 Status computation (C13.8)

`lib/core360Status/assemble.ts` (new shared-dupe pair): a pure
composition, sibling to `complianceTwin/assemble.ts`/`assurance/
today.ts` — computes no new raw fact beyond two small, genuinely
missing counts (training-record expiry, open environmental spills /
waste-movement non-conformances). No AI anywhere — every domain band
(`ok | attention | critical`) is a fixed, named-threshold `if`-chain
over inspectable counts, and `overallBand` is the worst of the six
domains. Genuinely NOT a duplicate of the Digital Twin (Phase 12) or
Assurance Today (Phase 18) — both are explicitly narrower predecessors
(C18.4's own note in the matrix), reusing their already-computed
inputs (`PortfolioCounts`, `RiskGraphIntelligence`) rather than
inventing new raw facts a third time.

### Group 4: Core 360 Status UI (C13.8)

`Core360StatusView.tsx` (new shared-dupe pair, the exact
`ComplianceTwinView.tsx`/`AssuranceTodayView.tsx` shape). Admin: a new
`HsCompanyTabs.tsx` tab plus `lib/core360Status/loadStatus.ts`
(admin-only loader composing `loadPortfolioCountsForCompany()`, a
fresh Risk Graph read matching every other Risk Graph consumer in this
codebase, and the two new training/environmental reads). Portal: a
read-only `/protect/core-360-status` page, gated by `protect` alone,
reading contractors/contractor_insurances/consultancy_visits/
environmental_permits/management_reviews/service_requests properly
under the client's own session per the RLS finding above. Link
targets: People and Training have no admin-side page of their own
(workforce and training records are managed only through the portal's
LEAD workspace, staff included — the exact "Hazards and risk
assessments have no admin-side per-record page" precedent Phase 8's
own risk-graph page already established), so the admin page links out
to the portal for those two; Plant, Risk Controls, Environmental and
Contractors all have a real admin tab already and link internally.

## Adversarial review (this group)

A dedicated adversarial pass across all four groups, before writing
this handover, found **one real Medium-severity defect and fixed it**:

- **The People domain hid the broader `workers_not_ready` count
  behind the narrower `safety_critical_gaps` one — the exact bug class
  Phase 23's own Compliance Twin adversarial pass already found and
  fixed once, reintroduced here.** `assemble.ts`'s first version used
  a ternary (`safety_critical_gaps > 0 ? [safety-critical message] :
  workers_not_ready > 0 ? [not-ready message] : [clean message]`), so
  a client with BOTH a safety-critical gap AND several other not-ready
  workers would only ever see the narrower count — under-reporting the
  true scope of a `critical`-banded domain. The two counts are
  independently derived over the same `person_deployment_status` rows
  (`countBy()` runs two separate predicates — `status !== 'READY'` vs.
  `result.summary.safety_critical_gap === true`), not a guaranteed
  subset relationship at the type level, so hiding one behind the
  other risked genuinely losing information a reader needed. Fixed to
  the same independent-`if`-push pattern the Training and Environmental
  domains in the same file already used correctly from the start:
  both facts are now reported whenever both apply, the standing "a red
  domain still reports every true amber-level fact" discipline.
  **Mutation-tested**: the fix was reverted, a new test (`a critical
  People domain still reports the broader not-ready count too, never
  hiding it behind the narrower safety-critical one`) was confirmed to
  fail against the reverted code, then the fix was restored and
  re-verified passing. Risk Controls, checked against the identical
  concern, was already correct from the start (independent `if`
  pushes, never a hiding ternary).
- **Company-scoping audit**: every `supabase.from(...)` call in both
  `lib/core360Status/loadStatus.ts` (admin) and `/protect/
  core-360-status/page.tsx` (portal) was checked for an explicit
  `.eq('company_id', ...)` / `.eq('client_organisation_id', ...)`
  filter. Every one carries it, except two deliberate, safe exceptions
  in each file: `legal_requirements` (the staff-only global catalogue,
  scoped upstream via an already-company-filtered `requirementIds`
  list, and read only in the admin loader where staff RLS grants no
  cross-tenant protection of its own — so this filter really is the
  only thing preventing a leak there, and it is present) and
  `contractor_insurances` (no `company_id` column of its own; scoped
  via `contractor_id`, itself derived from an already-company-filtered
  `contractors` read, matching the existing `loadPortfolioCounts.ts`
  precedent exactly). This matters more in the admin loader than the
  portal page: the admin loader runs as staff, whose RLS (`is_tps_
  staff()`) grants access to every company, so its own explicit
  filters are the ONLY thing standing between it and a cross-tenant
  leak; the portal page runs under the client's own session, where RLS
  is a backstop even if a filter were ever missing.
- **Race safety of the Group 1 regenerate flow, re-traced**: two
  concurrent `regenerate: true` calls for the same draft both read the
  same `existing` row, but only one DELETE can actually remove it —
  the loser's conditional `.eq('id', ...).eq('status', 'draft')` then
  matches zero rows (the row is already gone), correctly surfacing the
  "this draft changed while regenerating" 409 rather than proceeding
  to a duplicate insert. No double-delete, no duplicate-period row
  possible.
- **Auth on the one write path this phase touches**: `POST
  /api/admin/board-assurance/generate` (extended by Group 1) still
  calls `requireStaff()` before anything else, unchanged.

Everything else checked and found clean: `BoardAssuranceReportSummaryRow`'s
`overall_band`/`trend` are read straight off each report's own
already-computed `report_data`, never re-derived; the dashboard's
grace-window boundary is `>=`, not `>`, matching the intended "day 15
onward is overdue" semantics; a draft-only row for the current quarter
correctly counts toward `everHadAnyReport` but never toward
`currentPeriodIssued`; `Core360StatusView.tsx`'s `links` prop is fully
supplied with all six domain keys in both the admin and portal pages
(caught by `tsc`, not merely assumed); no component in this phase
writes anything — both new UI surfaces (`/health-safety/<companyId>/
core-360-status`, `/protect/core-360-status`) are entirely read-only.

## Known remaining issues, with severity

None carried forward as new gap-ledger rows. The one Medium finding
above was found and fixed within this same phase, not deferred.

## Full regression

tsc clean both apps throughout every group and after the adversarial
fix. Final counts: admin vitest **1821 passed / 181 test files** (up
from 1799 at the start of the phase — Groups 1 and 3 each added tests,
Groups 2 and 4 are UI/route-glue with no new admin test file, the
established "no component-level test" convention; the adversarial fix
added 1 more); portal vitest **895 passed / 63 test files** (up from
862 at the start of the phase — Group 2's `boardAssuranceStatus.test.ts`,
Group 3's `assemble.test.ts` mirrored to portal, Group 4's sweep-test
pickups, plus the adversarial fix's 1 new case). All six CI guards
pass: `check-shared-dupes.sh` — **72 shared-dupe pairs**, up from 70
(`core360Status/assemble.ts` and `Core360StatusView.tsx` newly
registered); `check-row-cap.sh` — clean; `check-route-validation.sh` —
44 unvalidated routes, unchanged; `check-admin-routes-linked.sh` — 43
static admin routes, all reachable, unchanged (the new admin route is
dynamic, needing no literal-reference check); `check-blind-updates.sh`
— 102 blind-update chains, unchanged (this phase's only write — the
Group 1 conditional DELETE — is not an UPDATE and this guard does not
track it; every other new surface is read-only); `check-paged-order.sh`
— clean, no regression. Both production builds compile (portal's one
prerender failure is the long-documented, sandbox-only missing-
`NEXT_PUBLIC_SUPABASE_*`-env-var limitation on `/auth/reset-password`,
unrelated to this phase and present since Phase 5 — confirmed
"Compiled successfully" completes cleanly before that unrelated page's
static-export step fails).

No migration anywhere in this phase — every group composes already-
live schema (`board_assurance_reports`, `training_records`,
`environmental_spills`, `waste_movements`, `contractors`,
`contractor_insurances`, `consultancy_visits`, the Risk Graph's own
tables) with no new column, table or RLS policy. Confirmed, not
assumed, per the plan doc's own stated expectation before Group 1
began.

## Gate status

**PASS.** All three gap-ledger rows assigned to this phase are fully
closed with test evidence. A dedicated adversarial review pass across
all four groups found one real Medium-severity defect (the People
domain's hidden-lesser-fact bug, the same class Phase 23 already fixed
once in a sibling module) — found, mutation-tested, fixed and
re-verified within this same phase before this handover was written,
not carried forward as debt.

**Phase 28 may begin** once this branch merges, per the Master Spec's
own sequential-gate rule. Its scope should be read fresh from
`docs/CORE_OS_360_COMPLETION_MATRIX.md`'s own gap ledger rather than
assumed, following the same "repository reality beats handover
narrative" discipline this phase and every phase since Phase 20 has
used.
