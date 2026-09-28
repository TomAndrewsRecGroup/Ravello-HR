# Core-OS 360 — Phase 1 Implementation Plan

**Written 2026-09-26, before any Phase 1 code change.** Audit sources: every
migration (001–116), the live database (project `sbmekaviwkiyorvmtgcu`, read
through `pg_policies`, `pg_proc`, `pg_trigger`, `information_schema` and exact
row counts), `CLAUDE.md`, `docs/SYSTEM_FEATURES_INVENTORY.md`, both apps'
middleware, session and layout code, `vercel.json`.

## 1. Current architecture

- Two Next.js 15 apps on one Supabase project. **Admin** is staff-only
  (`tps_admin`, enforced by middleware role allow-list + layout + RLS).
  **Portal** is the client app.
- **Tenancy is one column: `company_id`.** Every client table carries it.
  The pivot is three `SECURITY DEFINER` SQL helpers used by RLS:
  `my_company_id()` (the caller's `profiles.company_id`),
  `is_tps_staff()` (`tps_admin` only) and `is_company_super_user()`
  (`client_admin`). A user belongs to exactly one company.
- **~38 older policies bypass the helpers** and inline
  `SELECT profiles.company_id FROM profiles WHERE id = auth.uid()` and
  `profiles.role = ANY('{tps_admin,tps_client}')` (onboarding/offboarding,
  employee_records, leave_records, policy_acknowledgements, calendar,
  dev_plans, athlete training interests, company_assessments,
  one_off_invoices, profiles SELECT/UPDATE/INSERT/DELETE…).
- Roles are the `user_role` enum: `tps_admin`, `tps_client` (demo/legacy),
  `client_admin`, `client_editor`, `client_user`, `hs_provider` (inert).
- Automation: `platform_events` outbox (DEFINER triggers on 24+ tables,
  column whitelists) → `/api/cron/process-events` → `lib/events/rules.ts`
  → `notify()`; reminders cron; 12 Vercel crons (§ 51).
- Guards: `profiles_guard_privileged` / `companies_guard_commercial`
  allow-list triggers (088/093) — the privilege-escalation boundary.

## 2. Business-critical modules (live data, exact counts 2026-09-26)

| Module | Live rows | Notes |
|---|---|---|
| Referrals | 1,918 `referral_applications`, 480 scan runs, 2,634 `candidates` | hourly cron, high volume — highest regression risk |
| Athletes to Industry | 18 athletes, 6 partners | public sign-up route |
| Development Plans | 11 `dev_plans`, 15 milestones | |
| Email | 1,724 `email_log` | |
| Companies / users | 2 companies, 6 profiles (2 staff, 4 client_admin) | |
| Everything else (HR, H&S, actions, documents, billing) | 0–15 rows | built, largely unused |

## 3. Risks found

**Schema risks**
- `hs_sites` exists (0 rows) with a subset of the spec's site fields and FKs
  from every H&S table — must be extended, not replaced.
- `employee_records` (0 rows), `candidates` (2,634), `athletes` (18) are
  three disconnected person identities; a forced merge would break the
  referral pipeline's idempotency (it keys on `candidates`).
- `actions` (client) and `internal_tasks` (staff) are two action tables
  with different audiences.
- `documents` has `version`/`parent_id` but nothing snapshots a replaced
  file: an UPDATE of `file_path` silently loses the old evidence.

**Tenancy risks**
- Single-company-per-user is hard-wired in `my_company_id()` and in 38
  inline policies. A consultancy model built by **widening** every policy
  ("company_id IN my accessible companies") would expose several clients
  at once to one page load and makes "record created against the wrong
  client" easy.
- Portal code filters by the session's `company_id`; the portal session
  cookie caches it for 15 minutes.

**Security risks (pre-existing)**
- **`tps_client` is granted cross-company read/write** by the 38 inline
  policies (employee_records, onboarding/offboarding, leave, policy acks,
  calendar) and by the four `profiles` policies — although `is_tps_staff()`
  and the admin app treat only `tps_admin` as staff. No `tps_client` user
  exists today (0 rows), so it is latent, not exploited. Fixed in 118.
- Admin GlobalSearch still queries the retired `tickets` table.

**Compatibility risks**
- 150+ files query `companies`/`company_id`; renaming would break both apps.
- Guard allow-lists are pinned by tests; widening is a security decision.
- `get_my_profile()`/`get_my_role()` feed `requireLiveSession()` for every
  service-role route in the portal.

## 4. Design decisions

1. **`companies` stays the physical tenant table; `organisations` is a
   `security_invoker` view over it**, and `companies` gains the missing
   organisation columns (`legal_name`, `organisation_type`,
   `parent_organisation_id`, `company_number`, address, `country`,
   `primary_contact_id`). `organisation_id` ≡ `company_id`: every existing
   FK, row id and RLS policy remains valid. The physical rename is deferred
   to a later phase where it can be done with `companies` becoming the view.
2. **Same for sites:** `hs_sites` extended with the spec's fields, `sites`
   view over it.
3. **Consultancy access = an explicit grant + an ACTIVE organisation, not
   widened policies.** `user_organisation_access` records who may act in
   which organisation, with role, scope and validity window.
   `user_active_organisation` records which one the user is currently
   working in, written only through `set_active_organisation()` (validates
   the grant). `my_company_id()` returns the active organisation **only
   while a valid grant exists**, otherwise the home company. Consequences:
   - every existing policy, storage policy and app query becomes
     consultant-aware without being rewritten;
   - a consultant sees exactly ONE client at a time, so a record cannot be
     created against a client they are not viewing;
   - revocation / expiry take effect on the next query (the function
     re-checks the grant on every call);
   - client A still cannot see client B: nothing about a client's own
     access changed.
4. `get_my_role()` / `is_company_super_user()` return the **effective**
   role: the grant's role maps to a legacy role (`roles.legacy_role`) so
   existing checks keep working inside a client.
5. **Capability model:** `roles`, `capabilities`, `role_capabilities`
   (seeded with the 14 spec roles and 21 capabilities) and
   `has_capability(org, cap)`. Legacy enum roles map onto spec roles. A
   TypeScript mirror is pinned against the SQL seed by test. Existing
   `role === …` call sites are left in place (documented debt) — rewriting
   them all in one phase is the regression risk the brief forbids.
6. The 38 inline policies are rewritten onto the helpers (same meaning,
   minus the `tps_client` over-grant).
7. **People:** new `people` table, `person_id` link columns on
   `employee_records`, `candidates`, `athletes`, `profiles`; backfilled;
   exception-safe BEFORE INSERT triggers so the referral pipeline can never
   fail because of it. RLS on `people` is **derivative**: a client sees a
   person only if they can see an employee/candidate/athlete row linked to
   it, so the candidate-visibility rule (`approved_for_client`) carries
   over automatically.
8. **Audit trail:** new immutable `audit_events` (DEFINER triggers with
   column whitelists; sessions have no write grant; no UPDATE/DELETE for
   anyone but the owner). `platform_events` stays the processing outbox.
9. **Actions:** `actions` becomes the universal action table (adds
   `site_id`, `source_type`, `source_id`, `assigned_to`, `severity`,
   `completion_evidence`, `verified_by/at`, `organisation_id` generated).
   `internal_tasks` stays the staff-only work queue (documented adapter).
10. **Documents:** `document_versions` snapshots every file on
    `documents` INSERT and on every file change — never silently overwrite.
11. Billing: `one_off_invoices.billing_source` + `billing_provider`
    (provider-neutral), no Stripe behaviour change.
12. Search: `search_records(q)` SECURITY INVOKER RPC (RLS applies),
    trigram indexes; admin GlobalSearch rewired to it.
13. Portal: organisation switcher + "Viewing: <client>" banner; switching
    re-mints the session cookie and does a hard navigation so no cached
    state, modal or unsaved form survives the switch.

## 5. Migrations

| File | Purpose |
|---|---|
| `117_core_tenancy.sql` | companies→organisation columns, `organisations` view, `organisation_relationships`, capability catalogue, grants, active organisation, effective helpers, read-only write guard, `audit_events`, 43 policy rewrites |
| `118_sites_departments_people.sql` | site fields + `sites` view, `departments`, `people` + links + backfill |
| `119_actions_documents_search.sql` | universal actions, `action_register`, document_versions, policy-ack evidence, billing source, search |
| `120_actions_capability_insert.sql` | added after the probe found clients/consultants could not raise actions |
| `121_audit_immutable_search_path.sql` | advisor hygiene |

(As executed. The plan originally split 117/118 differently; audit_events
moved into 117 because set_active_organisation writes to it.)

All additive; no table dropped; no row deleted; ids preserved. Each is
probed in a rolled-back transaction on production before it is applied.

## 6. Preservation strategy

No protected system's table, route, cron or page is removed. The only
behaviour change to existing users is the removal of the latent
`tps_client` over-grant. Referral tables are touched only by one nullable
column + exception-safe trigger on `candidates`.

## 7. Test strategy

- Vitest SQL-shape tests pinning each migration (house style).
- Unit tests: capability mapping (TS ↔ SQL seed), org-switch route.
- **Live rolled-back probes** (`supabase/probes/117-119_*.sql`): Laws
  Safety / ABC / XYZ / Independent fixtures with real `auth.users`, run as
  `authenticated` with forged JWT claims: SELECT/INSERT/UPDATE/DELETE
  across tenants, grant/revoke/expiry/role change, privilege escalation,
  storage paths, audit immutability. Plus a rolled-back volume test
  (100 orgs, 500 sites, 10k people, 100k actions) with `EXPLAIN ANALYZE`.
- Full existing suites, tsc, the five CI guards and both production
  builds.
- External systems (Stripe, Manatal, IvyLens, Resend) are not called live
  from the sandbox; they are reported BLOCKED/NOT VERIFIED where only a
  live call proves them.
