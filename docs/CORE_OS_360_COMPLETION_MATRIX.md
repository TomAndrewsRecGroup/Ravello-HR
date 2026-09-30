# Core-OS 360 Completion Matrix

Phase 20 deliverable (Core-OS 360 Completion Programme, Phases 20-29).
Purpose: one authoritative truth set for what Core-OS 360 Phases 1-19 (migrations
117-182) actually delivered, so "complete" cannot mean "a narrower interpretation
was built" as Phases 21-29 close the remaining gaps.

**Status vocabulary** (per the Master Spec):
- `IMPLEMENTED` — built, evidenced by concrete files/routes/migrations/tests, and
  usable by its intended user through the product (not merely present in schema).
- `PARTIAL` — built for one surface/role but not the other, or built with a
  narrower interpretation than the original requirement.
- `MISSING` — no implementation exists.
- `BROKEN` — implemented but demonstrably defective (a bug, not a scope choice).
- `DEFERRED-BUT-REQUIRED` — explicitly deferred in its own phase's handover, and
  the original requirement still calls for it. Carries a target phase (21-29).
- `ACCEPTED-NONREQUIREMENT` — deliberately out of scope by a recorded product
  decision (e.g. predictive H&S scoring, which is expressly forbidden), not a gap.

**Evidence discipline**: every `IMPLEMENTED` row cites the concrete file/route/
migration/test that was verified (live probe, test suite, or production build) at
the time its phase shipped, per that phase's own CLAUDE.md handover entry — which
is itself the contemporaneous evidentiary record (real file paths, migration
numbers, live-probe counts, test counts), not narrative summary. Every gap row
below is drawn from the Master Spec's own "Known repository evidence / starting
gaps" lists (Phases 21-29), which independently reproduce findings already on
record in CLAUDE.md — cross-confirming rather than contradicting the source.
Where this phase's own baseline agents re-ran tsc/vitest/CI guards/builds, results
are recorded in `docs/CORE_OS_360_PHASE20_HANDOVER.md`, not duplicated here.

This matrix does not re-decompose every single sub-requirement of all 19 phases
into its own row — CLAUDE.md already carries that level of detail per phase, and
this file exists to prevent scope loss, not to restate CLAUDE.md. Each phase
section below lists its major requirement clusters (matching the Master Spec's own
phase groupings for 21-29) with status and evidence, then a **Gaps** subsection
enumerating every row that is not a clean `IMPLEMENTED`.

---

## Phase C1 — Tenancy, Consultancy Access, People, Audit (migrations 117-121)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C1.1 | `organisations`/`sites` views over `companies`/`hs_sites`; FKs unchanged | IMPLEMENTED | `security_invoker` views, migration 117-119 |
| C1.2 | One active organisation per consultant; `set_active_organisation()` | IMPLEMENTED | `user_organisation_access`, `user_active_organisation`, 117 |
| C1.3 | Capability model, not role strings | IMPLEMENTED | `has_capability()` SQL + `lib/auth/capabilities.ts` shared-dupe pair; pinned both ways by `tenancySql.test.ts` |
| C1.4 | Read-only consultant grants enforced at DB level | IMPLEMENTED | RESTRICTIVE `write_guard_ins/upd/del` policies + `apply_write_guard()`, 117 |
| C1.5 | Append-only audit trail, no salary/NI/notes in whitelist | IMPLEMENTED | `audit_row()`, `audit_events`, per-table triggers |
| C1.6 | People model derivative RLS (visible via linked employee/candidate/athlete row) | IMPLEMENTED | `person_link_row`, 118 |
| C1.7 | Internal search (`search_records()`), SECURITY INVOKER | IMPLEMENTED | 119, extended by every later phase that adds a searchable entity |
| C1.8 | `access_scope` (health_safety/hr/recruitment/full) enforcement | DEFERRED-BUT-REQUIRED | Phase 1 handover §H: "not enforced" — closed by Phase 6 Group 1 (167, `access_scope_allows()`) — **already resolved**, see C6.3 |
| C1.9 | Portal UI for consultancy owners to grant access | IMPLEMENTED | Closed Phase 24 Group 2: `/consultancy/access`, the first caller of `grant_organisation_access()`/`revoke_organisation_access()` (117) — no new migration, the RPCs' own existing guards are the whole security boundary |
| C1.10 | People synced back from source rows (candidate/athlete/employee edits reflected on `people`) | IMPLEMENTED | Closed Phase 21 Group 3, migration 184: `person_sync_from_source()`, an AFTER UPDATE trigger on all three identity tables. Live-probed 8/8 |
| C1.11 | Broadcast idempotency key | IMPLEMENTED | Closed Phase 25 Group 1, migration 191: `broadcast_sends` (client-generated key as PRIMARY KEY), claimed before any action/email work, reverted on failure so a genuine retry can still proceed. A double-click/timed-out-retry/direct replay creates nothing twice — reported as `{ created: 0, duplicate: true }` |
| C1.12 | Optimistic locking on shared records | PARTIAL | Closed for `consultancy_visit_reports` Phase 24 Group 1, migration 190: `row_version`, forced by trigger regardless of caller input, client conditionally updates on it, a lost race surfaces as a clear message. The other two candidate tables were checked live and found to need no `row_version`: `consultancy_service_scopes` has no UPDATE writer anywhere (insert-only), and `consultancy_visits`' status transitions already refuse a race via its own state-machine guard (`consultancy_visits_lifecycle_guard()`, 185) — a double-click's second call finds `OLD.status` no longer matching an allowed source state. General optimistic-locking hardening across the rest of the app → still assigned **Phase 28** |
| C1.13 | UI still uses legacy role checks in places | DEFERRED-BUT-REQUIRED | Phase 1 handover §H → assigned **Phase 28** (UX/navigation closure) |

**Gaps carried forward**: C1.9 closed Phase 24, C1.10 closed Phase 21, C1.11 closed Phase 25, C1.12 partially closed Phase 24 (rest→28), C1.13→28.

---

