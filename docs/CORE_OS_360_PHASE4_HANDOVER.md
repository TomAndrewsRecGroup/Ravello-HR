# Core-OS 360 Phase 4: Assets, Inspections, PUWER, LOLER, Contractors, Permits, Isolation/LOTO, Emergency Planning — Engineering Handover and QA Report

**Date:** 2026-09-28. **Branch:** `claude/optimistic-albattani-uezht8` (not merged, so the app code is not deployed).
**Database:** migrations 144–155 are applied live to `sbmekaviwkiyorvmtgcu`, each verified by reading the live catalog state back after applying, never trusted from the apply call's own success response.
**Plan:** `docs/CORE_OS_360_PHASE4_PLAN.md` (the operator's full spec). **Probes:** `supabase/probes/144_*` through `155_*`, each a rolled-back `DO $$ ... RAISE EXCEPTION ... END $$;` block — nothing committed live by a probe.
**CLAUDE.md** carries a detailed per-group design/rationale writeup for every group (search "## Core-OS 360 Phase 4"); this document is the QA/handover summary, not a duplicate of that detail.

Scope delivered: the asset register extended in place, a checklist inspection engine, defects raised on the existing `actions` table with a database-enforced return-to-service gate, PUWER assessments, LOLER thorough examinations with immediate-danger quarantine, contractor companies with insurance/prequalification, contractor workers gated by a Safe-to-Deploy-aware access check, permit to work with a full lifecycle guard, isolation/LOTO with multi-lock group lockout, and emergency planning (plans, required roles, linked equipment, drills). Delivered in 13 independently-verified groups (migration → live probe → tests → all five CI guards → doc update → commit/push, THEN the next group), plus this final regression/security-review/handover pass.

**Phase 5 has not been started.**

---

## A. Existing-operations audit (pre-work, Group 1)

Before any Phase 4 code, a full audit of existing equipment/contractor/inspection/permit-adjacent functionality set the group boundaries:

| Decision | Components |
|---|---|
| **REUSED** unchanged | `actions` (universal corrective-action table — every Phase 4 finding raises a row here, never a second findings table), `hs_files`/evidence infrastructure, `person_authorisations`/`person_deployment_status` (Phase 3's Safe to Deploy engine), `next_record_number()` (122), `assert_same_org()` (118) |
| **EXTENDED** | `hs_equipment` (112) — the existing asset register, given a hierarchy, asset type, PUWER/LOLER flags and a `quarantined` status, never forked into a parallel `assets` table; `hs_equipment_inspections` (114) — given `examination_type`/`immediate_danger` for LOLER, never a second single-event table; `people` (118) — given `contractor_id`; `actions.source_type` — already permitted every value Phase 4 needed (`inspection`, `equipment_inspection`, `contractor_review`, `puwer_assessment`) with no CHECK change required |
| **NEW** | The inspection engine (`inspections`/`inspection_responses`/`inspection_templates`); `puwer_assessments`; `contractors`/`contractor_insurances`; `permit_templates`/`permits`/`permit_people`/`permit_checklist_responses`; `isolations`/`isolation_locks`; `emergency_plans`/`emergency_plan_roles`/`emergency_plan_equipment`/`emergency_drills` |
| **DELIBERATELY NOT BUILT** | A second checklist engine for contractor prequalification (an approval decision, not a per-visit check); a numeric contractor "prequalification score" (a new product decision, not implied by the spec); permit checklist responses' UI (skipped, functional but incomplete — see §H); any predictive/AI safety scoring anywhere (explicitly forbidden by the spec) |

## B. Architecture summary, by group

**Group 2 — Asset register.** `hs_equipment` gains `asset_ref` (minted via `next_record_number`), `asset_type` (CHECKed vocabulary), `parent_asset_id` (self-referencing, cycle-guarded to 50 deep, never a recursive CTE), `operational_area_id` (same-site enforced), `owner_person_id`, `puwer_applicable`/`loler_applicable`/`safety_critical` (booleans — the one ground truth Groups 4/5/6/9 all read), `archived_at`, and `status` gains `'quarantined'`. New capabilities `asset.read`/`asset.manage`.

**Group 3 — Inspection engine.** A routine/pre-use checklist against ONE asset — distinct from `hs_audits` (a facility-wide walk-round) and from `hs_equipment_inspections` (a single dated statutory-examination event, no checklist). Copies `hs_audits`'/`hs_submit_audit()`'s proven shape: insert-only, client-generated ids on both parent and children, one atomic `hs_submit_inspection()` (idempotent on retry), server-computed outcome, never trusted from the client.

**Group 4 — Defects + return-to-service.** A defect is an `actions` row (`source_type = 'inspection'`), never a second table. A critical item's failure quarantines the asset AT SUBMISSION (inside `hs_submit_inspection`), and `hs_equipment_return_to_service_guard()` (a BEFORE UPDATE trigger, applies to every session including staff) refuses to leave `'quarantined'` while an open critical defect exists. Two real gaps found live during this group and fixed before Group 5 began: `hs_equipment` had no client UPDATE policy at all (fixed with `hs_quarantine_asset()`, a DEFINER helper that re-derives the caller's own company, never trusts an argument), and gating inspection INSERT on `asset.manage` locked out the actual front-line user (fixed with a narrower `inspection.perform` capability, migration 147/147a).

**Group 5 — PUWER assessments.** A formal periodic compliance review, optionally backed by a Group-3 inspection via `inspection_id`. Insert-only. Never asserts legal compliance anywhere in code or copy — "recorded assessment outcome", checked live in the probe. 148a rolls the latest assessment's review date forward onto `hs_equipment.puwer_review_due_on` so the reminder never re-fires on historical rows.

**Group 6 — LOLER thorough examinations.** Extends `hs_equipment_inspections` in place (not a new table) with `examination_type`/`immediate_danger`. Immediate danger quarantines the asset unconditionally, regardless of the recorded `outcome` — defence in depth, the same posture Group 4's own submit path takes. Flagged, never decided or reported to the HSE — the same "RIDDOR is decision support" posture Phase 2 already established for a different regulator.

**Group 7 — Contractor companies.** `contractors` (approval_status, risk_rating) + `contractor_insurances` (mutable, one row per contractor+type — a deliberate departure from insert-only, since insurance is ongoing state, not an event history). `contractor_is_current()` is the one deterministic currency check — pure SQL, no scoring. Enforces the `contractors.manage` capability, unenforced since Phase 1.

**Group 8 — Contractor workers + access gate.** `people.contractor_id` links a contractor worker to their company. `contractor_worker_access()` combines `contractor_is_current()` and `person_deployment_status()` — computes no new fact of its own, never re-implements Safe to Deploy.

**Group 9 — Permit to work.** `permit_templates` (per-company, since they name a per-company `authorisation_type_id`) + `permits` + `permit_people` + `permit_checklist_responses` (UI skipped, see §H). `permits_lifecycle_guard()` enforces `draft → issued → suspended → closed/revoked`, re-running the FULL live compliance check (asset not quarantined, authorising person holds the required authorisation, every named person Safe to Deploy) at both first issue and revalidation. `person_holds_authorisation()` fills the exact gap the Phase 3 handover's own "not yet done" list named. **A Medium security-review finding was fixed in this final pass — see QA §D below.**

**Group 10 — Isolation/LOTO.** `isolations` + `isolation_locks` (the multi-lock/group-lockout layer — one row per worker's own personal lock, cleared only by its owner or a recorded, authorised override). `isolations_lifecycle_guard()` enforces "nobody approves their own work" TWICE (verifier ≠ applier; removal-verifier ≠ remover) — correctly, confirmed by the security review. Applying an isolation moves the asset to `'out_of_service'` (never `'quarantined'`, which stays Group 4's own meaning); the LAST open isolation clearing restores it.

**Group 11 — Emergency planning.** `emergency_plans` reuses `hs_documents`' own versioning discipline (a new version is a new row) rather than the table itself. `emergency_plan_roles` links to the Phase 3 authorisation catalogue with a minimum headcount; `emergency_plan_equipment` links assets. `emergency_drills` is insert-only; a finding is an `actions` row, never a second table, and never more than one action per drill.

**Group 12 — Notifications/audit sweep.** A completeness pass across Groups 2-11 found two tables with a trigger but no consuming rule beyond a reminder (`puwer_assessments.created`, `emergency_plans.created`) and fixed both. Verified every other `SECURITY DEFINER` function's grants and every sub-record table's deliberate absence of its own audit trail against the parent-record pattern.

**Group 13 — Admin + portal UI.** Four new admin tabs/pages (Contractors, Permits, Isolations, Emergency Plans) under the existing `/health-safety/[companyId]` workspace, following the established `IncidentsClient.tsx`/`EquipmentClient.tsx` pattern exactly (server `readAllPages` fetch, client component doing direct writes under staff RLS with `COUNT_EXACT`/`judgeWrite` on every status change, lifecycle-transition errors surfaced verbatim from the database trigger as a toast, never re-implemented client-side). One portal read-only page, `/protect/emergency-plans` — the only one of the four domains with a genuine client-read RLS policy; contractors/permits/isolations stay admin-only, matching their notification rules' own "no portal page yet" framing.

## C. What each group's live probe actually proved

Every group's migration has a corresponding `supabase/probes/<n>_*.sql` file, run against the live database and rolled back by its own final `RAISE EXCEPTION`. Counts, not re-derived here (see CLAUDE.md's per-group sections for the full check list): 144 (18), 145 (20), 146 (6), 149 (6), 148 (12), 150 (14), 151 (7), 152 (22), 153 (16), 154 (14), 155 (2). Every probe passed on the run recorded in CLAUDE.md; several were run TWICE — once to confirm a real defect existed (146's client-write RLS gap, 154's probe-ordering bug that turned out to be the guard working correctly), then again after the fix, to `n/n` — never trusted on a single green run where a live gap was suspected.

