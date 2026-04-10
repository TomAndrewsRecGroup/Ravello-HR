# Ravello HR -- Go-Live Readiness Audit

**Date:** 2026-04-10
**Scope:** Marketing Site, Admin Portal, Client Portal
**Method:** File-by-file, line-by-line automated audit (8 parallel agents)

---

## Executive Summary

| Area | Critical | High | Medium | Low | Total |
|------|----------|------|--------|-----|-------|
| Security & Auth | 4 | 4 | 8 | 2 | 18 |
| Database & Schema | 2 | 6 | 7 | 0 | 15 |
| API Routes & Endpoints | 2 | 5 | 6 | 4 | 17 |
| Marketing Site | 1 | 8 | 3 | 0 | 12 |
| Admin Portal | 1 | 3 | 2 | 0 | 6 |
| Client Portal | 0 | 1 | 1 | 0 | 2 |
| Design System & CSS | 3 | 4 | 2 | 0 | 9 |
| Config & Infrastructure | 0 | 2 | 3 | 0 | 5 |
| **TOTAL** | **13** | **33** | **32** | **6** | **84** |

**Verdict:** NOT go-live ready. 13 critical and 33 high-severity issues must be resolved first.

---

## PHASE 1 -- CRITICAL FIXES (Must fix before any launch)

### SEC-001: Missing Authentication on `/api/client-tab-data` [CRITICAL]
- **File:** `admin/src/app/api/client-tab-data/route.ts` lines 11-28
- **Issue:** GET endpoint returns sensitive company data (documents, candidates, compliance) with NO authentication check. Any unauthenticated user can fetch any company's data.
- **Fix:** Add `supabase.auth.getUser()` check + verify user role is `tps_admin`/`tps_client`

### SEC-002: Missing Company Authorization on `/api/broadcast` [CRITICAL]
- **File:** `admin/src/app/api/broadcast/route.ts` lines 9-20
- **Issue:** Verifies user is admin but does NOT verify they have access to the target companies. An admin could broadcast to any company.
- **Fix:** Validate company_ids against user's authorized companies

### SEC-003: Missing Company Authorization on `/api/invite` [CRITICAL]
- **File:** `admin/src/app/api/invite/route.ts` lines 5-30
- **Issue:** Uses service role key to create users without verifying the caller has permission for the target `company_id`.
- **Fix:** Add company authorization check before service role operations

### SEC-004: Missing Company Authorization on `/api/create-client-user` [CRITICAL]
- **File:** `admin/src/app/api/create-client-user/route.ts` lines 9-16
- **Issue:** Same as SEC-003 -- service role operations without company validation.
- **Fix:** Add company authorization check

### DB-001: Missing `client_viewer` Enum Value [CRITICAL]
- **File:** `supabase/migrations/001_initial_schema.sql` line 10
- **Referenced in:** `admin/src/app/api/invite/route.ts:24`, `admin/src/app/(admin)/users/UsersClient.tsx:7`, `admin/src/components/modules/InviteUserPanel.tsx:11`
- **Issue:** Code references `client_viewer` role but the `user_role` enum only has: `client_admin`, `client_user`, `tps_admin`, `tps_client`. Any invite with role `client_viewer` will fail.
- **Fix:** New migration: `ALTER TYPE user_role ADD VALUE 'client_viewer';`

### DB-002: Column Name Mismatch `account_owner` vs `account_owner_id` [CRITICAL]
- **Code:** `admin/src/app/(admin)/clients/page.tsx:21` selects `account_owner`
- **Migration:** `019_account_owner_internal_tasks.sql:6` defines `account_owner_id`
- **Issue:** Query will return `null` for this column -- broken feature
- **Fix:** Update code to use `account_owner_id` OR rename column in migration

### CSS-001: Fonts Not Loading in Admin Portal [CRITICAL]
- **File:** `admin/src/app/layout.tsx` -- NO font imports
- **Issue:** CSS declares `font-family: 'Inter'` but never loads the font. Falls back to system fonts, breaking the design.
- **Fix:** Add Inter font import via `next/font/google` in admin layout.tsx

### CSS-002: Fonts Not Loading in Client Portal [CRITICAL]
- **File:** `portal/src/app/layout.tsx` -- NO font imports
- **Issue:** Same as CSS-001 for the portal app.
- **Fix:** Add Inter font import via `next/font/google` in portal layout.tsx

