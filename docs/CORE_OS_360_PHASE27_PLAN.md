# Core-OS 360 Completion Programme: Phase 27 — Board Assurance completion

No detailed operator brief exists in the repo for this phase (the same
situation every phase since Phase 8 of the original Core-OS 360
initiative has been in). Scope read fresh from `docs/
CORE_OS_360_COMPLETION_MATRIX.md`'s own gap ledger at the start of this
phase: rows **C13.6, C13.7, C13.8**, all originally MISSING and
assigned to Phase 27 by name in the matrix's own C13 section and in
`docs/core_os_360_completion_manifest.json`'s `gap_ledger_by_target_phase["27"]`.

## What was surveyed before any code was written

- **`admin/src/lib/boardAssurance/`** (`computeReport.ts`,
  `loadPortfolioCounts.ts`, `buildReportPdf.ts`) and migration 178
  (`board_assurance_reports`/`board_assurance_acknowledgements`).
  `report_data` is an immutable JSONB snapshot once inserted —
  `board_assurance_reports_guard()` (a `BEFORE INSERT OR UPDATE`
  trigger) refuses any change to it regardless of status, and refuses
  un-issuing. It does NOT gate DELETE at all (no `AFTER DELETE`
  branch, and DELETE needs no guard since there is nothing to protect
  once a row is gone) — the staff `FOR ALL` RLS policy already permits
  a staff session to delete a row outright. `UNIQUE (company_id, year,
  quarter)` means `POST /generate` 409s the moment a row already
  exists for that period, draft or issued, with **no regenerate path
  anywhere in the product** — confirmed by reading the route and the
  admin UI: no delete/regenerate button exists.
- **No consultancy/portfolio-wide read of `board_assurance_reports`
  exists anywhere** — grepped `portal/src/app/(portal)/consultancy/`
  and `portal/src/lib/consultancy/`, zero references. The table's own
  RLS (178) has exactly two policies: staff `FOR ALL`, and a client
  read limited to `status = 'issued' AND company_id = my_company_id()`
  — the ACTIVE org, which a portfolio-wide consultant who has not
  switched into a specific client can never satisfy (the same
  Phase 6-established architectural fact every portfolio-wide read in
  this codebase since has had to work around).
- **`lib/health/portfolioCounts.ts`** (Phase 6, shared-dupe pair since
  Phase 18) already computes 13 cross-tenant counts at read time:
  `open_critical_actions`, `overdue_legal_evaluations`,
  `overdue_controlled_documents`, `open_incident_investigations`,
  `safety_critical_gaps`, `workers_not_ready`, `assets_unavailable`,
  `major_audit_findings`, `contractor_expiring`,
  `environmental_permits_expiring`, `management_reviews_due`,
  `outstanding_service_requests`, `next_consultant_visit_date`. No
  training-expiry count and no risk-control-effectiveness count exist
  in this module — those are genuinely missing signals, not merely
  unexposed ones.
- **`lib/riskGraph/intelligence.ts`** (Phase 8, promoted to a
  shared-dupe pair in Phase 23 Group 2) already computes
  `uncoveredHazards`, `ineffectiveSharedControls`,
  `assessmentsWithIneffectiveControls`, `unlinkedApplicableObligations`
  — exactly the "Risk Controls" domain's own raw material, already
  built, never wired into a cross-client or domain-status view.
- **`training_records`** (migration 111) has `company_id`,
  `employee_id`, `completed_on`, `expires_on` — a plain per-company
  table with no existing cross-client aggregate read anywhere.
