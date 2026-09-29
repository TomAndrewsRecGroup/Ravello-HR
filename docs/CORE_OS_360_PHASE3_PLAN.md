# Core-OS 360 Phase 3 — People, Training, Competency, Occupational Health & Safe to Deploy

Plan, 2026-09-28. Handover and QA go in `CORE_OS_360_PHASE3_HANDOVER.md`.

The question Phase 3 must answer, with evidence:

> Is this person competent, trained, medically suitable where required,
> authorised and ready to perform this role safely today?

## 0. Pre-flight

| Check | Result |
|---|---|
| Phase 1 handover/QA | PASS WITH MINOR ISSUES; no open Critical/High |
| Phase 2 handover/QA | PASS WITH MINOR ISSUES; no open Critical/High |
| New gate finding (High): any client user could read colleagues' salary, NI, DOB, diversity, address, emergency contacts on `employee_records` | Fixed by migration 131 (PR #229, merged 2026-09-28), attack probe 24/24. **Applied after the deploy; Phase 3 builds on it.** |
| Live data | `people` 1,830 (candidates 1,806, athletes 18, employees 4 = client-admin logins, linked by 118); `employee_records`, `training_records`, `training_needs`, `skills_matrix`, `performance_reviews`, `employee_documents`, `onboarding_*`, `hs_sites`, `departments`, `offers`, `hs_tests` all **0 rows**; `dev_plans` 11 (athletes); `learning_content` 1, `learning_purchases` 0; 2 companies; 6 profiles. |

The workforce tables are empty, so the schema can be extended without migrating
data. The only live rows are the recruitment and athlete ones, which stay as
they are.

## 1. Phase 3 Current Workforce Map

| Existing | What it is today | Decision | Why |
|---|---|---|---|
| `people` (118) | One identity per person per organisation; linked from employees, candidates, athletes, logins; `person_find_or_create` matches by email within an org | **EXTEND** | Already the one identity. Add `lifecycle_status`, `engagement_type`, `primary_role_id`. `worker_type` stays (it is the context: candidate/employee/athlete…). |
| `employee_records` | HR record per employee (pay, leave, diversity; sensitive columns gated by 131) | **REUSE** | Employment data stays here. Compliance never reads its sensitive columns. |
| `candidates`, `offers`, `requisitions` | Recruitment | **REUSE** + small EXTEND | `requisitions.job_role_id` (nullable) so a hire lands on a role. Hire → person already works (118 `person_link_row` via `source_candidate_id`). |
| `athletes`, `dev_plans` (A2I) | Athletes-to-Industry context and plans | **REUSE, untouched** | Separate context (spec 112). `dev_plans` stays athlete-only; employee development goes in a new `development_items` table rather than bending A2I's shape. |
| `referral_applications` | Referral funnel | **REUSE, untouched** | History is kept on the candidate; a hired referral links through the candidate's person. |
| `training_records` (111) | Completed course per `employee_id`, free-text course, expiry | **EXTEND** | Add `person_id`, `course_id`, `provider`, `result`, `certificate_number`, verification (`verification_status`, `verified_by/at`, `rejection_reason`), `source`. `employee_id` becomes nullable, because contractors and agency workers have no employee record. Existing columns kept. |
| `training_needs`, `skills_matrix`, `performance_reviews`, `employee_documents` | Name-keyed LEAD tools (0 rows) | **REUSE; not the compliance source** | Skills matrix = self-assessed skill level. It is **not** competency (spec 19, 72). `employee_documents` gains `person_id`, and a `doc_type` is matchable as a document requirement. |
| `onboarding_templates/_template_tasks/_instances/_task_progress` | Onboarding checklist (099 chain) | **EXTEND** | Template tasks gain `gate` (`none`, `before_start`, `before_unsupervised`, `within_days`) and `gate_days`. STD reads open gated tasks. |
| `offboarding_instances` | Leaver checklist; the reminders cron terminates on `end_date` | **REUSE** + hook | On termination, assignments end, authorisations and exceptions lapse, and future requirements stop (spec 89). |
| `learning_content` / `learning_purchases` | E-learning marketplace; purchases only, no completion tracking | **REUSE, untouched** | `training_courses.learning_content_id` maps a course to e-learning. A purchase never satisfies anything (spec 56). There is no completion signal today, so an e-learning completion is recorded as a `training_records` row with `source = 'elearning'` and verified like any other. |
| `hs_tests` (116) | Staff-run tests; a pass may write `training_records` | **REUSE** | Its `training_records` insert gains `person_id`. A passed test is training evidence, never competency. |
| `hs_sites`, `departments` (118) | Sites and departments | **REUSE** | Site requirements hang off `hs_sites`. There is no area model, so area requirements are not built (spec 10: "where necessary"). |
| `coshh_assessments`, `risk_assessments`, `hs_incidents`, `actions` (Phase 2) | Safety records | **REUSE** + human-confirmed links | COSHH health surveillance, RA controls, incidents and corrective actions can create workforce requirements **by an explicit human action**, never inferred (spec 44–46, 85–86). |
| `access_roles`/`access_capabilities` (117, 122) | Permission model | **EXTEND** | New capabilities and one new access role (below). |
| `incident_training_checks` (130) | Training evidence at incident date | **REUSE** | Joined by `person_id`; reads the extended `training_records`. |
| Medical fields | None exist anywhere | **NEW** | Built separated (§5). |