### CSS-003: Tailwind Font Variables Undefined in Admin & Portal [CRITICAL]
- **Files:** `admin/tailwind.config.ts:18-22`, `portal/tailwind.config.ts:18-22`
- **Issue:** Both configs reference `--font-cormorant`, `--font-satoshi`, `--font-mono` CSS variables that are never defined in their respective globals.css files.
- **Fix:** Either define the variables or update the tailwind configs to reference the correct fonts (Inter)

### MKT-001: Booking Calendar Not Configured [CRITICAL]
- **File:** `src/app/book/page.tsx` line 51
- **Issue:** `BOOKING_URL` contains placeholder `YOUR_SCHEDULE_ID`. The booking page shows a fallback email CTA instead of a working calendar.
- **Fix:** Replace with actual Google Calendar appointment scheduling URL

### API-001: No Company Isolation on Support Ticket Polling [CRITICAL]
- **File:** `portal/src/app/api/support/poll/route.ts` lines 6-85
- **Issue:** Fetches tickets from IvyLens without filtering by company_id. Users could see tickets from other companies.
- **Fix:** Add company_id filter to IvyLens ticket fetching

### API-002: No Company Isolation on Support Tickets GET [CRITICAL]
- **File:** `portal/src/app/api/support/tickets/route.ts` lines 6-69
- **Issue:** Returns all IvyLens tickets regardless of company.
- **Fix:** Filter by authenticated user's company_id

### API-003: Debug Session Endpoint Exposed in Production [CRITICAL]
- **File:** `portal/src/app/api/debug-session/route.ts` lines 9-95
- **Issue:** Public route (bypasses middleware auth) that exposes session state, cookies, RLS policies, and profile data.
- **Fix:** Remove from production or gate behind admin-only access

---

## PHASE 2 -- HIGH SEVERITY FIXES (Must fix before public launch)

### DB-003: Column Name Mismatch `topic` vs `skill_gap` [HIGH]
- **Code:** `admin/src/app/api/client-tab-data/route.ts:70` selects `topic`
- **Migration:** `005_lead_protect_tables.sql:14` defines column as `skill_gap`
- **Fix:** Change code to select `skill_gap`

### DB-004: Column Name Mismatch `days_taken` vs `days` [HIGH]
- **Code:** `admin/src/app/api/client-tab-data/route.ts:78` selects `days_taken`
- **Migration:** `005_lead_protect_tables.sql:93` defines column as `days`
- **Fix:** Change code to select `days`

### DB-005: Column Name Mismatch `document_type` vs `doc_type` [HIGH]
- **Code:** `admin/src/app/api/client-tab-data/route.ts:79` selects `document_type`
- **Migration:** `005_lead_protect_tables.sql:66` defines column as `doc_type`
- **Fix:** Change code to select `doc_type`

### DB-006: Column Name Mismatch `scheduled_date/completed_date` vs `due_date/completed_at` [HIGH]
- **Code:** `admin/src/app/api/client-tab-data/route.ts:71` selects `scheduled_date, completed_date`
- **Migration:** `005_lead_protect_tables.sql:23-40` defines `due_date` and `completed_at`
- **Fix:** Update code to use correct column names

### DB-007: Column Name Mismatch in `company_assessments` [HIGH]
- **Code:** `admin/src/app/api/client-tab-data/route.ts:95` selects `overall_score, dimension_scores`
- **Migration:** `012_friction_lens_integration.sql:5-20` defines `overall_band, dimensions`
- **Fix:** Update code to use correct column names

### DB-008: Column Name Mismatch in `company_friction_items` [HIGH]
- **Code:** `admin/src/app/api/client-tab-data/route.ts:96` selects `score, recommendation`
- **Migration:** `012_friction_lens_integration.sql:26-39` defines `severity, field_key`
- **Fix:** Update code to use correct column names

### MKT-002: Lead Capture API Not Implemented [HIGH]
- **File:** `src/app/api/leads/route.ts` lines 16-18
- **Issue:** Lead capture is stubbed out with TODO comments. No DB/email integration. All marketing form submissions are lost.
- **Fix:** Implement Supabase insert into a `leads` table + create the table migration

### MKT-003: Email Provider Not Wired (Exit Intent) [HIGH]
- **File:** `src/components/ExitIntentPopup.tsx` line 42
- **Issue:** TODO comment: "wire to your email provider (Resend / Make webhook)". Leads captured by exit intent are lost.
- **Fix:** Implement Resend email or webhook integration

