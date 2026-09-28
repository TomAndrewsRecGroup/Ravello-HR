# Core-OS 360 Phase 3: People, Training, Competency, Occupational Health & Safe to Deploy — Engineering Handover and QA Report

**Date:** 2026-09-28. **Branch:** `claude/optimistic-albattani-uezht8` (not merged, so the app code is not deployed).
**Database:** migrations 131–141 are applied live to `sbmekaviwkiyorvmtgcu`. Every function body was md5-verified against its file after applying.
**Plan:** `docs/CORE_OS_360_PHASE3_PLAN.md`. **Probes:** `supabase/probes/131_*` to `141_*`, `phase3_qa.sql`, `phase3_qa2.sql`, `phase3_perf.sql`. Each one is rolled back by its final RAISE.

The chain this phase delivers: People → Roles → Training → Competency → Health Requirements → Recruitment → Onboarding → **Safe to Deploy**. It answers, from evidence and with every reason shown: *is this person competent, trained, medically suitable where required, authorised and ready to perform this role safely today?*

**Phase 4 has not been started.**

---

## A. Existing workforce audit

The full map is in the plan (§1). Before any change, live rows were:
- `people`: 1,830 (1,806 candidates, 18 athletes, 4 client-admin logins).
- `employee_records`, `training_records`, `training_needs`, `skills_matrix`, `performance_reviews`, `employee_documents`, onboarding, `hs_sites`, `departments`, `offers`, `hs_tests`: **0 rows each**.

No live workforce data was migrated or put at risk.

| Decision | Components |
|---|---|
| **REUSED** unchanged | `employee_records` (131 sensitive-column rules intact), `candidates`/`offers`, `athletes`/`dev_plans` (A2I), `referral_applications`, `learning_content`/`learning_purchases`, `hs_tests`, `hs_sites`, `departments`, `incident_training_checks` (130) |
| **EXTENDED** | `people` (lifecycle, engagement type, primary role, contractor company); `training_records` (person, course, result, verification, source; `employee_id` now nullable); `employee_documents.person_id`; onboarding template tasks and progress (`gate`, `gate_days`); `requisitions.job_role_id`; the capability model (10 capabilities, 1 role); `search_records` (job roles, courses); `my_capabilities` (explicit-only, 140); `person_link_row` (141) |
| **NEW** | Job roles and assignments; requirement rules; the catalogues; evidence tables; occupational health (summary and clinical apart); the Safe to Deploy engine, cache and log (details in B) |
| **REPLACED / DEPRECATED** | Nothing. The skills matrix stays self-assessed skill levels; it is **not** competency, and nothing in the engine reads it. |

## B. Person architecture

- **One `people` row per person per organisation** (118). Candidate, employee, contractor, athlete and login contexts all link to it. A hire keeps the candidate's person (`source_candidate_id`); athlete → candidate → employee is one person (QA 2, fixed by 141).
- **Lifecycle** (`prospect … archived`) follows the latest employment record (137):
  - `pre_employment` before the start date;
  - `active`;
  - `notice` once an end date is set;
  - `leave_of_absence`;
  - `leaver` on termination.

  An hourly tick moves the dates that pass without a write.
- **Engagement type** (`permanent`, `contractor`, `agency`…) and `contractor_company`. Each contractor worker is judged alone (QA 23). The full contractor company model is Phase 4.
- **Logins are optional.** Deleting a login nulls `people.user_id` and keeps the person and history (QA 3).
- **Referrals:** a hired referral links through its candidate's person. The referral pipeline is untouched (regression 26/26).
- **Duplicates are detected, never merged** (spec: "no destructive merge unless identity is confirmed"):
  - `person_duplicate_candidates(person)` matches on email, phone or normalised name;
  - `workforce_duplicate_pairs(company)` matches on email or phone.
- **Who may see a worker** (`person_visible`):
  - staff;
  - the person themselves;
  - `workforce.read` in the ACTIVE organisation;
  - their line manager;
  - the manager of the site or department of an active assignment (QA 24).

## C. Requirements engine

