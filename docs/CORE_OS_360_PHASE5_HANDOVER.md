# Core-OS 360 Phase 5: EHS Management System — Engineering Handover and QA Report

**Date:** 2026-09-29. **Branch:** `claude/optimistic-albattani-uezht8` (not merged, so the app code is not deployed).
**Database:** migrations 156–166 are applied live to `sbmekaviwkiyorvmtgcu`, each verified by reading the live catalog state back after applying, never trusted from the apply call's own success response.
**Governance map:** `docs/CORE_OS_360_PHASE5_GOVERNANCE_MAP.md` (read before touching any Phase 5 code — classifies every existing component as REUSE/EXTEND/MIGRATE/DEPRECATE/REPLACE; no REPLACE anywhere).
**CLAUDE.md** carries a detailed per-group design/rationale writeup for every group (search "Core-OS 360 Phase 5"); this document is the QA/handover summary, not a duplicate of that detail.

Scope delivered: Environmental Aspects & Impacts; environmental incidents/spills/waste/monitoring/permits; a shared ISO 45001/14001 clause framework with a purely factual, counts-only readiness dashboard; the Legal Register (with an inert Tavily-research foundation, no live call); Controlled Document Management (a full author/reviewer/approver workflow extending `hs_documents` in place); Objectives & Targets and Management Review (with a stored, non-recomputed data-pack snapshot); Internal Audit Enhancement (findings, root cause, severity-gated closure), a read-time Governance Calendar, Worker Consultation, Environmental Complaints; an evidence-link foundation spanning the Legal Register/Objectives/Audit Findings, a governance KPI framework, Broadcast integration, and reporting/search coverage for all of the above. Delivered in **10 independently-verified groups** (migration → live probe → tests → all five CI guards → doc update → commit, THEN the next group), plus this final regression/adversarial-QA/handover pass (Group 10).