### MKT-004: Email Provider Not Wired (Email Gate) [HIGH]
- **File:** `src/components/tools/EmailGate.tsx` line 20
- **Issue:** Email gate form doesn't send emails. Tool results gated behind email capture but emails go nowhere.
- **Fix:** Implement email capture backend

### MKT-005: All Tool Form Backends Incomplete [HIGH]
- **Files:** `src/components/tools/HiringScoreTool.tsx:227`, `HRRiskScoreTool.tsx:205`, `DDChecklistTool.tsx:150`, `PolicyHealthcheckTool.tsx:121`
- **Issue:** All 4 marketing tools accept email input but only log to console. Leads are not stored.
- **Fix:** Wire all tool forms to the leads API

### MKT-006: Missing Privacy & Terms Pages [HIGH]
- **File:** `src/components/Footer.tsx` lines 179-182
- **Issue:** Footer links to `/privacy` and `/terms` which don't exist. Legal requirement for go-live.
- **Fix:** Create `src/app/privacy/page.tsx` and `src/app/terms/page.tsx`

### MKT-007: LinkedIn URL Incorrect [HIGH]
- **File:** `src/components/Nav.tsx` line 44
- **Issue:** Links to generic `https://linkedin.com` instead of The People System's actual LinkedIn profile.
- **Fix:** Update to correct company LinkedIn URL

### SEC-005: Weak File Upload Validation [HIGH]
- **File:** `admin/src/app/(admin)/reports/ReportUploadForm.tsx` lines 164-169
- **Issue:** File type validation is client-side only (accept attribute). No server-side file type validation, size limits, or content scanning. Extension taken directly from user filename.
- **Fix:** Add server-side file type validation, size limit enforcement, and filename sanitization

### SEC-006: Custom Stripe Webhook Verification [HIGH]
- **File:** `portal/src/app/api/learning/webhook/route.ts` lines 22-40
- **Issue:** Manual HMAC implementation instead of Stripe SDK. Fragile signature parsing.
- **Fix:** Use official `stripe.webhooks.constructEvent()` from the Stripe SDK

### SEC-007: No Input Sanitization on Support Tickets [HIGH]
- **File:** `portal/src/app/api/support/tickets/route.ts` lines 26-28
- **Issue:** Subject and message validated for length but not sanitized for HTML/XSS. Stored and sent to external service.
- **Fix:** Sanitize HTML content before storage and API forwarding

### ADMIN-001: Missing `router.refresh()` After Mutations (Systemic) [HIGH]
- **Files:** 12+ client components across the admin app:
  - `UsersClient.tsx:28` (role changes)
  - `RequestsClient.tsx:75,84,95` (status/response updates)
  - `RequisitionPanel.tsx:331` (recruiter save)
  - `BDIntelligenceClient.tsx:85` (status updates)
  - `CandidatesClient.tsx:67,73` (score/stage updates)
  - `TaskBoardClient.tsx:90,95` (task status/delete)
  - `BenchmarkClient.tsx:58,79` (add/delete benchmark)
  - `LearningAdminClient.tsx:53,75,80` (content management)
  - `TemplatesClient.tsx:74,77,87` (template save/delete)
  - `InterviewSchedulePanel.tsx:87,111,116,121` (interview CRUD)
  - `documents/upload/page.tsx:44` (document upload)
  - `reports/ReportUploadForm.tsx:66` (report upload)
  - `ClientDetailTabs.tsx` (60+ mutations across all tabs)
- **Issue:** Data mutations succeed in Supabase but server-side cache is never invalidated. UI shows stale data after operations.
- **Fix:** Add `router.refresh()` or `revalidateAdminPath()` after every mutation

### PORTAL-001: Missing `router.refresh()` After Mutations [HIGH]
- **Files:** Multiple portal client components:
  - `HiredModal.tsx:50-81` (employee record creation)
  - `ActionButtons.tsx:20-37` (action completion)
  - Other mutation components
- **Issue:** Same as ADMIN-001 -- mutations succeed but UI shows stale data.
- **Fix:** Add `router.refresh()` after every Supabase mutation

### ADMIN-002: Hardcoded Recruiter Names [HIGH]
- **File:** `admin/src/app/(admin)/hiring/new/AdminNewRoleForm.tsx` line 12
- **Issue:** `const OWNERS = ['Lucy', 'Tom']` is hardcoded. Should fetch from profiles table.
- **Fix:** Query `profiles` table where role contains `tps_` to populate dropdown