Nothing is REPLACED or DEPRECATED. Every existing feature keeps working on
its own tables.

## 2. Person architecture

- **One `people` row per person per organisation**, as 118 built it. Contexts
  (candidate, employee, contractor, athlete…) link to it. It is never
  duplicated or auto-merged.
- `lifecycle_status`: `prospect | candidate | offer | pre_employment | active
  | leave_of_absence | notice | leaver | former_worker | archived`. Backfilled
  from `worker_type`/`employment_status`. Employment status is not compliance
  status.
- `engagement_type`: `permanent | fixed_term | contractor | agency | casual |
  apprentice | consultant | volunteer | trainee | temporary`. It never weakens
  a requirement (spec 66).
- `person_private` holds `personal_email`, `personal_phone`, and is readable
  with `hr.sensitive.read`. It is not selectable through `people`.
- A person needs no login. `people.user_id` links one (unique). Deleting a
  login nulls the link and keeps the person. Deleting a person never touches
  `auth.users`.
- **Duplicate detection** (`person_duplicate_candidates(org)`): same email,
  same employee number, or same name + start date. It lists pairs and
  merges nothing.

## 3. Requirements engine

- **`job_roles`**: the operational role, not a title. Named `job_roles`
  because `access_roles` already means permission roles, and one word for
  two things is how the wrong table gets joined. It has a `safety_critical`
  flag.
- **`role_assignments`**: person × role × optional site/department, with
  `primary_assignment`, dates and status. Several assignments combine.
- **Requirement catalogues**, one per kind, each org-owned or global
  (`organisation_id` null, staff-maintained):
  - `training_courses` (distinct from the marketplace);
  - `competencies` + `competency_levels` (configurable, ordered per org, seeded Awareness → Assessor);
  - `credential_types`, with `kind` in `qualification | certification | licence | card | permit`. One configurable model, no hardcoded UK list;
  - `induction_templates`;
  - `occupational_health_requirements`;
  - `authorisation_types`;
  - `ppe_types`;
  - `pre_employment_check_types`.
- **Requirement rules**: `role_requirements`, `site_requirements`,
  `person_requirements` (individual / incident / corrective-action / COSHH /
  RA sourced). Same columns:
  - `requirement_type`, `reference_id`;
  - `min_level_id` (competency);
  - `mandatory`, `safety_critical`;
  - `evidence_required` (verified evidence only);
  - `allow_elearning`, `validity_months`, `grace_days`;
  - `effective_from`/`effective_until`, `source_type/source_id`, `notes`.
- **Versioning**: once a rule is effective, its meaning (type, reference,
  level, validity, flags) cannot be edited. Changing it ends the old row and
  inserts a new one (`requirement_supersede()`), so a past date is always
  judged by the rule in force then (spec 105–107). A trigger enforces this.
- **Consolidation**: `person_requirement_set(person, as_of)` unions the
  active rules from every active assignment's role, its site, and the
  person, keyed by `(type, reference)`. Where duplicates exist it keeps the
  strictest: mandatory ∨, safety_critical ∨, highest level, shortest
  validity, evidence ∨. It lists every source that asked for it.
  **Nothing is materialised**, so nothing can go stale.
- **Clone**: `job_role_clone(role, new_title)` copies the rules into a new
  role with its rules inactive (`effective_from` null) until reviewed and
  activated (spec 104).

## 4. Evidence

