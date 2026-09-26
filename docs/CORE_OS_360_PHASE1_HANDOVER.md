# Core-OS 360 — Phase 1 Handover and QA Report

**Date:** 2026-09-26 · **Branch:** `claude/optimistic-albattani-uezht8`
**Plan written before any change:** `docs/CORE_OS_360_PHASE1_PLAN.md`
**Live database:** Supabase project `sbmekaviwkiyorvmtgcu`. Migrations 117–121 are **applied**.

---

# PART 1: SENIOR ENGINEER HANDOVER

## A. Repository audit summary (before Phase 1)

- **Apps.** There are two Next.js 15 apps on one Supabase project.
  - **Admin** is staff only (`tps_admin`).
  - **Portal** is for clients.
- **Schema and logic.** There are 116 migrations and about 100 tables with RLS on. There are 12 Vercel crons and a `platform_events` outbox with a rule engine.
- **Tenancy was one column: `company_id`.** Each user belonged to exactly one company, through `profiles.company_id`.
  - Isolation depended on three SECURITY DEFINER helpers: `my_company_id()`, `is_tps_staff()` and `is_company_super_user()`.
  - **43 older policies bypassed those helpers.** They inlined `profiles` subqueries instead.
  - **Those same policies gave the `tps_client` demo role cross-company read/write access** to employee records, onboarding/offboarding, leave, policy acknowledgements, calendar and profiles. No `tps_client` user exists, so this was a latent grant.
- **Live data (exact counts).**

  | Data | Count |
  |---|---|
  | Referral applications | 1,918 |
  | Candidates | 2,634 |
  | Referral scan runs | 480 |
  | Email log rows | 1,724 |
  | Athletes | 18 |
  | Development plans | 11 |
  | Partners | 6 |
  | Companies | 2 |
  | Logins | 6 (2 staff, 4 client admins) |

  The HR, H&S, actions, documents and billing tables were almost empty (0–15 rows each).
- **Things that did not exist before this phase:**
  - no consultancy model, sites beyond an empty `hs_sites`, or departments;
  - no unified person identity;
  - no persisted audit trail (`auditLog()` only wrote to the console);
  - no document version history;
  - no capability model.

## B. Preservation report

| Protected system | Status | Why / what changed |
|---|---|---|
| Referrals | **Preserved** | Tables, cron, gates, idempotency, statuses and emails are all untouched. It gained a nullable `candidates.person_id`, filled by a trigger that **cannot fail an insert**, and an audit row on every status change. The cron ran `ok` at 10:00 UTC after 117. The first run after 118–121 is 11:00 UTC; see I. |
| Athletes to Industry | **Preserved** | Unchanged apart from a nullable `athletes.person_id` (backfilled for all 18) and audit rows. One policy (`training_interests_client_rw`) was rewritten with the same meaning. |
| Development Plans | **Preserved** | Two client-read policies were rewritten with the same meaning. No schema change. |
| E-Learning | **Not touched** | `learning_checkout` now charges the organisation the user is currently working in, which is still their home organisation unless they hold a grant. |
| Broadcast | **Preserved + strengthened** | Same flow. Its audit record now lists the exact recipient `company_ids` and is written to the immutable `audit_events` table. |
| Billing / invoicing | **Preserved** | Stripe code is untouched. `one_off_invoices` gained `billing_source` / `billing_provider` / `external_reference` (defaults `one_off` / `stripe`). Two policies were rewritten, dropping only `tps_client`. |
| HR (records, leave, onboarding/offboarding, reviews, training, policy acks, calendar) | **Preserved + migrated** | The 43 policy rewrites cover these tables with the same meaning. Employee records gained `person_id`, `department_id` and `site_id`. Policy acks gained evidence fields (see C). |
| Recruitment | **Preserved** | Four portal routes and pages now read the **active** organisation rather than `profiles.company_id`. For every existing user these are the same value. |
| Client service delivery | **Preserved** | Actions gained lifecycle columns. Service requests are untouched. |
| Existing H&S | **Preserved** | `hs_sites` was **extended**, not replaced, and every H&S FK still points at it. Incidents are now audited. |
| Notifications, email, feature flags, menu customisation, public routes | **Not touched** | The policy-link route now records IP and user agent. |