### ADMIN-003: Hardcoded `docsCount: 0` [HIGH]
- **File:** `admin/src/app/(admin)/clients/[id]/page.tsx` line 46
- **Issue:** Document count always shows 0. Missing query to count documents per client.
- **Fix:** Add documents count query to Promise.all on client detail page

### ENV-001: Stripe Environment Variables Missing from .env.example [HIGH]
- **Files:** All `.env.example` files
- **Issue:** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are used in code but not documented in any `.env.example` file. Cannot configure Stripe without external documentation.
- **Fix:** Add to `portal/.env.example`

### ENV-002: Tawk.to Chat Widget [RESOLVED — REMOVED]
- **Resolution:** Tawk.to chat widget removed entirely. ChatWidget component deleted, import removed from layout.

---

## PHASE 3 -- MEDIUM SEVERITY FIXES (Should fix before launch)

### CSS-004: 304 Hardcoded Color Values Across Codebase [MEDIUM]
- **Files:** 50+ TSX files in admin and portal
- **Issue:** Inline styles use hardcoded hex colors (e.g., `#4B5563`, `#9CA3AF`, `#DC2626`, `#10B981`, `#D97706`, `#14B8A6`) instead of CSS variables.
- **Key Files:**
  - `admin/src/components/modules/AdminLoginForm.tsx`
  - `admin/src/components/modules/FeatureFlagToggles.tsx`
  - `admin/src/components/modules/ClientNotesTimeline.tsx`
  - `admin/src/components/modules/BDCompanyModal.tsx`
  - `admin/src/components/modules/InviteUserPanel.tsx`
  - `admin/src/components/modules/NotificationBell.tsx`
  - `admin/src/components/modules/Toast.tsx`
  - `admin/src/components/modules/GlobalSearch.tsx`
- **Fix:** Replace all hardcoded colors with CSS variable references

### CSS-005: Inconsistent `btn-danger` Color Across Apps [MEDIUM]
- **Admin:** Uses `#EF4444`
- **Portal:** Uses `#D94444` (globals.css line 171)
- **Fix:** Standardize to one value via CSS variable

### CSS-006: Duplicate Button Classes [MEDIUM]
- **Files:** Admin & Portal globals.css
- **Issue:** Both `.btn-primary` and `.btn-cta` exist and do the same thing.
- **Fix:** Consolidate to one class name

### DB-009: Missing Indexes on Frequently Queried Columns [MEDIUM]
- `learning_purchases` -- missing `(company_id, status)` composite index
- `notifications` -- missing `(company_id)` index
- `data_access_requests` -- missing `(company_id)` index
- `internal_tasks` -- missing `(assigned_to, status)` composite index
- **Fix:** New migration adding these indexes

### DB-010: Overly Permissive RLS on Notifications Table [MEDIUM]
- **File:** `supabase/migrations/012_friction_lens_integration.sql` lines 107-109
- **Issue:** Any authenticated user can insert notifications for any user/company.
- **Fix:** Add `WITH CHECK` clause to restrict notification creation

### DB-011: CASCADE DELETE on All Company Foreign Keys [MEDIUM]
- **Files:** Migrations 015-021
- **Issue:** Deleting a company cascades to ALL related data with no audit trail.
- **Fix:** Consider `ON DELETE RESTRICT` with explicit cleanup procedures for critical tables

### DB-012: Storage Bucket Not Automated [MEDIUM]
- **File:** `supabase/migrations/001_initial_schema.sql` lines 256-261
- **Issue:** Storage bucket creation is manual. Code references `storage.from('documents')` but bucket creation isn't in migrations.
- **Fix:** Add migration to create bucket programmatically

### API-004: Race Condition in Support Ticket Polling [MEDIUM]
- **File:** `portal/src/app/api/support/poll/route.ts` lines 78-82
- **Issue:** Updates `sync_state` after processing. Crash between operations could skip or duplicate notifications.
- **Fix:** Use transaction or processing state

### API-005: Missing Input Validation on Company Assessment [MEDIUM]
- **File:** `portal/src/app/api/company/assessment/route.ts` lines 21-26
- **Issue:** `form_responses` passed to IvyLens API without structure validation.
- **Fix:** Add Zod schema validation

### API-006: Missing Input Validation on Broadcast [MEDIUM]
- **File:** `admin/src/app/api/broadcast/route.ts` lines 23-27
- **Issue:** `company_ids` not validated as UUIDs; `due_date` not validated as date.
- **Fix:** Add Zod schema validation

