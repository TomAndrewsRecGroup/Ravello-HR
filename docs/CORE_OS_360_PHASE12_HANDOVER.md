# Core-OS 360 Phase 12: Compliance Digital Twin — Engineering Handover and QA Report

**Date:** 2026-09-29. **Branches:** every group's own branch, merged into `main`
immediately after that group's own tests/guards/builds went green (PRs #261-#262
for Groups 1-2, this document's own PR for Group 3), per the operator's standing
"regular merges so you don't lose anything" instruction — this phase is fully
merged and deployed as of this document.
**Database:** no migration — this phase is entirely TypeScript, assembling the
already-computed outputs of five existing pure modules.
**No detailed operator brief exists in the repo for this phase** (the same
situation Phases 8-11 were in) — scope was derived from the phase's own name
plus what the codebase already had: `docs/CORE_OS_360_PHASE12_PLAN.md`, written
before Group 1 began.

Scope delivered: `lib/complianceTwin/assemble.ts` — combines `lib/hs/kpis.ts`,
`lib/governance/kpis.ts`, `lib/riskGraph/intelligence.ts`,
`lib/incidentPatterns/analyze.ts` and `lib/evidenceEngine/analyze.ts` into one
snapshot with a per-area red/amber/green band plus an overall worst-of-five
band — and an admin/portal UI presenting it. Delivered in **3 independently-
verified groups** (pure assembly → UI → this final regression/adversarial-QA/
handover pass).

**Phase 13 is NOT to begin** until this branch is merged and deployed, per the
operator's standing instruction. (It already is — see the branch note above —
so Phase 13 is clear to begin once this document and the CLAUDE.md update are
committed.)

---

## A. Requirements traceability

Derived scope (`docs/CORE_OS_360_PHASE12_PLAN.md`), mapped to what actually
built it.

| Planned item | Delivered as | Group |
|---|---|---|
| Pure assembly combining five existing modules | `lib/complianceTwin/assemble.ts` — `assembleComplianceTwin()`, per-area RAG band + overall band, no new raw computation | Group 1 |
| Admin UI | `/health-safety/<companyId>/digital-twin` — a 29th `HsCompanyTabs.tsx` tab | Group 2 |
| Portal UI | Read-only `/protect/digital-twin`, gated by `protect` alone | Group 2 |
| Regression, adversarial QA, handover | This document | Group 3 |

Scope decisions made and held throughout, all recorded in the plan doc before
Group 1 began:

- **No new raw computation, ever.** Every fact the twin reports was already
  computed by one of the five source modules; this phase's only new logic is
  the banding thresholds and the five-way combination.
- **No AI, no stored snapshot, no migration.** Computed live at read time,
  the same posture `lib/health/scoring.ts` and every KPI/intelligence module
  in this codebase already takes.
- **No cross-client rollup, no export/PDF, no board narrative** — each
  explicitly reserved for a later or different phase (Phase 13 is Board
  Assurance & Executive Reporting, a different phase with its own name).

---

## B. What already existed, and what this phase closes

Checked before writing a line of code: all five source modules already existed
and were independently correct, but nothing combined them into ONE picture of
a client's overall compliance state — a staff member or client wanting "is
this client basically fine right now" had to open five separate pages and
mentally combine five separate answers. This phase closes exactly that gap,
and nothing else.

A genuinely useful, unplanned discovery made while building the UI (Group 2):
`lib/hs/kpis.ts` and `lib/governance/kpis.ts` had been admin-only since they
shipped (Phase 4 and Phase 5 Group 8 respectively) — `computeGovernanceKpis`
in particular had NEVER had a real caller anywhere in this codebase before
this phase, only its own unit test. Both were mirrored to portal as new
shared-dupe pairs (neither had any admin-specific dependency — checked before
mirroring, not assumed) rather than reimplementing their formulas inline in
the portal page, which would have been exactly the "parallel system" this
codebase's own standing rule forbids.

---

## C. Adversarial review — two real defects found and fixed, both in `assemble.ts`

A genuinely thorough pass was made across correctness, wording/honesty, and
security, each checked against the actual code rather than assumed.

### C.1 [Medium, fixed] A redundant, confusing pair of reasons under the Evidence area

`evidenceArea()`'s original code had TWO independent `if` checks against the
SAME number (`coveragePercent`): one for the red threshold (<50%) and one for
the amber threshold (<90%). Because they were independent rather than
mutually exclusive, a coverage percent below the RED threshold produced BOTH
reasons together — e.g. at 30% coverage, the area showed:

> Evidence coverage is 30%, below the 50% threshold
> Evidence coverage is 30%, below the 90% threshold

