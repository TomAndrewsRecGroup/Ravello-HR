# Core-OS 360 Phase 7: Consultant Visit Mode & Automated Site-Visit Reporting — Engineering Handover and QA Report

**Date:** 2026-09-29. **Branch:** every group's own branch, merged into `main` immediately after that group's own tests/guards/builds went green (PRs #240-#246 for Groups 1-7, this document's own PR for Group 8), per the operator's standing "regular merges so you don't lose anything" instruction — this phase is fully merged and deployed as of this document.
**Database:** migrations 173-176 are applied live to `sbmekaviwkiyorvmtgcu`, each verified by reading the live catalog state back after applying, never trusted from the apply call's own success response. Groups 2, 6 and 8 needed no new migration.
**CLAUDE.md** carries a per-group section for Phase 7, written DURING the phase (unlike Phase 6, which was written up only at its own handover) — this document is the consolidated companion, not the first writeup.

Scope delivered: `consultancy_visits` (168's deliberately-minimal Phase 6 table) extended to a full 8-stage lifecycle with pre/post metadata and reusable templates; a Pre-Visit Brief reusing the existing Attention Queue; structured, severity-graded Observations with synchronous immediate-danger escalation and offline-tolerant mobile capture; Universal Actions integration (raise, verify, send back) spanning both a manual and an automatic escalation path; a versioned Report Builder with PDF generation, distribution and Service Ledger integration; follow-up tracking and Consultant Metrics; and a final hardening/regression/adversarial-QA pass. Delivered in **7 independently-verified groups** (migration where needed → live probe → tests → all five CI guards → both builds → commit → PR → merge, THEN the next group), plus this final regression/adversarial-QA/handover pass (Group 8).

**One absolute rule held throughout, with no exception found on adversarial review except the one described in §H.1:** every Phase 7 write is portfolio-wide RLS (`consultancy_organisation_id = my_home_company_id() AND has_capability(row's own client_organisation_id, cap)`, resolved via an `EXISTS` against `consultancy_visits` where the table itself has no `consultancy_organisation_id` column) — never `my_company_id()`, never gated on which organisation happens to be "active" in the browser tab. This is the same architecture Phase 6 established and Phase 7 Group 7 explicitly re-audited rather than assumed still true.

**Phase 8 is NOT to begin** until this branch is merged and deployed, per the operator's standing instruction. (It already is — see the branch note above — so Phase 8 is clear to begin once this document and the CLAUDE.md update are committed.)

---

## A. Requirements traceability

Every numbered section of the Phase 7 brief, mapped to what actually built it.

| Brief item | Delivered as | Group / migration |
|---|---|---|
| 1. Visit lifecycle (plan → confirm → conduct → report → close) | `consultancy_visits` widened to an 8-value `status` CHECK (`planned → confirmed → in_progress → awaiting_report → report_draft → report_issued → closed`, plus `cancelled`), `started_at`/`ended_at`, `previous_visit_id` (same-client only, guarded) | Group 1 / 173 |
| 2. Visit Templates | `consultancy_visit_templates` / `consultancy_visit_template_items`, a direct-session-write CRUD page | Group 1 / 173 |
| 3. Pre-Visit Brief | `buildPreVisitBrief()` reuses the EXISTING `buildAttentionQueue()` output filtered to one client — never a second source of the same open-items fact | Group 2 (no migration) |
| 4. Mobile/Tablet Visit Mode | `VisitCaptureClient.tsx` — insert-as-you-go observation capture, localStorage draft recovery for the observation currently being typed, evidence photo upload via the existing `uploadEvidence()` helper | Group 3 / 174 |
| 5. Structured Observations | `visit_observations` — `observation_type`, `severity`, `client_visible`, `action_required`, a polymorphic `linked_source_type`/`linked_source_id` reusing the 163 `(source_type, source_id)` shape | Group 3 / 174 |
| 6. Universal Actions integration | Three new portfolio-wide `actions` policies (`actions_consultancy_select/insert/update`); "Raise action" (manual, capped below `urgent`) and "Verify previous actions" (Verify / Send back, reusing the pre-existing `actions_lifecycle()` trigger unchanged) | Group 4 / 175 |
| 7. Immediate-danger escalation | `visit_observation_escalate()` (AFTER INSERT, synchronous) — never gated on `action_required`, raises one urgent/critical `verification_required` action regardless | Group 3 / 174 |
| 8. Report Builder | `consultancy_visit_reports` — summary/recommendations/next-visit-date only, findings read LIVE from `visit_observations` at generation time, never duplicated | Group 5 / 176 |
| 9. Versioning + distribution | `hs_documents`/`emergency_plans`/`environmental_aspects`' own "material change is a new row, sibling-race-safe supersede" discipline, applied from day one; PDF via `buildVisitReportPdf.ts` (parameter-injection, mirroring admin's `buildReportPdf.ts`); email via claim-before-send (`email_log.dedupe_key`) | Group 5 / 176 |
| 10. Service Ledger integration | `reports.created` already fires `ledger_report_generated` (169) — no new consequence rule needed; a dead `ledger_visit_completed` condition (listening for a pre-Phase-7 status value) found and fixed along the way | Group 5 (no new rule needed) / fix in Group 5 |
| 11. Follow-up tracking | `reportsNeedingFollowUp()` (`lib/consultancy/followUpDue.ts`, new shared-dupe pair) — "has a visit been BOOKED", never "has a report been issued"; a pagination-safe reminder rule (flag, never filter, inside `query()`) | Group 6 (no migration) |
| 12. Consultant Metrics | `computeConsultantMetrics()` — factual aggregation only, no score, no AI; new portal page `/consultancy/metrics` | Group 6 (no migration) |
| 13. Hardening / tenant isolation | Consolidated cross-cutting probe (`phase7_tenant_isolation.sql`); `useUnsavedChangesWarning` adopted on the Report Builder; stale-tab mutation audited (not just patched) | Group 7 (no migration) |
| 14. Regression, adversarial QA, handover | This document, plus the report-issuing race-condition finding and fix | Group 8 (no migration) |

Nothing in the brief was skipped. One item was built narrower than a literal reading might suggest, deliberate and recorded at the time:

- **"Offline-tolerant" mobile capture means precisely**: the observation CURRENTLY being typed survives a dropped connection, reload or closed tab (localStorage, keyed per visit) — not a full background-sync queue of unsent rows. A submit made with genuinely no connection simply fails and stays in the draft. This mirrors the exact scope note the H&S on-site audit runner (110) already recorded for the identical class of feature, applied here rather than reinvented.

---

## B. The visit lifecycle and its guards

`consultancy_visits` (168, extended by 173) has **no lifecycle GUARD trigger** — unlike permits/isolations, any authorised session may move `status` between any two of the 8 listed values. This was a deliberate choice recorded at the time (173's own header comment): the UI (`VisitCaptureClient.tsx`'s start/finish controls, `ReportBuilderClient.tsx`'s issue button) is what keeps the sequence sane for now, not a database-enforced state machine. **This is the one place in Phase 7 where the database is NOT the sole source of truth for a workflow's legality** — recorded explicitly here, per the same disclosure discipline every prior phase's handover applies to its own known gaps (Phase 4's permit checklist responses, Phase 5's `environmental_monitoring` upper-bound-only shape).

Everything downstream of the lifecycle IS guarded at the database:

- `visit_observation_fill()` derives `company_id` from the visit, never trusted from the caller.
- `visit_observation_escalate()` fires synchronously on `immediate_danger`, regardless of `action_required`.
- `consultancy_visit_report_fill()`/`consultancy_visit_report_touch()` enforce same-visit `supersedes_id`, immutability of `visit_id`/organisation/`supersedes_id` after creation, and the sibling-race-safe supersede-on-publish roll.
- The three `actions_consultancy_*` policies gate WHO may reach a row; the pre-existing `actions_lifecycle()`/`actions_party_guard()` triggers (Phase 2/4, read live and confirmed unchanged) still govern what any given holder of `actions.assign` may then do to it — nobody verifies their own work, regardless of which policy let them reach the row.

---

## C. Report issuing: the one substantive Group 8 finding

Full description and fix are in CLAUDE.md's own Group 8 section (reproduced in outline here for the handover's self-containedness).

**The defect.** `POST /api/consultancy/clients/[id]/visits/[visitId]/report/issue` (Group 5) generated the PDF, uploaded it to storage and inserted a `reports` row BEFORE running the conditional `status: 'draft' → 'issued'` update that was meant to guard a double-submit. Two concurrent requests against the same draft (a double-click, two open tabs) would both pass the read, both generate and upload a PDF, both insert a DISTINCT `reports` row — each independently triggering its own `ledger_report_generated` Service Ledger entry, since the rule keys on `source_id = reports.id`, which differs per row — before the LOSING request's own status-flip finally caught the conflict at the very end and returned 409. By then the duplicate file, duplicate `reports` row and duplicate ledger entry already existed and were not rolled back by that 409.

**The fix.** Claim the draft FIRST: a conditional, count-checked `UPDATE ... SET status = 'issued' ... WHERE status = 'draft'` runs before any PDF work. Only the winner proceeds; the loser is refused with 409 having touched neither storage nor `reports`. Every subsequent step runs inside a `try`; any failure reverts the claim (`status` back to `'draft'`) in a `catch`, so a mid-work failure (e.g. a storage outage) never leaves a report stuck `'issued'` with no file — the classic claim-then-compensate pattern, applied here because `storage_path` genuinely cannot be known until the PDF has actually been built.

**Proof.** `portal/src/app/api/consultancy/clients/[id]/visits/[visitId]/report/issue/__tests__/route.test.ts` (new, 3 cases, a hand-built fake Supabase client) pins: a lost claim never reaches the PDF/upload/reports-insert path at all; a won claim's claim genuinely precedes its own upload (asserted by comparing call-log indices, not just by final state); a mid-work failure reverts the claim.

**Why this wasn't caught earlier.** Group 5's own live probe (`176_consultancy_visit_reports.sql`, 8/8) proved the SCHEMA's own guards (immutability, supersede-on-publish, cross-organisation refusal) — it never exercised the ROUTE's own call ordering, which is pure TypeScript control flow with no database-level counterpart to probe. Group 7's tenant-isolation pass likewise proved WHO may reach a row, not the ORDER in which one authorised caller's own route did its work. This is exactly the kind of gap a dedicated adversarial-QA pass (Group 8) exists to close — a defect invisible to `tsc`, to RLS, and to every prior probe, because the code was syntactically and permissions-wise entirely correct; only its sequencing was wrong.

---

## D. Migration / RLS report

| Migration | What | RLS shape |
|---|---|---|
| 173 | Widens `consultancy_visits.status` to 8 values; adds `previous_visit_id` (guarded, same-client only), `started_at`/`ended_at`, `scope`, `client_attendees`, `internal_notes`/`shared_summary`, `template_id`; new `consultancy_visit_templates`/`consultancy_visit_template_items` | Portfolio-wide (`my_home_company_id()`), gated on `consultancy.service_manage` — no new capability |
| 174 | `visit_observations`; `visit_observation_fill()`/`visit_observation_escalate()`; `hs_entity_company()`/`hs_entity_table()` gain a `'visit_observation'` branch; two new `hs_files` policies + one storage policy, scoped to `entity_type = 'visit_observation'` only | Portfolio-wide write, keyed on the VISIT's own client via `EXISTS`; client read shows `client_visible = true` rows only |
| 175 | Three new, additive `actions` policies (`actions_consultancy_select/insert/update`) | Gated on `has_capability(company_id, 'consultancy.service_manage')` — the three pre-existing single-tenant policies are untouched |
| 176 | `consultancy_visit_reports`; `consultancy_visit_report_fill()`/`_touch()`/`_supersede_roll()` | Portfolio-wide write; client read shows `issued`/`superseded` only, never `draft` |

Every migration applied and verified live by reading the catalog state back (trigger existence, function signature, policy text), never trusted from the apply call's own success response, per this codebase's own standing rule.

---

## E. Regression report

- **The full vitest suites are the regression suite.** Every pre-existing module (Referrals, A2I emails, Development Plans, E-Learning, Broadcast, Billing/Stripe, HR, Recruitment, and every Phase 1-6 H&S/workforce/governance/consultancy subsystem) has its own test files, none deleted, none skipped, all green throughout the phase: **1437 admin / 703 portal** as of this document (up from 1391/672 at the end of Phase 6).
- **Both production builds compile clean.** Portal built with stub Supabase env vars to get past the documented, pre-existing sandbox-only missing-env-vars prerender failure (unrelated to this phase, on a page it never touches).
- **All five CI guards pass**: `check-shared-dupes.sh` (47 pairs — up from 46 at the end of Phase 6; `consultancy/followUpDue.ts` is the one new pair), `check-row-cap.sh` (clean), `check-route-validation.sh` (44, unchanged — every new route in this phase was built validated from the start), `check-admin-routes-linked.sh` (42 static routes, all reachable — Phase 7 is portal-first and added no new admin pages), `check-blind-updates.sh` (102, unchanged — every new `.update()` chain across all 7 groups was built with `{ count: 'exact' }`/`COUNT_EXACT` from the start or fixed before merge when the guard caught an omission).
- **No shared table, trigger or RLS policy from a prior phase was modified in a way that could affect a pre-existing module.** `actions` gained three ADDITIVE policies (the three pre-existing single-tenant ones are byte-for-byte untouched, confirmed by reading `pg_policy` before and after); `hs_files`/the `hs-evidence` storage bucket gained two narrowly-scoped additive policies (a regression check in 174's own probe confirms a pre-existing entity type, `equipment`, is still refused cross-organisation exactly as before); every other table this phase touches (`consultancy_visits` extended, `visit_observations`/`consultancy_visit_reports`/`consultancy_visit_templates`/`consultancy_visit_template_items` new) belongs to this phase.

This constitutes the "previous phases remain functional" regression requirement.

---

## F. Adversarial QA

### F.1 Tenant isolation — Client A authorised, Client B not (genuinely different consultancy)

Run live against `sbmekaviwkiyorvmtgcu`, rolled back (`supabase/probes/phase7_tenant_isolation.sql`, all checks passed):

1. `visit_observations`: Client A's own observation is readable; an insert against Client B's visit is refused (`insufficient_privilege`).
2. `consultancy_visit_reports`: Client A's own report is readable; an insert against Client B's visit is refused.
3. `actions`: Client A's own action is readable; an insert against Client B is refused AND confirmed not to have landed anyway (a positive-absence check, not just a caught exception).

**A real probe-construction lesson, not a defect**: Client B's visit could not be seeded under the SAME consultancy the test session belongs to — `consultancy_visit_guard()` (168) refuses a `consultancy_visits` row with no live relationship at all. Testing "authorised for A, not B" honestly requires B to belong to a genuinely SEPARATE second consultancy — which is also the actual shape a real data-isolation breach would need to take, so the corrected probe is a MORE realistic test than the first draft, not merely a fixed one.

**No cross-client exposure or wrong-client write was found anywhere in this phase.**

### F.2 Report-issuing race condition

Covered in full in §C. **One real, High-severity concurrency bug found and fixed** — the only Critical/High finding of this phase's review.

### F.3 Stale-tab / wrong-client mutation after switching context

Audited, not assumed: every Phase 7 write (observation insert, action raise/verify, report save/issue, template CRUD) is portfolio-wide RLS keyed off an id taken from the URL's own `[id]`/`[visitId]` params and checked via `portfolioIncludes()`, never from "whichever organisation happens to be active" in the session. Switching organisations mid-edit in a different tab cannot silently misdirect any Phase 7 write — the same conclusion Phase 6 Group 7 reached for its own Command Centre writes, re-verified here rather than assumed still true given Phase 7 added five new write paths since then.

### F.4 Offline/dropped-connection behaviour

`VisitCaptureClient.tsx`'s localStorage draft (keyed per visit, wrapped in try/catch per this codebase's own browser-storage discipline) was exercised by inspection and code review — a reload mid-visit recovers the in-progress observation being typed; a submit made with no connection fails visibly and the draft remains recoverable. This is the scope Group 3's own header comment defines ("offline-tolerant" = the current draft survives, not a background-sync queue) — no gap was found against that defined scope, and no wider claim is made.

### F.5 Service Ledger / email idempotency, post-fix

With the report-issuing race closed (§C), `reports.created` can now only fire once per genuine issue — so `ledger_report_generated` firing exactly once per issued report, and the `email_log` claim-before-send (`dedupe_key = visit-report:<visit_id>:<version>`) never racing a sibling request, are now guaranteed by the route's own structure rather than merely true in the common case. Both were already correct in isolation (169's own unique constraint; the standing claim-before-send pattern); the fix removes the one path that could have exercised them concurrently in the first place.