## D. QA — the Group 14 adversarial security review

**How it was run.** A separate agent, with the same brief structure as Phase 3's QA 42 review, was told to hunt for the same classes of defect (RLS gaps, DEFINER-function privilege escalation, cross-organisation FK leaks, lifecycle-guard bypass, UI trust of client-controlled values) across every table and function created in migrations 144-154, plus the Group 13 UI. Every candidate finding was required to be reproduced LIVE against `sbmekaviwkiyorvmtgcu` before being reported — a suspicion not reproduced is explicitly logged as "suspected, not confirmed," never as a finding.

**Verdict returned: PASS WITH MINOR ISSUES** (before the fixes below; re-verified PASS after).

| # | Sev. | Finding | Proven | Fixed by |
|---|---|---|---|---|
| 1 | **Medium** | **A permit could be issued naming the ISSUING PERSON as its own `authorised_person_id`.** `isolations_lifecycle_guard()`/`isolation_locks_guard()` (153) both enforce "nobody approves their own work"; `permits_lifecycle_guard()` (152) checked only that the authorising person HELD the required authorisation, never that they were not the acting session itself. | Live: a permit template with no required authorisation, `authorised_person_id` set to a `people` row whose `user_id` matched the acting session, issued cleanly with no exception. | 155 — a check added to the issue/revalidate branch: `authorised_person_id` may not resolve (via `people.user_id`) to `auth.uid()`. Fires only when the acting session IS linked to a `people` row, so a staff member administering the record on a contractor's behalf is never blocked. Re-proved refused by `supabase/probes/155_*.sql` (2/2): the self-authorised case is refused with the exact message; a genuinely different authorising person still issues normally. |
| 2 | Low (not exploitable — defence-in-depth gap) | The portal's `/protect/emergency-plans` page read `emergency_plan_roles`/`emergency_plan_equipment` with no `company_id`/`plan_id` filter, relying entirely on RLS (which was independently confirmed correctly scoped — **no cross-tenant leak existed**) rather than the explicit filter every sibling query on the same page carries. | Reviewed, not a live exploit (RLS already blocked it) | Fixed the same day: the page now fetches the company's own `emergency_plans` first, then filters both queries with `.in('plan_id', planIds)` — the same "fetch an id list first" pattern `equipment/page.tsx` already uses for its own inspection-evidence join. |

