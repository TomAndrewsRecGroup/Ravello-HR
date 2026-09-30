# Core-OS 360 Phase 18: Core 360 Assurance — Engineering Handover and QA Report

**Date:** 2026-09-30. **Branches:** every group's own branch, merged into
`main` immediately after that group's own tests/guards/builds went green
(PR #279 for Group 1, PR #280 for Group 2, this document's own PR for
Group 3), per the operator's standing "regular merges so you don't lose
anything" instruction — this phase is fully merged and deployed as of
this document.
**Database:** no migration — this phase is entirely TypeScript,
composing two already-built pieces (`PortfolioCounts`, Phase 6; the
Compliance Digital Twin, Phase 12) into one new view.
**No detailed operator brief exists in the repo for this phase** (the
same situation Phases 8-17 were in) — scope was derived from the
phase's own name plus a careful audit of what already answered
adjacent questions, to find the genuine, non-duplicative gap: `docs/
CORE_OS_360_PHASE18_PLAN.md`, written before Group 1 began.

Scope delivered: a single, TODAY-dated view — for one company, in
either app — combining the Digital Twin's slower-moving five-area
picture with the "right now" operational facts (workers not currently
Safe to Deploy, assets quarantined, open critical actions, and so on)
that `PortfolioCounts` already computed for an entirely different,
staff-only purpose. Delivered in **3 independently-verified groups**
(pure combination → admin + portal UI → this final regression/
adversarial-QA/handover pass).

**Phase 19 is NOT to begin** until this branch is merged and deployed,
per the operator's standing instruction. (It already is — see the
branch note above — so Phase 19 is clear to begin once this document
and the CLAUDE.md update are committed.)

---

## A. Requirements traceability

Derived scope (`docs/CORE_OS_360_PHASE18_PLAN.md`), mapped to what
actually built it.

| Planned item | Delivered as | Group |
|---|---|---|
| The absolute rule shaping everything else | Never assert "safe"/"compliant" as a verdict — a count, or its plain absence | Group 1 (research) |
| Combine PortfolioCounts + the Digital Twin | `lib/assurance/today.ts` (`assembleAssuranceToday()`) | Group 1 |
| `portfolioCounts.ts` usable in both apps | Promoted to a shared-dupe pair | Group 1 |
| Admin view | `/health-safety/<companyId>/assurance`, zero new query code | Group 2 |
| Portal view | `/protect/assurance`, seven new RLS-checked queries | Group 2 |
| Regression, adversarial QA, handover | This document | Group 3 |

The plan doc's own central finding, made before any code was written:
the Digital Twin (Phase 12) and `PortfolioCounts` (Phase 6) already
individually answer adjacent halves of "are we safe and compliant
today" — one slower-moving, one present-tense — but nobody had ever
put them together into one client-facing, dated view. Composition, not
a sixth intelligence module, closed the gap.

---

## B. Adversarial review

### B.1 [Caught during Group 2 itself, not carried into this pass] A shared-dupe pair went unregistered in its own guard