## C. Architecture summary

**Tenancy.** `companies` remains the physical tenant table, and `organisations` is a `security_invoker` view over it.
- `organisation_id` ≡ `company_id`, so no id, FK or row moved.
- `companies` gained these columns: `legal_name`, `organisation_type`, `parent_organisation_id`, `company_number`, address fields, `country`, `primary_contact_id` and `updated_at`.
- `organisation_type` is one of: `platform_owner | consultancy | direct_client | subsidiary | group_company | business_unit`.

**Consultancy relationships.** The `organisation_relationships` table holds these. Its types are `consultancy_client | group_parent | subsidiary | service_provider | partner`, each with a status and a validity window.
- A consultancy **serves** a client. It does not own it.
- Legal hierarchy is the separate `parent_organisation_id`.

**Consultant access: an explicit grant plus one ACTIVE organisation.**
- `user_organisation_access` records a grant: user, organisation, role, scope, validity window and status.
- `user_active_organisation` records which single organisation the user is acting in. It is written only through `set_active_organisation()`, which requires a live grant and writes an audit row.
- `my_company_id()` returns the active organisation **only while its grant is live**, and otherwise the home company. It re-checks the grant on every call, so revocation and expiry take effect on the next query.
- **Every one of the ~140 existing policies, every storage policy and every portal query therefore became consultant-aware without being widened.** A consultant sees exactly one client at a time, and that client is named on screen.

