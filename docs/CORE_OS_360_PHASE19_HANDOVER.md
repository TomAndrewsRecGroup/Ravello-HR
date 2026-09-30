# Core-OS 360 Phase 19: Full Platform Hardening, Regression, Security,
# Accessibility, Performance & Production Readiness — Engineering
# Handover and QA Report

**Date:** 2026-09-30. **Branches:** every group's own branch, merged
into `main` immediately after that group's own tests/guards/builds went
green (PR #282 for Group 1, PR #283 for Group 2, this document's own PR
for Group 3), per the operator's standing "regular merges so you don't
lose anything" instruction — this phase is fully merged and deployed as
of this document.

**This is the final phase of the Core-OS 360 Phase 6-19 initiative.**
Unlike Phases 8-18, this phase is not a new feature — its own name is
the scope statement: a hardening sweep across everything built since
Phase 6, closing documentation drift, security gaps, and defects that
only show up when looking across many phases at once rather than
within any single phase's own narrower QA brief.

No detailed operator brief exists in the repo for this phase (the same
situation Phases 8-18 were in). Scope: `docs/CORE_OS_360_PHASE19_PLAN.md`,
derived from a six-angle research-agent survey of Phases 6-18
(accessibility, rate-limiting, row-cap/pagination discipline, orphaned/
dead code, stray console logging, unresolved TODO/FIXME markers) run
BEFORE any group's own work began, so the group boundaries were grounded
in real, verified findings rather than the phase name alone.

---

## A. Requirements traceability

| Planned angle | Delivered as | Group |
|---|---|---|
| Env var documentation drift (flagged by Phase 17 Group 3) | Full "Environment Variables" section rebuild from a live grep | Group 1 |
| Rate-limiting coverage gaps | 8 routes given a limiter matching sibling-route precedent | Group 2 |
| Row-cap/pagination discipline gaps | A real unbounded `hs_links` read pair fixed | Group 2 |
| Accessibility regressions | 2 unlabelled icon-only close buttons fixed | Group 2 |
| Orphaned/dead code | 2 routes found, flagged for a human decision (not deleted) | Group 2 |
| Stray console logging / TODO markers | Checked, found clean | Group 2 |
| Final regression, adversarial QA, handover | This document, plus a real widespread defect found and fixed | Group 3 |

The six-angle survey's own findings (delivered as a subagent report,
see `docs/CORE_OS_360_PHASE19_PLAN.md`'s own header) are the evidence
base Groups 1-2 closed almost entirely in two passes — a genuinely
different shape from every prior phase's own 2-3 group build, because
this phase had no new feature to build, only debt to close.

---

## B. Adversarial review

### B.1 The defect Group 3 itself found and fixed — widespread, not hypothetical

**An adversarial self-review of Group 2's own row-cap fix caught a real
bug in that same fix**, which led to a much larger finding once
followed up. `admin/src/lib/complianceTwin/loadSnapshot.ts`'s two new
`hs_links` reads (Group 2's own fix for the row-cap gap the six-angle
survey found) used `readAllPages()` with a bare `.range(from, to)` and
**no `.order(...)` at all** — `paged.ts`'s own header comment states
this as an absolute rule: "A paged read MUST carry a stable, unique
sort key... without a deterministic total order Postgres may order two
pages differently — silently dropping or duplicating rows across the
boundary." Fixed immediately (selecting the table's real `id` and
ordering by it) — but the fact that a fix authored specifically to
correct a row-cap defect could itself violate the very discipline that
makes row-cap-safe pagination sound was reason enough to check further,
not to declare Group 2 fixed and move on.

**A follow-up research-agent audit of every `readAllPages()` call site
in both apps** found this was not a one-off: the identical bug pattern
had been copy-pasted across **8 files, roughly 70 call sites**, since
Phase 8 (Risk Graph), Phase 12 (Compliance Digital Twin) and Phase 18
(Assurance Today) — each of those phases' own admin page was later
mirrored into a portal read-only twin, so the missing `.order()`
propagated with the copy every time. The same audit additionally found:

- **A worse variant in the ORIGINAL Phase 8 admin risk-graph page**:
  two `hs_links` reads there were not wrapped in `readAllPages()` at
  all — no `.range()`, no `.limit()`, a genuinely unbounded read at the
  exact row-cap class of bug this whole codebase has hit and fixed
  multiple times before (the referral-cron incident this file's own
  history already records). Group 2's row-cap fix in `loadSnapshot.ts`
  addressed the SAME table's SAME shape of read in a DIFFERENT file
  without anyone having checked whether the original page it was
  mirrored from had the identical gap — it did.
- **17 further "soft risk" call sites** with an `.order()` present but
  on a non-unique column alone (`name`, `full_name`, `title`,
  `created_at`) — small per-company reference/lookup lists (site,
  equipment, people and authorisation-type pickers on the permits/
  isolations/emergency-plans/management-review/objectives pages, plus
  one `consultancy_visits` read) where a name collision is plausible,
  if less likely than in a large transactional table.

**All of it fixed in one pass** (17 files total, listed in the Group 3
commit): every affected query now selects the table's real primary key
(`id` for every table here except `person_deployment_status`, whose PK
is `person_id`) and orders by it — either alone, or as a tie-break
appended after an existing business-meaningful `.order()` where one
already existed. No new query shape was invented anywhere; every fix
matches the pattern the same file already uses elsewhere in it.