`AssuranceTodayView.tsx` was written as a genuine shared-dupe pair
(byte-identical in both apps, following the `ComplianceTwinView.tsx`
precedent exactly) but the first draft of Group 2 forgot to add it to
`check-shared-dupes.sh`'s own pairs list. This was caught the same day,
by the guard's own reported count staying at 59 (Group 1's number)
instead of the expected 60 — the guard doing exactly the job it exists
to do — and fixed before Group 2's PR was opened. Recorded here rather
than silently omitted from the phase's own history, since it is a real
example of "the guard catching a real omission" this codebase's own
CLAUDE.md already values recording (the identical spirit of the
`platformEventsSql.test.ts` "every SECURITY DEFINER function is
revoked" assertion "now proven to actually catch a real omission
rather than just pass vacuously" note elsewhere in this file).

### B.2 Checked and found clean — no Critical, High or Medium defect found in this pass

A genuinely thorough adversarial review, not a formulaic one — several
angles were checked in real depth and found to hold:

- **The absolute "never a verdict" rule, checked against the actual
  rendered text, not just the intent.** `grep`-ing every new file
  (`today.ts`, `AssuranceTodayView.tsx`, both pages) for the standalone
  words "safe"/"compliant"/"unsafe"/"non-compliant" found only: code
  comments (never rendered); the copy paragraph's own META-statement
  ("...it never says 'safe' or 'compliant' on this organisation's
  behalf" — describing the policy, not violating it); and the item
  label `'Workers not currently Safe to Deploy'`, which cites Phase 3's
  own established, capitalised system name for its engine's output
  (`READY`/`NOT_READY`/`REVIEW_REQUIRED`) — a reference to another
  system's own vocabulary, not this phase asserting a verdict of its
  own, the same distinction the codebase already draws for "Digital
  Twin"/"Board Assurance" as named features.
- **`computePortfolioCounts([companyId], ...).get(companyId)!` is
  never actually unsafe** despite the non-null assertion — read the
  function's own body to confirm it unconditionally seeds a
  zero-defaulted entry for every id in the `companyIds` array it is
  given, regardless of whether any row references that company. A
  brand-new client with zero of everything gets `0` counts, not
  `undefined`.
- **Portal's new RLS assumptions were re-verified against the actual
  live policies, not merely restated from memory of this file's own
  earlier notes**: `hs_documents_client_read` (migration 106),
  `audit_findings_client_read` (162), `person_deployment_status_read`
  gated by `person_visible()` (136) — each grepped directly out of its
  migration file before relying on it, not assumed.
- **`loadError` aggregation in the portal page was diffed against the
  Digital Twin portal page's own chain** to confirm the seven new
  queries' errors were APPENDED, not substituted for any of the
  original eighteen — none dropped.
- **The admin `HsCompanyTabs.tsx` tab's generated href was traced
  against the actual page's route** (`/health-safety/${companyId}/
  assurance`) rather than assumed to match by naming convention alone.
- **The triple-read of `organisation_legal_obligations` on the portal
  page** (once for governance KPIs, once for the risk graph, once for
  PortfolioCounts, each with different column selections) is real,
  acknowledged redundancy — already documented in the page's own header
  comment as a deliberate tradeoff (clarity of separately-shaped reads
  over cross-consumer column-merging), not silently reintroduced debt.

---

## C. Regression

- **`tsc --noEmit` clean on both apps**, throughout every group and
  through this final pass (no code changed in Group 3 — it is a review
  and documentation pass only).
- **Full `vitest run` green: 1620 admin / 755 portal**, unchanged from
  the end of Group 2.
- **Both production builds compile clean** (verified in Group 2;
  re-confirmed here that no subsequent code change could have
  invalidated that, since Group 3 touched no source file).
- **All five CI guards pass**: `check-shared-dupes.sh` (60 pairs),
  `check-row-cap.sh` (clean), `check-route-validation.sh` (44,
  unchanged), `check-admin-routes-linked.sh` (43 static admin routes,
  all reachable — the new admin route is dynamic and needed no literal
  reference), `check-blind-updates.sh` (102, unchanged — this phase
  writes nothing anywhere, both new pages are entirely read-only).
- **No migration exists for this phase** — nothing shared (a table, a
  trigger, an RLS policy) could have drifted.

This constitutes the "previous phases remain functional" regression
requirement.

---

## D. Design decisions, documented rather than silently made

- **Composition, never a sixth intelligence module** (§A) — the
  central discipline this phase was built to demonstrate, following
  `complianceTwin/assemble.ts`'s own one-layer-down precedent exactly.
- **`portfolioCounts.ts` promoted to a shared-dupe pair** rather than
  reimplementing its counting logic a second time for portal — the
  identical reasoning that made `hs/kpis.ts`/`governance/kpis.ts`
  shared the moment Phase 12's own portal page needed them too.
- **Portal reads seven NEW, narrowly-scoped queries rather than a
  wider `.select('*')` or reusing admin's staff-only loader** — the two
  apps are separately deployed with no shared server code, so a
  file-level shared-dupe is the only cross-app reuse mechanism this
  codebase has; the query SHAPE (which columns, which tables) still had
  to be written once per app, exactly like the Digital Twin's own
  portal page already does for its five source modules.
- **Fields with no client-read policy are passed as empty arrays,
  never silently guessed or backfilled from another table** — a
  documented, deliberate choice, correct precisely because none of
  those specific fields (`contractor_expiring`, `environmental_
  permits_expiring`, `management_reviews_due`, `outstanding_service_
  requests`, `next_consultant_visit_date`) are ones `assembleAssuranceToday()`
  ever reads, so nothing the page actually shows is under-reported.

---

## E. Technical debt

- **The triple-read of `organisation_legal_obligations` on the portal
  page** (§B.2) — real, acknowledged, and deliberately left rather than
  refactored into a single shared read across three differently-shaped
  consumers, since that refactor would touch the Digital Twin's own
  already-working query logic for no correctness benefit.
- **No caching or memoisation of either page's read set** — both
  Digital Twin and Assurance Today independently reads the same
  underlying tables on every page load; this mirrors the existing
  Digital Twin pages' own posture (Phase 12 never added caching either)
  and was not expanded in scope here.

---

## F. Gate

**PASS.**

- No Critical, High or Medium defect was found in this pass — a
  genuinely thorough review (§B.2), not a formulaic one, checked the
  absolute "never a verdict" rule against actual rendered text, the
  non-null assertion's real safety, portal's RLS assumptions against
  the live policies, the loadError chain's completeness, and the admin
  tab's routing, and found each one to hold.
- One real process gap (§B.1) was caught and fixed the same day it was
  introduced, during Group 2 itself, by the CI guard doing its job —
  recorded here for the phase's own history rather than omitted because
  it did not survive into this final pass.
- Every design decision that might otherwise look like an oversight
  (composition over a new module, the shared-dupe promotion, portal's
  separate query shapes, the empty-array fields) is explicitly
  documented rather than silently made (§A, §D).
- Full regression (tsc clean both apps, 2375 total tests across both
  apps, all five CI guards, both production builds already verified in
  Group 2 with no subsequent code change) is green (§C).

**Phase 19 may begin.**
