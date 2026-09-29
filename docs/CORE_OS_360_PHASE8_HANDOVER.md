# Core-OS 360 Phase 8: Risk Graph & Connected Compliance Intelligence — Engineering Handover and QA Report

**Date:** 2026-09-29. **Branch:** every group's own branch, merged into `main` immediately after that group's own tests/guards/builds went green (PRs #248-#250 for Groups 1-3, this document's own PR for Group 4), per the operator's standing "regular merges so you don't lose anything" instruction — this phase is fully merged and deployed as of this document.
**Database:** migration 177 is applied live to `sbmekaviwkiyorvmtgcu`, verified by reading the live catalog state back after applying, never trusted from the apply call's own success response. Groups 2, 3 and 4 needed no new migration.
**No detailed operator brief exists in the repo for this phase** (unlike Phases 1-3's own `_PLAN.md` files) — scope was derived from the phase's own name plus what the codebase already had: `docs/CORE_OS_360_PHASE8_PLAN.md`, written before Group 1 began.

Scope delivered: activation of `hs_links` (122) — named "the Risk Graph's foundation" in its own header comment since Phase 2, but never traversed beyond one hop by anything in either app until this phase; a `risk_graph_neighbors()` graph-traversal function; four deterministic, no-AI, connection-shaped Connected Compliance Intelligence insights; and an admin dashboard/explorer plus a read-only portal equivalent. Delivered in **3 independently-verified groups** (migration where needed → live probe → tests → all five CI guards → both builds → commit → PR → merge, THEN the next group), plus this final regression/adversarial-QA/handover pass (Group 4).

**One absolute rule held throughout, with no exception found on adversarial review except the one described in §C:** every insight is computed at READ TIME from real structural relationships already in the schema — no stored aggregate, no AI, no significance judgement, no score. `risk_graph_neighbors()` is `SECURITY INVOKER`, the same `search_records()` rule: it can never return a row the caller's own `hs_links` RLS would refuse them directly.

**Phase 9 is NOT to begin** until this branch is merged and deployed, per the operator's standing instruction. (It already is — see the branch note above — so Phase 9 is clear to begin once this document and the CLAUDE.md update are committed.)

---

## A. Requirements traceability

Derived scope (`docs/CORE_OS_360_PHASE8_PLAN.md`), mapped to what actually built it.

| Planned item | Delivered as | Group / migration |
|---|---|---|
| `hs_entity_table()` gap-fill (checked live, not guessed) | Four branches: `permit`, `isolation`, `emergency_plan`, `management_review` | Group 1 / 177 |
| Graph traversal | `risk_graph_neighbors(p_type, p_id, p_depth)` — recursive, both directions, hard-capped at 3 hops / 500 rows | Group 1 / 177 |
| Connected Compliance Intelligence | `lib/riskGraph/intelligence.ts` (shared-dupe pair) — four deterministic insights | Group 2 (no migration) |
| Generic Connections panel | Folded into the Group 3 explorer panel rather than built as a separate reusable component — see §D | Group 3 (no migration) |
| Risk Graph explorer + Intelligence dashboard | Consolidated onto ONE admin page, `/health-safety/<companyId>/risk-graph` — a documented scope decision, not an oversight (see §D) | Group 3 (no migration) |
| Portal read-only equivalent | `/protect/risk-graph`, dashboard only, no explorer | Group 3 (no migration) |
| Regression, adversarial QA, handover | This document, plus the `unlinkedApplicableObligations` coverage-type fix | Group 4 (no migration) |

One item from the plan was delivered in a genuinely different shape than first described, recorded here rather than silently reshaped:

- **The plan named a separate, reusable "Connections panel" component** (mirroring the five existing portal per-record link panels). What was actually built is the explorer panel on the ONE new admin risk-graph page, which serves the same purpose (see any record's connections) via a picker rather than being embedded on every individual record's own page. Building five more embedded panels (one per admin-manageable entity type) was judged unnecessary scope for a first pass — admin has no per-record pages for the entity types (hazards, risk assessments) that would benefit from it most (see §D), and the existing portal panels already cover the record types portal manages directly.

---

## B. The Risk Graph's real structure

Checked before writing a line of code, not assumed:

- **A hazard's coverage by a risk assessment is a direct FK** (`risk_assessment_items.hazard_id`, migration 123) — never an `hs_links` row. `hs_links` exists for the OTHER relationships (an incident pointing at an assessment, a related hazard/incident pair) — the exact split `RaLinks.tsx`'s own header comment already documented before this phase began.
- **A control's reuse across assessments is `risk_item_controls`** (migration 123), which denormalises `control_title`/`effectiveness` onto each linking row — grouping by `control_id` answers "how many assessments rely on this control" directly, with no join needed beyond `risk_assessment_items` to resolve which assessment each item belongs to.
- **A legal obligation has NO direct FK to a risk assessment or hazard at all.** The only connection is an explicit `hs_links` row an admin adds by hand — so the ABSENCE of one is itself the insight (a gap worth a human's look), not a defect requiring a schema change. Not every obligation needs a risk assessment; this insight surfaces the ones that plausibly should have one and don't yet.
- **`hs_links` and its four "staff sees everything" ALL policies** (`hs_links_staff_all`, plus the identical-shaped ones on `hazards`/`risk_assessments`/`risk_assessment_items`/`risk_item_controls`) have NO `company_id` restriction — a staff session sees every organisation's rows regardless of which client is currently "active". Verified live and by reading policy text (§F) that this is correct, pre-existing, Phase-2-era behaviour, not something this phase widened — the traversal function is still bounded correctly because `hs_links_check()` refuses a cross-organisation edge at INSERT time (122), so the GRAPH itself never contains a cross-company edge for the walk to follow, whatever policy let the session see the row.

---

## C. The one defect found and fixed

**`unlinkedApplicableObligations` counted ANY `hs_links` connection as coverage, not specifically a connection to a hazard or risk assessment.** The insight's own label promises "applicable legal obligations with no linked risk assessment" — but the first implementation flagged an obligation as "covered" the moment it was linked to ANYTHING (a document, an incident, an audit finding), because the loader fetches every `hs_links` row naming the obligation without filtering by the other end's type, and the original pure-function code didn't filter either.

- **Found by**: re-reading the CLAUDE.md Group 2 writeup (which specifically said "no `hs_links` connection to any risk assessment or hazard") against the actual code (which checked no such thing) — a genuine mismatch between documentation and implementation caught by adversarial self-review, the same discipline this codebase's other phases' Group-N QA passes have caught similar gaps with.
- **Fixed**: `computeRiskGraphIntelligence()` now only counts a link as coverage when the OTHER end's type is `hazard` or `risk_assessment` (`COVERAGE_TYPES`). The loader queries are unchanged (still fetch every `hs_links` row naming the obligation, regardless of the other end) — filtering happens in the pure function, keeping the SQL simple.
- **Proven**: two new test cases, one confirming a hazard-typed link still counts as coverage (unchanged behaviour), one proving a link ONLY to an incident or a document does NOT count and the obligation is still flagged. Mutation-tested live in this session: reverting the fix to the original "any connection counts" logic was reintroduced and watched to fail the new negative-case test, then reverted back to the fix.
- **Severity**: Medium. The bug would have UNDER-reported gaps (an obligation genuinely lacking risk-assessment coverage, but linked to something unrelated, would have silently shown as "fine") — a false-negative on a compliance-gap surface, the worse direction for a tool whose whole purpose is surfacing gaps.

No other defect was found in this phase's adversarial review.

---

## D. Scope decisions, documented rather than silently made

- **No portfolio-wide (consultancy) RLS anywhere in this phase.** Unlike Phases 6-7, nothing about "Risk Graph & Connected Compliance Intelligence" as a phase name implies a cross-client capability. `hs_links`' existing `my_company_id()`-scoped RLS (staff-in-client-workspace, or a client's own session) already covers every reader this phase's UI targets. Recorded in the plan doc before Group 1 began, held throughout.
- **The explorer and the dashboard were consolidated onto ONE page**, not built as two separate admin pages as the plan's own wording ("a Risk Graph explorer and a Connected Compliance Intelligence dashboard") might suggest read literally. Splitting them would have meant two near-empty pages sharing the same loaded data with no real independent use case — a staff member exploring connections is doing so BECAUSE the intelligence dashboard surfaced something worth investigating, so keeping them on one page matches the actual workflow.
- **Hazards and risk assessments have no admin-side per-record page — checked, not assumed.** A scan of `HsCompanyTabs.tsx`'s pre-existing 24 tabs (now 26) found neither ever listed, and migration 122's own header comment confirms the design: staff manage these exclusively through the portal's PROTECT workspace, one client at a time, the same as a consultant would. The dashboard links out to the portal (`${portalUrl()}/protect/hazards/<id>`, `.../risk-assessments/<id>`) for those two record types rather than inventing new admin-side detail pages that would duplicate the portal's own editing UI.
- **The explorer's starting point is limited to entities the page already has a resolvable label for** (hazards, risk assessments, legal obligations loaded server-side for the dashboard). A free-text UUID field would be poor UX and error-prone; labelling a NEIGHBOUR beyond that set (any of the other ~32 `hs_entity_table()` branches) would need a query per branch. This is disclosed scope, not an oversight — real work for a later pass if the explorer proves worth extending to arbitrary starting points.
- **No component-level (DOM-rendering) test anywhere in this phase** — consistent with this codebase's established testing convention (a repo-wide check found zero React-component-rendering tests anywhere before this phase, in either app). Verified via `tsc`, both production builds, and code review instead.

---

## E. Migration / RLS report

| Migration | What | RLS shape |
|---|---|---|
| 177 | `hs_entity_table()` gains four branches (`permit`, `isolation`, `emergency_plan`, `management_review`); `risk_graph_neighbors()` (new, `SECURITY INVOKER`) | No new table, no new policy — `risk_graph_neighbors()` inherits `hs_links`' existing RLS entirely, by construction (it runs as the caller) |

No RLS was added, widened or modified anywhere in this phase — every read Groups 2-3 perform is through EXISTING policies (`hazards_read`, `risk_assessments_read`, `risk_items_read`, `risk_item_controls_read`, `hs_links_read`, `organisation_legal_obligations`' own client-read policy) that predate this phase by three-plus phases in every case.

---

## F. Regression report

- **The full vitest suites are the regression suite.** Every pre-existing module (Referrals, A2I emails, Development Plans, E-Learning, Broadcast, Billing/Stripe, HR, Recruitment, every Phase 1-7 H&S/workforce/governance/consultancy subsystem) has its own test files, none deleted, none skipped, all green throughout the phase: **1461 admin / 705 portal** as of this document (up from 1437/703 at the end of Phase 7).
- **Both production builds compile clean.** Portal built with stub Supabase env vars to get past the documented, pre-existing sandbox-only missing-env-vars prerender failure (unrelated to this phase, on a page it never touches).
- **All five CI guards pass**: `check-shared-dupes.sh` (48 pairs — up from 47 at the end of Phase 7; `riskGraph/intelligence.ts` is the one new pair), `check-row-cap.sh` (clean), `check-route-validation.sh` (44, unchanged — this phase added no new API route needing validation, only pages and one new RPC function), `check-admin-routes-linked.sh` (42 static routes, all reachable — the new admin risk-graph route nests under the already-linked `/health-safety` prefix), `check-blind-updates.sh` (102, unchanged — this phase writes NOTHING; both dashboard pages and the explorer are entirely read-only).
- **No shared table, trigger or RLS policy from a prior phase was modified in any way.** This phase's only schema change (177) is two function bodies — `hs_entity_table()` (an additive `CASE` extension) and a brand-new `risk_graph_neighbors()`. Live-verified via `pg_get_functiondef()` that every pre-existing branch of `hs_entity_table()` reads back unchanged.

This constitutes the "previous phases remain functional" regression requirement.

---

## G. Adversarial QA

### G.1 Graph traversal correctness and depth cap

Proven live in Group 1's own probe (`supabase/probes/177_risk_graph_foundation.sql`, all checks passed): a 5-node chain walked from its middle node returns exactly its direct neighbours at depth 1 (correctly labelled `incoming`/`outgoing`), both 2-hop nodes at depth 2, self (hop 0) excluded throughout; the depth cap holds at exactly 3 hops even when the caller requests `p_depth = 10`.

### G.2 Tenant isolation on `risk_graph_neighbors()`

Same probe: an unauthorised session (a different organisation, no relationship, no grant) querying the function sees ZERO rows of another company's graph, never an error and never a leaked row — proving the `SECURITY INVOKER` design actually holds in practice, not just by keyword. The SAME organisation's own client session sees the full neighbourhood. A cross-organisation link INSERT attempt is still refused by the pre-existing `hs_links_check()` trigger (122), confirming this phase changed nothing about who may CREATE an edge, only how existing edges are read.

### G.3 The `unlinkedApplicableObligations` coverage-type defect

Covered in full in §C. One real, Medium-severity defect found and fixed via adversarial documentation-vs-implementation review, mutation-tested live in this session.

### G.4 Staff blanket-access policies and the admin dashboard's correctness

Investigated as a genuine "could this silently leak or silently show nothing" question, not assumed safe: `hazards`/`risk_assessments`/`risk_assessment_items`/`risk_item_controls`/`hs_links` all carry a `..._staff_all` policy with NO `company_id` restriction (pre-existing since migration 122/123, unmodified by this phase). This means a staff session's `risk_graph_neighbors()` call sees the FULL graph across every organisation from the RLS layer's point of view — but the traversal itself only ever visits rows reachable from the ONE starting node the caller supplied, and every edge in the graph was refused at creation time unless both ends already shared an organisation (`hs_links_check()`). So the blanket staff policy cannot cause a starting node in Company A's graph to reach a Company B node — there is no such edge to walk. Verified this reasoning against the ACTUAL Group 1 probe design (which relies on exactly this property) rather than treating it as a new claim needing its own fresh probe.

### G.5 Regression across Referrals, A2I, E-Learning, Broadcast, Billing, HR, Recruitment and Phases 2-7

Covered in §F.

---

## H. Defect classification (Phase 8, this pass)

| Defect / gap | Found by | Severity | Fixed by | Verified |
|---|---|---|---|---|
| `unlinkedApplicableObligations` counted a link to ANY entity type as coverage, contradicting its own documented and labelled meaning ("no linked risk assessment") | Group 4 adversarial documentation-vs-implementation review | Medium (a false-negative on a compliance-gap surface — the worse direction for a tool that exists to surface gaps) | `COVERAGE_TYPES` filter in `computeRiskGraphIntelligence()`, restricted to `hazard`/`risk_assessment` | Two new tests (positive: hazard link still counts; negative: incident/document links do not), mutation-tested live (reverted and watched fail, then restored) |

No other Critical, High or Medium finding was found anywhere in this phase's adversarial review. The staff-blanket-policy question (§G.4) was investigated and confirmed to be existing, correct, pre-Phase-8 behaviour rather than a new gap this phase introduced.

---

## I. Technical debt

- **The explorer cannot label a neighbour beyond hazards/risk assessments/legal obligations.** A found neighbour of any other type shows only its type name and a truncated id, never a title. Disclosed in §D, not fixed here — a genuine, bounded piece of future work if the explorer proves valuable enough to extend.
- **No separate, embeddable "Connections panel" component was built.** The plan named one; what exists is the explorer on the one new risk-graph page. If a future phase wants per-record connection panels embedded directly on, say, an admin incident or audit-finding page, that is new work, not a completed item being revisited.
- **`unlinkedApplicableObligations`'s COVERAGE_TYPES is a fixed two-value set** (`hazard`, `risk_assessment`). If a future need arises to treat, say, a linked controlled document as also constituting "coverage" for a legal obligation, that is a product decision for that later phase to make and document, not something this phase should have silently guessed at.
- **No portfolio-wide (consultancy) version of this phase exists.** If a future phase decides a consultant should be able to browse a client's risk graph or intelligence dashboard without switching into that client, that needs its own RLS work (the portfolio-wide pattern Phases 6-7 established) — explicitly out of scope here per §D.

---

## J. Gate

**PASS WITH MINOR ISSUES.**

- One real, Medium-severity defect (§C, §G.3, §H) was found by this phase's own adversarial review — a documentation-vs-implementation mismatch that would have under-reported a real compliance gap. Fixed within this same group and mutation-tested live (reverted to prove the test actually catches it, then restored), rather than carried forward as a known issue.
- Graph traversal correctness and tenant isolation on the new `risk_graph_neighbors()` function were both proven live against real data, not merely asserted from the `SECURITY INVOKER` keyword (§G.1, §G.2).
- The one non-obvious architectural question this phase's design surfaced — whether the pre-existing staff blanket-access policies could let `risk_graph_neighbors()` leak across organisations — was investigated on its own terms and confirmed safe by construction, not assumed (§G.4).
- Every scope decision that might otherwise look like an oversight (no portfolio-wide RLS, the explorer/dashboard consolidation, the "no admin page for hazards/RAs" link-out design, the explorer's limited starting-point set) is explicitly documented rather than silently made (§D).
- Full regression (tsc clean both apps, 2166 total tests across both apps, all five CI guards, both production builds) is green (§F).

**Phase 9 may begin.**
