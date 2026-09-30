# Core-OS 360 Phase 13: Board Assurance & Executive Reporting — Engineering Handover and QA Report

**Date:** 2026-09-30. **Branches:** every group's own branch, merged into
`main` immediately after that group's own tests/guards/builds went green
(PR #264 for Group 1, PR #265 for Group 2, this document's own PR for
Group 3), per the operator's standing "regular merges so you don't lose
anything" instruction — this phase is fully merged and deployed as of this
document.
**Database:** migration 178 (`board_assurance_reports`,
`board_assurance_acknowledgements` — applied and live-probed in Group 1;
untouched since).
**No detailed operator brief exists in the repo for this phase** (the same
situation Phases 8-12 were in) — scope was derived from the phase's own name
plus a careful read of three adjacent systems already in the codebase (the
Value Report, Management Review, and Phase 6's `computePortfolioCounts()`):
`docs/CORE_OS_360_PHASE13_PLAN.md`, written before Group 1 began.

Scope delivered: a periodic (quarterly), DISTRIBUTABLE, SIGN-OFF-ABLE
document assembling facts this codebase already computes — the Compliance
Digital Twin (Phase 12), the portfolio-count facts (Phase 6, previously
staff-only), and the most recently completed Management Review's decisions
— into one immutable snapshot a board member can read and acknowledge.
Delivered in **3 independently-verified groups** (schema + pure computation
→ admin generate/issue/PDF UI + portal read/acknowledge UI → this final
regression/adversarial-QA/handover pass).

**Phase 14 is NOT to begin** until this branch is merged and deployed, per
the operator's standing instruction. (It already is — see the branch note
above — so Phase 14 is clear to begin once this document and the CLAUDE.md
update are committed.)

---

## A. Requirements traceability

Derived scope (`docs/CORE_OS_360_PHASE13_PLAN.md`), mapped to what actually
built it.

| Planned item | Delivered as | Group |
|---|---|---|
| Schema for a periodic, immutable, sign-off-able report | `board_assurance_reports` (draft→issued, content frozen after generation) + `board_assurance_acknowledgements` (insert-only sign-off) — migration 178 | Group 1 |
| Pure assembly reusing existing facts | `lib/boardAssurance/computeReport.ts` — `computeBoardAssuranceReport()`, trend from the immediately prior STORED report, no new raw computation | Group 1 |
| Staff generate/review/issue/export UI | `/health-safety/<companyId>/board-assurance`, `POST .../generate`, `PATCH .../[id]` | Group 2 |
| Client read + acknowledge UI | Read-only `/protect/board-assurance` (issued reports only) + `BoardAssuranceAcknowledge.tsx` (direct insert under RLS) | Group 2 |
| Regression, adversarial QA, handover | This document | Group 3 |

Scope decisions made and held throughout, all recorded in the plan doc before
Group 1 began:

- **No new Digital Twin snapshot-history table.** The quarterly cadence is
  coarse enough that the sequence of past STORED `board_assurance_reports`
  rows already is the trend history — avoiding a near-duplicate of
  `client_health_snapshots` (Phase 6, daily, staff-only).
- **Capabilities REUSED, not invented** — `risk.read`/`risk.create` (117),
  already granted to the relevant roles since Phase 1.
- **No external "board member" contact model.** Acknowledgement is by
  existing `client_admin` (and any role holding `risk.create`) users only —
  the same population that already reads every other client-facing PROTECT
  page.
- **No real-time "are we safe today" query** — that is Phase 18's own name
  and scope, not this one's.
- **No AI-generated narrative anywhere** — every fact in the report is a
  plain number or sentence a source module already produced.

---

## B. What already existed, and what this phase closes

Checked before writing a line of code: three adjacent systems already
computed pieces of "board assurance" but none of them WAS one —

1. **The Value Report** is a commercial/relationship document (roles filled,
   tickets resolved, MRR) — the client's business relationship with Core OS
   360, not their compliance posture.
2. **Management Review** (`management_reviews`/`_decisions`/`_data_pack`,
   Phase 5 Group 6) is the ISO clause 9.3 ritual — a working document for
   ONE meeting, with a staff-only data pack, never distributed to or
   acknowledged by a board.
3. **`computePortfolioCounts()`** (Phase 6) already computes exactly the
   kind of assurance facts a board would want, but feeds only the
   staff-only `client_health_snapshots` — "an internal BD/account-management
   signal, never shown to a client" (107's own words). The client's own
   board had never seen it.