**Permissions.** These are capability-based.
- **Catalogue:** `access_roles` (15 roles, covering the spec's 14 plus `organisation_editor`), `access_capabilities` (24) and `access_role_capabilities`.
- **Legacy mapping:** `legacy_role_map` maps legacy enum roles to catalogue roles. At a consultancy, `client_admin` becomes `consultancy_owner` and `client_editor` becomes `consultant`.
- **Check:** `has_capability(org, cap)` is the database check.
- **TypeScript mirror:** `lib/auth/capabilities.ts`. It is a shared pair across the two apps, and a test pins it to the SQL both ways.
- **Grant roles:** each grant role maps to a legacy role (`consultant` → `client_editor`), so the existing checks keep working inside a client.
- **Who can grant:**
  - Staff can grant anything.
  - A consultancy owner can grant only their own people, only the roles `consultant`, `hse_manager`, `hse_advisor` and `read_only`, and only on clients with a live `consultancy_client` relationship.
- **Read-only:** a `read_only` grant is enforced by **RESTRICTIVE** policies (`write_guard_ins/upd/del`) on 99 tables plus `storage.objects`.

**Person model.** The `people` table holds identity and placement only, with no sensitive HR fields.
- `user_id` is nullable and unique, so a person does not need a login.
- `employee_records`, `candidates` and `athletes` gained `person_id`. It was backfilled (1,806 people; 2,634 candidate rows deduplicated by email to 1,784 people within each organisation) and is kept filled by exception-safe triggers.
- A hire keeps the candidate's person (candidate → employee), and a leaver becomes `former_employee`.
- **People RLS is derivative:** you see a person only if you can see a linked row, or the person is your own workforce and you hold `people.read`. An unshared applicant therefore stays hidden as a person too.

**Sites and departments.**
- `hs_sites` gained `site_code`, `site_type`, `country`, latitude/longitude, `operating_hours`, `site_manager_id` and `hse_lead_id`. A `sites` view sits over it.
- The new `departments` table covers both `kind = department` and `kind = operational_area`. Departments can nest and can be tied to a site.
- Same-organisation integrity is enforced by trigger on every link.

**Actions.** `actions` is the universal action table.
- It gained `site_id`, `source_type`/`source_id`, `assigned_to`/`assigned_person_id`, `severity`, `completed_by`, `completion_evidence`, `verified_by/at`, `cancelled_at/reason` and `created_by`.
- The status CHECK only **gains** `cancelled`.
- A lifecycle trigger stamps completion, clears completion and verification when an action is reopened, and refuses self-verification.
- `action_register` is the single read model across `actions` and `internal_tasks`, with `is_overdue` computed at read time.
- Migration 120 lets anyone holding `actions.assign` raise an action in their active organisation. Before this, only staff could.

**Audit.** `audit_events` is append-only.
- `INSERT/UPDATE/DELETE/TRUNCATE` are revoked from every role **including `service_role`**. An immutability trigger also blocks the table owner.
- It is written by `audit_row()` triggers with **column whitelists** (no salary, NI number, notes or free text) on 15 tables, and by the `audit_log()` RPC (service role only).
- `auditLog()` in the admin app now persists to it.
- Each row records the actor kind (staff/client/consultant/system), plus IP and user agent when PostgREST supplies them.

**Events.** `platform_events` is kept as the processing outbox, unchanged.

**Documents.**
- **Versions:** `document_versions` snapshots every file a `documents` row has ever pointed at. Replacing a file bumps the version and supersedes the old row. Deleting a document keeps its versions. Versions are written only by trigger and cannot be written by any session.
- **Policy acknowledgements** gained `person_id`, `document_version_id` (the version current **at signing**, set by the database), `ip_address`, `user_agent` and `auth_evidence`.

**Search.** `search_records(q)` is **SECURITY INVOKER**, so it runs under the caller's RLS. It covers 15 entity types and has trigram indexes. Admin GlobalSearch uses it; it previously queried the retired `tickets` table.

**Portal UI.**
- `OrganisationBar` shows the home organisation and "Viewing: <client>", plus a switcher. It renders **only for users with more than one organisation**, so every current client sees no change.
- Switching sends a POST to `/api/organisation/switch`. The server drops the signed session cookie, and the browser then does a **full navigation**, so no cached rows, modal or unsaved form survive.
- The layout re-checks the effective organisation against the database on every render, and drops a stale cookie if it disagrees.

**Admin UI.** `/organisations` ("Organisations & Access", under Clients in the sidebar) lets staff:
- set organisation type and parent;
- add or end relationships;
- grant and revoke access.

Every write on this page goes through staff RLS or the audited RPCs.

## D. Database migration report

| File | Purpose | Tables affected | Data migration | Rollback |
|---|---|---|---|---|
| `117_core_tenancy.sql` | Organisation columns + `organisations` view; relationships; capability catalogue; grants; active organisation; effective helpers; write guard; `audit_events` + 10 audit triggers; 43 policy rewrites | companies, organisation_relationships, access_*, legacy_role_map, user_organisation_access, user_active_organisation, audit_events, 99 tables (guard policies), 21 tables (rewrites) | None (defaults only) | Drop the new tables, view and `write_guard_*` policies. Restore the 5 helpers from 044/029/049. Re-create the 43 policies from the pre-117 `pg_policies` snapshot. Everything is additive except the policy text. |
| `118_sites_departments_people.sql` | Site fields + `sites` view; departments; people; `person_id` links; triggers; backfill | hs_sites, departments, people, employee_records, candidates, athletes, companies, profiles (trigger) | 1,806 people created; `person_id` set on every candidate and athlete | Drop the triggers, the `person_id` columns, `people` and `departments`. Source rows are untouched. |
| `119_actions_documents_search.sql` | Universal action columns + lifecycle; `action_register`; `document_versions`; policy-ack evidence; billing source/provider; `search_records`; pg_trgm | actions, document_versions, documents (triggers), policy_acknowledgements, one_off_invoices | Snapshot of existing documents (0 rows) | Drop the added columns, triggers, view and table. Restore the old status CHECK only if no row is `cancelled`. |
| `120_actions_capability_insert.sql` | Capability-gated client INSERT on actions (found by the probe) | actions | None | Drop the policy. |
| `121_audit_immutable_search_path.sql` | Advisor hygiene | function | None | `ALTER FUNCTION … RESET search_path` |

The existing migration history is untouched.

## E. Security report

- **Tenancy isolation** is proven at the database layer by a live probe (see QA §9 and §10).
  - The fixtures were the spec's own: Laws Safety, ABC, XYZ, Independent, a platform admin, a Laws owner, a consultant, a read-only consultant, an ABC admin, an XYZ HSE manager and an Independent admin.
  - Every check ran as `authenticated` with forged JWT claims, in a rolled-back transaction on production.
- **RLS:** every new table has RLS on. There are no session write paths on grants, the active organisation, the audit trail or document versions.
- **Closed:** the latent `tps_client` cross-company grant, in 43 policies.
- **Permissions and escalation:**
  - These are refused: self-grant, cross-consultancy grant, non-consultancy role grant, direct grant INSERT, direct active-organisation write, self-promotion, changing your own `company_id`, and editing or deleting the audit trail (including as the service role).
  - Read-only grants cannot INSERT, UPDATE, DELETE or upload.
- **Public endpoints:** athlete sign-up, partner enquiry, leave, policy, test and set-password links are **unchanged**.
  - Policy acknowledgements now record IP, user agent and method.
  - `/api/organisation/refresh` always redirects to `/dashboard`, so it cannot be used as an open redirect.
- **Storage:** every existing folder policy keys on `my_company_id()`, so a consultant reads only the active client's folder. A read-only grant cannot upload. Guessed paths from another tenant return 0 rows.
- **Service role** is still server-only. No new code uses it from the browser. The new `auditLog` persistence runs server-side only.
- **Supabase advisor after DDL:**
  - The remaining WARNs are intended: the RLS-helper RPCs are callable by signed-in users and each is scoped to `auth.uid()`.
  - `handle_new_user` and `rls_auto_enable` are flagged as anon-executable. They are trigger and event-trigger functions and cannot be invoked through PostgREST. Their grants were left alone rather than risk breaking sign-up.
  - **External:** "Leaked password protection" is disabled in Supabase Auth. It needs a dashboard toggle.

## F. Regression report

These are the results of automated tests plus live database probes. Browser-level runs are listed separately in QA §2.

| Area | Result | Evidence |
|---|---|---|
| Referrals | **PASS (DB + unit)** | Duplicate applicant gives 1 person. `UNIQUE(manatal_candidate_id, requisition_id)` still refuses. Claim-then-send counts 1 then 0. Statuses run downstream to `paid`. Status changes are audited. Clients cannot see unshared applicants. Existing suites all pass: `pipelineIdempotency`, `gate`, `approve`, referrals route. |
| A2I | **PASS (DB + unit)** | Sign-up creates an athlete linked to a person, visible to its own client only. Partner interest and dev plan inserts work. Existing athlete and route suites pass. |
| Development Plans | **PASS (DB)** | The client sees its own active plan and milestones. Another client sees neither. |
| E-Learning | **PASS (DB)** | The published catalogue is readable. The paid path is **BLOCKED — external** (see I). |
| Broadcast | **PASS (DB + unit)** | Clients A and B each see exactly their own copy. Unselected client C gets nothing. There is one audited action per recipient. |
| Billing | **PARTIAL.** The DB path passes; the Stripe path is **BLOCKED — EXTERNAL CONFIGURATION** | The invoice insert shape is still valid, the client reads its own invoice, other clients cannot, and creation is audited. |
| HR | **PASS (DB + unit)** | The 43 rewritten policies were re-verified. The existing users' baseline was identical before and after 117. |
| Recruitment | **PASS (unit)** | The Manatal move-stage suite was re-run against the effective-organisation lookup. |
| H&S | **PASS (unit + DB)** | All H&S suites pass. `hs_sites` was extended in place. |

**Totals:**
- Admin: **913/913** tests, including 28 new ones.
- Portal: **278/278** tests, including 11 new ones.
- `tsc` is clean in both apps.
- All five CI guards pass.
- Both production builds compile.
- Live probes:

  | Probe | Result |
  |---|---|
  | Tenancy | 72 checks plus 2 corrected checks, all PASS |
  | Document versions | 8/8 PASS |
  | Protected regression | 26/26 PASS |

## G. Existing data report

**All existing rows were preserved.** No table was dropped, no row deleted and no id changed.

- 1,918 referral applications, 2,634 candidates, 18 athletes, 11 plans, 2 companies and 6 profiles were re-counted after the migrations.
- The only data **written** was new: 1,806 `people` rows, `person_id` on candidates and athletes, and default values in new columns.
- The existing users' visible data was identical before and after (baseline query run both times).

## H. Technical debt (explicit)

1. **`role === …` checks in app code were not rewritten to capabilities.** There are about 30 portal sites (listed in the plan audit). The database is the boundary, so this is UI courtesy only.
   - Consequence: a `read_only` consultant can see Save buttons whose writes the database refuses with a 42501.
2. **`access_scope` (full/health_safety/hr/recruitment) is recorded but not enforced.** Only the role is enforced.
3. **Consultancy owners have no portal UI for granting access.** The RPC supports it and is probe-tested; today only the staff UI exists.
4. **`people` is fed one way.** Changes to a source row's name or email are not synced back to the person. There is no retention or erasure path for orphaned people.
5. **The physical rename (`companies` → `organisations`, `hs_sites` → `sites`) is deferred.** Views carry the new names for now.
6. **Write cost:** Phase 1 triggers add about 1.2 ms per inserted action or candidate (measured on 5k rows: 0.41 → 1.57 ms/row). At current volumes that is negligible.
7. **Unfiltered `count(*)` over 100k actions takes 328 ms.** This is caused by the pre-existing `company_id = … OR is_tps_staff()` policy shape. Org-filtered pages take 1–66 ms.
8. **Broadcast has no idempotency key.** A double submission creates duplicate actions and emails. This was pre-existing.
9. **There is no optimistic locking.** Two people editing the same employee means the last write wins. This was pre-existing.
10. **Portal onboarding reads the home `profiles.company_id`,** which is correct for its purpose. `Settings → team` lists the active organisation's users.
11. **`referral_applications` audit rows carry no `organisation_id`.** The trigger was given `'-'`; `company_id` exists and could be used.
12. **The spec's full target navigation (§33) is not implemented.** The information architecture is prepared (catalogue, organisations, sites, people), but pages were not moved, deliberately, to avoid regressions.

## I. Blockers

| Item | Type |
|---|---|
| Stripe test-mode run (subscription, retainer, one-off invoice, Pay Now, portal) | **EXTERNAL CONFIGURATION BLOCKER.** There are no Stripe test keys in this sandbox and the Stripe connector is unauthorised. Not marked PASS. |
| Live Manatal / IvyLens / Resend calls | **EXTERNAL.** They were not exercised live from the sandbox; the existing mocked suites pass. |
| Browser run of the switcher on a deployed preview | **EXTERNAL.** There are no Supabase credentials in the sandbox build. |
| Supabase "Leaked password protection" | **EXTERNAL CONFIGURATION.** It is a dashboard toggle. |
| First referral cron run after 118 (candidate person-link trigger) | Pending at 11:00 UTC. Check `referral_scan_runs` for `ok`. |
| Code defects | **None known open.** |

## J. Phase 2 readiness

**Phase 2 can safely begin on the database foundation**, provided two things hold:
- the 11:00 referral run records `ok`;
- someone clicks through the switcher once on the Vercel preview with a real consultant grant.

No Critical or High issue remains open.

---

# PART 2: SENIOR TEST ENGINEER / QA REPORT

I did not take the implementation's word for anything. Every claim below is backed by an executed test or probe, or it is marked otherwise. Probes are in `supabase/probes/117_119_phase1_tenancy.sql`, `119_document_versions.sql` and `117_121_protected_regression.sql`. Each ends in `RAISE`, so nothing persisted; this was verified afterwards.

## 1. Requirements traceability

| # | Requirement | Implementation | Automated test | Live probe / manual | Result |
|---|---|---|---|---|---|
| 1 | Repository audited | Plan doc | — | Live `pg_policies` / `pg_proc` / counts read | PASS |
| 2 | Preservation manifest honoured | §B | Full suites | Regression probe | PASS |
| 3 | Protected systems work | — | 913 + 278 | 26/26 | PASS (Stripe BLOCKED) |
| 4 | Multi-tenant organisation structure | 117 | tenancySql | Fixtures created | PASS |
| 5 | Consultancy relationships | 117 | tenancySql | "ABC sees only Laws→ABC" | PASS |
| 6 | Client isolation | helpers + rewrites | tenancySql | A↛B, B↛A, C↛A, XYZ↛Laws | PASS |
| 7 | Consultant cross-client access | grants + active org | switch route test | Laws→A ✓, Laws→B ✓, Laws→C denied | PASS |
| 8 | Sites | 118 | tenancySql | Fixture sites | PASS |
| 9 | Departments / operational areas | 118 | — | Same-org trigger | PASS (not exercised through a UI) |
| 10 | Person model | 118 | tenancySql | Employee without login; consultant login linked | PASS |
| 11 | Existing employees/candidates/athletes function | links + triggers | Suites | Regression probe | PASS |
| 12 | Authentication works | Unchanged | Middleware suites | Baseline identical | PASS |
| 13 | RLS secure | — | tenancySql | 74 checks | PASS |
| 14 | Capability foundation | 117 + capabilities.ts | Parity test (5 mutations caught) | Owner/consultant capabilities | PASS |
| 15 | Universal actions | 119/120 | tenancySql | Create, cross-tenant refusal, self-verify refused | PASS |
| 16 | Audit trail | 117 | tenancySql | Grants/switch/employee/invoice audited; erase refused | PASS |
| 17 | Event architecture | 096 kept | Existing suites | process-events `ok` after apply | PASS |
| 18 | Storage secure | Existing policies + guard | — | Guessed path 0; read-only upload refused | PASS |
| 19 | Document versioning | 119 | tenancySql | 8/8 | PASS |
| 20 | Notifications | Unchanged | Suites | — | PASS |
| 21 | Feature flags | Unchanged | moduleAccess suites | — | PASS |
| 22–30 | Protected modules | — | — | See F | PASS / BLOCKED (Stripe) |
| 31 | No cross-tenant leakage | — | — | 0 leaks in all probes | PASS |
| 32 | No high-severity defect | — | — | — | PASS |
| 33–34 | Tests pass | — | 1,191 tests | — | PASS |
| 35 | Production builds | — | Both builds | — | PASS |
| 36 | Phase 2 can build on this | — | — | — | PASS WITH CONDITIONS |
| 34a | Organisation switcher UI (§35) | OrganisationBar + switch/refresh | 11 portal tests (2 mutations caught) | Browser | **NOT VERIFIED in browser** |
| 54 | Test fixtures, not in production | Probe only | — | Verified 0 residue | PASS |

## 2. Legacy preservation tests

These run at the database and route-handler layers. The UI click-through is **NOT VERIFIED**, because the sandbox has no deployed environment with credentials.

## 3. Referrals

**Tested:**
- duplicate prevention;
- the idempotent claim;
- the downstream stages through `fee_due` → `paid`;
- history retention (audit plus `status_history`, unchanged);
- dry-run, country, criteria and score gates, review, approve and reject, email failure and scan failure. These gates are covered by the existing suites (`gate.test.ts`, `pipelineIdempotency`, `approve.test.ts`, referrals routes), all of which pass.

**No duplicate or wrong-recipient path was found.** Live cron: `ok` at 10:00 after 117.

## 4. A2I

Correct tenant allocation, a linked person, and isolation from another client all **PASS**. The CV upload and welcome-email sends are covered by the existing suites. No live sends were made.

## 5. Development Plans

Client visibility and isolation **PASS**. Edit, email and print are unchanged code, and their suites pass.

## 6. E-Learning

The catalogue **PASS**. The paid path is **BLOCKED — external**.

## 7. Broadcast

Three clients were created and two selected. Each selected client sees exactly its own copy, and the third receives nothing. The audit shows one action per recipient, and the audit metadata now lists `company_ids`. **PASS.** No cross-client messaging: the email recipient query filters on `company_id IN (selected)` and `role = client_admin`, which is unchanged.

## 8. Billing

**BLOCKED — EXTERNAL CONFIGURATION** for Stripe. The DB and RLS path **PASS**.

## 9. Multi-tenancy

| Case | Result |
|---|---|
| Laws→A | allowed |
| Laws→B | allowed |
| Laws→C | **denied** (42501) |
| A→B | denied |
| B→A | denied |
| C→A | denied |

Tested through direct UUID replacement in UPDATE and DELETE (0 rows) and a wrong-tenant INSERT (refused). All at the database, **PASS**.

## 10. RLS

SELECT, INSERT, UPDATE and DELETE were attempted directly against Supabase for unauthorised organisations, and all were refused. **PASS.**

## 11. Consultant access

| Case | Result |
|---|---|
| Grant | PASS |
| Revoke (immediate fallback) | PASS |
| Temporary 7-day grant | PASS |
| Expired grant | PASS |
| Role change to read_only takes effect | PASS |

## 12. Privilege escalation

These were all refused:
- employee → admin;
- client admin → platform admin;
- consultant → self-grant, colleague grant, or change of own company;
- read-only → write, upload or delete;
- a consultancy granting an outsider, a non-client or a non-consultancy role.

**PASS.**

## 13. Organisation switching

**Tested:**
- The server clears the cookie and refuses an organisation without a grant with one generic 403.
- A failed database read never causes a redirect loop.
- The layout treats a stale cookie as stale.

**Rapid switching and modal/unsaved-form behaviour were not tested in a browser.** The design uses a full navigation on every switch, so no React state survives. **PARTIAL.**

## 14. Person model

**PASS:**
- employee without a login;
- contractor without a login;
- athlete and candidate without a login;
- consultant with a login;
- former employee (trigger).

## 15. Storage

**PASS:** another tenant's guessed path, a consultant scoped to the active client, and a read-only upload refused. Signed URLs are issued by existing code; that code was not re-attacked.

## 16. Public routes

**NOT VERIFIED beyond the existing suites.** Those suites cover hashed, single-use and expiring tokens, bounded bodies and rate limits. The only change in this phase was IP/user-agent capture.

## 17. Action engine

**PASS:** create, assign (with the same-organisation assignee check), cancel, complete, verify (self-verify refused), and source linking. Overdue is computed at read time in `action_register`.

## 18. Audit trail

**PASS:**
- Permission grant, revoke, switch, employee create, invoice create, referral status, broadcast actions and document changes are all recorded.
- Edit and delete by a user, by the service role and by the owner are all refused.

## 19. Feature flags

Unchanged. The existing `moduleAccess` and middleware suites pass. **PASS.**

## 20–22. HR / Recruitment / H&S regression

These are the existing suites plus the policy re-verification. **PASS.** No browser run was done.

## 23. Performance

The volume test ran 100 orgs, 500 sites, 10k people and 100k actions, rolled back:

| Query | Time |
|---|---|
| Client actions page | 12 ms |
| Consultant actions page, holding 50 grants | 0.9 ms |
| Client people page (derivative RLS) | 66 ms |
| Search | 120 ms |
| Overdue register | 89 ms |
| Switcher over 51 organisations | 19 ms |
| **Unfiltered `count(*)` over 100k actions** | **328 ms** (debt 7) |

Write cost is debt 6.

## 24. Concurrency

- **Duplicate referral claim:** the unique constraint plus the conditional update give **PASS**.
- **Simultaneous document version:** the row lock on `documents` plus unique indexes give sequential versions.
- **Two users editing the same employee, or a duplicate broadcast:** **NOT PROTECTED.** These are pre-existing and listed as debts 8 and 9 (Medium).

## 25. Failure states

**Tested:**
- a failed `my_company_id` read (no loop, fail safe);
- a switch-RPC failure (500, not a false 403);
- a failed person link (never fails the insert, tested by mutation);
- a failed audit write (logged, never blocks).

Supabase, Stripe, Manatal and IvyLens outages are covered by the existing `resilient` / vendor suites only.

## 26. Security review

No service-role key reaches the browser. The new RPCs are scoped to `auth.uid()`. No IDOR was found in the new routes, which take no ids from the client except a uuid validated by the database.

## 27. Classification of open items

| Severity | Items |
|---|---|
| **Critical** | none |
| **High** | none |
| **Medium** | Broadcast double-submit (pre-existing); no optimistic locking (pre-existing); `access_scope` not enforced; switcher not browser-verified |
| **Low** | Buttons shown to read-only users that the database refuses; `referral_applications` audit rows lack `organisation_id`; unfiltered-count cost |

## 28. Phase gate

**PASS WITH MINOR ISSUES.**
- No Critical or High issue remains.
- Tenancy isolation and RLS are proven at the database layer.
- No protected system regressed.
- Billing is blocked only by missing Stripe credentials.

**Before Phase 2 depends on it:**
1. Confirm the 11:00 UTC referral run records `ok`.
2. Click through the switcher once on the Vercel preview with a real consultant grant.
3. Run Stripe test mode when keys are available.