- **`portal/src/lib/consultancy/portfolioAccess.ts`**/
  `loadAttentionQueue.ts` is the established portfolio-wide read
  pattern: `requirePortfolioSession()` (DEFINER `portfolio_
  organisations()`, called through the user's own session) →
  `portfolioOrgIds()` → a service-role client scoped by
  `.in('company_id', orgIds)` for every source table, batched via
  `Promise.all`/`readAllPages`. Reused verbatim for both C13.6 and
  C13.8's portal pages.
- **Client 360** (`/consultancy/clients/[id]/page.tsx`) has no board
  assurance section of any kind today — confirmed by reading the file;
  Group 2 adds a summary card there in addition to the standalone
  cross-client dashboard, the same "drilldown chain" precedent Phase
  24 Group 3's site-level page already established.

## Scope decisions, recorded before building

- **C13.7 (regenerate)**: extending `POST /api/admin/board-assurance/
  generate` with an optional `regenerate: true` flag is the minimal,
  correct shape — no new migration. The route first does a
  **conditional, counted DELETE** (`.eq('id', existing.id).eq('status',
  'draft')`, `{ count: 'exact' }`) when an existing row is found; if
  the existing row's status is `issued`, the route refuses outright
  (409) — regenerating a distributed, signed-off document would
  contradict the whole "immutable snapshot" design 178's own header
  comment states. If the conditional delete matches zero rows (a
  concurrent issue happened between the read and the delete), the
  route refuses with a fresh 409 rather than silently proceeding to
  insert a duplicate-period row that would itself just 23505.
- **C13.6 (cross-client dashboard)**: a new portal page,
  `/consultancy/board-assurance`, classifying every authorised client
  into four buckets from their own `board_assurance_reports` history,
  read via the portfolio-wide service-role pattern:
  - **current**: an `issued` report exists for the CURRENT quarter
    (computed from `today`, not stored).
  - **overdue**: no `issued` report for the current quarter, and the
    quarter is at least 15 days old (a period needs SOME time to
    generate and issue a report for; flagging on day 1 of a new
    quarter would be noise) — the same "a grace window before flagging
    overdue" shape `lib/reminders/rules.ts`'s own due-bucket scheme
    already uses elsewhere in this codebase, applied here to a
    genuinely new cadence.
  - **missing**: the company has NEVER had any `board_assurance_reports`
    row at all, current or historical — a stronger, distinct fact from
    merely being overdue this quarter.
  - **deteriorating**: the latest ISSUED report's own stored
    `report_data.trend.direction` (already computed by
    `computeBoardAssuranceReport()`, never re-derived) reads
    `'worse'` — reusing the exact trend field Board Assurance's own
    generation logic already produces, never a second comparison.
  - Pure classification function (`lib/consultancy/boardAssuranceStatus.ts`,
    new shared-dupe... **no**, portal-only: `board_assurance_reports`
    has no admin-side cross-client consultancy reader at all — this is
    a genuinely portal-only (consultant) feature, matching Group 4's
    own Client 360 precedent of portal-only consultancy code) — pure,
    unit-tested, given already-fetched rows and `today`.
  - Drilldown: each row links to `/consultancy/clients/[id]` (Client
    360), which Group 2 also extends with its own board-assurance
    summary card reading that one client's own history.
- **C13.8 (Core 360 Status)**: a NEW pure computation,
  `lib/core360Status/assemble.ts` (shared-dupe pair — both apps need
  the identical domain logic, the `complianceTwin/assemble.ts`/
  `assurance/today.ts` precedent), combining:
  - **People** ← `PortfolioCounts.workers_not_ready` +
    `.safety_critical_gaps`
  - **Plant** ← `PortfolioCounts.assets_unavailable`
  - **Training** ← a NEW small read-time count
    (`training_records` rows with `expires_on` in the past = expired,
    within 30 days = expiring — the same threshold
    `lib/reminders/rules.ts`'s own `due_30` bucket already uses
    elsewhere), since no existing module computes this.
  - **Risk Controls** ← `RiskGraphIntelligence.uncoveredHazards.length`
    + `.ineffectiveSharedControls.length` (already computed, Phase 8) —
    never re-derived.
  - **Environmental** ← `PortfolioCounts.environmental_permits_expiring`
    + a NEW small count of open `environmental_spills`/
    `waste_movements.non_conformance` (the same two source tables
    `environmentalRules.ts`'s own consequence rules already key on) —
    genuinely missing from `PortfolioCounts`, added here narrowly
    rather than widening that module's own established 13-field shape
    for a single caller.
  - **Contractors** ← `PortfolioCounts.contractor_expiring`
  - Each domain gets a plain `ok | attention | critical` band from
    small, named, documented thresholds (the `complianceTwin/
    assemble.ts` precedent: no formula, no AI, a fixed `if`-chain over
    inspectable counts) — **zero** in every signal is `ok`; any
    nonzero count is at minimum `attention`; a domain-specific "this
    count means critical" threshold (e.g. any `safety_critical_gaps >
    0`, or `workers_not_ready` past a named fraction) is decided per
    domain and documented in the function's own comments, never
    guessed generically.
  - **Never a duplicate of the Digital Twin or Assurance Today.**
    Those two (Phase 12, Phase 18) are explicitly narrower predecessors
    per C18.4's own note in the matrix — this is the first DOMAIN-
    scored, SIX-AREA-NAMED surface the Master Spec's own C13.8 wording
    asks for, reusing their already-computed inputs rather than
    inventing new raw facts a third time.
  - Admin: a new `HsCompanyTabs.tsx` tab (no new sidebar entry, nests
    under `/health-safety` per every established precedent). Portal:
    a read-only `/protect/core-360-status` page, gated by `protect`
    alone. Both compose already-existing per-company reads
    (`loadPortfolioCountsForCompany`, the risk-graph page's own query
    shape, a new small training/environmental read) — no new query
    shape invented beyond the two genuinely-missing counts above.

## Delivery order

Same discipline as every phase since Phase 4: small, independently
verified groups — code/migration where needed → live probe where a
migration exists → tests → all six CI guards → CLAUDE.md entry →
commit, then the next group.

1. **Group 1 (no migration)**: C13.7 regenerate.
2. **Group 2 (no migration)**: C13.6 cross-client dashboard + Client
   360 summary card.
3. **Group 3 (no migration)**: C13.8 `assemble.ts` pure computation +
   the two new small reads (training expiry, environmental
   spills/waste non-conformance) as their own pure, tested functions.
4. **Group 4 (no migration)**: C13.8 admin + portal UI.
5. **Group 5**: full regression, adversarial QA, handover, matrix/
   manifest close-out, PR, merge.

No migration is expected anywhere in this phase — every piece composes
already-live schema (`board_assurance_reports`, `training_records`,
`environmental_spills`, `waste_movements`, the Risk Graph's own
tables) with no new column, table or RLS policy needed. This will be
confirmed, not assumed, if a group's own work turns up a genuine gap
(e.g. if `environmental_spills`/`waste_movements` turn out to lack a
`company_id` column reachable the way assumed — checked against their
own migration before Group 3 is written, not before this plan is
recorded).
