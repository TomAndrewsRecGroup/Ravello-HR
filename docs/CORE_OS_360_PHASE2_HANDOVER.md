# Core-OS 360 Phase 2: Operational H&S Core — Engineering Handover and QA Report

**Date:** 2026-09-28. **Branch:** `claude/optimistic-albattani-uezht8` (not merged, so not deployed).
**Database:** migrations 122–129 are applied live to `sbmekaviwkiyorvmtgcu`. Function bodies were md5-verified against the files.
**Plan:** `docs/CORE_OS_360_PHASE2_PLAN.md`. **Probes:** `supabase/probes/123_*` through `128_*`, each rolled back.

The chain this phase delivers is Hazards → Risk Assessments → Controls → RAMS → COSHH → Incident / Near Miss → Investigation → Root Cause → Corrective Actions (the universal `actions` table) → Verification → RIDDOR review.

**Phase 3 has not been started.**

---

## A. Existing H&S audit

The full component map is in the plan. Rows were counted live before any change, and **every operational H&S table held 0 rows**. No live H&S data was migrated or put at risk.

| Decision | Components |
|---|---|
| **REUSED** unchanged | `hs_sites`, `departments` and `people` (from Phase 1), the statutory register (`compliance_items` domain `hs`, completions, `hs_next_due`), activities and toolbox talks, `hs_documents`, audits, `hs_equipment` (the "asset"), `training_records`, `hs_tests`, the admin `/health-safety` workspace |
| **EXTENDED** | `hs_files` and the private `hs-evidence` bucket (new entity types, `evidence_type`/`description`, client upload behind capabilities, storage reads inherit the `hs_files` row's RLS); `hs_events` timeline (one trigger per new table); `hs_incidents` (number, title, time, reporter, location, the full lifecycle, optimistic locking); `actions` (class, `in_progress`/`awaiting_verification`, verifier, evidence, effectiveness review); `search_records`; portal PROTECT |
| **MIGRATED** | RIDDOR: the free boolean and staff-task rule became the `riddor_reviews` decision-support workflow. `hs_incidents.riddor_reportable` stays, derived from the human decision, so existing readers still work. The legacy `injured_person_name` column moved to the restricted `incident_person_sensitive` table and is now closed by a CHECK. |
| **REPLACED** | Nothing. No second actions system, no second evidence store and no second "Safety" section were created. |

---

## B. Schema report

**26 new tables:**

| Migration | Tables |
|---|---|
| 122 | `record_sequences`, `hs_links`, `hs_templates` |
| 123 | `hazard_categories`, `assessment_types`, `risk_matrices`, `hazards`, `controls`, `risk_assessments`, `risk_assessment_items`, `risk_item_controls` |
| 124 | `method_statements`, `method_statement_steps`, `rams_acknowledgements`, `substances`, `sds_versions`, `coshh_assessments`, `coshh_assessment_controls` |
| 125 | `incident_people`, `incident_person_sensitive`, `incident_investigations`, `incident_timeline_events`, `incident_causes`, `investigation_why_analyses`, `riddor_reviews`, `incident_escalation_rules` |

**Changed tables:** `hs_incidents`, `actions`, `hs_files`.

**Relationships:**
- Every record carries `company_id`, which means the client organisation.
- Versioned documents (RA, RAMS, COSHH) share a `reference`, with one row per version and `previous_version_id` pointing back.
- Risk items point to a hazard, and controls attach per item and stage.
- COSHH points to a substance, which points to its SDS versions.
- An incident has people, sensitive detail per person, an investigation, causes, 5 Whys, a RIDDOR review and a timeline.
- Corrective actions are ordinary `actions` rows with `source_type`/`source_id`.
- Any record can link to any other through `hs_links`, which is typed. A trigger requires both ends to be in the same organisation, and links are copied forward on a new version.

**Functions:**

| Group | Functions |
|---|---|
| Versioning and templates | `hs_new_version`, `hs_instantiate_template`, `hs_template_update_available` |
| Guards | `hs_doc_guard`, the incident, investigation and RIDDOR guards, `actions_party_guard` (126) |
| Read helpers | `my_capabilities`, `org_directory` (127) |
| Reporting | `hs_safety_overview`, `hs_safety_breakdowns` (128) |

**Indexes:**
- 126a replaced eight partial unique indexes with full ones, so that keyed upserts work (see I).
- 129 added trigram indexes for search.

---

## C. Workflow report

All workflow rules live in the database, in BEFORE triggers. The UI only requests transitions; PostgREST cannot bypass them.

| Workflow | Path | Enforced rules |
|---|---|---|
| **Hazard** | identified → under_assessment → controlled → monitoring → closed / archived | Quick report needs only a title and a location. Owner and site must be in the same organisation. Anyone holding `hazard.report` can report; `hazard.manage` is needed to manage. |
| **Risk assessment** | draft → pending_review → (changes_requested ↔ draft) → approved → active → review_due → active; superseded; archived | **Submit** needs at least one hazard, a residual rating on every hazard, an assessor and a review date. **Changes requested** needs a comment. **Approve** needs `risk.approve`, and the approver may not be the creator, submitter or assessor (staff excepted). Approved content is immutable. A new version is a draft copy of the items, controls and links. Approving it supersedes the previous version automatically. Manual supersede is refused. Only one open draft per reference. Residual risk may not exceed initial. Scores are generated columns. |
| **RAMS** | Same document states | Method steps can be reordered while in draft. Acknowledgements are stamped with the version and cannot be edited or deleted. Links to RA, COSHH, hazard and equipment. |
| **COSHH** | Same document states | A substance is required. A new SDS version moves every active assessment for that substance to `review_due` (reason `sds_change`). SDS rows are immutable, and old versions are kept. |
| **Incident** | reported → triage → under_investigation → awaiting_actions → closed (→ reopened) | **Report:** type, when, where, title and what happened; everything else is optional. **Triage:** severity must be confirmed before closing. **Close:** blocked while corrective actions are open, unless someone with `incident.approve` records an override reason. Once closed, the incident, its people and its RIDDOR review are locked. |
| **Investigation** | started → pending (submitted) → completed / returned | **Submit:** needs at least one human-confirmed root cause and a summary. **While pending:** the investigation and its causes are locked. **Approval:** the lead may not approve their own investigation. **5 Whys:** 1–10 levels. |
| **RIDDOR** | not_reviewed → potentially_reportable (prompts only) → decided | **Flags:** the seven flags prompt a review and never decide. **Decision:** needs `riddor.review` and a rationale, and is stamped to the signed-in user. No automatic legal conclusion. No HSE submission. |
| **Action** | active → in_progress → awaiting_verification → complete (or rejected → in_progress); cancelled | **Before verification:** evidence is required. **Self-verification:** refused. **Rejection:** needs a reason. **Major+ incidents:** verification is forced on. **Effectiveness review:** stamped to the reviewer. **Who may change what:** the assignee changes status and evidence, the verifier changes the verification and effectiveness fields, and only `actions.assign` holders can change anything else (126). |

---

## D. Permission report

The mapping below was read live from `access_role_capabilities`.

| Can… | Capability | Roles |
|---|---|---|
| **Report** a hazard | `hazard.report` | every organisation role, including employee and recruiter |
| **Report** an incident | reporter's own row (RLS) | every organisation user; an employee sees **only their own** reports |
| **View** incidents | `incident.read` | owner/admin/editor, HSE manager/advisor, site and department managers, HR manager, read-only, consultancy owner and consultant, staff |
| **View injury detail** | `incident.sensitive.read` | owner/admin, HSE manager, HR manager, consultancy owner and consultant, staff. A reporter can **record** injury detail but never read it back. |
| **Investigate** | `incident.investigate` | owner/admin, HSE manager/advisor, site manager, consultancy owner and consultant, staff |
| **Approve** RA / RAMS / COSHH | `risk.approve` | owner/admin, HSE manager, consultancy owner and consultant, staff (never their own) |
| **Decide RIDDOR** | `riddor.review` | owner/admin, HSE manager, consultancy owner and consultant, staff |
| **Close** an incident / approve an investigation / override | `incident.approve` | owner/admin, HSE manager, consultancy owner and consultant, staff |
| **Assign** actions | `actions.assign` | managers, advisers, admins, consultants, staff |

---

## E. Migration report

| Migration | Contents | Existing records affected |
|---|---|---|
| 122 | Foundation: capabilities, record numbering, `hs_links`, templates, evidence extension and storage policy | `hs_files` (0 H&S rows) |
| 123 | Hazards, matrices, risk assessments | none (new tables) |
| 124 | RAMS, COSHH, SDS | none |
| 125 (+125d) | Incident lifecycle, people, investigations, RIDDOR, escalation, action verification | `hs_incidents` 0 rows; `actions` 0 rows. 125d fixed a NULL written into `riddor_reportable` |
| 126 | Action party guard, safety search | `actions` policy tightened (0 rows) |
| 126a | Full unique indexes for eight keyed-upsert targets | Existing rows were checked for duplicates first; none were found |
| 127 | `my_capabilities`, `org_directory` (applied as 127, then 127b) | none |
| 128 | Overview and analysis RPCs | none |
| 129 | Trigram search indexes | none |

Every migration was applied through `apply_migration` (atomic), and the live function bodies were checked by md5 afterwards.

---

## F. RLS report

All 26 new tables have **RLS on**, verified live on 2026-09-28.

- **Write guard:** 25 of the tables also carry Phase 1's three **restrictive** write-guard policies (`apply_write_guard`), so a read-only grant cannot write to them. The one exception is `record_sequences`, which is internal numbering with a single policy and no client write path.
- **Tenancy:** every policy is `company_id = my_company_id()` (the active organisation) plus a capability check. No policy spans several organisations.
- **Consultants:** a consultant writes the client's `company_id`. Audit records the consultant as the actor.

Isolation was proven live:
- Client B cannot read, list, write, link or attach anything of Client A's (probes 125 and 128).
- A consultant cannot reach an organisation they have no grant for.
- A revoked consultant loses access immediately.
- Search never crosses organisations.
- The people picker holds only the active organisation.

---

## G. Storage report

**Bucket.** `hs-evidence` is **private**, with a 25 MB limit and 7 allowed MIME types (PDF, JPEG/PNG/WebP/HEIC, DOCX, XLSX). The limits are enforced by the bucket, not only by the form.

**Keys and access.**
- Every key is `<company>/<entity_type>/<entity_id>/<uuid>-<name>`, so a duplicate file name never collides.
- The storage read policy requires the matching `hs_files` row to be readable. Evidence therefore inherits the record's RLS.
- Files open through **signed URLs created under the user's own session**. No service role is used anywhere in the Phase 2 safety code.

**Attacks refused (probe 128_qa_attacks):**
- listing another client's objects;
- writing into their folder;
- a `../` key (it stays inside the caller's own folder);
- registering another client's object as your own evidence;
- attaching evidence to another client's record.

---

## H. Event report

**`platform_events` (the outbox).** New triggers cover hazards, risk assessments, RAMS, COSHH, SDS, incidents, investigations, RIDDOR reviews and actions. Every trigger has a column whitelist. Probes confirmed that incident descriptions, injury detail, rationale and notes appear in **0** timeline, audit or outbox rows.

**Consumer rules** (`admin/src/lib/events/safetyRules.ts`):
- hazard reported, assigned, or left unassessed;
- incident reported, escalated (the organisation's own rules, or the platform default), RIDDOR flagged, RIDDOR reportable (one keyed staff task, no submission), RIDDOR unresolved, closed;
- investigation assigned, reassigned, submitted, decided, overdue;
- action assigned, reassigned, verification requested, rejected, overdue;
- RA submitted/approved; SDS-driven COSHH review.

**Reminders:** review-due and overdue for RA, RAMS (review date and end date), COSHH, hazards, investigations and actions.

**`audit_events`** records every create and status change with actor, actor kind and home organisation. It is append-only for everyone, including the owner role.

These records are the raw material for future intelligence. **No predictive feature was built.**

---

## I. Regression report

**Protected systems.** The Phase 1 protected-regression probe was re-run after 122–129 and gave **26/26 PASS, unchanged**. It covers Referrals, Athletes to Industry, Development Plans, E-Learning, Broadcast, Billing, policy acknowledgements and client isolation.

**Live on 2026-09-28:**
- Referral cron: 24 runs in 24 h, all `ok`.
- Candidates without a person: 0 of 2,657.
- Fixture rows persisted by any probe: 0.

**A pre-existing platform defect was found and fixed.** Since 096, every keyed `upsert(onConflict)` (notifications, `email_log`, `internal_tasks`, reminders…) had been failing: PostgREST cannot infer a partial unique index. No keyed notification had ever been written. Migration 126a fixes it, and `upsertConflictTargets.test.ts` stops the defect coming back. Once the reminders cron runs this code it will write rows it never could before, so watch `automation_runs` after deploy.

**Suites (2026-09-28):**
- Admin: tsc clean, 1,041 tests.
- Portal: tsc clean, 441 tests.
- All five CI guards pass.
- Both production builds compile.

---

## J. Known technical debt (honest)

| # | Item | Severity |
|---|---|---|
| 1 | **Notifications and reminders are not live.** The branch is not deployed, so the Phase 2 rules are verified by unit tests only (17 in `safetyRules.test.ts`, plus reminders). After deploy, check `automation_runs` and one real notification of each kind. | Medium (verification gap) |
| 2 | **Mobile and tablet layouts are not browser-verified.** The forms are built phone-first (44–48 px targets, single column), but no signed-in browser session was possible in this sandbox. | Medium (verification gap) |
| 3 | **No incident→training link.** `training_records` is keyed to `employee_records`, not `people`, so there is no reliable join to show factual training status for a person in an incident. It needs an employee↔person link first. | Medium |
| 4 | **Full QA volume not loaded.** The runner stops at 60 s. The probe was measured at 10% and 25% of the spec's volume: list queries did not grow, and aggregates grew sub-linearly (see 128_volume). | Low |
| 5 | No UI to manage escalation rules. The platform default applies, and the organisation rule table exists. | Low |
| 6 | No draft autosave on long forms. | Low |
| 7 | No substances index page; substances are reached through COSHH and search. | Low |
| 8 | A RAMS acknowledgement cannot carry an evidence file. | Low |
| 9 | Hazard quick report has no idempotent retry, unlike incidents. A lost reply could file the hazard twice. | Low |
| 10 | Uploading a malformed or oversized file through the Storage API was not exercised end to end. The bucket limits were verified live, and the form rejects both. | Low |
| 11 | **Phase 1 carry-overs:** broadcast has no idempotency key; `access_scope` is not enforced; UI role-string checks remain; the Stripe run is BLOCKED on external credentials. | as Phase 1 |
| 12 | QA was performed by the same agent that built the phase: the evidence is independent, the reviewer is not. A human spot check of section C before deploy is recommended. | — |

By design, and not debt: a new document version starts **without** a review date, so it must be set again before it is submitted.

---

## K. Phase 3 readiness

**The platform is safe to continue** once this branch is deployed and debts 1 and 2 are checked on the live site. No Critical or High issue is open. Tenancy, versioning, evidence security and protected-system regression are proven live. **Phase 3 has not been started.**

---

# Senior Test Engineer and H&S QA Lead report

This QA was run as an independent pass: every result below comes from an executed probe or test, or it is marked otherwise.

**Probes:**

| Probe | Result |
|---|---|
| `123_hazards_risk` | recorded |
| `124_rams_coshh` | recorded |
| `125_incidents` | 76 checks |
| `126_action_scope_search` | 15/15 |
| `128_consultancy_safety` | 18/18 |
| `128_qa_attacks` | 41/41 |
| `128_qa19_relationships` | 7/7 |
| `128_qa31_incident_retry` | 4/4 |
| `128_volume` | recorded |
| `117_121_protected_regression` | 26/26 |

## QA 1 — Requirements traceability (Definition of Done)

| # | Requirement | Implementation | Automated test | Manual / live test | Result |
|---|---|---|---|---|---|
| 1 | Existing H&S audited | Plan §Existing H&S map | — | Live row counts | PASS |
| 2 | No duplicate architecture | REUSE/EXTEND map; one actions table, one evidence store | safetyApiSql, tenancySql | Section A | PASS |
| 3 | Hazard register | 123 `hazards`; `/protect/hazards` | safetyVocab | 123, 128 | PASS |
| 4 | Hazard quick report | `/protect/hazards/new` | — | 123 (title + location only) | PASS (mobile NOT VERIFIED) |
| 5 | Structured RA | 123; `/protect/risk-assessments` | riskMatrix | 123, 128_qa | PASS |
| 6 | Multiple hazards per RA | `risk_assessment_items` | — | 123 (3 items), 128_qa (4) | PASS |
| 7 | Initial/residual risk | Generated scores; residual ≤ initial | riskMatrix | 128_qa QA5 | PASS |
| 8 | Control hierarchy | `controls.control_type`, per-item stage | safetyVocab | 123 (5 controls) | PASS |
| 9 | Risk approval | `hs_doc_guard` | — | 123, 128_qa | PASS |
| 10 | Versioning | `hs_new_version`, supersede on approve | — | 123, 128_qa QA6 | PASS |
| 11 | Risk templates | `hs_templates`, instantiate, update-available | — | 123, 128_qa QA7 | PASS |
| 12 | RAMS | 124; `/protect/rams` | — | 124 | PASS |
| 13 | Method steps | `method_statement_steps`, reorder | — | 124 (5 steps, reorder, partial reorder refused) | PASS |
| 14 | RAMS approval | Shared guard | — | 124 | PASS |
| 15 | COSHH register | `substances` | — | 124 | PASS |
| 16 | SDS versioning | `sds_versions` (immutable) | — | 124 (3 kept, v2 current) | PASS |
| 17 | COSHH assessment | `coshh_assessments` | — | 124 | PASS |
| 18 | Incidents | 125; `/protect/incidents` | — | 125 | PASS |
| 19 | Near-miss reporting | Same form, `near_miss` type | reportIncident | 125, 128_qa31 | PASS (mobile NOT VERIFIED) |
| 20 | Incident evidence | `hs_files` entity `incident` | csv, boundary | 128_qa QA22 | PASS |
| 21 | Incident people | `incident_people` + sensitive | — | 125 | PASS |
| 22 | Investigations | `incident_investigations` | safetyRules | 125 | PASS |
| 23 | Incident timeline | `incident_timeline_events` + `hs_events` | — | 125 | PASS |
| 24 | Root cause | `incident_causes`, 5 Whys | — | 125 | PASS |
| 25 | Universal corrective actions | `actions` (source_type) | safetyRules | 125, 126 | PASS |
| 26 | Action verification | Verifier, evidence, reject | safetyRules | 125, 126 | PASS |
| 27 | Effectiveness review | Effectiveness fields, stamped | — | 125 | PASS |
| 28 | RIDDOR review | `riddor_reviews` | safetyRules | 125, 128_qa QA17 | PASS |
| 29 | Human legal confirmation | `riddor.review` + rationale; flags only prompt | safetyRules | 125, 128_qa | PASS |
| 30 | Relationships | `hs_links` (same-organisation trigger) | tenancySql | 128_qa19 | PASS (training: FAIL, see QA 19) |
| 31 | Notifications | `safetyRules.ts`, reminders | safetyRules (17), upsertConflictTargets | — | PASS (unit); live NOT VERIFIED |
| 32 | Audit events | `hs_doc_after`, `audit_row` | — | 123, 124, 125, 128_qa | PASS |
| 33 | Platform events | Whitelisted outbox triggers | platformEventsSql | 123 (10 events), 125 | PASS |
| 34 | Consultancy/client permissions | Phase 1 active organisation + capabilities | tenancySql | 128_consultancy | PASS |
| 35 | Sensitive info restricted | `incident_person_sensitive` | — | 125, 128_qa QA21 | PASS |
| 36 | Mobile reporting | Phone-first forms | — | No browser session | NOT VERIFIED |
| 37 | Print/export | Four print pages, CSV (formula-neutralised) | csv.test | Build | PASS (visual print NOT VERIFIED) |
| 38 | RLS verified | 26 tables, RLS on | shape tests | Live `pg_class` + probes | PASS |
| 39 | No regression | — | 1,041 + 441 | 117_121 26/26 | PASS |
| 40 | Production build | — | — | Both apps | PASS |
| 41 | Automated tests | — | 1,041 + 441 | — | PASS |
| 42 | Senior QA signs off | This report | — | — | PASS WITH MINOR ISSUES |

## QA 2–33

| QA | Area | Evidence | Result |
|---|---|---|---|
| 2 | Hazard register | **Covered:** create, owner/site same-organisation check, status (closed), archive, isolation (123, 128_qa19). Evidence on a hazard (128_qa QA22). **Not covered:** the mobile layout. | PASS (mobile NOT VERIFIED) |
| 3 | Cross-tenant hazard attack | **Blocked:** B sees 0 of A's hazards; UUID substitution returns 0 rows; direct insert into A refused; storage attack refused (125, 128_consultancy, 128_qa). **Pages and API:** read with the user's session, so the same RLS applies. | PASS |
| 4 | Risk assessment | **Covered:** new, multiple hazards, initial/residual, controls, approval, changes requested (comment required), review date, versioning, superseding (123, 128_qa). **Archive:** proven through the shared document guard on RAMS (128_qa19). | PASS |
| 5 | Risk calculation | All four corners give the right score and band. 0, 6, −1, NULL and malformed are refused; so are residual above initial and a half-entered residual. The score cannot be written (128_qa). | PASS |
| 6 | Versioning v1/v2/v3 | Final states: `1:superseded, 2:approved, 3:draft`. v1's item is unchanged by v2's edit. Header edits, item edits and deletes are refused on v1 and v2 (128_qa). | PASS |
| 7 | Template safety | Template emptied afterwards; the live RA keeps 3 → 3 items, and "update available" = true (128_qa). | PASS |
| 8 | RAMS | **Covered:** creation, method steps, reorder, approval, versioning (124). **Links to RA, COSHH and equipment:** the equipment and hazard link UI was added in this QA pass, and the database side was proven (128_qa19). **Export:** print page. | PASS |
| 9 | COSHH | **Covered:** substance, SDS, new SDS version (the assessment goes to review; the old SDS is kept, current = v2), assessment, controls snapshot, review date (124). **PPE, first aid and health surveillance:** assessment fields, not individually asserted. | PASS |
| 10 | Incident reporting | **All required types exist:** accident, near miss, dangerous occurrence, environmental, property damage, occupational ill-health. **Devices:** not browser-tested. | PASS (devices NOT VERIFIED) |
| 11 | Incident people | **Roles:** employee, contractor, visitor, external, witness, injured. **Injury detail:** readable only with `incident.sensitive.read`. A reporter records injury detail and cannot read it back; a site manager cannot read it (125). | PASS |
| 12 | Incident evidence | **Enforced server-side:** the 25 MB limit and MIME list are bucket settings, verified live. **Duplicate names:** cannot collide (uuid key). **Signed URLs:** issued under the user's session. **Not exercised live:** an upload through the Storage API. | PASS (see J10) |
| 13 | Investigation flow | **Blocks proven:** severity must be confirmed before close; submit needs a confirmed root cause; a pending investigation is locked; the lead cannot approve their own; close is blocked with actions open (125). | PASS |
| 14 | Root cause | **Depths:** 3 whys accepted; 0 and 11 refused. The system does not force exactly five (125). | PASS |
| 15 | Corrective action | **Covered:** assign, due date, evidence required, submit, self-verification refused, rejection needs a reason, named verifier verifies, effectiveness review, reopen (125, 126). | PASS |
| 16 | High-severity close | **Close without override:** BLOCKED. **Token override:** refused. **Real override:** accepted only with a recorded reason (125). | PASS |
| 17 | RIDDOR scenarios | **Each of the 7 flags:** gives `potentially_reportable`, `riddor_reportable = false` and no decision. **Minor near miss:** stays `not_reviewed`. **Decisions:** need a person and a rationale; nothing is submitted to the HSE (125, 128_qa). | PASS |
| 18 | RIDDOR permission | **Refused:** employee, site manager, HSE adviser (125), recruiter (128_qa). **Allowed:** HSE manager (125). | PASS |
| 19 | Incident relationships | **Links work to:** risk assessment, RAMS, COSHH, equipment, actions, contractor (as an incident person). **Survival:** links survive versioning and archiving (128_qa19). **Training:** not built (J3). | **FAIL (training only) — Medium** |
| 20 | Consultancy | **Authorised client (ABC):** full work, and records are owned by ABC with the consultant as the audited actor. **Unauthorised client (XYZ):** no access. **Revocation:** immediate (128_consultancy). **Two simultaneous grants:** switching between them was proven in Phase 1. | PASS |
| 21 | Client access | **HSE manager and admin:** see everything. **Employee:** sees 0 others' incidents, 0 RIDDOR rows and 0 RAs, and cannot read injury detail (125, 128_qa). | PASS |
| 22 | Storage attack | **Refused:** listing, writing, `../` traversal, registering, cross-record attach (128_qa). | PASS |
| 23 | Universal action engine | **One `actions` table.** Incident actions appear on the incident, in `/protect/actions` (All), in "Mine" (owner workload), in "Overdue" and in the overview's overdue count. | PASS |
| 24 | Notifications | **Unit-tested (17 rule tests):** risk review due, overdue, investigation assignment, action due, overdue and awaiting verification, RAMS and COSHH review, RIDDOR review. **Keyed writes:** 126a makes them possible at all. | PASS (unit); live NOT VERIFIED |
| 25 | Audit trail | **Actors attributed correctly:** hazard, risk create/submit/approve (actor a1/a2), RAMS and COSHH approval (124), incident, RIDDOR decision, investigation completion, action verification (125). **Deletion:** refused for the organisation admin and for the owner role (128_qa). | PASS |
| 26 | Platform events | **Tenant and entity:** from the row. **Actor:** actor_kind recorded. **Content:** whitelisted columns only; description or medical text appears 0 times (125). | PASS |
| 27 | Export | **Pages:** RA, RAMS, COSHH and incident print pages; CSV on the registers. **Scope:** the active organisation under RLS; the version is shown. **Injury detail:** only with `incident.sensitive.read`. **Visual print:** not browser-checked. | PASS |
| 28 | Search | **Record kinds:** hazard, incident (number, title, site, date; never the description), person, site, substance, equipment, RA/RAMS/COSHH, investigation, action. **Scope:** SECURITY INVOKER, and A never reaches B (126, 128_consultancy). | PASS |
| 29 | Performance | **At 25% volume:** lists 4–7 ms, overview 115 ms, analysis 150 ms, search ~60 ms (trigram). **Queries:** no N+1; pages batch by id list. **Full volume:** not loadable in 60 s (J4). | PASS (at 25% scale) |
| 30 | Concurrent edit | **Stale edit:** a `row_version` edit matches 0 rows and the newer edit is kept (128_qa). **Approved versions:** immutable regardless. | PASS |
| 31 | Network failure | **Defect found in this QA pass:** a lost reply after commit, then a retry, gave a **duplicate incident**. **Fixed:** the form now fixes the id when it opens (`reportIncident.ts`). **Proof:** unit tests (mutation-checked) and a live probe (4/4). **Other failures:** a real failure is never shown as success; evidence failures are listed on the confirmation, never dropped silently. | PASS (after fix) |
| 32 | Regression | 26/26 protected; referral cron healthy (see I). | PASS |
| 33 | Security | **Covered:** RLS on all tables; no service role in safety code; injury data restricted; signed URLs; IDOR probes; tenant switching (128_consultancy); file paths (QA22); `api/actions/[id]` validates with zod and uses the active organisation. | PASS |

## QA 34 — Failure classification (found during Phase 2)

| Defect | Class | Status |
|---|---|---|
| 125: `riddor_reportable` written as NULL, so no RIDDOR review could be saved | High (RIDDOR workflow broken) | Fixed (125d) |
| Any organisation user could update any action, so who did the work was forgeable | High (privilege escalation in tenant) | Fixed (126) |
| Every keyed upsert failed (a partial unique index), so no notification was ever written; pre-existing since 096 | High (platform-wide) | Fixed (126a) + guard test |
| `org_directory` name fallback exposed part of the email address | Medium | Fixed before commit (127b) |
| Incident retry after a lost reply created a duplicate | Medium | Fixed in QA |
| RAMS could not link equipment in the UI | Medium | Fixed in QA |
| Portal build broke: a client component imported a server-only module | High (build) | Fixed + boundary test |
| No incident→training link | Medium | **Open** (J3) |
| Mobile and live notifications not verified | Verification gap | **Open** (J1, J2) |

**No Critical defect was found.**

## QA 35 — Phase 2 gate

**Rating: PASS WITH MINOR ISSUES.**

None of the stop conditions holds:
- no Critical issue;
- no High security issue open;
- tenancy isolation proven;
- risk versioning proven;
- incident records cannot be lost or duplicated;
- evidence access secure;
- no protected-system regression.

The open items are one Medium functional gap (training link) and two verification gaps, which must be closed after deploy (J1, J2).

**Phase 3 has not been started.**