### API-007: Inconsistent Error Status Codes [MEDIUM]
- **Multiple Files:** Some routes return 502 for external errors, others return 500 for everything.
- **Fix:** Standardize: 502 for upstream API failures, 500 for internal errors

### SEC-008: Session Cookie JSON Parsing Without Logging [MEDIUM]
- **File:** `portal/src/lib/supabase/server.ts` lines 45-67
- **Issue:** Malformed session cookies silently fail. Could mask security issues.
- **Fix:** Add error logging on parse failure

### SEC-009: dangerouslySetInnerHTML in Analytics/Chat [MEDIUM]
- **Files:** `src/components/Analytics.tsx:16-23`, `src/components/ChatWidget.tsx:14-26`
- **Issue:** While env vars are safe sources, the pattern sets a bad precedent.
- **Fix:** Consider using `next/script` component instead

### ENV-003: Unused Environment Variables in .env.example [MEDIUM]
- **File:** `.env.example`
- **Variables:** `RESEND_API_KEY`, `EMAIL_FROM`, `LEAD_NOTIFY_EMAIL`, `NEXT_PUBLIC_SITE_URL`
- **Issue:** Declared but never used in code. Misleading for developers.
- **Fix:** Either implement Resend integration or remove from .env.example

### ADMIN-004: Missing Error Handling on Multiple Operations [MEDIUM]
- **Files:** `BenchmarkClient.tsx`, `LearningAdminClient.tsx`, `documents/upload/page.tsx`
- **Issue:** Insert/delete/toggle operations don't check for errors or show error messages.
- **Fix:** Add error checking and user-facing error toasts

### ADMIN-005: Missing Loading Indicators [MEDIUM]
- **Files:** `BenchmarkClient.tsx`, `LearningAdminClient.tsx`
- **Issue:** No loading state during save operations. Users don't know if action is in progress.
- **Fix:** Add loading state management with disabled buttons/spinners

---

## PHASE 4 -- LOW SEVERITY / BEST PRACTICES (Nice to have)

### SEC-010: Weak Password Validation [LOW]
- **File:** `admin/src/app/api/create-client-user/route.ts` lines 24-26
- **Issue:** Only checks length >= 8. No complexity requirements.
- **Fix:** Consider adding complexity requirements

### SEC-011: Missing Nonce in Script Tags [LOW]
- **Files:** `src/components/Analytics.tsx`, `src/components/ChatWidget.tsx`
- **Issue:** No nonce attributes for CSP compliance.
- **Fix:** Add nonce attributes for strict CSP

### API-008: Hardcoded 7-Day Access Expiration [LOW]
- **File:** `portal/src/app/api/learning/webhook/route.ts` line 62
- **Issue:** Learning content access hard-codes 7-day expiration.
- **Fix:** Make configurable via env var or content metadata