**Two absolute rules held throughout, with no exception found on adversarial review:** (1) no black-box AI significance/compliance/applicability/audit-finding scoring anywhere — every judgement that matters (significance, compliance status, RIDDOR reportability's H&S equivalent, applicability) is either a deterministic formula or a human decision the database refuses to accept unconfirmed; (2) cautious, factual vocabulary only — no label, notification or piece of UI copy anywhere in this phase asserts "compliant," "legal," "illegal" or "certified." A vocab-scanning test enforces the second rule; the database's own confirmation-gate triggers enforce the first.

**Phase 6 is NOT to begin** until this branch is merged and deployed, per the operator's standing instruction.

---

## A. Requirements traceability

Every deliverable named in the Phase 5 brief, mapped to what actually built it. Nothing in the brief was skipped; two items were deliberately scoped down (noted below) rather than built to a false completeness.

| Brief item | Delivered as | Group / migration |
|---|---|---|
| Environmental Management (Aspects & Impacts) | `environmental_aspects` + `environmental_aspect_assessments`, deterministic 1-5×1-5×1-5 significance score, mandatory human confirmation gate | Group 1 / 156 |
| Environmental Incidents | `hs_incidents.incident_type = 'environmental'` (already existed) + `environmental_incident_details` | Group 2 / 157 |
| Spills | `environmental_spills` | Group 2 / 157 |
| Waste | `waste_streams` + `waste_movements`, carriers reuse `contractors` (150) | Group 2 / 157 |
| Monitoring | `environmental_monitoring`, database-generated `within_limit` (upper-bound only, documented gap for a lower-bound case) | Group 2 / 157 |
| Environmental Permits | `environmental_permits` + `permit_conditions` (own table, deliberately not H&S's `permits`) | Group 2 / 157 |
| Emissions / Water / Energy | Covered by `environmental_monitoring`'s generic `parameter`/`value`/`unit`/`recorded_limit` shape — a monitoring reading is a monitoring reading regardless of which of these it measures; no separate table per parameter type, consistent with "never fork a parallel system" | Group 2 / 157 |
| ISO 45001/14001 framework | `management_system_standards` + `standard_clauses` (one shared taxonomy, two seeded standards, no copyrighted text), `standard_evidence_links`, `iso_certifications` | Group 3 / 158 |
| Legal Register / Compliance Obligations | `legal_requirements` (staff catalogue) + `organisation_legal_obligations` (per-client applicability) + `compliance_evaluations` (insert-only history) | Group 4 / 159 |
| Legal research automation | **Deliberately scoped to storage only.** `legal_requirement_research_notes` exists; no live Tavily call anywhere — a documented, explicit decision, not an oversight | Group 4 / 159 |
| Controlled Documents | Extended `hs_documents` (106) in place with a formal draft→review→approval→active→review_due→superseded→withdrawn→archived lifecycle, effective-date separation, retention metadata, version-pinned acknowledgements | Group 5 / 160 |
| Objectives & Targets | `objectives` + `objective_measurements` (insert-only, deterministic status roll) | Group 6 / 161 |
| Management Review | `management_reviews` + `management_review_attendees` + `management_review_decisions` (insert-only, immutable once the review completes) + `management_review_data_pack` (stored snapshot, never recomputed) | Group 6 / 161 |
| Audit Evidence / audit-engine enhancement | Extended `hs_audits`(110)/`hs_audit_responses` in place: `audit_programmes` (schedule) + `audit_findings` (severity, root cause, severity-gated closure) | Group 7 / 162 |
| Governance Calendar | Read-time aggregate (`lib/governance/calendar.ts`) over 8 already-dated source tables — no new scheduling table | Group 7 / 162 |
| Worker Consultation | `consultation_records` | Group 7 / 162 |
| Environmental Complaints | `environmental_complaints` | Group 7 / 162 |
| Evidence-Engine foundation (link any record to any of Legal/Objectives/Audit Findings) | `requirement_evidence_links` — explicit human links only, no auto-suggestion, no scoring | Group 8 / 163 |
| Governance KPIs | `lib/governance/kpis.ts`, pure/deterministic, reports its own data provenance | Group 8 / 163 |
| Broadcast integration | Legal Register → `/broadcast?legal=<id>` prefill, reusing the existing confirm-modal flow unchanged | Group 8 / 163 |
| Reporting coverage | A GOVERNANCE section on the Value Report (on-screen + PDF + monthly cron, byte-identical) | Group 8 / 163 |
| Search coverage | `search_records()` (SECURITY INVOKER, unchanged contract) gained 8 new entity branches | Group 8 / 163 |
| UI consistency across Groups 1-8 | Sidebar links for 3 previously-unlinked cross-client pages, empty-state/button-wrapper drift fixed across 8 client components, colour-coded status badges added to 2 admin + 2 portal pages that had none, a waste-streams section added to the portal (was silently fetched but never rendered) | **Group 9** (this pass) |
| Final regression + adversarial QA + handover | This document | **Group 10** (this pass) |

---

## B. What Group 9 (UI consistency) found and fixed

A background audit agent reviewed every admin/portal page shipped in Groups 1-8 for consistency against the established `hs/` component conventions. Findings, all fixed:

1. **Three cross-client pages had no sidebar entry** (`/health-safety/legal-register`, `/health-safety/iso-readiness`, `/health-safety/governance-calendar`) — reachable only by direct URL. `check-admin-routes-linked.sh` did not catch this because it matches by TOP-LEVEL path segment (`/health-safety` was already linked via the per-client workspace), which is a real, documented gap in that guard, not a false pass. Fixed: three links added to `AdminSidebar.tsx`'s PROTECT group.
2. **Inconsistent button-wrapper and empty-state markup** across `EnvironmentalAspectsClient.tsx`, `EnvironmentalSpillsClient.tsx`, `EnvironmentalMonitoringClient.tsx`, `EnvironmentalPermitsClient.tsx`, `LegalRegisterClient.tsx`, `LegalRequirementsCatalogueClient.tsx`, `ObjectivesClient.tsx`, `ManagementReviewClient.tsx` — several Group-7/8 components had drifted from the `flex ml-auto` button-row and `card empty-state p-10` empty-state pattern every earlier `hs/` component uses. Fixed to match.
3. **`environmental_spills.status` and `permit_conditions.status` rendered with no colour treatment** anywhere — admin table/select and the portal's read-only equivalents — despite both vocabularies including urgent values (`breach_recorded`, `overdue`) that should be visually distinct from a routine value, the same `STATUS_COLOUR`-next-to-a-select pattern `IncidentsClient.tsx` already established. Fixed in all four locations (admin ×2, portal ×2), with the portal versions given the identical colour maps as their admin counterparts rather than independently invented ones.
4. **The portal's `/protect/environmental-waste` page fetched `waste_streams` but never rendered it** — only the movements table was shown, silently dropping the "what kind of waste" reference data a client would need to make sense of the movements list below it. Fixed: added a read-only waste-streams section mirroring admin's `EnvironmentalWasteClient.tsx` two-section layout.

Two smaller findings from the same audit were accepted as documented debt rather than fixed, consistent with the audit's own "cosmetic only" / "functionally identical today" framing: minor spacing inconsistencies between the newest Group 7/8 forms and the oldest Group 1/2 ones (both render correctly, neither is wrong), and `check-admin-routes-linked.sh`'s top-level-segment-only matching (a real gap, noted for a future CI-guard improvement, not a defect in the pages it currently passes).

---

## C. Group 10 — regression of pre-existing protected modules

Rather than re-deriving a fresh assertion per module, this pass relied on the same evidence Phase 4's own handover used, extended with a targeted live-DB sweep:

- **The full vitest suites are the regression suite.** Every pre-existing module (Referrals, A2I emails, Development Plans, E-Learning, Broadcast, Billing/Stripe, HR, Recruitment, and every Phase 1-4 H&S/workforce/operational-safety subsystem) has its own test files, none deleted, none skipped, all green: **1326 admin / 626 portal**, unchanged apart from the 6 new tests this pass's own fixes added (§D).
- **Both production builds compile clean**, confirming every route across every pre-existing module still builds with the new Phase 5 code present.
- **All five CI guards pass** with the same counts as Group 8 left them (43 shared-dupe pairs, row-cap clean, 44 unvalidated routes, 75 admin pages all reachable, 102 blind-update chains) — nothing regressed.
- **A live-DB sweep** (run against `sbmekaviwkiyorvmtgcu`, not just the test suite) confirmed: RLS still enabled on 21 sampled pre-existing AND new critical tables (`profiles`, `companies`, `employee_records`, `hs_incidents`, `hs_documents`, `referral_applications`, `training_records`, `candidates`, `requisitions`, `actions`, and every new Phase 5 table); `profiles`' three security-hardening guard triggers (088/093) still attached, untouched by anything in this phase; `referral_applications`' idempotency unique constraint intact; `actions.source_type`'s CHECK carries every value Phase 4 and Phase 5 added. No collateral damage from migrations 163-166 was found.

This constitutes the "full regression of pre-existing protected modules" requirement: nothing in this phase's own scope (Environmental/ISO/Legal/Documents/Objectives/Management Review/Audit/Governance) shares a table, trigger or RLS policy with any pre-existing module except through the generic, already-tested `platform_events`/`actions`/`hs_files`/`hs_entity_table()` infrastructure, and every one of those shared surfaces is covered by the sweep above plus its own existing test coverage.

---

## D. Group 10 — adversarial QA

### D.1 Concurrency testing — two real defects found and fixed

The brief specifically asked for concurrency testing ("two users approving different document versions — only one becomes active"). This was run for real, live, against `sbmekaviwkiyorvmtgcu`, in rolled-back transactions, for every table in this codebase using the "a new version is a new row, the old one flips to superseded" versioning discipline.

**`hs_documents` (160) — CONFIRMED BUG, fixed by migration 164.** Reproduced live: two INSERTs both naming the same `supersedes_id` (the realistic "two editors start a new version off the same currently-active parent" race), both reaching `'active'`, resulted in **both being active simultaneously** — migration 160's own rule 7 ("this keeps exactly one document current at any time") was false. `hs_document_supersede_roll()` only ever superseded the NAMED parent, never the sibling that lost the race. Fixed: the trigger now also supersedes any other row sharing the same `supersedes_id` that is still active. Reproduced failing 2/2 before the fix, passing 4/4 after (`supabase/probes/164_document_sibling_race.sql`), plus a normal linear chain proven unaffected.

**`emergency_plans` (154) — CONFIRMED BUG, worse than the hs_documents case, fixed by migration 165.** `emergency_plans` had **no automated supersede trigger at all** — the documented "insert first, then update the old row to superseded" discipline was entirely a client-side, two-sequential-write responsibility with nothing in the database enforcing it. Reproduced live: a single INSERT of a new version with no follow-up UPDATE (exactly what a dropped connection, a crash, or simply a different future write path would produce) leaves **two active plans in the same lineage permanently**, since nothing ever reconciles it afterwards. This is a genuine, currently-reachable gap — `EmergencyPlansClient.tsx` (Group 13, Phase 4) really does perform this as two separate writes. Fixed with an AFTER INSERT trigger mirroring 164's shape, adapted to this table's simpler active/superseded-only lifecycle. Proved: the bug scenario (1 active, not 2), a normal linear chain (unaffected), and a genuine sibling race (only one stays active) — 3/3.

**`environmental_aspects` (156) — same defect class, fixed defensively by migration 166.** Same missing-trigger gap as emergency_plans. **Not currently reachable through the product** — `EnvironmentalAspectsClient.tsx` has no "new version" UI action yet, so no live write path sets `supersedes_id` today. Fixed anyway, ahead of any future group wiring up aspect versioning, consistent with this codebase's own standing rule that workflow invariants live in triggers, never only in the UI that happens to exist today. Proved 3/3 the same way as 165.

**Every table in this codebase using `supersedes_id` is now covered**: a repo-wide search confirms exactly these three tables use the pattern, and all three now have an automated, adversarially-proven roll trigger. No fourth instance was found.

### D.2 Cross-tenant UUID-substitution attacks

Run live against `sbmekaviwkiyorvmtgcu`, under a simulated `authenticated` session (`SET LOCAL ROLE authenticated` + a forged JWT claim for a real Andrews Recruitment Group user), across five record types the brief specifically named: legal requirements/obligations, controlled documents, audit findings, management reviews, environmental permits. Both READ (can a session fetch another company's row by guessing/pasting its UUID?) and WRITE (can a session update another company's row the same way?) were attempted for each. **Zero vulnerabilities found** — every RLS policy correctly refused both directions in every case (`supabase/probes/phase5_qa_cross_tenant.sql`, 13/13 checks passed).

### D.3 Storage security

The `hs-evidence` bucket's `hs_evidence_client_read` policy was checked specifically for whether it independently re-implements its own company-scoping logic (a common source of drift) or correctly inherits `hs_files`' own RLS via its `EXISTS (SELECT ... FROM hs_files WHERE storage_path = objects.name)` subquery. Confirmed live: it inherits — the subquery runs as the same session role, so `hs_files`' own row-level security is what actually decides visibility, not a second, independently-maintained boundary. No cross-client storage access was possible for `environmental_aspect` evidence or any other entity type.

### D.4 RLS sweep

All 27 Phase 5 tables (156-163) plus the two migration-165/166-fixed tables confirmed, in one consolidated query: RLS enabled, no `anon` grant on any table or DEFINER function, no permissive `USING (true)` policy anywhere.

### D.5 Governance calendar correctness

`lib/governance/calendar.ts`'s `governanceCalendarEvents()` is a pure, deterministic read-time union over 8 already-dated source tables (never a stored/materialised calendar). Its own test file (`calendar.test.ts`, 5 cases, part of the 1326 green admin tests) already pins: every source table contributes its dated rows correctly, each event carries a correct admin AND portal link, and nothing is double-counted. No further live verification was needed beyond confirming the test file itself still passes post-fix, which it does.

### D.6 Network-failure-during-write

The brief asked for "must show no false success, no partial commits." This phase's writes fall into two shapes:

- **Single-statement INSERT/UPDATE calls** (the large majority — every ordinary form submission in `EnvironmentalAspectsClient.tsx`, `LegalRegisterClient.tsx`, `ObjectivesClient.tsx`, etc.): Postgres statement-level atomicity already guarantees these cannot partially commit. A dropped connection mid-request either lands the whole row or none of it; there is no intermediate state to reach. `COUNT_EXACT`/`judgeWrite()` (used on every UPDATE) additionally distinguishes "the write landed" from "the write silently no-op'd under RLS" — a false-success class distinct from a partial commit, and the one this pattern exists to catch.
- **Multi-statement client-side sequences** (the versioning "insert new, then update old" pattern): this is exactly what D.1 tested and found genuinely broken for `emergency_plans`, and now fixed for all three tables using the pattern by moving the second half of the sequence into an atomic, same-transaction database trigger. This is the correct fix for "no partial commits" here — not retrying the second write from the client (which cannot know whether the first one's network response was lost after a successful commit), but making the SECOND write's effect an automatic, guaranteed consequence of the first, inside one transaction. `hs_submit_audit()`/`hs_submit_inspection()` (Phase 4) already used this same discipline (one atomic RPC, idempotent on retry) for their own two-part writes; this phase's fix generalises the same principle to the simpler INSERT-triggers-UPDATE shape these three tables needed.

No other multi-statement write sequence without an atomic guard was found in this phase's own tables.

### D.7 Already-proven invariants (citations, not re-derivation)

These were proven during their own group's live probe and are not re-derived here, only cited as still holding (confirmed by this pass's full regression, §C, touching none of the underlying triggers):

- **Environmental aspect versioning / history preservation**: `supabase/probes/156_environmental_aspects.sql` checks 8-9 (a new version is a new row, the old row supersedes, both remain individually readable, a cross-org `supersedes_id` refused).
- **ISO evidence-mapping never mutates the underlying record**: `supabase/probes/158_iso_framework.sql` — `standard_evidence_links` is a bare polymorphic reference; nothing it does writes to the referenced table.
- **Legal-applicability auto-confirm prevention**: `supabase/probes/159_legal_register.sql` checks 3-5 — `applicable`/`not_applicable` refused without `assessed_by`+`assessed_at` set together, `under_review` needs neither.
- **Controlled-document immutability / effective-date / version-pinned acknowledgement**: `supabase/probes/160_document_control.sql`, 16/16 — content immutable once approved/active, self-approval refused (fixed live same-day, then re-proved), `effective_from` gate proven both directions, an acknowledgement stays pinned to its specific `hs_documents.id` through two further versions.
- **Objectives / management review / audit-programme / findings**: `supabase/probes/161_objectives_management_review.sql` (21/21) and `supabase/probes/162_audit_enhancement_calendar_consultation.sql` (18/18) — insert-only history tables never overridden backwards, decisions immutable once a review completes, closure gate severity-scoped and proven in both directions.

---

## E. Regression

After every fix in §B and §D, the full regression was re-run from the current working state:

- `tsc --noEmit` clean, both apps.
- `vitest run`: **1326 admin / 626 portal**, all green (1320 → 1326 admin from this pass's own 2 new SQL-shape test files, 6 tests; portal unchanged — this pass's portal edits were plain read-only page markup, already covered by `moduleAccess.test.ts`/`portalPagesLinked.test.ts` picking up no NEW routes, since none were added).
- All five CI guards pass: `check-shared-dupes.sh` (43 pairs), `check-row-cap.sh` (clean), `check-route-validation.sh` (44, unchanged), `check-admin-routes-linked.sh` (75 pages, all reachable — up from Group 8's count now that Group 9's sidebar fix is in), `check-blind-updates.sh` (102, unchanged).
- Both production builds (`next build` with stub Supabase env vars) compile clean.
- Migrations 164, 165, 166 applied and verified live (each: trigger exists, function is `SECURITY DEFINER`, neither `anon` nor `authenticated` can execute it directly, and the specific bug scenario re-proved fixed against the LIVE function, not just the dry-run copy).

---

## F. Defect classification (Phase 5, this pass)

| Defect | Found by | Severity | Fixed by | Verified |
|---|---|---|---|---|
| `hs_documents` sibling race — two versions both active simultaneously | Live concurrency probing, Group 10 | **High** (violates the table's own documented invariant; silently produces two "current" versions of a controlled document with no error to anyone) | 164 | Probe 2/2 fail → 4/4 pass |
| `emergency_plans` — no automated supersede at all, reachable via a single dropped connection | Live concurrency probing, Group 10 | **High** (currently reachable through the shipped Group-13 UI; a single ordinary partial failure, not a rare race, is enough to trigger it) | 165 | Probe 3/3 |
| `environmental_aspects` — same missing-trigger gap, not yet reachable | Live concurrency probing, Group 10 | Medium (real schema-level gap, but no current UI path exercises it) | 166 | Probe 3/3 |
| Three cross-client admin pages unreachable from the sidebar | Group 9 UI audit | Low (functional, just undiscoverable without a direct URL) | Group 9 sidebar links | `check-admin-routes-linked.sh` count increased, all reachable |
| Status colour drift on 2 admin + 2 portal status displays | Group 9 UI audit | Low (cosmetic; urgent values not visually distinct) | Group 9 colour maps | Manual review of the 4 edited files |
| Portal waste page silently dropped the waste-streams section | Group 9 UI audit | Low (a client could not see what a waste movement referred to) | Group 9 page edit | Manual review |

No Critical finding was found anywhere in this phase. No cross-tenant, storage-security or RLS finding was found (§D.2-D.4 all clean). The two High findings (§D.1) are both fixed and re-proved live, not merely patched and assumed.

---

## G. Gate

**PASS WITH MINOR ISSUES.**

- Two **High** defects were found and fixed in this final pass (the `hs_documents` and `emergency_plans` concurrency bugs) — both are real, both are now fixed with an automated database trigger (not a UI-side mitigation, which cannot survive a dropped connection), and both are re-proved live against the actual applied function, not a dry-run copy. Neither reached Group 8's own commit still open; both were found specifically because this pass's concurrency-testing requirement asked for exactly the scenario that exposed them.
- One **Medium**, defensive-only fix (`environmental_aspects`) closes the same defect class ahead of any future group reaching it, consistent with the "database holds the invariant, not the UI" standing rule.
- Cross-tenant UUID-substitution attacks (5 record types, both read and write), storage security, and a full RLS sweep across every Phase 5 table all came back clean — no unauthorised cross-organisation access exists anywhere in this phase.
- Full regression (tsc clean, 1952 total tests across both apps, all five CI guards, both production builds) is green after every fix in this document.
- **Minor issues, reviewed after the gate — one fixed, three left as documented, deliberate scope decisions rather than bugs:**
  - **Fixed**: `check-admin-routes-linked.sh` matched by top-level path segment only, which is why three Group 1-8 pages went unlinked without the guard catching it (Group 9, §B.1). Rewritten to check every STATIC (non-dynamic-segment) route's FULL path against a literal reference anywhere in the admin app — sidebar, tab, button or redirect — the same "quoted literal, own directory excluded" approach `portalPagesLinked.test.ts` already uses for the portal. One genuinely unlinked-by-design page was found by the rewrite itself: `/clients/new`, a retired redirect stub kept only for old bookmarks, added to the guard's `ALLOWED` list with that reason. Mutation-tested: a route with its only reference removed correctly fails; the real, unmodified codebase passes clean (42 static routes checked, 0 unlinked).
  - `environmental_monitoring.within_limit` only handles an upper-bound limit (documented in migration 157's own comment) — a lower-bound limit (e.g. minimum flow rate) would need a schema change. Left as documented scope, not built here: inventing a lower-bound convention with no product requirement naming one would be exactly the kind of guessed default this codebase's own standing rule rejects.
  - Legal-requirement research automation (Tavily) is inert storage only, by design (§A) — a future group would need to wire the live call, which is explicitly out of this phase's scope. Left as-is.
  - Permit checklist responses (Phase 4's own carried-over minor issue) remain schema-complete but UI-incomplete — unrelated to this phase, noted for completeness only. Left as-is.

**Phase 6 is NOT to begin** until this branch is merged and deployed, per the operator's standing instruction.