- **`job_roles`** are operational roles, not titles: draft → active → inactive. `job_role_clone` makes a draft copy with draft rules for review before activation (spec 104).
- **`role_assignments`**:
  - many per person, and they combine (QA 4);
  - one primary;
  - `planned` / `active` / `ended`;
  - an ended assignment is never re-opened;
  - a started one keeps its person, role and start date. A change of role is end + new, so history stays (QA 19).
- **Rules:** `role_requirements`, `site_requirements`, `person_requirements`.
  - **Types:** training, competency, qualification, certification, licence, card, permit, induction, medical, authorisation, PPE, document, pre-employment check.
  - **Settings:** mandatory, safety-critical, evidence required, allow e-learning, validity, grace, required by.
  - **Source:** manual, incident, corrective action, COSHH, risk assessment, clone or import.
- **Versioning** (spec 105), enforced by `requirement_rule_guard`:
  - a draft has no start date;
  - a rule in force can never be edited or deleted — to change it, supersede → edit the draft → activate, and the old version ends the day before;
  - no rule starts in the past or ends retroactively.
- **Consolidation** (`_wf_requirements`):
  - every rule in force on the date, from every role and site the person is assigned to on that date, plus their own rules;
  - one row per item, keeping the strictest settings and every source.

  An item is **safety-critical** when any of these holds:
  - the rule says so;
  - its catalogue entry says so;
  - it is mandatory for a safety-critical role.

  Since 139, verification uses the same definition (see QA 43).
- **From safety records, by a person only** (`workforce_requirement_from_source`, 137):
  - an incident → people named on it (`incident.investigate`);
  - a corrective action → named people;
  - COSHH or a risk assessment → a person, site or role (`workforce.manage`).

  Never the whole organisation (QA 29). A development item can be raised from an incident; suspensions use the 134 RPCs with `source_type = 'incident'` (QA 28).

## D. Training architecture

- **Catalogue:** `training_courses` (delivery method, validity, refresher, safety-critical, certificate expected, `learning_content_id`). **Sessions:** `training_sessions` + `training_attendance` (invited, attended, no-show, passed, failed, reschedule). `training_session_record_outcomes` creates a record for passes only (spec 53).
- **Records:** `training_records`, extended. Every record carries its source (manual / self / import / hs_test / elearning / session / consultant).
- **Verification rules:**
  - self-submitted evidence is always unverified (the INVOKER guard, 134a);
  - verification goes through `workforce_verify`, which requires the right capability;
  - nobody verifies their own evidence;
  - safety-critical evidence needs `workforce.verify_safety_critical` and a verifier who is not the submitter;
  - a second decision on the same evidence is refused with 40001 (QA 39).