## Phase C2 — Operational H&S Core (migrations 122-129)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C2.1 | Hazards, risk assessments (matrix/controls/approval/versioning/templates) | IMPLEMENTED | 122-124, `hs_doc_guard()` |
| C2.2 | RAMS, COSHH + SDS versions | IMPLEMENTED | 124 |
| C2.3 | Incidents/near misses, sensitive-detail separation | IMPLEMENTED | `incident_person_sensitive`, capability-gated |
| C2.4 | Investigations, root cause / 5 Whys | IMPLEMENTED | `incident_causes`, 125 |
| C2.5 | RIDDOR decision support (never auto-decide) | IMPLEMENTED | flags only; `riddor.review` capability required |
| C2.6 | Corrective actions on universal `actions` table | IMPLEMENTED | `source_type`/`source_id`, verification + effectiveness (125-126) |
| C2.7 | Live notifications proven after deployment | DEFERRED-BUT-REQUIRED | Phase 22 widened/mutation-tested the contractor/permit/isolation rules (hsRules.test.ts, 40/40 pass) but a real post-deploy notification still cannot be observed from this environment — still open, no further phase assignment (operational, post-deploy only) |
| C2.8 | Mobile/tablet field verification | DEFERRED-BUT-REQUIRED | Phase 22 handover: no device/browser testing capability in this environment — still open, folded into C4.14 |

**Gaps carried forward**: C2.7 (operational, post-deploy), C2.8→C4.14 (no further phase — needs real device/browser access).

---

## Phase C3 — Workforce & Safe to Deploy (migrations 131-143)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C3.1 | Safe to Deploy engine, DB-decided only, never a stale READY | IMPLEMENTED | `_wf_deployment_safe`, cache-invalidation triggers, 136 |
| C3.2 | Versioned requirement rules (role/site/person), no retroactive edits | IMPLEMENTED | `requirement_rule_guard`, 133-134 |
| C3.3 | Training/competency/credential/induction/authorisation/PPE/pre-employment catalogues | IMPLEMENTED | 133-139 |
| C3.4 | Occupational health split (summary vs. clinical, explicit-only capability) | IMPLEMENTED | `EXPLICIT_ONLY_CAPABILITIES`, 140 |
| C3.5 | Hire/leave lifecycle triggers | IMPLEMENTED | `workforce_employee_sync()`, 137 |
| C3.6 | Evidence never crosses an organisation (142 CRITICAL fixes) | IMPLEMENTED | folder-path checks in every `_wf_judge` branch, storage policies |
| C3.7 | Employee document ↔ person linkage through the UI | IMPLEMENTED | Closed Phase 21 Group 1: both admin's HR-tab upload form and the portal's Employee Documents page gained an employee-record picker setting `employee_id`, which `employee_document_person_guard()` (142) derives `person_id` from; a staff upload (service role) also auto-marks `filed_by_authorised` |
| C3.8 | E-Learning course → `learning_content_id` mapping in course admin form | IMPLEMENTED | Closed Phase 21 Group 1: the workforce Courses catalogue gained an optional "E-Learning content" picker — the FK column existed since migration 133 and was completely orphaned |
| C3.9 | `hs_tests` pass → training-requirement mapping via explicit `course_id` | IMPLEMENTED | Closed Phase 21 Group 1, migration 183: `hs_tests.course_id` (must be a standard/global course, enforced by `hs_tests_course_guard()`), carried onto the auto-logged `training_records` row so a passed test can satisfy a role/site requirement. Live-probed 7/7 |
| C3.10 | Controlled bulk CSV import for people/training/competency (user-facing, beyond training-records import already shipped in LEAD Phase 4) | IMPLEMENTED | **Correction, Phase 21 Group 4**: this row was wrong. `portal/src/lib/workforce/importCsv.ts` already covered training/competency/credential (all three, not "training only" as originally claimed) since before Phase 20; `portal/src/app/(portal)/lead/org-chart/OrgChartClient.tsx` already has a working bulk people-creation CSV import (add-new + update-existing-by-name), missed by Phase 20's directory-scoped search. Phase 21 made one small, safe quality fix — a row with no name is now reported by line number instead of silently dropped — rather than rebuilding a live, working feature |

**Gaps carried forward**: none — C3.7, C3.8, C3.9, C3.10 closed in Phase 21 (see above).

---