### F.6 Regression across Referrals, A2I, E-Learning, Broadcast, Billing, HR, Recruitment and Phases 2-6

Covered in §E.

---

## G. Defect classification (Phase 7, this pass)

| Defect / gap | Found by | Severity | Fixed by | Verified |
|---|---|---|---|---|
| Report-issuing route performed PDF generation, upload and `reports` insert BEFORE its own double-submit guard, allowing a genuine race to produce duplicate files/rows/ledger entries before the guard finally (and too late) refused the loser | Group 8 adversarial review of the route's own call ordering | High (a genuine, reachable duplicate-side-effect race, not hypothetical) | Claim-first, compensate-on-failure restructure of the issue route | New `route.test.ts` (3 cases): lost claim never reaches PDF/upload/insert; won claim's claim precedes its own upload; mid-work failure reverts the claim |
| `consultancy_visits.status` has no database-level lifecycle guard trigger, unlike permits/isolations — any authorised session may move between any two listed values | 173's own header comment, re-confirmed and explicitly disclosed here rather than silently left implicit | Low (a recorded, deliberate scope decision, not a bug) | Not fixed — the UI is what keeps the sequence sane for now, per the original design decision | Disclosed in §B for a future phase's own judgement |

No other Critical, High or Medium finding was found anywhere in this phase's adversarial review. The report-issuing race is the one genuine defect this phase's QA pass surfaced — everything else audited (tenant isolation, stale-tab writes, offline behaviour, Service Ledger idempotency) came back clean against the architecture Phase 6 already established and Phase 7 Group 7 had already re-audited once.