This phase closes exactly that gap: it assembles these three existing
computations into ONE periodic, distributable, sign-off-able document —
never recomputing any of the underlying facts.

A genuinely useful reuse made while building the UI (Group 2): the Digital
Twin admin page's own ~20-query assembly (Phase 12) was inline in its
`page.tsx` with no exported function. Extracting it into
`lib/complianceTwin/loadSnapshot.ts` let the new "Generate" action call the
IDENTICAL assembly instead of writing a second, potentially-drifting copy —
the same "one calculation, not two" rule `computeValueReport()`/
`computeGovernanceMetrics()` already established elsewhere in this codebase.

---

## C. Adversarial review — one real defect found and fixed

A careful, line-by-line review of the guard trigger, the RLS policies, the
two API routes, and the cross-tenant paths a client session could reach,
checked each against a live read of the actual migration text and the
actual RLS policies on every table the "generate" route touches (never
assumed from the table name alone).

### C.1 [Medium] The "latest completed management review" attached to a report had no date bound relative to the report's own period

`POST /generate`'s query for the review to attach was:

```ts
supabase.from('management_reviews').select('id, review_date')
  .eq('company_id', companyId).eq('status', 'completed')
  .order('review_date', { ascending: false }).limit(1)
```

This picks the GLOBALLY most recent completed review, regardless of the
`(year, quarter)` being generated. A report is not required to be generated
in strict chronological order — the unique constraint is
`(company_id, year, quarter)`, and nothing stops staff generating an OLDER
period's report AFTER a LATER management review has already completed
(a genuine, plausible workflow: backfilling a missed quarter, or correcting
an omission). In that case the older report would cite a review that,
read chronologically, comes AFTER the period the report itself claims to
cover — a real correctness gap for a document whose entire purpose is a
faithful, reproducible snapshot of a specific quarter.

This is exactly the class of bug this codebase's own established discipline
already guards against elsewhere: `leadMetrics.ts`'s own comment ("Overdue
is relative to the REPORT month, not today... Run this for a past month and
it shows what was actually true then, not today's state") and
`computeQuarterlyValueReport.ts`'s stock/flow field classification both
exist specifically to stop a periodic report's own facts from silently
drifting to "as of right now" instead of "as of the period it covers." The
Board Assurance report inherited none of that discipline for this one field.