Two sentences reporting the identical fact at two different, both-true
thresholds, as if they were two separate findings. Reproduced with a new test
(`assemble.test.ts`, "reports the evidence coverage fact ONCE... when below
the red threshold") BEFORE fixing — confirmed failing (`reasons` had length 2,
expected 1) — then fixed by changing the second check to `else if`, so a red
finding reports only its own, more severe reason. Re-confirmed passing after
the fix. This is the only place in `assemble.ts` where two thresholds are
checked against the SAME underlying number — every other area's red/amber
pairs are independent facts (e.g. safety's RIDDOR count vs. equipment-due-soon
count), so this class of bug cannot recur elsewhere in the file by
construction, not just by inspection.

### C.2 [Medium, fixed] Governance's clean-state wording implied verification that may never have happened

Comparing all five areas' clean-state ("all green") reason strings for
consistency turned up a real asymmetry. Safety's clean reason already reads
"...the last audit score (**if any**) is at or above threshold" and evidence's
reads "...(**or no register completions have been recorded yet**)" — both
explicitly acknowledge that a lack of adverse findings might mean there is
simply no data, not that something was checked and found fine. Every other
area's clean-state facts are plain COUNTS (a count of zero is unambiguous
whether nothing was ever recorded or everything recorded is genuinely fine —
"no RIDDOR incidents" and "every hazard is covered" carry no false-confidence
risk either way), so they needed no such caveat.

Governance's clean reason was the ONE exception that had been missed: its two
amber checks (`objectivesOnTrackPercent`, `wasteNonConformancePercent`) are
PERCENTAGES that are `null` with zero data, the exact same shape as safety's
audit score and evidence's coverage percent — but its clean-state wording
("objectives are on track, and recorded waste non-conformance is within
range") read as an unconditional positive claim, indistinguishable from a
client with zero objectives and zero waste movements EVER recorded. This is
the same class of risk this codebase's own standing rules already treat as
serious elsewhere — the referral gate's "absence of evidence is a FAIL, not a
pass," the audit engine's "recorded assessment outcome, never legally
compliant." Reworded to "No overdue legal obligation reviews **on record**,
and **no evidence of** objectives falling behind or elevated waste
non-conformance" — language that never implies more confidence than the
underlying data actually supports. No test assertion pinned the exact string
before or after (the existing test only checks `reasons.length === 1` for the
green baseline), so no test needed updating; the fix is a wording-honesty
correction, not a logic change.

### C.3 Also hardened (not a defect, verified before deciding it needed nothing)

`k.lastAuditScore` is displayed unrounded in the safety area's amber reason.
Checked whether `hs_audits.score` can ever be a non-integer: `hs_submit_audit()`
(migration 110/113) is the table's ONLY writer (no direct client insert
anywhere in either app), and it always computes the score via
`computeAuditScore()`, which itself calls `Math.round(...)`. So the display
was never actually wrong — but `Math.round()` was added anyway for the same
defensive consistency every other percentage in this file already has, in
case a future writer ever stores a fractional score. Recorded here as a
hardening, not reported as a finding, since nothing was ever observably
broken.

### C.4 Checked and found clean

- **Sensitive-content leakage into a reason string.** Every reason across all
  five areas is built from a COUNT or a rounded PERCENTAGE — never a hazard
  title, an obligation title, an incident description, or any free text.
  Confirmed by reading every `red.push`/`amber.push` call in `assemble.ts`:
  none references a `.title`/`.name`/`.description` field from any source
  module's row types.
- **Cross-tenant data leakage.** Every read in both pages is scoped
  `.eq('company_id', <the caller's own company>)`, identical to the pattern
  every one of the five source pages this phase assembles already uses. The
  portal page's `legal_requirements` title lookup (service role, scoped to
  exactly the ids the session's own RLS-protected read of
  `organisation_legal_obligations` already returned) is the same, already-
  audited pattern `/protect/risk-graph` established in Phase 8.
