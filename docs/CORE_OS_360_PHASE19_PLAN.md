# Core-OS 360 Phase 19: Full Platform Hardening, Regression, Security,
# Accessibility, Performance & Production Readiness — Plan

No detailed operator brief exists in the repo for this phase (the same
situation Phases 8-18 were in). Unlike those, Phase 19 is not a new
feature — it is the closing phase of the Phase 6-19 initiative, and its
own name is the scope statement: a hardening sweep across everything
built since Phase 6, not a new module.

## What this phase is NOT

Not a rewrite, not a new intelligence module, not a second pass at
already-QA'd functional correctness within a single phase (each of
Phases 6-18 already ran its own adversarial QA and closed its own
findings). This phase looks for the class of issue that ONLY shows up
when looking across many phases at once: documentation that fell out of
step as phases accumulated, a discipline applied inconsistently between
an early phase and a late one, a cross-cutting gap no single phase's own
narrower QA brief would have caught.

## Method

A real, evidence-gathering audit (an Explore-agent survey across six
angles: accessibility regressions in newer components, rate-limiting
coverage gaps, row-cap/pagination discipline gaps, orphaned/dead code,
stray console logging, unresolved TODO/FIXME markers) grounds the group
boundaries below, rather than guessing from the phase name alone. Every
finding is verified directly (file read, live grep, or a live probe)
before being treated as real — the same discipline every prior phase's
own QA pass already followed.

## Groups

- **Group 1: Environment Variable documentation consolidation.**
  CLAUDE.md's own "Environment Variables" section was flagged as stale
  by the Phase 17 Group 3 adversarial review and explicitly deferred to
  "Phase 19's platform-hardening sweep" rather than fixed then. A
  from-code audit (every `process.env.X` reference across both apps,
  cross-referenced against what is already documented, deduplicated
  against admin-only/portal-only/shared) replaces the partial list with
  a complete one.
- **Group 2: Security hardening.** Rate-limiting coverage on every
  public/unauthenticated or external-vendor-calling route added since
  Phase 6; any genuinely unbounded read in the newer intelligence
  modules that the existing row-cap guard's own documented blind spot
  (an unbounded `.in()` that could grow past 1,000, not a bare
  `.limit(N>1000)`) would miss.
- **Group 3: Accessibility hardening.** A spot-check of newer
  components (Phases 6-18) against the discipline the F8/F9-era sweep
  established early in this codebase (focus-visible, reduced-motion,
  disabled-control-must-stay-a-non-interactive-element, icon-only
  buttons need an accessible name) — the kind of thing that erodes
  quietly if it is only enforced by convention, not a guard.
- **Group 4: Performance.** Row-cap/pagination discipline in the newer
  lib/ modules, any dead/duplicate query, index coverage for the
  heaviest new read paths.
- **Group 5: Production readiness.** Orphaned API routes with no
  caller, stray `console.log`/`console.error` left in shipped code
  paths, cron registration completeness (`vercel.json` vs actual
  routes — checked and already found clean), any TODO/FIXME left
  without a documented reason.
- **Group 6: Final regression, adversarial QA across the whole
  platform, and the Phase 19 (and Phase 6-19 initiative) handover.**

Each group follows the established discipline: verify the finding is
real before fixing it, fix only what is real, mutation-test where a
fix has a database or logic component, run `tsc`/`vitest`/all five CI
guards/both production builds, update CLAUDE.md, commit, PR, merge —
before starting the next group.