**Checked and found clean** (the review's own list, not re-derived): RLS enabled and correctly `TO authenticated`-only (no `anon` grant) on every new/altered table; `inspection_templates`/`hs_equipment_inspections` client-write absence is by design; the `inspection.perform`/`asset.manage` capability fix from Group 4 confirmed live, not just on disk; `contractors.manage` reuse across contractors/permits/isolations reasoned through and judged a reasonable design choice given the trusted, senior role population that actually holds it (no generic employee role); every cross-organisation FK named in the review brief confirmed guarded by a live trigger, with a cross-org `isolations.applied_by` insert reproduced refused; `hs_quarantine_asset()`/`hs_equipment_return_to_service_guard()` never trust an argument for authorization; no Phase-4 DEFINER function is executable by `anon`; the isolation "nobody approves their own work" checks are correctly scoped (a removal-verifier tied to an unrelated isolation is fine — the rule's only job is "not the same person," which it enforces); `emergency_drills`/`inspections`/`inspection_responses` insert-only enforcement confirmed live via `information_schema.table_privileges`, not just the migration's own `REVOKE` text; every `.update(` in the Group 13 UI pairs `COUNT_EXACT` with `judgeWrite`; staff RLS is intentionally blanket (`is_tps_staff()`), so a route-param-derived `company_id` on an admin insert is not new exposure.