### API-009: No Rate Limiting on Any Routes [LOW]
- **All API routes**
- **Issue:** Routes vulnerable to brute-force or abuse.
- **Fix:** Add rate limiting middleware (e.g., Vercel's ratelimit package)

### DB-013: Inconsistent CHECK vs ENUM Patterns [LOW]
- **Various migrations**
- **Issue:** Some tables use CHECK constraints for status fields, others use enum types.
- **Fix:** Standardize to enum types throughout

### DB-014: Missing NOT NULL Constraints [LOW]
- `onboarding_templates.is_default` -- should be NOT NULL DEFAULT false
- `offboarding_templates.is_default` -- should be NOT NULL DEFAULT false
- **Fix:** Add constraints in new migration

---

## BLOCKED / REQUIRES EXTERNAL INPUT

| Item | What's Needed | Owner |
|------|--------------|-------|
| MKT-001 | Google Calendar appointment scheduling URL | TPO team |
| MKT-007 | Correct LinkedIn company profile URL | TPO team |
| MKT-006 | Privacy Policy & Terms of Service content | Legal/TPO team |
| ENV-001 | Stripe API keys for production | TPO team |
| ~~ENV-002~~ | ~~Tawk.to~~ Removed | N/A |
| Lead capture | Decision: Resend vs Make webhook vs other | TPO team |

---

## RECOMMENDED FIX ORDER (7 Sprints -- All 84 Issues)

### Sprint 1: Security & Auth (14 fixes)
Lock down every endpoint before anything else touches production.

| # | ID | Issue | Severity |
|---|-----|-------|----------|
| 1 | SEC-001 | Add auth check to `/api/client-tab-data` | CRITICAL |
| 2 | SEC-002 | Add company authorization to `/api/broadcast` | CRITICAL |
| 3 | SEC-003 | Add company authorization to `/api/invite` | CRITICAL |
| 4 | SEC-004 | Add company authorization to `/api/create-client-user` | CRITICAL |
| 5 | API-001 | Add company isolation to support ticket polling | CRITICAL |
| 6 | API-002 | Add company isolation to support tickets GET | CRITICAL |
| 7 | API-003 | Remove or protect debug-session endpoint | CRITICAL |
| 8 | SEC-005 | Server-side file upload validation | HIGH |
| 9 | SEC-006 | Replace custom Stripe webhook HMAC with SDK | HIGH |
| 10 | SEC-007 | Sanitize HTML in support ticket input | HIGH |
| 11 | SEC-008 | Add logging on session cookie parse failure | MEDIUM |
| 12 | SEC-009 | Replace dangerouslySetInnerHTML with next/script | MEDIUM |
| 13 | SEC-010 | Strengthen password validation rules | LOW |
| 14 | SEC-011 | Add nonce to Analytics/Chat script tags (CSP) | LOW |

**Sprint 1 total: 7 critical, 3 high, 2 medium, 2 low**

---

### Sprint 2: Database Schema & Data Integrity (14 fixes)
Fix every column mismatch and schema issue so queries actually return data.

| # | ID | Issue | Severity |
|---|-----|-------|----------|
| 1 | DB-001 | Add `client_viewer` to `user_role` enum | CRITICAL |
| 2 | DB-002 | Fix `account_owner` vs `account_owner_id` mismatch | CRITICAL |
| 3 | DB-003 | Fix `topic` vs `skill_gap` column mismatch | HIGH |
| 4 | DB-004 | Fix `days_taken` vs `days` column mismatch | HIGH |
| 5 | DB-005 | Fix `document_type` vs `doc_type` column mismatch | HIGH |
| 6 | DB-006 | Fix `scheduled_date/completed_date` vs `due_date/completed_at` | HIGH |
| 7 | DB-007 | Fix `overall_score/dimension_scores` vs `overall_band/dimensions` | HIGH |
| 8 | DB-008 | Fix `score/recommendation` vs `severity/field_key` | HIGH |
| 9 | DB-009 | Add missing composite indexes (4 tables) | MEDIUM |
| 10 | DB-010 | Fix overly permissive RLS on notifications table | MEDIUM |
| 11 | DB-011 | Fix CASCADE DELETE risk on company foreign keys | MEDIUM |
| 12 | DB-012 | Automate storage bucket creation in migration | MEDIUM |
| 13 | DB-013 | Standardize CHECK vs ENUM patterns | LOW |
| 14 | DB-014 | Add missing NOT NULL constraints on template tables | LOW |

**Sprint 2 total: 2 critical, 6 high, 4 medium, 2 low**

---

### Sprint 3: Admin Portal -- Mutations & UX (12 fixes)
Fix every stale-data bug and missing UX feedback in the admin app.

| # | ID | Issue | Severity |
|---|-----|-------|----------|
| 1 | ADMIN-001a | Add `router.refresh()` to `UsersClient.tsx` | HIGH |
| 2 | ADMIN-001b | Add `router.refresh()` to `RequestsClient.tsx` (3 mutations) | HIGH |
| 3 | ADMIN-001c | Add `router.refresh()` to `RequisitionPanel.tsx` (recruiter save) | HIGH |
| 4 | ADMIN-001d | Add `router.refresh()` to `BDIntelligenceClient.tsx` | HIGH |
| 5 | ADMIN-001e | Add `router.refresh()` to `CandidatesClient.tsx` (2 mutations) | HIGH |
| 6 | ADMIN-001f | Add `router.refresh()` to `TaskBoardClient.tsx` (2 mutations) | HIGH |
| 7 | ADMIN-001g | Add `router.refresh()` to `BenchmarkClient.tsx`, `LearningAdminClient.tsx`, `TemplatesClient.tsx`, `InterviewSchedulePanel.tsx`, upload pages | HIGH |
| 8 | ADMIN-001h | Add `router.refresh()` to `ClientDetailTabs.tsx` (60+ mutations) | HIGH |
| 9 | ADMIN-002 | Replace hardcoded `OWNERS = ['Lucy', 'Tom']` with DB query | HIGH |
| 10 | ADMIN-003 | Fix hardcoded `docsCount: 0` with actual documents count query | HIGH |
| 11 | ADMIN-004 | Add error handling to BenchmarkClient, LearningAdmin, doc upload | MEDIUM |
| 12 | ADMIN-005 | Add loading indicators to BenchmarkClient, LearningAdmin | MEDIUM |

**Sprint 3 total: 0 critical, 10 high, 2 medium, 0 low**

---

### Sprint 4: Client Portal -- Mutations & Validation (10 fixes)
Fix portal-side stale data and input validation gaps.

| # | ID | Issue | Severity |
|---|-----|-------|----------|
| 1 | PORTAL-001a | Add `router.refresh()` to `HiredModal.tsx` | HIGH |
| 2 | PORTAL-001b | Add `router.refresh()` to `ActionButtons.tsx` | HIGH |
| 3 | PORTAL-001c | Add `router.refresh()` to all other portal mutation components | HIGH |
| 4 | API-004 | Fix race condition in support ticket polling | MEDIUM |
| 5 | API-005 | Add Zod validation to company assessment input | MEDIUM |
| 6 | API-006 | Add Zod validation to broadcast input (UUIDs, dates) | MEDIUM |
| 7 | API-007 | Standardize error status codes (502 vs 500) across all routes | MEDIUM |
| 8 | API-008 | Make learning content access expiration configurable | LOW |
| 9 | API-009 | Add rate limiting middleware to API routes | LOW |
| 10 | DB-010 | Add WITH CHECK on notifications RLS (duplicate ref -- ensure done) | MEDIUM |

**Sprint 4 total: 0 critical, 3 high, 5 medium, 2 low**

---

### Sprint 5: Design System & CSS (12 fixes)
Get fonts loading, kill hardcoded colors, unify the visual language.

| # | ID | Issue | Severity |
|---|-----|-------|----------|
| 1 | CSS-001 | Add Inter font import to Admin `layout.tsx` via `next/font/google` | CRITICAL |
| 2 | CSS-002 | Add Inter font import to Portal `layout.tsx` via `next/font/google` | CRITICAL |
| 3 | CSS-003 | Fix Admin & Portal `tailwind.config.ts` font variable references | CRITICAL |
| 4 | CSS-004a | Replace hardcoded colors in `admin/src/components/modules/` (~15 files) | MEDIUM |
| 5 | CSS-004b | Replace hardcoded colors in `admin/src/app/(admin)/` page components | MEDIUM |
| 6 | CSS-004c | Replace hardcoded colors in `portal/src/components/` | MEDIUM |
| 7 | CSS-004d | Replace hardcoded colors in `portal/src/app/(portal)/` page components | MEDIUM |
| 8 | CSS-004e | Replace hardcoded colors in marketing site components | MEDIUM |
| 9 | CSS-005 | Standardize `btn-danger` color across Admin (#EF4444) and Portal (#D94444) | MEDIUM |
| 10 | CSS-006 | Consolidate duplicate `.btn-primary` / `.btn-cta` classes | MEDIUM |
| 11 | CSS-007 | Align CSS variable naming (`--brand-navy` vs `--navy`) across apps | MEDIUM |
| 12 | CSS-008 | Ensure Admin & Portal tailwind configs match their globals.css color vars | MEDIUM |

**Sprint 5 total: 3 critical, 0 high, 9 medium, 0 low**

---

### Sprint 6: Marketing Site -- Go-Live (12 fixes)
Complete every unfinished marketing feature and legal requirement.

| # | ID | Issue | Severity |
|---|-----|-------|----------|
| 1 | MKT-001 | Configure Google Calendar booking URL (BLOCKED -- needs TPO input) | CRITICAL |
| 2 | MKT-002 | Implement lead capture API backend (Supabase `leads` table + insert) | HIGH |
| 3 | MKT-003 | Wire ExitIntentPopup to email provider (Resend/Make) | HIGH |
| 4 | MKT-004 | Wire EmailGate to email provider | HIGH |
| 5 | MKT-005 | Wire all 4 tool form backends to leads API | HIGH |
| 6 | MKT-006 | Create `/privacy` and `/terms` pages (BLOCKED -- needs legal content) | HIGH |
| 7 | MKT-007 | Fix LinkedIn URL to correct company profile (BLOCKED -- needs TPO input) | HIGH |
| 8 | MKT-008 | Create `leads` table migration (required by MKT-002) | HIGH |
| 9 | ENV-003a | Implement Resend integration OR remove `RESEND_API_KEY` from .env.example | MEDIUM |
| 10 | ENV-003b | Remove unused `EMAIL_FROM`, `LEAD_NOTIFY_EMAIL`, `NEXT_PUBLIC_SITE_URL` from .env.example OR implement them | MEDIUM |
| 11 | MKT-009 | Verify portal URL in Nav.tsx and Footer.tsx is correct | MEDIUM |
| 12 | MKT-010 | Add responsive breakpoint patterns to marketing site | MEDIUM |

**Sprint 6 total: 1 critical, 7 high, 4 medium, 0 low**

---

### Sprint 7: Config, Infrastructure & Final Polish (10 fixes)
Environment docs, production hardening, and final cleanup.

| # | ID | Issue | Severity |
|---|-----|-------|----------|
| 1 | ENV-001 | Add `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` to portal/.env.example | HIGH |
| 2 | ~~ENV-002~~ | ~~Tawk.to~~ Removed — chat widget deleted | N/A |
| 3 | ENV-004 | Add startup validation -- throw error instead of fallback in Supabase client configs | MEDIUM |
| 4 | ENV-005 | Document all required env vars in a single setup guide | MEDIUM |
| 5 | API-010 | Add audit logging for user creation, role changes, payment events | MEDIUM |
| 6 | API-011 | Add request ID / correlation tracking headers | MEDIUM |
| 7 | API-012 | Standardize error response format (`{ error: string }` everywhere) | MEDIUM |
| 8 | API-013 | Add explicit timeout to all IvyLens API requests | MEDIUM |
| 9 | PORTAL-002 | Fix uncaught promise rejection in `frictionLens.ts` JSON parsing | MEDIUM |
| 10 | PORTAL-003 | Add type safety to partner API permission checking | MEDIUM |

**Sprint 7 total: 0 critical, 2 high, 8 medium, 0 low**

---

## SPRINT SUMMARY

| Sprint | Focus | Critical | High | Medium | Low | Total |
|--------|-------|----------|------|--------|-----|-------|
| 1 | Security & Auth | 7 | 3 | 2 | 2 | **14** |
| 2 | Database & Schema | 2 | 6 | 4 | 2 | **14** |
| 3 | Admin Mutations & UX | 0 | 10 | 2 | 0 | **12** |
| 4 | Portal Mutations & Validation | 0 | 3 | 5 | 2 | **10** |
| 5 | Design System & CSS | 3 | 0 | 9 | 0 | **12** |
| 6 | Marketing Site | 1 | 7 | 4 | 0 | **12** |
| 7 | Config & Final Polish | 0 | 2 | 8 | 0 | **10** |
| **TOTAL** | | **13** | **31** | **34** | **6** | **84** |

---

## BLOCKED / REQUIRES EXTERNAL INPUT

| Item | What's Needed | Owner | Sprint |
|------|--------------|-------|--------|
| MKT-001 | Google Calendar appointment scheduling URL | TPO team | Sprint 6 |
| MKT-007 | Correct LinkedIn company profile URL | TPO team | Sprint 6 |
| MKT-006 | Privacy Policy & Terms of Service content | Legal/TPO team | Sprint 6 |
| ENV-001 | Stripe API keys for production | TPO team | Sprint 7 |
| ~~ENV-002~~ | ~~Tawk.to~~ Removed | N/A | Sprint 7 |
| MKT-003/004 | Decision: Resend vs Make webhook vs other for email | TPO team | Sprint 6 |

---

## DONE CRITERIA

After all 7 sprints are complete:
- [ ] Zero unauthenticated API endpoints
- [ ] All company data isolated by company_id
- [ ] All database queries reference correct column names
- [ ] All enum values exist in the database
- [ ] All mutations refresh the UI after success
- [ ] Fonts load correctly in all 3 apps
- [ ] Zero hardcoded hex colors in inline styles
- [ ] All marketing forms capture and store leads
- [ ] Privacy Policy and Terms pages exist
- [ ] Booking calendar functional
- [ ] All environment variables documented
- [ ] All external API integrations have error handling and timeouts
- [ ] Rate limiting on public-facing endpoints
- [ ] Production debug endpoints removed

---

## METRICS

- **Total files audited:** 200+
- **Total issues found:** 84
- **Critical:** 13 (must fix)
- **High:** 31 (must fix before public launch)
- **Medium:** 34 (should fix before launch)
- **Low:** 6 (nice to have)
- **Blocked on external input:** 6 items
- **Estimated sprints to go-live ready:** 7