| Kind | Table | Satisfied on `as_of` when |
|---|---|---|
| Training | `training_records` (extended) | latest record for the course completed ≤ as_of, not rejected; if `evidence_required`, `verified`; expiry (record's own, else completion + rule validity) ≥ as_of. E-learning counts only if the rule allows it and the record is verified. |
| Competency | `person_competencies` (**insert-only history**) | latest assessment at or before as_of is `verified`, level ≥ required, not expired, and no suspension covers as_of. **Training never satisfies competency** (spec 19; a test pins it). |
| Credential (qualification/certification/licence/card/permit) | `person_credentials` | verified, issue ≤ as_of, expiry null or ≥ as_of |
| Induction | `induction_completions` | completed ≤ as_of and re-induction date null or ≥ as_of |
| Occupational health | `person_health_outcomes` (summary) | latest outcome ≤ as_of is `fit` → met; `fit_with_restrictions` → met **with restrictions** (conditional); `temporarily_unfit`/`unfit` → unmet; `further_assessment_required` → review; `next_due_at` < as_of → unmet |
| Authorisation / permit | `person_authorisations` (+ `authorisation_suspensions`) | active, issued ≤ as_of, not expired, no suspension covering as_of |
| Document | `employee_documents` (`person_id` + `doc_type`) | status active, expiry null or ≥ as_of |
| PPE | `ppe_issues` | issued ≤ as_of, replacement due null or ≥ as_of |
| Pre-employment check | `pre_employment_checks` | `verified` or authorised `waived` (`failed` → unmet) |
| Onboarding gate | `onboarding_task_progress` + template gate | gate tasks done (`before_start` from the start date; `within_days` after N days) |

- **Suspensions are rows**, never edits: `competency_suspensions` and
  `authorisation_suspensions` have from/to, reason and the actor.
  Reinstatement sets `lifted_at`. The history is complete (spec 83–84).
- **Verification**:
  - Certificates and evidence uploaded by an admin, an employee
    (self-service) or a consultant start `unverified`.
  - Verification needs `training.verify` / `competency.verify` in the
    record's organisation. For safety-critical requirements the verifier
    cannot be the submitter.
  - Verification is a conditional counted update, so two verifiers cannot
    both win (spec 39).
- **Evidence files**: `workforce-evidence` private bucket, keys
  `<org>/<entity>/<id>/<uuid>-<name>`. Storage reads inherit row RLS, as
  `hs-evidence` does.

## 5. Occupational health and clinical separation

- `occupational_health_requirements` is the catalogue: audiometry,
  respiratory, HAVS, skin, night-worker, safety-critical medical, driver
  medical, fitness-for-task. `person_health_requirements` are explicit ones.
  Role, site, COSHH and RA ones arrive through the rule tables.
- `person_health_outcomes` is the **operational summary only**: outcome,
  assessment date, provider name, restriction summary (operational wording),
  review / next-due date, evidence reference. It has **no diagnosis column**.
  - Readable with `occupational_health.summary.read`.
  - Written with `occupational_health.manage`.
- `occupational_health_clinical` holds clinical notes and documents.
  - Readable and writable **only** with `occupational_health.clinical.read`
    / `.manage` (the new `occupational_health_advisor` role, platform staff).
  - Its own private bucket `oh-clinical`.
  - No outbox whitelist, audit value, notification or timeline ever carries
    its text. Tests pin this.
- Managers and HSE without the summary capability see only what STD
  exposes: "Health surveillance: not met / met with restrictions — contact
  OH". There is no restriction text and no clinical detail.

## 6. Safe to Deploy (deterministic)

`person_deployment_status(person, as_of default now())` → `{status,
reasons[], requirements[]}`:

1. Person not found, or caller may not see them → error (42501).
2. `lifecycle_status` not in (`pre_employment`, `active`, `notice`) →
   **NOT_READY** ("not an active worker").
3. No active role assignment → **REVIEW_REQUIRED** ("no role assigned —
   requirements cannot be established").
4. For every requirement in `person_requirement_set`, evaluate §4 →
   `met | met_with_restrictions | expiring | unmet | review`. A live
   `requirement_exception` covering it turns `unmet` into `excepted`.
   - Exceptions need an approver with `deployment.exception.approve`,
     other than the subject, plus a reason and an expiry (≤ 90 days).
   - They are never permanent, are audited, and lapse on their own.
   - A safety-critical requirement can be excepted only by that capability.
     Nothing ignores it silently.
5. Pre-employment checks and onboarding gates are evaluated as mandatory
   requirements.
6. Result:
   - any `unmet` (mandatory) → **NOT_READY**;
   - else any `review` → **REVIEW_REQUIRED**;
   - else any `excepted` or `met_with_restrictions` → **CONDITIONALLY_READY**;
   - else **READY**.

   Non-mandatory unmet items are listed but never block.
7. Any error while evaluating → **REVIEW_REQUIRED** with the error class,
   never READY (spec 109). Conflicting evidence → REVIEW_REQUIRED (spec 110).
   Conflicts are, for example, two current assessments at the same date with
   different verification, or an unknown reference.

Every reason names the requirement, the source (role / site / person), the
evidence date and why. There are no scores and no prediction.

**Never stale** (spec 116):
- `person_deployment_cache` holds `status`, `reasons`, `computed_at`,
  `valid_until`. `valid_until` is the earliest future expiry or grace edge.
- Triggers on every input table mark the affected people dirty.
- Readers (`workforce_readiness(org)`) use a cache row only when it is clean
  and `valid_until > now()`; otherwise they compute live.
- The reminders cron recomputes dirty and stale rows. Each transition goes
  to `deployment_status_log` (insert-only; from, to, reason summary, no
  clinical detail) and emits `person.safe_to_deploy.changed`.

**History**: `as_of` evaluates every table by its own dates, so "was she
compliant on 15 March 2026?" is answerable. The log is a record, not the
truth (spec 107–108).

## 7. Recruitment and lifecycle integration

- **Hire**: the 099 `startEmployment` path already creates the employee with
  the candidate's person. Then:
  - `person_lifecycle_sync` sets `pre_employment`, or `active` on the start
    date;
  - if the requisition has `job_role_id`, a primary role assignment is
    created, keyed so it runs once;
  - onboarding starts as before.

  Pre-employment checks come from the role's `pre_employment` rules.
  "Offer accepted" never means deployable (spec 62).
- **Role change / site transfer**: end the assignment and create another.
  The history stays. `role_change_preview(person, new_role)` returns "the new
  role introduces N new mandatory requirements".
- **Leaver** (reminders cron `employee_terminated`):
  - assignments get `end_date`;
  - live exceptions and authorisations lapse;
  - lifecycle moves to `leaver`;
  - everything stays.
- **Returner**: a new assignment. Expired evidence stays expired (spec 90).
- **Contractor workers** are people with `engagement_type = contractor` and
  an optional `contractor_company` text. Each person's compliance stands
  alone. The full contractor company model is Phase 4.
- **Incident** (a human, `incident.investigate`), from the incident page:
  - request reassessment (a person requirement sourced to the incident);
  - suspend an authorisation or competency;
  - assign training;
  - create a development item.

  Nothing happens automatically.
- **Corrective action** → training requirements for named people (human).
- **COSHH** (`health_surveillance_required`) and **RA control** → a site or
  role requirement proposed from the source record. It is created only when a
  person confirms the scope. It never applies to the whole organisation by
  default.

## 8. Permissions (migration additions)

**New capabilities:**
- `workforce.read` (org-wide compliance view)
- `workforce.manage` (roles, requirements, assignments, catalogues)
- `training.verify`
- `competency.assess`
- `competency.verify`
- `occupational_health.summary.read`
- `occupational_health.clinical.read`
- `occupational_health.manage`
- `deployment.exception.approve`

**New access role:** `occupational_health_advisor` (legacy `client_editor`).

**Team scope** — `person_visible(person)` is true for:
- `workforce.read` in the person's organisation;
- the person's manager (`people.manager_id` = my person);
- the manager of their assignment's site (`hs_sites.site_manager_id`) or department (`departments.manager_person_id`);
- the person themselves (`people.user_id = auth.uid()`);
- staff.

Every new person-keyed table uses it. `site_manager` and `department_manager`
therefore see only their team on the new tables (spec 49). Their existing
Phase 1 `people.read` is unchanged, because widening or narrowing it is out
of scope.

**Every new client-writable table:**
- RLS on;
- `apply_write_guard`;
- same-org triggers;
- audit rows with a whitelist (no notes, restrictions or clinical text).

## 9. Delivery order

1. 132 foundation: people columns, capabilities/role, `job_roles`, assignments, catalogues, requirement rules, versioning, `person_visible`, audit.
2. 133 evidence: training_records extension, competencies + history, credentials, inductions, authorisations, PPE, pre-employment checks, onboarding gates, exceptions, storage.
3. 134 occupational health: summary/clinical split, bucket.
4. 135 STD engine: requirement set, evaluators, status function, cache + invalidation, log, readiness, historical.
5. 136 integration: hire → assignment, lifecycle sync, leaver, incident/action/COSHH/RA RPCs, duplicate detection, search, reminders feed.
6. Portal UI:
   - Workforce (dashboard, people, person profile, matrix, roles & requirements, catalogue, sessions, import, exceptions);
   - self-service;
   - print;
   - CSV.
7. Tests, live probes (RLS, clinical, STD, recruitment flow, contractor, bulk cross-tenant, volume), QA 1–44, gate, handover.

**Phase 4 is not started.**
