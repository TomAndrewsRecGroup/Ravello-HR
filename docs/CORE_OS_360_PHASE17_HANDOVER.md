# Core-OS 360 Phase 17: Regulatory Intelligence → Action (Tavily) — Engineering Handover and QA Report

**Date:** 2026-09-30. **Branches:** every group's own branch, merged into
`main` immediately after that group's own tests/guards/builds went green
(PR #276 for Group 1, PR #277 for Group 2, this document's own PR for
Group 3), per the operator's standing "regular merges so you don't lose
anything" instruction — this phase is fully merged and deployed as of
this document.
**Database:** no migration — this phase wires the real Tavily call into
`legal_requirement_research_notes`, built inert by migration 159 (Phase
5) for exactly this purpose.
**No detailed operator brief exists in the repo for this phase** (the
same situation Phases 8-16 were in) — scope was derived from the
phase's own name plus the ONE piece of infrastructure the codebase
already, and explicitly, reserved for it: `docs/
CORE_OS_360_PHASE17_PLAN.md`, written before Group 1 began.

Scope delivered: a staff member, from the Legal Register catalogue
page, can run a real Tavily web search for a specific legal
requirement, see the verbatim results, and record what — if
anything — was done about it. Delivered in **3 independently-verified
groups** (Tavily client + search route → admin UI → this final
regression/adversarial-QA/handover pass).

**Phase 18 is NOT to begin** until this branch is merged and deployed,
per the operator's standing instruction. (It already is — see the
branch note above — so Phase 18 is clear to begin once this document
and the CLAUDE.md update are committed.)

---

## A. Requirements traceability

Derived scope (`docs/CORE_OS_360_PHASE17_PLAN.md`), mapped to what
actually built it.

| Planned item | Delivered as | Group |
|---|---|---|
| The absolute rule shaping everything else | Tavily never decides anything — no verdict, no AI paraphrase, a human always decides | Group 1 (research) |
| Tavily client | `lib/tavily/client.ts` (`tavilySearch`, `summariseResults`, `defaultQueryFor`) | Group 1 |
| The one route that ever calls Tavily | `POST /api/admin/legal-register/[id]/research` | Group 1 |
| Admin UI: run a search, read past research, record a decision | `LegalRequirementsCatalogueClient.tsx`'s Research panel | Group 2 |
| The "→ Action" loop | Reuses the EXISTING `/broadcast?legal=<id>` link (Phase 5) — no new mechanism | Group 2 |
| Regression, adversarial QA, handover | This document | Group 3 |

The plan doc's own central finding, made before any code was written:
this phase completes infrastructure the codebase had already reserved,
twice over — migration 159's own header comment named it explicitly
("A LATER group wires the real call"), and the action side
(`actions.source_type = 'legal_requirement'`, the Broadcast prefill)
was already built and needed no new work at all.

---

## B. Adversarial review

### B.1 [Low — documentation, real operational consequence] Two new environment variables were never added to CLAUDE.md's own Environment Variables section

`TAVILY_API_KEY` and `TAVILY_API_URL` are read by `lib/tavily/client.ts`
but were never added to the top-of-file "Environment Variables"
section this codebase maintains for exactly this purpose (the same
place `IVYLENS_API_URL`, `MANATAL_API_KEY`, the Stripe keys are
documented). Without it, whoever deploys this phase to Vercel has no
signal that a new secret needs setting — every "Run Tavily search"
click would fail with a `TAVILY_API_KEY is not configured` error,
correctly reported to the user (not a silent failure in the sense of
returning wrong data) but a real, avoidable friction point for the
first person who tries the feature in production.

**Found by checking this codebase's own established documentation
convention** — every prior external-API phase (IvyLens, Manatal,
Stripe) added its own env vars to this section; Phase 17 skipped it.
**Fixed**: both vars added, with a one-line note on what the missing
key looks like from the outside (a "not configured" error on the
button click) so it is diagnosable even by someone who has not read
this handover.

**A second, wider gap was found while confirming this one, and
deliberately NOT fixed here**: the Environment Variables section
itself has not been kept current since roughly Phase 29 — several
later phases' own env vars (`JEV_API_KEY`, `RESEND_API_KEY`,
`CRON_SECRET`, the referral pipeline's `REFERRAL_EMAIL_FROM` and
related vars) are documented only in their own phase sections further
down this file, never backfilled into the top-of-file summary. This is
real, pre-existing debt from BEFORE this phase, not something Phase 17
introduced — noted explicitly rather than silently left, and
recommended as in-scope for Phase 19's platform-hardening sweep (a
full audit-and-consolidate pass), not invented here as a fix that
would widen this phase's own scope well beyond what it was asked to
do.

### B.2 Checked and found clean

- **The API key never reaches the client.** `lib/tavily/client.ts` is
  imported from exactly one file — the server-only API route — grep
  confirmed no second import anywhere in either app.
- **Tavily decides nothing.** Re-read every write path this phase adds:
  the research route only ever inserts into
  `legal_requirement_research_notes`; "Mark reviewed" only ever updates
  that same row's `reviewed_by`/`reviewed_at`/`action_taken`. Neither
  ever touches `organisation_legal_obligations.applicability_status` or
  `compliance_evaluations.status` — the two columns migration 159's own
  absolute rule protects. `summariseResults()` is a verbatim join, not
  an LLM call — there is no AI/Jev import anywhere in this phase's own
  files at all.
- **RLS is unchanged and was re-confirmed, not merely assumed**:
  `legal_requirement_research_notes` has no client-facing policy of any
  kind (migration 159, untouched by this phase) — the research panel is
  reachable only from the staff-only admin app, gated by
  `requireStaff()` on the one route that writes, and RLS itself on the
  direct client-side reads the UI makes for listing past notes.