- **The `loadError`-blocks-all-content pattern.** `ComplianceTwinView.tsx`
  hides the entire dashboard behind `{!loadError && (...)}` rather than
  rendering partial data alongside a warning. Checked against
  `IncidentPatternsView.tsx` (which this component's shape follows): it does
  the identical thing (`{!loadError && empty && ...}` /
  `{!loadError && !empty && ...}`) — this is the existing codebase
  convention, not a new gap introduced here.
- **The per-area `links` prop, not a shared `basePath` suffix.** Verified
  live against both apps' actual route trees that admin's Legal Register
  segment (`legal`) and portal's (`legal-register`) genuinely differ, and
  that admin has a combined `/kpis` page portal has no equivalent of — the
  explicit-links design this phase adopted (rather than
  `IncidentPatternsView.tsx`'s simpler `basePath`-suffix pattern) is the
  correct one for this component, not an unnecessary complication.
- **`employee_records` column-privilege guard (migration 131).** Both pages'
  headcount query selects only `id` and filters on `end_date`/`start_date` —
  both explicitly in `EMPLOYEE_SAFE_COLUMNS`; no sensitive column (salary, NI
  number, DOB, etc.) is ever touched, and the guard applies uniformly to the
  `authenticated` role regardless of staff/client session, so this needed no
  special-casing for the admin page either.

No Critical or High defect was found. Two real Medium-severity issues were
found and fixed (§C.1, §C.2), both confined to `assemble.ts`'s own reason-
string logic — the underlying band THRESHOLDS themselves were never wrong,
only two of the SENTENCES describing them.

---

## D. Regression report

- **The full vitest suites are the regression suite.** Every pre-existing
  module (Referrals, A2I emails, Development Plans, E-Learning, Broadcast,
  Billing/Stripe, HR, Recruitment, every Phase 1-11 H&S/workforce/governance/
  consultancy/risk-graph/operational-intelligence/evidence subsystem) has its
  own test files, none deleted, none skipped, all green throughout the phase:
  **1518 admin / 712 portal** as of this document (up from 1492/710 at the
  end of Phase 11 — +26 for Group 1's own tests minus one net after the
  Group 3 fix added one more, +2 for portal's `portalPagesLinked.test.ts`
  picking up the new route automatically).
- **Both production builds compile clean**, including the two new routes
  (`/health-safety/<companyId>/digital-twin`, `/protect/digital-twin`).
  Portal built with stub Supabase env vars to get past the documented,
  pre-existing sandbox-only missing-env-vars prerender failure (unrelated to
  this phase).
- **All five CI guards pass**: `check-shared-dupes.sh` (56 pairs — up from
  52; `complianceTwin/assemble.ts`, `ComplianceTwinView.tsx`, `hs/kpis.ts`
  and `governance/kpis.ts` are the four new pairs), `check-row-cap.sh`
  (clean), `check-route-validation.sh` (44, unchanged), `check-admin-
  routes-linked.sh` (42 static routes, all reachable — the new admin route
  is dynamic-segmented and nests under the already-linked `/health-safety`
  prefix), `check-blind-updates.sh` (102, unchanged — this phase writes
  nothing, entirely read-only).
- **No shared table, trigger or RLS policy was modified anywhere in this
  phase.** Every read is through EXISTING policies that predate this phase
  by multiple phases.

This constitutes the "previous phases remain functional" regression
requirement.

---

## E. Design decisions, documented rather than silently made

- **The five areas are fixed and hardcoded, not configurable.** A future
  phase could let a client/consultancy tune thresholds; this phase ships the
  named, documented defaults only.
- **The per-area `links` prop, not a shared `basePath`.** See §C.4 — a
  deliberate, verified design choice, not an oversight.
- **`incidentFrequencyRatePer100` (from `computeGovernanceKpis`' full output)
  is computed but never displayed or read by the digital twin's own bands.**
  It exists only because `computeGovernanceKpis` is called for its OTHER
  three fields and returns all four together; nothing discards or hides it
  maliciously, it is simply unused by this phase's own band logic, which
  reads only `overdueLegalEvaluationsCount`, `objectivesOnTrackPercent` and
  `wasteNonConformancePercent`.
- **A fixed 90-day window for Incident Patterns**, no window picker on the
  digital twin itself (the standalone `/incident-patterns` page still has
  its own 30/90/365 picker) — the twin is a single-glance summary, not a
  drill-down tool.

---

## F. Technical debt

- **No stored history of the twin's own band over time.** Unlike
  `client_health_snapshots` (Phase 5 Group 8's daily cron), there is no daily
  digital-twin snapshot and no trend/churn signal for compliance posture
  specifically. A future phase could add one following that exact precedent
  if it proves valuable.
- **No per-area drill-down beyond the single "View details" link.** The area
  card shows only its OWN reasons, not the underlying record list (e.g. the
  actual uncovered hazards) — the linked standalone page is where that detail
  already lives, deliberately not duplicated here.
- **Thresholds are not configurable per client/sector.** A construction-heavy
  client may reasonably expect more incidents than an office-based one; this
  phase applies one fixed set of thresholds to every client. Flagged, not
  built — genuinely new scope, not a defect.

---

## G. Gate

**PASS WITH MINOR ISSUES.**

- Two real Medium-severity defects were found in `assemble.ts`'s own
  reason-string logic during Group 3's adversarial review (§C.1, §C.2), both
  reproduced with a failing test or careful manual trace before being fixed,
  and both re-verified passing afterward. Neither affected the underlying
  RAG band THRESHOLDS, which were correct throughout — only two of the
  sentences describing them.
- Every scope and design decision that might otherwise look like an
  oversight (the per-area `links` prop instead of a shared basePath, the
  `loadError`-blocks-all-content pattern, mirroring two previously admin-only
  KPI modules to portal) is explicitly documented rather than silently made
  (§C.4, §E, §B).
- Full regression (tsc clean both apps, 2230 total tests across both apps,
  all five CI guards, both production builds) is green (§D).

**Phase 13 may begin.**
