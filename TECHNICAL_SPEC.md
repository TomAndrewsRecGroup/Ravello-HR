# Ravello HR — Full Technical Specification

> **Platform:** The People System (TPS) HR SaaS  
> **Version:** As-built, June 2026  
> **Apps:** Admin Portal + Client Portal  
> **Stack:** Next.js 14 · TypeScript · Supabase (PostgreSQL + Auth + Storage) · Vercel · Stripe

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Architecture](#2-architecture)
3. [Design System & CSS](#3-design-system--css)
4. [Database Schema](#4-database-schema)
5. [Row-Level Security (RLS)](#5-row-level-security-rls)
6. [Authentication & Roles](#6-authentication--roles)
7. [Feature Flag System](#7-feature-flag-system)
8. [Admin Portal](#8-admin-portal)
9. [Client Portal](#9-client-portal)
10. [How the Two Apps Connect](#10-how-the-two-apps-connect)
11. [Key Workflows End-to-End](#11-key-workflows-end-to-end)
12. [API Routes Reference](#12-api-routes-reference)
13. [Third-Party Integrations](#13-third-party-integrations)
14. [Infrastructure & Deployment](#14-infrastructure--deployment)

---

## 1. Platform Overview

Ravello HR is a two-application HR SaaS platform operated by **The People System (TPS)**, an HR consultancy. It serves two distinct user groups through two separate Next.js applications that share a single Supabase project (same database, same auth, same storage bucket).

| App | Users | Purpose |
|-----|-------|---------|
| **Admin Portal** (`/admin`) | TPS internal staff (`tps_admin`, `tps_client`) | Manage clients, hiring pipeline, BD intelligence, compliance, service requests, billing, reporting |
| **Client Portal** (`/portal`) | Client company users (`client_admin`, `client_viewer`, `client_user`) | Access their own HR services: HIRE, LEAD, PROTECT modules; raise roles, view compliance, manage staff |

The platform is structured around three core HR modules sold as tiered services:

- **HIRE** — Recruitment pipeline, candidate management, friction scoring, salary benchmarks, Manatal ATS integration
- **LEAD** — Employee records, training, performance reviews, skills matrix, onboarding, development plans
- **PROTECT** — Absence management, compliance tracking, employee documents, offboarding, HR dashboard

Each module is individually feature-flag-gated per client company, giving TPS granular control over what each client can see and use.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Vercel (Pro)                              │
│                                                                  │
│  ┌──────────────────────┐    ┌──────────────────────────────┐   │
│  │   Admin Portal        │    │   Client Portal               │   │
│  │   /admin              │    │   /portal                     │   │
│  │   Next.js 14 App      │    │   Next.js 14 App              │   │
│  │   Router (TypeScript) │    │   Router (TypeScript)         │   │
│  └──────────┬───────────┘    └──────────────┬───────────────┘   │
│             │                               │                    │
└─────────────┼───────────────────────────────┼────────────────────┘
              │                               │
              ▼                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Supabase (shared project)                    │
│                                                                  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │  PostgreSQL DB   │  │  Supabase Auth   │  │  Storage       │  │
│  │  ~50 tables      │  │  JWT sessions    │  │  CVs, docs,   │  │
│  │  RLS on all      │  │  Email invites   │  │  logos        │  │
│  └─────────────────┘  └──────────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────────────┘
              │
              ├── Stripe (billing, subscriptions, e-learning)
              ├── Manatal ATS (candidate sync)
              ├── IvyLens / Friction Lens API (JD scoring)
              └── SMTP / Email (invites, notifications)
```

### Monorepo Structure

```
Ravello-HR/
├── admin/                  # TPS internal admin app
│   └── src/
│       ├── app/            # Next.js App Router pages & API routes
│       ├── components/     # UI components (layout, modules)
│       └── lib/            # Supabase clients, utilities, type maps
├── portal/                 # Client-facing portal app
│   └── src/
│       ├── app/            # Next.js App Router pages & API routes
│       ├── components/     # UI components (layout, modules)
│       └── lib/            # Supabase clients, utilities, type maps
└── supabase/
    └── migrations/         # 74 SQL migration files (source of truth)
```

### Component Pattern

```tsx
// Server component — fetches data, passes to client
export default async function Page() {
  const supabase = createServerSupabaseClient();
  const [{ data: a }, { data: b }] = await Promise.all([
    supabase.from('table_a').select('*'),
    supabase.from('table_b').select('*'),
  ]);
  return <ClientComponent dataA={a} dataB={b} />;
}

// Client component — handles interactivity
'use client';
export default function ClientComponent({ dataA, dataB }) { ... }
```

All data-fetching pages use `Promise.all()` to parallelise queries — no sequential waterfalls.

---

## 3. Design System & CSS

Both apps share an identical CSS custom property system defined in `globals.css`. No third-party component library is used.

### Colour Tokens

```css
--bg:           #EFF0F7   /* page background */
--surface:      #FFFFFF   /* cards */
--surface-alt:  #E8EAF2   /* alternate surface */
--surface-soft: #F4F5FB   /* subtle background */
--ink:          #070B1D   /* primary text */
--ink-soft:     #38436A   /* secondary text */
--ink-faint:    #748099   /* placeholder / meta */
--navy:         #070B20
--purple:       #7C3AED   /* primary brand */
--purple-lt:    #A67DFF
--blue:         #3B6FFF
--teal:         #14B8A6
--red:          #D94444
--gold:         #BF8F28
--line:         rgba(7,11,29,0.08)
--gradient:     linear-gradient(135deg, #EA3DC4 0%, #7C3AED 45%, #3B6FFF 100%)
--gradient-cta: linear-gradient(135deg, #7C3AED 0%, #5A2AC8 100%)
```

### Layout Tokens

```css
--sidebar-w:  256px
--topbar-h:   60px
```

### Utility Classes

| Class | Purpose |
|-------|---------|
| `.card` | White rounded card with border |
| `.btn-cta` | Purple gradient primary button |
| `.btn-secondary` | Bordered secondary button |
| `.btn-ghost` | Transparent ghost button |
| `.btn-icon` | Square icon button |
| `.btn-sm` | Small size modifier |
| `.input` | Form input / select / textarea |
| `.label` | Form field label |
| `.table-wrapper` | Scrollable table container |
| `.table` | Styled table |
| `.badge` | Inline status pill |
| `.empty-state` | Centred empty state block |
| `.portal-page` | Portal main content padding |

### Badge Variants

`.badge-urgent` · `.badge-high` · `.badge-normal` · `.badge-low`  
`.badge-open` · `.badge-inprogress` · `.badge-resolved`  
`.badge-inactive`

### Typography

- **Headings:** Plus Jakarta Sans (`font-display`)
- **Body:** System sans-serif

---

## 4. Database Schema

All schema is defined in `supabase/migrations/` (74 migration files). Tables are listed by logical grouping.

### 4.1 Core Identity Tables

#### `companies`
Client organisations. Central to every other table via `company_id` FK.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | TEXT | Display name |
| `slug` | TEXT UNIQUE | URL-safe identifier |
| `sector` | TEXT | Industry sector |
| `size_band` | TEXT | Employee count band |
| `contact_email` | TEXT | Primary contact |
| `active` | BOOLEAN | Soft delete / archive |
| `feature_flags` | JSONB | Per-module flags (see §7) |
| `account_owner_id` | UUID FK → profiles | Assigned TPS account manager |
| `onboarding_status` | TEXT | `pending`, `active`, `complete` |
| `manatal_client_id` | TEXT | Manatal ATS client identifier |
| `stripe_customer_id` | TEXT | Stripe customer |
| `stripe_subscription_id` | TEXT | Active Stripe subscription |
| `stripe_price_id` | TEXT | Current price ID |
| `subscription_status` | TEXT | `active`, `past_due`, `cancelled`, etc. |
| `monthly_retainer_pence` | INTEGER | Recurring fee in pence |
| `logo_path` | TEXT | Supabase Storage path for logo |

#### `profiles`
All platform users. One row per auth.users entry.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK (= auth.users.id) | |
| `company_id` | UUID FK → companies | NULL for TPS staff |
| `email` | TEXT | |
| `full_name` | TEXT | |
| `role` | ENUM | See §6 |
| `avatar_url` | TEXT | |
| `onboarding_completed` | BOOLEAN | Portal onboarding wizard complete |
| `ui_preferences` | JSONB | Sidebar order, hidden items, quick actions |
| `privacy_consent_at` | TIMESTAMPTZ | GDPR consent timestamp |
| `marketing_consent` | BOOLEAN | Email marketing opt-in |

### 4.2 HIRE Module Tables

#### `requisitions`
Job openings raised by clients or TPS on their behalf.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `company_id` | UUID FK | |
| `title` | TEXT | Role title |
| `department` | TEXT | |
| `seniority` | TEXT | |
| `location` | TEXT | |
| `employment_type` | TEXT | `permanent`, `fixed_term`, `contract` |
| `working_model` | TEXT | `office`, `hybrid`, `remote` |
| `salary_min` / `salary_max` | INTEGER | Annual, in pence |
| `stage` | ENUM `hiring_stage` | See below |
| `jd_text` | TEXT | Raw job description submitted |
| `must_haves` | TEXT[] | Required skills |
| `nice_to_haves` | TEXT[] | Preferred skills |
| `reason_for_hire` | TEXT | `new_headcount`, `replacement`, `expansion` |
| `urgency` | TEXT | |
| `interview_stages` | INTEGER | Number of interview rounds |
| `reporting_line` | TEXT | |
| `friction_score` | JSONB | Full IvyLens result object |
| `friction_level` | TEXT | `Low`, `Medium`, `High`, `Critical` |
| `friction_recommendations` | JSONB | Array of recommendation strings |
| `friction_scored_at` | TIMESTAMPTZ | |
| `assigned_recruiter` | TEXT | TPS recruiter name |
| `managed_by` | TEXT | `tpo` or `internal` |
| `internal_applicants` | JSONB | Internal candidate array |
| `approved_by` | UUID FK → profiles | |
| `manatal_job_id` | TEXT | Manatal job ID after publish |

**`hiring_stage` enum values:**
`submitted` → `in_progress` → `shortlist_ready` → `interview` → `offer` → `filled` | `cancelled`

#### `candidates`
Candidates per requisition.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `requisition_id` | UUID FK | |
| `company_id` | UUID FK | Denormalised for RLS |
| `full_name` | TEXT | |
| `email` / `phone` | TEXT | |
| `cv_url` | TEXT | Supabase Storage URL |
| `cv_file_path` / `cv_file_name` | TEXT | Storage path |
| `summary` | TEXT | Recruiter summary |
| `recruiter_notes` | TEXT | Internal notes |
| `approved_for_client` | BOOLEAN | Controls client visibility |
| `client_status` | ENUM | `pending`, `approved`, `rejected`, `info_requested` |
| `client_feedback` | TEXT | Client's response |
| `screening_score` | INTEGER (1–10) | Recruiter screening score |
| `screening_notes` | TEXT | |
| `pipeline_stage` | TEXT | `applied`, `screening`, `interviewing`, `offer`, `hired`, `rejected` |
| `source` | TEXT | `direct`, `linkedin`, `referral`, `agency`, `job_board` |

#### `interview_schedules`
Individual interview events per candidate.

| Column | Type | Notes |
|--------|------|-------|
| `requisition_id` / `candidate_id` / `company_id` | UUID FKs | |
| `stage_number` | INTEGER | 1st, 2nd, 3rd, etc. |
| `stage_label` | TEXT | e.g. "Competency Panel" |
| `interview_type` | TEXT | `video`, `phone`, `in_person`, `task` |
| `scheduled_at` | TIMESTAMPTZ | |
| `duration_mins` | INTEGER | |
| `location_or_link` | TEXT | Room address or Zoom URL |
| `interviewers` | TEXT[] | Interviewer names |
| `status` | TEXT | `scheduled`, `completed`, `cancelled`, `rescheduled`, `no_show` |
| `outcome` | TEXT | `pass`, `fail`, `hold`, `pending` |
| `feedback_notes` | TEXT | Internal recruiter notes |
| `client_feedback` | TEXT | Client's view |

#### `offers`
Offer records per candidate.

| Column | Type | Notes |
|--------|------|-------|
| `base_salary` | INTEGER | Annual, in pence |
| `bonus` | TEXT | e.g. "10% discretionary" |
| `benefits` | TEXT | Free text summary |
| `start_date` | DATE | |
| `notice_period` | TEXT | |
| `contract_type` | TEXT | `permanent`, `fixed_term`, `contract` |
| `status` | TEXT | `draft` → `sent` → `verbal_accepted` → `written_accepted` / `declined` / `withdrawn` / `lapsed` |
| `sent_at` / `verbal_accepted_at` / `written_accepted_at` / `declined_at` | TIMESTAMPTZ | Status timestamps |
| `deadline` | DATE | Offer expiry |
| `decline_reason` | TEXT | |

#### `jd_templates`
Reusable job description templates created by TPS admin.

| Column | Type |
|--------|------|
| `title`, `department`, `seniority`, `working_model` | TEXT |
| `description`, `must_haves` TEXT[] | |
| `benefits`, `tags` TEXT[] | |

#### `salary_benchmarks`
Market salary data by role/location/level.

| Column | Type |
|--------|------|
| `role_type`, `location`, `seniority`, `working_model` | TEXT |
| `salary_p25`, `salary_p50`, `salary_p75`, `salary_p90` | INTEGER (pence) |
| `source`, `effective_date` | TEXT / DATE |

### 4.3 LEAD Module Tables

#### `employee_records`
Master employee directory.

| Column | Type | Notes |
|--------|------|-------|
| `company_id` | UUID FK | |
| `full_name`, `email` | TEXT | |
| `job_title`, `department` | TEXT | |
| `employment_type` | TEXT | `full_time`, `part_time`, `contractor` |
| `status` | TEXT | `active`, `on_leave`, `terminated`, `probation` |
| `start_date` / `end_date` | DATE | |
| `salary` | INTEGER | |
| `leave_year_type` | TEXT | Calendar or rolling year |
| `emergency_contact` | TEXT | |

#### `training_needs`

| Column | Type |
|--------|------|
| `employee_name`, `department` | TEXT |
| `skill_gap` | TEXT |
| `priority` | TEXT (`low`, `medium`, `high`) |
| `status` | TEXT (`identified`, `in_progress`, `resolved`) |
| `target_date` | DATE |

#### `performance_reviews`

| Column | Type |
|--------|------|
| `employee_name` | TEXT |
| `review_period` | TEXT (e.g. `Q1-2026`) |
| `review_type` | TEXT (`annual`, `mid_year`, `probation`) |
| `status` | TEXT (`scheduled`, `in_progress`, `complete`) |
| `overall_rating` | TEXT |
| `reviewer_name` | TEXT |
| `due_date`, `completed_at` | DATE / TIMESTAMPTZ |

#### `skills_matrix`

| Column | Type |
|--------|------|
| `employee_name`, `role_title`, `skill_name` | TEXT |
| `current_level` | INTEGER (0–5) |
| `target_level` | INTEGER (0–5) |
| `last_assessed` | DATE |

#### `hr_metrics`
Aggregate KPIs per company per period.

| Column | Type |
|--------|------|
| `period` | TEXT (e.g. `Q1-2026`) |
| `headcount`, `headcount_target` | INTEGER |
| `turnover_rate`, `absence_rate` | NUMERIC |
| `gender_m_pct`, `gender_f_pct`, `gender_other_pct` | NUMERIC |
| `avg_tenure_months` | NUMERIC |

#### `onboarding_templates` / `onboarding_instances` / `onboarding_task_progress`
Three-tier structure for onboarding workflows.

- **Template** — Reusable task list (company-scoped, with `is_default`)
- **Instance** — Per-employee deployment of a template, linked to `employee_records`
- **Task progress** — Individual task completion (`status`, `completed_at`, `completed_by`)

#### `offboarding_templates` / `offboarding_instances`
Mirror pattern to onboarding. Includes: asset return, knowledge transfer, IT access revocation, exit interview.

#### `policy_acknowledgements`
Tracks employee sign-off on policy documents.

| Column | Type |
|--------|------|
| `document_id` FK → documents | |
| `employee_id` FK → employee_records | |
| `status` | TEXT (`pending`, `acknowledged`, `overdue`) |
| `sent_at`, `acknowledged_at` | TIMESTAMPTZ |

### 4.4 PROTECT Module Tables

#### `absence_records` / `leave_records`
Two related tables: `absence_records` for raw records, `leave_records` for formal leave requests with approval workflow.

| Column | Type |
|--------|------|
| `employee_name` / `employee_id` | TEXT / UUID FK |
| `leave_type` | TEXT (`annual_leave`, `sick_day`, `maternity`, `paternity`, `compassionate`, `unpaid`, `bank_holiday`, `other`) |
| `start_date`, `end_date`, `days_count` | DATE / INTEGER |
| `status` | TEXT (`pending`, `approved`, `rejected`) |
| `approved_by`, `approved_at` | UUID FK / TIMESTAMPTZ |

#### `employee_documents`
Employee-specific documents (separate from company documents).

| Column | Type |
|--------|------|
| `employee_name` | TEXT |
| `doc_type` | TEXT (`contract`, `right_to_work`, `dbs`, `visa`, `nda`, `other`) |
| `title`, `file_url` | TEXT |
| `expiry_date` | DATE |
| `status` | TEXT (`valid`, `expiring_soon`, `expired`) |

#### `company_calendar_events`

| Column | Type |
|--------|------|
| `title`, `event_type` | TEXT (`bank_holiday`, `closure`, `event`) |
| `start_date`, `end_date` | DATE |
| `all_day`, `recurring_yearly` | BOOLEAN |

### 4.5 Support & Operations Tables

#### `tickets`

| Column | Type |
|--------|------|
| `subject`, `description` | TEXT |
| `status` | ENUM | `open`, `in_progress`, `resolved`, `closed` |
| `priority` | ENUM | `low`, `normal`, `high`, `urgent` |
| `submitted_by` FK → profiles | UUID |
| `assigned_to` FK → profiles | UUID |
| `resolved_at` | TIMESTAMPTZ |

#### `ticket_messages`

| Column | Type | Notes |
|--------|------|-------|
| `ticket_id` FK | UUID | |
| `sender_id` FK → profiles | UUID | |
| `body` | TEXT | |
| `is_internal` | BOOLEAN | TPS-only notes hidden from client |

#### `service_requests`
Requests for specific HR services (not general support).

| Column | Type |
|--------|------|
| `request_type` | TEXT (`policy_update`, `salary_benchmark`, `manager_support`, `strategic_review`, `hr_audit`) |
| `subject`, `details` | TEXT / JSONB |
| `urgency` | TEXT |
| `status` | TEXT (`new`, `in_progress`, `complete`) |
| `response_notes` | TEXT |
| `responded_at` | TIMESTAMPTZ |

#### `actions`
System-generated action items for client companies.

| Column | Type |
|--------|------|
| `action_type` | TEXT |
| `title`, `description` | TEXT |
| `priority` | TEXT |
| `status` | TEXT (`active`, `dismissed`, `completed`) |
| `due_date` | DATE |
| `created_by_admin` | BOOLEAN | True if broadcast from admin |
| `dismissed_at` | TIMESTAMPTZ |

#### `documents`
Company-level documents (policies, contracts, handbooks, reports).

| Column | Type |
|--------|------|
| `name`, `category` | TEXT |
| `file_url`, `file_path` | TEXT |
| `file_size` | INTEGER |
| `version` | TEXT |
| `review_due_at` | DATE |
| `status` | TEXT |
| `requires_approval` | BOOLEAN |
| `approved_at` | TIMESTAMPTZ |
| `uploaded_by` FK → profiles | UUID |

#### `milestones`
People roadmap milestones per company.

| Column | Type |
|--------|------|
| `pillar` | TEXT (`hire`, `lead`, `protect`) |
| `title`, `quarter` | TEXT |
| `due_date` | DATE |
| `status` | TEXT (`not_started`, `in_progress`, `complete`, `at_risk`) |
| `sort_order` | INTEGER |

#### `client_services`
Services sold to and active for each client.

| Column | Type |
|--------|------|
| `service_name`, `service_tier` | TEXT |
| `start_date`, `end_date` | DATE |
| `status` | TEXT (`active`, `paused`, `cancelled`) |
| `monthly_fee` | INTEGER |
| `billing_frequency` | TEXT |
| `renewal_date` | DATE |

### 4.6 BD Intelligence Tables

#### `bd_companies`
Prospect companies identified by IvyLens browser extension.

| Column | Type |
|--------|------|
| `company_name`, `company_name_normalised` | TEXT |
| `status` | TEXT (`prospect`, `contacted`, `client`, `not_relevant`) |
| `notes` | TEXT |
| `total_roles_seen` | INTEGER |
| `first_seen_at`, `last_seen_at` | TIMESTAMPTZ |

#### `bd_scanned_roles`
Individual job listings scraped from external job boards.

| Column | Type |
|--------|------|
| `company_id` FK → bd_companies | UUID |
| `role_title` | TEXT |
| `salary_min` / `salary_max` | INTEGER |
| `location`, `working_model` | TEXT |
| `skills` | TEXT[] |
| `source_url` | TEXT |
| `source_board` | TEXT (`linkedin`, `indeed`, `reed`) |
| `date_posted` | DATE |
| `still_active` | BOOLEAN |

### 4.7 Friction Lens & Assessment Tables

#### `company_assessments`
Company-level friction assessment results from IvyLens.

| Column | Type |
|--------|------|
| `ivylens_company_id` | TEXT |
| `employee_count`, `employee_band` | INTEGER / TEXT |
| `form_responses` | JSONB |
| `overall_band` | TEXT (`Low`, `Moderate`, `High Friction`) |
| `confidence` | NUMERIC |
| `dimensions`, `top_signals` | JSONB |
| `summary`, `benchmarks` | TEXT / JSONB |

#### `company_friction_items`
Admin checklist of items requiring remediation per company.

| Column | Type |
|--------|------|
| `assessment_id` FK | UUID |
| `dimension`, `field_key`, `label` | TEXT |
| `severity` | TEXT |
| `is_completed` | BOOLEAN |
| `completed_at`, `completed_by` | TIMESTAMPTZ / UUID |
| `notes` | TEXT |

### 4.8 CRM, Audit & Billing Tables

#### `client_notes`
CRM-style timeline entries per client company.

| Column | Type |
|--------|------|
| `author_id` FK → profiles | UUID |
| `note_type` | TEXT (`general`, `call`, `meeting`, `email`, `task`, `escalation`) |
| `title`, `body` | TEXT |
| `pinned` | BOOLEAN |

#### `activity_log`
Full audit trail of all platform events.

| Column | Type |
|--------|------|
| `event_type` | TEXT (`login`, `role_created`, `role_filled`, `ticket_created`, `ticket_resolved`, `document_uploaded`, `compliance_updated`, `candidate_added`, `service_request`, `feature_toggled`, `user_invited`) |
| `title` | TEXT |
| `metadata` | JSONB |
| `ip_address`, `user_agent` | TEXT |
| `data_category` | TEXT |

#### `internal_tasks`
TPS staff task board.

| Column | Type |
|--------|------|
| `assigned_to` FK → profiles | UUID |
| `title`, `description` | TEXT |
| `priority` | TEXT |
| `status` | TEXT (`todo`, `in_progress`, `done`) |
| `due_date`, `completed_at` | DATE / TIMESTAMPTZ |

#### `notifications`
In-app notification inbox per user.

| Column | Type |
|--------|------|
| `user_id`, `company_id` | UUID FKs |
| `type`, `title`, `body`, `link` | TEXT |
| `read` | BOOLEAN |

#### `stripe_events`
Idempotency log for Stripe webhook events.

| Column | Type |
|--------|------|
| `id` | TEXT (Stripe event ID `evt_*`) |
| `type`, `payload` | TEXT / JSONB |
| `handled_at` | TIMESTAMPTZ |

#### `partner_api_keys`
API keys for external partner integrations (e.g. IvyLens BD pipeline).

| Column | Type |
|--------|------|
| `label` | TEXT |
| `key_hash` | TEXT |
| `key_prefix` | TEXT |
| `permissions` | JSONB |
| `is_active` | BOOLEAN |
| `last_used_at`, `revoked_at` | TIMESTAMPTZ |

### 4.9 Learning & Content Tables

#### `learning_content`
E-learning courses and resources.

| Column | Type |
|--------|------|
| `title`, `description` | TEXT |
| `creator_name`, `category` | TEXT |
| `tags` | TEXT[] |
| `content_type` | TEXT (`video`, `pdf`, `pptx`, `link`, `scorm`) |
| `file_url` | TEXT |
| `price_pence` | INTEGER |
| `stripe_price_id` | TEXT |
| `is_published`, `is_featured` | BOOLEAN |
| `view_count` | INTEGER |

#### `learning_purchases`
Per-company purchase records.

| Column | Type |
|--------|------|
| `content_id` FK | UUID |
| `company_id` FK | UUID |
| `purchased_by` FK → profiles | UUID |
| `stripe_session_id` | TEXT |
| `amount_pence` | INTEGER |
| `status` | TEXT |
| `access_expires_at` | TIMESTAMPTZ |

---

## 5. Row-Level Security (RLS)

RLS is enabled on all tables. Two core helper functions drive policy logic:

```sql
-- Returns the company_id of the current authenticated user
my_company_id() → UUID

-- Returns true if current user is TPS staff
is_tps_staff() → BOOLEAN  (role IN ('tps_admin', 'tps_client'))
```

### General Policy Patterns

| Policy | SQL condition |
|--------|---------------|
| Clients see own data | `company_id = my_company_id()` |
| TPS staff see all | `is_tps_staff() = true` |
| TPS admin only | `role = 'tps_admin'` |
| Own user data | `id = auth.uid()` |

### Table-Specific Notable Policies

| Table | Client sees | TPS sees |
|-------|-------------|----------|
| `companies` | Own row only | All rows |
| `requisitions` | Own company | All |
| `candidates` | `approved_for_client = true` only | All |
| `ticket_messages` | `is_internal = false` only | All (including internal) |
| `bd_companies` / `bd_scanned_roles` | No access | All |
| `partner_api_keys` | No access | All |
| `stripe_events` | No access | All |
| `activity_log` | Own company | All |
| `notifications` | Own `user_id` | All |
| `internal_tasks` | No access | All |

---

## 6. Authentication & Roles

### Authentication Flow

Both apps use Supabase Auth (JWT-based, email/password). Sessions are stored as HTTP-only cookies via the Next.js Supabase SSR helper.

- **Client users** are invited via the admin portal — TPS creates their account using the service role key and sends an invitation email
- **TPS staff** accounts are created directly in Supabase Auth
- Password reset is handled via Supabase magic link

### Role Enum

```sql
CREATE TYPE user_role AS ENUM (
  'tps_admin',     -- Full TPS staff access
  'tps_client',    -- TPS staff with limited admin access
  'client_admin',  -- Client company administrator
  'client_viewer', -- Client read-only user
  'client_user'    -- Standard client user
);
```

### Role Capabilities

| Capability | `tps_admin` | `tps_client` | `client_admin` | `client_viewer` | `client_user` |
|-----------|:-----------:|:------------:|:--------------:|:---------------:|:-------------:|
| Admin portal access | ✓ | ✓ | ✗ | ✗ | ✗ |
| Client portal access | ✗ | ✗ | ✓ | ✓ | ✓ |
| Manage feature flags | ✓ | ✗ | ✗ | ✗ | ✗ |
| Invite users | ✓ | ✓ | ✓ | ✗ | ✗ |
| Approve candidates | ✓ | ✓ | ✗ | ✗ | ✗ |
| View BD intelligence | ✓ | ✓ | ✗ | ✗ | ✗ |
| See internal ticket notes | ✓ | ✓ | ✗ | ✗ | ✗ |
| Raise support tickets | ✓ | ✓ | ✓ | ✓ | ✓ |
| Approve leave | ✓ | ✓ | ✓ | ✗ | ✗ |
| Manage billing | ✓ | ✗ | View only | ✗ | ✗ |

### Auth Guards

- **Admin portal:** Middleware checks `role IN ('tps_admin', 'tps_client')` — any other role is redirected to `/auth/login`
- **Client portal:** `getSessionProfile()` on every layout render validates session, fetches role + feature_flags, and redirects to `/auth/login` if unauthenticated or if company is archived

---

## 7. Feature Flag System

Feature flags are stored per company in `companies.feature_flags` (JSONB). They control what each client can see in their portal.

### Flag Evaluation Rule

```tsx
// undefined = enabled (default on), false = disabled
if (flags.hiring === false) redirect('/dashboard');
```

### Flag Categories

**HIRE Module Flags**

| Flag | Controls |
|------|---------|
| `hiring` | Core hiring pipeline |
| `benchmarks` | Salary benchmarks page |
| `ivylens_market` | Market data from IvyLens |
| `hiring_analytics` | Hiring metrics page |
| `jd_templates` | JD template selector in new role form |
| `manatal_ats` | Manatal ATS integration |

**LEAD Module Flags**

| Flag | Controls |
|------|---------|
| `lead` | Master LEAD module flag |
| `employee_records` | Employee directory |
| `training` | Training needs |
| `reviews` | Performance reviews |
| `skills_matrix` | Skills matrix |
| `onboarding` | Onboarding workflows |
| `offboarding` | Offboarding workflows |
| `policies` | Policy acknowledgements |

**PROTECT Module Flags**

| Flag | Controls |
|------|---------|
| `protect` | Master PROTECT module flag |
| `compliance` | Compliance tracker |
| `absence` | Leave management |
| `employee_docs` | Employee documents |
| `protect_dashboard` | HR metrics dashboard |
| `protect_reports` | PROTECT CSV exports |

**General Flags**

| Flag | Controls |
|------|---------|
| `support` | Support tickets |
| `metrics` | Analytics dashboard |
| `reports` | CSV export page |
| `documents` | Company documents |
| `calendar` | Company calendar |
| `learning` | E-learning marketplace |
| `athletes_to_industry` | ATI programme access |
| `latest_updates` | News feed |

**Free Flags (never affect billing):** `friction_lens`, `latest_updates`, `athletes_to_industry`  
**Paid Flags (any true → triggers Stripe billing):** All HIRE, LEAD, PROTECT flags

---

## 8. Admin Portal

### Navigation Structure

The admin sidebar uses collapsible groups. The active group auto-expands based on current route.

```
CLIENTS
  ├── All Clients
  ├── Onboard
  ├── Users
  └── Engagement

HIRING
  ├── All Roles
  ├── JD Templates
  └── Salary Benchmarks

INTELLIGENCE
  ├── BD Pipeline
  ├── BD Roles
  └── Health Status

OPERATIONS
  ├── Internal Tasks
  ├── Activity Log
  ├── Enquiries
  ├── Service Requests
  ├── Support Tickets
  ├── Broadcast
  └── Compliance

PROGRAMMES
  ├── Athletes To Industry
  └── Development Plans

BUSINESS
  ├── Revenue
  ├── Value Reports
  ├── CSV Exports
  ├── Documents
  ├── Latest Updates
  └── E-Learning

ACCOUNT
  └── Email Settings
```

### Pages

---

#### Dashboard (`/dashboard`)

**Purpose:** Real-time operational health overview for TPS staff.

**Data displayed (all fetched in parallel, 30s revalidation):**

| Card | Data Source | Detail |
|------|-------------|--------|
| Active clients | `companies` | Count + trend |
| Total users | `profiles` | Non-admin count |
| Active roles | `requisitions` | Not filled/cancelled; top 10 with stages |
| Open tickets | `tickets` | Open + in_progress; top 10 with priority |
| Overdue compliance | `compliance_items` | Past due_date; top 8 |
| Expiring documents | `documents` | review_due_at within 30 days; top 8 |
| Pending absences | `leave_records` | Status = pending; top 8 |
| Open service requests | `service_requests` | Top 6 |
| High friction companies | `companies` | friction_band = High/Critical |
| Unassessed companies | `companies` | friction_band IS NULL |

---

#### All Clients (`/clients`)

**Purpose:** Master list of all client companies with health indicators.

**Data:** Fetched client-side from `/api/clients/summary` — parallel queries for engagement metrics per client.

**Table Columns:** Company name + logo · Active users · Friction band · Last portal login · Services · Status · Monthly retainer · Subscription status · Health indicator (active roles, open tickets, overdue compliance)

**Actions:** View detail · Archive / Unarchive · Delete

**Filters:** Search by name · Friction band · Subscription status

---

#### Client Detail (`/clients/[id]`)

**Purpose:** Full 360° view of a single client company. Tabbed interface.

| Tab | Contents |
|-----|----------|
| **Overview** | Company info, account manager, slug, Manatal ID, feature flags checklist |
| **Team** | All users with roles; send invite; resend invite; reset password |
| **Services** | Active & past services; tier; billing frequency; renewal date; monthly fee |
| **Hiring** | Roles by stage; requisition count; candidate count; friction stats |
| **Activity** | Last 50 `activity_log` entries (login, role created, ticket resolved, etc.) |
| **Notes** | CRM timeline (`client_notes`): call, meeting, email, escalation, task |
| **Documents** | Company documents; versions; expiry |
| **Compliance** | Compliance items; due dates; status; assigned user |
| **Friction** | Assessment results (band, dimensions, signals); friction items checklist |
| **Billing** | Stripe customer/subscription/price IDs; retainer amount; subscription status |
| **Settings** | Delete, archive, Manatal sync trigger |

---

#### All Roles (`/hiring`)

**Purpose:** All active requisitions across all clients.

**Columns:** Title · Company · Stage badge · Location · Working model · Friction level · Days open · Updated date

**Filters:** Company · Stage · Friction level · Working model

---

#### New Role (`/hiring/new`)

**Purpose:** Create a new requisition on behalf of a client (or from scratch).

**Form fields:** Company select · Title · Department · Seniority · Location · Working model · Employment type · Salary range (£min–£max) · JD text (textarea, fed to Friction Lens) · Must-haves (tag input) · Nice-to-haves · Reason for hire · Urgency · Interview stage count · Reporting line

**On submit:** Saves requisition → calls `/api/friction/analyze` with JD text → updates row with `friction_level` + `friction_recommendations`.

**Template support:** `?template=ID` query param pre-fills form from `jd_templates`.

---

#### Requisition Detail (`/hiring/[id]`)

**Panels:**

**Role Summary:** Title, company, department, seniority, location, salary, working model, days open. Stage dropdown to advance pipeline. Friction badge + recommendations. Assigned recruiter. Manatal status + Publish button.

**Candidates:** List with CV links, approval status, client feedback, screening score. Actions: Approve, Reject, Request Info, View CV, Add candidate.

**Interviews (`InterviewSchedulePanel`):** Per-candidate interview records. Stage number, type, datetime, duration, location/link, interviewers, status, outcome, feedback notes, client feedback. Full CRUD.

**Offers (`OfferPanel`):** Offer terms (salary, bonus, benefits, start date, notice period, contract type, working model). Status lifecycle. Sent/accepted/declined timestamps and deadline.

---

#### JD Templates (`/hiring/templates`)

Create and manage reusable job description templates. Templates can be selected when creating a new role in both admin and the client portal.

---

#### Salary Benchmarks (`/salary-benchmarks`)

Full CRUD for `salary_benchmarks`. Table showing P25/P50/P75/P90 bands by role type, location, seniority, and working model.

---

#### BD Intelligence (`/bd-intelligence`)

**Purpose:** Kanban pipeline of prospect companies discovered by the IvyLens browser extension.

**Columns:** Prospect → Contacted → Client → Not Relevant

**Card data:** Company name · Roles scanned count · Last seen · Notes

**Actions:** Drag card to update status · View scanned roles · Convert to client (creates `companies` row, auto-seeds compliance items and welcome action)

---

#### Service Requests (`/requests`)

All `service_requests` across all companies. Filter by type, urgency, status. Add response notes + mark responded.

---

#### Users (`/users`)

All non-admin profiles. Columns: Name · Email · Company · Role · Avatar. Actions: Reset password · Resend invite · Delete.

---

#### Support (`/support`)

All tickets. Filter by status, priority, company. View thread. Reply. Assign. Change status. Close.

---

#### Compliance (`/compliance`)

Cross-client RAG compliance dashboard. Overdue / amber / on-track cards. Employee document expiry alerts. Filter by company, status.

---

#### Broadcast (`/broadcast`)

Push action items to multiple client companies at once. Rich text body (TipTap editor). Creates `actions` rows with `created_by_admin = true`.

---

#### Revenue (`/revenue`)

MRR dashboard. Total retainers. Stripe subscription status per client. Churn analysis. Client lifetime value.

---

#### Activity Log (`/activity`)

Full `activity_log` table. Filter by event type and company. Shows IP address, user agent, metadata.

---

#### Engagement (`/engagement`)

Per-client engagement metrics: login count (30d), last portal login, active services count, active roles count. Sort by engagement level.

---

#### Health (`/health`)

Visual health status per company: friction band, active roles, open tickets, overdue compliance, pending absences.

---

#### Feature Flags (`/feature-flags`)

Per-company flag toggle UI. Shows all available flags as checkboxes. Saves to `companies.feature_flags`. Notifies users of newly enabled features.

---

#### Athletes To Industry (`/athletes-to-industry`)

ATI programme management. Athlete list with CV upload, download, welcome email send. CV files stored in Supabase Storage.

---

#### E-Learning (`/learning`)

Learning content library management. Publish/unpublish content. Set featured. View analytics (view count, purchases).

---

#### Email Settings (`/settings/email`)

SMTP credential management. Test email send. Email template editor.

---

## 9. Client Portal

### Navigation Structure

The portal sidebar is **feature-flag-gated** — items are hidden if their flag is `false`. Items are also **user-customisable** (reorder, hide) by `client_admin` role. Preferences are saved to `profiles.ui_preferences`.

```
Dashboard        (always visible)
HIRE             (flag: hiring)
  ├── Hiring Pipeline
  ├── Friction Lens
  ├── Benchmarks
  ├── Hiring Analytics
  ├── Cost Modeller
  ├── Vacancy Cost
  └── Internal Hiring

LEAD             (flag: lead)
  ├── Employee Records
  ├── Training Needs
  ├── Performance Reviews
  ├── Skills Matrix
  ├── Onboarding
  ├── Policy Acknowledgements
  └── Dev Plans

PROTECT          (flag: protect)
  ├── Actions
  ├── Compliance
  ├── Leave Management
  ├── Employee Documents
  ├── Offboarding
  └── HR Dashboard

Athletes To Industry
Calendar
Support          (flag: support)
Billing          (client_admin only, if paid plan)
Settings
```

**Notification badge counts (pre-fetched SSR):**

| Nav item | Counts |
|----------|--------|
| HIRE | Candidates with `approved_for_client=true` and `client_status='pending'` |
| PROTECT → Actions | Active actions (status='active') |
| Support | Open + in-progress tickets |
| PROTECT → Compliance | Pending or overdue compliance items |

---

### Pages

---

#### Dashboard (`/dashboard`)

**Purpose:** Company homepage — snapshot of everything active.

| Card | Source |
|------|--------|
| Greeting + company name | Profiles + companies |
| Account manager | `companies.account_owner_id` → profiles |
| Active roles (top 5) | `requisitions` |
| Documents awaiting review | `documents` (review_due_at ASC) |
| Open support tickets (top 5) | `tickets` |
| Pending compliance items (top 5) | `compliance_items` |
| Active services | `client_services` |
| Active actions | `actions` |
| Training needs (if LEAD on) | `training_needs` |
| Pending absences (if PROTECT on) | `leave_records` |
| Friction assessment summary | `company_assessments` |

---

#### HIRE — Hiring Pipeline (`/hire/hiring`)

All requisitions for the company. Filter by stage. Sub-pages:

- `/hire/hiring/[id]` — Requisition detail: candidates, interviews, offers, Manatal pipeline (if enabled)
- `/hire/hiring/new` — Raise a new role; includes template selector (if `jd_templates` flag on)
- `/hire/hiring/analytics` — Hiring pipeline analytics

Candidates the client sees are filtered to `approved_for_client = true`. Client can provide feedback (`client_status`, `client_feedback`) on each candidate.

---

#### HIRE — Friction Lens (`/hire/friction-lens`)

Company's friction assessment results: overall band, dimension breakdown, top signals. Friction items checklist — admin-created items visible to client; client can mark items complete.

---

#### HIRE — Salary Benchmarks (`/hire/benchmarks`)

Compare their active roles' salary ranges against P25/P50/P75/P90 market benchmarks. Filter by role type, location, seniority.

---

#### HIRE — Cost Modeller (`/hire/cost-modeller`)

Interactive calculator: salary + interview stages + location + urgency → estimated time-to-fill + projected hiring cost.

---

#### HIRE — Vacancy Cost (`/hire/vacancy-cost`)

Dashboard of open roles with estimated cost-per-day of vacancy. Urgency visual indicators.

---

#### LEAD — Employee Records (`/lead/employee-records`)

Full CRUD on `employee_records`. Columns: name, email, job title, department, employment type, status, start date. Filter by department, status, employment type.

---

#### LEAD — Training Needs (`/lead/training`)

Create and manage `training_needs` entries. Priority/status lifecycle.

---

#### LEAD — Skills Matrix (`/lead/skills`)

View and update `skills_matrix` entries. Visual 0–5 scale per skill. Gap identification.

---

#### LEAD — Performance Reviews (`/lead/reviews`)

Create, assign, and complete `performance_reviews`. Rating system and review period tracking.

---

#### LEAD — Onboarding (`/lead/onboarding`)

Template selection + per-employee instance creation. Task-by-task progress tracking. Percentage completion indicator.

---

#### LEAD — Policy Acknowledgements (`/lead/policy-acknowledgements`)

View document sign-off status per employee. Resend requests. Filter by overdue status.

---

#### PROTECT — Actions (`/protect/actions`)

All active `actions` for the company. Priority badge. Actions: Mark complete · Dismiss · Snooze.

---

#### PROTECT — Compliance (`/protect/compliance`)

Full compliance tracker. Status advancement (pending → in_review → complete). Overdue items highlighted. Filter by category and status.

---

#### PROTECT — Leave Management (`/protect/absence`)

Submit and manage `leave_records`. Approval workflow (pending → approved/rejected). Balance calculation per employee. Annual leave, sick days, maternity, etc.

---

#### PROTECT — Employee Documents (`/protect/employee-docs`)

Upload and manage `employee_documents`. Expiry date tracking. Colour-coded status (valid/expiring_soon/expired).

---

#### PROTECT — HR Dashboard (`/protect/hr-dashboard`)

`hr_metrics` KPI display. Period selector. Headcount, turnover rate, absence rate, gender split, average tenure.

---

#### Support (`/support`)

All company tickets. Create new. View thread. Reply. Priority and status display.

---

#### Calendar (`/calendar`)

Company calendar showing `company_calendar_events` + approved `leave_records`. iCal export.

---

#### Billing (`/billing`)

Stripe billing portal session (hosted by Stripe). Shows current plan, monthly retainer, next renewal, invoices, payment method. Visible to `client_admin` only.

---

#### Settings (`/settings`)

User preferences: profile details, password change. Sidebar customisation (reorder, hide/show items). Email notification preferences.

---

## 10. How the Two Apps Connect

The admin and client portal are two separate Next.js applications but share a single Supabase project. This is the technical foundation of their connection.

### Shared Infrastructure

```
┌─────────────────────────────────────────────────┐
│              Supabase (single project)           │
│                                                  │
│  Same database ─────────────────────────────┐   │
│  Same auth (JWT, same secret) ──────────────┤   │
│  Same storage bucket ───────────────────────┘   │
└─────────────────────────────────────────────────┘
         ▲                        ▲
         │                        │
  Admin portal            Client portal
  (TPS staff)            (client companies)
```

### The Data Handoff Points

Every meaningful action in the admin portal has a corresponding reflection in the client portal. These are not separate data stores — they are different views of the same rows, controlled by RLS.

#### Hiring Pipeline

| Admin does | Client sees |
|-----------|-------------|
| Creates `requisitions` row | Role appears in `/hire/hiring` |
| Sets `approved_for_client = true` on candidate | Candidate appears under that role |
| Sets `client_status` / `client_feedback` | Client can see and respond |
| Creates `interview_schedules` | Client views interview details |
| Creates `offers` row | Client sees offer details |
| Sets `requisitions.stage = 'filled'` | Role moves to archive in client portal |

#### Compliance & Documents

| Admin does | Client sees |
|-----------|-------------|
| Creates `compliance_items` rows | Visible in `/protect/compliance` |
| Creates `documents` rows | Visible in `/documents` |
| Sets `documents.requires_approval = true` | Action item raised for client |
| Creates `policy_acknowledgements` | Client receives acknowledgement request |

#### Actions & Communications

| Admin does | Client sees |
|-----------|-------------|
| Creates `actions` row (or broadcasts) | Action appears in `/protect/actions` with badge count |
| Replies to `tickets` with `is_internal = false` | Client sees message in ticket thread |
| Sets `service_requests.response_notes` | Client sees admin response on their request |
| Creates `milestones` rows | Client sees roadmap |

#### Feature Flags

| Admin does | Effect on client portal |
|-----------|------------------------|
| Sets `feature_flags.hiring = false` | Client portal hides HIRE nav item; accessing `/hire/*` redirects to dashboard |
| Enables `lead` flag | LEAD nav group appears; all LEAD pages become accessible |
| Toggles any flag | `layout.tsx` re-reads flags on next page load — no client-side flag caching |

#### User Management

| Admin does | Client effect |
|-----------|---------------|
| Creates user via `/api/invite` | User receives invite email via Supabase Auth; can set password and log in to portal |
| Resets password | User receives reset email |
| Deletes profile | User loses portal access immediately (RLS denies queries) |

### The RLS Boundary

The RLS layer is what makes this two-app model secure. Because both apps share the same Supabase anon/service key infrastructure:

- **Admin app** uses the **service role key** for operations that need to bypass RLS (user creation, cross-company queries)
- **Client portal** uses the **session-scoped client** — every query is automatically filtered by the authenticated user's `company_id` via RLS policies
- There is no risk of a client portal user accidentally seeing another company's data — the database enforces it at query time

### Candidate Visibility Gate

This is the most important handoff in the system:

```
Admin creates candidate → approved_for_client = false (default)
         ↓
Admin reviews, decides to share
         ↓
Admin sets approved_for_client = true
         ↓
RLS policy allows client to SELECT this candidate row
         ↓
Client sees candidate in their portal (client_status = 'pending' initially)
         ↓
Client sets client_status = 'approved' or 'rejected' + client_feedback
         ↓
Admin sees client feedback in RequisitionPanel
```

### Ticket Internal Notes

Ticket messages have an `is_internal` boolean. Admin can write notes visible only to TPS staff (`is_internal = true`). The RLS policy on `ticket_messages` filters these out for client users automatically.

---

## 11. Key Workflows End-to-End

### New Client Onboarding

```
1. BD prospect converted in admin (bd_intelligence page)
   → POST /api/bd-companies/[id]/convert
   → Creates companies row
   → Auto-seeds: standard compliance_items + welcome actions
   
2. TPS staff configure company in admin client detail:
   → Set feature_flags (which modules to enable)
   → Set account_owner_id (assigned TPS manager)
   → Set monthly_retainer_pence
   
3. Stripe setup triggered (if any paid flag):
   → Create Stripe Customer
   → Create Stripe Price (unit_amount = monthly_retainer_pence)
   → Create Stripe Subscription (recurring monthly)
   → Save stripe_customer_id + stripe_subscription_id to companies row
   
4. Invite client users:
   → POST /api/invite with email + company_id + role
   → Supabase inviteUserByEmail (service role)
   → Creates profiles row
   → Candidate receives email with password setup link
   
5. Client user sets password → logs in → portal onboarding wizard
   → On complete: profiles.onboarding_completed = true
   → Redirected to dashboard
```

### Full Hiring Lifecycle

```
1. Role raised (admin or client via portal new role form)
   → requisitions row created (stage = 'submitted')
   → Friction Lens scores JD automatically
   
2. Admin advances stage to 'in_progress' (sourcing)
   → Assigns recruiter
   → Optionally publishes to Manatal (creates Manatal job posting)
   
3. Candidates added by admin:
   → candidates rows created
   → CV uploaded to Supabase Storage
   → Screening score added
   → approved_for_client set to true when ready to share
   
4. Client reviews candidates in portal:
   → client_status updated (approved/rejected)
   → client_feedback recorded
   
5. Interviews scheduled:
   → interview_schedules rows created per candidate
   → Multiple stages supported (1st/2nd/3rd interview)
   → Outcome recorded per interview
   
6. Offer made:
   → offers row created (status = 'draft')
   → Status progressed: sent → verbal_accepted → written_accepted
   → Timestamps recorded at each stage
   
7. Role filled:
   → requisitions.stage = 'filled'
   → Role archived in client portal
   → Activity log event recorded
```

### Stripe Billing Change

```
Admin updates monthly retainer for a client:
   → POST /api/clients/[id]/retainer { new_amount_pence }
   → Create new Stripe Price (new unit_amount)
   → Update Stripe Subscription to new Price (with proration)
   → Save new stripe_price_id to companies row

Stripe fires subscription.updated webhook:
   → POST /api/stripe/webhook
   → Event logged in stripe_events (idempotency check)
   → companies.subscription_status updated
```

### Leave Approval

```
Employee submits leave request:
   → leave_records row created (status = 'pending')
   → Notification sent to client_admin

Manager reviews in portal (/protect/absence):
   → Approves: POST /api/portal/leave/[id]/approve
     → status = 'approved', approved_at, approved_by set
   → Denies: POST /api/portal/leave/[id]/deny
     → status = 'rejected'

Alternatively: email link approval
   → POST /api/leave/[token] (tokenised link in email)
   → Same approval/denial logic
   
Balance recalculated: annual_leave_allowance - SUM(approved days for leave year)
```

### Policy Acknowledgement

```
Admin uploads policy document:
   → documents row created
   → requires_approval = true

System creates policy_acknowledgements rows for all active employees:
   → status = 'pending', sent_at recorded

Employee receives email → clicks link OR uses portal:
   → policy_acknowledgements.acknowledged_at set
   → status = 'acknowledged'

Overdue check:
   → If due_date passed and not acknowledged → status = 'overdue'
   → Appears in compliance dashboard
```

---

## 12. API Routes Reference

### Admin App (`/admin/src/app/api/`)

#### Client Management
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/admin/clients` | Create new client (with optional Stripe setup) |
| GET | `/api/clients/summary` | Client list with engagement metrics |
| PATCH | `/api/clients/[id]` | Update client details |
| POST | `/api/clients/[id]/archive` | Archive client |
| POST | `/api/clients/[id]/feature-flags` | Update feature flags |
| POST | `/api/clients/[id]/raise-invoice` | Create one-off Stripe invoice |
| POST | `/api/clients/[id]/retainer` | Update monthly retainer (reprices Stripe subscription) |
| POST | `/api/clients/[id]/manatal-sync` | Sync client to Manatal ATS |

#### Hiring
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/admin/requisitions/[id]/manatal-publish` | Publish role to Manatal job board |
| POST | `/api/friction/analyze` | Score a JD via IvyLens Friction Lens API |

#### Users
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/invite` | Create auth user + profile, send invite email |
| POST | `/api/users/[id]/reset-password` | Send password reset link |
| POST | `/api/users/[id]/resend-invite` | Resend invite email |

#### Compliance & Documents
| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/admin/compliance` | List or create compliance items |
| PATCH | `/api/admin/compliance/[id]` | Update status/due date |
| GET/POST | `/api/admin/employee-documents` | Employee document management |

#### Athletes To Industry
| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/admin/athletes` | List or create athletes |
| POST | `/api/admin/athletes/[id]/cv` | Upload CV to Supabase Storage |
| POST | `/api/admin/athletes/[id]/welcome-email` | Send welcome email |

#### Content & Feeds
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/admin/feed-sources` | Add RSS feed source |
| POST | `/api/admin/feed-sources/[id]/refresh` | Refresh a single RSS feed |
| POST | `/api/admin/latest-updates/ingest` | Ingest new articles |
| POST | `/api/cron/ingest-feeds` | Vercel Cron: ingest all feeds |
| POST | `/api/cron/prune-latest-updates` | Vercel Cron: delete old articles |

#### Billing & Webhooks
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/stripe/webhook` | Handle Stripe events (subscription updates, invoice.paid) |

#### Misc Admin
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/broadcast` | Create broadcast action items for multiple companies |
| POST | `/api/admin/logos` | Upload company logo to storage |
| POST | `/api/brand-extract` | Extract logo/metadata from company website |
| GET/POST | `/api/admin/settings/smtp` | Read/set SMTP credentials |
| POST | `/api/admin/settings/smtp/test` | Test email via SMTP |
| POST | `/api/ivylens/probe` | Health check IvyLens API |
| POST | `/api/bd-ivylens-dismiss` | Dismiss a BD opportunity card |

---

### Portal App (`/portal/src/app/api/`)

#### Actions
| Method | Route | Purpose |
|--------|-------|---------|
| PATCH | `/api/actions/[id]` | Mark complete, dismiss, or snooze action |

#### Support
| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/support/tickets` | List or create support tickets |
| PATCH | `/api/support/tickets/[id]` | Update ticket |
| GET | `/api/support/poll` | Poll for new ticket messages |

#### Leave
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/leave/[token]` | Token-based leave approve/deny (email link) |
| POST | `/api/portal/leave/[id]/approve` | App-based leave approval |
| POST | `/api/portal/leave/[id]/deny` | App-based leave denial |

#### Billing & Learning
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/billing/portal-session` | Generate Stripe billing portal session URL |
| POST | `/api/learning/checkout` | Initiate Stripe checkout for course purchase |
| POST | `/api/learning/webhook` | Handle Stripe success → create purchase record |

#### Friction Lens & Assessment
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/company/assessment` | Submit company friction assessment |
| GET | `/api/company/form-schema` | Get assessment form questions |
| GET | `/api/company/results` | Get latest assessment results |
| POST | `/api/friction/analyze` | Client-facing JD friction scoring |

#### Manatal Integration
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/manatal/matches/route` | Fetch live Manatal candidates |
| POST | `/api/manatal/matches/move-stage` | Move candidate stage in Manatal |

#### Partner APIs
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/partner/bd/leads` | Partner API: fetch BD leads (requires API key) |
| POST | `/api/partner/company/assessment` | Partner API: submit company assessment |

#### Misc Portal
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/auth/set-password` | User sets initial password (from invite link) |
| GET | `/api/athletes` | List athletes for portal browse |
| POST | `/api/onboarding/employee` | Submit new employee record |

---

## 13. Third-Party Integrations

### Supabase

- **PostgreSQL** — Primary database (all tables, RLS, enums, migrations)
- **Auth** — JWT-based authentication, magic links, invite emails
- **Storage** — CVs, company documents, logos, learning content files
- **Realtime** — Notifications, activity log live updates

### Stripe

- **Subscriptions** — Monthly recurring billing per client; price updates with proration
- **Invoices** — One-off invoice creation for ad-hoc charges
- **Checkout** — E-learning course purchases
- **Billing Portal** — Client self-service (card management, invoice download)
- **Webhooks** — `subscription.updated`, `invoice.paid` → update `companies` row

### IvyLens / Friction Lens API

- **JD Scoring** — `POST /api/friction/analyze` sends JD text → returns friction score (0–100), level, and recommendations
- **Company Assessment** — Multi-question form → returns overall friction band, dimensions, signals, benchmarks
- **BD Intelligence** — Browser extension scrapes job boards → POSTs to `/api/partner/bd/leads` using `partner_api_keys`
- **Environment variable:** `IVYLENS_API_URL`

### Manatal ATS

- **Job Publishing** — Admin publishes role from requisition detail → creates Manatal job posting
- **Candidate Pipeline** — Portal hiring page fetches live candidates from Manatal when `manatal_client_id` is set
- **Stage Movement** — Client can advance candidates through Manatal stages directly from portal
- **Environment variables:** `MANATAL_API_KEY`, `MANATAL_API_URL`

### SMTP / Email

- Configurable per deployment (admin settings page)
- Used for: user invites, password resets, leave approval links, policy acknowledgement requests, notifications
- Credentials stored encrypted; test endpoint available

### Vercel

- **Hosting** — Both apps deployed to Vercel Pro
- **Edge functions** — Middleware for auth session validation
- **ISR** — Incremental Static Regeneration on high-traffic pages (30s revalidation)
- **Cron jobs** — RSS feed ingestion, article pruning

---

## 14. Infrastructure & Deployment

### Environment Variables

```bash
# Both apps
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Admin only
SUPABASE_SERVICE_ROLE_KEY=       # Auth admin operations, bypasses RLS

# Portal only
IVYLENS_API_URL=                 # Friction Lens scoring endpoint
MANATAL_API_KEY=                 # Manatal ATS
MANATAL_API_URL=                 # Default: https://api.manatal.com/open/v1

# Portal only (Stripe / E-learning)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

### Supabase Clients

```tsx
// Server component or route handler — uses anon key + session cookie (RLS applied)
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Admin operations that bypass RLS — uses service role key
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

// Client component — uses session token (RLS applied)
import { createClient } from '@/lib/supabase/client';
```

### Caching Strategy

| Context | Strategy |
|---------|---------|
| Dashboard stats | `revalidate: 30` (30s ISR) |
| Active companies list | `revalidate: 60` with `companies-active` cache tag |
| Client detail | Server-side cache (`lib/cache/clientDetail.ts`) |
| Feature flags | **No caching** — read fresh on every layout render |
| Candidate/ticket counts | Pre-fetched SSR in portal layout |

### Storage Organisation

```
Supabase Storage:
├── cvs/                    # Candidate CVs (private, RLS-protected)
├── documents/              # Company documents (private)
├── employee-documents/     # Employee-specific documents (private)
├── logos/                  # Company logos (public)
└── learning/               # E-learning content files (access-controlled)
```

### Vercel Cron Schedule

```
POST /api/cron/ingest-feeds        → Every 4 hours (RSS ingestion)
POST /api/cron/prune-latest-updates → Daily (delete articles >30 days old)
```

---

*End of specification. Last updated: June 2026.*