---

## H. Technical debt

- **`consultancy_visits.status` has no lifecycle guard trigger.** Recorded in §B/§G. A future phase wanting to prevent, say, a visit skipping straight from `planned` to `report_issued` would need a guard trigger mirroring `permits_lifecycle_guard()`/`isolations_lifecycle_guard()` — not built here since 173's own scope explicitly left this to the UI for now.
- **Report PDFs note evidence photos by COUNT only, never embed them.** A reader opens the portal to see the photo itself (176's own scope note, mirroring 174's mobile-capture scope note). Embedding thumbnails in the generated PDF was not attempted.
- **The Report Builder has no component-level (DOM-rendering) test.** Consistent with this codebase's established testing convention (no React-component-rendering tests exist anywhere in either app) — verified via `tsc`, the production build, and the new route-level test for the one piece of real logic (the issue route's ordering), not via a rendered-component test.
- **Consultant Metrics and follow-up tracking have no UI test beyond the pure-function unit tests** (`followUpDue.test.ts`, `consultantMetrics.test.ts`) — the page itself is covered only by `portalPagesLinked.test.ts`/`clientServerBoundary.test.ts` picking it up automatically, the same convention every other portal page in this codebase follows.
- **Phase 8 ("Risk Graph & Connected Compliance Intelligence") has not yet been scoped against anything Phase 7 built** — no known dependency either direction has been identified, but this has not been explicitly audited, unlike Phase 6→7's own explicit "Phase 7 readiness" section.

