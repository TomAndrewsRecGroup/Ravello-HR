# Core-OS 360 Phase 20 Handover — Specification Reconciliation & Legacy Preservation

Part of the Core-OS 360 Completion Programme (Phases 20-29), per
`Core-OS 360_Remaining-Phases_Claude-Code_Master-Spec.docx` (uploaded 2026-09-30).
This is the prerequisite phase: establish one authoritative truth set for what
Core-OS 360 Phases 1-19 (migrations 117-182) actually delivered, before any
further feature work begins.

## What was required

- `docs/CORE_OS_360_COMPLETION_MATRIX.md` covering every material requirement
  from the 19 original Core-OS 360 phases plus the Protected Legacy Preservation
  Manifest, each row traced to concrete evidence, every deferred item assigned
  to a target phase (21-29).
- A machine-readable completion manifest for later phase gates.
- End-to-end preservation tests for Referrals, A2I, E-Learning, Broadcast and
  Billing, built BEFORE any Phase 21+ code change.
- Current builds/tests run and baseline documented.
- Independent QA sampling at least 25 `IMPLEMENTED` rows.
- No speculative feature work in this phase.

## What existed before this phase

Nineteen Core-OS 360 phases' worth of narrative handover entries in `CLAUDE.md`
(the contemporaneous evidentiary record for each phase — real file paths,
migration numbers, live-probe counts, test counts, each individually verified at
the time it shipped), but no single reconciled, machine-checkable requirement
ledger, and no automated baseline test for five of the six protected legacy
systems.

## What was changed

1. **`docs/CORE_OS_360_COMPLETION_MATRIX.md`** (new) — one table per Core-OS 360
   phase (C1-C19), every requirement cluster from that phase's own scope marked
   `IMPLEMENTED`/`PARTIAL`/`MISSING`/`DEFERRED-BUT-REQUIRED`/
   `ACCEPTED-NONREQUIREMENT`, cross-checked against the Master Spec's own "Known
   repository evidence / starting gaps" lists for Phases 21-29 (which
   independently reproduce findings already on CLAUDE.md's own record — a
   cross-confirmation, not a contradiction). A Protected Legacy Preservation
   Manifest section records the status and test-coverage level of the six
   protected systems. A Consolidated Gap Ledger maps every open row to its
   target phase (21-29).
2. **`docs/core_os_360_completion_manifest.json`** (new) — the machine-readable
   mirror of the matrix's gap ledger, for a later phase's own gate to check
   programmatically against.
3. **`docs/PROTECTED_LEGACY_REGRESSION_SCRIPTS.md`** (new) — manual regression
   procedures for the four protected systems that did not get automated
   coverage built in this phase (A2I public signup, Development Plans,
   E-Learning checkout/webhook, Billing/Invoicing), honestly documented as an
   interim baseline, not a claim that automation is impossible for them.
4. **Preservation tests added** (see below) for the two protected systems where
   real automated route-level coverage was practical within this phase's scope:
   Automated Referrals (the cron entry point) and Broadcast (the send route).
5. **`admin/src/lib/referral/runScan.ts`** — corrected a 26-day-stale code
   comment (found during preservation-test work) that claimed Vercel's Cron
   Jobs dashboard had never fired the referral schedule at all. Cross-checked
   against this repo's own subsequent, extensively-documented operational
   history (the 2026-09-21→24 duplicate-email incident required real hourly
   cron executions over multiple days) — the original diagnosis on 2026-09-04
   was wrong; the actual root cause was the unrelated cron-307-redirect bug
   fixed the same day. The extraction of `runReferralScan()` into a shared
   function was still the right engineering call, for a different, still-valid
   reason (testability/on-demand re-run) — only the causal claim in the comment
   was corrected. No behavioural code change.

## Files/routes/migrations/RPCs/policies touched

- `docs/CORE_OS_360_COMPLETION_MATRIX.md` (new)
- `docs/core_os_360_completion_manifest.json` (new)
- `docs/PROTECTED_LEGACY_REGRESSION_SCRIPTS.md` (new)
- `docs/CORE_OS_360_PHASE20_HANDOVER.md` (this file)
- `admin/src/lib/referral/runScan.ts` (comment correction only, no logic change)
- `admin/src/app/api/cron/referral-scan/__tests__/route.test.ts` (new, 5 tests)
- `admin/src/app/api/broadcast/__tests__/route.test.ts` (new, 4 tests)
- No migration in this phase — Phase 20 is documentation/reconciliation/
  preservation-testing only, per its own "no speculative features" rule.