## Phase C4 — Assets, Inspections, PUWER, LOLER, Contractors, Permits, LOTO, Emergency Planning (migrations 144-155)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C4.1 | Asset register extending `hs_equipment` (not forked) | IMPLEMENTED | 144, `asset_ref` numbering |
| C4.2 | Inspection engine, atomic idempotent submit | IMPLEMENTED | `hs_submit_inspection()`, 145 |
| C4.3 | Defects + DB-enforced return-to-service gate | IMPLEMENTED | `hs_equipment_return_to_service_guard()`, 146-147a |
| C4.4 | PUWER assessments | IMPLEMENTED | 148-148a |
| C4.5 | LOLER thorough examinations + immediate danger | IMPLEMENTED | 149, unconditional quarantine on `immediate_danger` |
| C4.6 | Contractor companies/insurance/prequalification | IMPLEMENTED | 150, `contractor_is_current()` |
| C4.7 | Contractor workers + Safe-to-Deploy-aware access gate | IMPLEMENTED | `contractor_worker_access()`, 151 |
| C4.8 | Permit to work lifecycle | IMPLEMENTED | `permits_lifecycle_guard()`, 152, self-authorisation fixed 155 |
| C4.9 | Isolation/LOTO, multi-lock | IMPLEMENTED | `isolations_lifecycle_guard()`, 153 |
| C4.10 | Emergency planning, versioned, drills → actions | IMPLEMENTED | 154 |
| C4.11 | Client portal UI for contractors/permits/isolations | IMPLEMENTED | Phase 22 Groups 2-4: ContractorsClient/PermitsClient/IsolationsClient reused verbatim as shared-dupe pairs, `/protect/{contractors,permits,isolations}`; a plain `client_admin` already held `contractors.manage` (117's `legacy_role_map`), no new RLS needed — proven live before building; cross-tenant read/write refused, 7/7 checks |
| C4.12 | Permit checklist response UI | IMPLEMENTED | Phase 22 Group 3: `TemplateItemsPanel`/`ChecklistPanel` in `PermitsClient.tsx`, insert-only `permit_checklist_responses` |
| C4.13 | `consultancy_visits` DB-level lifecycle guard | IMPLEMENTED | Phase 22 Group 1, migration 185, `consultancy_visits_lifecycle_guard()`, 12/12 live probe checks |
| C4.14 | Mobile/tablet verification for inspections/PUWER/LOLER/defects/contractors/permits/LOTO | DEFERRED-BUT-REQUIRED | Phase 22 handover: no device/browser testing capability in this environment; no new CSS-level risk found (reused existing responsive classes only) — still open, no further phase assignment until real device access exists |

**Gaps carried forward**: C4.14 (no further phase — needs real device/browser access; C2.8 above is the same underlying gap).

---

## Phase C5 — EHS Management System: Governance, Environmental, ISO, Legal Register, Document Control, Objectives, Management Review, Audit Engine (migrations 156-166)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C5.1 | Environmental Aspects & Impacts, deterministic significance (no AI scoring) | IMPLEMENTED | 156, `GENERATED ALWAYS AS (likelihood*severity*frequency)` |
| C5.2 | Environmental incidents/spills/waste/monitoring/permits | IMPLEMENTED | 157 |
| C5.3 | Environmental monitoring upper/lower/range-bound limit evaluation | IMPLEMENTED | Phase 22 Group 5, migration 186, `limit_direction` (upper/lower/range), 12/12 live probe checks, byte-identical for every pre-186 row |
| C5.4 | Shared ISO 45001/14001 clause framework, no copyrighted text | IMPLEMENTED | 158, `standard_clauses` |
| C5.5 | ISO readiness dashboard, counts only, never a compliance claim | IMPLEMENTED | 158 |
| C5.6 | Legal Register: requirements, obligations, evaluations, cautious vocabulary | IMPLEMENTED | 159, no "compliant"/"non-compliant" strings |
| C5.7 | Tavily research foundation (inert until wired) | IMPLEMENTED then wired | 159 → wired live in Phase 17 (C17) |
| C5.8 | Controlled document management, workflow, immutability, version-pinned acknowledgements | IMPLEMENTED | 160, `hs_document_lifecycle_guard()` |
| C5.9 | Objectives & Targets, deterministic RAG roll-forward | IMPLEMENTED | 161 |
| C5.10 | Management Review, data pack snapshot, immutable decisions | IMPLEMENTED | 161 |
| C5.11 | Internal audit enhancement (findings, severity-scoped closure gate) | IMPLEMENTED | 162, `audit_findings_closure_guard()` |
| C5.12 | Governance calendar | IMPLEMENTED | read-time aggregate, `governanceCalendarEvents()` |
| C5.13 | Worker consultation, environmental complaints | IMPLEMENTED | 162 |
| C5.14 | Evidence-link foundation (`requirement_evidence_links`) | IMPLEMENTED | 163 |
| C5.15 | Governance KPI framework | IMPLEMENTED | `lib/governance/kpis.ts` |
| C5.16 | Broadcast integration for legal requirements | IMPLEMENTED | `?legal=<id>` prefill |
| C5.17 | Sibling-version-race protection on `hs_documents`/`emergency_plans`/`environmental_aspects` | IMPLEMENTED (fixed post-hoc) | migrations 164-166, found+fixed in Group 10 adversarial pass |

**Gaps carried forward**: none.

---

## Phase C6 — Consultant Command Centre & Client Service Ledger (migrations 167-172)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C6.1 | Portfolio-wide RLS pattern (`my_home_company_id()` + `has_capability(arbitrary org)`) | IMPLEMENTED | 167-169, corrected mid-flight from the single-tenant bug the Group 2 probe caught |
| C6.2 | Service-role-mediated bulk reads via `portfolio_organisations()` | IMPLEMENTED | 167 |
| C6.3 | `access_scope_allows()` enforcement (closes C1.8) | IMPLEMENTED | 167 |
| C6.4 | Service scope + consultancy visits (minimal, extended by Phase 7) | IMPLEMENTED | 168 |
| C6.5 | Portfolio counts feeding `client_health_snapshots` | IMPLEMENTED | `lib/health/portfolioCounts.ts`, promoted to shared-dupe in Phase 18 |
| C6.6 | Client Service Ledger, automated + manual entries | IMPLEMENTED | 169, `serviceLedgerRules.ts` |
| C6.7 | Attention Queue, Client 360, Consultant Workload | IMPLEMENTED | portal-only, reads existing action/service engines |
| C6.8 | Cross-Client Calendar | IMPLEMENTED | read-time aggregate over 8 source tables |
| C6.9 | Value Report consultancy extension (quarterly) + Communication Timeline | IMPLEMENTED | 171, `computeQuarterlyValueReport()` |
| C6.10 | Client Switcher hardening (stale-tab guard) | IMPLEMENTED | `StaleOrganisationGuard.tsx`, database-level guard from Phase 1 covers navigations |
| C6.11 | Events/audit sweep (`consultancy.client_accessed`, `service_scope.updated`, `client_roadmap.updated`, `value_report.generated`, `service_ledger.entry_created`) | IMPLEMENTED | 172 |
| C6.12 | Manual Service Scope / Service Ledger entry writer UI | IMPLEMENTED (closed same phase) | Group 7 found the RLS existed with **no writer anywhere**; built `ClientActionForms.tsx` + two routes before Phase 6 shipped |
| C6.13 | Site-level drilldown so a portfolio issue resolves to the responsible client/site/record | IMPLEMENTED | Closed Phase 24 Group 3: `/consultancy/clients/[id]/sites/[siteId]`, filters the SAME `loadAttentionQueue()` the Attention Queue page already calls so the two can never disagree; Attention Queue's own Site column now links to it |
| C6.14 | Communication Timeline pagination/filtering | IMPLEMENTED | Closed Phase 24 Group 4: `searchParams`-based kind/visibility filters (`FilterForm`, reused unchanged) + Prev/Next pagination, replacing the old hard `.slice(0, 30)` |
| C6.15 | Visit reports as a Communication Timeline source | IMPLEMENTED | Closed Phase 24 Group 5: `communicationTimeline.ts` gained a `visit_report_issued` kind, dated by `issued_at` not `created_at` — only `status = 'issued'` rows are ever passed in, a draft is never a communication event |

**Gaps carried forward**: C6.13, C6.14, C6.15 all closed Phase 24.

---

## Phase C7 — Consultant Visit Mode & Automated Site-Visit Reporting (migrations 173-176)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C7.1 | Visit entity, full 8-value lifecycle, templates | IMPLEMENTED | 173 |
| C7.2 | Pre-Visit Brief reusing Attention Queue | IMPLEMENTED | `buildPreVisitBrief()` |
| C7.3 | Structured observations, cross-org linked-record guard, immediate-danger sync escalation | IMPLEMENTED | 174, `visit_observation_escalate()` |
| C7.4 | Mobile/offline-tolerant capture (current observation survives a drop) | IMPLEMENTED (narrow, documented scope) | localStorage draft; NOT a full background-sync queue — documented limitation |
| C7.5 | Universal Actions integration + "verify previous actions" | IMPLEMENTED | 175, three new additive RLS policies |
| C7.6 | Report Builder, versioning (sibling-race-safe from day one) | IMPLEMENTED | 176 |
| C7.7 | Report issuing atomicity (claim-before-work) | IMPLEMENTED (fixed post-hoc) | Group 8 adversarial pass found + fixed a genuine double-submit race |
| C7.8 | Follow-up detection, Consultant Metrics | IMPLEMENTED | `followUpDue.ts`, `computeConsultantMetrics()` |
| C7.9 | Emergency plan roles cross-referencing live authorisation holders | IMPLEMENTED | reads `person_authorisations` live, never stored |

**Gaps carried forward**: none material — Phase 7 has no open item in the Master Spec's known-gaps list. Confirm in QA pass (task #79) rather than assume.

---

## Phase C8 — Risk Graph & Connected Compliance Intelligence (migration 177)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C8.1 | `risk_graph_neighbors()`, SECURITY INVOKER, depth-capped | IMPLEMENTED | 177 |
| C8.2 | Connected Compliance Intelligence (uncovered hazards, ineffective shared controls, unlinked obligations) | IMPLEMENTED | `lib/riskGraph/intelligence.ts`, fixed post-hoc for the coverage-type bug (Group 4) |
| C8.3 | Reusable Connections panel on relevant record pages | IMPLEMENTED | **Phase 23 Group 1**: `ConnectionsPanel.tsx` (shared-dupe pair), wired into admin's audit detail page and portal's incident detail page (additive alongside the bespoke `IncidentLinks.tsx`) |
| C8.4 | Neighbour label resolution beyond hazards/RAs/legal obligations | IMPLEMENTED | **Phase 23 Group 1**: `lib/riskGraph/entityLabels.ts` (shared-dupe pair), a curated label map for 14 entity types + incident, falling back to a humanised type + truncated id for anything uncurated |
| C8.5 | Portfolio-safe consultant Risk Graph view | IMPLEMENTED | **Phase 23 Group 2**: migration 187 (six additive consultancy-read RLS policies on `hazards`/`risk_assessments`/`risk_assessment_items`/`risk_item_controls`/`organisation_legal_obligations`/`hs_links`), `RiskGraphClient.tsx` promoted to a shared-dupe pair, new portal page `/consultancy/clients/[id]/risk-graph`. Live-probed (8/8 checks): authorised Client A visible, unauthorised Client B invisible, SELECT-only, and `risk_graph_neighbors()` proven portfolio-safe with zero code change |

**Gaps closed by Phase 23 Group 1-2**: C8.3, C8.4, C8.5.

---

## Phase C9 — "What Changed?" Daily Operational Intelligence (no migration)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C9.1 | Pure computation, counts-only, curated label map | IMPLEMENTED | `lib/whatChanged/compute.ts` |
| C9.2 | Admin `WhatChangedTab` on client detail | IMPLEMENTED | client-side fetch under staff RLS |
| C9.3 | `event_type='reminder'` correctly counted (post-hoc fix) | IMPLEMENTED | Group 3 adversarial fix |
| C9.4 | Client-facing, safely-scoped version for their own organisation | IMPLEMENTED | Closed Phase 25 Group 4: `/protect/what-changed` reuses `computeWhatChanged()` (promoted to a shared-dupe pair) via a service-role-mediated read of `platform_events` (no client SELECT policy exists), scoped by a live `effectiveCompanyId()` lookup. `lib/whatChanged/clientScope.ts` curates which entity types are client-appropriate, pinned against the real `TRIGGERED_ENTITIES` array so a new entity type can neither silently disappear nor silently leak in |
| C9.5 | Scheduled daily/period digest with preference/role controls + dedup | IMPLEMENTED | Closed Phase 25 Group 5, migration 193: `notification_preferences.what_changed_digest` ('off'\|'daily'\|'weekly', default 'off' — explicit opt-in). New `/api/cron/what-changed-digest` (07:10 UTC daily; weekly recipients processed only on a Monday) computes each opted-in client_admin's own company summary and sends via `sendKeyedEmail`'s claim-before-send pattern — a re-run sends nothing twice, and a recipient with nothing to report gets no email |

**Gaps carried forward**: C9.4, C9.5 both closed Phase 25.

---

## Phase C10 — Incident Pattern Intelligence (no migration)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C10.1 | Pure computation from non-sensitive columns only | IMPLEMENTED | `lib/incidentPatterns/analyze.ts` |
| C10.2 | Root-cause clustering, site/department clustering | IMPLEMENTED | uses `incident_causes.category` taxonomy |
| C10.3 | Period-over-period severity comparison, equal-length windows | IMPLEMENTED (fixed post-hoc, then documented) | `incidentPatternWindows()`; 2026-09-30 independent audit corrected the doc claim of "equal-length" to accurately describe the deliberate 1-day forward pad |
| C10.4 | Configurable analysis window within bounded safe ranges, fair equal-length comparisons preserved | IMPLEMENTED | Closed Phase 25 Group 3: `incidentPatternWindows()`'s existing `days` parameter was already fully generic — only the UI/route layer artificially restricted it to 30/90/365. New `clampWindowDays()` (`MIN_WINDOW_DAYS`/`MAX_WINDOW_DAYS`, shared-dupe pair) bounds a user-supplied `?days=` to a safe range server-side before it ever reaches the window-fairness computation, so the equal-length guarantee is preserved regardless of what a caller requests. Both apps' `IncidentPatternsView.tsx` gained a custom-window input alongside the existing presets |
| C10.5 | No cross-client incident benchmarking without explicit consent/anonymisation | ACCEPTED-NONREQUIREMENT | Master Spec itself: "Do not add... unless a separate explicit consent/anonymisation model is implemented and approved" — correctly never built |

**Gaps carried forward**: none — all C10 rows closed.

---

## Phase C11 — Evidence Engine & Evidence-Backed Compliance (no migration)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C11.1 | Register-completion evidence-coverage computation | IMPLEMENTED | `lib/evidenceEngine/analyze.ts` |
| C11.2 | Evidence Library (browsing list, signed-on-demand URLs) | IMPLEMENTED | 200-row cap, session-signed |
| C11.3 | Entity type / category / outcome / date-range / current-vs-historical filters | IMPLEMENTED | **Phase 23 Group 3**: `EvidenceEngineClient.tsx` gains client-side filters over the already-fetched, row-capped arrays — no new query shape |
| C11.4 | Current-outstanding-gap view (latest completion) vs. audit-history view | IMPLEMENTED | **Phase 23 Group 3**: `analyzeEvidenceCoverage()` gains `currentGaps` — a genuinely different computation (only the NEWEST completion per item), not a UI filter over `gaps` |
| C11.5 | Combined cross-reference navigation with `requirement_evidence_links`/ISO/legal evidence | IMPLEMENTED | **Phase 23 Group 3**: `crossReferenceComplianceItems()` — counts-only, per source kind (ISO clause/legal obligation/objective/audit finding), linking to the relevant catalogue page |

**Gaps closed by Phase 23 Group 3**: C11.3, C11.4, C11.5.

---

## Phase C12 — Compliance Digital Twin (no migration)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C12.1 | Composition of 5 existing modules into per-area RAG bands | IMPLEMENTED | `lib/complianceTwin/assemble.ts` |
| C12.2 | Named-threshold bands, never a formula/score | IMPLEMENTED | fixed-constant `if`-chains |
| C12.3 | Red-still-reports-amber-reasons; null-vs-zero handling | IMPLEMENTED (fixed post-hoc) | Group 3 adversarial pass fixed 2 real Medium defects |
| C12.4 | Stored snapshot/history for posture trend | IMPLEMENTED | **Phase 23 Group 4**: migration 188, `compliance_twin_snapshots` (staff-only RLS, UNIQUE(company_id, snapshot_date) upserts), "Save today's snapshot" + a 30-day trend list, admin Digital Twin page only |
| C12.5 | Configurable thresholds/weighting at org/sector level, safe defaults, audited | IMPLEMENTED | **Phase 23 Group 5**: migration 189, `compliance_twin_thresholds` (staff-only RLS, audited), `assembleComplianceTwin()` gains an optional `thresholds` param — null/unset always falls back to the documented default; a staff-only edit form on the admin Digital Twin page |
| C12.6 | Every score exposes inputs, missing evidence, rationale | IMPLEMENTED | **Phase 23 Group 6**: `ComplianceTwinArea` gains `inputs` — the exact raw values and the threshold actually used (post-override), a collapsible "Show inputs" per area in `ComplianceTwinView.tsx` |

**Gaps closed by Phase 23 Group 4-6**: C12.4, C12.5, C12.6.

---

## Phase C13 — Board Assurance & Executive Reporting (migration 178)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C13.1 | Immutable quarterly report snapshot, draft→issued only | IMPLEMENTED | 178, `board_assurance_reports_guard()` |
| C13.2 | Board member acknowledgement, insert-only, duplicate-safe | IMPLEMENTED | `UNIQUE (report_id, acknowledged_by)` |
| C13.3 | Admin generate/issue/PDF UI | IMPLEMENTED | reuses Digital Twin + portfolio-counts loaders |
| C13.4 | Portal read + acknowledge | IMPLEMENTED | `BoardAssuranceAcknowledge.tsx` |
| C13.5 | Management-review citation bounded to the report's own period (fixed post-hoc) | IMPLEMENTED | `quarterEndDate()`, Group 3 fix |
| C13.6 | Cross-client consultant assurance dashboard (current/overdue/missing/deteriorating, drilldown) | IMPLEMENTED | `boardAssuranceStatus.ts`/`loadBoardAssuranceStatus.ts`, `/consultancy/board-assurance`, Client 360's own summary card — Phase 27 Group 2 |
| C13.7 | Draft report regenerate/refresh from current evidence before issue | IMPLEMENTED | `POST .../generate`'s `regenerate: true` flag — conditional counted DELETE of the draft, an issued report always refused — Phase 27 Group 1 |
| C13.8 | Core 360 Status view (People/Plant/Training/Risk Controls/Environmental/Contractors domains) | IMPLEMENTED | `lib/core360Status/assemble.ts` (shared-dupe pair), `Core360StatusView.tsx`, `/health-safety/<companyId>/core-360-status` + `/protect/core-360-status` — Phase 27 Groups 3-4 |

**Gaps carried forward**: none. C13.6, C13.7, C13.8 closed in **Phase 27**.

---

## Phase C14 — Worker QR System (migrations 179-180)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C14.1 | Durable per-worker badge token, coarse status only | IMPLEMENTED | 179, `worker_qr_status()` |
| C14.2 | `site_checkins`, attendance not compliance | IMPLEMENTED (fixed post-hoc) | 179; grant defect found+fixed by this session's own adversarial pass, migration 182 |
| C14.3 | Leaver badge auto-revoke | IMPLEMENTED (fixed post-hoc) | 180, found+fixed in Phase 14 Group 3 |
| C14.4 | Badge mint/revoke UI, QR rendered client-side | IMPLEMENTED | `WorkerBadgePanel.tsx` |
| C14.5 | On-site roster page | IMPLEMENTED | `/lead/workforce/onsite` |
| C14.6 | Printable/downloadable QR badges/labels with human-readable fallback ID | IMPLEMENTED | Closed Phase 26 Group 1: `WorkerBadgePanel.tsx`'s "Print badge" toggles a `<body>` class the print stylesheet uses to hide every other section, leaving just the badge card for the browser's native Print/Save-as-PDF; `humanBadgeId()` prints `people.employee_number` next to the QR, falling back to a short id-derived reference for a worker with no `employee_records` row |
| C14.7 | Site/kiosk/manual check-in/out for authorised users, explicit site selection | IMPLEMENTED | Closed Phase 26 Group 2, migration 195: `recorded_via` widens to `'qr_scan' \| 'manual'`; new client RLS (`workforce.manage`, own company only) + a column-restriction guard trigger (a non-staff session may only ever change `checked_out_at`); `ManualCheckinForm.tsx` (explicit site picker, never a guessed default) + `CheckoutButton.tsx` |
| C14.8 | "Checked in but never checked out" / stale attendance detection | IMPLEMENTED | Closed Phase 26 Group 3: a new `site_checkins` reminder rule (`overdue` the morning after check-in, then weekly — the earliest a date-granularity daily cron can say it), notifying `workforce.manage` holders, re-checking the row live before notifying so an already-closed-out row is never a stale nag |
| C14.9 | QR coverage beyond people: machines/assets, work areas, COSHH, site entrance/induction, PPE | IMPLEMENTED (narrower scope, documented) | Closed Phase 26 Group 4, migration 196: `entity_qr_tokens` covers machines/assets (`hs_equipment`) and COSHH assessments — the two other real, coarse-status object kinds this codebase tracks. "Work areas/site entrance" and "PPE" are deliberately left out (no site-management UI exists to host a mint action; PPE has no standalone catalogue table); "induction" is already covered by the existing per-person worker badge |

**Gaps carried forward**: none — C14.6, C14.7, C14.8, C14.9 closed in Phase 26 (see above).

---

## Phase C15 — Intelligent RAMS (no migration)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C15.1 | Jev section-suggestion (6 conditional sections only, never free text) | IMPLEMENTED | `lib/hs/ramsSectionQuestions.ts` |
| C15.2 | Never auto-write/approve RAMS content | IMPLEMENTED | UI-only reveal of empty sections, no write to `method_statements` |
| C15.3 | Validation ceiling matches DB column (fixed post-hoc) | IMPLEMENTED | Group 3 fix, `longText(8000)` |
| C15.4 | Use of verified internal context (site, task, hazards, plant, people, competency, controls, prior incidents, documents) | IMPLEMENTED (narrower scope, documented) | Closed Phase 26 Group 5: the suggestion state gains `site_name`/`open_hazards_at_site`/`lifting_or_plant_equipment_at_site`/`incidents_at_site_last_12_months`, all real counts read server-side and scoped to the caller's own company, only when a site has been selected. Deliberately excludes people/competency/controls/documents — a RAMS has no "assigned people"/controls/evidence linkage of its own to read honestly; inventing one would be a guessed signal |
| C15.5 | Hard warnings before issue/approval for assigned people/equipment failing deterministic requirements | IMPLEMENTED | Closed Phase 26 Group 6: `ramsApprovalWarnings()` — linked equipment that is quarantined/decommissioned/out-of-service or overdue its own inspection, and an author/responsible manager who is `NOT_READY`/`REVIEW_REQUIRED` via `person_deployment_status()` (136) — rendered as a `Notice` banner, with an explicit acknowledgement checkbox required before Approve/Make active can be confirmed. A UI-level gate, deliberately not a database one: the shared `hs_doc_guard()` (123) governs hazards/risk assessments/method statements/COSHH alike |
| C15.6 | Suggestion provenance recorded/inspectable | IMPLEMENTED | Closed Phase 26 Group 7: `jev_decisions` already recorded every call in full; a new "What informed this?" toggle on `RamsHeaderEditor.tsx` reads that one row back under the actor's own RLS (`jev_decisions_actor_read`) and renders the site-derived facts used plus each conditional section's probability, highest first — no new write, no new route |

**Gaps carried forward**: none — C15.4, C15.5, C15.6 closed in Phase 26 (see above).

---

## Phase C16 — Cross-Client Lessons Learned Network (migration 181)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C16.1 | Staff-authored, no client-visible source table | IMPLEMENTED | 181, no client SELECT policy on `lessons_learned` |
| C16.2 | Deterministic sector-match distribution suggestion, never AI | IMPLEMENTED | `suggestDistribution.ts` |
| C16.3 | Distribution-gated read receipt | IMPLEMENTED | proven live: undistributed lesson refused (23514) |
| C16.4 | Publish-route duplicate check by SQLSTATE not string (fixed post-hoc) | IMPLEMENTED | Group 3 fix |
| C16.5 | Distribution can target multiple clients while preserving source-client anonymity and immutable history | IMPLEMENTED | no `company_id` on `lessons_learned`, distributions insert-only |

**Gaps carried forward**: none material found against the Master Spec's own list for Phase 16 specifically (its Phase 25 section covers Lessons Learned's *multi-client targeting*, already satisfied by C16.5) — confirm in QA pass.