**Fixed**: `quarterEndDate(year, quarter)` (new, `lib/boardAssurance/
computeReport.ts`) computes the last calendar day of the period being
reported; the route's query gained `.lte('review_date',
quarterEndDate(year, quarter))`, so a report for Q1 2026 can only ever cite
a review completed on or before 31 March 2026, however many later reviews
have since completed. Mutation-tested live in this session: removing the
`.lte()` bound was reintroduced and watched fail both new
`generate/__tests__/route.test.ts` cases (a review dated after the
reporting quarter's end was wrongly picked, and a report with only a
post-quarter review wrongly attached it instead of reporting `null`), then
restored and re-verified green. Three new `quarterEndDate` unit tests pin
the boundary itself, including the Q4→31 December rollover (not January of
the next year) and a leap-year February inside Q1.

### C.2 Checked and found clean

- **Cross-tenant acknowledgement.** A client attempting to acknowledge a
  report belonging to another company (by guessing or being handed a
  report id) is refused: `board_assurance_acknowledgements_fill()` derives
  `company_id` from the REAL owning report (via a SECURITY DEFINER lookup
  that bypasses RLS to find the true owner), and the INSERT policy's own
  `WITH CHECK (company_id = my_company_id())` is evaluated against that
  DERIVED value — Postgres applies RLS `WITH CHECK` to the row as it stands
  AFTER `BEFORE INSERT` triggers have run, so the caller's own claimed
  values are irrelevant. A cross-tenant guess is refused with a row-level
  security violation, not a data leak.
- **Acknowledging a draft.** `board_assurance_acknowledgements_fill()`
  independently refuses when the parent report's `status <> 'issued'` —
  defence in depth alongside `board_assurance_reports_client_read`, which
  already hides a draft from a client session entirely. Re-confirmed
  against the Group 1 live probe (already proven there); not re-probed here
  since nothing in Groups 2-3 touched that trigger.
- **Concurrent "Issue" clicks on the same report.** `PATCH /[id]` has no
  `.eq('status', 'draft')` guard of its own — it updates by id alone. A
  second concurrent request that arrives after the first has already
  committed re-applies `status: 'issued'` to a row where `OLD.status` is
  already `'issued'`; `board_assurance_reports_guard()`'s own branch
  (`NEW.status = 'issued' AND OLD.status <> 'issued'`) does not match, so
  `issued_at`/`issued_by` are correctly left untouched rather than
  re-stamped. The outbox trigger records a `status` change only when the
  WHITELISTED column's value actually differs from `OLD` (096's own
  standing rule), so a genuine no-op re-update produces no second
  `platform_events` row and therefore no duplicate notification — this
  closes the exact race-condition class Phase 5 Group 10 and Phase 7 Group
  8 each found a real bug in, but here the database's own guard already
  made the second concurrent call a safe no-op by construction.
- **A staff-session read (not service-role) across all 13 tables the
  "generate" route's portfolio-count helper reads.** Unlike the reference
  `/api/cron/health-snapshot` route (which reads with the service role,
  bypassing RLS entirely), `loadPortfolioCountsForCompany()` runs under the
  calling staff member's own session. Spot-checked live against the actual
  RLS policy text (not assumed from the table name) for all 13 source
  tables (`actions`, `organisation_legal_obligations`, `hs_documents`,
  `hs_incidents`, `person_deployment_status`, `hs_equipment`,
  `audit_findings`, `contractors`, `contractor_insurances`,
  `environmental_permits`, `management_reviews`, `service_requests`,
  `consultancy_visits`) — every one carries a blanket `is_tps_staff()` ALL
  or SELECT policy (`person_deployment_status` via `person_visible()`,
  whose first OR clause is `is_tps_staff()`), so a staff session sees the
  full, correct count with no silent under-count. No defect found; recorded
  here because it was a real candidate worth checking, not assumed safe.
- **Field-name parity between `loadPortfolioCountsForCompany()`'s scoped
  reads and the reference cron's portfolio-wide reads.** Compared column by
  column, table by table — identical selections and filters throughout;
  the only difference is the added `.eq('company_id', companyId)` (or
  `.eq('client_organisation_id', companyId)` for `consultancy_visits`), and
  `contractor_insurances`, which has no `company_id` of its own, correctly
  scoped via the company's own `contractors` ids first. `computePortfolioCounts()`
  itself is called unmodified — the counting LOGIC is never re-derived, only
  the read shape narrows from portfolio-wide to one company.
- **PDF field-name parity.** `buildBoardAssuranceReportPdf()` reads
  `data.portfolioCounts.<field>` against the real, imported `PortfolioCounts`
  type (never `any`) — a mismatched field name would have failed `tsc`,
  which passed clean throughout every group.
- **No sensitive free text reaches the outbox, a notification, or a Timeline
  entry.** `board_assurance_reports`' outbox whitelist is `year, quarter,
  status` only — never `report_data`, which carries the full assembled
  snapshot. `board_assurance_acknowledgements` has no outbox entry at all,
  and its own `comment` field (free text a board member may write) is never
  referenced by any consequence rule, notification, or audit-trail
  whitelist.

---

## D. Regression

- **`tsc --noEmit` clean on both apps**, throughout every group and after
  the C.1 fix.
- **Full `vitest run` green: 1547 admin / 715 portal** as of this document
  (up from 1542/712 at the end of Group 2 — +5 for the C.1 fix's own new
  tests: 3 `quarterEndDate` unit tests + 2 `generate/route.test.ts` cases;
  portal unchanged since Group 3 touched admin only).
- **Both production builds compile clean**, including all three new routes
  (`/health-safety/<companyId>/board-assurance`, `POST .../generate`,
  `PATCH .../[id]`) and the two portal routes
  (`/protect/board-assurance`). Portal built with stub Supabase env vars to
  get past the documented, pre-existing sandbox-only missing-env-vars
  prerender failure (unrelated to this phase).
- **All five CI guards pass**: `check-shared-dupes.sh` (56 pairs,
  unchanged — this phase's portal-only `board-assurance/types.ts` is
  deliberately NOT a shared-dupe candidate, since it declares only the
  narrow subset of fields the read-only portal page actually renders, per
  §E), `check-row-cap.sh` (clean), `check-route-validation.sh` (44,
  unchanged), `check-admin-routes-linked.sh` (42 static routes, all
  reachable — the new admin route nests under the already-linked
  `/health-safety` prefix), `check-blind-updates.sh` (102, unchanged — the
  one new admin `.update()`, the "Issue" transition, was built with
  `{ count: 'exact' }` from the start).
- **No shared table, trigger, or RLS policy outside migration 178 itself
  was modified anywhere in this phase.** Every portfolio-count/Digital Twin
  read is through EXISTING policies that predate this phase by multiple
  phases.

This constitutes the "previous phases remain functional" regression
requirement.

---

## E. Design decisions, documented rather than silently made

- **`BoardAssuranceReportData` is declared TWICE, deliberately, not shared.**
  Admin's `lib/boardAssurance/computeReport.ts` carries the FULL type
  (`portfolioCounts`, `latestManagementReview`, `companyId`, `generatedAt`,
  all of it — it is what GENERATES the report). Portal's
  `board-assurance/types.ts` declares only `overallBand`/`trend`/
  `complianceTwin` — the three fields the read-only page actually renders
  — the exact "declare a narrow local interface naming only the fields
  this file reads" precedent Phase 12's own Digital Twin work already
  established for its two admin-only KPI inputs. Widening portal's type to
  match admin's in full would need mirroring `lib/health/portfolioCounts.ts`
  into portal for a type only, never actually read there.
- **No pre-check for an existing acknowledgement in
  `BoardAssuranceAcknowledge.tsx`.** A duplicate click is refused by the
  table's own `UNIQUE (report_id, acknowledged_by)`, surfaced as a plain
  `error.code === '23505'` message rather than a client-side guess at the
  database's own rule that could drift out of step with it — the exact
  posture `RamsAcknowledge.tsx` already takes for the same problem shape.
- **Staff may generate/issue a report for ANY company, with no
  narrower-than-`requireStaff()` scoping.** Consistent with every other
  cross-client staff tool in this codebase (the admin app already assumes
  any `tps_admin` session may act on any client) — not a new decision, but
  worth stating since Board Assurance is client-facing content.
- **The year/quarter picker's default values use the BROWSER's local
  date**, not server/UTC. Both fields are freely editable before
  generating, so this is a convenience default with no correctness
  consequence, unlike C.1's date-bound issue (which affects the STORED,
  immutable content of the report itself).

---

## F. Technical debt

- **No UI warning when generating a report for a period other than "the
  quarter that just ended."** C.1's fix makes generating out of order
  SAFE (the attached review can never postdate the period), but the UI
  itself does not flag to staff that they are backfilling an older period
  — purely a UX nicety, not a correctness gap, and not built here.
- **No re-generation of an already-generated DRAFT.** If the underlying
  facts change after a draft is generated but before it is issued, the
  only path is to notice, and there is currently no "regenerate this
  draft" action — a draft's content is frozen the instant it exists (by
  design, so trend comparisons and the printed PDF match exactly what
  staff reviewed), but this means a genuinely stale draft has no
  in-product refresh short of never issuing it and hoping the next quarter
  catches up. Flagged, not built — a real workflow question worth a
  product decision rather than a schema change invented here.
- **No cross-client Board Assurance dashboard** (e.g., "which clients have
  an overdue quarter with no report generated yet"). Every report is
  generated and reviewed one company at a time from that company's own
  `/health-safety/<companyId>/board-assurance` page. Genuinely new scope,
  not a defect.

---

## G. Gate

**PASS WITH MINOR ISSUES.**

- One real Medium-severity defect (§C.1) was found during Group 3's
  adversarial review, reproduced with two failing tests before being
  fixed, and mutation-tested (the fix reverted, both tests confirmed to
  fail, the fix restored and both confirmed passing again) before this
  document was written.
- A wide range of other candidate issues — cross-tenant acknowledgement,
  acknowledging a draft, concurrent "Issue" clicks, staff-session RLS
  coverage across all 13 portfolio-count source tables, field-name parity
  between the scoped and portfolio-wide reads, and sensitive-data leakage
  into the outbox or a notification — were each checked against the
  actual migration text or the actual RLS policy text and found clean
  (§C.2).
- Every scope and design decision that might otherwise look like an
  oversight (no new snapshot-history table, no external board-member
  model, the two deliberately-separate `BoardAssuranceReportData` type
  declarations, no acknowledgement pre-check) is explicitly documented
  rather than silently made (§A, §E).
- Full regression (tsc clean both apps, 2262 total tests across both
  apps, all five CI guards, both production builds) is green (§D).

**Phase 14 may begin.**