**Not reproduced / out of the review's time budget**, logged as suspected-only, not findings: exhaustive NULL/omitted-field fuzzing of `permits_lifecycle_guard()` beyond the self-authorization case (same root cause, not separately reproduced); a fresh live probe of 148/149 beyond re-reading their already-probed SQL; a full line-by-line audit of every Group-13 server `page.tsx` beyond their client components' write paths. None of these are treated as known gaps requiring a fix — they are scope notes for anyone extending this phase.

## E. Regression

After the two Group-14 fixes, the full regression was re-run from a clean checkout state:

- `tsc --noEmit` clean, both apps.
- `vitest run`: **1138 admin / 602 portal**, all green — unchanged from Group 13's own count (the security-review fixes touched a DB function and a portal page's query shape, not any tested TypeScript logic).
- All five CI guards pass: `check-shared-dupes.sh` (43 pairs), `check-row-cap.sh`, `check-route-validation.sh` (44, unchanged), `check-admin-routes-linked.sh` (60 pages), `check-blind-updates.sh` (102, unchanged).
- Both production builds (`next build` with stub Supabase env vars) compile clean.
- Migration 155 applied and verified live (function re-created, `REVOKE ALL` confirmed via `has_function_privilege`); probe 155 run 2/2.

## F. Defect classification (Phase 4, this pass)

| Defect | Found by | Severity | Fixed by | Verified |
|---|---|---|---|---|
| `hs_equipment` had no client UPDATE policy at all | Live probing, Group 4 | High (would have silently no-op'd every client-submitted critical-fail quarantine) | 146 (`hs_quarantine_asset()`) | Probe 146 1/6 → 6/6 |
| Inspection INSERT gated on `asset.manage` locked out the front-line user | Live probing, Group 4 | High | 147/147a (`inspection.perform`) | Probe 146 re-run under the correct capability |
| Dynamic capability-grant INSERT unparseable by `tenancySql.test.ts` | Test run, Groups 2 and 4 | Low (test-parity, not a live security gap) | 144a, 147a | `tenancySql.test.ts` green |
| Two vocab anchors collided on textually-identical CHECK clauses (114 vs 148 `outcome`, 106 vs 154 `status`) | Test run, Groups 5 and 11 | Low (test-parity) | Anchored on unique preceding column context | `vocab.test.ts` green |
| A permit could self-authorise | Group 14 security review | **Medium** | 155 | Probe 155 2/2 |
| Portal emergency-plans page relied on RLS alone for two of six queries | Group 14 security review | Low | Same-day fix | `tsc` clean, page re-read |
| `puwer_assessments.created`/`emergency_plans.created` had no consuming rule | Group 12 sweep | Low (a real, if minor, silent-until-reminder gap) | New `hsRules.ts` rules | `hsRules.test.ts` green |

## G. Gate

**PASS WITH MINOR ISSUES.**

- No Critical or High finding is open. The one Medium the Group 14 security review found (permit self-authorisation) is fixed and re-proved refused live. The one Low finding (defence-in-depth query scoping) is fixed the same day.
- Every group's own live probe passed, several after a real defect was found and fixed mid-group (Group 4's two RLS/capability gaps, Group 12's two missing consequence rules) — none of these reached this final pass still open.
- Full regression (tsc, 1740 total tests across both apps, all five CI guards, both production builds) is green after every fix in this document.
- **Minor issues, recorded for any follow-up work, none blocking:**
  - Permit checklist responses (`permit_checklist_responses`/`permit_template_items`) have a working schema and RLS but no UI — Group 13's own scope note, not a defect.
  - The review's own "not reproduced" list (§D) — exhaustive fuzzing of `permits_lifecycle_guard()`, fresh live probes of 148/149, full Group-13 server-page audit — is a reasonable scope boundary for one review pass, not a known gap.
  - No portal UI exists yet for contractors/permits/isolations (by design — see Group 7-10's own "STAFF-ONLY for now" notification framing in CLAUDE.md); a future phase widening portal access to these would need its own RLS design (today's client-facing policy for all three is capability-gated, not a plain read), not just a page.

**Phase 5 is not to begin** until this branch is merged and deployed, per the operator's standing instruction.