---

## Phase C17 — Regulatory Intelligence → Action (Tavily) (no migration)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C17.1 | Tavily client, server-only, never client-side | IMPLEMENTED | `lib/tavily/client.ts` |
| C17.2 | Verbatim snippet summarisation, no AI paraphrase | IMPLEMENTED | `summariseResults()` |
| C17.3 | On-demand only, rate-limited | IMPLEMENTED | `limiters.vendor` |
| C17.4 | Human "Mark reviewed" — never an automatic verdict | IMPLEMENTED | `action_taken` free text, human-set |
| C17.5 | Manual-entry UI for research notes alongside Tavily notes, provenance marked | IMPLEMENTED | Closed Phase 25 Group 2: `LegalRequirementsCatalogueClient.tsx` gained a manual-entry form inserting a `legal_requirement_research_notes` row with `source: 'manual'`, rendered alongside Tavily's own `source: 'tavily'` notes with the same provenance badge |
| C17.6 | Concurrent review/update handling (no silent overwrite) | IMPLEMENTED | Closed Phase 25 Group 2, migration 192: `row_version` added to `legal_requirement_research_notes` (fill/touch triggers force the counter regardless of caller input, the established pattern). A new rule closes a gap the prior precedents never needed: content (`raw_result_summary`/`query_used`/`source`) is immutable once created — only the review fields (`reviewed_by`/`reviewed_at`/`action_taken`) may change, and "Mark reviewed" is a conditional `.eq('row_version', ...)` update surfacing a stale-write message on a lost race |
| C17.7 | Full flow: research → human-reviewed regulatory change → affected clients/sites/documents/risks identified → reviewed Broadcast → actions → acknowledgement/evidence → completion | IMPLEMENTED | Closed Phase 25 Group 6, migration 194: `broadcast_sends.source_type`/`source_id` trace a send back to its `legal_requirements`/`latest_updates` origin; raised `actions` rows carry `source_type: 'regulatory_broadcast'`/`source_id: <broadcast key>` (a documented two-hop trace: action → send → origin, not action → origin directly, avoiding a semantic collision with `legalRegisterRules.ts`'s own pre-existing, differently-scoped use of `'legal_requirement'`). `lib/broadcast/rollup.ts`'s `groupBroadcastActions()` re-assembles the per-company action rows back into one bucket per send (keyed by `source_id` when present, a title/description/timestamp heuristic otherwise for hand-typed broadcasts), and `RecentBroadcasts.tsx` renders a Completion column (N of M actions complete) plus a "Regulatory" badge — closing the acknowledgement/evidence/completion tracking loop the prior PARTIAL status was missing |
| C17.8 | Env vars documented in CLAUDE.md (fixed post-hoc) | IMPLEMENTED | Group 3 fix |

**Gaps carried forward**: none — all C17 rows closed.

---

## Phase C18 — Core 360 Assurance: "Are we safe and compliant today?" (no migration)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C18.1 | Composition of PortfolioCounts + Digital Twin into one TODAY-dated view | IMPLEMENTED | `lib/assurance/today.ts` |
| C18.2 | Never asserts "safe"/"compliant" as a verdict | IMPLEMENTED | grepped clean in Group 3 adversarial pass |
| C18.3 | `AssuranceTodayView` shared-dupe, admin + portal | IMPLEMENTED | registered in `check-shared-dupes.sh` |
| C18.4 | This is explicitly a narrower predecessor to the Master Spec's Phase 27 "Core 360 Status" (C13.8) | ACCEPTED-NONREQUIREMENT (as shipped) | Phase 18 was always scoped as "today only", not the full domain-scored assurance surface — Phase 27 supersedes/extends it, not a defect of Phase 18 itself |

**Gaps carried forward**: none new beyond C13.8 (already tracked under Phase C13/Phase 27).

---

## Phase C19 — Full Platform Hardening (migration 182 + the 2026-09-30 adversarial pass)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C19.1 | Env var documentation consolidation | IMPLEMENTED | Group 1 |
| C19.2 | Rate-limit gaps closed (8 routes) | IMPLEMENTED | Group 2 |
| C19.3 | Row-cap gap in `hs_links` reads closed | IMPLEMENTED | Group 2 |
| C19.4 | Accessibility gap (missing `aria-label`) closed | IMPLEMENTED | Group 2 |
| C19.5 | Missing-`.order()` pagination defect class found + fixed repo-wide (17 files) | IMPLEMENTED | Group 3 |
| C19.6 | Sixth CI guard: `check-paged-order.sh` | IMPLEMENTED | mutation-tested |
| C19.7 | `site_checkins` table-grant defect found + fixed (this session's own follow-up pass) | IMPLEMENTED | migration 182, PR #287 |
| C19.8 | Two orphaned API routes (`admin/manatal/matches` pair, `portal/consultancy/attention-queue`) | MISSING (decision needed) | Master Spec Phase 29 known-gap references this exact debt; **user has already instructed these be KEPT** (HIRE offering) — reclassify below |
| C19.9 | No automated guard yet for "readAllPages() never wrapped at all" (the worse variant of C19.5, found in the original Phase 8 admin risk-graph page) | DEFERRED-BUT-REQUIRED | Group 3/paged-order-guard's own documented blind spot → assigned **Phase 29** |

**Gaps carried forward**: C19.9 → **Phase 29**. C19.8 is **not a gap** — see Protected Legacy Preservation Manifest note below.

---

## Protected Legacy Preservation Manifest — status

These systems predate Core-OS 360 (original sequential Phases 1-43) and are
explicitly protected by the Master Spec: "must remain available and function
end-to-end throughout the completion programme."

Test-coverage levels below are from a dedicated read-only audit run for this phase
(`docs/CORE_OS_360_PHASE20_HANDOVER.md` §Baseline carries the full report). Vocabulary:
`TRUE-E2E` (a single test drives entry to terminal state through a real route),
`PARTIAL-WORKFLOW` (multiple stages covered, but fragmented/mocked, no single
entry-point test), `UNIT-ONLY` (pure-function tests only), `NONE` (no automated
test of any kind).

| System | Status | Test coverage | Note |
|---|---|---|---|
| Automated Referrals (config → intake → gating → scoring → send → tracking) | IMPLEMENTED, operating | **PARTIAL-WORKFLOW → improved this phase** | `gate.test.ts` (pure), `pipelineIdempotency.test.ts` + `approve.test.ts` + `[id]/route.test.ts` (fake-Supabase route-level, cover intake→gate→claim→send). **This phase added** `api/cron/referral-scan/__tests__/route.test.ts` (5 cases: auth, real no-op pipeline pass, per-run recordRun outcome vocabulary) — the cron entry point's own wrapper is now covered. `config`, `send-qualified`, `test-email` routes remain untested → gap ledger. |
| Athletes to Industry | IMPLEMENTED, operating | **UNIT-ONLY** | Only `athleteWelcome.test.ts` (template/branding assertions). Roster, CVs, partners, matching and the live public `api/r/athlete/[slug]` signup route are untested → manual script §1, gap ledger. |
| Development Plans (athlete + employee) | IMPLEMENTED, operating | **NONE** | Zero automated test files found anywhere in the subsystem → manual script §2, gap ledger. |
| E-Learning marketplace | IMPLEMENTED, operating | **NONE** | `checkout`/`webhook` routes and `stripe.ts` have zero test coverage → manual script §3, gap ledger. |
| Broadcast | IMPLEMENTED, operating | **UNIT-ONLY → improved this phase** | `broadcastPrefill.test.ts` (5 pure-function cases) plus, **added this phase**, `api/broadcast/__tests__/route.test.ts` (4 cases: real send end-to-end — one action per company, client_admin-only email, audit trail, all-or-nothing on an invalid company_id, staff-auth refusal). |
| Billing/Invoicing | IMPLEMENTED, operating | **NONE** | `stripe.ts`, `retainer`, `raise-invoice`, `stripe/webhook` all untested → manual script §4, gap ledger. |

Full manual regression procedures for the four still-`NONE`/partial systems:
`docs/PROTECTED_LEGACY_REGRESSION_SCRIPTS.md`.
| Employee/person records, org chart, onboarding/offboarding, leave, policy acknowledgements | IMPLEMENTED, operating | Extended (never replaced) by C3 (Safe to Deploy) and C5.8 (document control). |
| Performance reviews, training needs/records, skills matrix, calendar, notifications | IMPLEMENTED, operating | `platform_events`/`notify()` (096+) is additive machinery layered on top, not a replacement. |
| Support tickets → **retired 2026-09-25**, replaced by `service_requests` as the one support object | IMPLEMENTED, operating (superseding change, not a regression) | "Support & BD in sync" entry in CLAUDE.md; `tickets`/`ticket_messages` had 0 live rows at the time — a deliberate consolidation, not a silent loss. |
| Client engagement/login activity, feature flags, value reports, CSV exports, secure documents | IMPLEMENTED, operating | Value report extended (not replaced) by C6.9/Phase 5 Group 6. |
| Recruitment pipeline (JD/candidate/interview/offer), Friction Lens, salary benchmarking | IMPLEMENTED, operating | No Core-OS 360 phase touched this subsystem's core tables. |
| Existing PROTECT/H&S register, audits, incidents, equipment, tests, timeline, reports | IMPLEMENTED, operating | This IS the Core-OS 360 H&S core (C2/C4) — protected by construction, since every later phase extends rather than forks it (the repo-wide standing rule). |

**Orphaned-route decision (C19.8), reclassified**: `admin/src/app/api/admin/manatal/matches/route.ts`
+ its `move-stage` sibling, and `portal/src/app/api/consultancy/attention-queue/route.ts`
were flagged as orphaned by Phase 19's static-analysis survey. **The user has since
explicitly instructed these be KEPT, not deleted, because they belong to the HIRE
offering.** This matrix records that as a closed product-owner decision, not an
open gap — Phase 29's "audit and remove/resolve orphan API routes" requirement is
satisfied by this recorded resolution (resolve ≠ delete).

---

## Consolidated Gap Ledger (every DEFERRED-BUT-REQUIRED / MISSING / PARTIAL row above, by target phase)

| Target Phase | Rows |
|---|---|
| **21** (People/LMS/Safe-to-Deploy closure) | *closed — C1.10, C3.7, C3.8, C3.9, C3.10 all IMPLEMENTED, see `docs/CORE_OS_360_PHASE21_HANDOVER.md`* |
| **22** (Operational H&S/client workflow closure) | *mostly closed — C4.11, C4.12, C4.13, C5.3 all IMPLEMENTED, see `docs/CORE_OS_360_PHASE22_HANDOVER.md`; C2.7/C2.8/C4.14 remain open (no device/browser testing capability in this environment)* |
| **23** (Risk Graph/Evidence Engine/Digital Twin completion) | *closed — C8.3, C8.4, C8.5, C11.3, C11.4, C11.5, C12.4, C12.5, C12.6 all IMPLEMENTED, see `docs/CORE_OS_360_PHASE23_HANDOVER.md`* |
| **24** (Consultant Command Centre/Ledger completion) | *closed — C1.9, C6.13, C6.14, C6.15 all IMPLEMENTED; C1.12 partially closed (the `consultancy_visit_reports` slice — the other two candidate tables were checked live and found to need no lock); rest of C1.12 stays with **Phase 28**, see `docs/CORE_OS_360_PHASE24_HANDOVER.md`* |
| **25** (Operational intelligence/regulatory/Broadcast) | *closed — C1.11, C9.4, C9.5, C10.4, C17.5, C17.6, C17.7 all IMPLEMENTED, see `docs/CORE_OS_360_PHASE25_HANDOVER.md`* |
| **26** (Worker QR/Intelligent RAMS/adoption) | *closed — C14.6, C14.7, C14.8, C14.9, C15.4, C15.5, C15.6 all IMPLEMENTED (C14.9 and C15.4 with a narrower, documented scope), see `docs/CORE_OS_360_PHASE26_HANDOVER.md`* |
| **27** (Board Assurance/Core 360 Status) | *closed — C13.6, C13.7, C13.8 all IMPLEMENTED, see `docs/CORE_OS_360_PHASE27_HANDOVER.md`* |
| **28** (UX/navigation/search/reporting/parity) | C1.13, C1.12 (shared w/24) |
| **29** (Security/regression/certification) | C19.9, PL.1 (real automated preservation tests for A2I signup, Development Plans, E-Learning checkout/webhook, Billing/Invoicing — see `docs/PROTECTED_LEGACY_REGRESSION_SCRIPTS.md`) |

Every row in this ledger must close (or be explicitly reclassified to
`ACCEPTED-NONREQUIREMENT` by the product owner, as done for C19.8 above) before
Phase 29's final gate.
