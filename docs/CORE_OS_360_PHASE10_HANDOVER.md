# Core-OS 360 Phase 10: Incident Pattern Intelligence — Engineering Handover and QA Report

**Date:** 2026-09-29. **Branch:** every group's own branch, merged into `main` immediately after that group's own tests/guards/builds went green (PRs #255-#256 for Groups 1-2, this document's own PR for Group 3), per the operator's standing "regular merges so you don't lose anything" instruction — this phase is fully merged and deployed as of this document.
**Database:** no migration — this phase is entirely TypeScript over the existing `hs_incidents`/`incident_investigations`/`incident_causes` schema (112, 125).
**No detailed operator brief exists in the repo for this phase** (the same situation Phases 8-9 were in) — scope was derived from the phase's own name plus what the codebase already had: `docs/CORE_OS_360_PHASE10_PLAN.md`, written before Group 1 began.

Scope delivered: `lib/incidentPatterns/analyze.ts` — the first thing anywhere to aggregate incidents ACROSS records (by type, by recurring confirmed root-cause category, by site/department concentration, and period-over-period severity) — plus an admin tab and a read-only portal page, both with a 30/90/365-day window picker. Delivered in **2 independently-verified groups** (foundation → UI, each with tests → all five CI guards → both builds → commit → PR → merge, THEN the next group), plus this final regression/adversarial-QA/handover pass (Group 3).

**The one absolute rule this phase was built around held throughout, with no exception found on adversarial review**: this codebase's own standing rule since Phase 4 — "no predictive/AI safety scoring, anywhere." Every insight in this phase reports what has ALREADY happened, past tense, with a real inspectable count behind it. No score, no probability, no AI anywhere in this phase's own code — verified by re-reading every line of `analyze.ts` with that specific question in mind during this pass, not merely trusting the header comment that states the rule.

**Phase 11 is NOT to begin** until this branch is merged and deployed, per the operator's standing instruction. (It already is — see the branch note above — so Phase 11 is clear to begin once this document and the CLAUDE.md update are committed.)

---

## A. Requirements traceability

Derived scope (`docs/CORE_OS_360_PHASE10_PLAN.md`), mapped to what actually built it.

| Planned item | Delivered as | Group |
|---|---|---|
| Pure pattern computation | `lib/incidentPatterns/analyze.ts` — `analyzeIncidentPatterns()`, counts by type, recurring confirmed root causes, site/department clusters, period-over-period severity | Group 1 |
| Admin UI | `/health-safety/<companyId>/incident-patterns`, a 27th `HsCompanyTabs.tsx` tab, window picker via searchParams | Group 2 |
| Portal UI | Read-only `/protect/incident-patterns`, gated by `protect` alone | Group 2 |
| Regression, adversarial QA, handover | This document, plus the window-symmetry fix | Group 3 |

Scope decisions made and held throughout, all recorded in the plan doc before Group 1 began:

- **No prediction, no score, no "risk level."** The single most important boundary in this phase — see the header comment of `analyze.ts` itself, which states the rule before a single line of logic.
- **Only non-sensitive columns.** `hs_incidents`' own type/severity/site/department/date and `incident_causes.category` — never `incident_person_sensitive`, never free-text descriptions, in any aggregate output.
- **No cross-client pattern surfacing.** Each client's incidents are their own.

---

## B. The real schema this phase reads — verified, not assumed

`hs_incidents` (112, extended substantially by 125) carries `incident_type` (9 values), `severity` (nullable, 6 values), `site_id`, `department_id`, `occurred_on` — all non-sensitive. `incident_causes` (125) is the pattern data proper: `cause_level` (immediate/underlying/root) and `category` (a curated 13-value taxonomy), confirmed by a human (`confirmed_at`/`confirmed_by`) before counting. `incident_investigations.incident_id` is `UNIQUE`, a genuine 1:1 mapping the pure function relies on to resolve which incident a cause belongs to.

RLS was checked live, not assumed, before writing either UI page (§C of Group 2's own CLAUDE.md section): `hs_incidents_read`/`incident_investigations_read`/`incident_causes_read` are all gated on the SAME capability (`incident.read`), company-scoped — a client session already holding that capability (the same one that already gates the existing Incidents tab) can read everything this phase needs, with no service role anywhere.

---

## C. The one defect found and fixed

**The current and prior comparison windows were not the same length.** The first version built the current window as `[today - N, today]` (BOTH ends inclusive — which is `N + 1` distinct calendar dates, not `N`) and the prior window as `[today - 2N, today - N)` (half-open, genuinely `N` dates). Every single period-over-period severity comparison this phase ever produced was comparing a slightly LONGER "current" period against a slightly SHORTER "prior" one — undermining the fairness the comparison exists to provide, on every single run, for every client, since the feature shipped in Group 2.

- **Found by**: re-deriving the exact date arithmetic by hand while reviewing the two `page.tsx` files together, rather than trusting that "N days ago to today" and "2N days ago to N days ago" were obviously symmetric — they look right at a glance and are wrong by exactly one day, the classic shape of an off-by-one that survives casual reading.
- **Fixed**: extracted the date-window computation into a new, testable pure function, `incidentPatternWindows(todayISO, days)`, added to the shared `analyze.ts` (mirrored to portal). Both windows are now half-open (`[start, endExclusive)`) and provably the same length. The current window's `endExclusive` is deliberately `today + 2` rather than `today + 1` — one extra day of query-side leeway to safely include an incident dated up to `current_date + 1`, the exact allowance `hs_incidents`' own CHECK constraint gives for timezone rounding at the point of reporting; this leeway is outside the "real" symmetric window and does not affect the fairness property the fix restores.
- **Proven**: 4 new tests pin the window function directly — the current and prior windows are exactly `days` real calendar dates each; the prior window's exclusive end is exactly the current window's start (no gap, no overlap); both directions of the "exactly `days` dates" property are checked independently for each window. Mutation-tested live in this session: the fix (`shift(-(days - 1))` for `windowStart`) was reverted to the original `shift(-days)`, three of the four new tests failed, then restored.
- **Severity**: Medium. Not a security or data-integrity issue — every underlying count was individually correct — but the ONE comparison this feature was built to make (this period vs. the one before) was systematically, silently biased for as long as the feature existed, in a way a casual reviewer would not catch by inspection.

No other defect was found in this phase's adversarial review.

---

## D. Design decisions, documented rather than silently made

- **A window picker is a plain `?days=` searchParams re-render**, not a client-side fetch — the exact pattern the Safety Timeline page's own pagination already uses. Phase 9's "What Changed" tab genuinely needed its own client-side fetch (a per-day slice with no natural "prev page" URL semantics); this feature's three fixed window sizes have no such need.
- **`IncidentPatternsView.tsx` needs no `'use client'`.** A window picker made of plain `<Link>` navigation has no interactivity to manage — the ONE presentational component serves both apps' server components directly, the first Phase 8-10 UI component built this way without first trying (and discarding) a client-component version.
- **The window-boundary fix lives in the shared `analyze.ts`, not duplicated per-app.** Both `page.tsx` files call the SAME `incidentPatternWindows()` function, so the two apps can never independently drift on this date arithmetic again — a lesson directly informed by having found the bug duplicated identically in both files in the first place (each `page.tsx` had its own, separately-wrong, copy of the same off-by-one).

---

## E. Regression report

- **The full vitest suites are the regression suite.** Every pre-existing module (Referrals, A2I emails, Development Plans, E-Learning, Broadcast, Billing/Stripe, HR, Recruitment, every Phase 1-9 H&S/workforce/governance/consultancy/risk-graph/operational-intelligence subsystem) has its own test files, none deleted, none skipped, all green throughout the phase: **1485 admin / 707 portal** as of this document (up from 1470/705 at the end of Phase 9).
- **Both production builds compile clean.** Portal built with stub Supabase env vars to get past the documented, pre-existing sandbox-only missing-env-vars prerender failure (unrelated to this phase).
- **All five CI guards pass**: `check-shared-dupes.sh` (50 pairs — up from 48; `incidentPatterns/analyze.ts` and `IncidentPatternsView.tsx` are the two new pairs), `check-row-cap.sh` (clean), `check-route-validation.sh` (44, unchanged), `check-admin-routes-linked.sh` (42 static routes, all reachable — the new admin route nests under the already-linked `/health-safety` prefix), `check-blind-updates.sh` (102, unchanged — this phase writes nothing, entirely read-only).
- **No shared table, trigger or RLS policy was modified anywhere in this phase.** Every read is through EXISTING policies (`hs_incidents_read`, `incident_investigations_read`, `incident_causes_read`, `hs_sites`' client-read policy, `departments_org_read`) that predate this phase by multiple phases.

This constitutes the "previous phases remain functional" regression requirement.

---

## F. Adversarial QA

### F.1 The window-symmetry defect

Covered in full in §C. One real, Medium-severity defect found and fixed.

### F.2 Sensitive-data boundary

Re-verified against the actual migration text (not memory): `incident_person_sensitive` is never referenced anywhere in `analyze.ts`, either `page.tsx`, or `IncidentPatternsView.tsx`; `incident_causes.description` (free text) is fetched by neither page (`.select('investigation_id, cause_level, category, confirmed_at')` — no `description` column named). The absolute rule this phase's own header comment states is upheld by the actual code, not just asserted in a comment.

### F.3 Tenant scoping

Both pages filter every query by `company_id`/the session's own `companyId` — verified by reading each query rather than assumed. `incident_causes`/`incident_investigations` carry their own `company_id` column (never resolved indirectly through a join that could leak), so a cross-tenant read is impossible by construction regardless of RLS.

### F.4 The "recurring root cause counted against the wrong window" edge case

`analyzeIncidentPatterns()`'s own defensive check (`if (!incidentId || !incidentIdsInWindow.has(incidentId)) continue;`) was re-verified by tracing what happens when an investigation completes WEEKS after its incident occurred, for an incident that has since fallen out of the (now-later) window: the cause is correctly excluded, because it is keyed against the INCIDENT's own presence in the current `incidents` array (window-scoped by the caller's query), not against the cause's own `confirmed_at` date. Already covered by a Group 1 test (`analyze.test.ts`); re-confirmed correct on this pass rather than re-assumed.

### F.5 Regression across Referrals, A2I, E-Learning, Broadcast, Billing, HR, Recruitment and Phases 2-9

Covered in §E.

---

## G. Defect classification (Phase 10, this pass)

| Defect / gap | Found by | Severity | Fixed by | Verified |
|---|---|---|---|---|
| The current and prior comparison windows were not the same length (current was `N+1` real calendar dates, prior was `N`) | Group 3 adversarial review, re-deriving the date arithmetic by hand | Medium (a systematic, silent bias in the ONE comparison this feature exists to make, present since the feature shipped) | Extracted `incidentPatternWindows()`, a shared, testable pure function producing two genuinely equal-length half-open windows | 4 new tests pinning the exact symmetry property; mutation-tested live (reverted, 3 of 4 new tests failed, restored) |

No other Critical, High or Medium finding was found anywhere in this phase's adversarial review.

---

## H. Technical debt

- **No cross-client benchmarking.** Explicitly out of scope per the plan doc — a future phase wanting this would need its own consent model and product decision, not something to fold in silently here.
- **No Jev narrative layer.** The count tables and cluster lists stand alone; nothing here was judged to need a natural-language summary on top, and adding one would need the same confidence-gated, never-auto-acting discipline every other Jev integration in this codebase already follows.
- **Site/department names default to "Unnamed site"/"Unnamed department"** for an id with no matching row (a soft-deleted or renamed site, in principle) — a defensive fallback, never expected to trigger in practice, not separately tested against a live data anomaly.
- **The window sizes are fixed at 30/90/365 days.** A custom date-range picker was judged unnecessary scope for a first pass; the three sizes cover the operationally common cases (a month, a quarter, a year).

---

## I. Gate

**PASS WITH MINOR ISSUES.**

- One real, Medium-severity defect (§C, §F.1, §G) was found by this phase's own adversarial review — a systematic, silent asymmetry in the one comparison this feature exists to make, present in both apps identically since the feature shipped. Fixed within this same group by extracting a single shared, tested pure function, and mutation-tested live (reverted to prove the new tests actually catch it, then restored).
- The absolute "no prediction, no AI" rule this phase was built around was re-verified against the actual code, not merely trusted from its own header comment (§F.1, restated in the phase intro).
- The sensitive-data boundary, tenant scoping, and the "cause counted against the wrong window" edge case were all independently re-checked and confirmed correct (§F.2-F.4).
- Every scope and design decision that might otherwise look like an oversight (no cross-client benchmarking, no Jev, fixed window sizes, the searchParams-driven UI rather than a client fetch) is explicitly documented rather than silently made (§A, §D, §H).
- Full regression (tsc clean both apps, 2192 total tests across both apps, all five CI guards, both production builds) is green (§E).

**Phase 11 may begin.**