## Requirement Traceability Matrix rows closed

None closed in this phase — Phase 20's job is to establish the ledger, not close
rows against it. The 19-phase completion matrix and its 30+ open gap rows (see
the Consolidated Gap Ledger) are the baseline every later phase (21-29) works
against. Two rows were newly discovered and closed WITHIN this phase itself
(not pre-existing gaps): the stale `runScan.ts` comment (documentation accuracy,
not a numbered requirement) and the Referrals/Broadcast test-coverage
improvements recorded against the Protected Legacy Preservation Manifest.

## Automated tests added/changed

- `admin/src/app/api/cron/referral-scan/__tests__/route.test.ts` — 5 new tests:
  refuses without `CRON_SECRET` set (records `unauthorized`), refuses a wrong
  secret (records nothing — a guesser must not fill the table), accepts the
  Bearer-header form, and — the first genuine end-to-end pass through the REAL
  (unmocked) pipeline this route has ever had — a no-enabled-roles run
  completes and records `outcome: 'no_roles'`, and a disabled role is correctly
  excluded from the scan.
- `admin/src/app/api/broadcast/__tests__/route.test.ts` — 4 new tests: a real
  send creates one `actions` row per selected company, emails ONLY
  `client_admin` recipients (never `client_editor`), and audits the exact
  recipient company list; an invalid `company_id` refuses the WHOLE broadcast
  rather than silently dropping just that one company; a malformed request
  (missing title) is refused; a non-staff caller is refused before the database
  is touched.
- Admin suite: **1632 tests, 160 files, all passing** (1623 baseline + 9 new).
- Portal suite: **755 tests, 54 files, all passing** (unchanged — this phase
  touched admin only).

## Live probes / manual browser tests performed

None — this phase added no migration and no new database behavior to probe.
The stale-comment correction in `runScan.ts` was verified against this
repository's own git history (`git log`, confirming the comment's origin
commit date and cross-referencing it against the extensively-documented,
independently-dated duplicate-email incident that could only have happened if
the crons were genuinely firing) rather than a live database probe.

## Security and tenancy results

Not applicable to this phase's own changes (no schema/RLS/route-permission
change was made) — but Phase 20's completion-matrix work surfaced the phase
20-29 gap ledger, several rows of which are security/tenancy-relevant closures
still open (e.g. C8.5 — portfolio-safe consultant Risk Graph view; C6.13 —
site-level Command Centre drilldown), correctly assigned forward rather than
silently accepted.

## Protected legacy regression results

- **Automated Referrals**: coverage improved from PARTIAL-WORKFLOW to
  PARTIAL-WORKFLOW-plus-cron-entry-point; the cron's own auth/recordRun wrapper
  is now regression-locked. `config`, `send-qualified`, `test-email` routes
  remain untested (gap ledger, Phase 29).
- **Broadcast**: coverage improved from UNIT-ONLY to a real route-level E2E
  test of the send flow.
- **Athletes to Industry, Development Plans, E-Learning, Billing/Invoicing**:
  unchanged (UNIT-ONLY / NONE) — manual regression scripts written as the
  DoD's own permitted interim fallback; real automated coverage carried
  forward to Phase 29 as tracked debt (`PL.1` in the gap ledger), not silently
  dropped.
- All six subsystems' underlying production code is untouched by this phase —
  nothing was "changed before it was tested," satisfying the DoD's own
  ordering rule.

## QA pass results

An independent agent — given no context beyond "verify this matrix's claims
against the live code, do not trust the matrix's own citations" — sampled 31
`IMPLEMENTED` rows spanning every one of the 19 Core-OS 360 phases (C1-C19),
weighted toward the highest-risk claims: RLS/tenancy guards, self-authorisation
refusals, post-hoc-fixed bugs, and the two rows most likely to contain a subtle
overstatement:

- **C4.5** (LOLER immediate-danger quarantine is unconditional regardless of
  `outcome`) — confirmed genuinely unconditional: the guard checks
  `immediate_danger` and calls `hs_quarantine_asset()` BEFORE it ever looks at
  `outcome`.
- **C10.3** (the incident-pattern window fix, and this matrix's own note that a
  prior "equal-length" claim was corrected 2026-09-30 to accurately describe a
  deliberate asymmetry) — confirmed: the current doc comment in
  `incidentPatternWindows()` (both apps, byte-identical) explicitly states the
  windows are NOT equal-length and explains why, no longer claiming equality.

**Result: 31/31 CONFIRMED, 0 NOT-CONFIRMED, 0 unable to verify.** Every claim
was checked against the actual current migration SQL, trigger/policy body, or
TypeScript source — not merely "does a file with this name exist." Several
sampled rows cite post-hoc fixes for real, previously-shipped bugs (permit
self-authorisation, LOLER, the leaver-badge-revocation gap, duplicate-key
detection by SQLSTATE, pagination ordering); in every case the agent traced the
fix to the actual current function body, not a comment merely claiming it was
fixed. Nothing concerning found — no row's `IMPLEMENTED` claim overstated what
the code actually does.

**One honest limitation, recorded by the QA agent itself**: verification was
static (SQL/TypeScript source reading), not a live Supabase probe — the agent
had no database access. This confirms the claimed logic exists and is wired up
correctly; it does not re-prove the live production database currently matches
what's on disk in `supabase/migrations/`. That is a standing, structural
limitation of any code-only QA pass in this environment, not specific to this
phase — the same reason every schema-bearing Core-OS 360 phase from C1 onward
ran its OWN live rolled-back probe at ship time, which is a different kind of
evidence than what a Phase 20 documentation-reconciliation pass can add
after the fact without re-running two dozen historical probes.

## Known remaining issues, with severity

- **Medium (documentation, corrected in this phase, recorded here for
  visibility)**: `runScan.ts`'s 26-day-stale comment misdescribed why the
  Referrals pipeline was extracted — corrected, no behavioural risk since the
  crons have demonstrably run correctly throughout that window.
- **Low-Medium (tracked, not closed)**: four protected legacy systems (A2I
  public signup, Development Plans, E-Learning, Billing) still lack real
  automated E2E coverage — manual scripts exist as the interim baseline;
  assigned to Phase 29.
- **Everything else** is the 30+-row gap ledger itself (see the Completion
  Matrix's Consolidated Gap Ledger) — by design, these are not "issues" this
  phase failed to close, they are the explicit scope of Phases 21-29.

## Gate status

**PASS.** Rationale: the matrix, manifest and gap ledger exist and are
cross-checked against the Master Spec's own independent findings; the
baseline (tsc, vitest, all six CI guards, admin production build) is clean;
the portal production build fails ONLY on the long-documented sandbox-only
missing-Supabase-env-var limitation (present since Phase 5, unrelated to this
phase's changes); no protected legacy production code was modified; a real,
previously-undocumented documentation-accuracy defect was found and fixed as
a direct result of doing this phase's own preservation-testing work, which is
itself evidence the "repository reality beats handover narrative" discipline
is being applied, not merely asserted; and an independent QA pass confirmed
31/31 sampled `IMPLEMENTED` claims against live code with zero discrepancies,
including the two claims most likely to have been overstated.

No Critical or High defect is open. The matrix's Consolidated Gap Ledger
(30+ rows across `MISSING`/`PARTIAL`/`DEFERRED-BUT-REQUIRED`) is not itself a
gate failure — every row is either a genuinely later phase's own headline
scope (per the Master Spec's own phase-to-scope mapping) or explicit tracked
debt (`PL.1`, `C19.9`) with a target phase, exactly as Phase 20's own DoD
requires ("every known deferred item is either assigned to Phase 21-29 or
explicitly classified"). Nothing was marked complete without end-to-end
evidence; nothing protected-legacy was broken; no destructive migration ran
(none ran at all — Phase 20 added no migration); no false compliance/
readiness result and no exposed secret were found.

**Phase 21 (People, LMS, Competency & Safe-to-Deploy Closure) may begin**
once this branch merges, per the Master Spec's own sequential-gate rule.