- **Expiry:** `expires_on`, else completion + validity. Status is met / expiring (within the organisation's `expiring_soon_days`, default 30) / expired, with optional grace. It is computed on the server's UK date (`workforce_today()`) (QA 8).
- **E-learning:** a completion counts only where the rule allows e-learning and the record is valid. A purchase never counts; nothing creates a record from a purchase (QA 27).

## E. Competency architecture

- **Catalogue:** `competencies` and 6 global `competency_levels`. Evidence is in `person_competencies`: level, assessment method, assessor, and verification.
- **Competence is never inferred from training.** The competency branch of the engine does not read `training_records` (pinned by a test; QA 11). The latest VERIFIED assessment decides the level; a lower later one is a downgrade.
- Suspension and reinstatement (`competency_suspensions`) take effect at once (QA 10, 28). The same model covers authorisations: `person_authorisations` (scope, suspension, revoke).
- No AI anywhere in Phase 3. Nothing reads CV text or scores a person.

## F. Occupational health security

- **Two tables, two audiences (135):**
  - `person_health_outcomes` is the operational summary: outcome category, dates, provider, restriction summary. It is read with `occupational_health.summary.read` or by the person, is insert-only, and nobody records their own.
  - `occupational_health_clinical` and the `oh-clinical` bucket are readable and writable **only with an explicit** `occupational_health.clinical.read` grant, held only by the new `occupational_health_advisor` role. Staff do not get it. Since 140, staff are not even offered it.
- **Safe to Deploy sees the category only**, e.g. "Fit with restrictions — see occupational health". The engine never reads restriction text (pinned by a test).
- **Never carried:** restriction text and clinical content appear in no audit whitelist, outbox payload, notification or CSV export. The OH reminder says only that a review is due.
- **Proven live:** 135 17/17 (per user type, cross-client clinical leak, staff upload refused) and 140 (staff clinical = false, advisor = true).

## G. Safe to Deploy — the exact logic (136)

`_wf_deployment(person, as_of)`:
1. Not an active worker today (lifecycle outside pre_employment/active/notice) → **NOT_READY** `not_active`.
2. No assignment on the date → **REVIEW_REQUIRED** `no_role`.
3. For each consolidated requirement, plus every recorded pre-employment check even without a rule, judge the evidence **as of the date**:
   - Verified-by-that-date evidence is required when safety-critical or evidence-required; unverified evidence then means `review`.
   - Rejected evidence never counts.
   - A suspension active on the date means `unmet`.
   - Medical: unfit → `unmet`, further assessment → `review`, fit with restrictions → `met_with_restrictions`.
   - Pre-employment: failed or outstanding → `unmet`.
4. A live exception approved under `deployment.exception.approve` (≤ 90 days) turns an `unmet`/`review` into `excepted` (or `not_applicable`). It lapses by itself (QA 17).
5. Open onboarding gates add `unmet` (before start / before unsupervised / overdue within N days).
6. **NOT_READY** if any mandatory item is unmet; else **REVIEW_REQUIRED** if any is under review; else **CONDITIONALLY_READY** if any is excepted or met with restrictions; else **READY**.
7. Every result carries `reasons[]`, the full requirement list with sources, and `valid_until` (the next date an expiry, grace, "expiring soon", gate or exception edge changes the answer).

**Never fails open.** `_wf_deployment_safe` turns any error into **REVIEW_REQUIRED** `calculation_error` (QA 18: a READY person whose calculation breaks mid-way becomes REVIEW_REQUIRED through the public read).

**Never stale.**
- The cache `person_deployment_status` is marked dirty by triggers on 27 input tables.
- A read uses the cache only when it is clean, still in date and calculated today; otherwise it calculates live (QA 38: a suspension on a cached READY person reads NOT_READY at once).
- The hourly cron (`/api/cron/workforce-refresh`) recalculates dirty and out-of-date statuses and logs every transition to `deployment_status_log`.

**Reads:**
- `person_deployment_status(person, as_of)` checks visibility, and supports historical dates (QA 31).
- `workforce_readiness(company)` and `workforce_matrix(company)` return only visible people in the active organisation.
- `role_change_preview(person, role)` shows the requirements a new role would add (spec 87).

## H. Recruitment integration

- A requisition may name the client's job role. It can be set from the admin requisition page and from the portal "raise a role" form.
- **On hire** (137 `workforce_employee_sync`), keyed so it runs once:
  - one primary assignment, `planned` until the start date;
  - the role's pre-employment checks as `required` rows;
  - lifecycle `pre_employment`.

  **Hiring never makes anyone READY:** the checks and evidence decide (QA 21 walks hire → NOT_READY → REVIEW_REQUIRED → READY).
- **Onboarding** tasks carry their deployment gate from the template (`buildTaskRows`).
- **Leaver:** on termination, live assignments end, live exceptions and authorisations are revoked, and lifecycle becomes `leaver`. Nothing is deleted (137 probe).
- **Returner:** a new employment record makes them active again. They need a new assignment, and expired evidence stays expired (QA 32).

## I. Migration report

| # | What | Applied | Verified |
|---|---|---|---|
| 131 | employee_records sensitive columns (hotfix, pre-flight) | 13:54 UTC after #229 deployed | md5 2/2; probe 24/24; re-run after 141: 24/24 |
| 132 | Foundation: people columns, 10 capabilities + OH advisor role, `person_private`, `job_roles`, `role_assignments`, `person_visible` | yes | md5 7/7; probe 16/16 |
| 133 | Catalogues (9), requirement rules (3), versioning RPCs | yes | md5 8/8; probe 17/17 |
| 134 + 134a | Evidence (15 tables), verification/suspension/exception RPCs, storage; 134a made the session guard INVOKER (probe run 1 found it DEFINER — every session rule skipped) | yes | md5 16/16 + 5/5; probe 16/16 |
| 135 | Occupational health, clinical apart | yes | md5 3/3; probe 17/17 |
| 136 | Safe to Deploy engine, cache, log, dirty triggers | yes | md5 14/14; probe 37/37 |
| 137 | Integration: lifecycle, hire → role, leaver, safety → workforce, duplicates, search, outbox | yes | md5 12/12; probe 16/16 |
| 138 | `workforce_matrix` | yes | md5 1/1; QA probe |
| 139 | Verification uses the engine's safety-critical rule (QA 10, HIGH) | yes | md5 1/1; QA probe 10/10 |
| 140 | `my_capabilities` honours explicit-only | yes | md5 1/1; probe |
| 141 | A hired athlete becomes an employee (QA 2, HIGH) | yes | md5 1/1; QA2 re-probe |

35 new tables, all with RLS on. Every table a client can write calls `apply_write_guard`, has same-organisation triggers, and is audited with whitelisted columns. Live data after all of it: no fixture persisted; the workforce tables are empty (0 roles, 0 assignments); all 2,665 candidates are linked to a person.

## J. RLS report

- **Reads:** every person-keyed table reads through `person_visible` (or, for occupational health, the summary/explicit-clinical tests).
- **Writes:** writes go through `workforce_can(company, capability)`, which checks the active organisation. Self-service insert is allowed only for training records and credentials, and is always unverified.
- **History tables:** update and delete are revoked; suspensions and exceptions are written only through RPCs. The cache and log cannot be written by any session.
- **Guards:** all `current_user`-keyed guards are SECURITY INVOKER. `invokerGuards.test.ts` fails on a DEFINER one; the 134 defect was exactly that.
- **Storage:** `workforce-evidence` reads inherit the row's RLS. Uploads are allowed only into the active organisation's folder, with a capability, or into your own person folder. `oh-clinical` needs the explicit grant.
- **Proven live** (`phase3_qa.sql`):
  - another client reads 0 of A's workforce rows across 12 tables and writes nothing (QA 35);
  - cannot read or plant evidence in A (QA 36);
  - a consultant sees A only while acting in A (QA 25);
  - a site manager sees only their site (QA 24).

## K. Regression report

- **Database:**
  - `117_121_protected_regression` re-run after 141: **26/26** (referrals, A2I, billing, broadcast, policy acknowledgements, dev plans, e-learning, isolation);
  - `131` re-run: **24/24**;
  - the live referral cron ran 24 times in the last 24 hours, all `ok`;
  - 0 unlinked candidates.
- **App:**
  - admin 1,092 tests (111 files), portal 600 tests (39 files), full suites green;
  - tsc clean in both apps;
  - all five CI guards pass;
  - both production builds compile (portal: 12 new workforce routes; admin: the workforce-refresh cron).
- **Behaviour change (intended):** a client employee (`client_user`) can no longer read colleagues' training records or add training records on the LEAD Training Records page, which now offers add/import/delete only with `training.manage`. The deployed main branch shows such a user an error on that page until this branch deploys.

## L. Technical debt (honest)

1. **Performance at 10,000 workers** (`phase3_perf.sql`, measured at 2,000):
   - warm-cache lists take ~0.4 s, projecting to ~2 s at 10,000;
   - a live calculation is ~6 ms per person.

   A rule change that dirties thousands of people makes the list pages calculate them live until the next hourly refresh (~60 s for 10,000 cold). Medium.
2. **Lifecycle is current state.** Historical `as_of` is judged from assignments (dated) and evidence (dated), but a past lifecycle status is not stored. The document requirement uses the document's current status.
3. **No area model.** Site requirements only (spec 10 "where necessary").
4. **`requirement_supersede` does not record which rule a draft came from.** The UI asks the user which rule the draft replaces, pre-selecting the obvious one.
5. **The course form does not set `learning_content_id`**, so a course cannot be mapped to e-learning from the UI yet. E-learning completion is recorded as a training record with source `elearning`.
6. **`hs_tests` training records** get `person_id` automatically but no `course_id`, so a passed test does not satisfy a course requirement until mapped.
7. **Uploads can orphan a file.** If the upload succeeds and the record insert fails, the file stays: there is no delete path.
8. **Import duplicates are checked under the importer's own visibility.** The tables have no unique constraint for this.
9. **Suspensions from an incident need `competency.verify`** (stricter than `incident.investigate`), by design.
10. **Not verified in a real browser:** mobile layout, print output, the notification emails. They are covered by unit tests and builds only.

## M. Phase 4 readiness

The workforce model, engine and evidence store are in place and tested. Phase 4 (the contractor company model, and whatever follows) can build on:
- `people.engagement_type` / `contractor_company`;
- the rule tables;
- `person_visible`;
- the Safe to Deploy reads.

**Phase 4 is blocked until the QA gate below is PASS or PASS WITH MINOR ISSUES and the branch is merged and deployed.**

---

# Senior Test Engineer and Workforce QA Lead report

Every result below comes from an executed probe or test, unless it is marked otherwise.

| Probe | Result |
|---|---|
| `131_employee_records_sensitive` | 24/24 (after apply; re-run after 141) |
| `132_workforce_foundation` | 16/16 |
| `133_workforce_requirements` | 17/17 |
| `134_workforce_evidence` | 16/16 (run 1 found the DEFINER guard: Critical, fixed by 134a) |
| `135_occupational_health` | 17/17 |
| `136_safe_to_deploy` | 37/37 |
| `137_workforce_integration` | 16/16 |
| `140_my_capabilities_explicit` | recorded |
| `phase3_qa` | 10/10 (run 1 found QA 10: High, fixed by 139) |
| `phase3_qa2` | 6/6 after 141 (run 1 found QA 2: High) |
| `phase3_perf` | recorded |
| `117_121_protected_regression` | 26/26 |

## QA 1 — Requirements traceability (Definition of Done, 44)

| # | Requirement | Implementation | Automated test | Live test | Result |
|---|---|---|---|---|---|
| 1 | Workforce audited | Plan §0–1, section A | — | Live row counts | PASS |
| 2 | Person model | 118 + 132 (lifecycle, engagement, private) | tenancySql, workforceVocab | 132, qa2 QA2 | PASS |
| 3 | Employees intact | employee_records reused; 131 rules intact | employeePrivate | 131 24/24 re-run | PASS |
| 4 | Candidates intact | Unchanged; hire links the person | — | Regression 26/26; 0 unlinked live | PASS |
| 5 | Athletes intact | Unchanged; a hired athlete becomes an employee (141) | workforceSql | Regression, qa2 | PASS |
| 6 | Role assignments | 132 `role_assignments` | workforceSql | 136, qa2 QA4 | PASS |
| 7 | Role requirements | 133 `role_requirements` | requirements.test | 133, qa2 QA5 | PASS |
| 8 | Site requirements | 133 `site_requirements` | requirements.test | 136 QA20, qa2 | PASS |
| 9 | Training catalogue | 133 `training_courses`; catalogue page | workforceVocab | 133 | PASS |
| 10 | Training requirements | Rule type `training` (+ person rules) | — | 136, qa2 | PASS |
| 11 | Training records | 134 extended `training_records` | trainingRecordReminder | qa2 QA7, perf | PASS |
| 12 | Expiry | `_wf_expiry_status`, grace, UK date | workforceSql | 136 edges | PASS |
| 13 | Matrix | 138 `workforce_matrix`; `/lead/workforce/matrix` | matrix.test | qa QA24/25 | PASS (layout NOT VERIFIED in a browser) |
| 14 | Competency catalogue | 133 `competencies`, levels | workforceVocab | 133 | PASS |
| 15 | Person competencies | 134 `person_competencies` | workforceSql | 136, qa QA10 | PASS |
| 16 | Qualifications | 134 `person_credentials` (kind qualification…) | — | qa2 QA12 | PASS |
| 17 | Licences / cards | Same (kind licence / card / permit) | workforceVocab | 136 (licence, card) | PASS |
| 18 | Inductions | 134 induction assignments + completions | — | qa2 QA13 | PASS |
| 19 | OH requirements | 133 catalogue + rule type `medical` | workforceVocab | 136, qa2 | PASS |
| 20 | OH outcomes | 135 `person_health_outcomes` | — | 135, 136 | PASS |
| 21 | Clinical restricted | 135 + 140 | tenancySql, workforceSql | 135 (17/17), 140 | PASS |
| 22 | STD works | 136 engine | workforceSql | 136 37/37 | PASS |
| 23 | STD explainable | `reasons[]`, sources per requirement | workforceSql | 136 | PASS |
| 24 | Safety-critical blocks | Unverified → review; expiry → unmet | workforceSql | 136, qa QA10 (139) | PASS |
| 25 | Conditional controlled / auditable | Exceptions ≤ 90 days, approver, audited, auto-lapse | — | 136 QA17 | PASS |
| 26 | Recruitment → person | 118 + 137 hire sync | — | 137, qa QA21 | PASS |
| 27 | Hire → onboarding | Gates copied from template | checklistTasks | 136 gate | PASS |
| 28 | Onboarding → readiness | Open gates block | — | 136 | PASS |
| 29 | Contractor workers | engagement_type + contractor_company | — | qa QA23 | PASS |
| 30 | Authorisations | 134 authorisations + suspensions | — | 136 (scope), 137 (leaver revoke) | PASS |
| 31 | Person compliance view | `/lead/workforce/people/[id]` + print | profile.test | Build | PASS (browser NOT VERIFIED) |
| 32 | Manager team view | `person_visible` + dashboard | dashboard.test | qa QA24 | PASS |
| 33 | Consultancy client view | Active-organisation reads | — | qa QA25 | PASS |
| 34 | Training notifications | Reminders + workforceRules | workforceRules (14) | — | PASS (unit); live emails NOT VERIFIED |
| 35 | Compliance expiries | Reminder entities (credentials, authorisations, exceptions, OH, training) | workforceRules | — | PASS (unit) |
| 36 | Incident integration | 137 requirement/development item; suspension RPCs | workforceSql | 137, qa QA28 | PASS |
| 37 | Risk/COSHH-derived requirements | 137, explicit scope only | workforceSql | 137 (RA → site) | PASS |
| 38 | RLS secure | 35 tables, RLS on | invokerGuards, tenancySql | qa QA35/36 | PASS |
| 39 | Sensitive protected | person_private, OH split, 131 | — | 131, 135 | PASS |
| 40 | History available | Versioned rules, log, insert-only evidence | workforceSql | 133, 136 | PASS |
| 41 | Existing modules functional | — | Full suites | 117_121 26/26 | PASS |
| 42 | Build | — | — | Both apps | PASS |
| 43 | Tests | — | admin + portal suites | — | PASS |
| 44 | Senior QA signs off | This report | — | — | See gate |

## QA 2–42

| QA | Area | Evidence | Result |
|---|---|---|---|
| 2 | Person identity | **Covered:** candidate → employee (137, qa QA21); athlete → candidate → employee is one person, and the email match ignores case (qa2, after 141); referral → person (regression); contractor worker (qa QA23); an employee without a login (132); with a login (logins linked by 118); former employee (137 leaver); rehire (qa QA32); no duplicates created (one person throughout). | PASS (after 141) |
| 3 | Auth separation | Deleting a login keeps the person and their records (qa QA3); a person needs no login. | PASS |
| 4 | Role assignment combos | **Combined:** primary + temporary + site (8 requirements), and the temporary role drops after its end date (qa2). | PASS |
| 5 | Role with 2 training, 2 competencies, 1 qualification, 1 medical, 1 induction | All seven appear (qa2). | PASS |
| 6 | Site A → B | The site rule is added on transfer; history kept (136). | PASS |
| 7 | Training lifecycle | Recorded → verified → expired → renewed; both records kept (qa2). Scheduled covered by sessions (UI + RPC). | PASS |
| 8 | Expiry today / tomorrow / 7 / 30 / expired | All edges on the server's UK date (136). | PASS |
| 9 | Safety-critical expiry READY → NOT_READY | 136 (expired on a later date), qa QA21. | PASS |
| 10 | Competency lifecycle | **Covered:** create, assess, verify, suspend, reinstate (qa); a lower level refused (136); an assessor cannot verify their own safety-critical assessment (qa, after **139**). | PASS (after 139) |
| 11 | Training only ≠ competency | 136 ("verified training alone does not satisfy the competency"); pinned in workforceSql. | PASS |
| 12 | Qualifications | Issue, verify, expire, renew, reject (qa2). | PASS |
| 13 | Inductions | Site induction, re-induction due → overdue → re-inducted (qa2). **Scopes:** organisation, project and department exist in the catalogue; only the site scope was probed. | PASS |
| 14 | OH per user type | Employee (own only; a colleague sees nothing), site manager, HR manager, admin, OH advisor, staff, other client (135 17/17). By role (132): HR manager holds the summary; HSE manager and admins hold summary + manage; **only** the OH advisor holds clinical. The HSE manager case follows from the same RLS and was not probed separately. | PASS |
| 15 | Clinical leak | Admin, HR, site manager, the person, staff and another client all read 0 clinical rows and 0 objects (135). Staff are not even offered the section (140). | PASS |
| 16 | STD all → READY; remove one → NOT_READY | 136. | PASS |
| 17 | Conditional | Reason, approver, end date ≤ 90 days, auto-lapse, revoke (136). | PASS |
| 18 | Calculation failure → REVIEW_REQUIRED | A READY person whose calculation breaks mid-way (136). | PASS |
| 19 | Role change | Preview lists the new requirements; after the change only the new role's rules apply; yesterday is judged on the old assignment (136). | PASS |
| 20 | Site transfer | 136. | PASS |
| 21 | Full recruitment → READY | Hire → checks → training recorded → verified by the designated verifier → READY (qa). | PASS |
| 22 | Pre-employment failure blocks | Failed and outstanding checks both block (136, 137). | PASS |
| 23 | Contractor company with 2 workers | A READY, B NOT_READY (qa). | PASS |
| 24 | Manager team A vs B | Site manager sees their site only (qa). | PASS |
| 25 | Consultancy A only | Consultant sees A only while acting in A (qa). | PASS |
| 26 | Certificate storage cross-client | B cannot read or plant A's evidence (qa QA36). | PASS |
| 27 | E-learning | A completion counts only where the rule allows it (qa QA27); nothing creates a record from a purchase. | PASS |
| 28 | Incident actions | Reassessment requirement, suspension, development item, all by a person (137, qa). | PASS |
| 29 | Risk/COSHH scope | Person, site or role only; from an incident or action, named people only (137). | PASS |
| 30 | Bulk 500 / malicious ids | The import accepts no id columns; people and items are matched in the active organisation only; batches ≤ 500 under the user's session (importCsv tests, 20). The DB refuses cross-tenant rows anyway (qa QA35). | PASS (browser NOT VERIFIED) |
| 31 | Historical | `as_of` past and future (136). | PASS |
| 32 | Rehire | qa QA32. | PASS |
| 33 | Duplicate detection | Same email in any case flagged, both kept; an employee cannot list duplicates (137). | PASS |
| 34 | Notifications | Rules for not-ready, credential, authorisation, exception, OH review and training reminders (workforceRules 14, two mutations caught). Induction-overdue and competency-expiry reminders are not separate rules: they appear on Safe to Deploy and the matrix. | PASS WITH MINOR ISSUES |
| 35 | RLS direct CRUD cross-tenant | 12 tables, 0 rows readable; inserts and updates refused (qa). | PASS |
| 36 | Storage cross-client | qa QA36; 135 (clinical). | PASS |
| 37 | Performance | Measured at 2,000 workers, projected to 10,000 (section L1). | PASS WITH MINOR ISSUES |
| 38 | Stale READY | A suspension on a cached READY person reads NOT_READY at once (136). | PASS |
| 39 | Concurrent verify | The second decision is refused with 40001 (qa). | PASS |
| 40 | Import | Valid, invalid, duplicates, other-organisation references, malformed dates (importCsv tests). | PASS |
| 41 | Regression | Section K. | PASS |
| 42 | Security review | See QA 42 below. | — |