**Why this matters in practice, and why it does not**: every one of
these tables is scoped `.eq('company_id', ...)` to ONE client — the
failure mode only manifests once a single company's row count for one
of these tables exceeds the 1,000-row PostgREST page size, which is
genuinely unlikely for most of them (a "people" or "authorisation
types" picker list) and more plausible for the transactional ones
(`hs_incidents`, `waste_movements`, `hs_links`) on a long-lived, heavily
audited client. The defect is real and was reachable, but is unlikely
to have silently corrupted a live read yet — it is exactly the kind of
gap that "compiles, renders, reports success" until the day a client
crosses the threshold, the same class of defect this codebase's own
Foundations Sweep (Phase 43) and the referral-cron incident both
already recorded as a standing lesson.

### B.2 Checked and found clean — no further defect in this pass

- **Every fix was verified against the actual table schema**, not
  assumed from column-naming convention: `person_deployment_status`'s
  primary key is `person_id`, not `id` (checked via
  `pg_get_functiondef`-style migration reading before writing the fix,
  the same discipline this codebase applies to every DB-touching
  change) — using `id` there would have failed silently (selecting a
  column that doesn't exist and ordering by it) rather than loudly, so
  this was checked before writing rather than assumed and caught by
  `tsc`.
- **Every one of Group 2's own rate-limit and dead-code findings was
  re-read against the current code**, not merely trusted from the
  earlier pass: `auth.userId`/`portfolio.session.userId` field names
  were confirmed against their real interface definitions before use;
  the manatal/diag route's rate-limit placement (only guarding the
  `?test=1` live-write branch, never the plain status check) was
  re-traced against the route's own control flow.
- **The two orphaned routes flagged in Group 2 remain flagged, not
  deleted, in this pass too** — no new evidence emerged in Group 3 that
  would change that judgment call, and deleting live, deployed route
  code on the strength of a static-analysis survey alone remains the
  wrong call to make unilaterally in a hardening pass.
- **Regression**: the full `vitest` suites across both apps ARE the
  regression suite for this phase (none deleted, none skipped) — every
  pre-existing module across all 19 phases stayed green throughout
  every group of this phase, and both production builds compile at
  every step, not merely at the end.

---

## C. Regression

- **`tsc --noEmit` clean on both apps**, at every group and after every
  fix within Group 3 itself (checked incrementally, not only at the
  end, so a regression from an earlier edit in the same group could
  never hide behind a later one).
- **Full `vitest run` green throughout: 1620 admin / 755 portal**,
  unchanged from the end of Phase 18 through every group of Phase 19 —
  no fix in this entire phase changed any function's behaviour under
  test, which is exactly what is expected of a documentation pass, a
  set of additive rate-limit/pagination guards, and an accessibility
  label fix.
- **All five CI guards pass at every group, with no regression**:
  `check-shared-dupes.sh` (60 pairs throughout), `check-row-cap.sh`
  (clean throughout — this phase's own row-cap fixes are exactly what
  keeps it that way), `check-route-validation.sh` (44, unchanged),
  `check-admin-routes-linked.sh` (43 static routes, all reachable),
  `check-blind-updates.sh` (102, unchanged — this phase added no new
  UPDATE call site).
- **Both production builds compile at every group** — admin and portal
  both, including after the 17-file Group 3 fix.

---

## D. Design decisions, documented rather than silently made

- **Groups 1-2 covered all six planned angles in two passes, not five**
  — the six-angle survey's findings were small and independent enough
  (a documentation rebuild, a handful of rate-limit calls, one row-cap
  fix, two `aria-label` strings) to bundle sensibly rather than opening
  a separate PR per angle for the sake of matching the plan doc's own
  original group count. Manufacturing separate near-empty groups to
  match a pre-written plan would have been the wrong instinct — the
  plan is a scoping tool, not a contract on group count.
- **Two orphaned routes were found and deliberately NOT deleted** —
  recorded as a documented, deliberate decision in Group 2 and
  reaffirmed here, not silently dropped from scope. A hardening pass
  earns the right to flag debt for a human decision; it does not earn
  the right to make destructive calls a static survey cannot fully
  verify.
- **The Group 3 finding was pursued past its own first fix** — Group 2
  fixed ONE instance of the missing-order() bug (in the row-cap fix
  itself) and could have stopped there; the decision to run a
  follow-up audit specifically hunting for the SAME bug pattern
  elsewhere is what turned one fixed line into a genuine 17-file,
  ~90-call-site finding. This is the same discipline every prior
  phase's own Group 3 adversarial pass has followed (Phase 5's
  concurrency bugs, Phase 8's `unlinkedApplicableObligations`
  under-report, Phase 10's asymmetric date windows) — a real finding
  earns a deeper look, not a declared victory.

---

## E. Technical debt

- **Two orphaned API routes remain unresolved**: `admin/src/app/api/
  admin/manatal/matches/route.ts` + its `move-stage` sibling, and
  `portal/src/app/api/consultancy/attention-queue/route.ts`. Both are
  rate-limited (defence in depth) but neither has a confirmed caller in
  either app today. A human decision — keep-and-wire vs. delete — is
  needed; this phase does not make it.
- **CLAUDE.md's "Environment Variables" section, rebuilt in Group 1,
  will drift again** unless every future phase that introduces a new
  `process.env.X` reference updates it directly rather than only
  documenting the var in its own phase's narrative section further
  down the file — the exact drift this phase itself just closed for
  the SECOND time (the first closure, implicitly, would have been
  whichever phase last touched this section before Phase 29).
- **No automated guard catches a `readAllPages()` call with no
  `.order(...)`** — this entire Group 3 finding was caught by a manual
  research-agent grep, not a CI check. A future `check-*.sh` script
  scanning for `readAllPages<` call sites with no `.order(` in the same
  statement would close this permanently, the same way `check-row-
  cap.sh` closed the "unbounded `.limit(N>1000)`" class after it was
  found by hand. Not built here — flagged as the natural next guard to
  add, consistent with this codebase's own standing practice of
  turning a hand-found defect class into a permanent CI check once it
  is understood.

---

## F. Gate

**PASS.**

- Groups 1-2 closed every angle the six-angle survey named, each fix
  verified against real code/schema before being trusted, not assumed.
- Group 3's adversarial self-review of Group 2's own fix surfaced a
  real, previously-unknown defect class (missing `.order()` on a
  paginated read) spanning 8 files/~70 call sites plus 17 further
  soft-risk sites — found by continuing to dig after the first instance
  was fixed, not by declaring the phase done once Group 2's own tests
  passed. All of it fixed in this same phase, not carried as debt.
- Full regression (tsc clean both apps throughout, 2375 total tests
  across both apps unchanged, all five CI guards, both production
  builds) is green at every group boundary, not only at the end.
- Every design decision that might otherwise look like an oversight —
  the two-group angle consolidation, the two orphaned routes left
  unresolved, the choice to keep digging after the first order() fix —
  is explicitly documented rather than silently made (§A, §D, §E).

**The Core-OS 360 Phase 6-19 initiative is complete.**