---

## I. Gate

**PASS WITH MINOR ISSUES.**

- One real, High-severity concurrency defect (§C, §F.2, §G) was found by this phase's own adversarial QA pass, in code that had already passed `tsc`, its own live migration probe, and a prior tenant-isolation review — none of which could see a pure call-ordering defect in application-layer TypeScript. It was fixed within this same group (claim-first restructure) and proven with a dedicated new test file, rather than carried forward as a known issue — the same discipline Phase 6's own gate applied to its one Medium finding.
- Tenant isolation proven live for a two-consultancy, Client-A-authorised/Client-B-not scenario across every table Phase 7 added or extended (`visit_observations`, `consultancy_visit_reports`, the new `actions` consultancy policies) — zero leakage found, with one probe-construction correction (Client B needed a genuinely separate second consultancy to test the realistic scenario) recorded rather than glossed over.
- Stale-tab/wrong-client mutation re-audited (not assumed still true from Phase 6) against all five new Phase 7 write paths — found immune by construction, matching Phase 6's own finding for its own writes.
- The one recorded, deliberate design gap (`consultancy_visits.status` has no database-level lifecycle guard) is disclosed rather than silently left implicit — a Low-severity, intentional scope decision from Group 1, not a defect discovered late.
- Full regression (tsc clean both apps, 2140 total tests across both apps, all five CI guards, both production builds) is green (§E).

**Phase 8 may begin.**