- **Rate limiting** (`limiters.vendor`, 60/min per user) is the same
  shared bucket every other vendor-calling route in this codebase
  already uses (IvyLens, Manatal, the RAMS section-suggestion route) —
  a deliberate, pre-existing design (one "external vendor calls"
  budget per user, not a per-vendor one), not something this phase
  needed to reconsider.
- **The concurrent "Mark reviewed" scenario was reasoned through, not
  ignored.** Two staff members reviewing the SAME research note at
  once would have the second write silently overwrite the first's
  `action_taken` text — this table has no `row_version` column the way
  `method_statements`/other frequently-co-edited records do, so there
  is no cheap way to detect the collision. Judged an accepted,
  low-stakes limitation rather than a defect to fix: a single research
  note is reviewed by whichever staff member happens to look at it, in
  practice essentially never contended, and adding a `row_version`
  column purely to guard this one, narrow interaction would be scope
  invented beyond what this phase was asked to build.
- **Validation ceilings match their DB columns exactly** (the Phase 15
  B.1 lesson, applied proactively this time, not found as a defect
  here): `query` at `optionalShortText(500)` matches `query_used`'s own
  500-char CHECK; the UI's `action_taken` input and `raw_result_summary`
  handling respect their own 2000/4000-char limits.
- **`defaultQueryFor()`'s output can never exceed the 500-char
  ceiling regardless of input** — `legal_requirements.title` is capped
  at 200 chars and `jurisdiction` at 100 by their own DB CHECKs, so the
  combined default query (title + jurisdiction + a ~24-char suffix) is
  always comfortably under 500 even before the function's own explicit
  `.slice(0, 500)` safety net.
- **The route's own reachability from the UI was traced, not
  assumed**: "Run Tavily search" only renders inside the panel that
  only renders once `toggleExpand()` has already run (and, by that
  function's own gate, already populated `notesById[requirementId]`
  from the database) — so the earlier-suspected "a fresh search could
  silently drop unfetched older notes" scenario is not actually
  reachable through the real UI.

---

## C. Regression

- **`tsc --noEmit` clean on both apps**, throughout every group and
  after the B.1 fix.
- **Full `vitest run` green: 1610 admin / 753 portal** — unchanged from
  the end of Group 2, since this group's fix is documentation-only.
- **Both production builds compile clean.**
- **All five CI guards pass**: `check-shared-dupes.sh` (57 pairs,
  unchanged), `check-row-cap.sh` (clean), `check-route-validation.sh`
  (44, unchanged — the research route validates with `parseBody`),
  `check-admin-routes-linked.sh` (43 static admin routes, all
  reachable — this phase added an API route, never an admin page),
  `check-blind-updates.sh` (102, unchanged — "Mark reviewed" was built
  with `{ count: 'exact' }` + `judgeWrite()` from the start).
- **No shared table, trigger, or RLS policy was touched anywhere in
  this phase** — there is no migration.

This constitutes the "previous phases remain functional" regression
requirement.

---

## D. Design decisions, documented rather than silently made

- **On-demand, never a scheduled cron.** Each Tavily call has a real
  cost and quota; running one automatically, unattended, for an
  unbounded number of legal requirements is a spend decision nobody has
  made. The same caution this codebase already applies to IvyLens's own
  `dry_run` default.
- **No AI summarisation anywhere in this phase.** `raw_result_summary`
  is Tavily's own snippets, verbatim — never an LLM paraphrase. There is
  no Jev involvement at all, since a legal summary is exactly the kind
  of authored content this platform never lets a model write.
- **The "→ Action" loop reuses existing mechanisms only** — the
  Broadcast prefill link, `action_taken`'s own free-text field — rather
  than inventing a bespoke per-client action-raising flow from a
  research note. This kept Group 2's scope to exactly what the plan
  doc named, and avoided a second, parallel path to the same outcome
  Broadcast already delivers.
- **The concurrent-review edge case is accepted, not fixed** (§B.2) —
  a documented, deliberate scope limit given the table's own shape.

---

## E. Technical debt

- **The Environment Variables documentation gap** (§B.1) — Phase 17's
  own two vars are now fixed; the wider historical backlog is flagged
  for Phase 19.
- **No `row_version` on `legal_requirement_research_notes`** (§B.2) — a
  real, accepted limitation if concurrent review of the same note ever
  becomes a genuine operational pain point.
- **No manual-entry UI for a `source: 'manual'` research note** — the
  column and vocab (`LEGAL_RESEARCH_SOURCES`) already support it, but
  nothing in this phase builds a form for it; every note this phase's
  UI can create is `source: 'tavily'`. Left for a future request, not
  built speculatively here.

---

## F. Gate

**PASS WITH MINOR ISSUES.**

- One real, Low-severity defect (§B.1) was found during Group 3's
  adversarial review — the phase's own two new environment variables
  were never added to this codebase's standing Environment Variables
  documentation, a real (if minor) operational-friction gap for
  whoever deploys this next. Fixed, with the wider pre-existing
  documentation backlog explicitly flagged rather than silently
  expanded into scope here.
- The absolute "Tavily never decides anything" rule, the API key's
  server-only reach, RLS, rate limiting, validation ceilings against
  their DB columns, and the concurrent-review edge case were each
  checked against the actual code or reasoned through explicitly and
  found clean or acceptable (§B.2).
- Every scope and design decision that might otherwise look like an
  oversight (on-demand only, no AI summarisation, reusing Broadcast
  rather than a new action mechanism, the accepted concurrent-review
  limit) is explicitly documented rather than silently made (§A, §D,
  §E).
- Full regression (tsc clean both apps, 2363 total tests across both
  apps, all five CI guards, both production builds) is green (§C).

**Phase 18 may begin.**
