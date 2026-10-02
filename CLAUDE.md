# Ravello HR: Claude Code Context

## Project Overview

**Ravello HR** is a two-app HR SaaS platform built for **The People System** (The People System), an HR consultancy. The People System's clients are SME companies who access a client portal; The People System's internal staff use an admin portal to manage those clients.

- **Admin app**: internal The People System staff only. Manage clients, BD pipeline, hiring, compliance, service requests.
- **Portal app**: client companies. See their hiring pipeline, compliance, actions, documents, support, metrics.

---

## Architecture

```
/home/user/Ravello-HR/
├── admin/          # Next.js 14 app: internal The People System admin
├── portal/         # Next.js 14 app: client portal
├── supabase/
│   └── migrations/ # SQL migration files
└── CLAUDE.md
```

Both apps share a single **Supabase** project (same DB, same auth).

---

## Tech Stack

- **Framework**: Next.js 14 App Router (server components for data, client components for interactivity)
- **Database**: Supabase (PostgreSQL + RLS + Auth)
- **Storage**: Supabase Storage (files/documents): Vercel Blob available for large video
- **Styling**: Tailwind CSS + CSS custom properties (no component library)
- **TypeScript**: strict throughout
- **Icons**: lucide-react
- **Payments**: Stripe — fully integrated. E-learning checkout/webhook
  (`portal/src/lib/stripe.ts`, `api/learning/checkout`, `api/learning/webhook`)
  and client retainer/invoice billing (`admin/src/lib/stripe.ts`,
  `api/stripe/webhook`, `api/admin/clients/[id]/retainer`,
  `raise-invoice`). This line said "not yet integrated" long after
  Phases 16-18 and the retainer billing work shipped — corrected
  2026-09-25 during a documentation-accuracy pass; see "What Has Been
  Built" for the phases that actually built it.
- **Deployment**: Vercel Pro

---

## Key Conventions

### Server vs Client components
```tsx
// Server component: data fetching (default)
export default async function Page() {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase.from('table').select('*');
  return <ClientComponent data={data} />;
}

// Client component: interactivity
'use client';
export default function ClientComponent({ data }: Props) { ... }
```

### Parallel data fetching (always do this: no waterfalls)
```tsx
const [{ data: a }, { data: b }, { data: c }] = await Promise.all([
  supabase.from('table_a').select('*'),
  supabase.from('table_b').select('*'),
  supabase.from('table_c').select('*'),
]);
```

### Supabase clients
```tsx
// Server component / route handler
import { createServerSupabaseClient } from '@/lib/supabase/server';
const supabase = createServerSupabaseClient();

// Client component
import { createClient } from '@/lib/supabase/client';
const supabase = createClient();

// Admin operations (invite users etc): service role key
// Used in: admin/src/app/api/invite/route.ts
```

### Count queries (no row fetch)
```tsx
const { count } = await supabase
  .from('table')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'active');
```

### Feature flags
```tsx
// companies.feature_flags JSONB column
// { hiring: true, documents: true, reports: false, support: true, metrics: false, compliance: false }
// Check: flags.X === false (not !flags.X) so undefined/null defaults to ENABLED
const flags = company.feature_flags ?? {};
if (flags.metrics === false) redirect('/dashboard');
```

### Router refresh after mutations
```tsx
import { useRouter } from 'next/navigation';
const router = useRouter();
// After DB write:
router.refresh(); // re-runs server component data fetch
```

---

## CSS Design System

Both apps use CSS custom properties. Always use these: never hardcode colours.

```css
/* Colours */
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
--line:         rgba(7,11,29,0.08)  /* borders */

/* Layout */
--sidebar-w:    256px
--topbar-h:     60px

/* Gradients */
--gradient:     linear-gradient(135deg, #EA3DC4 0%, #7C3AED 45%, #3B6FFF 100%)
--gradient-cta: linear-gradient(135deg, #7C3AED 0%, #5A2AC8 100%)
```

### CSS utility classes (defined in globals.css)
```
.card           : white rounded card with border
.btn-cta        : purple gradient primary button
.btn-secondary  : bordered secondary button
.btn-ghost      : transparent ghost button
.btn-icon       : square icon button
.btn-sm         : small size modifier
.input          : form input / select / textarea
.label          : form field label
.table-wrapper  : scrollable table container
.table          : styled table
.badge          : inline status pill
.empty-state    : centered empty state block
.portal-page    : portal main content padding
font-display    : Plus Jakarta Sans (headings)
```

### Badge variants
```
.badge-urgent / .badge-high / .badge-normal / .badge-low
.badge-open / .badge-inprogress / .badge-resolved
.badge-inactive
```

---

## Database Schema

### Core tables

| Table | Purpose |
|-------|---------|
| `companies` | Client companies. Has `feature_flags` JSONB, `name`, `slug`, `sector`, `size_band`, `contact_email`, `active` |
| `profiles` | Auth users. Has `company_id`, `email`, `full_name`, `role` (enum: `tps_admin`, `tps_client`, `client_admin`, `client_viewer`, `client_user`) |
| `requisitions` | Hiring requisitions. Has `company_id`, `title`, `department`, `seniority`, `salary_range`, `location`, `employment_type`, `description`, `must_haves` (TEXT[]), `stage` (enum), `assigned_recruiter`, `friction_score` (JSONB) |
| `candidates` | Candidates per requisition. Has `requisition_id`, `company_id`, `full_name`, `email`, `cv_url`, `summary`, `approved_for_client`, `client_status` (enum: `pending/shared/approved/rejected`), `client_feedback` |
| `documents` | Company documents. Has `company_id`, `name`, `category`, `file_url`, `file_size`, `version`, `review_due_at` |
| `tickets` | Support tickets. Has `company_id`, `subject`, `description`, `status`, `priority`, `resolved_at` |
| `ticket_messages` | Thread messages on tickets. Has `ticket_id`, `sender_id`, `body`, `is_internal` |
| `service_requests` | HR service requests. Has `company_id`, `request_type`, `subject`, `details` (JSONB), `urgency`, `status`, `response_notes`, `responded_at` |
| `actions` | Client action items. Has `company_id`, `action_type`, `title`, `priority`, `status`, `completed_at` |
| `milestones` | Roadmap milestones. Has `company_id`, `pillar`, `title`, `status`, `quarter`, `due_date` |
| `client_services` | Services sold to clients. Has `company_id`, `service_name`, `service_tier`, `start_date`, `monthly_fee`, `status` |
| `compliance_items` | Compliance tasks. Has `company_id`, `title`, `category`, `status`, `due_date`, `notes` |
| `bd_companies` | BD prospect companies. Has `company_name`, `status`, `notes`, `total_roles_seen` |
| `bd_scanned_roles` | Scraped job listings per BD company |

### Enums (PostgreSQL)

**Read from `pg_enum`, not from the migration files.** Migrations here are
applied BY HAND in the Supabase SQL editor, so a `.sql` file on disk is a record
of intent, not proof of what the database contains. This block was wrong about
four of six enums until 2026-08-26 — it documented `briefing`/`sourcing`/
`screening`/`interviewing` stages, a `compliance` doc category and a
`client_viewer` role, none of which have ever existed, while omitting
`hired`, `shortlist_ready`, `letter` and `client_editor`, which do.

Verified live (project `sbmekaviwkiyorvmtgcu`) after migration 078:

```sql
hiring_stage:            submitted | in_progress | shortlist_ready | interview | offer | filled | cancelled
candidate_client_status: pending | approved | rejected | info_requested | hired | shared
doc_category:            contract | policy | letter | report | other | handbook
user_role:               client_admin | client_user | tps_admin | tps_client | client_editor | hs_provider
ticket_status:           open | in_progress | resolved | closed
ticket_priority:         low | normal | high | urgent
compliance_status:       pending | in_review | complete | overdue
leave_status:            pending | approved | rejected | cancelled
email_log_target:        athlete | company | candidate
```

To re-verify:

```sql
SELECT t.typname, string_agg(e.enumlabel, ' | ' ORDER BY e.enumsortorder)
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' GROUP BY t.typname ORDER BY t.typname;
```

**A string literal for an enum is checked by nothing until Postgres rejects it.**
Three live sites wrote or read values the database did not have — `'shared'`
(admin candidates page), `'pending_approval'` (the portal's new-role form, so a
client pressing Submit got an error and no requisition) and `'handbook'` (the
Policy Acknowledgements filter, dead entirely). Each failed with a 22P02 on a
path whose error surfaced only to a `setError()` nobody read.

So `lib/ui/statusMaps.ts` now carries the vocabularies as `as const` tuples with
derived unions, and the label maps are typed against them. **When a migration
touches an enum, update the matching tuple in that file** — the `statusMaps`
test pins each label map against its tuple in both directions, so a label for a
value that cannot exist and a live value with no label both fail the suite.
`statusMaps.ts` is one of the byte-identical shared-dupe pairs
(`scripts/check-shared-dupes.sh`), so mirror the edit to both apps.

---

## File Structure

### Admin app
```
admin/src/
├── app/
│   ├── (admin)/
│   │   ├── layout.tsx           # sidebar + topbar shell
│   │   ├── dashboard/page.tsx   # admin dashboard
│   │   ├── clients/
│   │   │   ├── page.tsx         # clients list
│   │   │   └── [id]/
│   │   │       ├── page.tsx     # client detail (parallel fetches)
│   │   │       └── ClientDetailTabs.tsx  # tabbed UI (client component)
│   │   ├── hiring/
│   │   │   ├── page.tsx         # requisitions list
│   │   │   ├── HiringClient.tsx # filterable table
│   │   │   ├── new/
│   │   │   │   ├── page.tsx
│   │   │   │   └── AdminNewRoleForm.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── RequisitionPanel.tsx
│   │   ├── bd-intelligence/page.tsx  # BD pipeline
│   │   ├── requests/
│   │   │   ├── page.tsx
│   │   │   └── RequestsClient.tsx    # service requests + response notes
│   │   ├── users/
│   │   │   ├── page.tsx
│   │   │   └── UsersClient.tsx
│   │   ├── documents/page.tsx
│   │   ├── reports/page.tsx
│   │   ├── roadmap/page.tsx
│   │   └── support/page.tsx
│   ├── api/
│   │   └── invite/route.ts      # POST: creates auth user + profile
│   └── auth/                    # login pages
├── components/
│   ├── layout/
│   │   ├── AdminSidebar.tsx
│   │   └── AdminTopbar.tsx
│   └── modules/
│       ├── BDCompanyModal.tsx   # BD prospect modal + Convert to Client
│       ├── InviteUserPanel.tsx  # inline user invite form
│       ├── FeatureFlagToggles.tsx
│       └── ...
└── lib/
    ├── supabase/server.ts
    ├── supabase/client.ts
    └── frictionLens.ts          # friction scoring heuristic
```

### Portal app
```
portal/src/
├── app/
│   ├── (portal)/
│   │   ├── layout.tsx           # fetches flags + notification counts, renders Sidebar
│   │   ├── dashboard/page.tsx
│   │   ├── hiring/page.tsx      # requisitions + candidates
│   │   ├── compliance/page.tsx  # compliance tracker
│   │   ├── metrics/page.tsx     # analytics dashboard (flag gated)
│   │   ├── actions/page.tsx
│   │   ├── documents/page.tsx
│   │   ├── support/
│   │   │   ├── page.tsx         # tickets + service requests
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── roadmap/page.tsx
│   │   └── reports/page.tsx
│   └── auth/
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx          # nav with feature-flag gating + notification badges
│   │   └── Topbar.tsx
│   └── modules/
│       ├── ActionButtons.tsx
│       ├── DocumentUpload.tsx
│       └── ...
└── lib/
    ├── supabase/server.ts
    ├── supabase/client.ts
    └── frictionLens.ts
```

---

## Sidebar Navigation

### Portal sidebar items (with feature flags)
```tsx
{ href: '/dashboard',   label: 'Dashboard',   icon: LayoutDashboard }
{ href: '/hiring',      label: 'Hiring',       icon: Briefcase,    flag: 'hiring'     }
{ href: '/actions',     label: 'Actions',      icon: CheckSquare                      }
{ href: '/compliance',  label: 'Compliance',   icon: ShieldCheck,  flag: 'compliance' }
{ href: '/metrics',     label: 'Metrics',      icon: TrendingUp,   flag: 'metrics'    }
{ href: '/reports',     label: 'Reports',      icon: BarChart2,    flag: 'reports'    }
{ href: '/documents',   label: 'Documents',    icon: FileText,     flag: 'documents'  }
{ href: '/support',     label: 'Support',      icon: LifeBuoy                         }
{ href: '/roadmap',     label: 'Roadmap',      icon: Map                              }
{ href: '/settings',    label: 'Settings',     icon: Settings                         }
```

### Notification badge counts (fetched in portal layout.tsx)
```tsx
// COUNT_KEY map in Sidebar.tsx
'/actions'     → 'actions'     // active actions
'/support'     → 'tickets'     // open/in-progress tickets
'/hiring'      → 'candidates'  // pending candidates (approved_for_client=true, client_status=pending)
'/compliance'  → 'compliance'  // pending/overdue compliance items
```

---

## API Routes

### POST /api/invite (admin only)
```typescript
// Body: { email, company_id, role?, full_name? }
// role must be 'client_admin' | 'client_viewer'
// Uses supabase service role key (SUPABASE_SERVICE_ROLE_KEY)
// Creates auth user via inviteUserByEmail + upserts profile
```

---

## Friction Lens

Scoring system for requisitions. Scores 0-100 on 5 dimensions:
- `location`: remote/hybrid score better
- `salary`: above-market scores better
- `skills`: fewer must-haves scores better
- `working_model`: flexibility score
- `process`: stage/speed score

```tsx
import { scoreFriction } from '@/lib/frictionLens';
const result = scoreFriction(requisitionData);
// Returns: { overall, dimensions: { location, salary, skills, working_model, process }, recommendations }
```

Exists in both apps: `admin/src/lib/frictionLens.ts` and `portal/src/lib/frictionLens.ts`

---

## Environment Variables

**Consolidated 2026-09-30 (Core-OS 360 Phase 19, Group 1)** — the list
below was rebuilt from every live `process.env.X` reference in both
apps' source (a plain `grep`, not memory of earlier phase notes), the
gap the Phase 17 Group 3 adversarial review flagged and deliberately
left for this pass rather than fixing piecemeal. It replaces the old
partial list, which stopped tracking new vars after Phase 29 and had
drifted (it named `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, which no code
in either app actually reads — Stripe Checkout here is server-side
only, via `stripe.checkout.sessions.create()`, so no publishable key is
ever needed client-side; removed rather than carried forward as a
phantom requirement).

```
# Both apps — Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=                  # server-only fallback some routes check
                                # ahead of NEXT_PUBLIC_SUPABASE_URL

# Admin only — Supabase
SUPABASE_SERVICE_ROLE_KEY=     # auth admin operations, service-role writes

# Both apps — session signing (security-critical: 088/093's cached-role
# cookie and the portal's own session cookie are both HMAC-signed with
# these; unset means every request re-checks via RPC instead of trusting
# a signed cookie — slower, never open, per the "A failed role check is
# not a 'no'" rule elsewhere in this file)
ADMIN_SESSION_SECRET=          # admin only
PORTAL_SESSION_SECRET=         # portal only

# Both apps — cross-app links (each app's own adminUrl.ts/portalUrl.ts
# falls back to a hardcoded production URL if unset)
NEXT_PUBLIC_ADMIN_URL=
NEXT_PUBLIC_PORTAL_URL=

# Both apps — outbound email (Resend)
RESEND_API_KEY=
EMAIL_FROM=                    # defaults to noreply@portal.thepeoplesystem.co.uk
EMAIL_REPLY_TO=                # defaults to hello@thepeoplesystem.co.uk
EMAIL_BCC_INTERNAL=            # comma-separated; blank sends no BCC

# Admin only — cron auth (every /api/cron/* route checks this; unset
# CRON_SECRET was the untouched blocker in the 2026-09-04 cron-307 outage
# above — this is the SECOND, always-checked gate, not the same bug)
CRON_SECRET=

# Admin only — automation kill switch (Phase 43's "everything has
# consequences" sweep). Unset or any value besides '1'/'true' runs normally.
AUTOMATION_DISABLED=

# Both apps: Manatal ATS integration (Phase 29) — portal reads the
# pipeline (its own proxy routes), admin publishes/matches/hydrates
MANATAL_API_KEY=
MANATAL_API_URL=                    # defaults to https://api.manatal.com/open/v1
MANATAL_HYDRATION_BUDGET_MS=        # admin only; defaults to 20000
MANATAL_ORG_INDUSTRY_FIELD=         # admin only; defaults to 'industry'
MANATAL_ORG_INDUSTRY=               # admin only; defaults to 'TPS' — see
                                     # "Deliberately NOT renamed" in the
                                     # rebrand section: a Manatal lookup
                                     # key, not a display label

# Admin + portal: IvyLens Friction Lens / referral scoring
IVYLENS_API_KEY=               # needed on BOTH apps since the referral
                                # pipeline moved scanning into admin (Phase 41)
IVYLENS_API_URL=

# Admin + portal: Jev (TypeSafe AI) — every caller no-ops without a key
JEV_API_KEY=
JEV_API_URL=                    # defaults to https://api.typesafe.ai/v1/systemone
JEV_MODEL=                      # pin one in production
JEV_DISABLED=                   # any value disables every Jev call

# Admin only: Tavily regulatory research (Core-OS 360 Phase 17)
TAVILY_API_KEY=                 # without it every "Run Tavily search" call
                                 # on the Legal Register page returns "not configured"
TAVILY_API_URL=                 # defaults to https://api.tavily.com/search

# Both apps — Stripe, but for TWO SEPARATE integrations, each with its
# own Stripe key/webhook secret configured on that app's own Vercel
# project: admin's is client retainer/invoice billing
# (lib/stripe.ts, api/stripe/webhook — see the Tech Stack section
# above); portal's is e-learning checkout (Phase 18, the phase-
# numbering kind, not Core-OS 360 Phase 18 — see the numbering note
# below). Same variable NAMES, deliberately unrelated values.
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
LEARNING_ACCESS_DAYS=           # portal only; defaults to 7; access-window
                                 # length after an e-learning purchase

# Admin only: referral pipeline branding/sending (all optional, all
# no-ops until set — see the "Referral pipeline" section for the
# 403-on-unverified-domain reasoning)
REFERRAL_EMAIL_FROM=
REFERRAL_EMAIL_REPLY_TO=
ARG_EMAIL_LOGO_URL=
ARG_WEBSITE_URL=

# Both apps: Athletes To Industry welcome-email logo (each app sends its
# own A2I email — admin's manual add/resend, portal's live public
# signup route — see "Athletes To Industry emails moved to their own
# identity" above)
A2I_EMAIL_LOGO_URL=

# Portal only
A2I_PARTNER_NOTIFY_EMAIL=       # defaults to tom@andrews-recruitment.com

# Portal only: debug-session route guard. In production this route 404s
# unless this is exactly 'true' — never set it in a real deployment.
ENABLE_DEBUG_SESSION=

# Set automatically by Vercel, never by hand
VERCEL_ENV=
VERCEL_GIT_COMMIT_SHA=
VERCEL_GIT_COMMIT_MESSAGE=
NODE_ENV=
```

**A phase number collides on purpose.** "Phase 18" above (e-learning)
is this repo's ORIGINAL sequential phase numbering (1-43-ish, the early
build phases at the top of this file); "Phase 18" everywhere else in
this document (Core 360 Assurance) is the SEPARATE Core-OS 360
initiative's own Phase 6-19 numbering, restarted from a different base.
Both numbering schemes coexist in this file's history; check the
section heading's own wording ("Core-OS 360 Phase N" vs. a bare
"Phase N") to tell them apart, never the number alone.

---

## Git

- **Branch**: `claude/review-peoples-office-docs-faDg8`
- **Remote**: `origin`
- Always commit with descriptive messages referencing the phase
- Always `git push -u origin claude/review-peoples-office-docs-faDg8` after each phase

---

## What Has Been Built (Phases 1-31)

| Phase | What |
|-------|------|
| 1-4 | Project scaffold, auth, Supabase setup, design system |
| 5 | Portal dashboard, sidebar with feature flags, topbar |
| 6 | Admin clients list + detail page with tabs (Overview, Roles, Documents, Roadmap, Services) |
| 7 | Portal hiring page (requisitions, friction score display, candidate feedback) |
| 8 | Candidate pipeline tab in admin client detail; Actions tab with priority/due date |
| 9 | Compliance tracker: admin tab + portal `/compliance` page with status advancement |
| 10 | Admin requisition detail page `/hiring/[id]` with RequisitionPanel (friction, stage select, recruiter) |
| 11 | Notification badges in portal sidebar; Admin `/hiring/new` with full role form + friction scoring |
| 12 | User invite panel (admin); Users management page with inline role editing; Dashboard link fix |
| 13 | Portal `/metrics` analytics page: 6 stat cards, hiring/candidate/compliance/support/documents/actions breakdowns |
| 14 | BD "Convert to Client" full flow in BDCompanyModal; service request response notes in admin; portal support page shows service requests with response notes |
| 15 | Hire phase enhancements: offer management, interview scheduling DB, hiring analytics, `interview_schedules` + `offers` migration |
| 16-18 | LEAD module (training needs, performance reviews, skills matrix); PROTECT module (absence records, employee docs, HR dashboard); E-learning marketplace with Stripe |
| 21 | IvyLens Friction Lens integration: proxy route `/api/friction/analyze`, updated `FrictionScoreCard`, JD text column in requisitions |
| 22 | Admin LEAD + PROTECT tabs in client detail; Manatal ID field in the Overview tab (inside `ClientDetailTabs.tsx` — there is no separate component file) |
| 23 | Interview scheduling UI in admin `RequisitionPanel`: full CRUD for `interview_schedules` |
| 24 | Admin `/compliance` cross-client RAG dashboard: overdue/amber/on-track cards + employee doc expiry alerts |
| 25 | Salary benchmarks: `salary_benchmarks` migration, admin CRUD page `/salary-benchmarks`, portal `/benchmarks` comparison page |
| 26 | BD pipeline Kanban view: HTML5 drag-and-drop, 4 status columns, inline status update |
| 28 | Reporting CSV exports: portal `/reports` with 4 export cards; admin `/reports` with cross-client exports |
| 29 | Manatal ATS integration: `manatal.ts` client lib, portal proxy routes `/api/manatal/matches` + `/api/manatal/matches/move-stage`; `manatal_client_id` column on companies |
| 30 | RLS audit fixes: `is_ravello_staff()` corrected to include `tps_client`; 8 policies rewritten; client insert policies tightened |
| 31 | Feature flag toggles expanded to include LEAD, PROTECT, Learning, Benchmarks; Manatal ATS pipeline surfaced in portal hiring page |
| 32 | Admin dashboard enhanced with PROTECT alerts (overdue compliance, expiring docs, pending absences, open service requests) |
| 33 | Portal dashboard: LEAD/PROTECT module cards when those flags enabled (open training needs, pending absences) |
| 34 | JD Templates page (admin `/hiring/templates`); All Candidates page (admin `/candidates`) with screening scores and pipeline stage |
| 35 | New role form pre-fills from JD template when `?template=ID` query param present |
| 36 | Portal new role form: template selector dropdown (client-side fetch from `jd_templates`) |
| 37 | Admin Broadcast page: push action items to multiple clients at once; `actions.created_by_admin` + `actions.due_date` columns |
| 38 | Auto-seed standard compliance items + welcome action when BD company converted to client |
| 39 | Portal metrics page: LEAD/PROTECT module analytics sections (training completion, reviews, absences, employee doc expiry) |
| 40 | Admin clients list: per-client health indicators (active roles, open tickets, overdue compliance) with parallel data fetching |
| 41 | **Referral pipeline** (migration 077): hourly cron reads job-board applicants from Manatal per referral-enabled role, gates them (country → IvyLens scan → mandatory-criteria veto → score) and emails qualifiers a partner referral link via Resend. Admin `/referrals` funnel + review queue; config panel on the requisition page. See the section below. |
| 42 | **Enum alignment** (migration 078): fixed three live sites writing/reading enum values the database refuses (`'shared'`, `'pending_approval'`, `'handbook'`). `statusMaps.ts` becomes the single vocabulary source with `as const` tuples + derived unions; `CLIENT_STATUS_STYLE` de-duplicated from four copies; portal badge/metrics/offer queries made `shared`-aware. |
| 43 | **Foundations sweep** (migrations 079-080): the nine findings from the platform review — legacy RLS cleanup, paged reads, request validation, error visibility, CI, rate limiting, navigation correctness, breadcrumbs, accessibility. See the section below. |
| C1 | **Core-OS 360 Phase 1** (migrations 117-121): organisations/consultancy relationships, capability catalogue, consultant grants + ONE active organisation, read-only write guard, immutable audit trail, sites/departments, people, universal actions, document versions, internal search. See the section at the end and `docs/CORE_OS_360_PHASE1_HANDOVER.md`. |
| C2 | **Core-OS 360 Phase 2: operational H&S core** (migrations 122-129): hazards, risk assessments (matrix, controls, approval, versioning, templates), RAMS, COSHH + SDS versions, incidents/near misses, people + restricted injury detail, investigations, root cause / 5 Whys, RIDDOR decision support, corrective actions on the universal `actions` table with verification + effectiveness. See the section at the end and `docs/CORE_OS_360_PHASE2_HANDOVER.md`. |
| C3 | **Core-OS 360 Phase 3: workforce & Safe to Deploy** (migrations 131-143): people lifecycle, job roles and assignments, versioned requirement rules (role / site / person), catalogues, training / competency / credential / induction / authorisation / PPE / pre-employment evidence with verification, occupational health (summary and clinical apart), the deterministic Safe to Deploy engine, recruitment and leaver integration, the portal `/lead/workforce` pages. See the section at the end and `docs/CORE_OS_360_PHASE3_HANDOVER.md`. |
| C4 | **Core-OS 360 Phase 4: assets, inspections, PUWER, LOLER, contractors, permits, isolation/LOTO, emergency planning** (complete, migrations 144-155): the asset register (Group 2), the checklist inspection engine (Group 3), defects + a database-enforced return-to-service gate (Group 4), PUWER assessments (Group 5), LOLER thorough examinations + immediate danger (Group 6), contractor companies/insurance/prequalification (Group 7), contractor workers + a Safe-to-Deploy-aware access gate (Group 8, `contractor_worker_access()`), permit to work (Group 9, `permits_lifecycle_guard()` + the new `person_holds_authorisation()` helper), isolation/LOTO (Group 10, `isolations_lifecycle_guard()` + the multi-lock `isolation_locks` layer), emergency planning (Group 11, `emergency_plans` reusing `hs_documents`' versioning discipline, roles/equipment links, insert-only drills with findings raised as ordinary `actions` rows), the notifications/audit wiring sweep (Group 12), admin + portal UI for contractors/permits/isolations/emergency planning (Group 13), and a final regression/adversarial-security-review/handover pass (Group 14, gate: PASS WITH MINOR ISSUES — one Medium self-authorisation gap on permits found and fixed, migration 155). Delivered in 14 logical, independently-gated groups. See the section at the end and `docs/CORE_OS_360_PHASE4_HANDOVER.md`. |

---

## Patterns to Follow When Continuing

1. **Always read a file before editing it**
2. **Server components fetch data, pass to client components as props**
3. **All fetches in parallel via Promise.all**
4. **Use CSS vars: never hardcode hex colours**
5. **New portal sidebar items need adding to both `Sidebar.tsx` and the counts map if they need badges**
6. **New feature-flag-gated pages check `flags.X === false` not `!flags.X`**
7. **New DB tables go in a new migration file in `supabase/migrations/`**
8. **Commit and push after every phase**

---

## Referral pipeline (Phase 41)

Refers job-board applicants on to an external partner (first use: Micro1) and
tracks the funnel to a referral fee. Each system has one job: **Manatal** is
intake and job-board distribution, **IvyLens** scores, **the People System**
orchestrates, decides, emails and tracks.

`admin/src/lib/referral/` — `gate.ts` (pure decision logic), `cvText.ts`,
`ivylensScan.ts`, `pipeline.ts` (the one processing path), `statusMeta.ts`,
`types.ts`. Cron at `admin/src/app/api/cron/referral-scan/route.ts`, hourly.

### Rules that keep it correct

- **Manatal is READ-ONLY.** Never write back — no note, no stage move. One
  writer for a candidate's status means no second vocabulary to drift.
- **The Manatal `resume` URL is presigned and expires in ~1 hour.** Measured
  2026-08-26: 59 minutes. Read the candidate fresh (`getManatalCandidate`,
  which passes `noCache`) and fetch the PDF in the same request. Never persist
  the URL — that is why `candidates.cv_url` is left null here. An expired link
  returns 403, and since CV text is only ever scan input, an unhandled 403 does
  not look like an error: it looks like a candidate whose CV said nothing.
  `referral_applications.scan_source` records which text was actually scored
  (`cv_pdf` vs `manatal_parsed`) and the UI shows it, so a thin scan is
  **visibly** thin. A rising `manatal_parsed` share means extraction is broken.
- **Absence of evidence is a FAIL, not a pass.** A mandatory criterion passes
  only on a `skill_matches[]` entry with `found === true` and sufficient
  confidence. Absent, `found: false`, or `found: undefined` all fail. Inverting
  this default is exactly the failure the feature exists to prevent — a
  candidate scoring 91% on adjacent experience who has never touched the
  mandatory skill. Mutation-tested.
- **The country gate is a BLOCK list (migration 084, operator 2026-09-02), and
  the fail direction is INVERTED from what it was.** An empty
  `blocked_countries` blocks NOBODY. That is not an oversight to be
  "fixed": an allow list could fail closed on a missing config because an
  empty allow list refuses everyone, but making an empty block list refuse
  everyone would mean every unconfigured role silently rejects every
  applicant. The config API therefore no longer refuses to enable a role
  with an empty list, and `processRole` no longer skips one.
- **What carries the safety instead is the AUTO-SEND CAP on an unreadable
  country.** `unknown` — a blank location, or one naming no country we
  recognise — is *not* a rejection: they are scanned, scored and shown.
  They simply can never reach `qualified`, so they land in the review queue
  and a person decides. The property kept is narrower and exact: never
  email a stranger in the operator's name that we cannot place. Four
  mutations pin it.
- **A country is recognised by NAME, never by string shape.** `KNOWN_COUNTRIES`
  in `gate.ts` exists because bare "United Kingdom" is two words with no
  comma and is three of the live rows, some of which qualified — any
  word-count heuristic demotes real candidates to review or promotes real
  bare cities to auto-send. An omission from that set only ever costs a
  manual look, never a lost candidate, so it does not need to be perfect.
  A test asserts every location seen in production resolves.
- **The seed is evidence, not policy.** 084 could not invert the 17-country
  allow list — its complement is "everywhere else", which cannot be
  enumerated, and an empty seed would silently turn 7 existing rejections
  into passes. So `blocked_countries` was seeded from the countries this
  role has ACTUALLY refused (Angola, Brazil, Estonia, Macedonia, Nigeria,
  Turkey), preserving every decision already made. It is meant to be
  edited. `approved_countries_legacy` keeps the old list for reference.
- **Pre-084 rows keep their own words.** `country_gate_result` accepts
  `clear`/`blocked`/`unknown` (current) and `approved`/`rejected` (history).
  A row recorded `rejected` means "not on the allow list", which is NOT the
  same fact as "on the block list"; relabelling would assert something
  about those seven people that was never measured.
- **Gate order is country → [scan] → criteria veto → score.** Only a BLOCKED
  country short-circuits, so a blocked applicant still costs zero AI; an
  unreadable one is scanned, because under a block list nothing proves they
  should be refused. The criteria cannot literally precede the scan (they
  are derived from it), so they act as a veto over the score — which is the
  wanted behaviour.
- **The invite is branded ANDREWS RECRUITMENT GROUP, not The People
  System.** The candidate answered an ARG advert and the email is signed
  by Tom Andrews, but until 2026-09-02 it shipped in a shell headed,
  footed and titled The People System — a company the recipient had
  never heard of. Mismatched identity is a trust problem before it is a
  design one, and a live spam signal. `wrapEmail` takes a
  `SenderIdentity`; `TPS_SENDER` is the default so the other 11 emails
  are untouched, and the referral template passes `ARG_SENDER`. A test
  pins BOTH directions — no People System string in the invite, and the
  default wrapper still fully People System — because rebranding
  everything is the obvious way to get this wrong.
- **No ARG logo is rendered until one is hosted on an ARG domain.**
  `SenderIdentity.logoUrl` is nullable and falls back to a text
  wordmark. Resend flags a logo hosted off the sending root domain, so
  the People System blob on an ARG email would be wrong AND a
  deliverability demerit. Set `ARG_EMAIL_LOGO_URL` when one exists.
- **The FROM address is opt-in and still unset.** Resend answers a
  from-address on an unverified domain with a 403, so hardcoding an ARG
  sender would stop every referral email until the DNS records existed.
  `REFERRAL_EMAIL_FROM` is read in the TEMPLATE, not at the call sites,
  so the preview and the live send cannot disagree about who the email
  is from; unset means `EMAIL_FROM` exactly as before. **The visual
  identity is fixed but the envelope still says
  `noreply@portal.thepeoplesystem.co.uk`** — verify
  andrews-recruitment.com in Resend → Domains, then set the var.
  **Reply-To travels with it** (`referralFromAddress()` extracts the
  bare address out of `REFERRAL_EMAIL_FROM`) — otherwise a candidate
  hitting reply on an ARG-branded email lands in
  hello@thepeoplesystem.co.uk, the same mismatch one header over.
  `REFERRAL_EMAIL_REPLY_TO` overrides it if the reply inbox should ever
  differ from the sending address.
- **The Athletes To Industry welcome emails had the SAME defect, worse
  in one place.** Operator, 2026-09-03: "we are using the same email
  format and address that we use for sending emails to Athletes in the
  Athletes to Industry section" — confirming the referral invite's
  original mismatch (Andrews-Recruitment-signed content in a
  People-System shell) was not a one-off. `athleteWelcome.ts` (admin,
  fired on manual staff-add + resend) and `buildAthleteWelcomeEmail`
  (portal, the LIVE auto-send from the public unauthenticated
  `/api/r/athlete/[slug]` route) both went out purple/TPS-branded. The
  portal one was worse: its copy said "The People System's Athletes To
  Industry programme," dropping Andrews Recruitment Group by name
  entirely, even though the booking link is on their domain and the
  call is with their owner. See below.
- **"Email me a preview"** on the referral panel
  (`POST /api/admin/referrals/[id]/test-email`) renders the real
  template with the role's saved config and sends it to the signed-in
  staff member. The recipient comes from the SESSION, never the request
  body — that is what stops it being a general-purpose mailer behind one
  staff login. It writes no `referral_applications` row, and it marks
  `[Preview]` in the subject only, so the body under review is
  byte-identical to a candidate's.
- **`dry_run` defaults TRUE.** IvyLens's `POST /api/partner/scans/run` returns
  the RAW model score, skipping the objective-anchor blend its internal
  Candidate Match applies, and IvyLens's own `docs/CANDIDATE_MATCH_MODEL.md`
  records that scorer as unreliable at the margins. 85/75 are starting guesses.
  Run dry for the first 100-200 applicants and compare the distribution against
  your own read before turning it off.
- **Idempotency is the DB.** `UNIQUE (manatal_candidate_id, requisition_id)` on
  `referral_applications`; `processRole` drops anyone already holding a row
  before doing any work. Re-invoking the cron immediately is a no-op — which is
  how you verify it.
- **Only advance to `email_sent` when the send actually succeeded.**
  `sendEmail()` returns null rather than throwing; a swallowed failure would
  mark somebody emailed who was not, and the idempotency guard would then stop
  us ever retrying them. A failed send stays `qualified` and visibly outstanding.
- **Only downstream stages are hand-settable** (`MANUAL_STATUSES`). Letting a
  human move a row back into a pipeline-owned status would put the email record
  and the idempotency guard into disagreement about whether anyone was contacted.
- **Every skip reason is counted** in the cron's response. "0 emailed" with no
  breakdown is the state someone would otherwise have to debug from scratch.

### Setup (manual, per role)

1. Micro1 org in Manatal; the People System company row is **Andrews Recruitment
   Group** with `manatal_client_id` set by hand on the client Overview tab.
2. Create the requisition, then **Publish to Manatal** — this sets
   `requisitions.manatal_job_id`, which is what matches applicants to the role.
3. Run the JD through the friction analyse route once so
   `requisitions.ivylens_role_id` is populated; scans then pass a stable
   `role_id` instead of re-sending JD text every call.
4. Fill in the referral panel on the requisition page: partner name, referral
   URL, thresholds, **blocked countries** (leave empty to accept everywhere),
   mandatory criteria.
5. The `IVYLENS_API_KEY` needs the **`candidate_scan.run`** partner scope.
6. Leave dry run ON.

### Env

`IVYLENS_API_URL` / `IVYLENS_API_KEY` are now needed on the **admin** app too
(previously portal-only). `MANATAL_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM` and
`CRON_SECRET` are already set.

Optional, all unset today, all no-ops until configured:
`REFERRAL_EMAIL_FROM` (needs andrews-recruitment.com verified in Resend
first — a 403 otherwise stops every referral send), `ARG_EMAIL_LOGO_URL`
(must be on an ARG domain), `ARG_WEBSITE_URL`.


---

## Foundations sweep (Phase 43)

Nine findings from a full review of both apps, each fixed with a guard
where a guard was possible. The guards matter more than the fixes: every
one of these defects compiled, rendered and reported success.

### The four CI guards — run them before merging

```
bash scripts/check-shared-dupes.sh         # 26 byte-identical pairs across the two apps
bash scripts/check-row-cap.sh              # no query asks for more than 1,000 rows
bash scripts/check-route-validation.sh     # ratchet: 49 unvalidated routes, may only shrink
bash scripts/check-admin-routes-linked.sh  # every admin page is reachable from the sidebar
```

All four run in `.github/workflows/ci.yml` alongside tsc, tests and a
production build of both apps. Each is a **ratchet or an invariant**, not
a lint — a new violation fails, an existing one is either listed or
already zero.

### What each finding was, and the trap in it

- **RLS (079, 080).** 97 legacy policies dropped. Postgres ORs permissive
  policies, so **the weakest policy on a table decides** — a superseded
  policy left behind is not dead code, it is the live grant. Note
  `is_tps_staff()` is `tps_admin` ONLY despite what Phase 30 claimed, so
  it is the NARROWER of the two staff predicates; the drop direction was
  chosen on that measurement, not on the docs. `rls_policy_audit()`
  reports the current state.
- **Paged reads (`lib/supabase/paged.ts`, shared).** `readAllPages()`
  walks 1,000-row windows and **reports `truncated`** rather than
  presenting a partial read as complete. A `.limit(5000)` is not a large
  read, it is a silently clipped one — see the PostgREST section above.
- **Validation (`lib/validation/`, shared).** Bounded field types +
  `parseBody`. Zod chain order is load-bearing: `.max()` MUST come before
  `.toLowerCase()` or `.refine()`, which return a `ZodEffects` that has no
  `.max()`.
- **Error visibility (`lib/supabase/instrument.ts`, shared).** A Proxy
  intercepting only `then`, so every discarded `{ error }` is reported
  centrally instead of being fixed at 114 call sites. Sentry is inert
  without a DSN; **no session replay** — it would record employee, salary
  and absence data — and `sendDefaultPii: false`.
  **`instrumentSupabase` MUST stay idempotent** — see below; it shipped
  without that and broke every Save button in the admin app.
- **Rate limiting (`lib/rateLimit.ts`, shared).** Five named `limiters`.
  Keyed by **user id, falling back to IP**: IP alone puts a whole office
  behind one NAT in one bucket.
- **Vendor resilience (`lib/http/resilient.ts`).** Full-jitter backoff, a
  per-vendor circuit breaker, and `Retry-After` honoured to a 60s cap.
  **Writes are not retried** unless `retryOnWrite` is passed, and a 4xx
  does not count against the breaker — a bad request is our fault, not
  the vendor being down.
- **Navigation (`lib/ui/navMatch.ts`).** One winner across all sidebar
  groups by longest segment-boundary match. Independent per-item prefix
  checks highlighted two items on `/hiring/templates` and none on
  `/clients/<id>`. Three finished pages (`/candidates`, `/feature-flags`,
  `/roadmap`) had no link from anywhere; the guard above stops the next.
- **Breadcrumbs + accessibility.** `Breadcrumbs.tsx` never renders a raw
  id and never links the current page. Global `:focus-visible` and
  `prefers-reduced-motion` (collapsed to 0.01ms, not removed, so
  animation-end handlers still fire).

### The rule these share

**A comment asserting something about callers, coverage or reachability
is not a check.** Every defect here was invisible to `tsc`, to the build
and to the test suite, because the code was valid and the page rendered.
Assert the thing that was actually wrong — which route highlighted, which
error was reported, how many round trips — and reintroduce the bug to
watch the test fail before trusting it.

---

## Publishing to Manatal — nine defects, one HTTP 201 (2026-09-01)

Operator: *"The role was not showing on Manatal as a lot of the fields it
requires were empty. The text was not formatted correctly too, it was all
like a single paragraph instead of spaced, bullet points."*

Job **4337074** was the first role published through
`/api/admin/requisitions/[id]/manatal-publish`. It was created, reported
live, and arrived wrong in nine ways. **Nothing errored.** Manatal
validates almost nothing here — it stores what it is given, and a field
we never send is simply a field the advert does not have.

Measured by reading the live job back and diffing it against the jobs
the operator creates by hand in the same account:

| field | his native jobs | ours, as created | cause |
|---|---|---|---|
| `description` | `<p>`/`<ul>`/`<li>` | one paragraph | **Manatal renders HTML**; ours is a textarea |
| `salary_min/max` | 45000/60000 | null | route parsed `salary_range`, a column the admin form never writes |
| `contract_details` | full_time | full_time | "Contract" matched no enum member → omitted → Manatal defaulted it |
| `is_remote` | true/false | never sent | — |
| `city` / `country` | "Leeds" / "United Kingdom" | `""` | whole `location` went into `address` |
| `headcount` | 1 | null | not captured |
| `currency` | GBP | **'GBP' hardcoded** | role pays in **USD** |
| `frequency` | "year" | never sent | role pays **per hour** |
| `is_salary_visible` | false | never sent | not captured |

`currency` and `frequency` together are the one to remember: the advert
asserted **£60–£120 per year** for a role paying **$60–$120 per hour**. A
wrong salary is not cosmetic on a job board — it is the number candidates
self-select on.

### Rules

- **`description` is HTML.** `manatalDescriptionHtml()` renders it.
  A newline is not a line break and a blank line is not a paragraph, so
  sending the textarea raw collapses the whole advert. It escapes `&`,
  `<`, `>` — the live role is "AI **&** Software Engineers".
- **The formatter infers lists, and nothing else.** A run of short
  unpunctuated lines becomes a `<ul>`; an explicit `-`/`•` marker always
  does. **Unmarked runs need THREE lines, or two after a colon** — two is
  genuinely ambiguous and the live role opens with two standalone facts
  that must not become bullets. It never invents `<strong>`: guessing
  which lines are headings would mark up sentences the operator didn't.
- **`must_haves` / `nice_to_haves` are appended.** We held six on the
  live role and sent none of them, so the advert omitted the criteria the
  referral gate judges candidates on.
- **Everything is decided in `buildManatalJobArgs()`**, one pure function,
  because the defect was four fields never mentioned in a handler behind
  auth, a rate limiter and a DB read. `buildManatalJobArgs.test.ts`
  asserts the SENT VALUE field by field, plus **the exact key set** — so
  a newly-supported field that nobody wires up fails in the diff rather
  than in production. That omission *was* the bug, four times over.
- **An unset optional field is OMITTED, never sent as null.** Same rule
  `contract_details` already had: `frequency`, `is_salary_visible` and
  `industry` are enum/FK/non-nullable on v3, and a null 400s the create —
  which blocks publishing entirely rather than leaving a field blank.
- **Never default `frequency`.** Null omits it. A confident `'year'` on
  an hourly rate advertises a wrong number, and wrong beats absent here.
- **Never guess a country.** `splitLocation` recognises a country only as
  the trailing segment, from a short explicit map; anything else leaves
  `country` empty. "Cambridge" is a real place in three of them, and a
  wrong country is a wrong audience. A lone "UK" is not consumed — that
  would leave a job with no city at all.
- **Re-publish PATCHes the fields first** (`updateManatalJob`). It used to
  send only the publish flags, so correcting a role here changed nothing
  in Manatal while reporting success — the only fix was editing Manatal
  by hand, which is what this integration exists to avoid. It therefore
  **overwrites hand edits in Manatal, deliberately**: re-publish means
  "make Manatal match what I have here", and two sources of truth for one
  advert is the drift this file keeps recording.
- **`industry` is DISCOVERED, never hardcoded.** Ids are account-scoped
  (this account: 7673654 Engineering-Others, 7673671 Manufacturing, …).
  `listManatalIndustries()` fails soft to `[]`, which omits the field and
  behaves exactly as before — guessing an id risks a 400 that blocks
  publishing.
- **The detail page MUST select the new columns.** The panel seeds its
  editor from that row, so an unselected column reads `undefined`, the
  editor shows its default, and Save writes GBP over a stored USD. That
  is a data-loss path with no error on it.
- **`.select()` must stay ONE string literal.** supabase-js infers the row
  type from the literal type of the argument; splitting it with `+`
  widens it to `string` and every field access becomes an error on
  `GenericStringError`.

Migration **083** adds `headcount`, `salary_currency`, `salary_period`,
`salary_visible`, `manatal_industry_id`, all nullable, with CHECKs so a
bad value cannot reach Manatal and fail the create.

---

## The instrumentation stacked, and Save died (2026-08-28)

Operator: *"trying to create a athletes to industry development plan and
it wont let me save, it says maximum call stack reached … this is just a
new one of the same plan being saved"*.

**`instrumentSupabase` MUTATES the client** — it replaces `from`/`rpc`
and captures whatever was there as "the original". **`createBrowserClient`
returns a SINGLETON in the browser** (`isSingleton` defaults true; it
hands back `cachedBrowserClient`). And **`createClient()` is called in the
body of 65 client components**, which runs on every render.

So each render wrapped the previous wrapper. A controlled input
re-renders per keystroke, so an editing session added one layer per
character typed, and the layers never went away.

Measured against the real supabase-js, timing only the BUILD of
`from().insert().select().single()` — no network:

| layers | 1 | 60 | 100 | 150 | 200 | 300 | 500 | 800 |
|---|---|---|---|---|---|---|---|---|
| build | 1ms | 106ms | 487ms | 1652ms | 3868ms | 13406ms | 63012ms | **RangeError** |

The dev-plan editor is simply the page with the most typing in it. Every
other Save in the admin app was on the same curve, just further left.

### Rules

- **The guard is a per-CLIENT marker, never a module-level flag.**
  `Symbol.for('ravello.supabase.instrumented')` — `Symbol.for` because
  Next bundles this module more than once and two instances must agree
  about one object; per-client because a global flag silently strips
  reporting from the second client in a process. A mutation test pins
  both.
- **The layer count is the property to assert, and "does the query still
  work" cannot see it.** A twenty-layer client returns exactly the right
  answer, slowly. What it also does is **re-report the same failed query
  once per layer**, so the fault count for ONE failure counts the layers
  exactly. That is the assertion.
- **`instrumentSupabase` returns the object it was given**, so
  `expect(twice.from).toBe(once.from)` compares a property against itself
  and passes however broken the guard is. It did, under mutation, until it
  was rewritten to capture the wrapper BEFORE the second call. Third time
  this sweep that a test measured the wrong thing until mutated.
- **The singleton premise is measured, not asserted in a comment** —
  a test stubs `window.document` (what `isBrowser()` actually reads; a
  bare `globalThis.document` is not enough, and getting that wrong makes
  the test pass while measuring nothing) and checks
  `createBrowserClient` twice returns the same object.

---

## Athletes To Industry emails moved to their own identity (2026-09-03)

The codebase already had the right shell for this: `wrapEmailGold` in
`portal/src/lib/email.ts` — dark navy/gold, footer reading "Operated by
Andrews Recruitment Group · Powered by The People System" — built for
the internal "new partner referral" notification TO Tom. The two
athlete-facing welcome emails, the ones an actual applicant reads,
never used it.

- **Admin's `athleteWelcome.ts`** (fired from `POST
  /api/admin/athletes` on create, and from the manual
  `/api/admin/athletes/[id]/welcome-email` resend route) now uses
  `wrapEmailA2I` + `ctaButtonA2I`, new exports in
  `admin/src/lib/email/layout.ts` mirroring portal's `wrapEmailGold` /
  A2I constants. Body copy unchanged — it already correctly said
  "Andrews Recruitment Groups... via The People System portal."
- **Portal's `buildAthleteWelcomeEmail`** — the LIVE path, firing on
  every real, unauthenticated athlete signup via `/api/r/athlete/[slug]`
  — now uses the existing `wrapEmailGold` + a new `ctaButtonGold`. Its
  copy is fixed too: "The People System's Athletes To Industry
  programme" becomes "Andrews Recruitment Group's Athletes To Industry
  programme," matching the attribution the partner-notification email
  already stated correctly.
- **This is a SEPARATE VISUAL DESIGN, not a `SenderIdentity` swap.**
  A2I is dark navy/gold; TPS and ARG_SENDER share the light purple
  layout. `wrapEmailA2I` / `wrapEmailGold` are their own wrap functions
  for that reason — `SenderIdentity` only swaps name/logo/tagline
  within one shared visual design.
- **No shared-dupe entry.** `admin/src/lib/email/` isn't on
  `scripts/check-shared-dupes.sh`'s list (see the migrations section on
  why email/ is per-app), so admin's A2I palette and portal's are kept
  in step by hand, not by the CI guard. A future palette tweak needs
  both files edited.
- **The FROM address is untouched, same reasoning as `REFERRAL_EMAIL_FROM`.**
  Both athlete emails still send via `EMAIL_FROM` /
  `noreply@portal.thepeoplesystem.co.uk`. Resend 403s an unverified
  domain, so this is a DNS/Resend-domain job before it can change, not
  a code one.

Five mutations reintroduced and watched to fail: admin's shell and
button both reverted to purple/TPS, portal's shell and button reverted
to purple, and portal's copy reverted to omitting Andrews Recruitment
Group. A sixth confirmed the OTHER portal emails (client invite,
partner-referral notification) are unaffected.

tsc clean and full test suites green on both apps (328 admin, 27
portal — the portal suite had none for `lib/email.ts` before this).
Both production builds compile; the portal build's prerender step fails
in this sandbox only on `Missing Supabase env vars` (no
`NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` in this container) — unrelated to
this change, on pages this change never touched, and Vercel carries the
real values.

---

## Every cron and the Stripe webhook were 307-redirected to login (2026-09-04)

Vercel Logs, checked on the operator's report of the referral cron:
hourly, every hit, HTTP 307. `admin/src/lib/supabase/middleware.ts` had
exactly one public-route exemption — `pathname.startsWith('/auth')` —
so a server-to-server caller with no Supabase session cookie hit
`if (!user && !isPublic)` and got redirected to `/auth/login` before
its own body ever ran. Vercel's cron invoker and Stripe's webhook
sender do not follow redirects; they record the 307 and stop.

**Portal's own middleware already solved this** — it carries an
explicit `PUBLIC_ROUTES` allowlist for exactly this shape of route
(`/api/r/`, `/api/partner/`, `/api/learning/webhook`). Admin's simpler
`isPublic` check never got the same treatment, so admin ended up
silently broken for every cron in `vercel.json`'s `crons[]`
(referral-scan, ingest-feeds, prune-latest-updates,
prune-email-attachments) AND `/api/stripe/webhook`
(`invoice.paid`, `customer.subscription.*`) — five routes, one root
cause. Admin's middleware now carries the same `PUBLIC_ROUTES` pattern.

- **The evidence was in `referral_scan_runs`, and it was unambiguous
  once read correctly.** Three rows, all `outcome: 'manual'` — a value
  the cron route itself never writes (it writes `ok`/`degraded`/
  `no_roles`/`error`/`unauthorized`). Zero rows in the route's own
  vocabulary meant zero evidence the schedule had EVER actually reached
  the handler, not just "stopped recently."
- **The route's own `CRON_SECRET` check never got a chance to run**,
  so this was never a secret-mismatch problem — don't go looking there
  first for the next one of these.
- **The fix is a scoped allowlist, not a blanket `/api` exemption.**
  One admin route — `POST /api/admin/clients/[id]/raise-invoice` —
  deliberately has no self-contained `requireStaff()` check; its own
  comment says "gated by the admin app's auth layer." Excluding all of
  `/api` from the middleware would have unauthenticated it. Every other
  `/api/*` route in this app DOES self-check
  (`requireStaff`/`requirePermission`/`CRON_SECRET`/`stripe-signature`)
  — verified by scanning every `route.ts` for one of those before
  touching the matcher.
- **Test drives the real `updateSession()` against fabricated requests
  and asserts the RESPONSE SHAPE** (redirect-to-login or not) — a
  source-text check ("does the file mention CRON_SECRET") would have
  stayed green through the whole outage, since the route's own auth was
  fine and simply unreachable. Three mutations reintroduced and watched
  to fail: the original `/auth`-only check restored, a sloppy regex
  missing the trailing slash (would also exempt `/api/crontab-anything`),
  and the accidental blanket `/api` exemption (would have exposed
  `raise-invoice`).
- **What this means for the referral pipeline's own readiness**: the
  50 applications and 3 scan runs on record all predate this fix AND
  predate the IvyLens `scan_engine.rs` fix (2026-09-02, ~80 minutes
  after the last of those runs) — so there is currently zero data from
  either corrected system. Once this deploys, watch `referral_scan_runs`
  for real `ok`/`no_roles` rows appearing hourly before trusting
  anything about the 80/68 thresholds, which were calibrated against
  the old broken scoring and will need re-deriving from a fresh batch.

---

## Approve/Reject 404'd on every referral, always (2026-09-04)

Operator: *"reviewing the referrals and approving them does not work, I
get an error message saying - Referral application not found"*.

`PATCH /api/admin/referrals/[id]` selected `referral_applications` with
three chained `!inner` embeds — `candidates`, `requisitions`, and
`referral_role_config`. The first two resolve: real foreign keys exist.
The third does not. **`referral_role_config` has no foreign key to
`referral_applications` at all** — both tables independently reference
`requisitions`, which is not the same thing, and PostgREST can only
embed a table across a real FK edge between the two named tables. Every
single call to this route failed with `PGRST200` ("no relationship …
in the schema cache"), `readErr` was always truthy, and the route
reported "not found" for a row that was sitting right there — for every
approve, every reject, since the route was written.

- **Fetched as its own query instead**, keyed on
  `app.requisition_id` — the same pattern `runScan.ts` already uses to
  read this table, and the one that was sitting right there to copy.
- **Never assume PostgREST can chain a relationship through a shared
  referenced table.** Both tables pointing at `requisitions` looks like
  a join path to a human; PostgREST requires the direct edge.
- **Test drives the real `PATCH` handler against a fake Postgrest that
  reproduces the actual `PGRST200`** if the embed regresses, not a
  generic "and now it's broken" stand-in — the same discipline as the
  middleware fix above. One mutation reintroduced and watched to fail:
  restoring the three-way embed failed all four tests, the config-404
  case included (it degraded to the generic "application not found"
  again).

---

## The IvyLens telemetry table existed only on disk (2026-09-04)

Once the cron 307 fix (above) let `/api/cron/referral-scan` actually run, Vercel
logs filled with one new line per IvyLens call:
`[ivylens.recordCall] insert failed: Could not find the table
'public.ivylens_api_calls' in the schema cache`.

`admin/src/lib/ivylens.ts`'s `recordCall()` — called after every outbound
IvyLens request — has always written to `ivylens_api_calls`, and
`supabase/migrations/035_ivylens_telemetry.sql` has defined that exact table,
with a matching column set, since Phase 42. Querying
`information_schema.tables` on the live project confirmed it: the table did
not exist. The migration file was written, committed, and never applied — the
same gap this repo's own migration culture warns about (`.sql` on disk is a
record of intent, applied by hand in the Supabase SQL editor, not proof of
what the database contains).

- **No code drift, so no code fix.** `recordCall()`'s insert payload
  (`{ endpoint, method, status, duration_ms, rate_limited, error }`) matches
  migration 035's columns exactly — this was purely a missing `apply_migration`
  call, not a schema mismatch to reconcile.
- **It never broke anything it wrote to.** `recordCall()` wraps every insert
  in a `.then(…, err => { console.error(...); resolve(); })` — the promise
  always resolves, so a missing table only ever produced a log line, never a
  failed cron run or a 500 to a caller. That is also why it was invisible
  until someone actually read the logs: `referral_scan_runs` kept recording
  real `ok` rows underneath it the whole time.
- **What it DID cost**: the IvyLens Health Status dashboard
  (`admin/src/lib/ivylens/health.ts`, which reads FROM this table) had zero
  data for every day the table was missing — a real "no signal" gap for
  anyone checking rate-limit usage or error trends before this fix.
- Applied via `mcp__Supabase__apply_migration` against project
  `sbmekaviwkiyorvmtgcu`; verified afterwards by reading the live columns,
  indexes and `pg_policies` back rather than trusting the apply call's own
  success response.

---

## A `qualified` (dry-run-held) applicant had no way to be sent (2026-09-04)

Operator, after the first real dry-run scan produced its first `qualified`
result: *"existing qualified people do not have an approve button, only the
ones in the review queue do. I need to be able to send the email to the people
who already hit the auto approved benchmark but held back as we had dry run
on."*

`PATCH /api/admin/referrals/[id]`'s approve branch has always accepted
`status === 'qualified'` as well as `'review_pending'` — that was part of the
PGRST200 fix earlier the same day. **The UI never did.**
`ReferralsClient.tsx` gated the Approve/Reject buttons on
`r.status === 'review_pending'` alone (`isQueue`); everything else, `qualified`
included, fell through to the "Advance to…" dropdown, which is populated from
`MANUAL_STATUSES` — the downstream, hand-settable stages
(`applied_to_partner`, `accepted`, …) — none of which call
`sendReferralInvite`. So a candidate who cleared the auto-send bar and was
correctly held back by `dry_run` (see `pipeline.ts`'s one dry_run check, at the
email-send site) had **no control anywhere in the product** that could send
them the invite. Only `review_pending` — the "a mandatory criterion or country
came back `unknown`" case — had one.

- **The backend already did the right thing; only the table's button gate was
  wrong.** `ACTIONABLE` replaces the single-status `isQueue` check with a set
  of both statuses a human may act on. Read `pipeline.ts:322-338` before
  touching this again: `dry_run` is checked in exactly one place, and it never
  touches whether a row is APPROVABLE, only whether the automatic path sends.
- **The button is relabelled "Send invite" for a `qualified` row**, "Approve"
  for `review_pending` — same action (`{ action: 'approve' }`), same route,
  same underlying call. The distinction is for the operator reading the table,
  not the code: one is a human override of an "unknown" verdict, the other is
  the pipeline's own auto-send being manually released.
- **Turning `dry_run` off does NOT retroactively touch existing rows.**
  `referral_applications` has `UNIQUE (manatal_candidate_id, requisition_id)`
  and `processRole` drops anyone already holding a row before doing any work —
  that is the pipeline's whole idempotency guard (see "Idempotency is the DB"
  above). A `qualified` row created while `dry_run` was on stays exactly there,
  un-re-evaluated, however many times the cron runs afterwards. The only way
  to move it is this button, or the "Advance to…" dropdown for a genuinely
  downstream change.
- **The `review_pending` filter/count (`REVIEW`, `queueCount`) is deliberately
  unchanged** — it still means "a human verdict is needed", which is a
  narrower thing than "a human action is available". Widening it to include
  `qualified` would have made the "Review queue (N)" badge count rows that
  never needed review at all, just a send.

---

## The role page's Candidates table used the wrong status vocabulary for referral-sourced rows (2026-09-04)

Operator: *"it also needs the client status to match their outcome as the
all say 'awaiting your review' but they have been reviewed havent they?"*

`admin/hiring/[id]/page.tsx`'s Candidates table reads `candidates.client_status`
and labels it via `CANDIDATE_CLIENT_STATUS_LABELS` — correct for the classic
flow, where an admin shares a candidate with the client and the client reviews
them. It is the wrong column entirely for a candidate `pipeline.ts` created:
those never go to a client for review at all — they are being referred on to
Micro1 — so `client_status` is simply never written and sits at its DB default
for ever. The badge said "Awaiting your review" not because anything was
stale, but because that field never applied to these rows in the first place.
The real outcome — qualified, rejected on score, email sent, … — lives on
`referral_applications`, keyed by `candidate_id`.

- **Detect the source, not the status.** `pipeline.ts` stamps
  `source: 'job_board'` on every candidate row it creates (already an
  established value — the same one `/candidates`'s source filter uses). A
  `job_board`-sourced row now looks up its `referral_applications.status` and
  renders that via the referral funnel's own `statusLabel`/`statusColour`
  (`@/lib/referral/statusMeta`) instead of the client-review badge, with a
  small "via referral pipeline" caption so the two vocabularies are never
  confused for one another on screen.
- **One extra query, not a join on every row.** The candidate ids on the
  current page that are `job_board`-sourced are batched into a single
  `.in('candidate_id', […])` read against `referral_applications` — there is
  no FK-embeddable path from `candidates` to `referral_applications` worth
  relying on for a display list, and this is the same "fetch by id list"
  shape `runScan.ts` and the referrals PATCH route already use elsewhere.

Same operator turn also asked for pagination on **both** candidate-shaped
lists on that page, 25 at a time, recent first:

- **The Candidates table** now does real server-side pagination —
  `.range()` + `{ count: 'exact' }` on the query, a `?page=` search param,
  Prev/Next links. It was already ordered `created_at desc`, so "recent on
  top" was free; what was missing was a bound. A role scanned by the referral
  pipeline for months adds one candidates row per applicant — unbounded was
  never going to end well, and would eventually run into the PostgREST
  1,000-row cap this codebase has hit (and fixed) four times before.
- **The regression this nearly shipped**: `InterviewSchedulePanel`'s
  candidate-picker dropdown was fed from the SAME `cands` array as the table.
  Paginating the table without noticing would have silently shrunk who a
  recruiter could book an interview for to whichever 25 happened to be on
  screen. Fixed by fetching a second, lightweight `id,full_name` list with no
  range for that panel alone — the display table paginates, the scheduler's
  picker does not.
- **The Applicants table** (`RoleApplicants.tsx`, the live Manatal pipeline
  list) was REMOVED on 2026-09-24 (operator: it duplicated the Candidates
  table at the bottom of the page and showed "1055 applicants could not be
  named"). Its `Pagination.tsx` helper went with it. The
  `/api/admin/manatal/matches` and `/move-stage` routes it called now have
  no caller in the admin app.
- **A disabled Prev/Next is a `<span>`, never a `<Link>` with
  `pointerEvents: none`.** That CSS blocks a mouse click but not keyboard
  Enter on a focused, still-navigable anchor — the same class of accessibility
  gap the F8/F9 sweep (above) exists to catch.

---

## "Any sign of X" was already the local rule — the harshness was upstream in IvyLens (2026-09-05)

Operator: a JD requirement like *"Mechanical Engineering: diagnosing, problem
solving, hydraulics, pneumatics, bearings, pumps, motors, mechanical systems,
maintenance, fault finding"* was scoring candidates as if they needed ALL ten,
when the intent was "any sign of Mechanical Engineering, which will include
skills such as [these examples]".

**Checked, not assumed, before touching anything**: `gate.ts`'s
`checkMandatoryCriteria` already implements exactly this. A
`MandatoryCriterion.match_terms` array is an OR list —
`matches.find(m => skillSatisfies(m, terms))` passes the criterion the moment
ANY term matches ANY scan `skill_matches[]` entry — so a single "Mechanical
Engineering" criterion configured with all ten example terms already only
needs evidence of one of them. This code needed no change; a test
(`gate.test.ts`) was added pinning the operator's exact scenario (ten terms,
one evidenced → passes; ten terms, none evidenced → still fails), mutation-
checked by requiring every term and watching it fail.

**The actual harshness was upstream, in IvyLens's own role analysis and
candidate scoring** — a different codebase, fixed there the same day (see
`/home/user/IvyLens/CLAUDE.md`, "A checklist item is not the same as a
requirement"). In short: when a JD names one competency followed by
comma-separated examples, IvyLens's role-extraction prompt was atomising the
examples into N separate `required_skills` entries, each becoming its own
independent line in the candidate-scan model's checklist — the exact "must
have all of these" reading the operator was describing, just one layer up
from where it was reported. Fixed at the extraction prompt (keep the examples
grouped under one entry), the candidate-scan prompt (an explicit rule for
already-atomised roles), and — the part that would have made things silently
*worse* without it — the deterministic no-AI fallback, which does literal
substring matching and would never match a composed "Category (e.g. ...)"
phrase verbatim against a CV.

**Why this matters for the referral pipeline specifically**: `ivylensScan.ts`
never sends `mandatory_criteria` to IvyLens at all — it only sends
`candidate_text` and `role_id`/`role_text`. The `overall_score` IvyLens
returns (what `auto_send_threshold`/`review_threshold` are compared against)
is scored against the role's OWN `required_skills`/`preferred_skills`, set
when the role was last analysed (`ivylens_role_id`). So a role whose JD lists
grouped-example requirements benefits from the IvyLens fix the next time it
is re-analysed (**Analyse role** / **Re-analyse role** on the requisition
page) — the local `mandatory_criteria` veto in `gate.ts` was correct all
along and needed no re-run.

---

## Two real bugs found auditing the rejected pile, one config fix, one one-off rescore (2026-09-05)

Same-day follow-up to the section above. Auditing every `rejected_score`/
`rejected_criteria` row across the two live referral roles (357 applications
total) found the mandatory-criteria bug was real, but not the one first
suspected — and turned up a second, unrelated one.

**"Mechanical Engineering AI Expert" (`aaceaceb-7bef-41dd-bff9-3da45e253983`) —
the Documentation criterion was unpassable by ANY candidate.** Its three
mandatory criteria were all correctly configured as OR-lists (see above) — the
bug was not "must have all of these" after all. It was that the
**"Documentation" criterion's terms shared zero vocabulary with what IvyLens
had actually extracted as this role's `required_skills`/`preferred_skills`**.
`checkMandatoryCriteria` can only find evidence inside `scan.skill_matches[]`,
which is reconciled 1:1 to the role's own extracted skill list
(`reconcile_skill_matches`) — so a criterion whose terms (technical drawings,
specifications, reports, spreadsheets, datasets, procedures, written
explanations, engineering standards) never appear anywhere in that list is
unsatisfiable BY CONSTRUCTION, however good the candidate. Proof: **37 of 37**
applicants failed Documentation with "No evidence found in the CV" — a 100%
fail rate regardless of score (68% down to 18%), which a criterion measuring
anything real would never produce. Fixed by removing the Documentation
criterion from `referral_role_config.mandatory_criteria` for this role
(operator, 2026-09-05: "remove documentation from the criteria").
**Lesson for next time a criterion is written**: its `match_terms` need to
share real words with the role's OWN extracted skill list (visible via
`friction_lens_roles.required_skills`/`preferred_skills` in the IvyLens
project, or just what the JD actually says), not just with the JD's prose —
IvyLens paraphrases independently, and the gate only ever sees IvyLens's
paraphrase.

**"AI & Software Engineers – Remote Opportunities" (`7ae62d7d-…`) — audited
and NOT found to be a bug.** Its criteria share real vocabulary with the
role's extracted skills (Python/Java/Golang/TypeScript/Rust/LLM/Debugging/
Refactoring all appear literally in both) and its 166 criteria-rejections look
like genuine mismatches. Its 120 score-rejections average 36% against a 65%
review threshold — real volume noise from a broad remote posting, not
harshness. Only 6 of the 120 scored close to the line (56-60%) and are worth
a manual look if the operator wants it; this was reported but no code or
config was changed for this role over the criteria question.

**The one-off rescore (operator: "rescore all existing applicants").** Both
roles' 323 currently-rejected applications (203 `rejected_criteria` + 120
`rejected_score`, across both roles — `rejected_country` and everything past
review untouched) were backed up in full to a local JSON file, then deleted
from `referral_applications`. This is the ONLY way to make the pipeline
reconsider them: `processRole`'s idempotency guard checks ROW EXISTENCE, not
status, so as long as any row exists — however old the scoring that produced
it — the candidate is invisible to every future scan, cron or manual, forever.
There is no "rescan one candidate" or "override a rejection" control anywhere
in the product; clearing the row is the only lever that exists today.

- **No code change, no product feature** — this was explicitly a one-off
  (operator: "this is a one off"), not the standing "re-evaluate" action
  floated earlier the same day. If this recurs, that's the thing worth
  building instead of repeating this by hand.
- **Both roles have `dry_run = false`, and the operator was asked and chose
  live sends** ("let it auto-email as normal") over scoring-only — so from
  the next cron tick onward, any of these 323 who now score above
  `auto_send_threshold` gets a REAL referral email sent automatically,
  exactly as any new applicant would. Nothing about this is a preview.
- **This is not instant.** `runScan.ts`'s `budget` (`DEFAULT_BATCH_CAP = 25`)
  is shared across the WHOLE run, not per role, so both roles' backlog drains
  through the SAME hourly 25-candidate allowance as genuinely new applicants
  — expect roughly a working day for the backlog to clear, competing with
  real new arrivals the whole time. Nothing needed to trigger it: once the
  rows were gone, Manatal still shows these people as applicants, so the very
  next hourly tick reads them as fresh matches with no idempotency block.

---

## A scan's own score and its own skill evidence can disagree — and the criteria veto only ever saw the evidence (2026-09-14)

Operator, after the rescore had run for nine days: *"double and triple check
the scoring on candidates against the role, we should not need the criteria
cos IvyLens has the ability to scan roles and then scan candidates directly
against that role with accurate scores"*.

**Checked, not assumed.** Compared, for every criteria-rejected candidate on
both live roles, what would have happened on `overall_score` alone:

| Role | Criteria-rejected | Would auto-send on score alone |
|---|---|---|
| Mechanical Engineering AI Expert | 94 | **0** (avg score 20, max 65 — score alone already rejects all of them) |
| AI & Software Engineers | 382 | **33** |

So the criteria are NOT redundant with score in general — on the live "AI &
Software Engineers" role they change the outcome for 33 people. Reading the
scan evidence behind those 33 split them into two genuinely different
things:

- **25 of 33 are the criteria working correctly.** High overall_score
  (85-95%), but the specific mandatory skill genuinely has no evidence in
  `skill_matches[]` — exactly the "adjacent experience shouldn't sneak
  through" protection the feature exists for.
- **8 of 33 are a real scan-engine defect, not a candidate defect.**
  `overall_score` (avg 90.1) and `strengths` ("11 years across Python, Java,
  C++, Golang, TypeScript, Rust... Dropbox and Agari") both confidently
  described a strong candidate, while the SAME scan's `matched_skills[]` had
  **every single entry** read `found:false, confidence:0` — no evidence for
  ANYTHING, not just the failed criterion's own terms. IvyLens's own
  narrative judgement and its own structured evidence disagreed completely
  within one scan record, and `checkMandatoryCriteria` can only read the
  structured half.

**The auto-send path was never contaminated** — checked, not assumed: all
156 already-`email_sent` rows on this role have clean, populated skill
arrays. The defect only ever produces false REJECTIONS, never false sends.

### The fix — capped at review, not removed

Deleting the criteria check was rejected: the 25/33 genuine catches prove it
is doing real work, and score alone would have auto-sent all of them.
Instead, `gate.ts` gained `scanHasNoSkillEvidence()` — true when
`skill_matches[]` is non-empty but **wholesale** empty (not one `found:true`
anywhere in the array, not just among the failed criterion's terms). When
that is true, the criteria check is treated as **unverifiable rather than
failed**:

- A score that would have auto-sent is capped at `review_pending` instead —
  the identical shape as the unknown-country cap already in this file: never
  auto-send in the operator's name on a check that could not actually run.
- A score too low to qualify anyway still falls through to `rejected_score`
  unchanged — no added review burden for a candidate who was never going to
  pass regardless (this is exactly the shape of the 16 genuinely-thin-CV
  Mechanical Engineering candidates who scored 0 with the same wholesale-empty
  array — a different, unrelated cause, not this defect).
- A **partial** array — real evidence for other skills, none for the failed
  criterion specifically — is untouched and still vetoes normally. So is a
  genuinely **empty** array (`skill_matches: []`, nothing scanned at all) —
  a different, pre-existing shape `checkMandatoryCriteria` already handles.

Six tests in `gate.test.ts`, two mutations reintroduced and watched to fail:
disabling the safety net (the review-not-reject cases revert to
`rejected_criteria`) and treating every scan as degenerate (the
partial-evidence and empty-array cases wrongly stop vetoing).

**The root cause inside IvyLens's scan engine — why `skill_matches[]`
sometimes comes back wholesale empty despite a confident score and detailed
strengths — is still open.** This fix is a policy safety net at the
consuming end, not a fix to the producer. `reconcile_skill_matches`
(`scan_engine.rs`) defaults an unmatched skill to `found:false, confidence:0`
by design (see "A checklist item is not the same as a requirement" in
IvyLens's own CLAUDE.md) — that default is correct when the model genuinely
found nothing, and wrong only in the rarer case where the model's answer for
`skill_matches` came back empty or unmatched independent of its own
`overall_score`/`strengths` judgement. Nothing in this session traced why
that happens (candidate names differ, dates span six days, not one incident
— see the raw evidence in the commit `3294102` message and gate.test.ts).

**Applied to the 8 already-misrejected rows the same day.** The idempotency
guard is row-EXISTENCE, not status (see "Idempotency is the DB" above), so
the code fix alone does nothing for candidates who already hold a
`rejected_criteria` row — the fix only changes what happens on the NEXT
scan of a candidate with no row yet. The 8 exact rows (score ≥75, wholesale-
empty `matched_skills`, requisition `7ae62d7d`) were identified by the same
SQL used to diagnose the bug, backed up, and deleted — the next hourly cron
re-scans them under the fixed gate. Because the fix caps at `review_pending`
rather than auto-sending, this is safe by construction: no email can go out
to any of the 8 without a human approving it from the review queue, however
IvyLens re-scores them.




---

## Five fixes from the system inventory (2026-09-24)

`docs/SYSTEM_FEATURES_INVENTORY.md` lists every feature in both apps
with build / test / live-usage status. Five of its issues were fixed in
the same pass:

- **Employee leave link was unreachable.** `/leave/<token>` and
  `/api/leave/<token>` were missing from the portal middleware's
  `PUBLIC_ROUTES`, so the employee (who has no login, by design) was
  redirected to `/auth/login`. The page's own server-side preflight
  calls the API with no cookie, so BOTH must be public. Same defect
  class as the admin cron 307. Note the token rotates after every
  submission (anti-replay), so each request needs a freshly shared link.
- **Leave is ONE table: `absence_records`.** The leave link, the
  Absence page and approve/deny wrote it; Calendar, HR Reports and
  Employee Records read `leave_records`, which nothing else wrote. All
  now read absence_records, aliasing `absence_type`→`leave_type` and
  `days`→`days_count` in the select and passing rows through
  `normaliseAbsenceRows()` (blank end date = one day, blank count = the
  inclusive span). `calculateLeaveBalance` accepts both vocabularies
  (`holiday`/`annual_leave`, `sick`/`sick_day`). `leave_records` is now
  unused; it was empty, so nothing was migrated and it was not dropped.
- **Clients could not act on a "Sent" candidate.** The admin Send
  button sets `shared`; the portal buttons showed only for `pending`.
  `lib/hiring/candidateDecision.ts` — `pending`, `shared` and
  `info_requested` all mean "waiting on the client".
- **Service request responses now email the client.** `POST
  /api/admin/service-requests/[id]/respond` saves, completes, sends
  `serviceRequestResponseEmail` to the raiser (falling back to the
  company's client_admins), writes `email_log`, and REPORTS a failed
  send. The Requests screen used to say "Response sent to client" when
  nothing had been sent.
- **Module flags are enforced on pages, not just the menu.**
  `portal/src/lib/moduleAccess.ts` is the one route→flags map; the
  middleware redirects a switched-off page to `/dashboard`, section
  tabs hide it, index pages land on the first enabled tab, Quick
  Actions disable by it. The middleware reads flags FRESH for gated
  paths (the session cookie can be 15 min stale) and fails OPEN on a
  DB error — the gate is commercial; RLS is the data boundary. Free
  programmes are gated by their own flag only (`/lead/learning` →
  `learning`, `/hire/friction-lens` → `friction_lens`). A test walks
  `app/(portal)` and fails on any page that is neither in the map nor
  in `UNGATED_ROUTES`. Calendar is now gated by `calendar` in the
  sidebar too.

Portal gained `vitest.config.ts` (the `@/` alias) so the middleware can
be tested. Every fix was mutation-checked (10 reintroductions, all
caught). `resilient.test.ts > stops retrying when the budget runs out
mid-ladder` is timing-sensitive and fails roughly 1 run in 6 under load;
it predates this change.

### Second pass, same day

- **Milestones have ONE vocabulary** (`lib/roadmap/milestones.ts`,
  shared-dupe pair): pillar `hire|lead|protect`, status
  `not_started|in_progress|complete|at_risk`, quarter `Q3-2026`. The admin
  client tab wrote `HIRE`/`Q2 2026`/`Not Started`, the portal read the
  lowercase form, and the admin Roadmap selected a `track` column that
  never existed, so its query failed and the page was always empty.
  Migration **087** adds CHECKs for the vocabulary. **It must be applied
  AFTER this code deploys**: the previously deployed admin still writes
  `HIRE`, and the CHECK would refuse it. A test pins the tuples against
  087's SQL.
- **Orphaned portal pages** are now in the section tabs, and
  `portalPagesLinked.test.ts` fails on any static page that no other file
  links to. A page naming its own path and `revalidate*Path()` calls do
  not count as links; both hid orphans until mutation-tested.
- **`candidates.recruiter_notes` is INTERNAL.** Admin's form says "not
  shown to client". The portal role page had a panel for it that never
  rendered because the column was not selected; the panel is removed, not
  filled. RLS is row-level, so a client can still read the column
  directly. 0 rows hold notes today; move them to a staff-only table
  before that changes.
- `/api/support/poll` had no caller. The notification bell now calls it,
  throttled to once per 5 min per browser, and it returns before any
  IvyLens call when the company has no IvyLens tickets.
- `thepeopleoffice.co.uk` → `thepeoplesystem.co.uk` in 7 places.
- Removed dead code: the dashboard's two unused LEAD/PROTECT queries,
  admin's unreachable `saveService` / Services state, and the unimported
  `HiringStageUpdater` / `ClientStatusToggle` components. With the
  Services tab gone, nothing can write `client_services`, so the portal's
  "Active Services" panel stays empty until that is decided.

---

## The People System → Core OS 360 (2026-09-24)

Operator: change every logo, favicon and piece of branding to **Core OS
360**, but **keep the domain** so emails, athlete links and anything live
on thepeoplesystem.co.uk keep working.

- **`lib/brand.ts`** (shared-dupe pair) is the one source for the name,
  tagline, logo paths, the email logo URL and the default sender.
- **Assets** in each app's `public/brand/` + `public/favicon.ico` were
  generated from the brand mockups: the SVG marks were lifted from the
  rendered artboards (not traced), the lockup text is outlined Unbounded
  (no web-font dependency), favicons use the SIMPLIFIED mark (mockup rule:
  simplified below 112px), home-screen icons the full mark on the navy
  tile, plus a 512 maskable. Email logo is a PNG, because mail clients do
  not render SVG.
- **Domain kept on purpose.** URLs, `noreply@portal.thepeoplesystem.co.uk`,
  Reply-To, the website link in email footers and the Resend-verified
  domain are unchanged. The email logo is served from
  `portal.thepeoplesystem.co.uk/brand/…` because Resend flags images off
  the sending root domain.
- **`EMAIL_LOGO_URL` is no longer read.** It pointed at the old artwork;
  if it was still set in Vercel it would have kept the old logo on every
  email.
- **`brandFromAddress()`** swaps ONLY a pre-rebrand display name in
  `EMAIL_FROM` ("The People System <x>" → "Core OS 360 <x>"), keeping the
  address. Staff senders and the ARG referral sender pass through as
  given.
- **Deliberately NOT renamed (they are lookup keys or stored data):**
  Stripe `RETAINER_PRODUCT_NAME` and `VAT_RATE_DISPLAY_NAME` (found by
  exact name; renaming creates duplicates), Manatal `'TPS'` industry and
  `'TPS-managed client'` tags, the `'TPS'` sector value, `tps_*` role
  enums and `tps_company_id` metadata. Comments that record history still
  say The People System.
- **The referral invite stays Andrews Recruitment Group**, and a test now
  also asserts it carries no Core OS 360 string.
- `brand.test.ts` fails on any non-comment "People System" string or any
  reference to the old blob logo in either app, and checks every asset
  exists in both apps. Mutation-checked.
- Also fixed: `manifest.json` and `sw.js` were inside the auth matcher, so
  a signed-out fetch (the login page links both) got the login HTML back.
  They are now excluded in both apps, with tests.
- **UI colour palette moved to Core OS 360** (operator, same day). The
  token NAME `--purple` is kept (375 call sites) but its VALUE is
  `var(--brand-accent)` = `#0B7896`, the darkest brand cyan that passes
  WCAG AA both as text on white and under white text (5.1:1). The bright
  logo cyan `#3FD6F2` (1.7:1 on white) is decoration only
  (`--purple-lt` / `--brand-cyan`) — never text. `--gradient` and
  `--gradient-cta` carry white button text, so both stay within AA-safe
  stops (`#0B7896 → #075E77`). ~200 hardcoded purples across 78 files
  were converted; lavender neutrals became cool grey-blue.
- **Categorical colours were NOT converted** (violet skill levels /
  learning types, pink leave categories): they distinguish data, not
  brand. **The ARG referral email keeps its purple** via a per-sender
  `accent` on `SenderIdentity` — it goes out under ARG's name. Tests pin
  the token values, AA contrast of every white-text gradient stop, zero
  old-brand purple outside that one accent, and the sender split.
- **Fonts are self-hosted** (after the palette change, same day). The
  portal CI build failed because `next/font/google` in `app/r/layout.tsx`
  fetched Oswald/Inter from Google DURING THE BUILD and got a response
  its parser choked on. Inter, Oswald and Unbounded (the wordmark face)
  are now variable woff2 files in each app's `public/fonts/`, declared by
  `@font-face` in `globals.css`; the root layouts' runtime Google `<link>`
  is gone too. `.woff2`/`.woff` are excluded from the auth matcher (a
  signed-out login page requests them). `brand.test.ts` fails on any
  `next/font/google` import or Google Fonts URL. The logo lockups are
  outlined SVG and never depended on a font.

---

## The referral cron re-emailed 21 people every hour (2026-09-21 → 09-24)

Found while baselining live activity before merging PR #200. "AI &
Software Engineers" passed **1,000** `referral_applications` rows on
21 Sep. `processRole`'s already-processed read was ONE `.in()` over
every applicant (1,868), and PostgREST answered with its first 1,000
rows, silently. The rows past the cap looked new again, and since the
backlog drains oldest-first they came up every run. Each run re-scanned
them and **sent the email BEFORE the insert**; the insert then hit the
unique constraint, was counted as `already_processed` (benign, by the
old comment), and nothing recorded the send. **21 people, 518 extra
emails, worst 43.** `email_failures: 0` and `notes: []` on every run.

- **The read is chunked** (`readProcessedIds`, 200 ids per request), so
  each response is bounded by the chunk, not the table. A failed read
  **skips the role** (fail closed) — the old code treated an error as
  "nobody processed".
- **The row is claimed BEFORE the email.** Insert first (status
  `qualified`), send, then update to `email_sent` with
  `{ count: 'exact' }`. A failed insert, for ANY reason, now means no
  email. The unique constraint is the real guard; the pre-read is only
  an optimisation to avoid paying for scans.
- `pipelineIdempotency.test.ts` drives `processRole` against a fake
  that reproduces the 1,000-row cap and the unique constraint. Two
  mutations caught: the original code (4 fail) and the new ordering
  with an unbounded chunk (2 fail).
- **Mitigation applied live:** `dry_run = true` on all three enabled
  referral roles at ~11:20 UTC 24 Sep. It must be turned back off by
  hand once this deploys; nothing does it automatically.
- `check-row-cap.sh` cannot see this class: it catches `.limit(N>1000)`,
  not an unbounded `.in()` whose RESULT grows past the cap.

---

## Sending by hand claims first, too (2026-09-24)

The approve/apply route had the same send-then-record order the cron
had until the same morning: read `qualified`, send, write `email_sent`.
Two clicks, or a bulk run racing a click, both sent. And three people
the duplicate bug had emailed 21+ times were still at `qualified`,
because that bug never recorded its sends, so "Send invite" would have
emailed them again. Their rows were corrected to `email_sent` by hand
with a history note.

- **`lib/referral/approve.ts` is the one manual send path** (single
  Approve/Apply and bulk). Order: refuse if `email_log` already holds a
  successful send to this address with this role's subject (matched on
  address, not candidate_id, since the old bug made a new candidates row
  per send), then a CONDITIONAL claim (`status = <what we read>`, checked
  count), then send, then record. A failed send puts the status back.
- **`referralInviteSubject()`** is exported from the template so the
  guard and the email cannot disagree about the subject line.
- **`POST /api/admin/referrals/send-qualified`** plus a "Send all
  qualified (N)" button on the Referrals page: up to 50 per click, one
  at a time, stops after 3 consecutive send failures (Resend quota), and
  reports what it skipped and why.
- `approve.test.ts` uses a stateful fake (conditional updates, a real
  email log). Three mutations caught: unconditional claim, no
  already-sent guard, no release on failure.
- **Still open:** 7 of the 21 duplicate recipients are recorded as
  `rejected_score` although they were emailed (a later re-scan scored
  them lower). Left as is pending the operator's call.

---

## Sign-in intro (2026-09-24)

Operator: animate the new logo on sign-in, centre screen, fading away as
the platform comes into shot.

- **`components/brand/BrandIntro.tsx` + `.module.css`** (shared-dupe
  pairs). Navy stage; the three blades sweep a full 360° into place
  around the core, an orbit ring draws, the wordmark (Unbounded) settles,
  then the camera pushes through the core while the navy fades. About
  1.7s minimum, 3.8s maximum, and any click or key skips it.
- **Triggered by a cookie, not client state.** The login form sets
  `cos360_intro` (`BRAND_INTRO_COOKIE` in `lib/brand.ts`, max-age 60)
  before navigating. The (admin)/(portal) layout reads it server-side and
  renders the overlay in the FIRST paint; a sessionStorage flag would let
  the dashboard flash before the intro mounted. The intro clears the
  cookie on mount, so a reload does not replay.
- **The mark is inlined** (`lib/brandIntroMark.ts`, generated from
  `public/brand/core-os-360-mark.svg`, gradient ids prefixed `cosi-`)
  because CSS cannot reach inside an `<img>`. The stylesheet targets the
  parts by position (blades = `g` 1–3, core = `g` 4);
  `brandIntro.test.ts` pins that structure. Regenerate from the SVG, never
  hand-edit.
- **The SVG is a memoised child that never re-renders.** Switching the
  overlay to its exit class re-rendered it, React re-set the inline SVG,
  and the blades restarted their spin from invisible just as the exit
  began. Found by filming the exit frame by frame, not by any test.
- Motion is transform/opacity only. `prefers-reduced-motion` gets a still
  logo and a plain fade. A CSS `autoExit` at 4.5s removes the overlay
  even if JavaScript never runs.
- **Next.js route files may export only Next's own names** (`GET`,
  `POST`, `runtime`, `maxDuration`, …). An exported constant from
  `send-qualified/route.ts` passed `tsc` and the tests and failed
  `next build`. Run a production build before pushing a new route.

---

## Any signed-in user could make themselves staff (fixed 2026-09-24)

Found while planning Health & Safety provider logins, verified live and
reproduced in a rolled-back transaction before fixing:

- **`profiles_update` had no WITH CHECK, there was no trigger on
  `profiles`, and `authenticated` holds UPDATE on `role` and
  `company_id`.** `update({ role: 'tps_admin' })` on your own row from
  the browser console succeeded, and `is_tps_staff()` then opened every
  table. `company_id` could be pointed at another client the same way,
  and a client_admin could promote a colleague.
- **The admin app trusted an unsigned `tpo_admin_role` cookie.** The
  middleware skipped the role check whenever it read `tps_admin`, and
  `(admin)/layout.tsx` trusted it outright. Both apps share Supabase
  auth, so any client user could set it in devtools and load staff
  pages, some of which read with the service role. API routes calling
  `requireStaff()` were safe; `raise-invoice`, which relied on the
  middleware alone, was not.
- **Clients could switch on paid modules:** `client_company_update`
  allowed a client_admin to write `feature_flags`.

### The first fix was broken the same day, four ways

The first 088 guarded NAMED columns. An adversarial review (three
lenses, each finding re-verified by a refuter, several reproduced live
in rolled-back transactions) found:

- **DELETE your profile, INSERT it again with another company.**
  `profiles_insert` checks only `id = auth.uid()`; the guard's INSERT
  branch looked only at role.
- **Email squatting.** Set your own `profiles.email` to a new hire's
  address. Both invite routes found an existing account BY
  `profiles.email` and upserted company + role onto it with the service
  role, which the guard exempts. You became that client's admin.
- **Invite takeover.** A client_admin inviting a staff email demoted
  that staff member to their client editor; inviting another client's
  user moved them. The invite path is service role, so no trigger sees
  it.
- **`invite_token`, `manatal_client_id`, `ivylens_company_id` were
  writable.** Set a colleague's token and redeem it at
  `/api/auth/set-password`; repoint your company's Manatal or IvyLens
  id and the server reads another client's data with the platform key.

### The fix, and the traps in it

- **Both guards are ALLOW-LISTS** (`self_service` in each function).
  A non-staff caller may change only the columns the product lets a
  client edit; every other column, including any added later, is
  staff-only by default. Non-staff INSERT and DELETE on `profiles` are
  refused outright (no client path does either). Applied 2026-09-24,
  probed against production: twelve attacks blocked, name /
  preferences / onboarding / company-settings edits still work, staff
  and service-role writes unaffected.
- **Widening an allow-list is a security decision.**
  `securityHardeningSql.test.ts` pins both lists EXACTLY and scans every
  portal `.update()` made with the user's own session: a column outside
  the list fails the suite instead of 42501-ing a client's Save.
  A write that genuinely needs a guarded column goes through the
  service role in a route that takes the company from the SESSION
  (`lib/supabase/service.ts`) — see `api/company/register` and
  `/assessment`, which also now refuse an IvyLens id that is not the
  one stored for the caller's company.
- **Invites resolve an existing account in `auth.users`**
  (`auth_user_id_by_email()`, service role only), never by
  `profiles.email`, and `lib/auth/existingInvitee.ts` (shared pair)
  decides what may happen to it: never moved between companies, never
  demoted from a staff or provider role, and a client_admin may only
  RESEND a pending invite in their own company. An existing account's
  row is updated only while still in the target company. Route tests
  drive both handlers against a stateful fake with the real unique
  email index; the original code fails 3 (admin) and 4 (portal).
- **The service role is exempt from every trigger.** Any route that
  writes `profiles` or `companies` with it is its own security boundary
  and needs the same care as a policy.
- **A column REVOKE does nothing here.** `authenticated` has table-level
  UPDATE, and column privileges only add to that. Guards are triggers.
- **The triggers are SECURITY INVOKER and key on `current_user`.**
  Through PostgREST that is `authenticated` or `anon`; the service role,
  the SQL editor, auth's `handle_new_user` and DEFINER RPCs such as
  `record_portal_login` are unaffected. `auth.uid() IS NULL` is the
  wrong test: it is true for anon AND the service role.
- **`lib/auth/adminRoleCookie.ts` signs the cached role** (HMAC over
  `{userId, role, iat}`, env var `ADMIN_SESSION_SECRET`). A cookie
  verifies only for the user it was minted for and only inside the
  15-minute window. Without the secret nothing is signed and every
  request re-checks via the RPC: slower, never open.
- **The layout is a second gate, not a copy of the first.** It binds
  the cookie to `getUser()` itself. The middleware matcher used to skip
  any path ending in `.png`/`.svg`/`.woff2`…, which included
  `/clients/x.png` — so for those requests the layout WAS the only
  gate, and it did not bind. Static files are now excluded by folder
  (`brand/`, `fonts/`), with a test on page paths ending in extensions.
- **A failed role check is not a "no".** A transient `get_my_role`
  error now sends staff to sign in with the session intact; it used to
  call `signOut()`, whose default scope is GLOBAL. A refused non-staff
  user is signed out with `scope: 'local'` — both apps share auth, and
  global would end a client's portal sessions everywhere.
- **`raise-invoice` checks `requireStaff()` itself** and takes
  `created_by` from the session; it read an `x-tps-admin-id` header
  that nothing set and anyone could.
- **Supabase Auth → "Allow new users to sign up" should be OFF.**
  `handle_new_user` gives every auth user a profile; invites use
  `auth.admin.createUser` and are unaffected.
- **Fixed 2026-09-25, its own PR:** Next 14.2.4 predated the
  CVE-2025-29927 middleware-bypass fix (14.2.25); both apps are on
  14.2.35, the latest 14.2.x patch. See the section below.

---

## Defects under Health & Safety's foundations (fixed 2026-09-24, migrations 089-090)

Found during H&S discovery. Every affected table was empty, which is
the only reason none had been reported — each fails the first time
anybody uses the feature. Probed in production before and after
(`supabase/probes/089_hs_defect_fixes.sql`).

- **Storage: any signed-in user could write into any company's folder**
  in the `documents` bucket ("Authenticated upload to documents bucket"
  checked only `athletes/`). Replaced by
  `documents_client_insert_own_folder` (first folder = your company).
  Staff keep `tps_write_storage`. Clients also can no longer drop files
  into `reports/<their company>/`, which they could have used to plant
  a "report".
- **Clients could not open their own reports**: they are stored at
  `reports/<company_id>/…` and the client read policy matched only a
  first folder equal to the company. `documents_client_read_reports`.
- **Every file upload orphaned its file.** `documents.file_url` and
  `reports.file_url` were NOT NULL while every uploader now writes only
  the storage key (the buckets are private; public URLs never resolved).
  Now nullable with a CHECK that one of url / key is present.
- **Clients could not add documents at all**: no client INSERT policy.
  `client_documents_insert` requires the caller's company, their own
  uid as `uploaded_by`, a file in their own folder, and no approval
  fields — a client cannot upload a document already signed off.
- **`compliance_items.notes` did not exist** while the portal register
  and the admin client tab selected it, so both lists were always empty.
- **Admin `/health` filtered `status <> 'completed'`**, a value
  `compliance_status` never had (22P02; the overdue column was always
  empty). `COMPLIANCE_STATUSES` is now a tuple in `statusMaps.ts` and
  `complianceStatusLiterals.test.ts` checks every status literal in any
  `compliance_items` chain in both apps against it.
- **Employee-document upload always failed** (`file_size` is not a
  column on `employee_documents`) and left the stored file behind. The
  column is gone from the insert, `uploaded_by` is recorded, and a
  failed insert removes the file.
- **The client "mark compliance done" button could never work** (no
  client UPDATE policy) and is removed. The register is recorded by
  staff and providers from Phase 1 on.
- **Deleting a client left files behind**: `wipeCompany` never listed
  `documents/reports/<id>` or the `athlete-cvs` bucket.
- `lib/storage/fileKinds.ts` is now a shared-dupe pair (it already was
  byte-identical, by hand).
- **090 adds `user_role` 'hs_provider'** alone in its own migration (a
  value added by ADD VALUE cannot be used in the same transaction).
  Inert until staff grant it — 088 refuses any non-staff role change or
  profile insert. `USER_ROLES` / `ROLE_LABELS` carry it in both apps.

---

## The second security review (2026-09-24, migrations 091-093)

A second adversarial round, run on the merged 088 hotfix, found five
more. Each was verified live (rolled-back probes in `supabase/probes/`)
or in the code before fixing.

- **Set-password tokens were readable.** They sat in plain text in
  `profiles.invite_token`, and `client_profiles_admin_manage` lets a
  client_admin SELECT every profile in their company. So when staff sent
  an ACTIVE user a reset, any admin there could read the token and
  choose that colleague's password. And because unredeemed tokens were
  never cleared, "holds a token" had come to mean "pending invite", so
  the portal's resend path would mint fresh links for active colleagues.
  - Tokens now live in **`profile_access_tokens` as SHA-256 only**, RLS
    on and NO policies (service role only). `lib/auth/accessTokens.ts`
    (shared pair) mints, peeks and redeems. Redeeming is a
    `DELETE … RETURNING`, so it's single-use, and it burns the account's
    other links. An account may hold several live links, so a resend no
    longer kills the one already in someone's inbox.
  - **"Pending" means never signed in** (`auth.users.last_sign_in_at`),
    read with `auth.admin.getUserById`.
  - **The portal never returns a set-password link to a client
    inviter.** A failed email is a 502 the inviter sees (the UI used to
    say "sent" regardless), and retrying is safe: the account now
    exists, has never signed in and is in the inviter's company, so the
    retry takes the resend path. A returned link would let a client set
    the password on an account in someone else's name, and an email
    failure can be forced.
  - **Every refusal of an existing account gives a client the same
    answer.** Staff, another client, an active colleague: one generic
    409, with the reason logged server-side. At the seat cap, an
    existing outside address and an unknown one both get
    `seat_cap_reached`. The distinct messages used to tell one client
    which addresses belong to other clients or to staff. The seat count
    runs before the lookup for that reason, and the route is
    rate-limited (`limiters.account`).
  - **Interim, applied 2026-09-24:** the one plain-text token left in
    production (expired) was cleared by hand, so the live code's
    token-means-pending path had nothing to re-arm before the deploy.
  - **092 must be applied AFTER this deploys.** It re-copies any
    late-minted tokens and clears `profiles.invite_token`; before the
    deploy, the live code still redeems from that column.
  - The admin resend-invite and reset-password routes used to return a
    link whose token was never saved when the email failed: a dead link
    handed to staff. They now mint first, so the link works.
- **The portal session cookie never expired server-side.**
  `verifyPortalSession()` checked the signature but never `iat`. A
  cookie value copied out of devtools therefore verified for ever: a
  user deleted, demoted or moved months ago could replay it, with no
  Supabase session, past the middleware fast path.
  - It now refuses a cookie older than `PORTAL_SESSION_TTL_SECONDS`
    (15 min), dated in the future, or missing `iat`.
  - Routes that write with the service role no longer trust the cookie
    at all. `lib/auth/liveSession.ts` `requireLiveSession()` verifies
    the JWT with `auth.getUser()` and reads role and company fresh via
    `get_my_role` / `get_my_profile`. Used by the portal invite,
    employee leave-token regenerate, and IvyLens register/assessment.
  - **Rule: a service-role route uses `requireLiveSession()`, never
    `getSessionProfile()`.** RLS and 088 do not see service-role writes,
    so the route is the only boundary.
- **Portal Manatal move-stage moved ANY match in the account.** The only
  check was that the caller's company had a Manatal id; the PATCH uses
  the platform key, and the response echoed the candidate's name and
  email. The match must now be in the caller's own
  `getManatalMatches(manatalId)` set and the stage must be real. The
  response no longer carries the upstream record.
- **`prune_latest_updates()` was executable by anon.** 060's
  `REVOKE … FROM PUBLIC` removed nothing, because Supabase grants
  EXECUTE to anon and authenticated BY NAME. **Revoke from `PUBLIC,
  anon, authenticated` explicitly** for any SECURITY DEFINER function
  that isn't meant for clients (093).
- **`bd_leads_view` bypassed the staff-only RLS** under it: it was owned
  by postgres, not security_invoker, and granted to anon. It is now
  security_invoker with those grants revoked (093). Nothing reads it.
- **088's allow-list was per column, not per row.** A client_admin could
  still set a COLLEAGUE's consent or erasure-request fields. 093 applies
  the self-service list to your own profile only. On anyone else's
  profile, a non-staff caller can change nothing.
- `securityHardeningSql.test.ts` now pins the LATEST migration that
  defines each guard function (093 replaced 088's), not the first.

---

## Health & Safety Phase 1a: providers and the workspace (2026-09-24, migrations 094-095)

External H&S providers (a consultancy such as Lighthouse Safety, a
training company such as Kentec) get their own logins and record work for
the clients they are assigned to. Clients will review it on the Safety
Timeline (the portal side is Phase 1b).

### Rules

- **The database is the boundary.** A provider holds a normal Supabase
  JWT and can call PostgREST directly, so every rule lives in RLS and
  triggers (094/095), never only in a route. `hs_can_access` /
  `hs_can_write(company, scope)` are the one place an assignment's scope,
  status, access level and date window are checked.
  `supabase/probes/095_hs_provider_access.sql` is the live proof.
- **A provider login is `role = 'hs_provider'`, `company_id = NULL`,
  `hs_provider_id` set.** The NULL company means every existing client
  policy already denies them. A CHECK (`profiles_hs_provider_shape`)
  holds the shape. `hs_provider_id` is not on 093's self-service list,
  so only staff (or the service role) can set it.
- **Providers get NO policy on `companies`, `employee_records` or
  `profiles`.** What they need comes from `hs_my_companies()` (named
  columns only). A later phase that needs people adds a similar RPC,
  never a row policy.
- **Admin middleware is a role→path allow-list** (`lib/auth/rolePaths.ts`).
  `hs_provider` may reach only `/hs` and `/api/hs/*`, anchored, on the
  cached-cookie fast path too. A page bounces to `/hs`; an API gets 403.
  `/api/files/sign` is deliberately NOT allowed: it signs with the service
  role. Evidence links are signed under the user's own session instead.
- **Nothing under `app/(hs)`, `app/api/hs`, `lib/hs` or `components/hs`
  may use the service role** (`noServiceRoleInHs.test.ts`). The `(hs)`
  layout does not render `AdminSidebar` or the `(admin)` layout's client
  list, which read with the service role. Staff-only provider management
  lives under `app/api/admin/hs` behind `requireStaff()`.
- **Every H&S table writes to `hs_events`**, via AFTER triggers that are
  SECURITY DEFINER. Sessions have no INSERT, UPDATE or DELETE on
  `hs_events`, and no UPDATE or DELETE on completions, activities or
  files. A correction is a new row. `hsSqlShape.test.ts` pins RLS on, a
  staff policy, no open policy, provider writes via `hs_can_write`, the
  revokes, and one `_hs_event` trigger per source table. Add each new H&S
  migration to its FILES list.
- **The register is `compliance_items`**, with a generated
  `domain` column (`hs` for `hs_*` and the legacy `health_safety`). A
  completion computes the next due date in SQL (`hs_next_due`). It rolls
  the item forward only when it is the newest completion, so back-filling
  an old certificate never moves the register backwards.
  `lib/hs/recurrence.ts` mirrors it for the form preview, and its test
  values came from the live function.
- **Evidence keys are `<company>/<entity_type>/<entity_id>/<uuid>-<name>`**
  in the private `hs-evidence` bucket, built only by
  `lib/hs/evidence.ts`. Storage policies read the first folder as the
  client and the second as the scope; `hs_files` has a CHECK tying its
  row to the same parts.
- **Provider set-password reuses the portal page.** The link is the same
  hashed-token flow. For an `hs_provider` the API returns `next` (the
  admin sign-in URL), and the portal middleware signs any provider out
  locally and redirects them to `${NEXT_PUBLIC_ADMIN_URL}/hs`.
- **Provider invites never convert an account.** `decideProviderInvite`
  refuses any client or staff account, and refuses a live login of
  another provider. Revoking unlinks first, because that cuts access
  immediately even with a valid JWT. It then burns set-password links
  and bans the auth user.
- **Not yet:** `FILE_KINDS.hs_file` (not needed while links are
  session-signed); the `compliance_items.category` CHECK, which lands
  after every writer uses `HS_REGISTER_CATEGORIES`; the portal PROTECT
  rebuild (1b). No email is logged to `email_log` for a provider invite,
  because `email_log_target` has no provider value; the audit log
  records it.

---

## Health & Safety Phase 1b: PROTECT is Health & Safety (2026-09-24)

The portal's PROTECT section is now **PROTECT · Health & Safety**:
Overview, Register (`/protect/compliance`, URL kept), Actions, Timeline
and Reports. The HR pages that lived under it moved to LEAD.

- **Moved:** `/protect/{absence,offboarding,hr-dashboard,employee-docs}`
  → `/lead/...`. Permanent (308) redirects live in `portal/redirects.mjs`,
  read by `next.config.mjs`. Bookmarks, emailed links and stored
  notification links keep working. `redirects.test.ts` fails if a
  source still has a page or a destination has none.
- **Their flag KEYS are unchanged**, because they are stored per client in
  `companies.feature_flags`. Only the master moved: those pages now need
  `lead` + their own flag, not `protect`. At the time of the move, `arg`
  had both masters on and `oarugby` had both off, so no client's access
  changed. `FLAG_GROUPS` lists them under LEAD.
- **The Register is read-only for clients** by design: nothing on it is
  self-certified. It shows H&S items (`domain = 'hs'`) with recurrence,
  last done, next due, the latest outcome and evidence. HR-domain items
  are listed separately underneath, so nothing a client could see
  before has vanished.
- **The overview names every outside provider** who can see and record
  the client's H&S data, with their scopes and end dates, from
  `hs_provider_companies` (client read policy, 094).
- **Evidence opens with a link signed under the client's own session.**
  The `hs-evidence` storage policy limits a client to their own folder.
  No service role is involved.
- **`lib/hs/{vocab,recurrence,types,evidence}.ts` are shared-dupe pairs
  now** (26 pairs).
- **`SectionTabs` highlights ONE tab**, the longest match. `/protect`
  (Overview) is a prefix of every other tab and used to light up
  alongside them.
- **Done (2026-09-25, folded into the H&S-staff-delivered PR below):**
  the admin client-detail "PROTECT" tab — which only ever rendered
  absence records and employee documents, pure HR content — is renamed
  "HR" (`tabs/ProtectTab.tsx` → `tabs/HrTab.tsx`, `case 'PROTECT'` →
  `case 'HR'` in `api/client-tab-data/route.ts`). It gets no companion
  "H&S" tab: H&S has its own top-level `/health-safety` section by
  then (see below), so client-detail links out to it instead
  (`/health-safety/<companyId>` card in the Overview tab) rather than
  duplicating the register inside a tab. The generic compliance
  writers (`ClientDetailTabs`, `AddComplianceItem`, `api/admin/
  compliance`) took the narrower fix of dropping `'health_safety'`
  entirely rather than adopting `HS_REGISTER_CATEGORIES` — see below;
  the BD convert route named here no longer exists (BD Intelligence
  removed the same day).

---

## Everything that happens now has consequences: platform_events (2026-09-25, migrations 096a-097)

Operator: *"how can we make it smarter, more in sync with each feature
(automations and full flow from every action) and also innovative"*.
Three read-only reviews found the gap was not intelligence but
**connective tissue**: sixty-plus write sites ended in a cache refresh
and nothing else. A client raising a role, approving a candidate or a
service request; a provider recording a failed check; anything going
overdue — nobody was told, and the two places that tried to tell staff
could never work (X1 below).

### The shape

- **Capture at the database.** `platform_events` (096) is an outbox
  written by ONE SECURITY DEFINER trigger function,
  `platform_event_row()`, attached to 24 tables with a per-table
  **column whitelist** in the trigger arguments. INSERT → `created`,
  DELETE → `deleted`, UPDATE → `updated` only when a whitelisted column
  changed (`payload.changed[]`, `payload.old{}`). Only whitelisted
  columns travel; never salary, NI number, notes, details, bodies.
  `platformEventsSql.test.ts` fails on a sensitive column in any
  whitelist, on a table in `TRIGGERED_ENTITIES` with no trigger, and on
  any session write path to the table.
- **One consumer, service role, admin app.** `/api/cron/process-events`
  every five minutes claims via `claim_platform_events()` (SKIP LOCKED,
  10-minute lease, five attempts) and runs `lib/events/rules.ts` — THE
  registry of what follows what. A rule listens for one
  `${table}.${created|updated|deleted|reminder}` key and returns
  consequences; `rules.test.ts` fails on a rule for a key nothing emits.
- **`notify()` is the one way to tell a person anything.** Audience →
  profiles (`staff` is tps_admin ONLY — `is_tps_staff()` is tps_admin
  only, and notifying tps_client would email demo accounts) → one
  `notifications` row each, deduped by key → preference → for those who
  want email now, **claim `emailed_at` (conditional, counted) then
  send**; a failed send releases the claim and is written to
  `email_log` with the error. Staff default to a **daily digest**
  (`/api/cron/digest`, 07:00); a rule may mark a consequence `urgent`,
  which emails a daily-mode user at once. Clients default to immediate.
  Preferences live in `notification_preferences` (the portal's old
  panel wrote localStorage and nothing read it).
- **Reminders** (`/api/cron/reminders`, 06:00): `lib/reminders/rules.ts`
  walks every dated open row, puts it in a bucket (`due_30`, `due_7`,
  `due_0`, `overdue`, `overdue_w<n>`), emits one reminder event per row
  per bucket (deduped for ever by key), then performs the **status
  writes** — `compliance_items → overdue`, `employee_documents →
  expired`, `policy_acknowledgements → overdue`. Nothing had ever set
  those values; the dashboards reading them were always empty.
- **Every cron run is an `automation_runs` row**, refused runs
  included, and `/automation` (admin, Operations) shows runs, the
  queue, failed events and a retry. `AUTOMATION_DISABLED=1` is the kill
  switch.
- **An email consequence with no notification row** (a raiser's
  receipt) claims by inserting its `email_log` row first under a
  `dedupe_key`; a re-processed event finds the row and sends nothing.

### The eight defects fixed alongside

- **X1** The portal new-role form and the Manatal move-stage route
  inserted staff notifications under the CLIENT'S session: the profiles
  read returned nothing (RLS) and the INSERT policy refused it. Both
  gone; the trigger and `emitEvent()` (service role, company from the
  session) carry them.
- **X2** "Mark as Hired" inserted `annual_salary` / `reporting_manager`
  (columns that never existed) and a blank NOT NULL `start_date`, so
  every hire failed. `lib/hiring/employeeFromHire.ts`, keys pinned
  against 015.
- **X3** Admin client-tab "Add action" omitted NOT NULL `action_type`
  and closed the form regardless.
- **X4** The service-request reply's `email_log` insert omitted NOT NULL
  `sender_email`.
- **X5** The portal Support page selected `service_requests.type` and
  `message`, neither of which exists, so the client's list always
  failed. The admin dashboard filtered `status = 'open'`; rows are
  `new`.
- **X6** `actions.priority` had a default of `medium`, the portal grouped
  high/medium/low, and Broadcast wrote `normal` — every broadcast action
  was invisible. One tuple, `ACTION_PRIORITIES`, both apps; 097 CHECK.
- **X7** Client candidate/offer actions revalidated `/hiring`, a path
  the portal does not have.
- **X8** `hs_completion_roll` ignored `outcome`: a FAILED check set
  `last_completed_on` and pushed `due_date` a year out, so the register
  showed "on track" for the item that had just failed. A fail now marks
  the item `in_review` and moves nothing.

### Rules

- **Add a table to the outbox in two places**: a trigger line in a
  migration (with its whitelist) and `TRIGGERED_ENTITIES`. The test
  pins the two together.
- **Never put text a client wrote into a notification title** beyond
  the row's own short fields (subject, name, title), and never a
  `details`/`notes`/`body` column into a whitelist.
- **A rule is written as if it might run twice.** Every consequence is
  keyed `${rule}:${event}:${i}`; `process.test.ts` re-runs an event and
  expects nothing new.
- **Claim before send, always.** Three mutations reintroduced and
  caught: dropping `ignoreDuplicates` (the fake now returns merged rows
  like PostgREST does — the first version of the fake hid this), sending
  before the claim, and widening `staff` to tps_client. Plus: `<=` in
  the overdue filter, `salary` in a whitelist, the X8 revert.
- **The migrations were applied 2026-09-25 before the code deployed.**
  Events written between the apply and the deploy sit unprocessed; they
  are stamped `processed_at` by hand at deploy time so the first
  consumer run does not send days-old notifications. **097 is applied
  AFTER the deploy** (the old admin client tab still wrote `medium`).

---

## PROTECT in sync, and the first Jev decisions (2026-09-25, migration 098)

PR 2 of the automation plan. Health & Safety records now have
consequences, and Jev (TypeSafe AI) makes its first typed decisions.

### What follows what (`lib/events/hsRules.ts`)

- **A FAILED check raises an ACTION** on the client (`hs_failed_check`,
  high, keyed `hs_completion:<id>` so a re-run never raises two), emails
  the client admins (`hsCheckFailed`), and tells staff in-app. `pass_with
  _actions` raises a normal one. Providers still cannot insert actions;
  the consumer does, and no policy was widened.
- **A logged activity** tells the client admins (digest urgency);
  evidence and register items added by a provider do too. A completed
  failed-check action tells staff and the provider who recorded it.
  Provider access ending is a staff reminder (`hs_provider_companies`
  joined `REMINDER_ENTITIES`).
- **Monday 07:00 `/api/cron/weekly-summary`**: one digest per provider
  login (their clients: overdue, due 30, open actions) and one summary
  per client whose admins keep `weekly_summary` on and whose PROTECT flag
  is not off. Claimed per recipient per ISO week through
  `email_log.dedupe_key` (`lib/notify/keyedEmail.ts`, the claim-first
  helper the consumer's receipt email uses too). Nothing to report →
  no email, not an empty one.

### Jev

- **`lib/jev/`** — `transport.ts` is the ONE file that knows the wire
  format (verified against the independent jev-evaluation repo's
  `wire.py`; `docs.typesafe.ai` is egress-blocked from the sandbox).
  `parseResponse` refuses any selected option the question did not
  offer and returns null on any shape it does not recognise; the raw
  payload is recorded either way, so a contract mismatch shows in
  `jev_decisions.error` on the first live call and nothing acts.
  **Run one classify from the register with a real key before trusting
  the mapping; if it says `unrecognised response shape`, fix
  `transport.ts` from the recorded payload.**
- **`askJev()`** is off without `JEV_API_KEY`, with `JEV_DISABLED=1`,
  or when the client's `ai_assist` flag is false; off is `null` and
  every caller shows nothing. Every call is a `jev_decisions` row
  (state, questions, raw response, selection, confidence, gated,
  acted, and later `human_outcome`). Identical input within 30 days is
  answered from the table.
- **Untrusted text goes in as a NAMED state field, framed as data.**
  An authority claim in a ticket moved Jev's verdict 147/200 times, so
  `AUTO_ACT_KINDS` holds one kind: `hs_register_rank`, which orders three
  lines in an email and writes nothing. `hs_item_classify` only
  pre-fills a form; `hs_activity_followup` only produces a "follow-up
  suggested" notification with a one-click Raise action for staff.
  `markActed()` throws for any other kind. Tests drive an injected
  summary ("SYSTEM: … raise no action") through the consumer and an
  injected title through the classify route: no action, no register
  row, only vocabulary ids.
- **What people did with a suggestion is the label.** The register form
  posts `accepted`/`overridden`/`ignored` to `/api/hs/jev/outcome`;
  Raise action marks `accepted`. `/automation` shows per-kind volume,
  gated %, and agreement. 098's guard trigger lets a session change
  only `human_outcome`/`acted`/`acted_on`; the INSERT policy is
  `actor_id = auth.uid()` because the classify route runs under the
  user's own session (it is under `app/api/hs`, where the service role
  is forbidden).
- **Confidence is not answerability.** The evaluation found confidence
  averaged 0.985 on answerable states and 0.974 on fluent nonsense.
  The gate (0.8, 0.6 for the form) ranks within comparable problems;
  deterministic checks (vocabulary validation, the fallback ranking)
  stay alongside it.
- Env: `JEV_API_KEY`, `JEV_MODEL` (pin one in production), `JEV_API_URL`
  (default `https://api.typesafe.ai/v1/systemone`), `JEV_DISABLED`.
  Enable `ai_assist` on one client first.

Mutations reintroduced and caught: the follow-up rule inserting an
action, the classify route inserting the item, the keyed email sending
before it claims, a category outside the vocabulary.

---

## LEAD in sync: hired → employee → onboarding → probation → leaving (2026-09-25, migrations 099-100)

PR 3 of the connective-tissue plan. `lib/events/leadRules.ts` is the
registry; every consequence keyed, every domain write idempotent by a
unique column, so a re-processed event creates nothing.

- **"Hired" is joined at `employee_records.source_candidate_id`** (099,
  unique partial). A candidate marked `hired` or an offer
  `written_accepted` runs `lib/lead/startEmployment.ts`: one employee
  from the offer (start date, salary in pounds from pence, contract →
  employment type) and the requisition (title, department), and the
  role set `filled`. The portal's Mark-as-Hired form stamps the same
  column, so whichever path runs first wins and the other finds the row.
  A candidate with no offer starts TODAY with the role's title; the
  client corrects the date on the employee page.
- **A new employee starts onboarding from the DEFAULT template**
  (`onboarding_templates.is_default`, a column nothing read before).
  `lib/lead/checklistTasks.ts` (shared pair) dates each task
  `anchor + due_day_offset` in UTC calendar days and copies the
  template's `assigned_to` (099 adds the column to both progress tables;
  it was captured on the template and reached no task anyone saw).
- **One probation review per employee** (`performance_reviews.source_ref
  = probation:<id>`, unique per company), due a week before
  `probation_end`, created when onboarding completes OR the
  `employee_records` due_30 reminder fires, whichever first.
- **Offboarding no longer terminates on day one.** `POST
  /api/portal/offboarding/start` creates the instance and tasks, sets
  `end_date` and keeps the record ACTIVE; the reminders cron's
  `employee_terminated` status write turns it `terminated` on the last
  working day (`end_date <= today`), which fires `employee_left`:
  pending leave AFTER the end date and open policy acknowledgements are
  `cancelled` (100 adds the CHECK, apply AFTER deploy) and the admins
  are told what was closed. The inline version marked people terminated
  weeks early, so their leave link died and their leave stayed pending.
- **Leave: the editors hear at once, the employee gets a receipt and the
  decision by email** (`lib/email/templates/leave.ts`). A refusal carries
  the manager's reason from `employee_notes` (`leave_denied`, newest),
  which the deny route wrote and nothing read. The Absence form now
  CHOOSES an employee from `employee_records` instead of typing a name:
  a row with no `employee_id` cannot be closed out, scored or emailed.
- **Documents:** a client upload tells staff; a staff upload and an
  approval tell the client admins.

### The Jev decisions here are made from numbers

- **`absence_pattern`** (Monday, `lib/lead/weeklyPeople.ts`): for each
  employee with ≥3 spells in 12 months, the state is `spells, days,
  Bradford factor (S²×D), sick share, Mon/Fri share, one-day spells`
  and nothing else — `leadJevState.test.ts` asserts every value is a
  finite number, and the weekly test that the request carries no name,
  note or id. The answer is an IN-APP suggestion to the client admins
  (`notify({ inAppOnly: true })` claims `emailed_at` so neither the
  immediate path nor the digest can send it), once per employee per
  month, never written to the employee. With Jev off there is no flag:
  the numbers alone never accuse anyone.
- **`onboarding_risk`** (weekly): checklist counts and days since start;
  in-app once per instance per ISO week; `fallbackOnboardingRisk` when
  Jev is off or gated.
- **`doc_type_suggest`** (portal employee-docs form, "Suggest"): the
  title and file name go in as named state fields framed as data; the
  option ids are pinned to the 005 CHECK list both ways; the route never
  writes `employee_documents`, and the form only pre-fills the select.

### Rules

- **Mutation-checked** (10 reintroduced, all caught): hire not
  idempotent, review without its `source_ref`, leaving cancelling leave
  BEFORE the end date, `assigned_to` not copied, refusal reason not
  read, a name in the Jev state, the absence flag emailed, offboarding
  terminating at once, a doc type outside the CHECK, and the
  employee-terminated write.
- **`platformEventsSql.test.ts` checks the LATEST trigger definition per
  table** (099 re-creates `employee_records_platform_event`); add any
  later re-creation to its `LATER` list.
- **Rollout:** 099 applied and verified live 2026-09-25 (probe in
  `supabase/probes/099_lead_flow.sql`, rolled back, then applied). **100
  after the deploy** — the old code never writes `cancelled`, but the
  CHECK must not land before the consumer that does. Seed a default
  onboarding template for a client to see the chain end to end.

---

## Support & BD in sync: one support object, an SLA clock, Jev's read (2026-09-25, migrations 101-102)

PR 4 of the connective-tissue plan. `lib/events/supportRules.ts`,
`lib/support/`, `lib/bd/`.

- **`service_requests` is THE support object.** `tickets` and
  `ticket_messages` never had a writer (0 rows, confirmed live) and
  "Raise a query" always wrote a service request. Admin `/support`
  (the ticket list and detail), `SupportClient`, `AdminTicketActions`,
  `AdminTicketReply`, the portal `/support/[id]` page and
  `TicketReplyForm` are gone; `/requests` is **Support & Requests**;
  the dashboards, the portal badge and the portal Support page count
  and list service requests. IvyLens support (`/support/ivylens`, the
  `ivylens_tickets` link table) is a different thing and is untouched.
- **The vocabulary is one tuple per column** in `statusMaps.ts`:
  `SERVICE_REQUEST_TYPES` (the portal form's six ids; the admin screen
  carried ten labels for values nothing wrote), `SERVICE_REQUEST_STATUSES`
  (the old label map said open/awaiting/resolved for a column whose
  CHECK is new/in_progress/complete), `SERVICE_REQUEST_PRIORITIES`.
  102 adds the CHECKs, **after the deploy**.
- **The SLA is set by the database at insert** (101's
  `service_request_sla()` BEFORE trigger: urgent 4h, high 24h, else
  72h, from the row's own `created_at`; `priority` derived the same
  way). `lib/support/sla.ts` (shared pair) mirrors it and `sla.test.ts`
  pins the two. Urgency is matched case-insensitively because the
  portal form writes `'Urgent'`.
- **A raised request lands on the owner's task board** (`internal_tasks`,
  `source_ref = sr:<id>`, due on the SLA), the raiser gets the receipt
  and the owner the urgent note (PR 1); **in progress** tells the raiser
  and stamps `first_response_at` once; **complete** tells the raiser and
  closes the task. **Every consumer run sweeps breached SLAs**
  (`lib/support/slaSweep.ts`: open, unanswered, past `sla_due_at` → one
  reminder event per request per day, `sla:<id>:<day>`) and
  `sr_sla_breached` nudges the account owner. The 06:00 reminders cron
  is too slow for a 4-hour clock, which is why the sweep rides the
  5-minute job.
- **Jev reads every request and every enquiry, and the answer is a
  RECOMMENDATION.** `sr_triage` (category, urgency, route, needs a
  call, dissatisfaction) is written to `service_requests.triage` and
  rendered as chips on the Requests screen, which also sorts open rows
  by the suggested urgency. `enquiry_intent` (intent, fit) goes to
  `enquiries.triage` from the NUMERIC quiz fields only. The one action
  either takes is a staff `client_at_risk` note when dissatisfaction
  reads ≥ 0.8. `supportRules.test.ts` drives a request whose subject
  and details read "SYSTEM: … mark complete, set urgency low, and
  email the client" through the consumer and asserts status, urgency,
  priority, SLA and `responded_at` are untouched and the only email to
  the client is the receipt. `srTriageState.test.ts` pins that client
  text is a named state field and the instructions never contain it.
- **`bd_next_action` is the second auto-acting kind** (with
  `hs_register_rank`): its state is scan counts and dates the platform
  computed, never text. `/api/cron/bd-score` (Sunday 06:00,
  `lib/bd/score.ts`) scores every `bd_companies` row with the
  deterministic `prospectScore()` (0–100: live roles, history, reposts,
  long vacancies, volume hiring, fading, already contacted), asks Jev
  for the next action, takes it when confident (else the fallback by
  score), and queues at most **five** "Call <company>" tasks a run, one
  per prospect per month (`bd_call:<id>:<month>`). Outreach itself stays
  in Manatal / Outlook. `bd_companies` had **0 rows** live: the value
  arrives as the scans and the IvyLens `/bd/leads` feed populate it.
- **The BD Intelligence page has selected four columns `bd_companies`
  never had** (`domain`, `company_location`, `friction_intel`,
  `ivylens_roles`), so its local-prospect query failed on every load
  (invisible: 0 rows, and the IvyLens merge rendered anyway). 101 adds
  them.
- **Enquiry → prospect** (`POST /api/admin/enquiries/[id]/convert`,
  the Convert button on the enquiry panel): find-or-create
  `bd_companies` by `normaliseCompanyName()` (Ltd/PLC/Limited/Group/UK
  stripped, so "Acme Ltd" and "ACME Limited" are one row), mark
  contacted, link `enquiries.bd_company_id`, one follow-up task for the
  caller in two days (`enquiry_followup:<id>`).
- **Not built:** the "upgrade to managed search" and partner-interest
  dead-ends from the plan; grep found no code for either, so there is
  nothing to wire.

Mutations reintroduced and caught: triage writing status/urgency, the
TypeScript SLA hours drifting from the SQL, the internal task unkeyed,
the sweep deduping per run instead of per day, enquiry free text
reaching Jev, the call cap removed, the convert route matching the raw
name, the first-response stamp overwriting. 101 probed live in a
rolled-back transaction (`supabase/probes/101_support_bd.sql`: the
trigger sets clock and priority from 'Urgent', keeps an explicit
`sla_due_at`, the whitelists carry the flow columns and no text) and
then applied.

---

## Policy sign-off reaches the employee (2026-09-25, migration 103)

PR 3b. "Request sign-off" on `/lead/policy-acknowledgements` wrote a
`policy_acknowledgements` row and sent nothing: the employee has no
portal login by design, so nothing could reach them, and "pending" only
ever ended when an admin pressed Mark Signed on their behalf.

- **The consumer emails a personal link.** `policy_acknowledgements
  .created` (status pending), an existing row set back to pending, a
  `policy_ack_resend` event (the portal's Resend button, emitted with
  the service role from the LIVE session after the row's company is
  checked), and the overdue reminder buckets all run
  `lib/lead/policyAckLink.ts`: mint a token, claim `email_log` by the
  EVENT-keyed dedupe key, send, stamp `link_sent_at`. A re-processed
  event sends nothing; a resend or weekly nudge is a fresh link.
- **The link is `/policy/<token>` on the portal**, public in the
  middleware with `/api/policy/`, the same shape and the same reason as
  the leave link. `lib/auth/policyAckTokens.ts` (shared pair) is the
  same design as the set-password tokens: SHA-256 only, in
  `policy_ack_tokens` (103), RLS on, **no policies**, service role only,
  30-day expiry, `ON DELETE CASCADE` from the row. **Not single-use on
  open**: the employee reads the document and comes back. Acknowledging
  is a conditional counted UPDATE (`status IN (pending, overdue)`) that
  sets `acknowledged_via = 'link'` and burns every link for the row.
- **The burn order is the trap.** The first version burned all of a
  row's links BEFORE minting the new one, so a re-processed event
  (claim says already, nothing sent) killed the link sitting in the
  employee's inbox. `policyAckRules.test.ts` re-processes the event and
  asserts the emailed token's hash is still there. Now: mint, claim,
  and only after a SENT email burn the others (`exceptTokenHash`); a
  mint the claim refused is discarded on its own.
- **The document opens with a signed URL** (`documents` bucket,
  `file_path`, one hour, service role: the employee has no session to
  sign under) or the row's external `file_url`. The GET returns the
  employee's name, the company name, the document's name/category/
  version and that URL, and nothing else: no email, salary or notes,
  pinned by the route test.
- **An employee with no email gets no link and the admins are told**
  (`policy_ack_needs_email`, once per row); the Resend button is
  disabled until an email is on the record. A link-signed row tells the
  admins (`policy_ack_signed`, on `actor_kind = 'system'`, which is what
  the service-role write looks like to the trigger); an admin's Mark
  Signed (`acknowledged_via = 'admin'`, actor client) does not.
- **Migration 103 is additive; apply before the deploy.** No CHECK to
  follow: `acknowledged_via` is constrained in 103 itself because
  nothing wrote the column before.

---

## HIRE in sync: the client hears what staff do, and dates are watched (2026-09-25, migrations 104a-104)

PR 5 of the connective-tissue plan. `lib/events/hireRules.ts` is the
registry. Everything a client is told here follows a STAFF write; a
client's own writes already reach staff through `candidate_decided`
and, now, `offer_decided`.

- **Staff write → client admins**, in-app and emailed at once (clients
  default immediate): a stage move (`role_stage_changed`, with the
  funnel label and a one-line meaning; a move back to `submitted` and
  a client's own write are ignored), the "Send to client" toggle
  (`candidate_shared`, also a row created already shared), an
  interview booked / moved / cancelled, an offer sent (with deadline
  and proposed start). An offer decision tells the side that did not
  make it: a client's decision → staff, a staff-recorded one → the
  client. Written acceptance still starts employment (PR 3).
- **An interview is ONE row on the client calendar.**
  `lib/hiring/interviewCalendar.ts` upserts `company_calendar_events`
  keyed `source_ref = interview:<id>` (unique per company, 104;
  `event_type = 'interview'`, 104a), in **Europe/London** time — a
  9am summer interview stored as 08:00Z is shown at 09:00. A reschedule
  updates the same row, a cancellation deletes it, a re-processed event
  adds nothing. Hand-added events have no `source_ref` and are
  unconstrained.
- **`requisitions.stage_changed_at` / `filled_at`** are stamped by a
  BEFORE trigger (`requisition_stage_stamp`), so every writer agrees:
  `filled_at` is set once and never overwritten by a second fill.
  Backfilled from `updated_at`. The role page shows "Time to Hire".
- **Reminders** (`REMINDER_ENTITIES` +3): a role with no stage change
  for 14 days nags staff, then weekly (`role_stale`); an offer against
  its `deadline` warns staff and the client at 7 days and on the day,
  and past it only staff, urgently (`offer_deadline`) — it is NOT
  auto-lapsed, a verbal acceptance may simply be unrecorded; a
  `review_pending` referral older than 2 days produces **one note per
  role per ISO week carrying the live count** (`referral_review_pending`),
  however many rows the cron emits, and none once the queue drains.
- **A failed referral scan** (`referral_scan_runs.ok = false`; the
  table is now in the outbox with company NULL and counts only, never
  the tally or notes) tells staff **once per day**, not once per hour.
- **Jev `candidate_feedback_reason`**: on a client rejection with
  `client_feedback`, the text goes in as one named, clipped state field
  and the answer (reason from `FEEDBACK_REASONS`, actionable) is written
  to `candidates.feedback_triage` and shown as a "Jev: …" line under the
  status on the admin role page. It writes nothing else; an option the
  question never offered is refused by the transport and recorded as an
  error. `client_feedback` stays out of every whitelist
  (`platformEventsSql.test.ts` FORBIDDEN).

Mutations reintroduced and caught (7): a client's stage write telling
the client, the calendar upsert without its key, the scan alert keyed
per run, Jev writing a status, the backlog note per row, calendar times
in UTC, `client_feedback` in the interview whitelist. 104a then 104
applied live 2026-09-25 after the rolled-back probe
(`supabase/probes/104_hire_flow.sql`); no CHECK to apply after deploy.

---

## Health & Safety becomes staff-delivered, and BD Intelligence/BD Roles
## are removed (2026-09-25, migration 105)

Operator: *"The health & safety element to the platform is not about
adding Health & Safety Providers, it is about US (Core-OS 360) offering
our clients a Health & Safety Solution like we do with HR and
Recruitment… think more along the lines of the offerings of Peninsula
and their platform, but keeping it as Core-OS 360 and the rest of our
offerings. Admin app can have the BD Intelligence and BD Roles removed
as they are no longer coming from IvyLens."*

Phase 1a (2026-09-24) built H&S as a **third-party marketplace**:
external provider logins, a `/hs` workspace scoped by assignment, a
provider console for inviting them. That model was wrong from the
start — Core OS 360 is the provider, the same as it already is for HR
and Recruitment, and H&S should be one more staff-delivered service on
a client's account, not infrastructure for outside firms nobody had
signed up yet (`hs_providers` held 0 rows live, same for
`hs_provider_companies` and every `provider_id`/`hs_provider_id`
column — the whole layer was reachable by no one).

### What stayed, what went

The **data model survives untouched**: `compliance_items` (with its
generated `domain` column), `hs_register_completions`,
`hs_activities`, `hs_files`, `hs_events` (the append-only Safety
Timeline, `hs_log()`, the per-source `_hs_event` triggers),
`hs_next_due()`/`lib/hs/recurrence.ts`. None of that was ever
provider-specific — it is what makes a register a register, regardless
of who is doing the work.

What went was the **access-control layer built to let an outside firm
see only its own slice**: `hs_providers`, `hs_provider_companies`,
`my_hs_provider_id()`, `hs_can_access()`, `hs_can_write()`,
`hs_path_company()`, `hs_my_companies()`, `profiles.hs_provider_id` +
its shape CHECK, `provider_id` on every H&S table, the
`/hs` route group and its per-company `HsCompanyTabs`, the provider
console (`/health-safety/providers`, invite/revoke routes), the
provider weekly digest email, and the `provider_access_ending`
notification. Staff reach one flat `/health-safety` section — a
company list, then Register/Activities/Timeline tabs, no scopes to
filter by because staff see everything.

- **`hs_provider` as a role stays in the enum, inert.** Postgres cannot
  drop an enum value without rebuilding the type; nothing can be
  granted that role any more (088's guard trigger already refuses any
  non-staff role change, and no staff UI offers it). Historical
  `actor_kind = 'provider'` rows on `hs_events` and
  `platform_events.actor_kind` keep their own word for the same reason
  105 elsewhere in this file keeps `approved`/`rejected` alongside
  `clear`/`blocked` — relabelling asserts something about old rows
  that was never true of the new model.
- **Applied live only because every affected table/column held zero
  rows** (verified before writing a line of the migration:
  `hs_providers` 0, `hs_provider_companies` 0, `profiles` with
  `role = 'hs_provider'` 0, every `provider_id` column 0 non-null).
  Ordering matters: drop the FK-holding columns before the table they
  reference (`compliance_items.provider_id` etc. before
  `hs_providers`), and drop a trigger's owning table before the
  function it calls (`hs_provider_companies` before
  `hs_event_assignment()`).
- **`hs_log()` and `hs_events` had their own hidden dependency on the
  provider layer** the first probe caught: `hs_log()` called
  `my_hs_provider_id()` for every timeline row, and `hs_events` carried
  its own `provider_id` column neither the plan nor the first draft of
  105 accounted for. A rolled-back `BEGIN;...ROLLBACK;` probe through
  `execute_sql` failed on `function public.my_hs_provider_id() does not
  exist` before the real apply — exactly the discipline this repo
  already uses for every migration.
- **`hs_actor_kind()` loses its provider branch, not the function.**
  `staff | client | system` — used by `hs_log()`, the register/
  activity/file "who recorded this" columns, and `hs_evidence_added`'s
  rule gate (now `actor_kind !== 'client'`, catching any non-client
  write instead of specifically a provider one).

### Consequence rules, notify, weekly digest

`lib/events/hsRules.ts`: `hs_item_added_by_provider` renamed to
`hs_item_added` (same gate shape, `actor_kind !== 'client'`);
`hs_action_done` no longer merges a provider audience, just staff;
`hs_check_failed`/`hs_actions_raised`/`hs_activity_logged` links moved
from `/hs/c/<id>/...` to `/health-safety/<id>/...`. The
`provider_access_ending` rule is deleted outright — its trigger entity
(`hs_provider_companies.reminder`) no longer exists, and
`lib/reminders/rules.ts` drops the matching `REMINDERS` entry.
`Audience`'s `provider_users` kind is gone from `lib/notify/notify.ts`;
`lib/hs/weeklySummary.ts` loses its entire per-provider-login digest
section (`providerWeeklyDigestEmail` deleted from
`lib/email/templates/hsWeekly.ts`) — Monday mornings now produce one
client summary per opted-in admin, nothing else. The client email's
"who recorded this" line reads `'Core OS 360'` unconditionally instead
of joining `hs_providers.name`.

### Jev

`lib/hs/jevQuestions.ts`'s `followupQuestions()` frame changed from "an
activity record a Health & Safety provider typed" to "…a Core OS 360
staff member typed" — the state shape and the gate (0.8, never
auto-acting on the untrusted text) are unaffected, since the rule was
never about who typed it, only that a human's free text needs framing
as data, not instructions.

### Admin routing

`lib/auth/rolePaths.ts` was a two-role path-allowlist
(`STAFF_ROLE`/`PROVIDER_ROLE`, `roleMayReach()` branching on which);
it is now trivially staff-only — `ADMIN_APP_ROLES = [STAFF_ROLE]`,
`roleMayReach()` is `role === STAFF_ROLE`, `homeFor()` is always
`/dashboard`. `AdminSidebar`'s Health & Safety group collapses from two
links (Providers, Workspace) to one (`/health-safety`).

### BD Intelligence / BD Roles removed

Both pages merged a **live IvyLens `/bd/leads` API call** into local
`bd_companies`/`bd_scanned_roles` data at render time — that feed is
gone, so the pages are deleted (`app/(admin)/bd-intelligence/`,
`app/(admin)/bd-roles/`, `BDCompanyModal.tsx`, the
`/api/bd-companies/[id]/convert` and `/api/bd-ivylens-dismiss` routes).
**What is NOT touched**: `bd_companies`/`bd_scanned_roles` themselves,
the internal `prospect_score`/`next_action`/`outreach_status` pipeline
(101), and the Enquiry "Convert to prospect" flow
(`api/admin/enquiries/[id]/convert`) — none of those three ever
depended on the removed IvyLens feed; they are populated by the Sunday
`bd-score` cron and the conversion route, both purely internal.

- **`lib/bd/score.ts` (the Sunday cron) DID depend on IvyLens** and is
  rewritten to score from `bd_companies`/`bd_scanned_roles` alone —
  `high_repost`/`long_vacancy`/`volume_hiring` are now hardcoded to 0
  (an honest degrade: the signal genuinely isn't available any more,
  not a guessed default).
- **The score ceiling drops below the fallback's own 'call' threshold.**
  `prospectScore()`'s maximum from local signals alone is 55 (40 from
  `active_roles` capped at 5, +15 from `roles_seen − active_roles`
  capped at 5) — below the 60 `fallbackNextAction()` needs to say
  'call'. This is an accepted, documented consequence of losing the
  friction signals, not a bug to paper over with invented weights:
  Jev's own judgement now fills the gap the deterministic fallback
  cannot reach alone.
- 101's four IvyLens-only `bd_companies` columns (`domain`,
  `company_location`, `friction_intel`, `ivylens_roles`) are dropped —
  they were populated only by the removed pages' in-memory merge, never
  by any writer, dead the moment the pages go. The six internally-
  sourced columns from the same migration (`prospect_score`,
  `next_action`, `scored_at`, `score_inputs`, `source`,
  `outreach_status`) are kept. `bd_ivylens_dismissed` (070, dismissal
  state for IvyLens-synthesized rows) is dropped with them.
- `AdminSidebar`'s Intelligence group loses the BD Intelligence/BD
  Roles links, keeping only Health Status; the enquiry panel's dead
  `/bd-intelligence` link becomes plain text ("Linked to a BD
  prospect.") — the Convert-to-prospect button and flow are untouched.

### Fold-in: `'health_safety'` retired from the generic compliance form

`ClientDetailTabs.tsx`'s Compliance tab and `AddComplianceItem.tsx`
serve BOTH HR and legacy-H&S categories with their own vocabulary,
separate from `HS_REGISTER_CATEGORIES` — forcing them onto the
register's 15-value list would have broken ordinary HR item creation,
so the narrower fix was taken instead: drop `'health_safety'` from
both category lists (with an explanatory comment pointing at the
dedicated register) and refuse it server-side in both
`api/admin/compliance/route.ts` and `.../[id]/route.ts`. An H&S item
now belongs exclusively on `/health-safety/<companyId>/register`,
which has recurrence, evidence and the Safety Timeline this generic
form never had.

### Tests

`hsSqlShape.test.ts` rewritten around a `resolvePolicies()` helper that
walks `DROP POLICY IF EXISTS`/`CREATE POLICY` tokens across 094, 095
and 105 IN FILE ORDER to compute the FINAL live policy set — the same
"latest definition wins" principle `platformEventsSql.test.ts` already
used for triggers, extended here to policies. It asserts: the provider
tables are gone; no surviving policy names a provider, `hs_can_access`,
`hs_can_write` or `my_hs_provider_id()`; every `provider_id` column and
`profiles.hs_provider_id`/its CHECK are dropped; the six provider-only
functions have `DROP FUNCTION IF EXISTS` lines and `hs_actor_kind()`'s
latest definition has no `'provider'` string.
`platformEventsSql.test.ts` gained 105 to its `LATER` file list (which
already existed for exactly this "a later migration re-creates a
trigger with a different whitelist" shape) plus a small addition: any
table 105 `DROP TABLE`s is removed from the resolved trigger map before
comparing against `TRIGGERED_ENTITIES`, because 096's on-disk
`CREATE TRIGGER hs_provider_companies_platform_event` text is still
there from before the table existed to drop.

Test files whose entire premise depended on the provider role were
retired rather than patched around a fiction: `noServiceRoleInHs.test.ts`
(the risk it guarded — a provider holding a direct JWT reaching a
service-role read — no longer exists, since nobody outside staff can
reach these routes at all); the "an H&S provider is confined to /hs"
describe block in admin's `middlewareRoleCookie.test.ts`; the "an H&S
provider is sent to the admin app" describe block in portal's
`middleware.test.ts`; the "an H&S provider is handed on to the admin
app" describe block in portal's `set-password` route test. Others were
adapted in place rather than deleted, since their surrounding
assertions still hold: `hsRules.test.ts`'s fixtures and events swap
`actor_kind: 'provider'` for `'staff'` and drop the `hs_providers`
table and `provider_id` columns from the fake DB; `rules.test.ts` and
`notify.test.ts` do the same and drop `provider_users` from the
audience checks; `weeklySummary.test.ts` drops the whole provider-digest
half of its assertions; `vocab.test.ts` drops the three provider-only
vocabulary rows and asserts those exports no longer exist; the
classify-item route test swaps its `hs_my_companies()`/scope-grant mock
for a plain `requireStaff()`/`get_my_role` one.

Both apps: `tsc --noEmit` clean, full `vitest run` green (726 admin,
221 portal), all five CI guards pass (`check-shared-dupes`,
`check-row-cap`, `check-route-validation` — the two removed BD routes
taken off the ratchet file rather than left as phantom entries,
`check-admin-routes-linked`, `check-blind-updates` — baseline lowered
108→103 for the routes this removed), both production builds compile.

---

## Next.js upgraded 14.2.4 → 14.2.35, closing CVE-2025-29927 (2026-09-25)

The security-hardening PR (088-093, 2026-09-24) flagged this and
deliberately left it for its own PR: Next 14.2.4 predates 14.2.25, the
release that fixed the middleware-authorization-bypass CVE (a crafted
`x-middleware-subrequest` header could skip middleware entirely,
including the auth checks in `admin/src/lib/supabase/middleware.ts` and
`portal/src/lib/supabase/middleware.ts`). Vercel's edge network already
mitigates the request shape that exploits it, so this was contained
risk, not a live outage — but "mitigated at the edge" is not "fixed in
the app", and it is the one gap those PRs explicitly did not close.

- **`next` and `eslint-config-next` bumped to `14.2.35`** (the latest
  14.2.x patch as of this fix, well past 14.2.25) in both `admin/` and
  `portal/`. Staying on the 14.2 line rather than jumping to 15 — a
  major version bump changes the App Router's caching defaults and
  would need its own scoped verification pass, which is out of scope
  for a security patch.
- **No application code changed.** The CVE fix lives entirely inside
  Next's own request-routing internals (how a subrequest header is
  validated before middleware is skipped) — nothing this codebase's
  `middleware.ts` files call or configure. `npm install` in each app,
  confirmed both resolve to `next@14.2.35` via
  `require('next/package.json').version`.
- **Full verification, no shortcuts because "it's just a dependency
  bump":** `tsc --noEmit` clean on both apps; full `vitest run` green
  (726 admin, 221 portal — unchanged counts, confirming nothing broke);
  all five CI guards pass; both production builds (`next build` with
  stub Supabase env) compile clean, including the two apps'
  `Middleware` bundles the CVE fix lives inside.
- **Left alone:** the "own PR" scoping this fix inherited also flagged
  Next 15 as a bigger, later job — that upgrade is unstarted and stays
  its own separate piece of work, not folded in here.

---

## A naming/flags/actions sweep, and admin finally gets a HIRE section (2026-09-26)

Operator: *"keep going, include a fresh sweep of all feature flags, all
names, all actions and lets make this more like Penninsula Wording with
added HIRE Section."*

Peninsula Business Services (the market Core OS 360 competes in — HR,
Employment Law and Health & Safety delivered as a service, BrightHR as
the software brand) doesn't have a fourth "recruitment" pillar the way
we do; our own HIRE/LEAD/PROTECT three-word branding was already the
right shape, it just wasn't applied consistently. An inventory pass
(sidebar contents, `FLAG_GROUPS`, every `action_type` string written,
the milestone pillar vocabulary) turned up the concrete gap the request
named plus a few real bugs riding along with it.

### Admin sidebar gets its HIRE (and LEAD, and PROTECT) headings

Before this, staff and clients saw different words for the same three
pillars: the portal sidebar says "HIRE" / "LEAD" / "PROTECT · H&S", but
admin's sidebar said "Hiring" and "Health & Safety" as group headings,
and had no "LEAD" heading anywhere — Learning (the one LEAD-flagged
item in admin) sat flatly inside a generic "Business" group alongside
Revenue, Roadmap and CSV Exports.

`AdminSidebar.tsx`'s `NAV_GROUPS`: "Hiring" → **"HIRE"**, "Health &
Safety" → **"PROTECT"** (its one item keeps the plain-English label
"Health & Safety" — only the *group* name is the brand word, matching
how "HIRE" contains "Roles"/"Templates"/"Candidates"), and a new
**"LEAD"** group holding Learning (moved out of Business). Roadmap,
Documents and Latest Updates stay in Business rather than being
dragged into LEAD — they're genuinely cross-pillar (Roadmap tracks
milestones across all three pillars; Documents is a generic client
repository; Latest Updates is a news feed), and mislabelling them LEAD
would have been the same category error the sweep was fixing.

### Two real bugs the sweep found, not just naming

- **Broadcast could never send an `urgent` action.** Its priority
  dropdown was a hand-typed `['high', 'normal', 'low']` — silently
  missing `urgent` from the shared `ACTION_PRIORITIES` tuple
  (`low | normal | high | urgent`) it should have been drawing from.
  `BroadcastClient.tsx` now imports `ACTION_PRIORITIES` directly, and
  its `ACTION_TYPES` list (7 hand-typed strings) is now
  `Object.keys(ACTION_TYPE_LABELS)` — one source instead of two that
  happened to agree by coincidence.
- **The portal's PROTECT Reports page checked the wrong flag.**
  `moduleAccess.ts`'s `ROUTE_FLAGS['/protect/reports']` (what the
  middleware actually gates the route on) is `['protect',
  'protect_reports']`; the page's own in-body check read
  `flags.reports` — a different, unrelated flag ("CSV Reports" in the
  General `FLAG_GROUP`, which nothing else consumes). By the time the
  page rendered the middleware had already confirmed
  `protect_reports`, so this was dead-but-misleading rather than a live
  hole, but the two checks could disagree the moment `reports` and
  `protect_reports` were ever toggled independently for the same
  client. Fixed to check `protect_reports`, matching the route's own
  declared gate.

### What the sweep found and deliberately left alone

- **`protect_dashboard`** (LEAD's HR Dashboard flag) keeps its
  provider-era key name despite living under LEAD since 2026-09-24 —
  already documented in `featureFlags.ts` as intentional: the key is
  stored per client in live `companies.feature_flags`, and this
  codebase's standing rule (the same one that keeps `hs_provider`
  inert in the role enum and keeps `approved`/`rejected` alongside
  `clear`/`blocked` in the referral country gate) is that a live
  stored key is a historical fact, not a label to chase every time the
  page around it gets renamed.
- **The Value Report PDF's three sections are HIRE / SUPPORT / PROTECT,
  not HIRE / LEAD / PROTECT.** Read before touching: SUPPORT tracks
  ticket and service-request handling, which is genuinely a different
  thing from LEAD's people-management metrics (onboarding, training,
  reviews, absence) — there has never been a LEAD section here, and
  renaming SUPPORT to LEAD would have mislabelled its own content.
  Adding a real LEAD metrics section is a new feature (new queries
  against `performance_reviews`/`training_needs`/`absence_records`/
  onboarding-instance tables), not a naming fix, and is left for its
  own piece of work rather than invented here.
- **`RoadmapView.tsx`'s pillar chips** now import
  `MILESTONE_PILLAR_LABELS` from the shared `lib/roadmap/milestones.ts`
  instead of a hand-typed `{hire:'HIRE', lead:'LEAD', protect:
  'PROTECT'}` copy that happened to still agree with it — the same
  "one vocabulary, not a copy that might drift" discipline the
  `statusMaps.ts`/`ACTION_PRIORITIES` fixes above follow.

Both apps: `tsc --noEmit` clean, full `vitest run` green (726 admin,
221 portal — unchanged counts, confirming the sidebar/flag/vocabulary
edits touched no behaviour the test suite already covers), all five CI
guards pass, both production builds compile.

---

## Next.js 15 + React 19 (2026-09-25)

Both apps upgraded from Next 14.2.35 / React 18 to **Next 15.5.26 /
React 19.3.0** — the major-version bump explicitly deferred out of the
CVE-2025-29927 patch above.

- **Every `params` and `searchParams` prop is now a Promise.** Ran
  `npx @next/codemod next-async-request-api .` in each app (47 files
  touched in admin, 31 in portal) — it rewrites every page/layout/route
  signature from `{ params }: { params: { id: string } }` to
  `props: { params: Promise<{ id: string }> }` plus `const params =
  await props.params;`, and does the same for `searchParams`. Route
  *tests* calling handlers directly needed the same treatment by hand
  (`{ params: { id } }` → `{ params: Promise.resolve({ id }) }`) since
  the codemod only rewrites the framework call sites, not test fixtures
  that fabricate their own context object.
- **`cookies()` and `headers()` are now async too.** The codemod's
  fallback for a call site it can't prove is inside an async function —
  both apps' `createServerSupabaseClient()` factories, called
  synchronously from ~160 server components/routes — is the
  `UnsafeUnwrappedCookies` escape hatch (a deprecated synchronous read
  that still works but is explicitly meant to be migrated away from,
  never left in place). Both factories are now `async function
  createServerSupabaseClient()` with `await cookies()`, and all ~160
  call sites (`const supabase = createServerSupabaseClient();`) became
  `await createServerSupabaseClient();` — a single search-and-replace,
  since 100% of call sites already sat inside an `async` function (data
  fetching already required it). `getSessionProfile()` in portal's
  `server.ts` already awaited `cookies()` correctly before this and
  needed no change.
- **`experimental.instrumentationHook` and
  `experimental.serverComponentsExternalPackages` are stable in Next
  15** — moved out of `experimental` (the latter renamed
  `serverExternalPackages`, now top-level) in both `next.config.mjs`
  files. Leaving them under `experimental` still built, but as
  deprecated aliases; moved for the day they're removed outright.
- **React 19's `useRef<T>()` with no argument is no longer valid** —
  `GlobalSearch.tsx`'s debounce ref needed an explicit `| undefined`
  default. **`JSX.Element` as a bare global type is gone** — React 19
  moved the `JSX` namespace out of the global scope;
  `PlanContentFields.tsx`'s `SectionDef.render` return type now imports
  `type { JSX } from 'react'` explicitly. Both are one-line fixes, not
  signs of a wider pattern — a repo-wide grep found no other bare `JSX.`
  or argument-less generic `useRef` usage.
- **No caching-default fallout.** Next 15's headline behaviour change —
  `fetch()` and GET route handlers no longer cached by default — hit
  nothing here: no route handler relied on implicit GET caching, and
  every page that needs cached data already declares its own `export
  const revalidate = N` rather than depending on the framework default.
- **`npm install` resolves React 19.3.0 despite an ERESOLVE warning**
  for `react-dom@18.3.1`'s peer requirement — that warning is npm
  reporting a transitively-requested older peer range that npm's
  resolver overrode; the installed tree (verified via
  `require('react-dom/package.json').version`) is 19.3.0 in both apps,
  not a silently-downgraded 18.
- Verified: `tsc --noEmit` clean, full `vitest run` green (726 admin,
  221 portal — same counts as before the upgrade, confirming the
  migration changed no behaviour the suite covers), all five CI guards
  pass, both production builds compile clean (no warnings beyond npm's
  own deprecation noise).

---

## Health & Safety Phase 2: document library + sector packs (2026-09-25, migration 106)

The next unstarted phase of the H&S roadmap after the staff-delivered
pivot (105): a document library for a client's H&S paperwork, and
seeded sector packs so a new client's register does not start empty.

- **`hs_documents` is METADATA only** (title, category, version, review
  due date, status). The actual file rides the existing evidence
  infrastructure — `hs_files` in the `hs-evidence` bucket, entity_type
  `'document'`, which was already a valid `hs_scope_for_entity()` key
  and already labelled `'Document'` in `HS_ENTITY_LABELS` (Phase 1a
  anticipated this table; nothing wrote it until now). Reusing
  `uploadEvidence()`/`evidenceUrl()` means no new bucket, no new
  storage policy, no new path-shape CHECK to get wrong.
- **A new version is a new row, not an edit.** Uploading a replacement
  inserts a fresh `hs_documents` row (`version = old.version + 1`,
  `supersedes_id = old.id`, status `active`) and flips the old row to
  `status = 'superseded'` — the register's "a correction is a new row"
  discipline, so nobody can silently overwrite what an earlier version
  said. Same RLS shape as the register: staff `ALL`, client `SELECT`
  own company only — nothing here is self-certified, matching the
  posture the Phase 1b register and Phase 1a evidence already take.
- **Sector packs are seeded reference data, not a runtime feature.**
  `hs_sector_packs` + `hs_sector_pack_items` ship with five starter
  packs (Office, Construction & Trades, Manufacturing & Warehousing,
  Care & Health, Hospitality & Food), each with typical UK register
  items (category, recurrence, legal basis) drawn from the same
  `HS_LEGAL_BASIS_OPTIONS` vocabulary the Jev classify-item feature
  already uses. Staff-only RLS (`hs_sector_packs_staff_all` /
  `hs_sector_pack_items_staff_all`) — a pack is a drafting aid, never
  client-visible on its own; its value only reaches a client once its
  items land on their own register, which the register's own policies
  already gate.
- **"Apply sector pack" lives on the client's own register page**
  (`ApplyPackPanel.tsx`), not as a separate flow: picking a pack shows
  every item, greys out ones whose TITLE already matches something on
  the register (`lib/hs/sectorPacks.ts`'s `itemsToApply()`, pure and
  unit-tested), and inserts only the rest with `source: 'pack'`. This
  is a best-effort de-dup for a staff-only bulk-add, not a database
  guarantee — `compliance_items` has no unique constraint on title, so
  a genuine race could still double up; acceptable for what a human
  reviews before clicking Add.
- **A freshly-applied item's first due date is computed, not left
  null** (`due_date` is `NOT NULL` on `compliance_items`, checked live
  before assuming otherwise — the RegisterClient add-item form's
  `dueDate || null` never actually sends null because the field is
  `required`). `firstDueDate()`: a recurring item is due one full cycle
  from today (it has never been done, so "next due" is the first
  occurrence); a one-off item is due today, since nothing else would
  ever schedule it.
- **Reminders reuse the exact `documents` entity shape** (`due_30`,
  `due_7`, `overdue`, no status write — a document library never
  self-flips to a different state the way `compliance_items` does).
  Notification type `hs_document_review_due`, added to both bells'
  `TYPE_CONFIG` and both apps' `NOTIFICATION_TYPES` tuple (shared-dupe
  pair, kept byte-identical). The reminder rule
  (`hs_document_review_reminder`) sits in the generic `rules.ts`
  alongside `document_review_reminder`, not in `hsRules.ts` — the
  `notifyC`/`dueSoon`/`overdue`/`whenText` helpers it needs are private
  to that file, the same reason the LEAD/HR equivalent lives there too.
- **Sector-pack tables are the one deliberate exception to "every
  surviving `hs_` table writes to the Safety Timeline."** They are
  staff reference data, never a record of anything that happened to a
  specific client — "the Office pack's PAT item description was
  edited" is not a Safety Timeline entry for anyone. Applying a pack
  DOES appear on the timeline, as ordinary `compliance_items` inserts,
  which already fire `compliance_items_hs_event`. `hsSqlShape.test.ts`
  now separates `SOURCES` (has an `_hs_event` trigger) from
  `NOT_SOURCES` (deliberately does not) rather than asserting every
  `hs_` table is a source — the old blanket assertion would have forced
  a fake trigger onto tables that have nothing client-facing to log.
- **Two new SECURITY DEFINER functions, two new REVOKEs** —
  `hs_document_stamp()` (author/`updated_at` stamping) and
  `hs_document_event()` (Safety Timeline entry on add/replace) each
  needed `REVOKE ALL ... FROM PUBLIC, anon, authenticated`, caught by
  `platformEventsSql.test.ts`'s "every SECURITY DEFINER function is
  revoked" assertion — the same discipline that test enforces on every
  earlier H&S migration, now proven to actually catch a real omission
  rather than just pass vacuously on migrations that already had it
  right.
- `DocumentsClient.tsx`'s "mark the old version superseded" UPDATE
  uses `{ count: 'exact' }` + `judgeWrite()` from the start
  (`check-blind-updates.sh`'s ratchet stayed at 103, not 104) — new
  write paths get the counted-write discipline by default, not
  retrofitted after the ratchet catches them.
- Portal gets a read-only `/protect/documents` tab (register's own
  posture: nothing here is self-certified), gated by `protect` alone
  like Timeline, using the existing `EvidenceLinks` component to open
  files under the client's own session.
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (741 admin — 726 + 9 new `sectorPacks.test.ts` + coverage from the
  updated `hsSqlShape`/`platformEventsSql` tests; 223 portal — 221 + 2
  from `moduleAccess.test.ts` and `portalPagesLinked.test.ts` picking
  up the new route automatically), all five CI guards pass, both
  production builds compile. Migration 106 applied live and verified
  (RLS on for all three new tables, sector pack item counts read back:
  office 9, construction 9, manufacturing 10, care 9, hospitality 8).

---

## A real LEAD section on the Value Report (2026-09-25)

The naming/flags sweep (above) found the Value Report PDF only ever
had HIRE / SUPPORT / PROTECT sections — there has never been a LEAD
section, and SUPPORT's ticket/service-request content is genuinely
different from LEAD's people-management metrics, so renaming SUPPORT
would have mislabelled its own content. This adds the real thing.

- **Four new sources, read the same way every other cross-tenant table
  on this page already is** — `readAllPages`, no per-company filter
  (the page computes one company's report client-side from the full
  dataset): `training_needs`, `performance_reviews`, `absence_records`
  (filtered to `status = 'approved'` at the query, same as the portal's
  leave pages), `onboarding_instances`.
- **The month-boundary and "overdue" logic is a pure function**
  (`lib/valueReport/leadMetrics.ts`, `computeLeadMetrics()`), pulled out
  of `ValueReportClient`'s `useMemo` specifically so it is unit-tested
  — the rest of that component's report computation predates this
  change and was never covered; this doesn't retrofit that, only the
  new code gets the discipline.
- **"Overdue" is relative to the REPORT month, not today.** A review
  due 10 August and still open is overdue on the September report but
  NOT on the August report — `reviewsOverdue` compares `due_date`
  against the start of the selected month, not `new Date()`. Run this
  for a past month and it shows what was actually true then, not
  today's state. `leadMetrics.test.ts` pins both directions: the same
  data reported for September finds the review overdue; reported for
  August (before the review's own due date), it does not.
- **A null `days` on an absence record contributes zero, not NaN** —
  `Number(a.days) || 0`, one of the four fields this page reads that
  can be null on a real row (an absence still in progress with no end
  date recorded has no `days` yet).
- **Onboarding "active" is NOT month-scoped** — `status = 'in_progress'`
  regardless of when it started, same as `trainingNeedsOpen`
  (`status IN ('open','in_progress')` regardless of when flagged): both
  are "what's true right now", not "what happened this month",
  deliberately different from the flagged/started/completed counts
  next to them.
- On-screen grid changed `lg:grid-cols-3` → `md:grid-cols-2
  xl:grid-cols-4` to fit the fourth card without cramming; the PDF gets
  a fourth `section('LEAD', [...])` block between PROTECT and SYSTEM
  USAGE, same `autoTable` pattern as the other three.
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (748 admin — 741 + 7 new `leadMetrics.test.ts`; 223 portal,
  unchanged — this touched admin only), all five CI guards pass, both
  production builds compile.

---

## HIRE's remaining "later" items (2026-09-25, migrations 107-108)

The last three items from the connective-tissue automation plan's
"Later — HIRE, insights" section: client health trend/churn early
warning, `hr_metrics` derived from real records instead of hand entry,
and monthly value-report auto-generation/emailing.

### Client health snapshots + churn early-warning (107)

`/health` and `/engagement` have always computed a live band/score
from CURRENT state only — there was nowhere to see whether a client
was getting better or worse.

- **`client_health_snapshots`** (107): one row per company per day,
  written by a new daily cron (`/api/cron/health-snapshot`, 06:45 UTC —
  after reminders at 06:00, before digest at 07:00). Staff-only SELECT;
  no INSERT/UPDATE policy for `authenticated` AT ALL — the cron writes
  with the service role, which bypasses RLS, so nobody in a browser
  session should ever be able to write a snapshot by hand.
- **The band and score formulas moved to `lib/health/scoring.ts`**,
  pure functions the cron, `/health` and `/engagement` all now call —
  one calculation, not three that could drift apart. Extracting the
  engagement score formula surfaced a REAL BUG in the original inline
  version: `else if (daysSinceLogin > 30) score -= 20; else if
  (daysSinceLogin > 60) score -= 35;` — the `>60` branch was
  unreachable dead code, because anything past 60 already matched
  `>30` first. No client had ever received the harsher 60+-day-dormant
  penalty, only ever the milder one. Fixed by checking `>60` before
  `>30`; `scoring.test.ts` pins the corrected behaviour.
- **`computeChurnSignal()`** (also in `scoring.ts`) reads up to 14 days
  of snapshots and flags a client "at risk" on either signal: 3+
  consecutive non-green days, or a 7-day-old score compared to today's
  showing a drop of 15+ points. Both signals are independent — a
  steady green client with a sudden score drop is flagged even with no
  red/amber days yet, and a client stuck amber for a week is flagged
  even if its score hasn't moved. `/health`'s table gained a Trend
  column (at risk / improving / stable) computed from `/health`'s own
  page-render read of the last 14 days, never persisted — the flag is
  always fresh, never stale from whenever it happened to be computed.

### `hr_metrics`: "Auto-calculate from records" (portal)

The HR Dashboard's `hr_metrics` upsert form was 100% hand-typed
(headcount, turnover, absence rate, gender split, average tenure).
`period` is free text ("2026-Q1", "Annual 2025") with no parseable
date range, so a precise per-period recompute isn't possible from the
column alone — "auto-calculate" fills in the CURRENT trailing-12-month
picture from real `employee_records`/`absence_records`, and the client
still reviews and saves it, same as before.

- **`lib/lead/hrMetricsFromRecords.ts`** (`computeHrMetrics`, pure,
  unit-tested): headcount = active as of today (`start_date <= today
  AND (end_date IS NULL OR end_date > today)`); turnover = leavers in
  the trailing year ÷ average of today's and a-year-ago's headcount;
  absence rate = approved absence days in the trailing year ÷ (average
  headcount × 260 working days); gender split from the free-text
  `gender` column, bucketed case-insensitively, anything unrecognised
  counted as `other` rather than dropped; average tenure in whole
  months for currently-active employees only.
- **The "Auto-calculate from records" button fills the form fields, it
  does not save them** — the manual upsert path is completely
  unchanged; this is a one-click convenience, not a replacement of the
  review step.

### Monthly value-report auto-generation + emailing (108)

`/value-reports` was always a manual, on-demand, browser-only PDF
download — the plan's "auto-generate monthly, store, email" item asks
for the server-side version of the same report.

- **`computeValueReport()`** (`lib/valueReport/computeReport.ts`) is
  the FULL report computation (hire/support/protect/lead/usage),
  extracted from `ValueReportClient`'s `useMemo` — the client page and
  the monthly cron now call the identical function, so a report a
  staff member downloads by hand and the one the cron emails for the
  same company/month are byte-for-byte the same numbers.
- **`buildReportPdf()`** (`lib/valueReport/buildReportPdf.ts`) takes
  the jsPDF constructor and the `autoTable` function as PARAMETERS
  rather than importing them itself, so one builder serves both:
  the browser download button lazy `import()`s them to keep the page
  bundle small, the cron (Node, no bundle concern) imports them
  normally at the top of the route file. jsPDF and jspdf-autotable
  have no Canvas/DOM dependency for text and table rendering, which is
  what makes the exact same builder usable in a serverless Node
  function.
- **`reports.generated_by` is now nullable** (108) — a system-generated
  report has no honest value for a column that was `NOT NULL
  REFERENCES auth.users(id)`; there is no service-role "user" row to
  point it at. The manual upload path (`ReportUploadForm.tsx`) is
  unaffected — it still stamps the uploader's own `auth.uid()`.
- **The cron only emails companies with a `contact_email`** (filtered
  at the query, `.not('contact_email', 'is', null)`), never guesses
  one. The email links to the portal's own `/protect/reports` page
  (where the newly-inserted `reports` row appears immediately) rather
  than a signed URL, which would go stale sitting in an inbox.
- **Send is claimed via `sendKeyedEmail`** (the same claim-before-send
  helper the H&S weekly digest and policy-ack resend already use),
  dedupe key `value-report:<company_id>:<year>-<month>` — re-running
  the cron for a month it already emailed generates nothing a second
  time and sends no second email; the `reports` row and the PDF upload
  from the first run stand.
- Schedule: 08:00 UTC on the 1st of the month, computing the month
  that just ended — after reminders, digest and weekly-summary, so it
  never races the other daily/weekly crons.
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (775 admin — 748 + 14 `scoring.test.ts` + 4 `health-snapshot`
  route test + 5 `computeReport.test.ts` + 4 `monthly-value-reports`
  route test; 232 portal — 223 + 9 `hrMetricsFromRecords.test.ts`),
  all five CI guards pass, both production builds compile. Migrations
  107 and 108 applied live and verified (RLS on for
  `client_health_snapshots`; `reports.generated_by` nullable).
  **Caveat**: jsPDF + jspdf-autotable's server-side (Node) PDF
  rendering is a well-established combination but was not smoke-tested
  against a live Vercel serverless invocation in this session — the
  first real cron run is the first true end-to-end proof; the unit
  tests mock both libraries and verify the cron's control flow
  (upload → insert → email → dedupe), not the rendered PDF bytes.

---

## H&S Phase 1c: the generic compliance form had two more unwritten vocabularies (2026-09-25)

The H&S roadmap's Phase 1c item — "admin client-detail HR/H&S tabs,
every compliance-category writer → HS_REGISTER_CATEGORIES" — turned out
to already be half done and half wrong. The HR/H&S tab split (renamed
"HR" tab, `/health-safety/<companyId>` link-out card, no duplicate
register tab) was finished 2026-09-25 in the H&S-staff-delivered PR.
Routing the generic writers onto `HS_REGISTER_CATEGORIES` was already
explicitly REJECTED the same day (see "Fold-in: 'health_safety' retired
from the generic compliance form" above) — that vocabulary describes
the 15-value H&S register, a genuinely different thing from an ordinary
HR compliance item, and forcing one onto the other would have broken
ordinary item creation.

What was actually still broken: the two generic writers
(`AddComplianceItem.tsx` on the cross-client `/compliance` page,
`ClientDetailTabs.tsx`'s compliance tab) each hand-typed their OWN
category list, and neither matched the other or `COMPLIANCE_CATEGORY_LABELS`
in `statusMaps.ts`:

| | categories | status |
|---|---|---|
| AddComplianceItem.tsx | hmrc, data_protection, employment_law, right_to_work, training, other | pending, **in_progress**, complete |
| ClientDetailTabs.tsx | general, contracts, policies, data_protection, employment_law, other | pending, in_review, complete, overdue |
| COMPLIANCE_CATEGORY_LABELS | contract, policy, handbook, training, health_safety, data, hr, other | — |

Three real, live bugs, not just inconsistent labels:

- **`AddComplianceItem.tsx`'s "In Progress" status failed on submit.**
  `in_progress` is not a live `compliance_status` value (the enum is
  `pending | in_review | complete | overdue`); the insert 22P02'd. The
  error did surface to the form's error box, so this wasn't silent, but
  it was a guaranteed failure for anyone who picked it.
- **The due date field on that same form had no `required` attribute
  and no client-side check**, while `compliance_items.due_date` is
  `NOT NULL`. Leaving it blank sent `due_date: null` and the insert
  failed on the NOT NULL constraint — a second guaranteed failure,
  this time from a field that looked optional.
- **Every category from either hand-typed list except `other` rendered
  as its own raw string** everywhere `labelFor(COMPLIANCE_CATEGORY_LABELS,
  …)` is called (the client-detail table, `/compliance`'s list) — none
  of `general`/`contracts`/`policies`/`hmrc`/`right_to_work`/
  `employment_law` has an entry in the label map.

### The fix

- **`COMPLIANCE_CATEGORIES`** (shared-dupe pair, `statusMaps.ts`):
  `contract | policy | handbook | training | data | hr | other` — the
  writable subset of `COMPLIANCE_CATEGORY_LABELS`'s keys.
  `health_safety` stays OUT of the tuple (an H&S item still belongs on
  the dedicated register) but stays IN the label map, same asymmetry
  `COMPLIANCE_STATUS_LABELS` already has for `in_progress`/`completed`
  — a value nothing may write again but old rows still need to display.
- Both forms now import `COMPLIANCE_CATEGORIES`/`COMPLIANCE_STATUSES`
  from `statusMaps.ts` instead of hand-typing a list, and render their
  `<option>` labels from `COMPLIANCE_CATEGORY_LABELS`/
  `COMPLIANCE_STATUS_LABELS` instead of a regex title-case. There is no
  longer a hand-typed array for either form to drift out of step with.
- `AddComplianceItem.tsx`'s due date is now required client-side, same
  as `ClientDetailTabs.tsx`'s compliance form already had it.
- **Both `/api/admin/compliance` routes gained real validation**
  (`parseBody` + zod, `lib/validation/primitives.ts`), taken off
  `scripts/unvalidated-routes.txt`'s ratchet (47 → 45). The POST route's
  category enum excludes `'health_safety'` entirely — the schema itself
  is now what refuses it, not a separate `if` check after the parse
  (which would have been unreachable dead code once the enum excluded
  it, and did fail `tsc` for exactly that reason). The PATCH route's
  category enum is `[...COMPLIANCE_CATEGORIES, 'health_safety']` instead,
  since it's also how a client-detail page might display (never write
  fresh) an old row.
- `statusMaps.test.ts` pins the new tuple against the label map in one
  direction only (every writable category/status has a label; the
  label map may still hold extra legacy entries), and separately pins
  that `health_safety`/`in_progress` are deliberately absent from the
  writable tuples while still resolving to a label.
- **Migration 109 adds the CHECK the plan asked for**, but on the
  UNION of `COMPLIANCE_CATEGORIES` and `HS_REGISTER_CATEGORIES` (plus
  legacy `health_safety`) rather than routing the generic form onto the
  H&S tuple alone — the column is genuinely shared by both writers.
  `compliance_items` had 0 live rows when this was written (checked
  before writing a line of SQL), so the CHECK applied directly rather
  than needing a separate "after deploy" step. `statusMaps.test.ts`
  extracts the CHECK's value list from the migration file with a regex
  and pins it against both source tuples — which is why the CHECK's own
  SQL comments avoid parentheses inside the value list itself: a
  comment's own closing paren stops a naive "first ')' ends the list"
  regex before the real end.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green (780
admin — 775 + 5 new `statusMaps.test.ts` cases; 232 portal, unchanged —
this touched admin only, `statusMaps.ts` mirrored byte-identical), all
five CI guards pass (`check-route-validation` ratchet shrank 47→45),
both production builds compile. Migration 109 applied live and
verified (`pg_get_constraintdef` read back and compared against the
two source tuples).

---

## H&S Phase 3: on-site audits (2026-09-25, migration 110)

An audit is one visit's checklist run: a set of questions each answered
pass/fail/N-A, scored, and — for every failed answer — a client action
raised automatically. The schema for this was anticipated as far back as
094/095: `hs_scope_for_entity('audit')` already returned `'audits'` and
`HS_ENTITY_LABELS` already had an `audit` entry, so evidence uploads
against an audit (`entity_type: 'audit'`) needed no vocabulary change at
all — this phase only had to build the tables, the runner and the rule.

### Insert-only, like completions/activities/files — no draft status

`hs_audits`/`hs_audit_responses` follow the same "a correction is a new
row" discipline as the register's other evidence tables: `REVOKE UPDATE,
DELETE, TRUNCATE` from every session. There is deliberately **no draft
status stored server-side** — the offline-capable runner keeps every
in-progress answer in the browser's own `localStorage` (auto-saved on
every keystroke, keyed per company so a page reload resumes the same
draft) until the auditor presses Submit, which is the only network call
the whole visit makes. **What "offline-capable" means here, precisely**:
the admin service worker (`public/sw.js`) deliberately never caches
`/api/`, so this is not a full background-sync queue — it is a runner
that never touches the network while working, and retries its one
submit call automatically on the browser's `online` event if that call
fails. That covers the actual failure mode a site visit has (patchy
signal *while working*), not every conceivable offline scenario; a
submit made from a device that never regains connectivity stays a local
draft until it does.

### The idempotency problem an insert-only table creates, and the fix

`id` is **client-generated** (`crypto.randomUUID()` when the runner
starts), so a retried submit after a dropped connection — the runner
cannot know whether the first attempt actually landed — must not create
a second audit or re-raise its findings and notifications a second
time. Naively, that only needs "insert if this id doesn't exist yet".
But an audit and its N responses are two separate inserts, and
`hs_audits` has no UPDATE/DELETE grant to fix up an orphan: if the
audit insert succeeded and the responses insert then failed (or the
connection dropped between the two calls), the result is a **permanently
un-correctable audit row with zero responses** — which the automation
rule reads as "zero findings", reporting a clean audit that was never
actually checked, forever.

The fix is `hs_submit_audit()`, one `SECURITY INVOKER` (not DEFINER —
this exists for the TRANSACTION, not to escalate privilege; RLS applies
exactly as if the caller ran the inserts directly) plpgsql function that
inserts the audit row and every response in one statement/transaction:
either both succeed or neither does. Called once, with the same `id`
twice, it returns the existing audit unchanged the second time. Proven
live in a rolled-back transaction before shipping: calling it twice with
the same id produced exactly one audit row, with the FIRST call's title
and responses, not the second's.

### Score and findings

`lib/hs/auditScore.ts` (`computeAuditScore`, pure, unit-tested):
pass ÷ (pass + fail) as a percentage; an `na` answer is excluded from
BOTH sides of the ratio, not counted as either — one pass, one fail and
two N/A is 50%, not 25% (N/A counted as fail) or 75% (N/A dropped from
the denominator only). Null when nothing is applicable (every answer
N/A, or no answers). **Computed server-side, in the submit route, never
trusted from the client** — the same function the runner also calls for
its live "X% so far" preview, so the two can never disagree, but only
the route's own computation is what gets stored.

### The rule: one platform_event per AUDIT, not per answer

`hs_audits` is in `TRIGGERED_ENTITIES`; `hs_audit_responses` is
deliberately NOT — a 20-question audit would otherwise raise 20 outbox
events for one visit. The `hs_audit_completed` rule
(`lib/events/hsRules.ts`) reads the audit's own event once and queries
`hs_audit_responses` directly for the failed ones: one `ActionConsequence`
per failed answer (`action_type: 'hs_audit_finding'`, priority `high`,
`source_ref: hs_audit_response:<id>`), plus one summary notification to
the client admins and one to staff — never one notification per finding,
which would spam an admin the moment a real audit finds five things
wrong on one visit. Same reasoning drives the Safety Timeline side:
`hs_audits` alone is a Timeline SOURCE (`hs_event_audit()`, one line per
audit — "Fire safety walk-round — 24 Sep 2026 (67%)"); `hs_audit_responses`
is reference data on the timeline test's own terms, not a source, for
the identical "one line per visit, not one per answer" reason.

### Templates are staff reference data, same posture as sector packs

`hs_audit_templates`/`hs_audit_template_items`: staff-only RLS, never a
Timeline entry on their own — editing a template's wording is not a
record of anything that happened to a specific client. One starter
template ships seeded in the migration itself (eight common findings
across fire, electrical, first aid, COSHH, work equipment, policy and
housekeeping), the same reasoning 106's five sector packs were seeded:
so the runner has something to pick on day one. `AuditTemplatesClient.tsx`
(`/health-safety/audit-templates`) is a light CRUD — add a template, add
questions, deactivate — using direct client-side Supabase inserts under
staff RLS, the same pattern `DocumentsClient.tsx`/`ActivitiesClient.tsx`
already use, not a bespoke API route (there is nothing here a session
insert under RLS doesn't already handle correctly).

### What this does NOT do yet

Evidence photos are not wired into the runner UI — `hs_files` already
accepts `entity_type: 'audit'` with no schema change needed (095/105's
existing infrastructure), but attaching a photo to a specific failed
answer during the visit is a real next step, not built here. The runner
also has no "resume on a different device" story: the draft lives in
ONE browser's `localStorage`, keyed per company, so starting the same
audit on a second device starts a second, independent draft.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green (800
admin — 780 + 4 `auditScore.test.ts` + 6 route tests + 2 `hsRules.test.ts`
+ existing suites picking up the new tuples/tests; 234 portal — 232 + 2,
`portalPagesLinked.test.ts` picking up `/protect/audits` automatically),
all five CI guards pass (admin routes 46→49 pages), both production
builds compile. Migration 110 (plus its `hs_submit_audit()` function,
applied as a same-file follow-up call, and its starter-template seed)
applied live and verified: RLS on and correctly scoped for all four new
tables, and the atomic-insert/idempotency behaviour proven with a
rolled-back live transaction before this shipped.

---

## LEAD Phase 4: training records, matrix and CSV import (2026-09-25, migration 111)

`training_needs` (gaps to fill) and `skills_matrix` (skill LEVELS)
already existed; neither is a record that a specific course was actually
COMPLETED, with a date and — for anything like a fire warden or
first-aid certificate — an expiry to re-certify against. `training_records`
is that record: one row per completed course per employee, self-service
client data with the same posture as those two existing tables.

### The one thing done differently from its two siblings

`training_needs`/`skills_matrix` store a free-text `employee_name` —
exactly the "employee referenced by typed name" disconnected concept
this file's automation-plan section already flagged. `training_records`
links `employee_id` to `employee_records` from the start instead: a
training MATRIX needs to pivot cleanly by employee, which a name string
two different rows might spell two different ways cannot guarantee.

### A real RLS gap found and NOT repeated

`training_needs`/`skills_matrix`'s LIVE policies (read from
`pg_policies`, not their migration history — this repo's standing rule
that a `.sql` file on disk is a record of intent, not what the database
contains) have a `FOR ALL` "client" policy **plus** a separate
super-user-only DELETE policy. Since Postgres ORs permissive policies,
the broader ALL policy already lets any signed-in company user delete a
row — the narrower DELETE policy is dead, however deliberate its
existence looks. `training_records` does not repeat this:
SELECT/INSERT/UPDATE are one broad policy each, and DELETE is the ONLY
policy that mentions `is_company_super_user()`, pinned by
`trainingRecordsSql.test.ts` (no client policy is `FOR ALL` or `FOR
DELETE` except the one restricted policy).

### No platform_events outbox entry, but IS a reminder entity

Like its two siblings, this is a client editing their own team's data —
nobody else needs telling as it happens, so `training_records` is not in
`TRIGGERED_ENTITIES`. It IS in `REMINDER_ENTITIES`: an expiring
certificate is exactly what the reminders cron exists to catch
(`due_30`/`due_7`/`overdue` on `expires_on`, new notification types
`training_record_expiring`/`training_record_expired`). No status column
to flip — unlike `employee_documents`, nothing else reads a stored
"expired" status for this table, so the reminder only ever notifies.

**The reminder payload cannot show WHO, without an extra lookup.**
`slimRow()` (`lib/reminders/run.ts`) deliberately never lets a
PostgREST embed into a reminder's payload — "never an embed and never a
column PostgREST happened to return" is the actual comment already
there, and it exists for the same reason the outbox's own column
whitelist exists. So `employee_records(full_name)` in the reminder
query's `select` was the wrong fix (built once, caught by
`reminders.test.ts`'s existing column-validation test, then reverted):
the consuming rule (`training_record_reminder`, `lib/events/rules.ts`)
looks the employee's name up itself, by `employee_id`, the same way
`hsRules.ts`'s `itemTitle()` resolves a register item's title from an id
rather than trusting anything wider in the event payload.

### Workforce CSV import

`lib/lead/parseTrainingCsv.ts` (portal-only, pure, unit-tested): a
minimal RFC4180-shaped line splitter (handles a quoted field containing
a comma — what Excel/Sheets actually export), matching by
`employee_email` in preference to `employee_name` (an email is a more
reliable key than a name two people might share), accepting both ISO
and UK `dd/mm/yyyy` dates. Every unmatched or malformed row is reported
by LINE NUMBER with a reason rather than silently dropped, so an import
of 200 rows with three typos still imports the other 197 and tells the
client exactly which three to fix. The UI (`TrainingRecordsClient.tsx`)
never inserts anything the parser didn't already validate — it shows the
matched/unmatched counts and lets the client confirm before writing.

### Training matrix

A toggle on the same page pivots the same `training_records` array
client-side (no second query, no second table) into employee × course,
one cell per pair showing the latest completion date and a status
badge — current / expiring soon (≤30 days) / expired / no expiry (some
certifications never lapse). List and matrix are two views of identical
data, never two sources that could disagree.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green (809
admin — 800 + 5 `trainingRecordsSql.test.ts` + 4
`trainingRecordReminder.test.ts`; 244 portal — 234 + 8 `parseTrainingCsv
.test.ts` + `portalPagesLinked.test.ts` picking up `/lead/training-records`
automatically), all five CI guards pass, both production builds compile.
Migration 111 applied live and verified (`pg_policies` read back:
exactly one DELETE policy, restricted; no client policy is `FOR ALL`).

---

## H&S Phase 5: incidents/RIDDOR, toolbox talks, equipment, KPIs (2026-09-25, migration 112)

The last item in the H&S roadmap's Phase 5. One migration, four things,
because three are small extensions of existing infrastructure rather
than new subsystems — see the migration's own header comment for why
each one is shaped the way it is.

- **`hs_incidents` is MUTABLE, register-shaped — deliberately NOT
  insert-only** like `hs_audits`/`hs_register_completions`. An
  investigation is updated over time (status moves
  `open → investigating → closed`, `riddor_reported_on` gets filled in
  later), so unlike those tables there is no
  `REVOKE UPDATE, DELETE, TRUNCATE`. `hsSqlShape.test.ts` pins the
  absence of that revoke as explicitly as it pins the presence of one
  elsewhere.
- **This is the client's own legal RIDDOR record-keeping duty.** Core
  OS 360 records it on their behalf, so — unlike a failed register
  check, which raises a CLIENT action — a RIDDOR-reportable incident
  raises a STAFF-assigned internal task (`createKeyedInternalTask`,
  reused from `supportRules.ts`, keyed `hs_incident_riddor:<id>`,
  assigned to the account owner via `staffOwnerFor`). Reporting to the
  HSE is Core OS 360's job, not something to hand the client. The
  client reads the incident (`hs_incidents_client_read`) but nothing
  here asks them to act.
- **No specific day-count RIDDOR deadline is asserted anywhere in code
  or copy.** RIDDOR's reporting window varies by incident category
  (immediately by phone for a death or specified injury, ten days for
  others, and so on) — a wrong number baked into a notification would
  be worse than the generic "report without delay" framing actually
  used.
- **Toolbox talks are `'toolbox_talk'` joining `hs_activities
  .activity_type`, not a new table.** A toolbox talk is close enough
  in shape to the existing activity types (095 already had `'meeting'`)
  that a second near-identical table would just be the same Timeline
  logic copied. What it needs that other activities never did is an
  attendee list — `hs_activity_attendees`, the one genuinely new table
  for this — company_id filled from the parent activity by a trigger
  (`hs_activity_attendee_fill`), never trusted from the caller, the
  same discipline `hs_audit_response_fill()` (110) already uses.
  `hs_activity_attendees` has no `_hs_event` Timeline trigger of its
  own: the toolbox talk's own `hs_activities` row already fires the
  Timeline entry, and a per-attendee line would put N entries on the
  Timeline for one talk.
- **Equipment register (`hs_equipment`) is register-shaped like
  `compliance_items`**, not completion-shaped like
  `hs_register_completions` — a mutable `next_inspection_due` a session
  updates directly, with no separate "was it inspected" evidence trail.
  This is MVP scope: a real gap if evidence-per-inspection is ever
  needed, noted here rather than quietly assumed away.
- **KPIs are not a table.** `lib/hs/kpis.ts`'s `computeHsKpis()` is a
  pure function computed at READ TIME from existing rows (incidents,
  activities, audits, equipment) — the same posture
  `lib/health/scoring.ts` already takes for a client's health score:
  no stored aggregate that can drift out of sync with the rows it
  summarises. "Last 12 months" is a rolling window from `today`
  (injected, never `Date.now()` inside the pure function, so it is
  testable), not a calendar year.
- **The RIDDOR task and the failed-check action are NOT the same
  consequence shape, on purpose.** `hs_check_failed` (Phase 2) raises a
  row in `actions` — the CLIENT'S table, shown on `/protect/actions`.
  `hs_incident_reported`'s RIDDOR branch raises a row in
  `internal_tasks` — STAFF'S table, shown on admin `/tasks`. Getting
  this backwards (a client action for a staff-owned legal duty) was the
  first draft of this rule; caught by re-reading `hsRules.ts`'s own
  header comment about who does what, not by a test — the test that
  now pins it (`hsRules.test.ts`) was written after.
- **Equipment reminders reuse the existing reminders/rules.ts + rules.ts
  split**, same shape as every other dated entity: `hs_equipment` in
  `REMINDER_ENTITIES` (not `TRIGGERED_ENTITIES` — no outbox trigger on
  `hs_equipment` itself, only a reminder), a `ReminderRule` reading
  `next_inspection_due` for `in_service` equipment, and a
  `hs_equipment_reminder` consequence in the generic `rules.ts` (not
  `hsRules.ts` — same file `hs_document_review_reminder` already lives
  in, because a reminder consequence is generic machinery regardless of
  which domain the entity belongs to). Its own notification type,
  `hs_equipment_inspection_due`, was split out from
  `hs_document_review_due` after noticing the two would otherwise
  conflate an equipment inspection with a document review on the bell
  and in any future per-type dashboard.
- **`hs_incidents` IS in `TRIGGERED_ENTITIES`** (its own outbox trigger,
  whitelist `incident_type, severity, riddor_reportable,
  riddor_reported_on, status, site_id` — never `description`,
  `injured_person_name` or `immediate_action`). `hs_equipment` is
  NOT — it has no consequence that needs firing off a create/update, so
  no outbox trigger for it, only the reminders cron the same way
  `training_records` (Phase 4) has a reminder entity with no outbox
  entry either.
- Admin gets three new tabs on the per-client H&S workspace
  (`HsCompanyTabs.tsx`): Incidents, Equipment, KPIs — direct
  client-side Supabase writes under staff RLS
  (`IncidentsClient.tsx`, `EquipmentClient.tsx`), the same pattern
  `DocumentsClient.tsx`/`AuditTemplatesClient.tsx` already use, with
  `COUNT_EXACT`/`judgeWrite` on every UPDATE. `ActivitiesClient.tsx`
  gained an attendee picker shown only for `activity_type ===
  'toolbox_talk'`. Portal gets read-only Incidents and Equipment tabs
  under PROTECT, same posture as Register/Audits: nothing here is
  self-certified.
- Mutation-checked: disabling the RIDDOR branch (`if (riddor)` →
  `if (false)`) was reintroduced and watched fail the new
  `hsRules.test.ts` case before being reverted.
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (827 admin, including the new `kpis.test.ts` and the `hsRules.test.ts`/
  `vocab.test.ts` additions; 248 portal — this touched admin primarily,
  portal's read-only pages added no new test files but
  `moduleAccess.test.ts`/`portalPagesLinked.test.ts` picked the two new
  routes up automatically), all five CI guards pass, both production
  builds compile. Migration 112 applied live and verified (`pg_policies`
  read back: RLS on, 6 policies across the three new tables, no
  `REVOKE UPDATE` on `hs_incidents`/`hs_equipment`; `pg_constraint`
  confirmed `hs_activities_activity_type_check` now includes
  `'toolbox_talk'`).

---

## Audit evidence photos, and a detail page to see them on (2026-09-25, migration 113)

Phase 3 (110) shipped the on-site audit runner but explicitly left one
gap: "Evidence photos are not wired into the runner UI." This closes
it, plus a real gap it exposed: there was no page to actually SEE a
completed audit's individual answers at all, evidence or not — only
the list (title/date/score/finding count) and the write-only runner.

- **`hs_audit_responses.id` is now CLIENT-GENERATED**, the same reason
  the audit's own id already was: it lets the runner stage a photo
  against a SPECIFIC answer while still offline, before that answer's
  row exists anywhere in the database, and upload it under the right
  `entity_id` the instant Submit succeeds. `hs_submit_audit()` (113)
  now inserts the id it's given for each response instead of relying
  on the column's `DEFAULT gen_random_uuid()`; a response with no id
  (an old draft saved in a browser before this shipped) still gets one
  from that same default, so nothing already mid-visit breaks.
- **`hs_scope_for_entity()` gains `'audit_response' → 'audits'`** —
  same scope as the audit itself, since it's the same permission
  dimension at finer grain. `hs_files.entity_type`'s own CHECK
  (`hs_scope_for_entity(entity_type) IS NOT NULL`) is what actually
  enforces this is a real kind of evidence, not a typo; nothing needed
  changing on the storage-policy side since those already key off
  `hs_scope_for_entity()` rather than a hardcoded list.
- **Photos are staged in memory, not localStorage**, unlike every other
  field in the draft. A `File` object cannot be serialised to JSON, so
  a photo picked mid-visit does not survive a closed tab the way an
  answer does — a real, narrower limitation than the rest of the
  runner's offline story, called out here rather than silently
  assumed. They upload via the existing `uploadEvidence()` helper
  (straight from the browser to storage under the user's own session)
  only AFTER the audit submission itself has succeeded, keyed by the
  same response id just sent to the server — so an upload failure is
  reported but never loses the audit, which already saved.
- **A new per-audit detail page**
  (`/health-safety/<companyId>/audits/<auditId>`) shows every answer,
  its comment, and any attached evidence, linked from the list page's
  title (previously plain text, going nowhere). This is a genuine
  before/after: there was no way to read back an audit's individual
  findings anywhere in the product before this, only the aggregate row.
- Mutation-checked: dropping the id-forwarding line in the submit route
  (`id: r.id ?? ''` → `id: ''`) was reintroduced and watched fail
  `route.test.ts`'s new case, then reverted.
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (828 admin — 827 + 1 new response-id test; 248 portal, unchanged —
  this touched admin only), all five CI guards pass (admin routes
  53→53, the new `[auditId]` route is nested under the already-linked
  `/health-safety` top level so needs no sidebar entry of its own),
  both production builds compile. Migration 113 applied live and
  verified (`hs_scope_for_entity('audit_response')` reads back `'audits'`).

---

## Equipment inspection evidence trail (2026-09-25, migration 114)

Phase 5 (112) shipped `hs_equipment` register-shaped — a mutable
`next_inspection_due` a session updates directly — and its own
CLAUDE.md entry flagged the gap this closes: "there is no separate
'was it inspected' evidence trail." Recording an inspection meant
typing two dates into `window.prompt()`s with no history, no
certificate, and no record of what a FAILED inspection actually found.

- **`hs_equipment_inspections` mirrors `hs_register_completions`
  exactly** — insert-only (a correction is a new row), `company_id`
  filled from the parent equipment row and never trusted from the
  caller (`hs_equipment_inspection_fill()`, the same discipline
  `hs_completion_fill()`/`hs_audit_response_fill()` already use), and a
  roll-forward trigger (`hs_equipment_inspection_roll()`) that only
  advances `hs_equipment.last_inspected_on`/`next_inspection_due` on a
  **pass**, and only when it is the newest inspection. A **fail** is
  recorded and timelined but moves nothing — the exact X8 lesson
  `hs_completion_roll()` already learned ("a failed H&S check marks the
  item in_review and never rolls the register forward"), applied here
  before it could be relearned the hard way.
- **The Safety Timeline duty for "was this equipment inspected" moves
  ENTIRELY to the new table's own trigger.** `hs_equipment`'s existing
  `'inspected'` branch (112) is removed from `hs_event_equipment()`: a
  pass no longer logs twice (once from the roll's column UPDATE, once
  from the inspection row itself), and a fail — which deliberately
  never changes `last_inspected_on` — now logs AT ALL, which it never
  did under the old column-change-triggered branch. `'added'` and
  `'status_<x>'` are unchanged.
- **`hs_scope_for_entity()` gains `'equipment_inspection' → 'register'`**
  for evidence uploads (a certificate or photo against a specific
  inspection) — sharing the register's scope rather than inventing a
  new `'equipment'` entry in `HS_SCOPES`, which would have disturbed
  `vocab.test.ts`'s pin against 094's now-historical (pre-105,
  provider-era) `scopes` CHECK for no real benefit. Scope stopped
  gating anything RLS-wise the day 105 removed the provider grants that
  were the only thing that ever read it; it is purely a CHECK-satisfying
  label now.
- **`EquipmentClient.tsx` gained the register's own accordion pattern**
  (expand a row, see history, record a new entry) in place of the
  original `window.prompt()` pair — a real form (date, pass/fail, next
  due, notes, evidence upload) plus a per-equipment inspection history
  list with evidence links, matching `RegisterClient.tsx`'s own shape.
  Portal's read-only equipment page needed NO change: it already reads
  `last_inspected_on`/`next_inspection_due` off `hs_equipment` directly,
  and those columns are now correctly kept in sync by the roll trigger
  exactly as before — the trail is additive underneath a page that
  already displayed its result correctly.
- Mutation-checked, live, in rolled-back transactions (not just unit
  tests): a `fail` inspection leaves `last_inspected_on`/
  `next_inspection_due` untouched; a `pass` immediately after rolls
  both forward; both produce the correct `hs_events` row
  (`inspection_failed` / `inspected`).
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (832 admin — 828 + 4 new vocab/shape assertions; 248 portal,
  unchanged — this touched admin only), all five CI guards pass, both
  production builds compile. Migration 114 applied live and verified
  (RLS on, both policies present, all three triggers registered,
  `hs_scope_for_entity('equipment_inspection')` reads back `'register'`).

---

## Regulatory-change broadcast (2026-09-25, migration 115)

The system-features-inventory review's remaining "innovation" idea
(#5 in that list): Jev reads the public "Latest Updates" feed (036/038)
and flags a genuine regulatory change to STAFF, who then decide whether
and to whom to broadcast it, from the existing `/broadcast` page. This
is a Tom decision from day one of the automation plan: **no text Jev
classifies out of public content may ever act on its own** — the
platform tells a human it thinks something is worth a look, and a human
still writes the actual action.

- **Three new nullable columns on `latest_updates`**
  (`admin/src/lib/latestUpdates/regulatoryChange.ts` +
  `lib/latestUpdates/classify.ts`): `regulatory_category`,
  `regulatory_confidence`, `regulatory_classified_at`. The CHECK on
  `regulatory_category` is the exact same union 109 already put on
  `compliance_items.category` (`COMPLIANCE_CATEGORIES` +
  `HS_REGISTER_CATEGORY` + legacy `health_safety`), plus one extra value
  this table alone needs: `'none'` — a compliance item is never created
  to record "not applicable"; this row is, so the cron never
  reconsiders an already-classified article. Verified live before
  writing it: `latest_updates` had 0 rows, so the CHECK applied directly
  with no "after deploy" step.
- **`regulatory_classified_at` is the "already processed" marker, not
  the category.** Recording an irrelevant article as `category='none'`
  the first time it is seen is what stops the daily cron reclassifying
  it forever — reprocessing would be free but pointless, and `'none'`
  is a real, honest answer, not a placeholder for "unknown".
- **New `DecisionKind`: `'latest_update_regulatory_change'`**
  (`jev/types.ts`, shared-dupe pair) — deliberately **not** added to
  `AUTO_ACT_KINDS`. Two questions: `is_regulatory_change` (noul) and
  `category` (choice, over the same union). The instructions frame the
  article's title/description as data describing the article, never as
  something to obey — the same discipline every other Jev caller in
  this file already applies to client- or public-written text.
- **The daily cron (`/api/cron/classify-updates`, 06:30 UTC, ahead of
  the 06:00 reminders sweep and 07:00 digest) classifies up to 25
  unclassified published rows a run** (`BATCH_CAP` in `classify.ts`) and
  only ever WRITES `latest_updates` and inserts a `notifications` row
  for `{ kind: 'staff' }` — never `compliance_items`, never an `action`,
  never a client. It notifies only when Jev is confident (gate 0.75)
  the article IS a regulatory change AND at least one client's own
  register already holds an item in that category
  (`readAllPages` over `compliance_items`, distinct `company_id` count —
  an unbounded `.select` here would hit the exact 1,000-row PostgREST
  cap this file already warns about elsewhere).
- **The notification links to `/broadcast?update=<id>`.**
  `BroadcastPage` reads that param, looks the row back up, and — only
  when its `regulatory_category` is real (not `'none'`) — pre-fills the
  compose form's title/description and pre-selects every client whose
  register holds that category. `BroadcastClient.tsx` seeds its
  `selected`/`form` state from this `prefill` prop via a `useState`
  initializer (runs once, on mount), so a staff member can still edit
  or clear anything before the existing confirm-and-send flow runs
  unchanged — the prefill is a convenience, never a bypass of the
  human step the confirm modal already enforces.
- **New notification type `regulatory_change_detected`**
  (`notify/types.ts`, shared-dupe pair) — both bells' icon maps gained
  an entry (`Sparkles`/purple, the same styling every other Jev
  suggestion in this file already uses:
  `hs_followup_suggested`/`absence_pattern_flag`), even though the
  portal bell can never actually receive one (this feature is
  admin-only) — `notificationTypes.test.ts` pins both bells against the
  full shared vocabulary regardless of which app ever writes a type.
- Mutation-checked in `classify.test.ts` (a fake DB + a mocked Jev
  transport, the same harness `weeklyPeople.test.ts` uses): a real
  regulatory change with an affected client notifies staff once per
  article; a non-regulatory article is recorded as `'none'` and nobody
  is told; a real category with zero matching client register items is
  recorded but never notified; a low-confidence answer is gated to
  `'none'` rather than acted on; an already-classified or draft row is
  never reconsidered; and — the property that matters most — nothing
  here ever writes `compliance_items` or `actions`, or notifies anyone
  outside `{ kind: 'staff' }`.
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (850 admin — 832 + 18 new; 248 portal, unchanged — this touched admin
  only besides the two shared-dupe vocabulary mirrors), all five CI
  guards pass, both production builds compile. Migration 115 applied
  live and verified (three nullable columns, the CHECK's exact 24-value
  list read back via `pg_get_constraintdef`, the partial index present).

---

## Sanity-check sweep, and H&S Tests (2026-09-26, migration 116)

Operator: *"run a sanity check on the system, make sure every action
creates a reaction into anything its linked to"*, plus a request to
test many employees across many clients on the same day, delivered by
link, Microsoft Forms, or entered by staff, auto-marked where the
platform can mark it, held under the employee's record.

### Sanity-check: two reactions that were missing

Auditing every `TRIGGERED_ENTITIES` table against its rules in
`lib/events/rules.ts`/`hsRules.ts`/`leadRules.ts`/`hireRules.ts`/
`supportRules.ts` found the connective-tissue work (096-115) already
covers the platform end to end — writes on every triggered table have
a consequence — except two H&S tables that had a trigger but no rule
consuming one of their transitions:

- **`hs_incidents.updated` → `status: 'closed'` told nobody.** The
  creation rule (`hs_incident_reported`) only ever fires once, at
  report time; a client reading their read-only Incidents tab was the
  only way to learn an investigation had concluded. New rule
  `hs_incident_status_changed` tells the client admins.
- **`hs_documents.created` told nobody.** A new H&S document (Phase 2)
  landed in the library with no signal to the client beyond noticing
  it themselves. New rule `hs_document_added` tells the client admins,
  gated on `status = 'active'` — a superseded row's own `.updated`
  needs no separate notice, since the replacement's `.created` already
  covers it.

Both are ordinary consequence rules, no new tables, following the
existing `admins(companyId)` / `notifyC` shapes already used throughout
`hsRules.ts`. `hsRules.test.ts` gained four cases (18 → after this
section, 19 with the Tests rule below).

**Everything else audited clean**: every other triggered table (leave,
actions, documents, compliance, reviews, requisitions, candidates,
offers, onboarding/offboarding, employee_records, enquiries,
bd_companies, interview_schedules, referral_scan_runs) already has a
rule; every reminder entity already has a bucket; every emitted entity
(`manatal_match`, `policy_ack_resend`) already has a consumer.

### Product fit: the H&S consultancy's service line

Checked against Peninsula's own offering (training, site visits,
audits, accident reporting, investigations) rather than assumed: three
of the five were already fully built before this session —
`hs_activities` (site visits, advice calls, fire drills, meetings,
toolbox talks — the day-to-day delivery record), `hs_audits` (on-site
audits with an offline runner, scoring, evidence photos, findings →
client actions), `hs_incidents` (accident reporting with the RIDDOR
workflow and an investigation status the fix above now surfaces to the
client on close). The one clear gap was **safety training as a formal,
markable assessment** — a fire warden refresher, a manual handling
test, a toolbox-talk comprehension check — as opposed to `hs_activities`
recording that a session happened. Tests (below) is that piece.

### Tests (migration 116)

Four confirmed decisions before building (Tom, 2026-09-26 — asked
because the request's own wording ("automatically marked" + "provided
by link, Microsoft Forms or manually") pulls in two directions that
cannot both be literally true for every source):

1. **Marking**: only a test the platform itself hosts (`built_in`) can
   mark itself. Neither Microsoft Forms nor most external quiz tools
   expose individual response data through an API this platform could
   poll, so "auto-fetch the result" for those would be built against
   an integration that mostly doesn't exist. `link`/`ms_forms`/`manual`
   assignments get a first-class record; their score is entered by
   whoever administered the test, once the result is known.
2. **Access**: a unique, no-login link per person — the exact
   `policy_ack_tokens` (103) shape, not a shared session link.
3. **Bulk**: yes, test SESSIONS — one session, a cohort of employees
   spanning any number of client companies, assigned and emailed in
   one call. This is the actual "multiple people from numerous clients
   on the same day" requirement.
4. **Training records**: yes — a passed test flagged
   `certifies_training` writes into the existing `training_records`
   (Phase 4) rather than inventing a second "is this person's training
   current" source, with its own expiry from `recert_months`.

**Tables** (`hs_tests`, `hs_test_sessions`, `hs_test_assignments`,
`hs_test_submissions`, `hs_test_tokens`): `hs_test_assignments.status`
is `pending | completed` — one assignment, one submission
(`UNIQUE (assignment_id)`), a genuine retake is a fresh assignment,
never a second row against the same one. `hs_test_submissions` is
insert-only (`REVOKE UPDATE, DELETE, TRUNCATE`), the register's own "a
correction is a new row" discipline.

- **`hs_test_submission_fill()` (BEFORE INSERT, DEFINER) is what makes
  the marking split trustworthy, not the calling route.**
  `company_id`/`employee_id`/`test_id`/`source`/`recorded_by_kind` are
  all derived from the assignment and its test, never from the caller,
  and for a `built_in` test `passed` is RECOMPUTED from
  `score >= pass_mark` regardless of what was sent — belt and braces
  against a marking bug in the application layer. `recorded_by_kind`
  is derived from the TEST's `source_type`, not from `auth.uid()` or
  `hs_actor_kind()`: both the public token route (self-submission) and
  the admin "log a result" route insert through code this repo
  controls, sometimes under the service role, and only a `built_in`
  test is ever self-submitted — the test's own source is the one fact
  that actually distinguishes the two paths.
- **`hs_test_submission_after()` (AFTER INSERT, DEFINER)** flips the
  assignment to `completed` and, only on a pass of a `certifies_training`
  test, inserts the `training_records` row.
- **No `platform_events` outbox entry on `hs_test_submissions`,
  deliberately.** Unlike the H&S register, a submission has exactly two
  controlled entry points this codebase owns end to end (the public
  token route, the admin log route), both already holding a
  service-role or staff-session client when the write happens — routing
  through an async outbox + a five-minute-later consumer would only
  delay the notification. Instead: the admin log route calls `notify()`
  directly, synchronously (the same pattern `lib/bd/score.ts` and
  `lib/lead/weeklyPeople.ts` already use outside the event-rule system);
  the portal's public route — which has no admin-side `notify()` to
  call and no row of its own to trigger from — `emitEvent()`s a
  `hs_test_submission.created` row (a new `EMITTED_ENTITIES` entry,
  the same shape the Manatal move-stage fix (X1 site 2) already uses
  for exactly this "a route with no local row" case), consumed by a new
  `hs_test_submission_recorded` rule in `hsRules.ts` — so both paths
  end at the identical `hs_test_result` notification/link, and neither
  can drift from the other.
- **`hs_test_tokens`: SHA-256 only, RLS on, NO policies at all**
  (service role only) — the exact `policy_ack_tokens` shape. One token
  link works for every source type: what it SHOWS differs (a quiz to
  answer vs. "your result will be logged for you"), but the employee
  never needs to know which kind it is. 60-day TTL (a session may be
  booked well ahead). Burned on a successful submission; a resend burns
  every other link for the assignment.
- **Never send the answer key to the browser.** The public GET route
  strips `correct_option_id` before returning questions — pinned by a
  route test asserting the response body never contains that string.

### Admin: test bank, sessions, logging

`admin/src/lib/hs/testTokens.ts` / `testMarking.ts` / `testTypes.ts`
(shared-dupe pairs) + `admin/src/lib/hs/testInvite.ts` (`sendTestInvite`,
the ONE place a test invite is ever sent — the bulk session route and
the single resend route both call it, so the email and the
claim-before-send discipline (`sendKeyedEmail`) can never drift between
the two call sites). `/health-safety/tests` (bank + built-in question
builder), `/health-safety/tests/[id]` (sessions, a company-grouped
employee cohort picker, assignments table, resend, log-a-result modal).
`POST .../tests/[id]/sessions` is the actual "cohort across companies,
one call" action: each cohort entry names its own `company_id` (not
derived from the employee) so a malformed pairing 404s per row rather
than silently filing someone under the wrong client.

**Every Supabase read here is a separate query by id, never an
embedded/joined `.select()`.** The first draft used
`.select('id, hs_tests(source_type, title), employee_records(full_name)')`
in the log route and `sendTestInvite`; both compiled, both worked
against a live PostgREST (real FKs exist), and both **could not be unit
tested** — the `fakeSupabase` harness resolves a select's column string
as an opaque list, never a joined relation, so the embedded fields came
back `undefined` and every fallback string ("An employee", "test")
silently won. Rewritten as `Promise.all` of separate by-id lookups —
the same lesson this file already recorded for the referral PATCH
route's PGRST200 (both tables pointing at a third table is not a join
path PostgREST will walk) and the Applicants-table removal (fetch by id
list, not a chained embed) — and the same three routes' tests now
assert the REAL recipient name and test title, not a fallback string
that happened to pass.

### Portal: the no-login link, and read-only results

`portal/src/app/api/test/[token]/route.ts` — GET (who, what test, the
built_in questions with no answer key, or the external link / "logged
for you" copy for the other three sources) and POST (only ever
completes a `built_in` test; every other source 400s with "your result
will be logged for you"). Added to `PUBLIC_ROUTES` in
`portal/src/lib/supabase/middleware.ts` — both `/test/` (the page) and
`/api/test/` (its own server-side preflight calls the API with no
cookie), the identical reasoning the leave and policy links already
established.

`portal/src/lib/hs/testSubmission.ts` (portal-only — admin never
self-submits) — `submitBuiltInTest()`: marks with `markBuiltInTest()`,
inserts, burns the token, emits the event above. The DB trigger, not
this function, is what a hostile client answer set actually has to get
past.

**"Under the employee record" is a `/protect/tests` list page, not a
panel bolted onto `EmployeeDrawer.tsx`.** That drawer is an edit-only
form with no read-only "related records" tabs of any kind (no reviews,
no absence, no documents panel either) — adding one panel just for
Tests would have been a new UI pattern invented for one feature rather
than following how every other related-record list already works in
this app (its own page, filterable). `/protect/tests` groups by
employee, most recently tested first within each group; gated by
`protect` alone (a new `moduleAccess.ts` entry, same posture as
Register/Documents/Audits/Incidents/Equipment — nothing here is
self-certified) and added to the PROTECT `SectionTabs`.

### Verified

`tsc --noEmit` clean both apps; full `vitest run` green (885 admin —
850 + 35 new: `testMarking.test.ts`, `hsTestsSql.test.ts`, the tests
bank/sessions/resend/log route tests, the two extra `hsRules.test.ts`
cases; 267 portal — 248 + 19 new: the public token route test, `testSubmission.test.ts`,
the middleware exemption cases, `moduleAccess.test.ts`/
`portalPagesLinked.test.ts` picking up `/protect/tests` and
`/test/[token]` automatically); all five CI guards pass; both
production builds compile, including `/health-safety/tests`,
`/health-safety/tests/[id]`, `/protect/tests` and `/test/[token]`.
Migration 116 applied live and verified (RLS on all five tables, the
fill/after triggers and their REVOKEs, the submissions table's
insert-only REVOKE).

**Not built**: an API integration that auto-fetches a Microsoft Forms
or external quiz result — see decision 1 above for why (no reliable
per-response API to poll for most vendors). If Microsoft Graph access
to a specific tenant's Forms responses is ever available, that would
replace the `ms_forms` manual-logging path with a poller, not change
this schema.

---

## Core-OS 360 Phase 1: tenancy, consultancy access, people, audit (2026-09-26, migrations 117-121)

Plan: `docs/CORE_OS_360_PHASE1_PLAN.md`. Handover + QA: `docs/CORE_OS_360_PHASE1_HANDOVER.md`.
Live probes: `supabase/probes/117_119_phase1_tenancy.sql`, `119_document_versions.sql`,
`117_121_protected_regression.sql`.

### Rules

- **`companies` is still the table; `organisations` and `sites` are
  `security_invoker` views** (over `companies` / `hs_sites`).
  `organisation_id` ≡ `company_id`. New code may read the views; FKs still
  point at the tables. Do not rename the tables piecemeal.
- **A consultant works in ONE organisation at a time.** Grants live in
  `user_organisation_access`; the active one in `user_active_organisation`,
  written ONLY by `set_active_organisation()`. `my_company_id()` returns the
  active organisation while its grant is live, else home. That is why no
  policy was widened: every existing policy became consultant-aware as-is.
  **Never write a policy as `company_id IN (all orgs I can reach)`** — it
  shows several tenants at once and lets a record land on the wrong one.
- **App code asks the database which organisation is active**:
  `effectiveCompanyId()` / `readEffectiveCompany()` in
  `portal/src/lib/auth/activeOrganisation.ts`. Reading `profiles.company_id`
  gives the HOME company and is wrong for a consultant (onboarding is the
  one deliberate exception). The portal layout re-checks the cookie against
  the database every render and drops a stale one; switching is a POST then
  a FULL navigation, never `router.push`.
- **Capabilities, not role strings.** `has_capability(org, cap)` in SQL;
  `lib/auth/capabilities.ts` (shared pair) in TS, pinned to 117's seed both
  ways by `tenancySql.test.ts`. Adding a role or capability means editing
  BOTH, in a new migration. `role === …` UI checks that remain are debt, not
  a pattern to copy.
- **Read-only is enforced by RESTRICTIVE policies** (`write_guard_ins/upd/
  del`, `session_can_write()`). **Every new client-writable table must call
  `SELECT public.apply_write_guard('public.<table>')`** in its migration, or
  a read-only grant can write to it.
- **`audit_events` is append-only for everyone, service role included.**
  Row triggers use `audit_row(entity, org_col, <whitelisted cols…>)` — never
  whitelist salary, NI, notes, free text (the test's FORBIDDEN list).
  App-level events go through `auditLog()` (admin), which now persists via
  the service-role `audit_log()` RPC.
- **People RLS is derivative.** You see a person if you can see a linked
  employee/candidate/athlete row, or they are your own workforce and you hold
  `people.read`. Sensitive HR fields stay on `employee_records`.
  `person_link_row` must NEVER raise — the referral cron inserts candidates.
- **Same-organisation links are enforced by trigger** (`assert_same_org`):
  site, department, manager, assignee, primary contact.
- **Document files are never overwritten**: `document_versions` is written
  only by trigger; changing `documents.file_path/file_url` bumps the version.
- **`search_records()` is SECURITY INVOKER** — it can never return a row the
  caller could not already read. Keep it that way.
- **Tavily** is the external search provider for later phases; internal
  search stays in Postgres.

### Not done in Phase 1 (see handover §H)

`access_scope` not enforced; no portal UI for consultancy owners to grant
(RPC ready); people not synced back from source rows; broadcast has no
idempotency key; no optimistic locking; UI still uses legacy role checks.

---

## Core-OS 360 Phase 2: the operational H&S core (2026-09-28, migrations 122-129)

Plan: `docs/CORE_OS_360_PHASE2_PLAN.md`. Handover + QA (gate: PASS WITH
MINOR ISSUES): `docs/CORE_OS_360_PHASE2_HANDOVER.md`. Live probes:
`supabase/probes/123_*` to `128_*`, all rolled back.

### Rules

- **Workflow lives in BEFORE triggers, never only in the UI.** `hs_doc_guard`
  (RA / RAMS / COSHH), the incident, investigation and RIDDOR guards and
  `actions_party_guard` decide every status move, who may make it and what
  may change. A page only asks. Approved content is immutable; a change is
  `hs_new_version()`, which drops `review_date` on purpose (set it again
  before submitting).
- **Nobody approves their own work** (creator, submitter or assessor), staff
  excepted. Probes that forget this fail on the guard, correctly.
- **RIDDOR is decision support.** Flags only prompt (`potentially_reportable`);
  a decision needs `riddor.review` and a rationale. Never auto-decide, never
  submit to the HSE.
- **Injury, contact and medical detail live only in
  `incident_person_sensitive`** (`incident.sensitive.read`). A reporter may
  write it and never read it back, so never `.select()` after that insert.
  No description, rationale, notes or injury text in any outbox whitelist,
  timeline summary, audit value or notification — tests pin it.
- **Corrective actions are `actions` rows** (`source_type`/`source_id`). Never
  build a second action table.
- **Links are `hs_links`**, same-organisation by trigger, copied forward on
  a new version. A new link type needs `hs_entity_table()` to know it.
- **Evidence is `hs_files` in the private `hs-evidence` bucket**, keys built
  only by `evidenceKey()`; storage reads inherit the row's RLS; signed under
  the user's session. No service role in safety code.
- **Keyed upserts need a FULL unique index** (126a). PostgREST cannot infer a
  partial one — that silently broke every keyed notification from 096 until
  126a. `upsertConflictTargets.test.ts` checks every `onConflict`.
- **A form that files a record must survive a lost reply.** The incident form
  fixes its id on open (`lib/hs/reportIncident.ts`); a retry meets 23505 and
  reads its own row back. Copy this for any new "report" form.
- **Client components must not import server-only modules** (`next/headers`
  via `safetyContext`). Use `safetyFormat.ts`; `clientServerBoundary.test.ts`
  fails the build-breaking import that tsc cannot see.

### After deploy

Watch `automation_runs` for the reminders cron (it can now write keyed rows
it never could) and see one real notification of each safety kind; check
the report forms on a phone. **Phase 3 has not been started.**

### Incident → training (migration 130)

- **Evidence, never a verdict.** `incident_training_evidence()` shows an
  investigator each person's training status ON THE INCIDENT DATE
  (`hs_training_status_at()`, one rule). Nothing writes a cause: that
  stays a confirmed `incident_causes` row.
- **The recorded finding is a snapshot** (`incident_training_checks`),
  written only by `record_/withdraw_incident_training_check()` through
  `hs_training_check_gate()`. A DEFINER writer must check
  `session_can_write()` itself: it bypasses the restrictive write guard.
- **Joined by `employee_records.person_id`** (118). An externally named
  person has no record and is refused, not shown as "not recorded".


---

## employee_records sensitive columns (hotfix, 2026-09-28, migration 131)

Found by the Phase 3 pre-flight gate (High). `employee_records_select` is
row-level only and `authenticated` held table-level SELECT, so any
signed-in user of a client, the `employee` role included, could read every
colleague's salary, NI number, tax code, DOB, diversity data, address and
emergency contacts (proven live, rolled back). 0 live rows were exposed.

- **Only the columns in `EMPLOYEE_SAFE_COLUMNS` are readable by a session**
  (`portal/src/lib/lead/employeePrivate.ts`, pinned to 131's GRANT both
  ways). Naming any other column, `*`, or a bare `.select()` after an
  insert/update is a permission error. `employeePrivate.test.ts` scans
  every portal `.from('employee_records')` and embed for that.
- **The sensitive fields come from `employee_private_fields(company, ids)`**
  (DEFINER): the organisation you are acting in (or staff) only; HR fields
  blank without `hr.sensitive.read`; the leave token needs `people.write`
  or HR. Use `readEmployeePrivate()` + `withPrivate()`.
- **A write that touches a sensitive column needs `hr.sensitive.write`**
  (trigger, keyed on `current_user`; the service role is unaffected).
  Today only client_admin can write the table, and it holds that, so the
  guard refuses nothing that works. It exists for the day the write
  policy widens.
- **The employee form sends HR fields only when the viewer may read AND
  write them** (`withoutHrFields`). It used to load ~10 columns it never
  selected (employee number, probation end, DOB, NI, emergency contacts…)
  as blanks and save them back, wiping them on every edit.
- **Apply 131 AFTER this code deploys.** The deployed code selects the
  revoked columns: Add Employee would fail, and the org chart's
  `select('*', head)` count would fail and its `count ?? 0` self-seed
  would add a "Founder" row on every admin visit. Probe:
  `supabase/probes/131_employee_records_sensitive.sql` (24/24, rolled back).
  **Applied 2026-09-28 13:54 UTC after PR #229 deployed; re-probed live
  24/24.**

---

## Core-OS 360 Phase 3: workforce and Safe to Deploy (2026-09-28, migrations 131-143)

Plan: `docs/CORE_OS_360_PHASE3_PLAN.md`. Handover + QA: `docs/CORE_OS_360_PHASE3_HANDOVER.md`.
Probes: `supabase/probes/13[1-9]_*`, `14[0-3]_*`, `phase3_qa.sql`, `phase3_qa2.sql`, `phase3_perf.sql`.
Portal pages: `/lead/workforce/*` (flags `lead` + `workforce`).

### Rules

- **Safe to Deploy is decided only by the database** (136 `_wf_deployment`).
  TypeScript displays `status`, `reasons[]` and `requirements[]`; it never
  computes or overrides a status. Read it with `person_deployment_status`,
  `workforce_readiness` or `workforce_matrix` — all go through
  `_wf_deployment_safe`, which turns ANY error into REVIEW_REQUIRED. Never
  call the raw engine from a public read (workforceSql.test pins it).
- **Never a stale READY.** The cache (`person_deployment_status`) is used
  only when clean, in date and calculated today. Every table the engine
  reads has a `workforce_mark_dirty` trigger; **a new input table needs one
  too**, or a change to it will not invalidate the cache.
- **One definition of safety-critical**: the rule's flag, the catalogue's
  flag, or mandatory for a safety-critical role. The engine
  (`_wf_requirements`) and verification (`workforce_item_safety_critical`,
  139) must agree — they did not until 139 (QA 10, HIGH).
- **Competence is never inferred from training or text.** The engine's
  competency branch does not read `training_records`. No AI, no scores,
  no prediction anywhere in the workforce model.
- **Occupational health**: `person_health_outcomes` (category, dates,
  restriction summary) for `occupational_health.summary.read` or the
  person; `occupational_health_clinical` + bucket `oh-clinical` ONLY for an
  EXPLICIT `occupational_health.clinical.read` grant (`has_explicit_capability`,
  no staff shortcut). Add any new explicit-only capability to
  `EXPLICIT_ONLY_CAPABILITIES` AND to 140's `my_capabilities` list — the
  test fails otherwise. Restriction text and clinical content never go
  into an audit whitelist, outbox payload, notification, CSV or the engine.
- **Guards keyed on `current_user` are SECURITY INVOKER** (134a:
  the DEFINER version skipped every session rule). Lookups they need are
  small DEFINER helpers. `invokerGuards.test.ts` fails on a DEFINER one.
  A DEFINER RPC that writes must check `session_can_write()` itself.
- **Rules in force are immutable**: supersede → edit the draft → activate.
  No rule starts in the past or ends retroactively (`requirement_rule_guard`).
- **Evidence** is insert-mostly: self-submissions are always unverified;
  verification only through `workforce_verify` (nobody verifies their
  own; safety-critical needs `workforce.verify_safety_critical` and a
  different verifier). Upload the file FIRST
  (`portal/src/lib/workforce/evidence.ts`), then write the record naming
  it — storage reads are granted by the record.
- **Hire / leave** are database triggers on `employee_records` (137): a
  requisition's `job_role_id` gives the hire one primary assignment and
  the role's pre-employment checks; termination ends assignments and
  revokes exceptions and authorisations, deleting nothing. Hiring never
  makes anyone READY.
- **Workforce lists include only** worker_type employee / contractor /
  consultant / temporary_worker. `person_link_row` (141) promotes a hired
  candidate OR athlete to employee — anything that creates employees by
  another path must do the same.
- **Tuples in `portal/src/lib/workforce/vocab.ts` mirror the CHECKs**;
  `workforceVocab.test.ts` pins them both ways.
- **Evidence never crosses an organisation (142, three CRITICAL from the
  QA 42 security review).** A document linked to another client's worker
  made that worker READY; an evidence or clinical row naming another
  client's file made the file readable. So:
  - every `_wf_judge` evidence read carries `company_id = org` (the
    person's own organisation) — a new branch needs it too;
  - `person_id` on `employee_records`, `candidates`, `athletes` and
    `employee_documents` must be in the row's own organisation (triggers,
    every writer). A new table with a `person_id` needs the same;
  - an `evidence_path` must start `<company>/<kind>/<person>/` and a
    clinical `document_path` `<company>/<person>/`, checked in the guard
    after `person_id` is final; the storage read policies ALSO compare the
    folders with the row. **A storage policy that grants a file because
    "a row I can see names it" must check the row owns the path** — the
    row is caller-written.
  - a safety-critical or evidence-required **document** requirement counts
    only a document with `filed_by_authorised` (stamped at write time:
    the writer held `workforce.manage` and is not the worker). The engine
    runs without a session, so authority must be recorded, not asked.
  - a safety-critical item gets **no grace** once expired.
- **A mandatory item always needs verified evidence (143, product decision
  on QA 42 Medium 2).** `_wf_judge` gained `p_mandatory`; `need_verified`
  is now true for ANY mandatory item, not only safety-critical or
  evidence-required ones. A worker's own unverified, self-dated submission
  never counts toward a mandatory requirement. An optional requirement is
  unaffected. Note `role_requirements.mandatory` defaults to `true` — a
  requirement inserted without naming it explicitly is mandatory, and now
  needs a verifier too.

### Operations

- Hourly `/api/cron/workforce-refresh`: `workforce_daily_tick()` then
  `workforce_refresh_due(5000)`. Nothing reads its output to decide
  anything; a missed run makes pages slower, never wrong.
- Measured (2,000 workers): warm lists ~0.4 s, a profile 10 ms, a cold
  calculation ~6 ms a person. A rule change that dirties thousands of
  people makes the lists calculate them live until the next refresh.

---

## Core-OS 360 Phase 4: assets, plant, equipment, inspections, PUWER,
## LOLER, contractors, permits, emergency planning (in progress, from
## 2026-09-28, migration 144 onward)

Scope: `docs/CORE_OS_360_PHASE4_PLAN.md` (the operator's full spec).
Delivered in **logical, independently-verified groups** — migration, live
rolled-back probe, tests, all five CI guards, doc update, THEN the next
group — specifically so a defect in one group cannot compound into the
next, the same discipline the QA 42 security review (Phase 3) showed was
missing when things moved too fast. **Explicitly forbidden anywhere in
this phase**: predictive/AI safety scoring (machine failure prediction,
accident probability, unsafe-worker prediction) and false certification
language ("this machine is legally compliant" — say what was recorded,
never assert legal compliance).

### Pre-work: the existing-operations audit

Before any Phase 4 code, a full audit of existing equipment/contractor/
inspection/test/permit-adjacent functionality (task #20) produced the
group boundaries below. Its central conclusions, each binding on later
groups: `hs_equipment` (112) already IS the asset register and must be
EXTENDED, never forked into a parallel `assets` table; `hs_audits` (110)
is a genuinely different concept from routine/pre-use inspections and
keeps its own name, but its proven mechanisms (client-generated ids,
one atomic idempotent submit RPC, server-side scoring, offline
localStorage runner, one platform_event per run) are the template new
inspection tables should copy; contractor/permit/isolation/emergency
functionality is entirely unbuilt (only the unenforced
`contractors.manage` capability exists as a placeholder) and needs new
tables built on the existing `people`/`person_authorisations`/`actions`/
`hs_files` primitives, never second copies of them.

### Group 2: the asset register (migration 144)

`hs_equipment` extended in place (see the audit's own conclusion above),
not replaced:

- **`asset_ref`** (`AST-000123`, minted once via `next_record_number()`
  on first insert, never re-minted on update — the same numbering
  function permits will use in Group 9).
- **`asset_type`** — a CHECKed vocabulary (`plant | machinery | vehicle |
  tool | lifting_equipment | fixed_installation | ppe_equipment |
  other`), not free text, mirrored as `HS_ASSET_TYPES` in
  `lib/hs/vocab.ts` (shared-dupe pair).
- **`parent_asset_id`** — sub-assembly hierarchy, self-referencing with a
  bounded cycle guard (`hs_equipment_same_org_and_no_cycle()`, a 50-deep
  walk, not a recursive CTE — a runaway recursive query is a worse
  failure mode than an early exit on a hierarchy that is never actually
  deep). A CHECK refuses a literal self-parent; the trigger refuses a
  longer cycle and any cross-organisation parent/owner/area, reusing
  118's `assert_same_org()` rather than a bespoke re-implementation.
- **`operational_area_id`** → `departments(id)` — must be on the SAME
  SITE as the asset, checked in the same trigger (an area on a different
  site is refused, not silently accepted).
- **`owner_person_id`** → `people(id)`, **`puwer_applicable`** /
  **`loler_applicable`** (booleans, not a free-text "regime" tag — Groups
  5/6 branch on these and a boolean can't be misspelled the way a tag
  could), **`safety_critical`** (the ONE definition of safety-critical
  an asset gets in this system, read by Groups 4/9/10 to decide whether
  a failure quarantines the asset outright), **`archived_at`** (soft
  retire — evidence, inspections and incidents already reference the
  row).
- **`status` gains `'quarantined'`** now, ahead of Group 4 (defects) —
  rewriting a CHECK a second time to insert one more lifecycle value is
  exactly the avoidable second pass "logical groups, no errors" exists
  to prevent.
- **Evidence**: `hs_scope_for_entity()`/`hs_entity_table()` never mapped
  `'equipment'` despite `hs_equipment` already existing — a real gap the
  audit flagged. Both latest-definition functions, plus
  `hs_evidence_readable()`/`hs_evidence_writable()`/
  `hs_files_entity_check()`, are re-created here (124's bodies, with only
  an `'equipment'` branch added) gated on two new capabilities,
  `asset.read`/`asset.manage`, seeded in 117's own 3-column shape and
  granted to exactly the same roles as `risk.read`/`risk.create` — an
  asset register usable immediately by the people who can already work
  with risk assessments, not invisible until a manual grant.
- **Audit trail**: `audit_row('asset', 'company_id', ...)`, a column
  whitelist of identifying/classifying fields only — never `notes`.
- **`assets`** is an optional `security_invoker` read view over
  `hs_equipment`, the same alias pattern `organisations`/`sites` already
  use — `hs_equipment` is still the table; FKs still point at it.

**Live probe** (`supabase/probes/144_asset_register.sql`, rolled back):
18 checks — asset_ref minting and uniqueness, cross-site operational
area refused, cross-company owner/parent refused, a 2-node cycle
refused, self-parent refused, `quarantined` accepted, evidence accepted
same-company / refused cross-company, `hs_scope_for_entity`/
`hs_entity_table`/`hs_entity_company` all resolve `'equipment'`
correctly, both capabilities seeded and granted, the `assets` view reads
through, the audit trail fires. All 18 passed.

**A trap caught and fixed same-day**: the first version of the
capability grant used a dynamic `SELECT role_key, 'asset.read' FROM
access_role_capabilities WHERE capability_key = 'risk.read'` — correct
data, but unparseable by `tenancySql.test.ts`'s regex-driven TS↔SQL
parity check, which only recognises 117/122/132's `('capability',
ARRAY[roles])` literal shape. Rewritten (migration `144a`, applied
same day, `ON CONFLICT DO NOTHING` against identical rows already
present) to match that shape exactly, with the role lists copied
verbatim from `risk.read`/`risk.create` rather than computed — verified
live afterward that the resulting grants are byte-identical to
`risk.read`/`risk.create`'s own role sets.

`tenancySql.test.ts` gained migration 144 to its capability-parity
check (35 tests, was 34); `vocab.test.ts` gained an `asset types` case
and a corrected `equipment statuses` anchor (the status CHECK moved
from an inline `CREATE TABLE` clause to a named `ADD CONSTRAINT`, so the
anchor now matches the constraint NAME rather than the old `DEFAULT
'in_service' CHECK (` text — 13 tests, was 11). `capabilities.ts` and
`hs/vocab.ts` (both shared-dupe pairs) updated in both apps in the same
pass, byte-identical.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1108 admin, 600 portal), all five CI guards pass, both production
builds compile (portal's pre-existing sandbox-only `/auth/reset-
password` prerender failure — missing `NEXT_PUBLIC_SUPABASE_*` env
vars in this container, not in Vercel — is unrelated to this change and
touches no page this migration affects, same caveat recorded earlier in
this file).

### Group 3: the inspection engine (migration 145)

A routine/pre-use **inspection** is a checklist run against ONE ASSET
(a forklift's daily pre-use check, a machine guard check) — distinct
from `hs_audits` (110, a facility-wide WALK-ROUND across many topics)
and from `hs_equipment_inspections` (114, a single dated pass/fail
statutory-examination record with NO checklist — that table is kept
as-is; LOLER's thorough examinations in a later group extend it,
since a thorough examination genuinely is a single dated event, not a
checklist). New tables: `inspection_templates` / `inspection_template_
items` (staff reference data, an `asset_type` filter, a `critical` flag
per item — the one thing Group 4 reads to decide whether a failure
quarantines the asset outright vs. raising a lower-priority defect) and
`inspections` / `inspection_responses`.

Copies `hs_audits`'/`hs_submit_audit()`'s proven shape verbatim, per
the existing-operations audit's own recommendation, adapted from "one
visit" to "one asset":

- **Insert-only** — a correction is a new inspection, never an edit.
- **Client-generated ids on BOTH the inspection and its responses from
  day one** — 110 learned the response-id lesson the hard way in 113
  (evidence photos need to be staged against a specific response
  before the parent row exists); this table starts with it.
- **One atomic `hs_submit_inspection()`** (SECURITY INVOKER — this
  exists for the transaction, never to escalate privilege), insert-or-
  return-existing on the client-supplied id, so a retried request after
  a dropped connection cannot create a second inspection or double-
  notify.
- **The overall outcome is computed SERVER-SIDE from the responses**,
  never trusted from the client — any response rated `fail` makes the
  inspection `fail`; any `fail` on a `critical` item sets
  `has_critical_failure`.
- **Same-organisation + same-site guard** (`inspections_same_org()`):
  the asset must be in the caller's own company, and if both the
  inspection and the asset name a site, they must match.
- **Evidence**: `hs_scope_for_entity`/`hs_entity_table`/
  `hs_evidence_readable`/`hs_evidence_writable`/`hs_files_entity_check`
  all gain an `'inspection'` branch, reusing the register scope and the
  `asset.read`/`asset.manage` capabilities from Group 2 — no new
  capability invented.
- **Timeline**: one `hs_events` entry per inspection (never per
  response), verb `completed` on a pass or `failed` on a fail.
- **Outbox**: `inspections` added to `TRIGGERED_ENTITIES`, whitelist
  `asset_id, site_id, template_id, conducted_on, overall_outcome,
  has_critical_failure` — never a response's own comment text.
- **Write guard**: `apply_write_guard()` applied to all four new
  tables, insert-only or not — a read-only consultancy grant must not
  be able to insert here either.
- **RLS**: staff full access; any signed-in user with `asset.read` may
  browse the template catalogue and see their own company's
  inspections; anyone with `asset.manage` may record one.
- **Consequence rule `inspection_completed`** (`hsRules.ts`) is
  deliberately **notify-only** in this group — it tells the client
  admins (urgent on a fail) and, on any fail, staff. It raises **no
  action** and touches **no asset status**. Group 4 (defects +
  return-to-service) extends this exact rule to also raise the defect
  and, on a critical failure, quarantine the asset — reading the
  `has_critical_failure`/`overall_outcome` this migration already
  computes, never re-deriving them.
- One starter template seeded (`Forklift pre-use check`, 8 items),
  mirroring 106's sector packs / 110's starter audit template
  reasoning: something to pick on day one.

**Live probe** (`supabase/probes/145_inspection_engine.sql`, rolled
back): 20 checks — submit computes fail/critical correctly, a retry
with the same id is idempotent (no second row, no second responses,
first submission's data wins), an all-pass submission is clean,
cross-company asset refused, mismatched site refused, evidence vocab
resolves, evidence accepted same-company/refused cross-company,
immutability grants absent, Timeline verb distinguishes pass/fail, the
outbox payload carries `overall_outcome`. All 20 passed.

`platformEventsSql.test.ts` gained 145 to its `LATER` list and
`'inspections'` to `TRIGGERED_ENTITIES`. A new notification type,
`inspection_completed`, added to `notify/types.ts` (shared-dupe pair)
and both bells' icon maps. `hsRules.test.ts` gained three cases for the
new rule (critical fail tells both sides and raises nothing; a
non-critical fail still tells both sides; an all-pass tells the client
only).

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1111 admin, 600 portal), all five CI guards pass, admin production
build compiles.

### Group 4: defects + return-to-service (migrations 146-147a)

**"Never build a second action table"** (this file's own standing
rule, already applied to H&S findings, incidents and corrective
actions) — a defect is an `actions` row, not a new table.
`actions.source_type` already allowed `'inspection'` (119/125's
CHECK), so no CHECK change was needed at all: a defect raised from a
failed inspection response is `source_type = 'inspection'`,
`source_id = <inspection_response.id>`, `related_entity_type =
'hs_equipment'`, `related_entity_id = <asset>`, keyed
`inspection_response:<id>` (the same "one action per finding, keyed by
sourceRef" shape `hs_audit_finding` already established).

- **A CRITICAL item's failure** (the item was marked `critical` on the
  template, Group 3) gets `severity = 'critical'`, `priority =
  'urgent'`, `verification_required = true` — the exact mechanism
  125's incident-severity escalation already uses for major/critical/
  fatal incidents. A non-critical failure gets `severity = 'low'`,
  `priority = 'normal'`, no verification requirement.
- **"This defect is properly resolved" is exactly `status =
  'complete'` — no separate flag needed.** Reaching `complete` on a
  verification-required action is only possible via `'awaiting_
  verification'` first (`actions_lifecycle()`, 125), which always
  stamps `verified_at`, and nobody may verify their own submitted work
  (`actions_party_guard()`, 126).
- **Return-to-service is a DATABASE GUARD, not a UI convention**
  (`hs_equipment_return_to_service_guard()`, a BEFORE UPDATE trigger on
  `hs_equipment`): an asset may not leave `'quarantined'` while an open
  critical defect (`source_type = 'inspection'`, `severity =
  'critical'`, `status NOT IN ('complete','dismissed','cancelled')`)
  still points at it. The guard applies to every session, staff
  included — the same posture 125's own document/incident workflow
  guards take ("workflow lives in BEFORE triggers, never only in the
  UI"). A non-critical open defect never blocks return-to-service.
- **Quarantining happens AT SUBMISSION**, inside `hs_submit_inspection`
  (extended, not duplicated) — a critical failure needs the asset off
  the floor the moment it is recorded, not on the next automation
  cron tick five minutes later. Never touches a `'decommissioned'`
  asset (a stronger, terminal state); never re-quarantines one already
  quarantined.
- **`hs_quarantine_asset()` is SECURITY DEFINER, and the reason is a
  real gap found live while probing this group**: `hs_equipment` has
  only a staff-`ALL` policy and a client-`SELECT` policy — 112 never
  gave a client an UPDATE policy, and Group 2 did not widen that. But
  recording a routine pre-use inspection is exactly a CLIENT action (an
  operator's own forklift check), so a plain session UPDATE from inside
  `hs_submit_inspection` (SECURITY INVOKER) would have been silently
  no-op'd by RLS for anyone but staff — the asset would stay
  `'in_service'` after a critical failure. The DEFINER helper re-derives
  the caller's own organisation from `my_company_id()` (never trusts an
  argument), so it can only ever quarantine an asset already known to
  belong to the caller's own company.
- **A second real gap found live, same probing session**: gating
  `inspections`/`inspection_responses` INSERT on `asset.manage` (Group
  3's own choice) locked out the actual front-line user this feature
  exists for — a plain `client_user` maps (117's `legacy_role_map`) to
  the catalogue role `employee`, which never held `asset.manage`.
  Migration 147 adds a narrower `inspection.perform` capability
  (granted to every `asset.manage` role plus `employee` — the one role
  Group 2 deliberately left out), moves the INSERT/SELECT policies on
  `inspections`/`inspection_responses` and the template-catalogue read
  policies onto it, and moves the `hs_evidence_writable`/`readable`
  branch for `'inspection'`/`'inspection_response'` onto it too — a
  photo attached to an inspection's own answer is recording the
  inspection, not managing the asset register, which stays
  `asset.manage`-gated for the asset row and its own evidence.
- **147a is the same "TS↔SQL parity regex can't parse a dynamic grant"
  trap 144a already hit**: 147's first capability-grant INSERT used a
  `SELECT role_key, 'inspection.perform' FROM (VALUES (role),...)`
  shape; `tenancySql.test.ts` only recognises 117/122/132/144's
  `('capability', ARRAY[roles])` literal shape. Rewritten in place (and
  147a applied live, `ON CONFLICT DO NOTHING`, byte-identical resulting
  grants) to match it.

**Live probes**: `146_defects_return_to_service.sql` (rolled back, 6
checks, run under a SIMULATED CLIENT SESSION via `set_config('request.
jwt.claims',...)` + `SET LOCAL ROLE authenticated` — the same technique
142's probe established — since `hs_quarantine_asset()`/
`is_tps_staff()`/`my_company_id()` all key on a real session and a
bare service-role probe has none): a client-submitted critical fail
quarantines the asset; a non-critical fail does not; a decommissioned
asset is never touched; return-to-service is refused while a critical
defect is open; allowed once it reaches `complete`; a non-critical open
defect never blocks it. All 6 passed, confirmed the client-vs-staff gap
BEFORE 147 existed (first run failed check 1), then confirmed fixed.

`hsRules.ts`'s `inspection_completed` rule now raises the defect
action(s) (reading `inspection_responses` directly from the one event
`inspections.created` fires, the same "read once from the row the
event points at" shape `auditSubmittedConsequences` uses) and updates
its client-facing copy ("quarantined... needs attention", link to
`/protect/actions` instead of `/protect/timeline` on a failure). It
never decides the asset's status itself — that already happened,
synchronously, inside `hs_submit_inspection`/`hs_quarantine_asset` at
submission time; the rule only reports what already happened.
`ActionConsequence`'s `row` type and `createKeyedAction()`
(`rules.ts`/`process.ts`) gained optional `severity`/`source_type`/
`source_id`/`verification_required` fields — additive, every existing
caller unaffected. `hsRules.test.ts`'s inspection cases rewritten for
the new behaviour (one keyed defect action per critical/non-critical
fail, correct severity/priority/verification_required, idempotent
re-processing).

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1111 admin, 600 portal), all five CI guards pass, admin production
build compiles.

### Group 5: PUWER assessments (migrations 148-148a)

A PUWER assessment is a formal, periodic compliance review of one
asset — distinct from a routine pre-use inspection (Group 3: frequent,
pass/fail per item) and from a LOLER thorough examination (Group 6,
next: a single dated pass/fail event). It produces a compliance
OUTCOME and a review cycle, and may optionally be backed by a checklist
run via `inspection_id` — **reusing Group 3's `inspections`/
`inspection_responses` machinery, never a second checklist engine.**

- **`hs_equipment.puwer_applicable` (144) gates it**: a trigger refuses
  recording an assessment against an asset not flagged PUWER-applicable,
  so the register can never silently apply the wrong regulation to the
  wrong asset type. A linked `inspection_id` must belong to the SAME
  asset (and organisation) or is refused.
- **Never assert legal compliance — applied here first because it is
  where a wrong word would matter most.** Every outcome label
  (`compliant | non_compliant | compliant_with_actions`) and every
  piece of Timeline/notification copy says "recorded assessment
  outcome", never "this machine is legally compliant". A live probe
  check (`8c`) asserts the Timeline summary text literally does not
  contain "legally compliant".
- **Insert-only** (a correction is a new assessment) — same "a
  correction is a new row" discipline as the rest of the register's
  evidence tables.
- **A non-compliant or compliant-with-actions outcome does NOT
  auto-quarantine the asset**, unlike a critical inspection failure
  (Group 4) — a compliance finding needs correction by a review date,
  not necessarily an immediate stop-use; that trade was made
  deliberately, not left undecided. A finding still becomes an
  `actions` row (never a second table): `'puwer_assessment'` joins
  `actions_source_type_check`'s existing `'inspection'`/
  `'equipment_inspection'` CHECK values.
- **A real gap found live while wiring the reminder**: `puwer_
  assessments` is insert-only, so a reminder rule reading it directly
  would fire once per HISTORICAL row — every past assessment's
  `review_due_on`, not just the current one. **148a** rolls the latest
  assessment's review date forward onto `hs_equipment.puwer_review_
  due_on` (the exact pattern `hs_equipment_inspections`/
  `hs_equipment_inspection_roll()` (114) already established for
  `next_inspection_due`, applied here rather than inventing a second
  one), guarded by "only advance when this is the NEWEST assessment for
  the asset" so a late-backfilled old assessment never moves a newer
  one backwards. The reminder rule reads `hs_equipment`, not
  `puwer_assessments`.
- **Evidence, RLS, capability**: reuses `asset.read`/`asset.manage`
  (Group 2) — recording a formal PUWER assessment is gated on
  `asset.manage`, deliberately NOT the narrower `inspection.perform`
  Group 4 introduced for routine checks (a compliance assessment is an
  asset-management act, not a driver's daily tick-list).

**Live probe** (`148_puwer_assessments.sql`, rolled back): 12 checks —
recording against a PUWER-applicable asset succeeds; against a
non-applicable asset refused; cross-company asset refused; a linked
inspection belonging to a different asset refused, to the same asset
accepted; evidence vocab resolves; the CHECK accepts the new
`source_type`; immutability holds; the Timeline entry fires with
neutral, non-"legally compliant" wording; the outbox payload carries
`outcome`. All 12 passed.

`TRIGGERED_ENTITIES`/`REMINDER_ENTITIES` gained `puwer_assessments`;
`platformEventsSql.test.ts` gained 148 to its `LATER` list; a new
`puwer_review_reminder` rule and `puwer_review_due` notification type
(both bells). `PUWER_ASSESSMENT_OUTCOMES`/`_LABELS` added to
`lib/hs/vocab.ts` (shared-dupe pair) — `vocab.test.ts`'s anchor regexes
for BOTH the new tuple and 114's pre-existing "equipment inspection
outcomes" tuple needed disambiguating on a preceding column, since the
two tables' `outcome` CHECK clauses are textually identical and the
test's "latest match wins" helper would otherwise have silently
resolved both tuples to whichever migration is read last — caught
because the first version of the new test failed, not assumed correct.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1112 admin, 600 portal), all five CI guards pass, admin production
build compiles.

### Group 6: LOLER thorough examinations + immediate danger (migration 149)

A LOLER thorough examination is a single dated pass/fail event with a
next-due date — exactly the shape `hs_equipment_inspections` (114)
already has, and NOT a checklist (unlike Group 3's `inspections` or
Group 5's PUWER assessments). Per the existing-operations audit's own
recommendation, this **extends `hs_equipment_inspections` in place** —
"a generic thorough-examination framework, LOLER first" — rather than
a new table. `hs_equipment.loler_applicable` (144) gates it, mirroring
Group 5's `puwer_applicable` guard exactly.

- **Two new columns**: `examination_type` (nullable — NULL means a
  plain routine inspection, unaffected by any of this; `'loler_
  thorough_examination'` is the one value today, framed as a
  vocabulary because the framework is meant to grow) and
  `immediate_danger` (boolean, default false).
- **A LOLER examination against a non-LOLER-applicable asset is
  refused** (`hs_equipment_inspection_examination_guard()`), the same
  shape as Group 5's PUWER-applicable check.
- **Immediate danger (LOLER reg 8) quarantines the asset
  UNCONDITIONALLY, regardless of what `outcome` says** — the examiner
  should always record a fail alongside it, but the database does not
  trust that to have happened correctly (the same defence-in-depth
  Group 4's `hs_submit_inspection`/`hs_quarantine_asset` already
  apply). Checked at the TOP of `hs_equipment_inspection_roll()`,
  before the existing pass/fail branch, and reuses
  `hs_quarantine_asset()` (146) rather than a second quarantine path.
- **Flagged, never decided.** This follows the EXACT "RIDDOR is
  decision support, never auto-decide, never submit to the HSE"
  posture Phase 2 already established for a different regulator:
  nothing here reports anything to the HSE or asserts a legal
  conclusion. It raises one urgent, verification-required `actions` row
  (`action_type = 'hs_immediate_danger'`, `severity = 'critical'`,
  `source_type = 'equipment_inspection'` — already an allowed CHECK
  value since 119/125, no CHECK change needed) and an urgent
  notification to both the client and staff; a person reads it and
  acts.
- **`hs_equipment_inspections` joins `TRIGGERED_ENTITIES` for the first
  time** — it never needed an outbox entry until immediate danger
  needed one to react to. Whitelist: `equipment_id, outcome,
  next_due_on, examination_type, immediate_danger` — never notes.

**Live probe** (`149_loler_examinations.sql`, rolled back, under a
simulated staff session for the same reason 146's probe needed one —
`hs_quarantine_asset()` keys on a real session): 6 checks — a LOLER
exam against a non-applicable asset refused; a passing LOLER exam
rolls `next_inspection_due` forward as before; a plain routine
inspection (no `examination_type`) is unaffected; `immediate_danger =
true` quarantines even when `outcome = 'pass'`; the roll-forward date
is untouched by the immediate-danger row; the outbox payload carries
`immediate_danger`. All 6 passed.

`hsRules.ts` gained `loler_immediate_danger` (raises the action + both
notifications, idempotent on re-processing); a new `loler_immediate_
danger` notification type (both bells); `HS_EXAMINATION_TYPES`/`_LABELS`
added to `lib/hs/vocab.ts` (shared-dupe pair).

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1115 admin, 600 portal), all five CI guards pass, admin production
build compiles.

### Group 7: contractor companies, insurance, prequalification (migration 150)

A contractor is a company distinct from a worker (Group 8 links
individual contractor WORKERS into the Phase 3 person model; this
group is the company record they work for). **`contractors.manage`
(117) has existed since Phase 1 and was unenforced until now** — the
existing-operations audit's own recommendation was to decide whether
to enforce or retire it. Enforced: it already sat on the right roles
(consultancy/organisation owners and admins, `hse_manager`,
`site_manager`, platform staff), so no capability grant change was
needed, only RLS policies that finally read it.

- **Prequalification is deliberately NOT a second checklist engine.**
  Group 3's `inspections` is asset-scoped (`asset_id NOT NULL`) and
  widening it to also cover contractors would blur what it means — a
  contractor prequalification is a company-level compliance decision,
  not a per-visit check. `approval_status` (`pending | approved |
  suspended | rejected`) IS the prequalification outcome, decided by a
  person reading the insurance/document evidence this migration
  tracks. No numeric "prequalification score" table exists; that would
  be new scope, not something this migration should invent to look
  complete.
- **`contractor_insurances` is MUTABLE, one row per (contractor,
  insurance_type)** — a renewal UPDATEs the row in place. This is a
  deliberate departure from the "a correction is a new row" discipline
  the register's EVENT tables (inspections, PUWER assessments) use: an
  insurance policy is ongoing STATE with one current expiry, not a
  point-in-time event history.
- **`contractor_is_current(contractor_id)`** is the one deterministic
  "is this contractor OK to use" check — pure SQL, no scoring, no AI:
  `approval_status = 'approved'` AND both UK-standard required
  policies (`employers_liability`, `public_liability`) in date AND no
  ON-FILE policy of ANY type past its expiry (a lapsed
  `professional_indemnity`, though not required, still fails it).
  Exposed now so Group 8's access gate never needs a second
  implementation of the same fact.
- **Performance reviews reuse the EXISTING `actions.source_type`
  value `'contractor_review'`** (119/125's CHECK already allows it) —
  never a second review table.
- **A suspended/rejected contractor's notification is STAFF-ONLY for
  now**, not sent to the client — contractor management has no portal
  page yet (Group 13 builds it). A client-facing notification with
  nowhere to link was exactly the gap `rules.test.ts`'s own "every
  client notification has a portal link" check caught on the first
  version of the insurance-expiry reminder (it had a `company_admins`
  audience and only an admin link) — both new rules were narrowed to
  `staffOnly` rather than inventing a link to a page that does not
  exist, to be widened once Group 13 ships it.

**Live probe** (`150_contractors.sql`, rolled back): 14 checks — a
new pending contractor is never current; approved-but-uninsured is
never current; missing either required policy is never current; both
required policies in date makes it current; a renewal updates the same
row (not a second one); an expired NON-required policy still fails
currency; suspension overrides everything; insurance `company_id` is
filled from the parent contractor, never trusted from the caller;
evidence vocab resolves; the Timeline and outbox fire on an
approval-status change; the generic audit trail fires. All 14 passed.

`TRIGGERED_ENTITIES` gained `contractors`; `REMINDER_ENTITIES` gained
`contractor_insurances`. `CONTRACTOR_APPROVAL_STATUSES`/`_RISK_
RATINGS`/`_INSURANCE_TYPES` (+ labels) added to `lib/hs/vocab.ts`
(shared-dupe pair).

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1120 admin, 600 portal), all five CI guards pass, admin production
build compiles.

### Group 8: contractor workers + Safe-to-Deploy + access gate (migration 151)

A contractor WORKER is a `people` row (Phase 3) with `worker_type =
'contractor'` — that value has existed since 118, and
`workforce_readiness()`/`workforce_matrix` already include it (Phase
3's own rule: "Workforce lists include only worker_type employee /
contractor / consultant / temporary_worker"). What was missing was the
link to WHICH contractor company (Group 7) a worker belongs to, and one
access-gate check combining that company's status with the worker's own
Safe to Deploy status.

- **`people.contractor_id`** is the one new column, guarded so it may
  only be set when `worker_type = 'contractor'` AND the contractor
  belongs to the SAME organisation.
- **The access gate (`contractor_worker_access()`) never re-implements
  Safe to Deploy or contractor currency** — it calls
  `person_deployment_status()` (136, the ONE public read of the
  cache-or-live engine — Phase 3's standing rule: "Never call the raw
  engine from a public read") and `contractor_is_current()` (150) and
  combines the two. It computes no new deterministic fact of its own
  beyond "both of these are true" — no AI, no scoring.
- **Induction and RAMS are deliberately NOT separate checks here.** An
  induction requirement is modelled as an ordinary Phase 3
  `role_requirement` (`requirement_type = 'induction'`), so it is
  ALREADY inside the Safe to Deploy calculation for anyone it applies
  to — a second check here would either duplicate it or silently
  disagree. RAMS/permit-specific gating is Group 9's job (a permit's
  own compliance re-check AT ISSUE) — this gate answers "may this
  worker be on site at all", not "may they do this specific task".
- **Refuses (never merely omits) a person the caller may not see** —
  `person_visible()` is checked FIRST, before anything about the
  person is touched, matching `person_deployment_status()`'s own
  defensive order exactly.
- **`people`'s `audit_row` whitelist was last redefined by 132, not
  118** — checked, not assumed, per this codebase's own "latest
  definition wins" rule for every re-created trigger. Re-emitted with
  132's exact list plus `contractor_id`.

**Live probe** (`151_contractor_workers_access_gate.sql`, rolled back,
under a simulated staff session since `person_visible()` needs one): 7
checks — a contractor worker may link to a same-org contractor;
non-contractor `worker_type` with a `contractor_id` refused;
cross-company contractor link refused; a contractor worker with no
link is refused with a clear reason; an ordinary employee is refused
via this contractor-specific gate; a linked worker whose contractor is
current AND whose Safe to Deploy status is genuinely `READY` (an
active role with zero requirements, added after the first run showed a
person with NO role at all reads `REVIEW_REQUIRED` — the engine's own
safe default, not a Group 8 fact) gets access GRANTED; suspending the
contractor flips it back to refused, re-checked live rather than
cached. All 7 passed.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1120 admin, 600 portal, unchanged — this migration touched no TS),
all five CI guards pass, admin production build compiles.

### Group 9: permit to work (migration 152)

A permit is issued for a scope of work at a SITE, optionally against a
specific ASSET, covering one or more PEOPLE. `permit_templates` are
**per-company**, unlike `inspection_templates`/`hs_audit_templates`
(global staff reference data) — a template names a required
`authorisation_type_id`, and `authorisation_types` (133) is itself
per-organisation with no global seed, so a global permit template
could never name a real authorisation type to check against.

- **`person_holds_authorisation(person, type, site, as_of)` is a
  genuinely new helper** — the Phase 3 handover's own "not yet done"
  list named this exact gap. It checks `scope_site_id` only:
  `authorisation_types` has no `scope_asset_id` column despite
  `scope_kind` allowing `'plant'`/`'equipment'` — a real Phase 3 schema
  gap, called out in the migration's own header rather than silently
  assumed away, not fixed here.
- **Numbering is `PTW-YYYY-NNNNNN`** via `next_record_number()` (122) —
  six digits, matching every other numbered record in this codebase
  (asset refs, Group 2), not the plan's own five-digit prose example.
- **The live compliance re-check runs at ISSUE and again at
  REVALIDATION, never skipped just because a suspension is being
  lifted.** `permits_lifecycle_guard()` (BEFORE UPDATE) checks: the
  asset (if any) is not quarantined; every person already added to the
  permit (`permit_people`, editable only while `draft`) is Safe to
  Deploy via `person_deployment_status()` (136) — never
  re-implemented; the authorising person holds the template's required
  authorisation at the permit's site, if one is named. A suspension may
  have existed for exactly the reason this check would catch, so
  revalidation runs the identical checks as a first issue, never a
  bare flag flip — proven live: quarantining the asset blocks
  revalidation exactly as it blocks a first issue.
- **Validity is SERVER TIME throughout.** `valid_from`/`valid_until`
  are `timestamptz`; `permit_is_currently_valid()` compares against
  `now()`, never a client-supplied "still valid" flag.
- **The lifecycle is a strict state machine, not a free status field**:
  `draft → issued` (stamps `issued_by/at`, defaults `valid_until` from
  the template's `default_validity_hours`, or 8h); `issued ⇄ suspended`
  (requires a reason); `suspended → issued` (revalidation, re-runs the
  full check, clears suspension fields); `issued/suspended → closed`
  (requires closeout notes); any non-terminal status `→ revoked`
  (requires a reason). Every other transition is refused. `permit_people`
  can only be added while `draft` — once issued, who is covered is
  frozen.
- **RLS reuses `contractors.manage`** for all management access on
  templates/permits/people/checklist responses, rather than inventing
  `permits.manage` for one more variant of "may manage site safety
  records" — a permit is issued FOR a contractor/employee's work, the
  same management act as approving the contractor itself.
- **Outbox + audit + notifications follow the Group 7 precedent
  exactly**: `permits` joins `TRIGGERED_ENTITIES` (whitelist:
  `permit_number, template_id, site_id, asset_id, status, valid_from,
  valid_until` — never `scope_of_work`, `closeout_notes` or any reason
  field) and `REMINDER_ENTITIES` (an issued permit approaching its own
  `valid_until`, `due_0`/`overdue` only — a permit's whole point is a
  short, bounded window, so a 30/7-day warning would be noise for most
  permit types). Both new rules (`permit_status_changed` on
  suspend/revoke, `permit_reminder` on expiry) are **STAFF-ONLY for
  now**, the identical reasoning `contractor_status_changed`/
  `contractor_insurance_reminder` already carry: permits have no portal
  page yet (Group 13 builds it) — widen to `admins()` once that page
  exists, rather than inventing a link to nowhere.

**Live probe** (`152_permit_to_work.sql`, rolled back, the ENTIRE
exercised sequence under one simulated staff session — not just around
bare function calls: the lifecycle guard's `person_deployment_status()`/
`person_visible()` calls need a real `auth.uid()` whenever the trigger
fires from an ordinary UPDATE, which the first draft of this probe
missed and caught as `42501 You cannot see this person` on a bare
service-role UPDATE with no session). 22 checks: template numbering +
same-org authorisation-type guard; permit number format; cross-org
site refused; `permit_people` insertable while draft;
`person_holds_authorisation` false with none on file, true once
granted; issue refused without the authorising person's authorisation;
issue refused with a non-`READY` person on the permit (a person with no
role at all); issue succeeds once both blockers clear, stamping
`valid_from`/`valid_until`; `permit_is_currently_valid` true right
after issue; `permit_people` refused once issued; suspend refused
without a reason, succeeds with one; `permit_is_currently_valid` false
while suspended; revalidation refused with a quarantined asset (proving
the SAME check runs, not a bare flag flip), succeeds once cleared and
clears suspension fields; close refused without notes, succeeds with
them; revoke refused from a closed (terminal) permit; revoke refused
without a reason from draft, succeeds with one. All 22 passed.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1124 admin — 1120 + 4 new: 2 `hsRules.test.ts` cases and 2
`vocab.test.ts` cases pinning `PERMIT_TYPES`/`PERMIT_STATUSES`, plus the
generic reminder/rule coverage tests picking up `permits` automatically
with no new test count; 600 portal, unchanged — this group touched
only the shared-dupe vocab/notify files, byte-identical to admin's),
all five CI guards pass, both production builds compile.

### Group 10: isolation / lockout-tag-out (migration 153)

An isolation de-energises ONE energy source on an asset (electrical,
mechanical, hydraulic, pneumatic, thermal, chemical, other). Optionally
linked to a `permits` row (a permit to work often requires an isolation
first) but not a hard dependency — `permit_id` is nullable.

- **`isolation_locks` is the GROUP/multi-lock layer**: a single job may
  need several workers each applying their own personal lock to the
  same isolation point, and the asset may not be re-energised until
  EVERY lock is cleared by its own owner — never by whoever happens to
  be doing the paperwork. `UNIQUE (isolation_id, person_id)` — one lock
  per worker per isolation.
- **Removing someone else's lock needs a recorded, authorised
  override** — a real LOTO scenario (a worker off site, unreachable),
  never silent and never self-authorised: the override needs a reason
  AND an authorising person who is NOT the one doing the removing.
- **Verification by another person is a hard rule, twice over** — the
  same "nobody approves their own work" posture Phase 2's guards
  already apply: the person who verifies an isolation is effective
  must not be the person who applied it, and the person who verifies
  it is safe to remove must not be the person who removed it. Both
  enforced by `isolations_lifecycle_guard()` (BEFORE UPDATE), not the
  UI.
- **Lifecycle is `applied → verified → removed`**, strict: removal is
  refused while ANY personal lock is still open (checked with a live
  `count(*)` against `isolation_locks`, not a cached flag), and any
  other transition — including backwards — is refused outright.
- **Asset availability is `out_of_service`, never `quarantined`.**
  Quarantine (Group 4) is reserved for a safety DEFECT — a different
  concern with a different meaning; isolation is a planned, controlled
  unavailability. Applying an isolation moves an `in_service` asset to
  `out_of_service`; removing the LAST open isolation on that asset
  restores it — but ONLY from `out_of_service`, so a `quarantined` or
  `decommissioned` asset is never silently reopened by an isolation
  clearing. Proven live: with two isolations open on one asset,
  clearing the first leaves it `out_of_service` (the second is still
  open); clearing the second restores `in_service`.
- **RLS reuses `contractors.manage`** — same "one more variant of
  managing site safety records" reasoning as Group 9's permits, no new
  capability invented.
- **No REMINDER_ENTITIES entry.** An open isolation has no due date of
  its own to remind against — unlike a permit's bounded `valid_until`,
  an isolation is meant to be cleared promptly, not on a schedule.
  Only `isolations` joins `TRIGGERED_ENTITIES`, for the one
  `isolation_applied` notification (STAFF-ONLY, same reasoning as
  Groups 7-9 — no portal page yet).

**Live probe** (`153_isolation_loto.sql`, rolled back, the entire
sequence under one simulated staff session, the same lesson 152's own
probe learned): 16 checks — apply moves the asset to `out_of_service`;
two personal locks added; self-verification refused, a different
verifier succeeds; removal refused while locks are open; removing
another's lock with no override refused, self-authorised override
refused, a properly authorised override (different remover AND
authoriser) succeeds; a worker's own self-removal succeeds; removal
with the same remover/verifier refused, a different verifier succeeds
and restores the asset to `in_service`; no lock addable after removal;
a backwards transition refused; and the two-isolations-on-one-asset
case — the asset stays `out_of_service` after the first clears (a
probe bug initially left `iso2` from an earlier check open on the SAME
asset, correctly blocking restoration — fixed by isolating that check
to its own asset, not a migration defect) and is restored only once
the LAST one clears. All 16 passed.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1127 admin — 1124 + 3 new: 1 `hsRules.test.ts` case, 2 `vocab.test.ts`
cases pinning `ISOLATION_TYPES`/`ISOLATION_STATUSES`; 600 portal,
unchanged — this group touched only the shared-dupe vocab/notify
files), all five CI guards pass, both production builds compile.

### Group 11: emergency planning (migration 154)

`emergency_plans` reuses `hs_documents`' own versioning DISCIPLINE
(106), not the table itself: a plan needs structure `hs_documents` was
never built for — required roles and linked equipment — so bolting
those onto the generic document library would have widened its purpose
past "metadata for a file". The discipline is copied verbatim: a new
version is a new ROW (`emergency_plans_stamp`), never an edit; the old
row flips to `'superseded'` via its own UPDATE, firing the Safety
Timeline entry (`emergency_plans_event`, mirroring `hs_document_event`
exactly).

- **`emergency_plan_roles` links to the Phase 3 authorisation
  catalogue** (e.g. "Fire Warden", "First Aider") with a minimum
  headcount — never a duplicate competency system. Who currently holds
  that authorisation is read LIVE from `person_authorisations` (the
  same table Group 9's `person_holds_authorisation()` already reads),
  never stored here.
- **`emergency_plan_equipment` is a plain linking table** to
  `hs_equipment` (fire extinguishers, muster-point kit,
  defibrillators) — no new equipment concept.
- **`emergency_drills` is insert-only**, the register's own "a
  correction is a new row" discipline (`hs_register_completions`/
  `hs_audits`). **Drill findings are NEVER a second table**: an
  `outcome` of `'issues_found'` or `'failed'` raises exactly ONE row on
  the EXISTING `actions` table (`hsRules.ts`'s `emergency_drill_recorded`
  rule, the identical shape `hs_check_failed` already uses) — never one
  action per individual finding, the same notification-storm avoidance
  the on-site-audit engine (110) already established. A `'successful'`
  drill raises nothing.
- **RLS on every new table is staff-write / client-read-only** — the
  exact `hs_activities`/`hs_register_completions` shape. Nothing about
  emergency planning is self-certified by a client, matching the
  standing H&S posture since Phase 1b.
- **`emergency_drill_recorded` notifies the client via the PORTAL,
  unlike Groups 7-10's staff-only notifications** — because unlike
  contractors/permits/isolations, its consequence lands on `actions`,
  and `/protect/actions` already exists as a real portal page. This is
  the one Phase 4 Group 7+ rule that could safely use `admins()` from
  day one.

**Live probe** (`154_emergency_planning.sql`, rolled back, simulated
staff session): 14 checks — plan v1 created at version 1; cross-org
site refused; a required role links to the authorisation catalogue,
cross-org authorisation type refused; linked equipment added, cross-org
asset refused; a new version (v2) created referencing v1 via
`supersedes_id`; flipping v1 to `'superseded'` succeeds and both
`plan_added`/`plan_superseded` Safety Timeline entries exist; a drill
recorded against the plan; the drill cannot be UPDATEd or DELETEd
(insert-only); a drill against a DIFFERENT company's plan refused; and
exactly ONE Safety Timeline entry for the drill (never one per
finding). All 14 passed.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1133 admin — 1127 + 6 new: 3 `hsRules.test.ts` cases and 3
`vocab.test.ts` cases pinning `EMERGENCY_PLAN_TYPES`/
`EMERGENCY_PLAN_STATUSES`/`EMERGENCY_DRILL_OUTCOMES`; 600 portal,
unchanged — this group touched only the shared-dupe vocab/notify
files), all five CI guards pass, both production builds compile.

### Group 12: notifications / audit / platform_events wiring sweep

A completeness pass across Groups 2-11, the same discipline as the
2026-09-26 "sanity-check sweep" — auditing every `TRIGGERED_ENTITIES`
table against `hsRules.ts`/`rules.ts` for a consuming rule, and every
new `SECURITY DEFINER` function for its `REVOKE ALL` grant.

**Two real gaps found and fixed** (a table had a trigger, but the only
consequence was a reminder — no rule reacted to the row itself being
created):

- **`puwer_assessments.created` told nobody.** A non-compliant or
  compliant-with-actions outcome sat silently until the NEXT scheduled
  review reminder, sometimes months later. New rule
  `puwer_non_compliant` raises exactly ONE action (`hs_puwer_finding`,
  the identical `hs_check_failed` shape) and notifies the client via
  the portal actions link (which already exists) plus staff. Neutral
  wording throughout — "recorded assessment outcome", never a
  compliance judgement, the same discipline `PUWER_ASSESSMENT_OUTCOME_LABELS`
  already applies. A `'compliant'` outcome still raises nothing.
- **`emergency_plans.created` told nobody.** A new plan (or a
  superseding version) landed with no signal beyond the Safety Timeline
  entry and the eventual review-due reminder. New rule
  `emergency_plan_added` tells staff (no portal page yet, same
  reasoning as every other Phase 4 Group 7+ table) — a supersede
  raises nothing separately, since the new version's own `.created`
  already covers it (the identical reasoning `hs_document_added`
  already established for the same versioning shape).

**Everything else audited clean**: every other Phase 4 `TRIGGERED_ENTITIES`
table (`inspections`, `hs_equipment_inspections`, `contractors`,
`permits`, `isolations`, `emergency_drills`) already had a consuming
rule from its own group. Every new `SECURITY DEFINER` function across
migrations 144-154 was checked live via `has_function_privilege()`
against `anon`/`authenticated` — every trigger-only guard function
correctly has NO execute grant to either role; the three functions
meant to be called directly by a session (`contractor_is_current`,
`contractor_worker_access`, `hs_quarantine_asset`, plus 152's
`person_holds_authorisation`/`permit_is_currently_valid` verified in
Group 9) correctly grant `authenticated` only, never `anon`.
`contractor_insurances`/`permit_people`/`permit_templates`/
`emergency_plan_roles`/`emergency_plan_equipment` deliberately have NO
generic `audit_row` trigger of their own — confirmed against 150's own
header comment: the audit trail lives on the PARENT record
(`contractors`, `permits`, `emergency_plans`), the same "one Safety
Timeline / audit line per meaningful record, not per sub-row" rule
`hs_audit_responses` and `permit_checklist_responses` already
established.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1137 admin — 1133 + 4 new `hsRules.test.ts` cases covering both new
rules and their non-firing paths; 600 portal, unchanged — this sweep
touched only the shared-dupe notify files), all five CI guards pass,
both production builds compile.

### Group 13: admin + portal UI (2026-09-28)

The last built-out piece before Group 14's own regression/QA/handover
pass: screens for the four Phase 4 groups that had shipped with a
schema, RLS and consequence rules but no way for a person to actually
use them — contractors (Group 7), permits to work (Group 9),
isolation/LOTO (Group 10) and emergency planning (Group 11). Group 7's
own migration comment had named the gap explicitly ("staff-only for
now, no portal page yet") — this closes it for the one table that
genuinely has a client-read policy.

- **Every write attempts the UPDATE and shows whatever the trigger
  refuses, never a client-side pre-check.** Permits' issue/suspend/
  revalidate/close/revoke and isolations' verify/remove buttons call
  the exact database guards documented under Groups 9 and 10
  (`permits_lifecycle_guard`, `isolations_lifecycle_guard`,
  `isolation_locks_guard`) with no UI-side validation duplicating
  them — "the authorising person does not hold the required
  authorisation" or "every personal lock must be removed by its own
  owner" are the trigger's own Postgres error messages, surfaced as a
  toast verbatim. This is the same posture every H&S workflow guard in
  this file already takes: the database is the boundary, the page only
  asks.
- **Every status-changing UPDATE uses `COUNT_EXACT` + `judgeWrite()`
  from the start** (contractor approval/risk, permit lifecycle,
  isolation verify/remove, isolation-lock removal, emergency plan
  supersession) — `check-blind-updates.sh`'s ratchet did not move
  (102, unchanged) because every new write path was built counted, not
  retrofitted after the guard caught it, the same discipline the
  Documents-versioning UPDATE (Phase 2/H&S Phase 2) already established.
- **Insurance renewal is an `upsert` on `(contractor_id,
  insurance_type)`, not a `select`-then-`update`/`insert` branch** — the
  UNIQUE constraint from Group 7's own migration is the thing that makes
  "record or renew" a single form with no separate renewal flow to get
  out of sync with the create flow.
- **A new emergency plan version is two writes, in the documented
  order**: insert the new row first (with `supersedes_id` pointing at
  the old one), then update the old row to `superseded` — never the
  reverse, which would leave a client's Register momentarily showing no
  active plan of that type if the insert then failed. Mirrors
  `hs_documents`' own versioning discipline exactly, as Group 11's
  migration comment says to.
- **Isolation locks and permit people are scoped by the parent's own
  lifecycle, not by a separate check on the page.** People can only be
  added to a permit while it is `draft` (the UI hides the add-person
  form once issued, but the real refusal is `permit_people_guard`'s own
  "still a draft" check); a lock's owner-vs-override distinction is
  read straight off whether the picked "removed by" person differs from
  the lock's own `person_id` — no separate "is this an override" toggle
  to get out of sync with what the trigger will actually accept.
- **Permit checklist responses (`permit_checklist_responses`) were
  deliberately left out**, per the task's own scope note — the core
  lifecycle (draft → issued → suspended → closed/revoked, people,
  authorisation and asset-quarantine checks) is what the notifications
  from Groups 9-11 needed a page to link to; a checklist sub-feature
  with no consumer yet would have been scope invented to look complete,
  the same trap Group 7's own migration comment warns against for a
  numeric contractor "prequalification score."
- **Contractors, permits and isolations stay admin-only.** None of the
  three has a plain client-read RLS policy — only `contractors.manage`-
  capability-gated management, which is a staff/consultancy act, not a
  client one — so a portal page for any of them would either need a
  capability-aware page (out of scope here) or would silently render
  empty for every client without that capability. Emergency plans DO
  have a genuine `..._client_read` policy on all four of its tables (Group
  11's own design: "nothing about emergency planning is self-certified,"
  read-only for the client by construction), so that one page is real,
  reachable from `/protect`'s `SectionTabs`, and gated by `protect`
  alone — the same posture Register/Documents/Audits/Equipment already
  have.
- **`admin/src/lib/hs/types.ts` picked up eleven new row-shape
  interfaces** (`Contractor`, `ContractorInsurance`, `PermitTemplate`,
  `Permit`, `PermitPerson`, `Isolation`, `IsolationLock`,
  `EmergencyPlan`, `EmergencyPlanRole`, `EmergencyPlanEquipment`,
  `EmergencyDrill`), mirrored byte-identical to the portal copy
  immediately (`types.ts` is one of the shared-dupe pairs,
  `scripts/check-shared-dupes.sh`) — `vocab.ts` needed no edit at all,
  since every vocabulary tuple this group's forms use (`PERMIT_TYPES`,
  `ISOLATION_TYPES`, `EMERGENCY_PLAN_TYPES`, `EMERGENCY_DRILL_OUTCOMES`,
  `CONTRACTOR_APPROVAL_STATUSES`, …) had already been seeded by their
  own migrations' groups.
- **No new sidebar entry needed.** All four new admin routes nest under
  the already-linked `/health-safety` top-level sidebar entry
  (`check-admin-routes-linked.sh` matches on path prefix), the identical
  precedent the `audits/[auditId]` detail page set in an earlier group —
  they only needed a `HsCompanyTabs.tsx` tab each.
- **A row-cap violation was caught and fixed by the guard doing its
  job, not by review**: the first draft of the portal emergency-plans
  page used `.limit(1000)` on two tables, which `check-row-cap.sh`
  correctly flags as indistinguishable from an unbounded read at the
  PostgREST cap boundary — lowered to 500, matching the page's other
  reads. The admin equivalent read `emergency_plan_roles`/
  `emergency_plan_equipment` with `readAllPages()` but with NO scoping
  filter at all in the first draft — functionally safe only because
  every other read on the page happened to filter by `plan_id` client-
  side afterward, but wasteful and not the pattern this codebase uses
  elsewhere; fixed to fetch plan ids first, then `.in('plan_id',
  planIds)` for both, the same "fetch by id list, never blind" shape
  the referral PATCH route and the H&S test-logging routes already
  established.

Verified: `tsc --noEmit` clean on both apps, full `vitest run` green
(1138 admin, 111 test files; 602 portal, 39 test files — this group
added no new test files, since it is pure UI over triggers/RLS already
covered by each migration's own live probe), all five CI guards pass
(`check-admin-routes-linked.sh`: 60 admin pages, all reachable;
`check-blind-updates.sh`: 102 blind UPDATE chains, unchanged), both
production builds compile, including all four new admin routes
(`/health-safety/<companyId>/{contractors,permits,isolations,
emergency-plans}`) and the new portal route (`/protect/emergency-plans`).

### Group 14: final regression, security review, handover, gate (2026-09-28, migration 155)

Full handover + QA report: `docs/CORE_OS_360_PHASE4_HANDOVER.md`.
**Gate: PASS WITH MINOR ISSUES.**

An independent adversarial security review (the same brief shape as
Phase 3's QA 42) was run across every table and function created in
migrations 144-154, plus the Group 13 UI, with every candidate finding
required to be reproduced LIVE before being reported. It found one
Medium and one Low:

- **[Medium, fixed] A permit could be issued naming the ISSUING PERSON
  as its own `authorised_person_id`.** `isolations_lifecycle_guard()`/
  `isolation_locks_guard()` (153) both enforce "nobody approves their
  own work"; `permits_lifecycle_guard()` (152) checked only that the
  authorising person HELD the required authorisation, never that they
  were not the acting session itself. Reproduced live: a permit
  template with no required authorisation, `authorised_person_id` set
  to a `people` row whose `user_id` matched the acting session, issued
  cleanly with no exception. **Fixed by migration 155**: the issue/
  revalidate branch now refuses when `authorised_person_id` resolves
  (via `people.user_id`) to `auth.uid()` — fires only when the acting
  session is itself linked to a `people` row, so staff administering
  the record on a contractor's behalf are never blocked. Re-proved
  refused live (`supabase/probes/155_*.sql`, 2/2): the self-authorised
  case is refused with the exact message; a genuinely different
  authorising person still issues normally.
- **[Low, fixed same day] The portal's `/protect/emergency-plans` page
  read `emergency_plan_roles`/`emergency_plan_equipment` with no
  `company_id`/`plan_id` filter, relying entirely on RLS** — confirmed
  live that RLS already scoped both correctly (no cross-tenant leak
  existed), but every sibling query on the same page carries an
  explicit filter and these two didn't. Fixed by fetching the
  company's own `emergency_plans` first, then filtering both queries
  with `.in('plan_id', planIds)` — the same "fetch an id list first"
  shape `equipment/page.tsx` already uses for its inspection-evidence
  join.

**Everything else the review checked came back clean** (full list in
the handover doc): RLS enabled and `authenticated`-only on every new
table; the Group 4 `inspection.perform` capability fix confirmed live,
not just on disk; `contractors.manage`'s reuse across contractors/
permits/isolations reasoned through and judged a reasonable design
choice given the trusted role population that actually holds it; every
cross-organisation FK guarded, with a cross-org `isolations.applied_by`
insert reproduced refused; no Phase 4 `SECURITY DEFINER` function
executable by `anon`; the isolation self-verification checks correctly
scoped; `emergency_drills`/`inspections`/`inspection_responses`
insert-only enforcement confirmed live via `information_schema.
table_privileges`, not just the migration's `REVOKE` text; every
Group 13 `.update(` pairs `COUNT_EXACT` with `judgeWrite`.

Verified after both fixes: `tsc --noEmit` clean both apps, full
`vitest run` green (1138 admin, 602 portal — unchanged from Group 13,
since the fixes touched a DB function and a portal page's query shape,
not tested TypeScript logic), all five CI guards pass, both production
builds compile. Migration 155 applied and verified live (function
re-created, `REVOKE ALL` confirmed via `has_function_privilege`).

**Phase 4 is complete. Phase 5 is not to begin** until this branch is
merged and deployed, per the operator's instruction.

---

## Core-OS 360 Phase 5, Group 1: Governance Map + Environmental Aspects
## & Impacts (2026-09-29, migration 156)

Phase 5 turns Core-OS 360 into a full EHS management system
(Environmental Management, ISO 45001/14001 support, Legal Register,
Compliance Obligations, Controlled Documents, Objectives & Targets,
Management Review, Governance, Audit Evidence, Environmental Aspects/
Impacts, Waste, Spills, Emissions, Water, Energy, Environmental
Permits, Environmental Incidents), delivered in the same logical,
independently-verified groups as Phase 4. **Group 1 is this PR**: the
governance map every later group must read first, and the Environmental
Aspects & Impacts subsystem itself.

### Governance map: `docs/CORE_OS_360_PHASE5_GOVERNANCE_MAP.md`

Classifies every existing EHS-relevant component (register,
`hs_documents`, `hs_audits`, `hs_incidents`, the asset register,
contractors, policy acknowledgements, `latest_updates`/regulatory
classification, `actions`, Broadcast, value reports, `platform_events`/
notify, Phase 1's organisations/capabilities model) as REUSE / EXTEND /
MIGRATE / DEPRECATE / REPLACE. **No REPLACE anywhere** — every
component is REUSE or EXTEND, consistent with the platform-wide rule
this codebase has followed since Phase 4's own existing-operations
audit. It also records three decisions binding on later Phase 5
groups: Environmental Aspects lives under the existing
`/health-safety/<companyId>/environmental-aspects` tab (a 13th
`HsCompanyTabs.tsx` entry), not a new top-level sidebar group; the
portal page is gated by `protect` alone, not a new flag; and the
vocabulary lives in the existing `lib/hs/vocab.ts` shared-dupe pair.
Read it before touching any related code in a later group.

### Environmental Aspects & Impacts (migration 156)

An "aspect" is an element of an activity that can interact with the
environment (e.g. "diesel generator run during power cuts" → aspect
type `emissions_to_air`); its "impact" is what actually happens as a
result. This schema records the aspect and scores its SIGNIFICANCE —
never its legal compliance.

- **No black-box AI significance scoring, absolute rule.**
  `environmental_aspect_assessments` stores three named, inspectable
  1-5 integer criteria (`likelihood`, `severity`, `frequency`);
  `computed_score` is `GENERATED ALWAYS AS (likelihood * severity *
  frequency) STORED` — deterministic, never computed in application
  code where it could drift from what is stored. Jev is never invoked
  anywhere in this subsystem, and no later Phase 5 group may change
  that without an explicit product decision recorded here first.
- **The database refuses an unconfirmed significance decision, not
  just the UI.** `environmental_aspect_assessments_fill()` (BEFORE
  INSERT) raises unless BOTH `confirmed_by` and `confirmed_at` are set
  — regardless of which way `is_significant` points. An unconfirmed row
  is not yet a decision, so allowing `is_significant` on one would be
  exactly the "the platform decided" shape this rule forbids, whichever
  way it points. Probed live both directions (checks 4 and 4c).
- **History is preserved exactly like `hs_documents` (106) and
  `emergency_plans` (154): a material change is a NEW ROW.** The old
  row flips to `'superseded'` via its own UPDATE; both remain
  individually readable forever. `environmental_aspects_stamp()`
  refuses a cross-organisation `supersedes_id` the same way
  `emergency_plans_stamp()` already does.
- **The newest confirmed assessment — and ONLY that — decides the
  aspect's status.** `environmental_aspect_assessments_roll()` (AFTER
  INSERT) sets `status` to `confirmed_significant` /
  `confirmed_not_significant`, skipping a `superseded` row so an old
  version's status can never be resurrected by a late assessment
  insert. Assessments are insert-only (`REVOKE UPDATE, DELETE,
  TRUNCATE`) — a correction is a new assessment, never an edit.
- **Never a second action table (rule 1).** A confirmed-significant
  aspect raises exactly one `actions` row
  (`action_type: 'environmental_significant_aspect'`,
  `source_type: 'environmental_aspect'` — a new value 156 added to the
  shared `actions_source_type_check`), keyed
  `environmental_aspect:<id>` so a re-processed event never raises two.
  `admin/src/lib/events/environmentalRules.ts` is its OWN file, not
  folded into `hsRules.ts` — Environmental is its own EHS pillar
  alongside H&S, the same call `leadRules.ts`/`hireRules.ts`/
  `supportRules.ts` already made for their own pillars. It tells the
  client admins (portal link `/protect/environmental-aspects`) and
  staff (`/health-safety/<companyId>/environmental-aspects`) — never
  decides anything itself, only reports what the database's own roll
  trigger already decided.
- **Evidence rides the existing `hs_files`/`hs-evidence` infrastructure**:
  `hs_scope_for_entity()`/`hs_entity_table()`/`hs_evidence_readable()`/
  `hs_evidence_writable()`/`hs_files_entity_check()` all gain an
  `'environmental_aspect'` branch (scope `register`, gated on new
  capabilities `environmental.read`/`environmental.manage`) — the exact
  pattern Group 2's `'equipment'` branch (144) and Group 3's
  `'inspection'` branch (145) already established in Phase 4. No new
  bucket, no new evidence table.
- **Capabilities seeded in the literal `('capability', ARRAY[roles])`
  shape**, copying `risk.read`/`risk.create`'s role list verbatim (the
  same choice Group 2's `asset.read`/`asset.manage` made) — never a
  dynamic `SELECT ... FROM access_role_capabilities` grant, which
  `tenancySql.test.ts`'s regex-driven TS↔SQL parity check cannot parse
  (the 144a/147a trap this file's own history records twice already).
  `capabilities.ts` (shared-dupe pair) mirrors it in the same PR, with
  a new `ENV_ALL` constant following `ASSET_ALL`'s own pattern.
- **RLS, write guard, audit trail**: staff full access;
  `environmental.read`/`environmental.manage` govern client access on
  both new tables; `apply_write_guard()` on both (a read-only
  consultancy grant can insert nothing); `audit_row()` whitelists
  identifying/classifying columns only (`activity`, `aspect_type`,
  `condition`, `status`, `version` on the aspect; `aspect_id`,
  `computed_score`, `is_significant` on the assessment) — never
  `description`/`methodology_notes`.
- **Outbox**: `environmental_aspects` joins `TRIGGERED_ENTITIES`
  (whitelist `site_id, aspect_type, condition, status` — never
  `description`). `environmental_aspect_assessments` is deliberately
  NOT in the outbox — the aspect's own `.updated` event (fired when the
  roll trigger changes its status) is the one thing worth reacting to,
  the same "one event per meaningful record, not per sub-row" rule
  `hs_audit_responses`/`permit_checklist_responses` already established.

### Admin + portal UI

Admin: a 13th `HsCompanyTabs.tsx` tab,
`/health-safety/<companyId>/environmental-aspects`
(`EnvironmentalAspectsClient.tsx`) — add an aspect, then "Assess
significance" opens a form showing the live computed score against the
chosen threshold BEFORE submission, with a mandatory confirmation
checkbox; the insert fails outright if the checkbox is unchecked and
the caller tries to bypass it client-side, because the database's own
gate (above) enforces it regardless. No new sidebar entry needed — it
nests under the already-linked `/health-safety` prefix. Portal: a
read-only `/protect/environmental-aspects` page, gated by `protect`
alone (nothing here is self-certified, the same posture Register/
Documents/Audits/Equipment/Emergency Plans already have), linked from
`/protect`'s own `SectionTabs`.

### Live probe

`supabase/probes/156_environmental_aspects.sql`, rolled back: 13
checks — cross-organisation site refused; an aspect inserts with
`status = draft`; evidence vocab resolves; an unconfirmed significant
assessment refused; an unconfirmed non-significant assessment ALSO
refused (the gate is about being a decision at all, not its polarity);
a confirmed assessment accepted with `computed_score = likelihood x
severity x frequency` (4×4×3 = 48) and rolls the aspect to
`confirmed_significant`; assessments table has no UPDATE/DELETE grant
to `authenticated`; a new version is a new row, the old row supersedes,
both remain readable; a cross-organisation `supersedes_id` refused;
`actions.source_type` allows `'environmental_aspect'`; the write guard
is applied to both tables; both capabilities are seeded and granted;
RLS is enabled on both tables; no Group 1 `SECURITY DEFINER` function
is executable by `anon`. All 13 passed.

### Verified

`tsc --noEmit` clean both apps, full `vitest run` green (1145 admin —
1138 + 4 `environmentalRules.test.ts` + 3 new `vocab.test.ts` it.each
cases for the aspect type/condition/status tuples; 604 portal — 602 +
2, `moduleAccess.test.ts`/`portalPagesLinked.test.ts` picking up
`/protect/environmental-aspects` automatically), all five CI guards
pass (`check-shared-dupes.sh`: 43 pairs, unchanged;
`check-admin-routes-linked.sh`: 61 pages, all reachable;
`check-blind-updates.sh`: 102, unchanged — this group made no UPDATE
writes from a client component, only inserts), both production builds
compile, including the new `/health-safety/<companyId>/environmental-
aspects` admin route and the new `/protect/environmental-aspects`
portal route. Migration 156 applied live and verified (RLS on, write
guard applied, capabilities seeded and granted, evidence vocab
resolves, no Group 1 DEFINER function executable by `anon`).

**Later Phase 5 groups** (environmental incidents/waste/spills/
monitoring/permits, the ISO 45001/14001 framework layer, the legal
register, document control, objectives & targets, management review,
audit-engine enhancement, UI, final QA) build on migration 156 onward
and should read the governance map first.

### Core-OS 360 Phase 5, Group 2: Environmental Incidents, Spills,
### Waste, Monitoring, Environmental Permits & Conditions (2026-09-29,
### migration 157)

Builds on Group 1 per the governance map. Read `docs/CORE_OS_360_
PHASE5_GOVERNANCE_MAP.md` before touching this — it commits the same
"REUSE/EXTEND, never a parallel system" discipline this group follows.

- **Environmental incidents already existed — checked live before
  writing a line of SQL.** `hs_incidents.incident_type` (125) already
  includes `'environmental'`, so tagging an incident as environmental
  needed NO ADD COLUMN or enum change. What was missing was
  environmental-specific DETAIL (substance, volume, receiving
  environment), added as `environmental_incident_details` — one row
  per `hs_incidents.id`, never a parallel incident table.
- **Never a second action table (standing rule 1).** Four new
  `actions.source_type` values: `environmental_spill`,
  `waste_movement`, `environmental_monitoring`,
  `environmental_permit_condition`. A non-contained spill, a waste
  non-conformance, a monitoring exceedance and a permit condition
  moved to `breach_recorded`/`review_required` each raise exactly one
  keyed `actions` row via `admin/src/lib/events/environmentalRules.ts`
  (extended, not forked) — never a second findings table.
- **Waste carriers/disposal sites are `contractors` rows (150) —
  never a parallel supplier table.** `waste_movements.carrier_
  contractor_id`/`disposal_site_contractor_id` FK straight to
  `contractors`. The only schema change needed was one new
  `contractor_insurances.insurance_type` value,
  `'waste_carrier_licence'` — `contractor_is_current()` (150) already
  fails currency on ANY on-file policy past its expiry, not only the
  two required ones, so an expired waste-carrier licence surfaces
  correctly with **no function change at all**. Proved live in the
  probe (check 11).
- **`environmental_monitoring.within_limit` is a database-GENERATED
  column, computed ONLY when `recorded_limit` is on file — never
  defaulted true or false.** `GENERATED ALWAYS AS (CASE WHEN
  recorded_limit IS NULL THEN NULL ELSE (value <= recorded_limit) END)
  STORED`. This assumes an UPPER-bound limit (the common case: max
  noise dB, max effluent load) — a lower-bound limit (e.g. minimum
  flow rate) is a documented, known gap for a later group, not
  silently guessed at. The table is insert-only (a correction is a new
  reading, never an edit), the same "correction is a new row"
  discipline the register's other evidence tables already use.
- **`permit_conditions.status` is a FACTUAL vocabulary, never a
  compliance verdict**: `current | evidence_due | overdue |
  breach_recorded | review_required`. Copies PUWER's own "recorded
  assessment outcome, never legally compliant" discipline (148) —
  the probe (check 7) proves the CHECK itself refuses a
  `'compliant'`/`'non_compliant'` value, so this cannot regress
  silently. `environmental_permits.status` is a separate, genuinely
  lifecycle fact (`active | expired | surrendered | revoked`) — the
  permit's own status, distinct from any one condition's.
- **Environmental permits are their own table, deliberately NOT
  attached to `contractors` or to H&S's `permits` (152).** `permits`
  is Health & Safety's permit-TO-WORK — a time-bounded authorisation
  for one job; `environmental_permits` is a regulator's ongoing
  licence to operate (e.g. an Environmental Permitting Regulations
  permit, a discharge consent). Different concept, different table,
  different admin tab (`environmental-permits`, distinct from the
  existing `permits` tab), by design.
- **Capabilities are reused, not invented.** `environmental.read`/
  `environmental.manage` (156) govern all five new client-writable
  tables — no new capability grant needed for this group, per the
  task brief.
- **Evidence** rides the existing `hs_files`/`hs-evidence`
  infrastructure: `hs_entity_table()`/`hs_scope_for_entity()`/
  `hs_evidence_readable()`/`hs_evidence_writable()`/`hs_files_entity_
  check()` all re-created (150's latest bodies) with four new branches
  (`environmental_spill`, `waste_movement`, `environmental_monitoring`,
  `environmental_permit`), scope `register`, gated on
  `environmental.read`/`.manage` — the exact pattern Group 2 of Phase
  4 (`'equipment'`) and Group 3 (`'inspection'`) already established.
- **Reminders**: `environmental_permits` (own `expires_on`) and
  `permit_conditions` (own `next_review_due`) join
  `REMINDER_ENTITIES`, `due_30`/`due_7`/`overdue` buckets, plus
  `STATUS_WRITES` entries (`environmental_permit_expired`,
  `permit_condition_overdue`, `permit_condition_evidence_due`) —
  `breach_recorded`/`review_required` are excluded from every
  reminder read, so a human-recorded fact can never be silently
  overwritten by the cron.
- **Two new notification types added to both bells and both apps'
  shared `notify/types.ts`**: `environmental_spill_reported`,
  `waste_non_conformance`, `environmental_monitoring_exceedance`,
  `environmental_permit_status_changed`,
  `environmental_permit_condition_review`.
- **Admin gets four new `HsCompanyTabs.tsx` tabs** (Spills, Waste,
  Monitoring, Env. Permits) under the existing `/health-safety/
  <companyId>` prefix — no new sidebar entry needed, the same
  precedent every Phase 4/5 group used. Every status-changing
  `.update(` uses `COUNT_EXACT` + `judgeWrite()` from the start.
  Portal gets four read-only pages under `/protect/environmental-*`,
  gated by `protect` alone (nothing here is self-certified), added to
  `moduleAccess.ts` and `/protect`'s `SectionTabs`.

### Live probe

`supabase/probes/157_environmental_group2.sql`, rolled back: 17
checks — cross-org site refused on spills; same-org spill accepted;
cross-org carrier refused on waste movements; same-org waste movement
with `non_conformance` accepted; `within_limit` is NULL with no
recorded limit; an exceedance (80 > 70) computed `within_limit =
false`; `environmental_monitoring` has no UPDATE grant to
`authenticated`; `permit_conditions` refuses a compliance-verdict
status value (`'compliant'`) and accepts the factual vocabulary
(`'breach_recorded'`); cross-org site refused on environmental
permits; `environmental_incident_details.company_id` derived from the
parent incident; `actions_source_type_check` includes the four new
values; an expired `waste_carrier_licence` fails
`contractor_is_current()` with no function change; evidence vocab
resolves for all four new entity types; the write guard is present;
RLS is enabled on all 7 new tables; no new `SECURITY DEFINER` function
is executable by `anon`. **All 17 passed.**

### Verified

`tsc --noEmit` clean both apps, full `vitest run` green (1157 admin —
1145 + 12 new: 8 `environmentalRules.test.ts` cases and 5 new
`vocab.test.ts` it.each entries, minus a 1-line existing-test update
for the two new `STATUS_WRITES` keys; 612 portal — 604 + 8,
`moduleAccess.test.ts`/`portalPagesLinked.test.ts` picking up the four
new `/protect/environmental-*` routes automatically), all five CI
guards pass with no regressions (`check-shared-dupes.sh`: 43 pairs;
`check-row-cap.sh`: clean; `check-route-validation.sh`: 44,
unchanged; `check-admin-routes-linked.sh`: 65 pages, all reachable;
`check-blind-updates.sh`: 102, unchanged — every new admin write is
either an insert or a counted+judged update from the start), both
production builds compile, including the four new admin routes
(`/health-safety/<companyId>/{environmental-spills,environmental-
waste,environmental-monitoring,environmental-permits}`) and the four
new portal routes (`/protect/environmental-{spills,waste,monitoring,
permits}`). Migration 157 applied live and verified.

### Core-OS 360 Phase 5, Group 3: a shared ISO 45001/14001 management-
### system framework + a purely factual readiness dashboard (2026-09-29,
### migration 158)

Builds on Groups 1-2 (156-157) per the governance map. This group is
the framework Phase 5's spec calls for: ONE shared clause taxonomy
behind both ISO 45001 (H&S) and ISO 14001 (Environmental), a bare
polymorphic link into evidence this platform already has, and a
readiness view that is counts only — the Evidence Engine itself is
explicitly NOT built here, only its foundation.

- **One shared framework, never two.** `management_system_standards`
  (two rows: ISO 45001:2018, ISO 14001:2015 — the `code` column is
  format-checked, not value-restricted, so a third standard can be
  seeded later with no migration to the shape) and ONE
  `standard_clauses` table, joined by `standard_id`, holding both
  standards' clauses. There is no `iso45001_clauses`/`iso14001_clauses`
  pair to keep in step — a later group adding a third standard inserts
  rows, not tables.
- **No copyrighted text, anywhere.** Every `clause_number`/`title` is a
  short (<=200 char), hand-written, one-sentence paraphrase this
  migration's own seed writes — never the ISO document's actual
  wording. 12 clauses per standard, covering the well-known top-level
  structure (Context, Leadership, Planning, Support, Operation,
  Performance Evaluation, Improvement) plus each standard's own
  distinguishing sub-clauses (Hazard ID for 45001; Environmental
  Aspects, Compliance Obligations, Emergency Preparedness for 14001).
- **`standard_evidence_links` is the Evidence Engine's FOUNDATION, not
  the Evidence Engine.** A bare `(entity_type, entity_id)` polymorphic
  reference into EXISTING evidence, reusing `hs_entity_table()`/
  `hs_entity_company()` (122) for the cross-organisation check —
  exactly the pattern the task brief named, and never a new copy of the
  evidence. `hs_entity_table()` gained one real gap-fill,
  `'compliance_item' → 'compliance_items'` (the HR/H&S register was
  never mapped despite being an obvious evidence source), plus
  `'iso_certification' → 'iso_certifications'` for the new table's own
  evidence. `standard_evidence_links_fill()` refuses an unknown
  `entity_type` and a link naming another organisation's record — both
  proved live in the rolled-back probe.
- **Readiness is COUNTS ONLY, computed in TypeScript at read time —
  never a stored score, never a percentage.** Both the admin cross-
  client `/health-safety/iso-readiness` page and the per-client
  `/health-safety/<companyId>/iso` tab / portal `/protect/iso-readiness`
  page compute "clauses total / with evidence / without" directly from
  `standard_clauses` + `standard_evidence_links` — the exact
  `lib/hs/kpis.ts`/`lib/health/scoring.ts` posture ("no stored aggregate
  that can drift out of sync with the rows it summarises"), applied
  here to the one number this phase is most tempted to fake. The
  dashboard's own copy says "Recorded evidence mapped to applicable
  management-system requirements" — never "compliant" or "certified".
- **`iso_certifications` is the ONE place a real certificate may be
  recorded**, and the only thing anywhere in this subsystem that may
  ever be read as "this client holds a certification" — a real,
  user-entered fact (certificate number, certifying body, issued/
  expires dates), never a computed conclusion from the evidence links.
  It is mutable (a renewal updates the row in place), the same
  "ongoing state with one current expiry" shape `contractor_insurances`
  (150) already established — deliberately NOT the register's
  "correction is a new row" discipline, because a certificate has one
  current expiry, not a history of them.
- **RLS deliberately deviates from the hs_sector_packs/hs_audit_templates
  precedent for `management_system_standards`/`standard_clauses`,
  documented as a decision, not an oversight.** Those two are staff-
  authored reference data a client never browses directly (they only
  ever see the MATERIALISED result after staff apply a pack to their
  register). The UI spec here explicitly needs a client to read the
  clause catalogue itself, so this follows `inspection_templates'`
  (145) precedent instead: staff `ALL`, any signed-in user with
  `risk.read` may `SELECT` the catalogue, no client write path at all.
  `standard_evidence_links`/`iso_certifications` are the ordinary
  per-company client-read (`risk.read`) + client-write (`risk.create`)
  shape.
- **No new capability seeded.** `risk.read`/`risk.create` — the
  broadest existing "can see/add to the H&S register" pair — already
  span both standards: every `environmental.manage` role already holds
  `risk.create` too (checked against 156's `ENV_ALL` role list before
  relying on it), so ISO 14001 evidence is never gated on a capability
  an environmental-only role lacks.
- **`iso_certifications` joins `REMINDER_ENTITIES`** for its own
  `expires_on` (`due_30`/`due_7`/`overdue`, new notification types
  `iso_certification_expiring`/`iso_certification_expired`, both
  bells). The reminder payload never carries an embed (`slimRow()`
  strips it), so the standard's name is looked up in the consuming
  rule, the same way `training_record_reminder` resolves an employee
  name by id. No `TRIGGERED_ENTITIES` entry — recording a certificate
  or a link has no consequence worth an immediate outbox event, only
  the eventual expiry reminder.

### Live probe

`supabase/probes/158_iso_framework.sql`, rolled back: 13 checks — two
standards seeded; each has 8-12 clauses; `hs_entity_table()` resolves
`'compliance_item'`/`'iso_certification'`; a cross-organisation
evidence link (naming another company's `compliance_items` row) is
refused; a same-organisation link is accepted; an unknown
`entity_type` is refused; a certification inserts and updates
(renewal) in place; no clause or standard title contains "compliant"/
"certified"; RLS is on for all four new tables; the write guard
(`write_guard_ins/upd/del`) is present on both client-writable tables;
neither new `SECURITY DEFINER` function is executable by `anon`;
`standard_evidence_links` has a `UNIQUE` constraint; both new tables
carry an audit trigger. **All 13 passed.**

### Verified

`tsc --noEmit` clean both apps, full `vitest run` green (1173 admin —
1157 + 16 new: 12 `isoFrameworkSql.test.ts` + 4 new `vocab.test.ts`
cases pinning `ISO_STANDARD_CODES` against 158's seed, the extensible-
code CHECK, every seeded clause's `maps_to_hint` against a real
`hs_entity_table()` key, and the no-compliance-claim-string check;
`STANDARD_EVIDENCE_ENTITY_TYPES` gained `'action'` to cover the one
seeded clause (`8.2`, emergency preparedness) that hints at it; 614
portal — 612 + 2, `moduleAccess.test.ts`/`portalPagesLinked.test.ts`
picking up `/protect/iso-readiness` automatically), all five CI guards
pass with no regressions (`check-shared-dupes.sh`: 43 pairs, unchanged
— vocab.ts/types.ts/notify/types.ts stayed byte-identical across both
mirrors; `check-row-cap.sh`: clean; `check-route-validation.sh`: 44,
unchanged; `check-admin-routes-linked.sh`: 67 pages, all reachable —
the two new admin pages (`iso-readiness` cross-client, the per-company
`iso` tab) both nest under the already-linked `/health-safety` prefix,
no sidebar entry needed; `check-blind-updates.sh`: 102, unchanged —
this group made no `.update()` writes from a client component, only
inserts and one delete), both production builds compile, including
`/health-safety/iso-readiness`, `/health-safety/<companyId>/iso` and
`/protect/iso-readiness`. Migration 158 applied live and verified (RLS
on, write guard applied, both capabilities-gated read policies in
place, evidence vocab resolves, no Group 3 `SECURITY DEFINER` function
executable by `anon`).

**Later Phase 5 groups** (the legal register, document control,
objectives & targets, management review, audit-engine enhancement,
final QA) build on migration 158 onward and should read the governance
map first.

### Core-OS 360 Phase 5, Group 4: the Legal Register (2026-09-29,
### migration 159)

Builds on Groups 1-3 (156-158). Legal requirements, per-company
obligations and evaluations, plus an inert foundation for a LATER
Tavily-based external legal research feature (storage only, no live API
call anywhere in this group).

- **AI never decides applicability, absolute.**
  `organisation_legal_obligations.applicability_status` is a human
  decision; the database's own gate
  (`organisation_legal_obligations_stamp()`) refuses recording
  `applicable`/`not_applicable` without a named assessor
  (`assessed_by`) and a timestamp (`assessed_at`) set together —
  `under_review` needs no confirmer, since it is a staff FLAG for
  further work, not a decision. No AI is wired anywhere in this group;
  the gate exists so a later group cannot slip one in without also
  rewriting this trigger. `assessed_by` is never auto-stamped from
  `auth.uid()` — unlike ordinary bookkeeping columns, WHO made the
  applicability call is itself part of the recorded decision, the same
  choice `environmental_aspect_assessments_fill()` (156) made for
  `confirmed_by`.
- **Cautious, factual compliance vocabulary, exactly.**
  `compliance_evaluations.status` is `evidence_current |
  evidence_incomplete | review_due | potential_noncompliance |
  confirmed_noncompliance | not_evaluated` — never
  "compliant"/"non-compliant"/"legal"/"illegal" anywhere in this
  subsystem's labels, copy or notifications. A vocab test
  (`vocab.test.ts`) scans every label map for the banned verdict words;
  a SQL-shape test (`legalRegisterSql.test.ts`) pins the CHECK's exact
  six values.
- **`legal_requirements` is a register of SOURCE MATERIAL, staff-only,
  never client-visible even read-only** — a title, a small legal-domain
  `category` (a parallel tuple, genuinely different from
  `COMPLIANCE_CATEGORIES`/`HS_REGISTER_CATEGORIES`: a piece of
  LEGISLATION is neither an HR item category nor a recurring H&S check
  type), a jurisdiction, a SHORT staff-written internal summary — never
  the actual statute text — and an optional link OUT to the real
  legislation. A client sees the OBLIGATION and its EVALUATIONS for
  requirements that apply to them (via `organisation_legal_obligations`/
  `compliance_evaluations`, client-READ + staff-MANAGE, reusing
  `risk.read`/`risk.create` — the same broadest existing "can see/add to
  the H&S register" pair 158's ISO framework already reused), never the
  browsable catalogue itself. The portal page therefore reads
  `legal_requirements` titles with the SERVICE ROLE, scoped to exactly
  the ids the session's own RLS-protected read of its obligations
  already returned — never a broader catalogue browse.
- **`compliance_evaluations` is event/history-shaped, insert-only** — a
  correction is a new evaluation, never an edit
  (`REVOKE UPDATE, DELETE, TRUNCATE`), the `hs_register_completions`/
  `puwer_assessments` discipline. The one live "next review due" column
  a reminder needs is rolled FORWARD onto
  `organisation_legal_obligations.next_review_due` by an AFTER INSERT
  trigger (`compliance_evaluations_roll()`), guarded "only when this is
  the newest evaluation for this obligation" — the exact 148a/PUWER
  lesson this codebase already learned: reading an insert-only history
  table directly for a reminder fires once per historical row, not just
  the current one. `company_id` on an evaluation is always derived from
  its obligation, never trusted from the caller.
- **Never a second action table.** A `potential_noncompliance` or
  `confirmed_noncompliance` evaluation raises exactly one `actions` row
  via the EXISTING `source_type = 'legal_requirement'` value — already
  present in `actions_source_type_check` since Phase 4, so this
  migration adds no `ALTER TABLE public.actions` at all.
  `confirmed_noncompliance` is urgent and verification-required;
  `potential_noncompliance` is high, not urgent, not yet a confirmed
  finding. `evidence_current` is reported to STAFF ONLY (a routine,
  clean evaluation needs no client email); a move to `applicable`
  notifies the client admins + staff but raises no action on its own.
  `admin/src/lib/events/legalRegisterRules.ts` is its own file — the
  legal register spans every EHS pillar, the same "genuinely different
  content gets its own file" call `environmentalRules.ts`/
  `leadRules.ts`/`hireRules.ts`/`supportRules.ts` already made.
- **Evidence rides the existing `hs_files`/`hs-evidence`
  infrastructure** via a new `'compliance_evaluation'` branch (scope
  `register`, gated on `risk.read`/`risk.create`) on the four evidence
  functions — hung off the EVALUATION the proof was gathered for, not
  the standing obligation link, a documented choice.
- **The Tavily research-notes table
  (`legal_requirement_research_notes`) is inert storage only** —
  `source` (`tavily` | `manual`), `query_used`, `raw_result_summary`,
  `reviewed_by`/`reviewed_at`, `action_taken`. No live API call
  anywhere in this migration or the TypeScript it ships with; staff-only
  RLS, never a Tavily key referenced. A LATER group wires the real call
  and populates it; nothing here automates a legal conclusion or a
  compliance-status change from anything in this table.
- **`apply_write_guard()` on the two client-readable tables only**
  (`organisation_legal_obligations`, `compliance_evaluations`) — the
  exact 158 precedent (`management_system_standards`/`standard_clauses`
  got no write guard; only the client-facing tables did).
- Admin: a new `HsCompanyTabs.tsx` tab
  (`/health-safety/<companyId>/legal`) for linking requirements, setting
  applicability and recording evaluations, plus a cross-client
  `/health-safety/legal-register` catalogue page (staff add/edit
  `legal_requirements`) — no new sidebar entry, nests under the
  already-linked `/health-safety` prefix. Portal: a read-only
  `/protect/legal-register` page, gated by `protect` alone (nothing here
  is self-certified).

### Live probe

`supabase/probes/159_legal_register.sql`, rolled back: 17 checks — RLS
enabled on all four tables; `legal_requirements`/research-notes have no
client SELECT policy at all; an `applicable` decision with no
assessor refused, WITH one accepted; `under_review` needs no assessor;
a non-cautious status (`'compliant'`) refused, `'potential_
noncompliance'` accepted; a second evaluation preserves the first
(`ORDER BY evaluated_at DESC` gives the latest); a late-backfilled OLDER
evaluation never moves `next_review_due` backwards; `company_id` always
derived from the obligation; evidence vocab resolves for
`'compliance_evaluation'`; cross-organisation evidence refused; the
write guard is present on both client-readable tables; RLS enabled; no
new `SECURITY DEFINER` function executable by `anon`;
`actions_source_type_check` already allows `'legal_requirement'`; no
label anywhere reads a compliance-verdict word; `compliance_evaluations`
has no UPDATE/DELETE grant to `authenticated`. All 17 passed.

### Verified

`tsc --noEmit` clean both apps, full `vitest run` green (1204 admin —
1173 + 31 new: `legalRegisterSql.test.ts` (17), `legalRegisterRules.test.ts`
(7), plus 7 new `vocab.test.ts` cases/entries for the four new
vocabularies; 616 portal — 614 + 2, `moduleAccess.test.ts`/
`portalPagesLinked.test.ts` picking up `/protect/legal-register`
automatically), all five CI guards pass with no regressions
(`check-shared-dupes.sh`: 43 pairs; `check-row-cap.sh`: clean;
`check-route-validation.sh`: 44, unchanged; `check-admin-routes-linked.sh`:
69 pages, all reachable; `check-blind-updates.sh`: 102, unchanged — the
one new admin `.update()` on `organisation_legal_obligations` was built
counted + judged from the start), both production builds compile.
Migration 159 applied live and verified (RLS on, write guard applied,
evidence vocab resolves, no Group 4 `SECURITY DEFINER` function
executable by `anon`, `actions.source_type` already allows
`'legal_requirement'`).

**Later Phase 5 groups** (document control, objectives & targets,
management review, audit-engine enhancement, final QA) build on
migration 159 onward and should read the governance map first.

### Core-OS 360 Phase 5, Group 5: Controlled Document Management
### (2026-09-29, migration 160)

Builds on Groups 1-4 (156-159). Extends `hs_documents` (106) in place
with a formal author/reviewer/approver workflow, a stricter lifecycle,
effective-date separation, retention metadata, acknowledgement
version-pinning and obsolete-document protection — never a second
document table, per the governance map's own verdict on `hs_documents`
("EXTEND (pattern reused, table not)").

- **Every INSERT is a draft, whatever the caller sends.**
  `hs_document_lifecycle_guard()` (BEFORE INSERT OR UPDATE) forces
  `NEW.status := 'draft'` unconditionally at insert time — this is what
  makes "editing an approved document is always a new draft version,
  never an overwrite" true by construction, for the same "New version"
  (`supersedes_id`) flow 106 already had. The status CHECK is extended
  from 106's plain `active | superseded` to
  `draft | pending_review | pending_approval | approved | active |
  review_due | superseded | withdrawn | archived`
  (`HS_DOCUMENT_STATUSES` in `lib/hs/vocab.ts`, a shared-dupe pair).
- **A named reviewer or approver cannot be bypassed.** A document
  naming a reviewer must pass through `pending_review`; a jump straight
  from `draft` to `pending_approval` with `reviewer_id` set is refused.
  One naming neither may go `draft → active` directly.
- **Content (title/category/description) is immutable once
  approved/active/review_due/superseded/withdrawn/archived** — the
  trigger refuses an UPDATE that changes any of them once a row is in
  one of those statuses; an edit request is always a fresh INSERT with
  `supersedes_id` set. Administrative columns (`review_due_at`,
  `effective_from`, `retention_period_months`, `reviewer_id`/
  `approver_id`, `status` itself) may still move within the lifecycle's
  own rules — `review_due_at` deliberately stays movable on an approved
  row, since the reminders cron needs to keep pushing it.
- **Nobody approves their own work — a bare `auth.uid()` comparison, no
  role exemption.** The first draft of this copied `hs_doc_guard()`'s
  (123) "staff excepted" phrasing verbatim; the probe's own `check3`
  caught that it was a complete no-op, because `hs_documents` is
  staff-only end to end (RLS lets nobody else write it) — exempting
  staff exempts EVERY possible writer. Fixed to the 155 self-
  authorisation precedent instead: `auth.uid() = NEW.author_id OR
  auth.uid() = NEW.reviewer_id` refuses the transition to `approved`,
  with no `is_tps_staff()` branch at all. Re-proved refused live before
  trusting it (probe re-run, 16/16). Separately, a CHECK constraint
  (`hs_documents_approver_distinct`) refuses `approver_id` ever equalling
  `author_id` or `reviewer_id` on the same row, independent of who is
  acting.
- **`effective_from` may be in the future, and the database is the
  gate, not a read-side filter.** A document may only reach `active`
  when `effective_from IS NULL` or already `<= current_date`. Because of
  this, `status = 'active'` alone already implies "currently
  effective"; the portal's read-only `/protect/documents` page still
  adds an explicit `effective_from` filter as defence in depth, never
  as the thing actually enforcing it.
- **Superseding the older version happens only when the NEW version
  actually reaches `active`, never at draft time**
  (`hs_document_supersede_roll()`, AFTER UPDATE, mirroring the
  `hs_completion_roll`/`hs_equipment_inspection_roll` "roll forward on
  the newest event" shape). This is a deliberate departure from 106's
  original behaviour, which flipped the old version to `superseded` the
  instant a replacement was created — under the new workflow that would
  have left NO current document while the replacement worked through
  review/approval. Now the old version stays `active` throughout, and
  flips the moment the new one publishes: proven live in the probe
  (`check11`) by reading the old version's status mid-review and
  confirming it is still `active`.
- **No auto-delete, anywhere, ever, for any reason.** `review_due_at`
  passing moves a document toward `review_due` (a reminder — new
  `STATUS_WRITES` entry `hs_document_review_due`, `active → review_due`
  when `review_due_at < today`), never removal.
  `retention_period_months`/`retention_until` (computed by the trigger
  as `approved_at + retention_period_months`) are METADATA ONLY — no
  cron, route or trigger anywhere in this codebase reads `retention_until`
  to delete a row. No DELETE grant exists on `hs_documents` for any
  session role, and this migration adds none.
- **Acknowledgements are pinned to a SPECIFIC VERSION.**
  `policy_acknowledgements` gains a nullable `hs_document_id`
  (`REFERENCES hs_documents(id)`) alongside the existing `document_id`
  (`REFERENCES documents(id)`) — a CHECK requires exactly one of the two
  set. Unlike the generic `documents` table (which needed 119's
  `document_versions`/`document_version_id` machinery because an update
  there overwrites the SAME row's `file_path` in place), `hs_documents`
  needs no extra version column at all: a new version is already a new
  row (rule above), so naming a specific `hs_documents.id` already pins
  to a specific version for ever. An employee who acknowledged v3 stays
  recorded against v3's own id even after v4 is published — proven live
  (probe `check12`) and in a TypeScript unit test
  (`policyAckRules.test.ts`'s "an hs_documents acknowledgement stays
  pinned to its version" block): the emailed link and the sign-off
  notification both name v3, unaffected by v4 existing.
  `sendPolicyAckLink()` (admin) and the portal's `/api/policy/[token]`
  route both branch on which of `document_id`/`hs_document_id` is set;
  an hs_documents-sourced file opens from the `hs-evidence` bucket
  (`hs_files`, `entity_type = 'document'`), never the generic
  `documents` bucket.
- **RLS is unchanged** (staff ALL, client SELECT own company) — this
  migration adds columns and workflow, never changes who may read or
  write `hs_documents`.
- **Consequence rules** (`hsRules.ts`): `hs_document_added` moved from
  firing on INSERT-with-`status=active` (now unreachable, since every
  insert is a draft) to firing on the transition TO `active` — the
  actual publish event. Four new rules cover the steps before that:
  `hs_document_submitted_for_review`/`_for_approval` notify the named
  reviewer/approver directly (`{ kind: 'user', userId }`) plus staff;
  `hs_document_approved` is staff-only (approval is not yet
  publication); `hs_document_withdrawn` tells the client too when the
  withdrawn version had already been published, staff-only otherwise
  (the client never saw an internal draft/review/approval version).
  Four new notification types
  (`hs_document_submitted_for_review`/`_for_approval`/`_approved`/
  `_withdrawn`), both bells, both apps' shared `notify/types.ts`.
- **Admin UI**: `DocumentsClient.tsx` gained reviewer/approver pickers
  (a staff dropdown, the same `profiles.role = 'tps_admin'` pattern
  `hiring/new`'s recruiter picker already uses), effective-date and
  retention-period fields on the add/new-version form, a per-status
  workflow action bar (Submit for review / Submit for approval /
  Approve / Publish / Withdraw / Archive, whichever the CURRENT status
  legally allows) and a History view (walks the `supersedes_id` chain
  in both directions, showing every version clearly labelled by
  status). Every workflow button is an ordinary `.update({ status })`
  with `COUNT_EXACT` + `judgeWrite()` — no UI-side pre-validation
  duplicating `hs_document_lifecycle_guard()`; the database's own
  refusal message is surfaced verbatim in the toast, the same posture
  every H&S workflow guard in this codebase already takes.
- **Portal**: `/protect/documents` now filters `status = 'active'` AND
  (`effective_from IS NULL OR effective_from <= today`) — the second
  clause is defence in depth, since the database already refuses
  `active` before its own effective date. A full version-history view
  was judged unnecessary scope for the read-only portal page and was
  not built; the admin History view is the one place to see every
  version.

### Live probe

`supabase/probes/160_document_control.sql`, rolled back: 16 checks —
the full draft → pending_review → pending_approval → approved → active
lifecycle; self-approval refused at the CHECK level (approver = author)
and at the session level (acting as the author even with a different
named approver); a different staff approver succeeds; approving before
review (reviewer named, jumping straight to pending_approval) refused;
the no-reviewer path (straight to pending_approval) succeeds; an
approved row's title cannot be changed but its `review_due_at` still
can; `effective_from` in the future refuses `active`, in the past
allows it; superseding only happens once the new version PUBLISHES,
with the old version proven still `active` throughout the new one's own
review; an acknowledgement naming v1 stays pinned to v1 through two
further versions; an impossible status jump (`draft → superseded`) is
refused; RLS is on; no DELETE grant exists for any session role; no new
`SECURITY DEFINER` function is anon-executable. **The first draft
failed check3** (self-approval, staff exempted) — fixed live and
re-proved before trusting it; **all 16 passed** on the corrected
function.

### Verified

`tsc --noEmit` clean both apps, full `vitest run` green (1228 admin —
1205 (1204 + the new `HS_DOCUMENT_STATUSES` vocab pin) + 23 more:
`documentControlSql.test.ts` (16), 5 new `hsRules.test.ts` cases, 2 new
`policyAckRules.test.ts` cases pinning the version-pinning property; 616
portal, unchanged — this group touched only the shared-dupe vocab/
types/notify files plus one read-only page filter and one route's
document-source branch, none of which added a new test file), all five
CI guards pass with no regressions (`check-shared-dupes.sh`: 43 pairs;
`check-row-cap.sh`: clean; `check-route-validation.sh`: 44, unchanged;
`check-admin-routes-linked.sh`: 69 pages, all reachable — no new admin
route, `documents` already nests under the linked `/health-safety`
prefix; `check-blind-updates.sh`: 102, unchanged — every new workflow
button was built with `COUNT_EXACT` + `judgeWrite()` from the start),
both production builds compile. Migration 160 applied live and
verified (function bodies re-read back after the same-day self-approval
fix, confirmed matching what the probe re-ran against).

**Later Phase 5 groups** (objectives & targets, management review,
audit-engine enhancement, final QA) build on migration 160 onward and
should read the governance map first.

### Core-OS 360 Phase 5, Group 6: Objectives & Targets, and Management
### Review (2026-09-29, migration 161)

Builds on Groups 1-5 (156-160). ISO clauses 6.2 (objectives) and 9.3
(management review), spanning every EHS pillar — an objective may be
tied to ISO 45001 or 14001 via `standard_id`, or stand alone.

- **No black-box AI progress judgement, absolute rule.** An objective's
  status (`draft | active | on_track | at_risk | achieved | missed |
  abandoned`) is rolled forward by `objective_measurements_roll()` — a
  plain, inspectable comparison of the LATEST measurement against
  `target_value`/`target_direction`, never a model call. `target_
  direction` (`increase`/`decrease`) is the one column added beyond the
  task brief's literal list: "is 40 above or below a target of 20"
  cannot be answered without knowing which way the objective is meant
  to move, the same kind of documented, necessary assumption
  `environmental_monitoring`'s upper-bound-only `within_limit` (157)
  already recorded rather than silently guessing.
- **`objective_measurements` is insert-only** (`REVOKE UPDATE, DELETE,
  TRUNCATE`) — a correction is a new measurement, never an edit, the
  `hs_register_completions`/`compliance_evaluations` discipline. The
  roll only ever advances from the NEWEST measurement (guarded `NOT
  EXISTS` against a later `measured_at`) — the exact 148a/PUWER lesson:
  reading an insert-only history table directly fires once per
  historical row, not just the current one. It never overrides a human
  `'abandoned'` decision, and does nothing at all when `target_value`
  is null (a purely qualitative objective has nothing to compare).
- **Never a second action table (rule 1).** An objective reaching
  `at_risk`/`missed` raises exactly one `actions` row (`source_type =
  'objective'`, keyed `objective:<id>:<status>` — a re-processed event
  never raises two, and a genuine later episode after recovering to
  `on_track` still gets its own fresh action). A management review
  decision that needs follow-up is an ordinary `actions` row too
  (`source_type = 'management_review'`) — created FIRST, then named on
  the decision via `resulting_action_id`, so `management_review_
  decisions` never needs an UPDATE to attach it after the fact. Two new
  values added to the existing shared `actions_source_type_check`.
- **A completed review's decisions are immutable, and finality means
  something.** `management_review_decisions` is fully insert-only (a
  correction is a new decision row, the `hs_documents`/`environmental_
  aspects` "material change is a new row" discipline) AND
  `management_review_decisions_guard()` refuses a new INSERT once the
  parent review's `status = 'completed'` — a genuinely different
  decision after that point needs a NEW `management_reviews` row (a
  follow-up review), never an addition to a closed one.
- **The data pack is a STORED SNAPSHOT, never recomputed after the
  fact.** `admin/src/lib/governance/dataPack.ts`'s
  `computeManagementReviewDataPack()` is pure counts/aggregates read
  from existing tables at generation time (open actions, overdue
  register items, incidents/environmental incidents/audits since the
  previous completed review, audits scoring below a fixed 70%
  threshold, objective status breakdown, legal obligation applicability
  breakdown, legal evaluation EVENTS breakdown since the last review,
  ISO readiness clause-with-evidence counts per standard, environmental
  aspects confirmed significant) — never an AI-generated summary, never
  a conclusion like "the organisation is performing well".
  `management_review_data_pack` is insert-only
  (`REVOKE UPDATE, DELETE, TRUNCATE`): generating a new pack for the
  same review inserts a fresh row rather than overwriting the old one,
  so a printed pack stays reproducible/auditable even after the
  underlying counts have moved on — proved live in the probe (check 19:
  inserting a new measurement after a pack was generated leaves the
  stored snapshot byte-identical).
- **RLS: staff MANAGE, client READ-ONLY, no client write path at all**
  on every client-visible table — the exact `organisation_legal_
  obligations`/`compliance_evaluations` (159) posture, reusing
  `risk.read` (never a new capability, per the task brief and the
  158/159 precedent: this spans H&S and Environmental alike, and every
  `environmental.manage` role already holds `risk.create` too).
  `management_review_data_pack` is STAFF-ONLY, not client-visible at
  all — the internal analysis pack is not the same thing as the
  decisions a review reaches, which the client DOES see.
  `apply_write_guard()` on every client-readable table (objectives,
  objective_measurements, management_reviews, management_review_
  attendees, management_review_decisions), not on the staff-only data
  pack — the 158/159 precedent.
- **Same-organisation checks** guard `objectives.owner_person_id`,
  `management_reviews.chaired_by` and `management_review_attendees.
  person_id` (all via `assert_same_org()`), and a decision's
  `resulting_action_id` must belong to the same organisation.
- **Outbox + audit + reminders**: `objectives` (whitelist `title,
  standard_id, status, target_date`) and `management_reviews`
  (whitelist `review_date, chaired_by, status, completed_at`) join
  `TRIGGERED_ENTITIES` — never `description`/`decision_text`/`notes`.
  Both also join `REMINDER_ENTITIES`: an open objective's own
  `target_date` (`due_30`/`due_7`/`overdue`, filtered to non-terminal
  statuses) and a SCHEDULED review's own `review_date`
  (`due_30`/`due_7`/`due_0`). `admin/src/lib/events/governanceRules.ts`
  is its own file — spanning every EHS pillar, the same "genuinely
  different content gets its own file" call `environmentalRules.ts`/
  `legalRegisterRules.ts` already made.

### Admin + portal UI

Admin: a 14th/15th `HsCompanyTabs.tsx` tab pair,
`/health-safety/<companyId>/objectives` (`ObjectivesClient.tsx` — add an
objective, record a measurement, abandon one) and `/health-safety/
<companyId>/management-review` (`ManagementReviewClient.tsx` — schedule
a review, add attendees, generate the data pack, record decisions with
an optional follow-up action, mark statuses, and a Print pack button
that lazy-loads jsPDF + autotable and calls `admin/src/lib/governance/
buildReviewPdf.ts` — the EXACT `lib/valueReport/buildReportPdf.ts`
pattern: the PDF library is a parameter, never imported at the top of
the builder module). No new sidebar entry needed — both nest under the
already-linked `/health-safety` prefix. Portal: read-only `/protect/
objectives` (shows the calculated status and recent measurements) and
`/protect/management-review` (shows only COMPLETED reviews and their
decisions — the internal data pack is deliberately not shown, since
`management_review_data_pack` is staff-only RLS and the client's actual
need is the outcome reached, not the working behind it), both gated by
`protect` alone.

### Live probe

`supabase/probes/161_objectives_management_review.sql`, rolled back: 21
checks — RLS enabled on all six tables; write guard present on the five
client-readable tables; a cross-organisation owner refused; a plain
objective insert defaults to `draft`; `objective_measurements` has no
UPDATE/DELETE grant; a measurement reaching the target rolls the
objective to `achieved`; a measurement short of target with a near
deadline rolls to `at_risk`; the roll never overrides `abandoned`; a
late-backfilled OLDER measurement never moves status backwards;
`company_id` always derived from the objective; `actions_source_type_
check` allows both new values; `completed_at` is stamped exactly once,
the moment status reaches `completed`; a cross-organisation chair
refused; a cross-organisation attendee refused; a decision inserts
while not completed; a decision is refused once the review is
completed; decisions have no UPDATE/DELETE grant; the data pack has no
UPDATE/DELETE grant; the data pack snapshot is genuinely stored (a new
measurement inserted after generation leaves it unchanged); no new
`SECURITY DEFINER` function is anon-executable; a decision naming
another company's action is refused. **All 21 passed.**

### Verified

`tsc --noEmit` clean both apps, full `vitest run` green (1257 admin —
1228 + 29 new: `objectivesManagementReviewSql.test.ts` (19),
`governanceRules.test.ts` (7), 3 new `vocab.test.ts` it.each entries
(objective statuses, objective target directions, management review
statuses) plus their label-map-coverage pairs; 620 portal — 616 + 4,
`moduleAccess.test.ts`/`portalPagesLinked.test.ts` picking up the two
new `/protect/objectives`/`/protect/management-review` routes
automatically), all five CI guards pass with no regressions
(`check-shared-dupes.sh`: 43 pairs, unchanged — `vocab.ts`/`types.ts`/
`notify/types.ts` stayed byte-identical across both mirrors;
`check-row-cap.sh`: clean, after lowering one `dataPack.ts` query from
`.limit(1000)` to `.limit(500)` to match the guard's exact threshold;
`check-route-validation.sh`: 44, unchanged; `check-admin-routes-linked.sh`:
71 pages, all reachable; `check-blind-updates.sh`: 102, unchanged —
the two new admin `.update()` writes (objective abandon, review status)
were built with `COUNT_EXACT` + `judgeWrite()` from the start), both
production builds compile, including the two new admin routes and the
two new portal routes. Migration 161 applied live and verified (RLS on,
write guard applied, both source_type values present on `actions`,
evidence untouched by this group — no new evidence entity type was
needed).

**Later Phase 5 groups** (audit-engine enhancement, final QA) build on
migration 161 onward and should read the governance map first.

### Core-OS 360 Phase 5, Group 7: Internal Audit Enhancement, Governance
### Calendar, Worker Consultation, Environmental Complaints (2026-09-29,
### migration 162)

Builds on Groups 1-6 (156-161). Four pieces, none of them a new engine.

- **Audit enhancement extends the EXISTING `hs_audits`/`hs_audit_
  responses`/`hs_audit_templates` system (110/113), never a second
  audit engine.** `audit_programmes` is a new, small table — a planned
  SCHEDULE of audits (nothing existing modelled "we run a fire audit
  here quarterly"): staff-managed, plain-company client read, the exact
  `hs_audits` posture (no capability gate). `audit_findings` is the
  richer finding record: one row per FAILED `hs_audit_responses` row
  (`UNIQUE (hs_audit_response_id)`), created SYNCHRONOUSLY inside the
  existing atomic `hs_submit_audit()` RPC (extended, not duplicated) —
  never by the async event consumer, so a finding exists the instant
  the audit itself does. Unlike `hs_audit_responses`, `audit_findings`
  is MUTABLE: a finding is worked on over days (root cause, a linked
  corrective action, eventually closed) — the audit's own "correction
  is a new row" discipline applies to the AUDIT, not to investigating
  one of its findings.
- **Severity is derived from the template item, never guessed.**
  `hs_audit_template_items` gained `default_severity` (nullable
  `minor|major|critical`, mirroring Group 3's `inspection_template_
  items.critical` flag) — an item with none set defaults the finding
  to `minor`. `AUDIT_FINDING_SEVERITIES` in `lib/hs/vocab.ts` is a
  genuinely new, small vocabulary the task itself specified — never a
  reuse of `actions.severity` (`low|medium|high|critical`, a different
  column on a different table).
- **A MAJOR or CRITICAL finding cannot be closed without a root cause
  AND a linked corrective action AND that action's OWN effectiveness
  verification — enforced by `audit_findings_closure_guard()`, a
  database trigger, never the UI.** "Effectiveness verification"
  reuses the EXISTING `actions.status`/`verified_at`/
  `effectiveness_outcome` columns from Phase 2 (125/126) — no parallel
  verification mechanism. The gate is severity-SCOPED: a MINOR finding
  closes freely, with no root cause or linked action required. Proved
  live in both directions (root cause missing, then present but no
  action, then linked-but-unverified, then genuinely closable) and for
  a minor finding closing with none of that.
- **Never a second action table (this file's own standing rule).** A
  finding's corrective action is an ordinary `actions` row,
  `source_type = 'audit_finding'` — a value already present on
  `actions_source_type_check` since migration 161, confirmed live
  before writing this migration; no ALTER needed for it here. The
  consequence rule (`hsRules.ts`, extending the EXISTING
  `auditSubmittedConsequences`/`hs_audit_completed` handler) raises one
  keyed action per failed response with the finding's own severity
  driving `priority` (`minor→normal`, `major→high`, `critical→urgent`),
  `severity` (`minor→low`, `major→medium`, `critical→critical`) and
  `verification_required` (major/critical only) — then a `run`
  consequence links the just-raised action's id back onto
  `audit_findings.corrective_action_id`, but ONLY while it is still
  null, so a later human change (or a different, hand-picked action) is
  never clobbered by a re-processed event. A `run` write that touches
  the database now uses `{ count: 'exact' }` from the start —
  `check-blind-updates.sh`'s ratchet did not move.
- **Governance Calendar is a READ-TIME AGGREGATE, never a new events/
  scheduling table.** `admin/src/lib/governance/calendar.ts`'s
  `governanceCalendarEvents()` unions the already-dated rows across
  `audit_programmes`, `management_reviews`, `objectives`,
  `organisation_legal_obligations`, `hs_documents`,
  `environmental_permits`, `permit_conditions` and `iso_certifications`
  — the source rows remain the single source of truth; each returned
  event carries its own type, a real admin AND portal link, and
  nothing here is stored. TypeScript over one SQL view: the eight
  source tables have genuinely different shapes (some `date`, one
  `timestamptz`; several need no join, none need a join for the
  calendar itself) and this is materially easier to read, test and
  extend than one large `UNION ALL`, and nothing here needs to run
  inside a policy or a trigger. `/health-safety/governance-calendar`
  (cross-client) is a simple month-grouped list — no interactive
  calendar widget needed, per the task's own scope note.
- **`consultation_records` and `environmental_complaints` are simple,
  insert-mostly record-keeping tables, not workflow engines.** A
  follow-up from either is, again, an ordinary `actions` row
  (`source_type` `'consultation'` / `'environmental_complaint'`, two
  new values added to the shared CHECK). `consultation_records` is
  staff-manage / client-read, reusing `risk.read` — the broadest
  existing "can see the register" capability, the 158/159/161
  precedent, since this is a cross-pillar governance record rather
  than an environmental-specific one; its consequence rule lives in
  `governanceRules.ts` for that reason. `environmental_complaints`
  follows the EXACT Group 2 spills/waste shape (staff full access,
  client read with `environmental.read`, client insert/update with
  `environmental.manage` — a client is often the one who receives the
  complaint); its consequence rules live in `environmentalRules.ts`,
  extending that file rather than forking a new one.
- **Evidence functions had moved well past migration 113's snapshot by
  the time this group was written** (extra branches from Phase 2/3/4/
  Group 3, and `hs_evidence_readable`/`hs_evidence_writable` had
  different parameter names/order than 113 ever had). The LIVE bodies
  were fetched via `execute_sql` immediately before writing the
  migration and reproduced verbatim with only the new
  `'audit_finding'`/`'consultation_record'`/`'environmental_complaint'`
  branches added — never guessed from an older migration file. Two
  live-apply attempts were needed the same reason 144a/147a record
  twice already: the first draft assumed 113's simpler function
  shapes and failed live with `cannot change name of input parameter`
  before the real signatures were read and matched.
- **`audit_programmes` has no outbox entry of its own** — a reminder-
  only entity, the `training_records` precedent — but IS in
  `REMINDER_ENTITIES` for its own `next_due_date`
  (`due_30`/`due_7`/`overdue`, new notification type
  `audit_programme_due`, both bells).

### Admin + portal UI

Admin: `/health-safety/<companyId>/audit-programmes` (schedule/pause a
programme), the audit detail page gained a findings panel per failed
answer (severity, root cause, a linked corrective-action id field, a
Close button) that surfaces the database's own refusal message
verbatim via the toast — no client-side pre-validation of the closure
gate, the same posture every H&S workflow guard in this codebase
already takes. `/health-safety/<companyId>/consultation` and
`/health-safety/<companyId>/environmental-complaints` (simple add/
list/mark-investigated/close forms), plus the cross-client
`/health-safety/governance-calendar`. No new sidebar entries needed —
all four nest under the already-linked `/health-safety` prefix. Portal
gets read-only `/protect/audit-programmes`, `/protect/consultation`
and `/protect/environmental-complaints`, gated by `protect` alone
(nothing here is self-certified), added to the PROTECT `SectionTabs`.

### Live probe

`supabase/probes/162_audit_enhancement_calendar_consultation.sql`,
rolled back: 18 checks — a fail response auto-creates a finding; its
severity defaults to minor with no template item, and is derived
correctly from the item's `default_severity` when one is set; a
retried `hs_submit_audit()` call is idempotent (still exactly one
finding); the closure gate refuses with no root cause, refuses with a
root cause but no corrective action, refuses with a corrective action
that is not yet verified/effective, and succeeds once it is; a minor
finding closes freely; `consultation_records`/`environmental_
complaints` both refuse a cross-organisation site and accept a
same-organisation one; evidence vocab resolves for all three new
entity types; write guards and RLS are present on all four new tables;
no new `SECURITY DEFINER` function is executable by `anon`; the
calendar's own source data spans the three tables checked live
(`audit_programmes`, `objectives`, `management_reviews` all present).
**All 18 passed.**

### Verified

`tsc --noEmit` clean both apps, full `vitest run` green (1286 admin —
1257 + 29 new: `auditEnhancementSql.test.ts` (13), 5 new
`calendar.test.ts` cases, 3 new `hsRules.test.ts` cases, 1 new
`governanceRules.test.ts` case, 3 new `environmentalRules.test.ts`
cases, 4 new `vocab.test.ts` it.each entries plus their label-map-
coverage pairs; 626 portal — 620 + 6, `moduleAccess.test.ts`/
`portalPagesLinked.test.ts` picking up the three new
`/protect/audit-programmes`/`/protect/consultation`/`/protect/
environmental-complaints` routes automatically), all five CI guards
pass with no regressions (`check-shared-dupes.sh`: 43 pairs, unchanged
— `vocab.ts`/`types.ts`/`notify/types.ts` stayed byte-identical across
both mirrors; `check-row-cap.sh`: clean; `check-route-validation.sh`:
44, unchanged; `check-admin-routes-linked.sh`: 75 pages, all reachable;
`check-blind-updates.sh`: 102, unchanged — the two new UPDATE call
sites this group added (the finding panel's save, and the async
finding→action linking `run` consequence) were both built with
`{ count: 'exact' }` + `judgeWrite()`/the counted-write discipline from
the start), both production builds compile. Migration 162 applied live
and verified in two parts (`162c`/`162d` — see the migration file's own
header for why) after the placeholder-content trap below was caught
and corrected: RLS on, write guards applied, evidence vocab resolves,
`actions.source_type` allows both new values, no Group 7 `SECURITY
DEFINER` function executable by `anon`.

**A tooling trap worth recording**: the first `apply_migration` call
for 162 was sent with a placeholder comment instead of the real SQL
body (a copy-paste slip, not a database defect) and reported success —
the migrations table recorded a "162_audit_enhancement_calendar_
consultation" entry with no tables actually created. Caught immediately
by checking `to_regclass()` for the new tables before trusting the
apply call's own success response, the same discipline this file's
"IvyLens telemetry table existed only on disk" entry already
established. The real content was applied as follow-up migrations
(`162c` for the evidence-function wiring, `162d` for the tables/
triggers/RLS) rather than silently overwriting the empty `162` entry.

### Core-OS 360 Phase 5, Group 8: evidence-link foundation, a
### governance KPI framework, Broadcast integration, and reporting/
### search coverage for Groups 1-7 (2026-09-29, migration 163)

Builds on Groups 1-7 (156-162). The last piece of connective tissue for
the Legal Register, Objectives and Audit Findings before final QA: a
human can now explicitly link any of the three to an existing record
elsewhere in the platform, the platform can report a handful of
deterministic EHS numbers about them, and — for the first time —
Phase 5's own tables are actually reachable through search and the
Broadcast tool.

- **`requirement_evidence_links` is a SIBLING to `standard_evidence_
  links` (158), never an extension of it.** `standard_evidence_links`
  is keyed to a `standard_clauses` row — a fixed ISO clause. A legal
  obligation, an objective and an audit finding are not clauses and
  have no `clause_id` to hang off, so the new table carries its own
  polymorphic SOURCE side (`source_type`/`source_id`) alongside the
  same polymorphic EVIDENCE side (`entity_type`/`entity_id`) — both
  validated by the exact same `hs_entity_table()`/`hs_entity_company()`
  mechanism the evidence side already used, reused rather than
  reinvented for the source side too. `source_type` is a small, CLOSED
  vocabulary (`legal_obligation | objective | audit_finding`) — the
  three kinds the task named, never "any entity can be a source",
  which is scope that belongs to a later Evidence Engine, if one is
  ever built, not to this foundation.
- **`hs_entity_table()` gained exactly two branches** (`legal_
  obligation → organisation_legal_obligations`, `objective →
  objectives`) — `audit_finding` already resolved, added in 162 for its
  own evidence branch. Every prior branch is copied unchanged;
  `requirementEvidenceLinksSql.test.ts` spot-checks five of them to
  prove this migration is additive, not a rewrite.
- **No automated evidence suggestion, no AI, no cross-subsystem
  scoring, anywhere.** A link is an explicit human action — insert or
  delete, never an update ("a wrong link is removed, not edited", the
  same rule `standard_evidence_links` already follows).
- **The one UI, `EvidenceLinksPanel.tsx`, is reused UNCHANGED across
  all three source pages** (a legal obligation on `/health-safety/
  <companyId>/legal`, an objective on `.../objectives`, an audit
  finding on the audit detail page) — it takes a caller-supplied
  `sourceType`/`sourceId` rather than being three separate copies, and
  reuses the SAME `STANDARD_EVIDENCE_ENTITY_TYPES` vocabulary `IsoClient.tsx`
  already uses for the evidence side (the evidence side is the same set
  of existing record kinds regardless of which table is doing the
  linking). No record-picker UI was built — the id field is a plain
  paste, matching `IsoClient.tsx`'s own existing pattern for
  `standard_evidence_links`, since this is explicitly the evidence-link
  FOUNDATION, not the full Evidence Engine.
- **Capability reuse, no new capability seeded**: `risk.read`/
  `risk.create` — the same broadest existing "can see/add to the
  register" pair Groups 3-7 (158-162) already reused for exactly this
  reason.
- **Governance KPI framework**: `lib/governance/kpis.ts`
  (`computeGovernanceKpis()`) is a SIBLING to Phase 4's `lib/hs/
  kpis.ts`, not an extension of it — that module's incident/audit/
  equipment counts are pure H&S register signals; this one spans
  Environmental, the Legal Register and Objectives, the same "own file
  for cross-pillar content" call `environmentalRules.ts`/
  `legalRegisterRules.ts`/`governanceRules.ts` already made for
  consequence rules. Pure, deterministic, computed at read time — no
  stored aggregate, no AI, no significance judgement, and every KPI
  reports which tables/columns/date-range it came from
  (`GovernanceKpiDataSource`) rather than storing that provenance.
  **"Waste diverted %" was named as an EXAMPLE in the task brief, but
  was not built as specified** — `waste_streams.typical_disposal_route`
  (157) is free text with no diverted/landfill classification, and
  string-matching it (e.g. for "recycl") would be exactly the kind of
  guessed default this codebase's own standing rule already rejects
  (see `lib/bd/score.ts`: "an honest degrade... not a guessed
  default"). `wasteNonConformancePercent` is used instead — honestly
  computable from `waste_movements.non_conformance`, and a real,
  standard EHS metric in its own right, not a substitute invented to
  look complete. `incidentFrequencyRatePer100` is a genuinely new
  metric, not a duplicate of `lib/hs/kpis.ts`'s existing raw incident
  count: EHS frequency rates are always normalised per headcount (or
  hours worked), which that module never computed.
- **Broadcast integration reuses the EXISTING confirm-modal flow,
  never a second, weaker path.** The Legal Register catalogue page
  gained a "Broadcast" link per requirement
  (`/broadcast?legal=<legal_requirements id>`), and `BroadcastPage`
  gained `loadLegalPrefill()` alongside the existing regulatory-update
  `loadPrefill()` — both populate the SAME `BroadcastPrefill` shape
  `BroadcastClient.tsx` already consumes, so the confirm modal a staff
  member sees before Send is identical either way. Only companies that
  have actually recorded the requirement as `applicable` are
  pre-selected — never every client on the platform. The pure mapping
  (`buildLegalPrefill()`, `lib/governance/broadcastPrefill.ts`) is
  extracted and unit-tested separately from the Supabase fetch, the
  same "pure computation out of a server component" shape
  `computeValueReport()`/`computeGovernanceKpis()` already use
  elsewhere. Nothing here sends anything automatically.
- **Reporting reuses `computeReport.ts`/`buildReportPdf.ts`'s exact
  parameterised-PDF-builder pattern**, following Group 6's own LEAD-
  section precedent rather than a new report type: a GOVERNANCE
  section (`lib/governance/governanceReportMetrics.ts`,
  `computeGovernanceMetrics()`) sits between PROTECT/LEAD and SYSTEM
  USAGE on both the on-screen Value Report and its PDF, fed by the same
  seven reads both `/value-reports/page.tsx` and the monthly cron's
  route now make, so a staff download and the emailed PDF for the same
  company/month stay byte-identical. **ISO readiness is reported as
  counts only** ("3 of 12 clauses have recorded evidence"), never a
  percentage or a certification claim — the standalone readiness
  dashboard's own posture (158), extended here rather than relaxed.
- **`search_records()` (Phase 1) stays SECURITY INVOKER — never
  changed.** It gained seven branches for tables that had NO search
  coverage at all before this: `environmental_aspect`, `environmental_
  permit`, `legal_requirement`, `objective`, `management_review`,
  `audit_programme`, `consultation_record`, plus an eighth,
  `iso_certification`. `legal_requirements` is staff-only RLS (159) —
  a non-staff caller's own row-level security already hides it from
  this branch with no extra check needed, the same reason `hs_documents`
  never needed one either. **Deliberately excluded**:
  `audit_findings.root_cause` and `environmental_complaints.
  description` are free-text narrative with no short controlled title
  field to search on instead — the same "never surface notes in a
  search title" discipline the outbox whitelists already apply.
  `GlobalSearch.tsx` gained icons, labels and `hrefFor()` routing for
  all seven; `legal_requirement` has no per-organisation home (it is
  the staff catalogue, not a per-company row — `search_records` itself
  returns a null `organisation_id` for it) and routes to the catalogue
  page instead of a client's own workspace.

### Live probe

`supabase/probes/163_evidence_link_foundation.sql`, rolled back, run
under a simulated client session (Andrews Recruitment Group's own
`client_admin`) for the search-scoping checks: 10 checks — a same-org
link succeeds; a cross-org EVIDENCE record is refused; a cross-org
SOURCE record is refused; an unknown `source_type` is refused by the
CHECK constraint itself; the simulated session's `search_records` sees
its own company's objective; never a different company's objective;
never the staff-only `legal_requirements` catalogue at all; the write
guard is present; RLS is enabled; the DEFINER fill trigger is not
executable by `anon`. **All 10 passed.**

### Verified

`tsc --noEmit` clean both apps, full `vitest run` green (1317 admin —
1286 + 31 new: `governance/kpis.test.ts` (7), `governance/
broadcastPrefill.test.ts` (5), `governance/governanceReportMetrics.
test.ts` (5), `hs/__tests__/requirementEvidenceLinksSql.test.ts` (13),
plus 1 new `computeReport.test.ts` case; 626 portal, unchanged — this
group touched only the byte-identical `types.ts` mirror on the portal
side, no portal test files), all five CI guards pass with no
regressions (`check-shared-dupes.sh`: 43 pairs; `check-row-cap.sh`:
clean; `check-route-validation.sh`: 44, unchanged; `check-admin-
routes-linked.sh`: 75 pages, all reachable — no new admin route, every
page touched nests under an already-linked prefix;
`check-blind-updates.sh`: 102, unchanged — `EvidenceLinksPanel.tsx`
only inserts and deletes, never updates), both production builds
compile, including `/broadcast`'s new `?legal=` prefill path and the
Legal Register catalogue's new "Broadcast" link. Migration 163 applied
live and verified (the new table's RLS/write-guard/trigger shape
confirmed structurally identical to `standard_evidence_links`'
already-audited shape; `hs_entity_table()` resolves both new branches;
`search_records()` confirmed still `SECURITY INVOKER`, with `anon`
still refused execute on it).

### Core-OS 360 Phase 5, Group 9: UI consistency pass across Groups 1-8
### (2026-09-29)

A background audit agent reviewed every admin/portal page shipped in
Groups 1-8 against the established `hs/` component conventions (button
placement, empty-state markup, status colour-coding, sidebar reachability).
Four findings, all fixed:

- **Three cross-client pages had no sidebar entry**
  (`/health-safety/legal-register`, `/health-safety/iso-readiness`,
  `/health-safety/governance-calendar`) — reachable only by a direct
  URL. `check-admin-routes-linked.sh` did not catch this: it matches by
  TOP-LEVEL path segment, and `/health-safety` was already linked via
  the per-client workspace — **a real, now-documented gap in that
  guard**, not a false pass on these specific pages. Fixed: three links
  added to `AdminSidebar.tsx`'s PROTECT group.
- **Button-wrapper and empty-state markup had drifted** on
  `EnvironmentalAspectsClient.tsx`, `EnvironmentalSpillsClient.tsx`,
  `EnvironmentalMonitoringClient.tsx`, `EnvironmentalPermitsClient.tsx`,
  `LegalRegisterClient.tsx`, `LegalRequirementsCatalogueClient.tsx`,
  `ObjectivesClient.tsx`, `ManagementReviewClient.tsx` — several
  Group 7/8 components stopped matching the `flex ml-auto` button-row
  and `card empty-state p-10` pattern every earlier `hs/` component
  uses. Fixed to match.
- **`environmental_spills.status` and `permit_conditions.status`
  rendered with no colour anywhere** — admin table/select AND the
  portal's read-only equivalents — despite both vocabularies including
  urgent values (`breach_recorded`, `overdue`) that should stand out
  from a routine one, the same colour-badge-next-to-a-select pattern
  `IncidentsClient.tsx` already established. Fixed in all four
  locations, portal given the identical colour maps as admin rather
  than independently invented ones.
- **The portal's `/protect/environmental-waste` page fetched
  `waste_streams` but never rendered it** — only the movements table
  showed, silently dropping the "what kind of waste" reference data a
  client needs to make sense of the movements below it. Fixed: added a
  read-only waste-streams section mirroring admin's
  `EnvironmentalWasteClient.tsx` two-section layout.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green (1320
admin, unchanged — this group edited only markup, no new test-covered
logic; 626 portal, unchanged), all five CI guards pass
(`check-admin-routes-linked.sh`: 75 pages, all reachable — up from the
count before the sidebar fix), both production builds compile.

### Core-OS 360 Phase 5, Group 10: final regression, adversarial QA,
### two real concurrency bugs found and fixed, handover (2026-09-29,
### migrations 164-166)

Full handover + QA report: `docs/CORE_OS_360_PHASE5_HANDOVER.md`.
**Gate: PASS WITH MINOR ISSUES.**

**Concurrency testing (the brief's own explicit request: "two users
approving different document versions — only one becomes active")
found two real, High-severity bugs — not a hypothetical, both
reproduced live before being fixed.**

- **`hs_documents` (160) — migration 164.** Two INSERTs both naming the
  same `supersedes_id` (two editors starting a new version off the SAME
  currently-active parent) both reached `'active'` simultaneously —
  160's own rule 7 ("exactly one document current at any time") was
  false. `hs_document_supersede_roll()` only ever superseded the NAMED
  parent, never the sibling that lost the race. Fixed: the trigger now
  ALSO supersedes any other row sharing the same `supersedes_id` still
  active. Reproduced failing 2/2 before, passing 4/4 after
  (`supabase/probes/164_document_sibling_race.sql`), a normal linear
  chain proven unaffected.
- **`emergency_plans` (154) — migration 165, worse than the
  hs_documents case.** Had **no automated supersede trigger at all** —
  the documented "insert new, then update the old row to superseded"
  discipline was entirely a client-side, two-sequential-write
  responsibility (`EmergencyPlansClient.tsx`, Phase 4 Group 13) with
  nothing in the database enforcing it. A single dropped connection
  between the two writes — not a rare race, an ordinary partial
  failure — leaves two active plans in the same lineage permanently,
  since nothing ever reconciles it afterwards. This was **currently
  reachable through the shipped product**, unlike the next finding.
  Fixed with an AFTER INSERT trigger mirroring 164's shape, adapted to
  this table's simpler active/superseded-only lifecycle. Proved 3/3:
  the bug scenario, a normal chain, a genuine sibling race.
- **`environmental_aspects` (156) — migration 166, same defect class,
  fixed defensively.** Same missing-trigger gap. **Not yet reachable
  through the product** — `EnvironmentalAspectsClient.tsx` has no "new
  version" action yet, so no live write path sets `supersedes_id`
  today. Fixed anyway, ahead of any future group wiring up aspect
  versioning — workflow invariants live in triggers, never only in the
  UI that happens to exist today. Proved 3/3.
- **Every table using `supersedes_id` in this codebase is now
  covered** — a repo-wide search confirms exactly these three tables
  use the pattern, and all three now carry an automated,
  adversarially-proven roll trigger.

**Cross-tenant UUID-substitution attacks** (5 record types the brief
named — legal obligations, controlled documents, audit findings,
management reviews, environmental permits — both read and write,
against a simulated live `authenticated` session):
**zero vulnerabilities found**, 13/13 checks passed
(`supabase/probes/phase5_qa_cross_tenant.sql`).

**Storage security**: `hs_evidence_client_read` confirmed to genuinely
inherit `hs_files`' own RLS through its `EXISTS` subquery, not an
independently-maintained boundary that could drift — no cross-client
access possible for any entity type.

**RLS sweep**: all 27 Phase 5 tables plus the two 165/166-fixed tables
confirmed RLS-on, no `anon` grant anywhere, no permissive `USING
(true)` policy.

**Governance calendar correctness, network-failure-during-write, and
every already-proven per-group invariant** (aspect versioning, ISO
evidence-mapping non-mutation, legal-applicability confirm gate,
document immutability/effective-date/acknowledgement-pinning,
objectives/management-review/audit-finding history) are all covered in
the handover doc's §D.5-D.7 — cited against their own group's live
probe rather than re-derived, since nothing in this pass touched those
triggers.

**Regression of pre-existing protected modules** (Referrals, A2I,
Development Plans, E-Learning, Broadcast, Billing, HR, Recruitment,
every Phase 1-4 H&S/workforce/operational-safety system): the full
green test suites ARE the regression suite (none deleted, none
skipped), both production builds compile, and a live-DB sweep confirmed
RLS/grants/triggers/constraints on 21 sampled pre-existing critical
tables — including `profiles`' three security-hardening guard triggers
(088/093) — are untouched by anything in Phase 5.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(**1326 admin** — 1320 + 6 new: `emergencyPlanSupersedeRaceSql.test.ts`
(3) and `environmentalAspectSupersedeRaceSql.test.ts` (3);
`documentSiblingRaceSql.test.ts` (3) was already inside the 1320
baseline, having landed with migration 164 before this pass began;
**626 portal**, unchanged — this pass's portal edits were read-only
page markup with no new route), all five CI guards pass
(`check-shared-dupes.sh`: 43 pairs; `check-row-cap.sh`: clean;
`check-route-validation.sh`: 44, unchanged; `check-admin-routes-linked.sh`:
75 pages, all reachable; `check-blind-updates.sh`: 102, unchanged), both
production builds compile. Migrations 164, 165, 166 applied and
verified live — each: trigger exists, function is `SECURITY DEFINER`,
neither `anon` nor `authenticated` can execute it directly, and the
specific bug scenario re-proved fixed against the LIVE function, not
the dry-run copy.

**Phase 5 is complete. Phase 6 is NOT to begin** until this branch is
merged and deployed, per the operator's standing instruction.

### Phase 5 gate follow-up: the admin routes-linked guard rewritten
### (2026-09-29)

Before opening the PR, the handover's own "minor issues" list (§G) was
reviewed to decide what actually needed fixing versus what was already
a documented, deliberate scope decision. One was genuinely fixable:
**`check-admin-routes-linked.sh` matched only the TOP-LEVEL path
segment against the sidebar**, which is exactly why Group 9 found
three `/health-safety/...` pages unlinked without the guard catching
it — each sat under an already-linked prefix while having no link of
its own anywhere in the app.

- **Rewritten to check every STATIC (non-dynamic-segment) route's FULL
  path against a literal reference ANYWHERE in the admin app** — the
  sidebar, a tab, a button, a redirect — the same "quoted literal,
  own-directory excluded" approach `portalPagesLinked.test.ts` (the
  portal's own equivalent of this script) already established. A
  dynamic route (`[id]`, `[companyId]`, …) stays excluded: it's reached
  at runtime with a computed path, never a literal string a text search
  could find.
- **The rewrite itself found one genuinely unlinked-by-design page**:
  `/clients/new`, a retired page kept only as a redirect to
  `/clients/onboard` for old bookmarks — its only mention anywhere is a
  code comment on the page that replaced it. Added to the guard's
  `ALLOWED` list with that reason, the same pattern the script already
  used for `/dashboard` (which needed no entry: it appears as a literal
  `'/dashboard'` string in `AdminSidebar.tsx` itself).
- **Mutation-tested against the real codebase, not just read**: a
  single-reference route (`/health-safety/governance-calendar`) with
  its one link removed correctly fails; restored, and the real,
  unmodified codebase passes clean at 42 static routes checked, 0
  unlinked. Runtime: under a second.
- The guard's own reported count changed meaning — 75 → 42 — because it
  now counts STATIC routes only (the old count included every
  `page.tsx` under a linked top-level dynamic-segment tree, which said
  nothing about whether that specific page was itself reachable).

The other three §G minor issues were reviewed and left as-is,
deliberately: `environmental_monitoring.within_limit`'s upper-bound-only
shape and the inert Tavily research table are both documented, in-scope
decisions, not bugs; permit checklist responses are a pre-existing
Phase 4 scope note, unrelated to this phase.

Verified: `tsc --noEmit` clean both apps (the change is a shell script,
no TypeScript touched), full `vitest run` green (1326 admin, 626
portal, unchanged), all five CI guards pass
(`check-admin-routes-linked.sh`: 42 static routes, all reachable — the
new, more precise count), both production builds compile.

---

## Core-OS 360 Phase 6: Laws Safety Consultant Command Centre (2026-09-29,
## migrations 167-172)

Full handover + QA report: `docs/CORE_OS_360_PHASE6_HANDOVER.md`.
**Gate: PASS.** Delivered in 7 independently-verified, individually-merged
groups (PRs #232-#238) — unlike earlier phases, every group's PR was
merged into `main` as soon as it was green, per the operator's own
"regular merges so you don't lose anything" instruction, rather than
staying on one long-lived branch until the phase's own final pass.

A consultancy (e.g. Laws Safety) needs to work across MANY client
organisations without the one-client-at-a-time cost the rest of this
platform assumes: switching into a client, doing one thing, switching
out, over and over. The Command Centre is the portfolio-wide surface
that removes that cost — read AND write, for the tables this phase
owns — while never touching the single-tenant guarantees every other
table in this codebase already relies on.

### The one architectural fact every group built on

**RLS cannot answer a cross-client question.** Every table's RLS
resolves through single-valued `my_company_id()` — the currently
ACTIVE organisation. Two patterns close this, chosen per read/write:

- **Portfolio-wide RLS, for writes**: `consultancy_organisation_id =
  (SELECT my_home_company_id()) AND has_capability(row's own
  client_organisation_id, cap)`. `my_home_company_id()` is ALWAYS the
  consultancy, whatever is currently active; `has_capability(p_org,
  cap)` checks an ARBITRARY org parameter, never necessarily the
  active one. This is what lets a consultant log a visit or a ledger
  entry against a client WITHOUT EVER SWITCHING INTO THEM — the exact
  bug Group 2's own live probe caught in its first draft
  (`consultancy_organisation_id = my_company_id()` can only be true
  while impossibly "active in your own consultancy home", the
  one-client-at-a-time shape this whole phase exists to remove).
- **Service-role-mediated bulk reads, for anything spanning many rows
  across many organisations at once** (Attention Queue, Calendar,
  portfolio health view): `portfolio_organisations()` (167, SECURITY
  DEFINER, reads `auth.uid()` itself — MUST be called through the
  user's own session, never the service role, which has no
  `auth.uid()` and would see nothing) gives the caller's own
  authorised org-id list; every bulk read then uses the SERVICE ROLE
  scoped by `.in('company_id', authorisedIds)`. Never wider than RLS
  would allow one query at a time — just all of them, in one batch,
  because the id list itself came from the user's own valid grants.

`portfolio_organisations()` is the ONE function every page, route and
audit event in this phase traces its authorisation back to, directly
or via `portalAccess.ts`'s `portfolioIncludes()`.

### Group 1 (migration 167): the foundation

`grant_relationship_current()` (checks a grant's underlying
`organisation_relationships` row is still live — closes a real
cascade gap: an unrevoked grant surviving a revoked/expired
relationship); redefines `my_active_grant()`/`has_capability()`/
`set_active_organisation()`/`my_organisations()` to call it;
`portfolio_organisations()`; `access_scope_allows()` (Phase 1 debt
H.2, finally enforced: a scoped grant — `health_safety`/`hr`/
`recruitment`/`full` — narrows which capabilities it carries, never
widens); seeds the new `consultancy.service_manage` capability,
distinct from `consultancy.manage_access` (who HAS access) and
`consultancy.client_access` (may READ a client's Command Centre data).

### Group 2 (migration 168): service scope, visits, health snapshot

`consultancy_service_scopes` (service type, dates, owner, included/
excluded scope, review frequency, commercial reference — "not full
contract management, but makes consultant responsibility clear," per
the brief's own words) and `consultancy_visits`, **deliberately
minimal** (date, type, status, who, where) — Phase 7 ("Consultant
Visit Mode & Automated Site-Visit Reporting") explicitly OWNS the full
workflow (pre-visit briefs, templates, mobile mode, the report
builder) and EXTENDS this table, never replaces it, the same "reuse,
never a parallel system" rule every phase since Phase 4's own
existing-operations audit has followed. Both tables' write RLS uses
the portfolio-wide pattern above; `consultancy_relationship_live()`
checks the underlying (consultancy, client) relationship is still
active — a scope or visit cannot be filed against a client whose
contract has already ended, even by someone briefly still holding an
unrevoked grant.

`client_health_snapshots` gains 13 nullable/zero-defaulted columns —
purely additive, the existing band/engagement-score logic in
`lib/health/scoring.ts` completely untouched. Filled by
`lib/health/portfolioCounts.ts`'s `computePortfolioCounts()`, a pure
function wired into the EXISTING daily `/api/cron/health-snapshot`
route as 13 more paged queries. **No new cron, no new table.**

**This table's RLS is staff-only, deliberately, and stays that way.**
Migration 168 added columns but never a consultancy-read policy —
every Command Centre page reads it via the service role (pattern 2
above), scoped by the authorised org-id list. An authorised
consultant's own PLAIN session sees nothing here, for their own
authorised clients OR anyone else's — proven live in Group 8's own
tenant-isolation probe. This is not a gap; it is the architecture
working as designed, and a future reader must not "fix" it by adding
a consultancy-read policy without re-reading this note first.

### Group 3 (migration 169): the Client Service Ledger

The first full Service Ledger. "Ledger entries should originate from
real platform events OR AUTHORISED MANUAL SERVICE ENTRIES" — the
automated half shipped in this group (`lib/events/serviceLedgerRules.ts`,
10 rules, one per `entry_type`: visit/audit/document/report/
service_request_resolved/action_closed/broadcast/training/
incident_support/management_review_support); the manual half's RLS
was built here too (`consultancy_service_ledger_consultancy_manual_insert`
— `entry_type` forced `'manual'`, `source_type`/`source_id` forced
NULL, `created_by` forced to `auth.uid()`, all by the `WITH CHECK`,
never trusted from the app) but had **no writer anywhere** until Group
7 closed it — see below.

**Idempotency is the `UNIQUE (consultancy_organisation_id,
client_organisation_id, source_type, source_id)` constraint**, not the
`ignoreDuplicates` flag — that flag only avoids a logged error on a
re-processed event. A manual entry's forced-NULL `source_type`/
`source_id` means it is EXEMPT from this constraint by ordinary
Postgres NULL-inequality semantics — a consultant may log unlimited
distinct manual notes, each a genuinely new row.

**Every automated entry attributes by the EVENT'S OWN ACTOR, never by
which client the row belongs to**: the actor's home organisation must
be a consultancy AND hold a live relationship to the event's own
company — a Core OS 360 STAFF action never logs here, since the
ledger's whole purpose is proving THIRD-PARTY consultancy value.

### Group 4 (portal only, no migration): Attention Queue, Client 360,
### Consultant Workload

`portal/src/lib/consultancy/attentionQueue.ts` — a pure aggregate over
12 source categories (open critical actions, overdue legal
evaluations, workers not ready, contractor expiries, major audit
findings, …), each classified into a severity. **Never a duplicate
action table** — the queue reads existing rows and labels them, the
same "never build a second action table" doctrine this codebase has
followed since Phase 2. `/consultancy/clients/[id]` (Client 360) is
the per-client cockpit; `/consultancy/workload` reuses the existing
action/service engines rather than a new task database, per the
brief's own instruction.

### Group 5 (migration 170 + portal): Cross-Client Calendar, Roadmap
### Integration

`portal/src/lib/consultancy/portfolioCalendar.ts` — a read-time
aggregate over 8 already-dated source tables (visits, audits, legal
reviews, management reviews, training, document reviews, roadmap
milestones, material expiries) into 8 event types. No new scheduling
table — the source rows remain the single source of truth, the same
"TypeScript over one large SQL view" choice `governanceCalendarEvents()`
(Phase 5) already made.

`requirement_evidence_links.source_type` (Phase 5's evidence-link
foundation) widens to include `'milestone'`; `hs_entity_table()` gains
`'milestone' → 'milestones'`, every prior branch copied unchanged.
`EvidenceLinksPanel.tsx` (the SAME component Phase 5 built for legal
obligations/objectives/audit findings) is reused UNCHANGED, just with
its `sourceType` union widened — no new UI component, since the
existing one already does exactly what a milestone needs.

### Group 6 (migration 171 + portal): Value Report extension,
### Communication Timeline

**The existing, LIVE monthly `computeValueReport()` is completely
untouched** — real regression risk to the already-working monthly
cron and page, avoided entirely. `computeQuarterlyValueReport()`/
`quarterMonths()` compose the SAME function three times and merge
field-by-field: FLOW fields (new roles, tickets raised, actions
completed, …) SUMMED across the quarter; STOCK fields (active roles,
MRR, ISO readiness, objectives on track, open audit findings, …) taken
from the quarter's LAST month only — summing three snapshots of the
same fact would triple-count it. `reviewsOverdue` is treated as stock
for the identical reason ("overdue as of the quarter's close", the
same "overdue is relative to the report period, not today" rule
`leadMetrics.ts` already established for the monthly report).

`ValueReportClient.tsx` gains a monthly/quarterly toggle, a quarter
selector, a narrative textarea, and "Save to Client Reports" —
renders the identical PDF Download produces, uploads it to the
client's PRIVATE `documents` bucket (never `getPublicUrl` on a private
bucket — the same discipline `ReportUploadForm.tsx` already
established), inserts a `reports` row. Migration 171 adds the one
nullable `reports.narrative` column this needs — additive, every
existing reader/writer of `reports` unaffected (none select `'*'`
blindly). `buildReportPdf.ts` renders an optional "CONSULTANT NOTES"
section only when narrative is present.

`portal/src/lib/consultancy/communicationTimeline.ts` merges
`email_log`, Broadcast actions (`actions.created_by_admin`),
`service_requests` (raised AND responded as two SEPARATE events — a
request produces `client_originated` the moment it is raised, and only
a SECOND, `shared_with_client` entry once `responded_at` is set),
issued value reports, and manual `consultancy_service_ledger` notes
(the one entry_type with no `source_type`/`source_id` — a note never
itself communicated to anyone) into one chronological feed, tagging
each entry `client_originated` / `shared_with_client` /
`internal_consultancy`. "support tickets" in the brief means
`service_requests` — `tickets`/`ticket_messages` were removed entirely
in an earlier sweep (see "Support & BD in sync" above); nothing
resurrects them here.

### Group 7 (migration 172 + portal): Client Switcher hardening,
### Events/Audit sweep, and two real spec gaps closed

**The spec names five events verbatim**: `consultancy.client_accessed`,
`service_scope.updated`, `client_roadmap.updated`,
`value_report.generated`, `service_ledger.entry_created`.
`service_scope.updated` had ALREADY fired since Group 2 — 168's own
`audit_row('service_scope', 'client_organisation_id', ...)` trigger
produces exactly that string via `audit_row()`'s own
`<entity>.<created|updated|deleted>` convention. `client_roadmap.updated`
closes the one remaining gap that fits the SAME convention: migration
172 adds an `audit_row` trigger to `milestones` (whitelist `pillar,
title, owner, due_date, status, quarter, sort_order` — never the
free-text `description`), producing `client_roadmap.created/updated/
deleted` for free. `value_report.generated` and
`service_ledger.entry_created` do NOT match that convention (their
verbs are the spec's own literal wording, not "created"/"updated"), so
BOTH are explicit app-level `auditLog()` calls instead — a second,
differently-worded event alongside a generic one would be confusing,
not additive, the same reasoning migration 172's own header comment
gives.

- **`value_report.generated`** fires from `ValueReportClient.tsx`'s
  `saveReport()`, via a NEW narrowly-scoped
  `POST /api/admin/value-reports/audit` route — a client component
  cannot call `admin/src/lib/audit.ts` directly, since that module
  writes through the SERVICE-ROLE `audit_log()` RPC and the key must
  never reach the browser. The route's action string is FIXED, never
  taken from the request body, and the report/company ids are only
  ever used as opaque identifiers — never a general-purpose audit
  endpoint.
- **`service_ledger.entry_created`** fires from BOTH ledger-write
  paths: the automated consumer (`serviceLedgerRules.ts`) now checks
  whether its `upsert(..., { ignoreDuplicates: true }).select('id')`
  actually returned a row — empty on a skipped duplicate, by real
  PostgREST `ON CONFLICT DO NOTHING RETURNING` semantics — before
  firing, so a re-processed event never double-audits; and the new
  manual-entry route (below), synchronously after a successful insert.
- **`consultancy.client_accessed`** fires from the portal's Client 360
  page on every view — inherently app-level, since a page view has no
  row to trigger from. `portal/src/lib/audit.ts` is a NEW file
  mirroring admin's own `audit.ts`, but NOT a shared-dupe pair — each
  app's `AuditAction` union names only the events that app can
  actually fire, the same reason the two files were never meant to be
  byte-identical.

**Two real spec gaps, found by re-reading the brief before this QA
pass, not by an external report**: sections 5 (Service Scope) and 9
(Service Ledger's own "or authorised manual service entries") both had
full, correct RLS since Groups 2/3 — and NO WRITER ANYWHERE. A
repo-wide grep confirmed zero `.insert(`/`.update(` call sites against
either table outside the automated consumer. Closed in this group:
two new validated portal routes (`POST /api/consultancy/clients/[id]/
service-scope`, `.../ledger-entry`), both running under the CALLER'S
OWN SESSION (never the service role) so RLS stays the real
authorization boundary — the route's own job is only shaping/
validating the request and surfacing a 42501 refusal as a clear 403,
not re-implementing the capability check. `ClientActionForms.tsx` on
Client 360 is the first write UI either table has ever had.

**Client Switcher hardening (section 12) — what already existed vs.
what was actually missing.** Phase 1's `readEffectiveCompany()` +
`sessionIsStale()` (portal's `(portal)/layout.tsx`) ALREADY
re-derives the active organisation from the database on EVERY server
render and redirects a stale session cookie before anything renders —
this protects every navigation and reload, the majority of the actual
risk. The one gap: a tab that never reloads (a form left open while
the organisation switches in a different tab). New
`StaleOrganisationGuard.tsx` polls `GET /api/organisation/current` on
focus/visibilitychange — DELIBERATELY never a timer, since those
moments are exactly when a stale tab is actually being returned to —
and shows a blocking banner on a mismatch. Mounted once in
`PortalShell.tsx`, renders nothing for a single-organisation user
(same guard `OrganisationBar` itself already applies — no switcher to
leave stale). Its comparison logic is extracted as a pure,
tested `isOrganisationStale()`.

**Crucially, every Phase 6 Command Centre write is immune to the
stale-tab class of bug BY CONSTRUCTION**: every write route takes its
target organisation from the URL's own `[id]` param (checked against
`portfolioIncludes()`), NEVER from "whichever organisation happens to
be active" — so even a genuinely stale Command Centre tab's write
still lands on the client the form was opened for. The guard exists
for the CLASSIC single-tenant workspace ("Open full workspace"), where
writes DO derive their target from the active session, and is the one
place this specific risk is real.

**`useUnsavedChangesWarning()`** (NEW shared-dupe pair,
`components/ui/`) — native `beforeunload`, no custom dialog, since
`window.location.assign()` (OrganisationBar's own switch action, and
every full navigation in this codebase) triggers a REAL browser
navigation that only the native event can intercept. Retrofitting
every existing form was explicitly out of scope for one group — the
hook is the reusable primitive; `ClientActionForms.tsx`'s two new
forms are its first and, for now, only adopters.

### Group 8: full regression, adversarial QA, handover

**Gate: PASS** — a genuine contrast with Phase 5's own Group 10 (which
found two real High concurrency bugs): every category the Senior QA
command names came back clean on the FIRST pass here.

- **Tenant isolation** (`supabase/probes/phase6_tenant_isolation.sql`,
  live, rolled back, 6/6): a consultancy authorised for Clients A/B
  but NOT C — `portfolio_organisations()` never leaks C;
  `client_health_snapshots` correctly refuses even an authorised
  session directly (confirms §the staff-only design above, not a
  bug); `consultancy_service_ledger` shows exactly A/B; a manual
  ledger write and a service-scope write against unauthorised C are
  BOTH refused; a milestone genuinely owned by C stays invisible under
  the consultant's own session — proving 172's new audit trigger
  widened nothing about who may read or write `milestones`.
- **Stale-tab mutation**: see Group 7's own section above — the
  Command Centre's writes are immune by construction; the one real
  risk surface (the classic workspace) already had a database guard
  from Phase 1, now supplemented with a browser-level one.
- **Service Ledger duplicate prevention**: re-confirmed via
  `serviceLedgerRules.test.ts`'s existing re-processed-event case,
  plus two NEW cases pinning `service_ledger.entry_created` fires
  exactly once on a genuine insert and not at all on a duplicate skip.
- **Value Report figure reconciliation**: `computeQuarterlyValueReport.test.ts`
  (7 cases) pins the exact regression a naive sum-everything
  implementation would produce (activeRoles 3× too high, reviewsOverdue
  triple-counted) and proves the real implementation avoids both.
- **Communication visibility classes**: `communicationTimeline.test.ts`
  (6 cases), including the case most likely gotten backwards (a
  service request's raise and its response are two SEPARATE, correctly
  classified entries, never one ambiguous one).
- **Performance at 500+ clients / 5,000+ sites**
  (`supabase/probes/phase6_perf.sql`, live, rolled back): 120 client
  organisations, 5,040 sites (the spec's own "5,000+" mark), measured
  under a REAL consultant session with RLS applied, not bypassed.
  `portfolio_organisations()` 5.8ms, `client_health_snapshots` bulk
  read 5.9ms, `consultancy_visits` bulk read 58.6ms,
  `consultancy_service_ledger` bulk read 50.4ms — extrapolated
  linearly (every read is an indexed per-organisation lookup, the same
  extrapolation Phase 3's own perf probe used) to ~24-244ms at the
  spec's full 500-client scale. **The 5,040 seeded sites had zero
  measurable effect on any Phase 6 read** — confirmed directly (a
  site-count query under the consultant session returned 0, correctly
  reflecting that NO Phase 6 page reads `hs_sites` at all — Client 360
  shows H&S/workforce state via the pre-computed
  `client_health_snapshots` aggregate, never raw site rows; sites are
  only ever seen inside the classic single-tenant workspace, which
  this phase never touches).
- **Regression across Referrals, A2I, E-Learning, Broadcast, Billing,
  HR, Recruitment and Phases 2-5**: the full test suites ARE the
  regression suite — 1391 admin / 672 portal, all green, spot-checked
  by name for the modules the Senior QA command specifically lists.

**One Medium gap found and closed within this same phase** (not
carried as debt): Service Scope / manual Service Ledger writer UI,
covered under Group 7 above — a named, literal spec requirement that
was schema-complete but functionally absent until this pass's own
re-read of the brief caught it.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1391 admin — 850 baseline + every Phase 6 group's own tests; 672
portal), all five CI guards pass (46 shared-dupe pairs, up from 43 at
the end of Phase 5; row-cap clean; 44 unvalidated routes, unchanged;
42 static admin routes, all reachable; 102 blind-update chains,
unchanged), both production builds compile. Migrations 167-172
applied and verified live throughout, each read back from the catalog
rather than trusted from the apply call's own success response.

**Phase 7 ("Consultant Visit Mode & Automated Site-Visit Reporting")
may begin** — it explicitly EXTENDS `consultancy_visits` (168's own
documented plan), never replaces it.

---

## Core-OS 360 Phase 7: Consultant Visit Mode & Automated Site-Visit
## Reporting (complete, migrations 173-176)

Same discipline as every phase since Phase 4: logical, independently
verified groups — migration → apply live → live rolled-back probe →
SQL-shape test → TS/UI work → `tsc`/`vitest`/CI guards/builds clean →
commit → PR → merge → next group. One visit, one page across its whole
lifecycle (`consultancy/clients/[id]/visits/[visitId]/page.tsx`) rather
than a page per stage — each group adds a section to the SAME page.

### Group 1 (migration 173): the visit entity, extended in place

`consultancy_visits` (168's own deliberately-minimal table) gains the
full lifecycle: `previous_visit_id` (same-client only, guarded by
`consultancy_visit_previous_guard()` — a legitimate cross-CLIENT
reference inside the SAME consultancy's portfolio is refused, not just
an unrelated stranger org), `started_at`/`ended_at`, `scope`,
`client_attendees`, `internal_notes`/`shared_summary` (the visibility
split Group 2's brief and Group 6's future report both key off),
`template_id`. `status` widens from 168's 3 values to the full
8-value lifecycle (`planned → confirmed → in_progress →
awaiting_report → report_draft → report_issued → closed`, plus
`cancelled`) — 0 live rows existed, so the CHECK was tightened
directly. New `consultancy_visit_templates`/`consultancy_visit_
template_items` (a template + its checklist items), portfolio-wide RLS
(`my_home_company_id()`, never `my_company_id()`), gated on
`consultancy.service_manage` — the same capability every Phase 6 write
already uses, not a new one.

### Group 2 (no new migration): Pre-Visit Brief + template instantiation

`buildPreVisitBrief()`/`loadPreVisitBrief()` (portal) reuse the
EXISTING `buildAttentionQueue()` output filtered to one client, rather
than re-deriving the same open-items facts a second time — the
standing "never a second source of the same fact" rule. `POST
/api/consultancy/clients/[id]/visits` books a visit: `previous_
visit_id` is resolved SERVER-SIDE from the client's own most recent
closed/report_issued visit (never taken from the request — a client
could otherwise be pointed at another client's visit, which the
migration 173 guard would refuse anyway, but there's no reason to make
the caller get this right when the server already knows), and a given
`template_id` is verified by reading it under the caller's OWN RLS
session first, never trusted from the body. `/consultancy/templates`
is a direct-session-write CRUD page for templates/items, the same
"session insert under RLS" pattern `DocumentsClient.tsx`/
`EquipmentClient.tsx` already use for staff-side register writes.

### Group 3 (migration 174): structured observations + mobile capture

Section 5 (Structured Observations) and section 4 (Mobile/Tablet Visit
Mode) of the Phase 7 spec, built together because the capture UI is
where an observation is actually created.

- **`visit_observations`**: `observation_type` (`positive |
  observation | improvement | nonconformance | immediate_danger`),
  optional `severity` (`minor | moderate | major | critical`),
  `client_visible` (default true — a client sees a finding unless
  explicitly marked internal-only), `action_required`, and a
  polymorphic `linked_source_type`/`linked_source_id` (an asset,
  contractor, person or document this observation is ABOUT) — the same
  `(source_type, source_id)` shape `requirement_evidence_links` (163)
  already established for exactly this "link to one of several kinds
  of existing record" need.
- **`company_id` is derived from the visit, never trusted from the
  caller** (`visit_observation_fill()`, BEFORE INSERT, SECURITY
  DEFINER) — the same "derived, not asked" discipline
  `hs_audit_response_fill()`/`hs_completion_fill()` already use.
- **The Phase 7 QA command's own named attack — "attempt to attach
  Client B asset/document/person during Client A visit" — is refused
  in that same trigger**, via `hs_entity_company()`/`hs_entity_table()`
  (both gain a `'visit_observation'` branch, additive to every prior
  branch — a regression test pins four pre-existing branches survive
  unchanged). A linked record naming a DIFFERENT company than the
  visit's own client raises `42501`. Proved live
  (`supabase/probes/174_visit_observations_mobile_capture.sql`, 11/11):
  a Client B asset is refused, a same-client asset accepted.
- **Immediate-danger findings escalate SYNCHRONOUSLY, inside the same
  INSERT** (`visit_observation_escalate()`, AFTER INSERT) — the exact
  discipline `hs_quarantine_asset()` (146) / LOLER immediate danger
  (149) already established: a safety-critical consequence cannot wait
  for the five-minute `platform_events` consumer. Never gated on
  `action_required` — an immediate-danger observation escalates
  REGARDLESS of what that flag says, the same defence-in-depth
  `hs_submit_inspection()` already applies to its own callers. Raises
  one urgent/critical, `verification_required` action
  (`source_type = 'consultant_visit'`, already a valid CHECK value
  since Phase 4) and stamps `resulting_action_id` on the observation.
  A non-immediate-danger observation creates no action. `visit_
  observations` also joins `TRIGGERED_ENTITIES` for an EVENTUAL
  notification alongside (never instead of) the synchronous action.
- **Portfolio-wide RLS, keyed on the VISIT's own client** (the exact
  Phase 6 pattern: `consultancy_organisation_id = my_home_company_id()
  AND has_capability(v.client_organisation_id, 'consultancy.service_
  manage')`, resolved via an `EXISTS` against `consultancy_visits` —
  never `my_company_id()`). A client read policy shows only
  `client_visible = true` rows — nothing here is self-certified, and
  an internal-only note is never shown to the client it's about.
- **The single-tenant vs. portfolio-wide tension in the pre-existing
  H&S evidence infrastructure, found and resolved here.**
  `hs_evidence_readable()`/`hs_evidence_writable()`/the `hs_files`
  RLS/the `hs-evidence` storage bucket policies all gate on
  `company_id = my_company_id()` — the ACTIVE org, which a
  portfolio-wide consultant who never switches into the client will
  never satisfy. Resolved by ADDING two new, narrowly-scoped `hs_files`
  policies and one new storage policy, all scoped to `entity_type =
  'visit_observation'` only — never modifying `hs_files_client_read`/
  `hs_files_client_insert` or the shared evidence functions used by 20+
  other entity types. RLS ORs permissive policies, so this is purely
  additive; a regression check (probe check 9) confirms a pre-existing
  entity type (`equipment`) is still refused cross-organisation exactly
  as before.
- **Capture is insert-as-you-go, not a batch submit** — unlike
  `hs_audits`' one atomic `hs_submit_audit()`, each observation is its
  own session insert the moment the form is submitted, because a visit
  can run for hours and a consultant should never lose observations 1
  through 9 waiting to submit number 10. "Offline-tolerant" here means
  precisely: the observation CURRENTLY being typed survives a dropped
  connection, reload or closed tab (localStorage, keyed per visit,
  wrapped in try/catch per this codebase's own browser-storage
  discipline) — not a full background-sync queue of unsent rows. A
  submit made with genuinely no connection simply fails and stays in
  the draft.
  `VisitCaptureClient.tsx` also carries the visit's own start/finish
  controls (`planned/confirmed → in_progress`, stamping `started_at`;
  `in_progress → awaiting_report`, stamping `ended_at`) as ordinary
  `COUNT_EXACT`/`judgeWrite()` updates — 173 deliberately left
  `consultancy_visits.status` with no lifecycle GUARD trigger (unlike
  permits/isolations), so any authorised session may move between any
  two listed values; the UI is what keeps the sequence sane for now.
- **Evidence photos** reuse the existing `uploadEvidence()`/
  `evidenceUrl()` helpers verbatim (`entity_type: 'visit_observation'`)
  — no new upload path, no new signing logic.
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (1414 admin — 14 new `visitObservationsSql.test.ts` cases; 690
  portal, unchanged — this group's portal work is UI/loader code with
  no new portal test file, covered by the existing
  `clientServerBoundary.test.ts`/`portalPagesLinked.test.ts` sweeps
  picking up the new component and route automatically), all five CI
  guards pass (46 shared-dupe pairs, unchanged; row-cap clean; 44
  unvalidated routes, unchanged; 42 static admin routes, all reachable;
  102 blind-update chains, unchanged), both production builds compile.
  Migration 174 applied live and verified (11/11 probe checks —
  the first run caught a probe-setup gap, not a migration defect: a
  randomly-picked second real `auth.users` row was already staff,
  which needed an explicit non-staff role before it could actually
  exercise the portfolio RLS policy under test).

### Group 4 (migration 175): Universal Actions integration + "verify previous actions"

The same single-tenant gap Group 3 found in the H&S evidence
infrastructure, found again in the universal `actions` table itself —
live inspection (`pg_policy`) before writing a line of SQL confirmed
`actions_org_insert`/`client_actions_select`/`client_actions_update`
all gate on `company_id = my_company_id()` (the ACTIVE org), which a
portfolio-wide consultant who never switches into the client can never
satisfy.

- **Three new, additive policies** (`actions_consultancy_select/
  insert/update`), gated on `has_capability(company_id, 'consultancy.
  service_manage')` — never modifying the three pre-existing
  single-tenant ones every other write path in this codebase still
  relies on. **No trigger change was needed at all**: `actions_
  lifecycle()`'s live, latest definition (read via
  `pg_get_functiondef()` before writing this, per this codebase's own
  standing rule — "read the LIVE function body immediately before
  extending a shared function, never guess from an older migration
  file") already lets anyone holding `actions.assign` on the row's own
  `company_id` verify, reject or otherwise progress an action, and the
  seeded `consultant` role (117) already carries `actions.assign`. So
  once the RLS gate opened, the consultant's own capability grant was
  already everything the pre-existing triggers needed — "nobody
  verifies their own work" (`verified_by = completed_by` refused,
  `123514`) is completely unaffected, since it checks WHO is acting,
  never WHICH policy let them reach the row.
- **"Raise action" (`VisitCaptureClient.tsx`)**: a SEPARATE, manual
  path from `visit_observation_escalate()`'s synchronous emergency
  escalation (174) — for an observation flagged `action_required` that
  needs a follow-up without being an `immediate_danger`. Maps
  observation severity to the action vocabulary, deliberately capped
  BELOW `urgent` priority (`minor/moderate → normal`,
  `major/critical → high`) — the emergency path's `urgent` priority
  stays a visibly distinct signal, never collided with by a manually
  raised one. Two client-side writes (insert the action, then link
  `visit_observations.resulting_action_id`) rather than one atomic RPC
  — acceptable here because it is a single deliberate click, not an
  automation needing the same atomicity guarantee as a database
  trigger, and the button itself disappears from local state the
  instant the first write succeeds, so a double-click cannot double-raise.
- **"Verify previous actions" (`PreviousActionVerify.tsx`, extending
  the Group 2 Pre-Visit Brief's previously read-only action list)**:
  Verify (`status → complete`, `verified_at`/`verified_by` stamped by
  the pre-existing trigger) and Send back (`status → in_progress`,
  requires a `verification_rejection_reason`) for any action showing
  `awaiting_verification`. The component adds no validation of its
  own beyond a client-side "did you type a reason" nicety — every real
  rule (who may verify, who may reject, self-verification) is the
  database's, surfaced verbatim in the UI on refusal.
- **A probe-construction trap, not a migration defect, caught on the
  first run**: `request.jwt.claims` is TRANSACTION-scoped
  (`set_config`'s third argument), so it survives `RESET ROLE` — a
  stale claim from an earlier check leaked into a later "as the
  system" bookkeeping write via `auth.uid()`, silently changing WHO
  completed the probe's test action and making the self-verification
  check impossible to reach. Fixed by explicitly clearing
  `request.jwt.claims` before any write not meant to carry a session
  identity — the same discipline this file's own history already
  requires for the "unauthorised consultant" pattern.
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (1417 admin — 3 new `actionsVerificationSql.test.ts` cases; 691
  portal — unchanged besides `clientServerBoundary.test.ts` picking up
  the new component automatically), all five CI guards pass (46
  shared-dupe pairs, unchanged; row-cap clean; 44 unvalidated routes,
  unchanged; 42 static admin routes, all reachable; 102 blind-update
  chains, unchanged — both new UPDATE call sites use `COUNT_EXACT`/
  `judgeWrite()` from the start), both production builds compile.
  Migration 175 applied live and verified (6/6 probe checks —
  `supabase/probes/175_consultancy_actions_verification.sql`).

### Group 5 (migration 176): Report Builder, versioning, distribution

- **`consultancy_visit_reports` holds only what a consultant WRITES**
  (summary, recommendations, next-visit date, issue bookkeeping) — the
  report's FINDINGS are never duplicated onto it. Both the on-screen
  preview and the PDF read `visit_observations` LIVE, `client_visible
  = true` only, at generation time — the standing "never a second
  source of the same fact" rule, applied here to a consultant's own
  narrative vs. the structured findings underneath it.
- **Versioning copies `hs_documents`'/`emergency_plans`'/
  `environmental_aspects`' own discipline exactly, including the
  sibling-race lesson Phase 5 Group 10 (migrations 164-166) learned
  the hard way** — built in from day one rather than needing a second
  pass to rediscover it: a revision reaching `issued` supersedes not
  just the row it names via `supersedes_id` but ANY other row sharing
  that same parent. A draft is issued IN PLACE the first time (no
  `supersedes_id`); only a REVISION of an already-issued report is a
  new row, and the OLD issued version stays current/visible until the
  revision itself publishes.
- **A real gap found and fixed while WRITING the probe, before running
  it**: `consultancy_visit_report_fill()`'s same-visit check for
  `supersedes_id` only ran at INSERT time — a bare UPDATE could set
  `supersedes_id` with no check at all. Fixed by making `supersedes_id`
  immutable after creation in `consultancy_visit_report_touch()` (the
  same trigger that already refuses `visit_id`/organisation changes),
  re-applied live and re-proved before trusting it.
- **No outbox entry on this table, deliberately** — the ONLY way to
  issue a report is the server route
  (`POST .../visits/[visitId]/report/issue`), which already holds a
  service-role session and does the PDF generation, upload and email
  SYNCHRONOUSLY, the same "a controlled entry point notifies directly,
  no async consumer needed" precedent the H&S Tests public-token route
  already established. **The Service Ledger entry comes for free**:
  issuing inserts a `reports` row (the SAME table/shape
  `ReportUploadForm.tsx` and the monthly value-report cron already
  write), and `ledger_report_generated` (169) already fires on
  `reports.created` — no new consequence rule needed for that.
- **`buildVisitReportPdf.ts` mirrors admin's `buildReportPdf.ts`
  parameter-injection shape exactly** (jsPDF + autoTable passed in,
  never imported at the top of the module) — portal did not previously
  depend on jsPDF/jspdf-autotable at all (its existing "print" pages
  use the browser's native `window.print()`); both were added to
  `portal/package.json` at the SAME versions admin already pins, since
  generating a real downloadable/emailable PDF file — as opposed to a
  print dialog — needs the library, not a browser feature. Evidence
  photos are noted by COUNT in the PDF, never embedded — a reader opens
  the portal to see the photo itself, the same scope note migration
  174's own header records for the mobile capture flow.
- **A dead consequence rule found and fixed along the way**:
  `ledger_visit_completed` had listened for `consultancy_visits.status
  → 'completed'` since Phase 6 (169) — a value that existed only in
  168's ORIGINAL, pre-Phase-7 vocabulary (`scheduled`/`completed`/
  `cancelled`). Migration 173 (Phase 7, Group 1) replaced it with the
  full 8-value lifecycle and nobody updated this rule to match, so it
  had been silently dead code — unreachable by any event this codebase
  could ever emit — since the day 173 shipped, and untested the whole
  time. Fixed to listen for `'report_issued'` instead, the correct
  terminal signal now (real, distributed value delivered — exactly
  what this rule exists to record), with two new test cases pinning
  both the fire and the non-fire.
- **The issue route claims `email_log` FIRST** (insert with a
  `dedupe_key` of `visit-report:<visit_id>:<version>`, the unique index
  from 096), sending only on a successful claim — the same
  "claim-before-send" discipline every other keyed email in this
  codebase already follows, so a double-submit never sends the client
  the same report twice. The visit's own lifecycle advance
  (`awaiting_report`/`report_draft` → `report_issued`) is best-effort
  and logged, never blocking the response — the report is already
  issued and recorded regardless of whether this one bookkeeping
  update lands.
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (1429 admin — 10 new `visitReportsSql.test.ts` cases + 2 new
  `serviceLedgerRules.test.ts` cases for the fixed rule; 692 portal —
  unchanged besides `clientServerBoundary.test.ts` picking up the new
  components automatically), all five CI guards pass (46 shared-dupe
  pairs, unchanged; row-cap clean; 44 unvalidated routes, unchanged —
  the new issue route reads no request body at all; 42 static admin
  routes, all reachable; 102 blind-update chains, unchanged after
  fixing two new ones the guard caught — `ReportBuilderClient.tsx`'s
  draft save and the issue route's best-effort visit-status bump, both
  built without `COUNT_EXACT`/`judgeWrite()` on the first pass and
  corrected before this shipped), both production builds compile.
  Migration 176 applied live and verified (8/8 probe checks —
  `supabase/probes/176_consultancy_visit_reports.sql`).

### Group 6 (no new migration): Follow-up, Service Ledger, Consultant Metrics

- **The follow-up question is "has a visit been BOOKED", never "has a
  report been ISSUED for it"** — booking is the actionable step; the
  report for that visit can follow later.
  `reportsNeedingFollowUp()` (`lib/consultancy/followUpDue.ts`, a new
  shared-dupe pair, pure and unit-tested) filters a report's own
  `next_visit_recommended_date` clear only when the SAME client has a
  DIFFERENT visit scheduled on or after that date — a visit booked
  BEFORE the recommendation, or for a different client, never clears
  it, and the visit the report is itself about never counts as its own
  follow-up.
- **A real pagination hazard, designed around rather than hit**: the
  reminders cron's ONLY termination signal (`readAllPages`) is "did
  this page come back shorter than `PAGE_SIZE`". Filtering rows OUT
  inside a rule's `query()` would shrink a genuinely full page below
  that threshold and stop the walk early — the exact failure class
  `paged.ts`'s own header already warns about. So the new
  `consultancy_visit_reports` reminder rule never filters inside
  `query()`: it fetches the RAW page unfiltered, does one extra query
  for the involved clients' visits, and FLAGS (never removes) each row
  with `_followUpCleared` — `dueDateOf` then returns `null` for a
  cleared row, the pagination-safe way to skip a row this codebase's
  reminder framework already provides.
- **Notifies the CONSULTANCY, never the client** — `{kind:
  'capability', companyId: <client>, capability: 'consultancy.
  service_manage'}`, the exact Phase 6/7 portfolio-wide mechanism,
  resolves to whoever holds a live grant on that client. This is the
  first reminder rule in this codebase to use that audience kind for
  its OWN, not the client's, workflow — a client never hears about
  their own consultant's follow-up scheduling.
- **The Service Ledger needed no new code** — `ledger_visit_completed`
  already covers a visit reaching its terminal state (fixed in Group
  5), and manually-raised or auto-escalated visit actions already flow
  through the existing `ledger_action_closed` rule, since they are
  ordinary `actions` rows with no ledger-specific handling required.
- **Consultant Metrics is factual aggregation only** — no score, no
  AI, nothing predicted, the same posture `lib/health/scoring.ts`/
  `lib/hs/kpis.ts` already take. `computeConsultantMetrics()` (pure,
  unit-tested) reports: visits completed and reports issued in a
  trailing-90-day window; the average days between a visit and its
  report being issued; observations recorded, broken down by type;
  actions raised/closed (`source_type = 'consultant_visit'` only); and
  follow-up compliance — **deliberately NOT period-scoped**, since a
  recommendation made months ago and still unbooked is still
  outstanding today, whatever window is being viewed. New portal page
  `/consultancy/metrics`, linked from the Command Centre home.
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (1437 admin — 7 new `followUpDue.test.ts` cases + 1 new
  `reminders.test.ts` case; 700 portal — 6 new
  `consultantMetrics.test.ts` cases + `clientServerBoundary.test.ts`/
  `portalPagesLinked.test.ts` picking up the new page automatically),
  all five CI guards pass (47 shared-dupe pairs, up from 46 —
  `followUpDue.ts` is the new pair; row-cap clean; 44 unvalidated
  routes, unchanged; 42 static admin routes, all reachable; 102
  blind-update chains, unchanged), both production builds compile.
  No new migration was needed — this group is entirely TypeScript
  (a reminder rule, a notification type, a consequence-rule fix, a
  metrics computation) over the EXISTING 176 schema. The next
  schema-bearing group continues from 177.

### Group 7 (no new migration): visit-mode hardening

- **A consolidated, cross-cutting tenant-isolation proof**
  (`supabase/probes/phase7_tenant_isolation.sql`), in the Phase 6
  Group 8 style — ONE consultant session, authorised for Client A
  only, checked against EVERY table Groups 3-6 added or extended
  (`visit_observations`, `consultancy_visit_reports`, the new
  `actions` consultancy policies) for a genuinely DIFFERENT client, in
  one pass, rather than each migration's own narrower probe repeated.
  **A real probe-construction lesson surfaced while writing it**: Client
  B's visit could not be seeded under the SAME consultancy the test
  session belongs to — `consultancy_visit_guard()` (168) refuses a
  `consultancy_visits` row with no live relationship at all, so testing
  "authorised for A, not B" honestly requires B to belong to a
  genuinely SEPARATE second consultancy, the actual shape a real
  data-isolation breach would take.
- **`ReportBuilderClient.tsx` gains `useUnsavedChangesWarning`**
  (Phase 6 Group 7's own reusable primitive) — the one Phase 7 form
  with real unsaved-work risk and no safety net of its own:
  `VisitCaptureClient.tsx`'s observation form already survives a lost
  tab via its own localStorage draft (174/Group 3), but a report's
  summary/recommendations narrative has no such recovery, and can be
  substantial text. Warns only while genuinely dirty against the last
  loaded/saved values, never after a successful save.
- **Stale-tab mutation was AUDITED, not silently assumed clean**: every
  write Groups 3-6 added is portfolio-wide RLS
  (`my_home_company_id()`/`has_capability()`, never
  `my_company_id()`), so — exactly as Phase 6 Group 7 already found for
  its own Command Centre writes — none of it depends on which
  organisation happens to be ACTIVE in the browser tab. Switching
  organisations mid-edit cannot silently misdirect a visit observation,
  a report save, or an action raise/verify; the classic single-tenant
  workspace remains the only surface where that risk exists, and it
  already has its own guard.
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (1437 admin, unchanged — this group's admin-side work was the probe
  only, no TypeScript; 700 portal, unchanged — the hook adoption is a
  one-line change matching an already-tested primitive, no new test
  file needed), all five CI guards pass, both production builds
  compile. `supabase/probes/phase7_tenant_isolation.sql` run live and
  rolled back, all checks passed.

### Group 8 (no new migration): full regression, adversarial QA, handover

Full handover + QA report: `docs/CORE_OS_360_PHASE7_HANDOVER.md`.
**Gate: PASS WITH MINOR ISSUES.**

**Adversarial review of the whole Phase 7 surface (not just Group 7's
own tenant-isolation probe) found one real, High-severity concurrency
bug in Group 5's own report-issuing route — reproduced in the code's
own logic before being reported, then fixed and proven with a new
targeted test file.**

- **The issue route generated the PDF, uploaded it and inserted the
  `reports` row BEFORE the conditional status-flip that was supposed
  to guard a double-submit.** `POST .../report/issue` read the draft,
  built the PDF, uploaded it to storage, inserted a `reports` row (its
  own Service Ledger entry via `ledger_report_generated`, keyed on
  THAT row's own id — never deduplicated against a sibling), and only
  THEN attempted the conditional `status: 'draft' → 'issued'` update
  that was meant to be the one guard against two concurrent submits. A
  genuine double-click, or two browser tabs open on the same draft,
  would have raced past every one of those steps in parallel — both
  requests see `status = 'draft'`, both generate and upload a PDF, both
  insert a DISTINCT `reports` row (each with its own Service Ledger
  entry) — before the SECOND request's status-flip finally lost the
  race at the very end and only then reported 409, by which point the
  damage (duplicate file, duplicate `reports` row, duplicate ledger
  entry) was already done and irreversible from inside the request.
- **Fixed with a claim-first, compensate-on-failure restructure.** The
  conditional status update now runs FIRST, before any PDF work at
  all: `UPDATE consultancy_visit_reports SET status = 'issued', ... {
  count: 'exact' } WHERE id = draft.id AND status = 'draft'`. Only one
  concurrent request can ever match — the loser is refused with 409
  before a single byte of PDF is generated, before storage is touched,
  before `reports` gets a row. Every subsequent step (PDF build,
  upload, `reports` insert, `storage_path` link-back, visit-status
  bump, email) now runs inside a `try`; any failure anywhere in that
  block reverts the claim (`status` back to `'draft'`, `issued_at`/
  `issued_by` cleared) in a `catch`, so a mid-work failure never leaves
  a report permanently stuck `'issued'` with no file behind it — the
  consultant sees the error and can simply try again. The revert
  itself is best-effort and logged (matching the existing
  best-effort/logged pattern the same file already uses for the visit-
  status bump), since there is nothing more useful to do than surface
  the ORIGINAL error if the revert also fails.
- **`portal/src/app/api/consultancy/clients/[id]/visits/[visitId]/
  report/issue/__tests__/route.test.ts`** (new, 3 cases, a hand-built
  fake Supabase client): a lost claim (`count: 0`) refuses with 409 and
  NEVER reaches the PDF/upload/reports-insert path at all (asserted
  directly against the call log — no `storage:upload`, no
  `insert:reports`); a won claim proceeds through upload → reports
  insert → `storage_path` link → email, with the claim itself proven to
  happen BEFORE any PDF/upload work by comparing call-log indices; a
  mid-work failure (upload fails) reverts the claim back to `'draft'`.
- **Two more blind-update chains this rewrite introduced were caught by
  the CI guard and fixed the same way every prior one in this file
  has been**: the `storage_path` link-back and the claim-revert both
  now carry `{ count: 'exact' }` — `check-blind-updates.sh` still
  reports exactly 102, unchanged.

### Everything else audited clean

- **Tenant isolation**: Group 7's own consolidated
  `phase7_tenant_isolation.sql` probe already covers `visit_
  observations`, `consultancy_visit_reports` and the new `actions`
  consultancy policies for a genuinely different client under a real
  session — re-read here rather than re-run, since nothing in Group 8
  touched RLS, a trigger, or a policy on any Phase 7 table. No new
  migration this group; no new live probe was needed for a defect that
  is TypeScript-only (the route's own call ordering), and the fix was
  proven with a route-level test against a fake client instead, the
  same class of proof `hs_submit_audit()`'s retry-idempotency was
  originally proven with in-process before its own live probe existed.
- **Regression**: the full `vitest` suites across both apps ARE the
  regression suite (none deleted, none skipped) — every pre-existing
  module (Referrals, A2I, Development Plans, E-Learning, Broadcast,
  Billing/Stripe, HR, Recruitment, every Phase 1-6 H&S/workforce/
  governance/consultancy subsystem) stayed green throughout this pass,
  and both production builds compile.
- **Email/idempotency**: the issue route's `email_log` claim-before-
  send (`dedupe_key = visit-report:<visit_id>:<version>`, from Group 5)
  is unaffected by the claim-first restructure — it still runs after
  the `reports` insert succeeds, inside the same `try` block, so a
  reverted claim (a failure before the email step) never leaves a
  dangling `email_log` row either.
- **Service Ledger correctness**: with the race closed, `reports.
  created` can now only ever happen once per successful issue — so
  `ledger_report_generated` (169) firing once per genuine issue,
  never once per race participant, is now actually guaranteed by the
  route's own structure rather than merely usual-case true.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1437 admin, unchanged — this group's fix and its test are portal-only;
703 portal — 700 + 3 new `route.test.ts` cases for the issue route),
all five CI guards pass with no regressions (`check-shared-dupes.sh`:
47 pairs; `check-row-cap.sh`: clean; `check-route-validation.sh`: 44,
unchanged; `check-admin-routes-linked.sh`: 42 static routes, all
reachable; `check-blind-updates.sh`: 102, unchanged — both new
`.update()` chains this fix introduced were built with `{ count:
'exact' }` from the start), both production builds compile.

**Phase 7 is complete. Phase 8 is NOT to begin** until this branch is
merged and deployed, per the operator's standing instruction.

---

## Core-OS 360 Phase 8: Risk Graph & Connected Compliance Intelligence
## (complete, migration 177)

No detailed operator brief exists in the repo for this phase (unlike
Phases 1-3's own `_PLAN.md` files). Scope was derived from the phase's
own name plus what the codebase already has: `docs/
CORE_OS_360_PHASE8_PLAN.md`. Same discipline as every phase since
Phase 4: logical, independently verified groups.

### Group 1 (migration 177): Risk Graph foundation

`hs_links` (122) has been, in its own header comment, "the Risk
Graph's foundation — relationships as rows, not free text" since
Phase 2. It has sat unused as anything but a per-record "linked items"
list ever since — five portal pages each show ONE record's direct
links; nothing anywhere traversed the graph beyond one hop, and no
cross-cutting insight was ever surfaced from the connections
themselves.

- **`hs_entity_table()` gains four branches that were checked live to
  be missing, not guessed**: `permit` (152), `isolation` (153),
  `emergency_plan` (154), `management_review` (161) — each table added
  in its own migration with nobody circling back to this shared
  resolver. Every prior branch is reproduced unchanged (a regression
  test pins several of them, and the live probe confirms `hazard`/
  `risk_assessment`/`action`/`legal_obligation` still resolve
  correctly). `hs_entity_company()` needed no change — it already
  resolves any table generically via `hs_entity_table()` +
  `EXECUTE format()`.
- **`risk_graph_neighbors(p_type, p_id, p_depth)`** — a recursive walk
  of `hs_links` in BOTH directions (an edge is undirected for
  traversal purposes; `direction` in the result says which way THIS
  edge actually points), hard-capped at 3 hops and 500 rows regardless
  of what the caller asks for (`LEAST(GREATEST(p_depth, 1), 3)`,
  `LIMIT 500`) — the same row-cap discipline this codebase applies
  everywhere else, applied here to a query shape (recursive graph
  walk) that could otherwise grow unboundedly on a densely-linked
  organisation.
- **`SECURITY INVOKER`, deliberately, the exact `search_records()`
  rule**: it can never return a row the caller's own `hs_links` RLS
  would refuse them directly, because every underlying read runs AS
  the caller, never as a privilege-escalated definer. `REVOKE ALL ...
  FROM PUBLIC, anon` / `GRANT EXECUTE ... TO authenticated` matches
  `search_records()`'s own precedent (119/126/137/163) exactly, even
  though anon would see nothing regardless (no `auth.uid()`, so RLS
  already returns zero rows) — the established belt-and-braces shape.
- **A deliberate scope decision, recorded rather than left implicit**:
  no portfolio-wide (consultancy) RLS was added anywhere in this
  group. Unlike Phases 6-7, nothing about "Risk Graph & Connected
  Compliance Intelligence" as a phase name implies a cross-client
  capability — `hs_links`' existing `my_company_id()`-scoped RLS
  (staff-in-client-workspace, or a client's own session) already
  covers every reader this phase's UI will target. See `docs/
  CORE_OS_360_PHASE8_PLAN.md` for the full reasoning.
- Verified live (`supabase/probes/177_risk_graph_foundation.sql`, all
  checks passed, built entirely from `actions` rows chained through
  `hs_links` rather than hazards/risk_assessments — those carry CHECK
  constraints unrelated to what this probe needed to prove): a 5-node
  chain walked from its middle node sees exactly its direct neighbours
  at depth 1 (one incoming, one outgoing) and both 2-hop nodes at
  depth 2, self excluded; the depth cap holds at exactly 3 hops even
  when the caller asks for 10; an unauthorised session (a different
  organisation, no relationship) sees zero rows of another company's
  graph, never an error; the SAME organisation's own client session
  sees the full neighbourhood; a cross-organisation link insert is
  still refused by the pre-existing `hs_links_check()` trigger,
  unaffected by this migration.
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (1443 admin — 6 new `riskGraphFoundationSql.test.ts` cases; 703
  portal, unchanged — this group is admin/database only), all five CI
  guards pass (47 shared-dupe pairs, unchanged; row-cap clean; 44
  unvalidated routes, unchanged; 42 static admin routes, all
  reachable; 102 blind-update chains, unchanged — this group added no
  new write path), admin production build compiles.

### Group 2 (no migration): Connected Compliance Intelligence

`lib/riskGraph/intelligence.ts` — sibling to `lib/hs/kpis.ts`/`lib/
governance/kpis.ts`: pure, deterministic, computed at READ TIME, no
stored aggregate, no AI, no score. What makes it different from those
two: every insight here is a CONNECTION-shaped question — one no
single-entity view can answer, because the fact only exists in the
relationship between two records, not in either alone.

- **The relationships used are the REAL structural ones this schema
  already has, checked before writing a line of code — not `hs_links`
  for everything.** `risk_assessment_items.hazard_id` (123) is a
  direct FK: a hazard's coverage by a risk assessment is THIS, never
  an `hs_links` row — `hs_links` exists for the OTHER relationships
  (an incident pointing at an assessment, a related hazard/incident
  pair), the exact split `RaLinks.tsx`'s own header comment already
  documents. `risk_item_controls` (123) links a
  `risk_assessment_item` to a `control`, denormalising
  `control_title`/`effectiveness` onto the row itself — grouping by
  `control_id` is how "this control is relied on by N assessments" is
  answered. A legal obligation has NO direct FK to a risk assessment
  or hazard at all; the only connection is an explicit `hs_links` row
  an admin adds by hand, so absence of one is itself the insight, not
  a defect — not every obligation needs a risk assessment, but a gap
  is worth a human's look.
- **Four insights**: `uncoveredHazards` (non-closed/archived hazards
  with zero `risk_assessment_items` referencing them);
  `ineffectiveSharedControls` (a control relied on by 2+ DISTINCT
  assessments whose own recorded effectiveness is `ineffective`/
  `not_implemented` — sorted by assessment count, the widest-impact
  gap first; an ineffective control used by only ONE assessment is
  deliberately NOT flagged here — that is a single-assessment concern,
  not a shared-exposure one); `assessmentsWithIneffectiveControls`
  (approved/active/review_due assessments — the ones a client is
  CURRENTLY relying on — carrying at least one ineffective control,
  regardless of sharing); `unlinkedApplicableObligations` (applicable
  legal obligations with no `hs_links` connection to any risk
  assessment or hazard, in either direction).
- **`organisation_legal_obligations` has no `title` column** — it
  references the staff-only `legal_requirements` catalogue (159). The
  pure function takes an already-resolved `title` and documents in its
  own type comment that a loader must join it, the same "join by id
  list, never a bare client read of the catalogue" pattern the Legal
  Register's own portal page already uses.
- 16 new unit tests (`intelligence.test.ts`), including the two
  deliberate non-obvious NEGATIVE cases: a shared-but-effective control
  is never flagged, and an ineffective control used by only one
  assessment is never flagged as "shared".
- **No UI, no loader, no wiring into a page yet — deliberately, per
  the Group 2/Group 3 split recorded in `docs/
  CORE_OS_360_PHASE8_PLAN.md`.** This group is the pure computation
  only; Group 3 reads real rows and renders it.
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (1459 admin — 16 new `intelligence.test.ts` cases; 703 portal,
  unchanged — this group is admin-only, pure functions with no page),
  all five CI guards pass (unchanged across the board — no new table,
  no new route, no new write path), admin production build compiles.

### Group 3 (no migration): Risk Graph + Intelligence UI

`lib/riskGraph/intelligence.ts` is now a shared-dupe pair (mirrored to
portal byte-identical, 48 pairs). Admin gets a 26th `HsCompanyTabs.tsx`
tab, `/health-safety/<companyId>/risk-graph` — no new sidebar entry,
nests under the already-linked `/health-safety` prefix, the
established precedent. Portal gets a read-only
`/protect/risk-graph`, gated by `protect` alone (nothing here is
self-certified).

- **Two halves on one page, a deliberate consolidation of the plan's
  own "explorer" and "dashboard" into one, recorded rather than
  silently done**: the Connected Compliance Intelligence dashboard
  (Group 2's pure function, computed server-side, never recomputed
  client-side) and an "explore connections" panel calling
  `risk_graph_neighbors()` (Group 1) directly under the signed-in
  session — the same `supabase.rpc(...)` pattern `GlobalSearch.tsx`
  already uses for `search_records()`.
- **Hazards and risk assessments have NO admin-side per-record page —
  checked, not assumed.** Migration 122's own header comment
  ("staff may work in the portal's PROTECT workspace exactly as a
  consultant does") and a scan of `HsCompanyTabs.tsx`'s existing 24
  tabs (neither hazards nor risk assessments ever appeared there)
  confirmed it: both are managed exclusively through the portal, staff
  included. The dashboard therefore links OUT to
  `${portalUrl()}/protect/hazards/<id>` /
  `.../risk-assessments/<id>` for those two rows, and internally to
  the admin's own `/legal` tab for legal obligations, which DOES have
  one.
- **The explorer's starting point is limited to entities this page
  already has a resolvable label for** (hazards, risk assessments,
  legal obligations loaded server-side for the dashboard) — a free-text
  UUID field would be poor UX and error-prone. A NEIGHBOUR beyond that
  set shows only its type and a truncated id, never a fabricated label
  — a known, disclosed scope limit (per the plan doc), not an
  oversight: labelling every one of the ~35 `hs_entity_table()`
  branches would need a query per branch, real scope for a later pass
  if this proves worth extending.
- **No component-level test** — consistent with this codebase's
  established convention (no React-component-rendering tests exist
  anywhere in either app); verified via `tsc`, both production builds,
  and code review. Portal's `portalPagesLinked.test.ts`/
  `clientServerBoundary.test.ts` pick up the new route automatically.
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (1459 admin, unchanged; 705 portal — 703 + 2, the two sweep tests
  picking up the new route), all five CI guards pass (48 shared-dupe
  pairs, up from 47; row-cap clean; 44 unvalidated routes, unchanged;
  42 static admin routes, all reachable — the new admin route nests
  under an already-linked prefix; 102 blind-update chains, unchanged
  — this group writes nothing, read-only throughout), both production
  builds compile, including `/health-safety/<companyId>/risk-graph`
  and `/protect/risk-graph`.

### Group 4 (no migration): full regression, adversarial QA, handover

Full handover + QA report: `docs/CORE_OS_360_PHASE8_HANDOVER.md`.
**Gate: PASS WITH MINOR ISSUES.**

**One real, Medium-severity defect found: `unlinkedApplicableObligations`
counted a link to ANY entity type as coverage, contradicting its own
documented and labelled meaning ("no linked risk assessment").** Found
by re-reading the Group 2 CLAUDE.md writeup (which specifically said
"no `hs_links` connection to any risk assessment or hazard") against
the actual code, which checked no such thing — the first version
flagged an obligation as "covered" the moment it was linked to
ANYTHING (a document, an incident, an audit finding). Fixed: a
`COVERAGE_TYPES` filter (`hazard`, `risk_assessment`) now decides what
counts, in the pure function, not the loader query. **Mutation-tested
live in this session** — the fix was reverted to the original "any
connection counts" logic, watched fail the new negative-case test,
then restored. Severity: this would have UNDER-reported gaps (an
obligation genuinely lacking risk-assessment coverage, but linked to
something unrelated, would have silently shown as "fine") — the worse
direction for a tool whose whole purpose is surfacing gaps.

**Everything else audited clean**:

- **Graph traversal correctness and tenant isolation on
  `risk_graph_neighbors()`**, already proven live in Group 1's own
  probe, re-read rather than re-run since nothing in this group
  touched the function.
- **The pre-existing staff blanket-access policies
  (`hs_links_staff_all` etc., no `company_id` restriction, migration
  122/123) were investigated as a genuine "could this leak" question,
  not assumed safe**: a staff session's `risk_graph_neighbors()` call
  sees the RLS-level full graph across every organisation, but the
  traversal only ever visits rows reachable from the ONE starting node
  supplied, and `hs_links_check()` (122) refuses a cross-organisation
  edge at CREATION time — so there is no cross-company edge for the
  walk to ever follow, whatever policy let the session see the row.
  Confirmed correct, pre-Phase-8 behaviour, not a gap this phase
  introduced.
- **Regression**: the full `vitest` suites across both apps ARE the
  regression suite (none deleted, none skipped) — every pre-existing
  module stayed green throughout this pass, and both production
  builds compile.
- **Every scope decision that might otherwise look like an oversight
  is explicitly documented** in the handover doc rather than silently
  made: no portfolio-wide RLS, the explorer/dashboard consolidation
  onto one page, the "no admin page for hazards/RAs, link out to
  portal instead" design, the explorer's limited starting-point set.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1461 admin — 1459 + 2 new `intelligence.test.ts` cases for the fix;
705 portal, unchanged — the fix and its tests are admin-only, though
the shared-dupe file was re-mirrored byte-identical), all five CI
guards pass with no regressions (48 shared-dupe pairs; row-cap clean;
44 unvalidated routes, unchanged; 42 static admin routes, all
reachable; 102 blind-update chains, unchanged — this phase writes
nothing, entirely read-only throughout), both production builds
compile.

**Phase 8 is complete. Phase 9 is NOT to begin** until this branch is
merged and deployed, per the operator's standing instruction.

---

## Core-OS 360 Phase 9: "What Changed?" Daily Operational Intelligence
## (complete, no migration)

No detailed operator brief exists in the repo for this phase (the same
situation Phase 8 was in). Scope: `docs/CORE_OS_360_PHASE9_PLAN.md`,
written before Group 1 began. **Deliberately scoped to STAFF (admin),
not client-facing, for this first pass** — reads as an internal ops
need, matching the existing internal-tooling precedent (`/automation`,
`/health`, `/tasks`) more than a client-facing surface; `platform_
events`' own RLS is staff-only SELECT, so a client-facing version
would need a service-role-mediated read, real future work rather than
silently built here.

### Group 1 (no migration): the pure computation

`platform_events` (096) has recorded every create/update/delete
across 51+ tables since 2026-09-25, purely as automation fuel for the
consequence-rule consumer — nothing anywhere has ever rendered it as a
human-readable narrative. `lib/whatChanged/compute.ts` is that: pure,
deterministic, computed at READ TIME from a day's already-fetched
rows (the caller scopes the date range in SQL; the function only
groups and labels what it is given) — no stored aggregate, no AI, the
same posture every KPI/intelligence module in this codebase already
takes.

- **COUNTS ONLY, deliberately, not an itemised feed.** Each table's own
  outbox trigger whitelists a DIFFERENT set of columns (hazards:
  `reference`/`status`/`site_id`/…; actions: an entirely different
  set) — there is no single field ("title", "name") reliably present
  across entity types to build a per-item label from, and guessing one
  per table would be exactly the "sniff a payload key and hope"
  fragility this codebase's own standing rules reject elsewhere. A
  categorised count ("3 hazards created, 1 updated") is a complete,
  honest answer to "what changed" on its own.
- **A curated label map for the ~20 most operationally interesting
  entity types**, falling back to a humanised table name for anything
  else — readable, never crashes on an unlisted table.
- **The fallback deliberately does NOT attempt to singularise.** A
  naive trailing-`'s'` strip turns "companies" into "companie", not
  "company" — English pluralisation is irregular enough that getting
  it wrong looks worse than leaving the table's own plural form as-is.
  Every curated `LABELS` entry is already written in its own correct
  plural form for exactly this reason; the fallback matches that
  style. Caught by writing the test first and watching it fail against
  the naive implementation, not assumed correct.
- **`actor_kind` splits into system vs. human** (`'system'` vs.
  anything else — `hs_actor_kind()`'s real vocabulary is `staff |
  client | system`), a simple, useful signal for "how much of today
  was automation vs. people doing things."
- **Categories sort by total descending, entityType ascending as a
  deterministic tiebreak** — never insertion-order-dependent.
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (1469 admin — 8 new `compute.test.ts` cases; 705 portal, unchanged
  — this group is admin-only, pure functions with no page), all five
  CI guards pass (unchanged across the board — no new table, no new
  route, no new write path), admin production build compiles.

### Group 2 (no migration): admin UI

A new **What Changed** tab on the existing per-client detail page
(`ClientDetailTabs.tsx`) — the cross-pillar per-client home already
used for Overview/Roles/Documents/Roadmap/HR, the natural place for a
cross-pillar daily summary, rather than nesting it under the
H&S-specific `/health-safety/<companyId>` prefix, which would
undersell how far `platform_events` actually spans (HIRE/LEAD/PROTECT/
Governance/Consultancy alike).

- **`WhatChangedTab.tsx` manages its own fetch, deliberately bypassing
  the generic `client-tab-data` lazy-load mechanism** every other tab
  on this page uses. That mechanism fetches once per tab open with no
  date parameter; this tab re-fetches on every date change, the same
  self-contained-fetch shape `RaLinks.tsx`/`EvidenceLinksPanel.tsx`
  already use for their own per-record data. A plain client-side read
  under the staff session (`platform_events_staff_read` RLS,
  `is_tps_staff()`, no `company_id` restriction — no service role
  needed, matching the RLS shape §G.4 of the Phase 8 handover already
  documented for the identically-shaped `hs_links`).
- **Defaults to yesterday, not today** — today is still in progress,
  and "what changed" reads more naturally as a completed day's
  retrospective, the same reasoning the H&S weekly digest reports a
  week that has just ended, never one still running. A date picker
  (prev/next day, a "Yesterday" reset) looks back as far as the
  operator wants, one day at a time — "Next day" disables once the
  picker reaches today, so it can never accidentally request an
  in-progress day expecting a complete one.
- **`readAllPages()` used client-side**, the first time this codebase
  has called it from a browser component rather than a server one —
  it is a plain callback-driven walker with no dependency on which
  Supabase client it is handed, and a single client/company/day slice
  could plausibly exceed 1,000 rows on an unusually active day. A
  `truncated` flag is surfaced in the UI rather than silently
  presenting a partial day as complete, the standing `paged.ts` rule.
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (1469 admin, unchanged — this group is UI-only, consistent with
  this codebase's established "no component-level test" convention;
  705 portal, unchanged — this group touches admin only), all five CI
  guards pass (unchanged across the board — no new table, no new API
  route, no new write path; the new tab reads `platform_events`
  directly under RLS, no route needed), admin production build
  compiles.

### Group 3 (no migration): full regression, adversarial QA, handover

Full handover + QA report: `docs/CORE_OS_360_PHASE9_HANDOVER.md`.
**Gate: PASS WITH MINOR ISSUES.**

**One real, Medium-severity defect found: `computeWhatChanged()`
silently dropped `event_type = 'reminder'` rows from every breakdown
column while still counting them in `total`.** Found by re-checking
every REAL writer of `platform_events` (three: the per-table
`platform_event_row()` triggers, `emitEvent()`, and — the one Group 1
missed — `lib/reminders/run.ts`, which upserts `event_type =
'reminder'` directly into the table for every due-date bucket a
reminder rule fires) against the TypeScript type that claimed to model
the column completely. A day with reminder activity showed a total
that didn't reconcile with the sum of its own breakdown columns, and
the reminders themselves were invisible on the one page built to show
activity. Fixed: the `event_type` union widened to include
`'reminder'`, `ChangeCategory` gained a `reminders` field, the UI
table gained a matching column. **Mutation-tested live in this
session** — the fix was reverted, watched fail a new test asserting
`created + updated + deleted + reminders === total`, then restored.

**Everything else audited clean**:

- **Tenant scoping, date-boundary correctness and the rapid-navigation
  race guard** were all reviewed on their own terms (not merely
  assumed correct from the first pass) and found correct — a
  `company_id = NULL` event (the cross-client shape `referral_
  scan_runs` events use) correctly never matches any client's view;
  UTC boundaries are used consistently throughout, never leaking the
  browser's own timezone; the `useEffect`'s `cancelled` flag correctly
  guards against a rapid date-navigation race.
- **Regression**: the full `vitest` suites across both apps ARE the
  regression suite (none deleted, none skipped) — every pre-existing
  module stayed green throughout this pass, and both production
  builds compile.
- **Every scope decision that might otherwise look like an oversight
  is explicitly documented** in the handover doc: staff-only (no
  portal version), no emailed digest, no Jev narrative, the ~20-entity
  label map's bounded scope, UTC day boundaries.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1470 admin — 1469 + 1 new `compute.test.ts` case for the fix; 705
portal, unchanged — this phase touched admin only), all five CI
guards pass with no regressions (48 shared-dupe pairs; row-cap clean;
44 unvalidated routes, unchanged; 42 static admin routes, all
reachable; 102 blind-update chains, unchanged — this phase writes
nothing, entirely read-only throughout), both production builds
compile.

**Phase 9 is complete. Phase 10 is NOT to begin** until this branch is
merged and deployed, per the operator's standing instruction.

---

## Core-OS 360 Phase 10: Incident Pattern Intelligence
## (complete, no migration)

No detailed operator brief exists in the repo for this phase (the same
situation Phases 8-9 were in). Scope: `docs/CORE_OS_360_PHASE10_PLAN.md`.

**The one absolute rule this phase must never cross**: this codebase's
own standing rule since Phase 4 — "Explicitly forbidden anywhere in
this phase: predictive/AI safety scoring — machine failure prediction,
accident probability, unsafe-worker prediction." Every insight this
phase produces reports what has ALREADY happened, past tense, with a
real inspectable count behind it — never a risk level or a probability.
No AI anywhere in this phase's own code.

### Group 1 (no migration): the pure computation

`lib/incidentPatterns/analyze.ts` — the first thing anywhere to
aggregate incidents ACROSS records. `lib/hs/kpis.ts` already counts a
trailing-12-month total as ONE number; nothing groups by type, site,
department or root-cause category, and nothing compares one period
against another.

- **`incident_causes.category`** (125, a curated 13-value taxonomy —
  people/plant_equipment/process/procedure/environment/management/
  training/supervision/maintenance/communication/design/contractor/
  organisational) IS the pattern data — a recurring root-cause category
  across incidents is exactly what "Incident Pattern Intelligence"
  promises, and the taxonomy already exists; nothing needed inventing.
- **Only NON-SENSITIVE columns are read**: `hs_incidents`' own type/
  severity/site/department/date, and `incident_causes.category` —
  never `incident_person_sensitive`, never `incident_causes.
  description` (free text) in any aggregate output. Checked against
  the schema before writing this file, not assumed safe.
- **A recurring root cause counts only CONFIRMED, `cause_level =
  'root'` causes, and only when the underlying INCIDENT itself falls
  inside the chosen window** — an investigation completed later for an
  incident outside the window must not inflate this window's count;
  an unconfirmed draft cause is not yet a recorded fact; an immediate
  or underlying cause is a different thing from a root cause and never
  counted as one.
- **A site/department "cluster" is 2+ incidents in the window** —
  reported as a plain count, explicitly never a risk rating.
- **The severity comparison is period-over-period, never a trend
  line or a forecast**: major/critical/fatal counts for the current
  window vs. the immediately preceding window of the same length —
  two real numbers, side by side, nothing extrapolated forward.
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (1481 admin — 11 new `analyze.test.ts` cases; 705 portal, unchanged
  — this group is admin-only, pure functions with no page), all five
  CI guards pass (unchanged across the board — no new table, no new
  route, no new write path), admin production build compiles.

### Group 2 (no migration): UI

A 27th `HsCompanyTabs.tsx` tab, `/health-safety/<companyId>/
incident-patterns` (admin), plus a read-only `/protect/incident-
patterns` (portal), gated by `protect` alone. `lib/incidentPatterns/
analyze.ts` and a new `IncidentPatternsView.tsx` presentational
component are both shared-dupe pairs (50 pairs, up from 48).

- **A window picker (30/90/365 days) is a plain `?days=` searchParams
  re-render**, the exact pattern the Safety Timeline page's own
  pagination already uses — no client-side fetch needed for a filter
  this simple, unlike Phase 9's date-picker tab, which genuinely
  needed its own re-fetch shape for a different reason (a per-day
  slice with no natural "prev page" URL semantics).
- **Every read is under the caller's own session RLS, no service role
  anywhere** — `hs_incidents`/`incident_investigations`/
  `incident_causes`/`hs_sites`/`departments` are all already readable
  by a `client_admin`-shaped session holding `incident.read`, the same
  capability that already gates the existing Incidents tab. Checked
  live against the actual policies before writing either page, not
  assumed from table name alone.
- **`IncidentPatternsView.tsx` needs no `'use client'`** — a window
  picker made of plain `<Link>` navigation has no interactivity to
  manage client-side, so the ONE presentational component serves both
  apps' server components directly, mirrored byte-identical.
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (1481 admin, unchanged — this group is UI-only; 707 portal — 705 +
  2, the two sweep tests picking up the new route), all five CI
  guards pass (50 shared-dupe pairs, up from 48; row-cap clean; 44
  unvalidated routes, unchanged; 42 static admin routes, all
  reachable — the new admin route nests under the already-linked
  `/health-safety` prefix; 102 blind-update chains, unchanged — this
  group writes nothing, read-only throughout), both production
  builds compile, including `/health-safety/<companyId>/incident-
  patterns` and `/protect/incident-patterns`.

### Group 3 (no migration): full regression, adversarial QA, handover

Full handover + QA report: `docs/CORE_OS_360_PHASE10_HANDOVER.md`.
**Gate: PASS WITH MINOR ISSUES.**

**One real, Medium-severity defect found: the current and prior
comparison windows were not the same length.** The first version built
the current window as `[today - N, today]` (BOTH ends inclusive —
`N + 1` distinct dates, not `N`) and the prior window as `[today - 2N,
today - N)` (half-open, genuinely `N` dates) — every single
period-over-period severity comparison this phase ever produced was
comparing a slightly LONGER "current" period against a slightly
SHORTER "prior" one, on every run, for every client, since Group 2
shipped. Found by re-deriving the date arithmetic by hand rather than
trusting that "N days ago to today" and "2N days ago to N days ago"
were obviously symmetric — they look right at a glance and are wrong
by exactly one day. Fixed by extracting `incidentPatternWindows()`, a
new shared, testable pure function in `analyze.ts` producing two
half-open windows with no gap and no overlap, replacing the duplicated
(and duplicately wrong) inline date math in both `page.tsx` files.
**Mutation-tested live in this session** — the fix was reverted to
the original inclusive-both-ends formula, 3 of 4 new tests failed,
then restored.

**Correction, 2026-09-30, found by an independent adversarial audit
Tom requested (not this phase's own pass):** this entry, and
`incidentPatternWindows()`'s own doc comment, originally overstated
the fix as producing two "provably equal-length" windows. They are
not — `windowEndExclusive` is deliberately `today + 2`, not
`today + 1`, to include an incident dated up to `current_date + 1`
(the exact leeway `hs_incidents`' own CHECK constraint allows for
timezone rounding), which makes the current window `days + 1` real
dates against the prior window's exact `days`. That one-day forward
pad is correct and intentional — removing it to force strict equality
would risk undercounting a same-day incident recorded in a timezone
ahead of UTC — but calling the result "equal-length" was simply wrong,
contradicted by the function's own test file
(`currentLength`/`priorLength`, 91 vs 90 for `days=90`). The doc
comment in `analyze.ts` (shared-dupe pair, both apps) is corrected to
state the asymmetry and why it exists, rather than deny it.

**Everything else audited clean**:

- **The absolute "no prediction, no AI" rule** was re-verified against
  the actual code (no reference to `incident_person_sensitive` or any
  free-text `description` column anywhere in this phase's files), not
  merely trusted from `analyze.ts`'s own header comment.
- **Tenant scoping and the "cause counted against the wrong window"
  edge case** were both independently re-checked and confirmed
  correct — `incident_causes`/`incident_investigations` carry their
  own `company_id`, and a cause is only counted when its own incident
  is present in the window-scoped `incidents` array, never derived
  from the cause's own confirmation date.
- **Regression**: the full `vitest` suites across both apps ARE the
  regression suite (none deleted, none skipped) — every pre-existing
  module stayed green throughout this pass, and both production
  builds compile.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1485 admin — 1481 + 4 new `incidentPatternWindows` test cases; 707
portal, unchanged — the fix and its tests are in the shared `analyze.
ts`, re-mirrored byte-identical), all five CI guards pass with no
regressions (50 shared-dupe pairs; row-cap clean; 44 unvalidated
routes, unchanged; 42 static admin routes, all reachable; 102
blind-update chains, unchanged — this phase writes nothing, entirely
read-only throughout), both production builds compile.

**Phase 10 is complete. Phase 11 is NOT to begin** until this branch
is merged and deployed, per the operator's standing instruction.

---

## Core-OS 360 Phase 11: Evidence Engine & Evidence-Backed Compliance
## (complete, no migration)

No detailed operator brief exists in the repo for this phase (the same
situation Phases 8-10 were in). Scope: `docs/CORE_OS_360_PHASE11_PLAN.md`.

### Group 1 (no migration): the pure computation

`hs_files` (095) has always accepted `entity_type = 'register_
completion'` — a completion CAN already carry evidence. Nothing has
ever checked whether one actually DOES. `lib/evidenceEngine/
analyze.ts` answers exactly that, and only that.

- **Deliberately NOT the `requirement_evidence_links`/ISO-readiness
  system** (Phase 5) — that already reports its own clause-evidence
  coverage; duplicating that logic here would be a second source of
  the same kind of fact. This closes a DIFFERENT, checked gap: the
  H&S register's own completions have no equivalent report at all.
- **"Has a file" is the entire test** — never a judgement of whether
  the file is legible, current, or actually proves what it claims to.
  No AI anywhere in this module.
- **`coveragePercent` is `null`, never `0`, with zero completions** —
  "not applicable" and "0% covered" are different facts, the same
  distinction `lib/hs/kpis.ts`/`lib/governance/kpis.ts` already draw
  for their own null-with-no-data cases.
- **Grouped by the register item's own `category`, sorted by the
  WIDEST gap first** — the categories most worth a human's attention
  lead, tie-broken alphabetically for determinism.
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (1492 admin — 7 new `analyze.test.ts` cases; 707 portal, unchanged
  — this group is admin-only, pure functions with no page), all five
  CI guards pass (unchanged across the board — no new table, no new
  route, no new write path), admin production build compiles.

### Group 2 (no migration): UI

A 28th `HsCompanyTabs.tsx` tab, `/health-safety/<companyId>/evidence`
(admin), plus a read-only `/protect/evidence` (portal), gated by
`protect` alone. `lib/evidenceEngine/analyze.ts` and a new
`EvidenceEngineClient.tsx` are both shared-dupe pairs (52 pairs, up
from 50).

- **Two things on one page**: an Evidence Library (every `hs_files`
  row for the client, newest first, capped at 200 — a browsing list,
  not an exhaustive export, so well under the 1,000-row PostgREST
  ceiling is the right cap, not a workaround for it) and the register's
  own evidence-coverage gap report (Group 1).
- **A "View" link signs a URL ON DEMAND when clicked**, under the
  viewer's own session, rather than pre-signing every row on the
  server — avoiding up to 200 signed-URL round trips on a single page
  load. The same "signed under the user's own session" discipline
  `evidenceUrl()` already documents; reused verbatim, not
  reimplemented.
- **Every read is under the caller's own session RLS** —
  `hs_files_client_read`/`hs_completions_client_read` already exist
  and already scope correctly; checked live against the actual policy
  text before writing either page, not assumed from table name alone.
- Verified: `tsc --noEmit` clean both apps, full `vitest run` green
  (1492 admin, unchanged — this group is UI-only; 710 portal — 707 +
  3, the sweep tests picking up the new route), all five CI guards
  pass (52 shared-dupe pairs, up from 50; row-cap clean; 44
  unvalidated routes, unchanged; 42 static admin routes, all
  reachable — the new admin route nests under the already-linked
  `/health-safety` prefix; 102 blind-update chains, unchanged — this
  group writes nothing, read-only throughout), both production
  builds compile, including `/health-safety/<companyId>/evidence`
  and `/protect/evidence`.

### Group 3 (no migration): full regression, adversarial QA, handover

Full handover + QA report: `docs/CORE_OS_360_PHASE11_HANDOVER.md`.
**Gate: PASS.**

A genuinely thorough adversarial pass — sensitive-evidence leakage
into the Evidence Library, `register_completion`'s own RLS read gate,
historical-vs-current-state framing of the gap report, the browsing
list's un-noticed cap, and the signed-URL-on-click flow, each checked
against actual code and live policy text rather than assumed — found
**no Critical, High or Medium defect**. This is a genuine, not a
formulaic, result: the previous three phases (8, 9, 10) each surfaced
one real Medium-severity issue on their own adversarial passes; this
one did not, and reporting a clean pass honestly matters more than
manufacturing a finding to match a pattern. Full reasoning for each
angle checked is in the handover doc's own §C.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1492 admin, 710 portal, both unchanged — this pass found nothing to
fix), all five CI guards pass with no regressions, both production
builds compile.

**Phase 11 is complete. Phase 12 is NOT to begin** until this branch
is merged and deployed, per the operator's standing instruction.

---

## Core-OS 360 Phase 12: Compliance Digital Twin (2026-09-29)

No detailed operator brief exists in the repo for this phase either —
the same situation Phases 8-11 were in. Scope: `docs/CORE_OS_360_
PHASE12_PLAN.md`, derived from the phase's own name plus a careful
audit of what the codebase already computes.

A "digital twin" here means exactly one thing: a single, read-time,
deterministic model of a client's ENTIRE compliance state, assembled
from five modules this codebase already has — never a new raw fact.
**No migration, no new table.** Delivered in **3 groups**.

### Group 1: the assembly module

`lib/complianceTwin/assemble.ts` (shared-dupe pair) — `assembleComplianceTwin()`
combines the ALREADY-COMPUTED outputs of five existing pure modules:

| Source module | What it already computes |
|---|---|
| `lib/hs/kpis.ts` (`computeHsKpis`, Phase 4, admin-only) | Incidents/RIDDOR, last audit score, equipment overdue/due-soon |
| `lib/governance/kpis.ts` (`computeGovernanceKpis`, Phase 5 Gp 8, admin-only) | Objectives on-track %, overdue legal evaluations, waste non-conformance % |
| `lib/riskGraph/intelligence.ts` (Phase 8) | Uncovered hazards, ineffective shared controls, unlinked legal obligations |
| `lib/incidentPatterns/analyze.ts` (Phase 10) | Recurring root causes, site/department clusters, severity trend |
| `lib/evidenceEngine/analyze.ts` (Phase 11) | Register-completion evidence coverage % |

This file adds no new data computation. Its only new logic is a
per-area RAG (red/amber/green) band, derived by fixed, NAMED numeric
thresholds — the same `if`-chain-over-thresholds shape `lib/health/
scoring.ts`'s own `computeBand()` already uses, never a formula or a
score — plus combining the five areas into one snapshot with an
overall band (the worst of the five, `worstBand()`).

- **Two of the five source modules are admin-only** (`lib/hs/kpis.ts`,
  `lib/governance/kpis.ts` — checked live before writing a line of
  code: neither has ever had a portal copy, and neither is imported
  anywhere in the portal app). `assemble.ts` therefore does NOT import
  their types — it declares two narrow, self-contained local
  interfaces (`ComplianceTwinHsKpisInput`, `ComplianceTwinGovernanceKpisInput`)
  naming only the fields this file actually reads, structurally
  compatible with admin's own `HsKpis`/`GovernanceKpis` so the admin
  page can pass either straight through with no mapping step. The
  other three source types (`RiskGraphIntelligence`,
  `IncidentPatternSummary`, `EvidenceCoverageSummary`) ARE imported
  directly, since both apps carry byte-identical copies of those three
  modules already.
- **Every "reason" is a plain sentence built from a number a source
  module already computed — never an AI narrative.** The same absolute
  rule Phase 10's own header comment states: report what has ALREADY
  happened, past tense, a real inspectable count behind it, never a
  probability or a "likely to recur" framing. No AI anywhere in this
  file.
- **An area that is red for one reason still reports every amber-level
  fact that is ALSO true**, rather than hiding it behind the worse
  finding — `buildArea()` builds both a red-reasons list and an
  amber-reasons list unconditionally from independent checks, then
  derives the band from whichever lists are non-empty.
- **Thresholds are named constants, reusing an existing precedent
  where one already exists**: the 70%-audit-score threshold echoes
  Phase 5 Group 6's management-review data pack's own "audits scoring
  below a fixed 70% threshold." The evidence thresholds (50%/90%) and
  the objectives/waste thresholds (50%/10%) are new to this module,
  chosen as round, documented numbers rather than tuned to any
  particular client's data.
- **A null percentage is never treated as zero.** `objectivesOnTrackPercent`,
  `wasteNonConformancePercent` and `coveragePercent` are each `number |
  null` on their source module (null means "nothing to measure yet",
  not "0% healthy") — every threshold check is guarded `!= null &&
  ...`, matching the same distinction Phase 11's own evidence module
  already drew ("coveragePercent... null with zero completions, never
  0").
- **A real test-fixture bug was found and fixed while writing this
  group's own tests, before any review — not a defect in the shipped
  module itself.** The first version of the test file's `baseInput()`
  helper built each test's input via a shallow `{ ...CLEAN_INCIDENT_
  PATTERNS }` spread; `severityComparison` is a nested object, so every
  test SHARED the same `currentWindow`/`priorWindow` object across the
  whole file — one test mutating `currentWindow.major` leaked into
  every test that ran after it, and four tests failed non-deterministically
  depending on execution order. Fixed by building every test's input
  through `structuredClone()` instead of a shallow spread. Caught by
  the tests themselves failing on first run, not by inspection — kept
  here as the recorded lesson for any future test fixture with a
  nested object.
- 25 unit tests: entirely-green baseline, each area's own red/amber/
  green conditions independently, exact threshold boundaries (a score
  of exactly 70/50/90 never trips the adjacent band), the
  red-still-reports-amber-reasons property, null-vs-zero handling, and
  the overall-band worst-of-five combination.

### Group 2: admin + portal UI, and two modules that turned out to need mirroring

`ComplianceTwinView.tsx` (shared-dupe pair): a card per area (band icon,
label, reasons) plus an overall band banner, and a per-area "View
details →" link. **No interactivity beyond plain navigation, so no
`'use client'`** — the same call `IncidentPatternsView.tsx` already
made. Admin: a 29th `HsCompanyTabs.tsx` tab, `/health-safety/
<companyId>/digital-twin`. Portal: read-only `/protect/digital-twin`,
gated by `protect` alone (nothing here is self-certified).

- **The component takes an explicit `links: Record<ComplianceTwinAreaKey,
  string>` prop, not a `basePath` string.** `IncidentPatternsView.tsx`'s
  own `basePath`-suffix pattern doesn't work here: admin's and portal's
  route segments for the SAME underlying page genuinely diverge — admin
  has a combined `/kpis` page portal has no equivalent of (portal's
  closest thing is `/incidents`), and admin's Legal Register segment is
  `legal` while portal's is `legal-register`. Rather than guess a shared
  suffix and risk a broken link in one app, each page supplies its own
  correct hrefs; the shared component stays a true byte-identical file
  with no app-specific routing knowledge baked in.
- **`lib/hs/kpis.ts` and `lib/governance/kpis.ts` were admin-only until
  this group — and became shared-dupe pairs, not duplicated logic.**
  The first draft of `assemble.ts` (Group 1) avoided importing their
  types for exactly that reason and declared narrower local interfaces
  instead. Writing the portal page exposed the real cost of that
  choice: portal has no combined KPI computation to call at all, and
  reimplementing `computeGovernanceKpis`' three-field subset inline in
  two different page.tsx files would have been a second, parallel copy
  of a formula that already exists — the "REUSE, never a parallel
  system" rule this whole codebase holds to. Checked before mirroring:
  `lib/governance/kpis.ts` has no imports at all, and `lib/hs/kpis.ts`
  imports only the already-shared `recurrence.ts` — both fully portable
  with zero admin-specific dependency. Mirrored verbatim, added as two
  new shared-dupe pairs, and `assemble.ts` reverted to importing the
  REAL `HsKpis`/`GovernanceKpis` types directly (its local interfaces
  were removed) now that both apps genuinely carry them.
- **`computeGovernanceKpis` had never had a real caller anywhere in this
  codebase before this page** (checked before writing a query — it
  shipped in Phase 5 Group 8 with only its own unit test). Its
  `activeEmployeeCount` input (needed only to produce an
  `incidentFrequencyRatePer100` this twin's governance band never
  reads) is read fresh via the same `end_date IS NULL OR end_date >
  today` headcount shape `/lead/hr-dashboard` already established for
  `employee_records`, and `incidentsLast12MonthsCount` reuses
  `hsKpis.incidentsLast12Months` rather than a second `hs_incidents`
  read — the exact same fact ("any hs_incidents row in the trailing 12
  months"), computed once.
- **Every other read is copied verbatim from its own source page** — the
  H&S KPIs page, the Risk Graph page (admin's own and portal's
  service-role-scoped `legal_requirements` title lookup), the Incident
  Patterns page (fixed at its 90-day default — the Digital Twin has no
  window picker of its own), and the Evidence Engine page. No new query
  shape was invented for any of the five areas beyond the governance
  reads above.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1517 admin, unchanged; 712 portal — +2, `portalPagesLinked.test.ts`
picking up the new route automatically), all five CI guards pass
(`check-shared-dupes.sh`: 56 pairs), both production builds compile,
including `/health-safety/<companyId>/digital-twin` and
`/protect/digital-twin`.

### Group 3: regression, adversarial QA, handover (gate: PASS WITH MINOR ISSUES)

Full handover + QA report: `docs/CORE_OS_360_PHASE12_HANDOVER.md`.

Two real Medium-severity defects were found in `assemble.ts`'s own
reason-string logic, both reproduced (a failing test, or a careful
manual trace) before being fixed, both re-verified afterward:

- **A redundant, confusing pair of reasons under Evidence.**
  `evidenceArea()`'s red check (`< 50%`) and amber check (`< 90%`) were
  two INDEPENDENT `if`s against the SAME `coveragePercent` number, so a
  coverage of 30% produced BOTH "below the 50% threshold" and "below
  the 90% threshold" together — the identical fact stated twice at two
  different, both-true thresholds. Reproduced with a new test
  (`reports the evidence coverage fact ONCE... when below the red
  threshold`) — confirmed failing (length 2, expected 1) — then fixed
  by making the amber check `else if`, so a red finding reports only
  its own, more severe reason. This is the only place in the file
  where two thresholds check the SAME number; every other area's red/
  amber pairs are independent facts, so the bug class cannot recur
  elsewhere by construction.
- **Governance's clean-state wording implied verification that may
  never have happened.** Safety's clean reason already says "...the
  last audit score (**if any**) is at or above threshold" and
  evidence's says "...(**or no register completions have been
  recorded yet**)" — both honestly acknowledge that a lack of adverse
  findings might mean there is simply no data. Every other area's
  clean facts are plain COUNTS (unambiguous either way), so only
  safety and evidence needed the caveat — except governance's own two
  PERCENTAGE checks (`objectivesOnTrackPercent`,
  `wasteNonConformancePercent`, null with zero data, the identical
  shape) had been missed: its original wording ("objectives are on
  track...") read as a verified positive claim indistinguishable from
  a client with zero objectives and zero waste movements ever
  recorded. The same risk this codebase's own standing rules already
  treat seriously elsewhere (the referral gate's "absence of evidence
  is a FAIL, not a pass"; the audit engine's "recorded assessment
  outcome, never legally compliant"). Reworded to "No overdue legal
  obligation reviews **on record**, and **no evidence of** objectives
  falling behind or elevated waste non-conformance" — no test needed
  updating, since the existing test only pins `reasons.length === 1`
  for the clean baseline, not the exact string.
- **Also hardened, not a defect**: `lastAuditScore` is now wrapped in
  `Math.round()` in its amber reason for defensive consistency with
  every other percentage in the file, even though `hs_submit_audit()`
  — the table's only writer — already always stores an integer score;
  checked, not assumed, before deciding this needed nothing.
- **Checked and found clean**: no reason string anywhere leaks a
  hazard/obligation/incident title or any free text (every reason is
  built from a count or a rounded percentage only); every read in both
  pages is scoped to the caller's own company, the identical pattern
  every one of the five source pages already uses; the `loadError`-
  blocks-all-content rendering pattern matches `IncidentPatternsView.tsx`'s
  own existing convention exactly, not a new gap; the `employee_records`
  headcount query touches only `EMPLOYEE_SAFE_COLUMNS` (131)-permitted
  columns.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1518 admin — 1517 + 1 new adversarial regression test; 712 portal,
unchanged), all five CI guards pass, both production builds compile.

**Phase 12 is complete. Phase 13 is NOT to begin** until this branch
is merged and deployed, per the operator's standing instruction.

---

## Core-OS 360 Phase 13: Board Assurance & Executive Reporting (2026-09-29, migration 178)

No detailed operator brief exists in the repo for this phase either —
the same situation Phases 8-12 were in. Scope: `docs/CORE_OS_360_
PHASE13_PLAN.md`, derived from the phase's own name plus a careful
audit of three things that already looked adjacent to "board
assurance" and were read in full before deciding what was genuinely
missing:

1. **The Value Report** — a commercial/relationship document, not a
   governance one.
2. **Management Review** (`management_reviews`/`_decisions`/`_data_
   pack`, Phase 5 Group 6) — the ISO clause 9.3 ritual: a working
   document for one meeting, not a periodic distributed/signed-off
   report.
3. **`computePortfolioCounts()`** (`lib/health/portfolioCounts.ts`,
   Phase 6) — already computes exactly the kind of assurance facts a
   board would want (open critical actions, overdue legal reviews,
   workers not ready, assets unavailable, major audit findings,
   contractor insurance/environmental permits expiring, …), but it
   feeds only the **staff-only** `client_health_snapshots` — "an
   internal BD/account-management signal, never shown to a client"
   (107's own words). The client's own board has never seen this.

**The gap this phase closes**: nothing assembled the client's OWN
board-relevant facts into one periodic, DISTRIBUTABLE, SIGN-OFF-ABLE
document. Delivered in **3 groups**.

### Group 1: schema + pure computation (migration 178)

- **`board_assurance_reports`**: one row per company per (year,
  quarter) — the SAME quarterly cadence the Value Report already
  established. `report_data` is an IMMUTABLE JSONB SNAPSHOT, generated
  once and never recomputed after the fact — the exact
  `management_review_data_pack` precedent ("a stored snapshot, never
  recomputed... generating a new pack inserts a fresh row rather than
  overwriting the old one"). `board_assurance_reports_guard()`
  (BEFORE INSERT OR UPDATE) enforces this for every session INCLUDING
  staff: only `status` (and the `issued_at`/`issued_by` it stamps
  together) may change after generation, and `status` may only move
  `draft -> issued`, never back — proved live both ways in the probe.
- **No new Digital Twin snapshot-history table.** The quarterly
  cadence is coarse enough that the sequence of PAST STORED REPORTS
  already is the trend history — `lib/boardAssurance/computeReport.ts`
  compares THIS quarter's computed overall band against the
  immediately prior stored report's own `report_data.overallBand`, a
  documented, deliberate scope decision (not an oversight) recorded in
  the plan doc, avoiding a near-duplicate of `client_health_snapshots`
  (which stays exactly what it already is: internal, staff-only,
  daily).
- **`board_assurance_acknowledgements`**: insert-only — a board member
  (a `client_admin`) reads an ISSUED report and acknowledges it.
  `company_id`, `acknowledged_by` and `acknowledged_by_name` are ALL
  derived from the parent report and the session inside
  `board_assurance_acknowledgements_fill()` — never trusted from the
  caller, the same "person_id filled from parent, never trusted"
  discipline every H&S sub-record trigger already uses. The fill
  trigger also refuses acknowledging a report that is not yet
  `issued` — a real database gate, not a UI convention: proved live
  that a client attempting to acknowledge a draft is refused even
  though the RLS read policy alone would have hidden the draft from
  them anyway (defence in depth, not redundancy — the acknowledgement
  route is a DIFFERENT code path from the read page). `UNIQUE
  (report_id, acknowledged_by)` is a duplicate-click guard, not a
  "no corrections" statement — a genuinely different board member
  acknowledges the SAME report independently, proved live.
- **Capabilities REUSED, not invented**: `risk.read` (client SELECT on
  issued reports and on acknowledgements) / `risk.create` (client
  INSERT on acknowledgements) — both already existed and were already
  granted to the relevant roles since Phase 1 (117); this migration
  adds no capability-seeding block at all, unlike Groups 2 of Phase 4
  and Group 1 of Phase 5, which both needed one for a genuinely new
  capability.
- **Outbox whitelist**: `year, quarter, status` only — never
  `report_data`, which would put a large computed blob into the
  outbox for no consumer that needs it (the consequence rule reads the
  row directly instead). `board_assurance_acknowledgements` has
  deliberately NO outbox entry of its own — one meaningful event per
  REPORT (its own issue), not one per board member's sign-off, the
  exact `hs_audit_responses`-is-not-a-source reasoning.
- **`boardAssuranceRules.ts`** (own file — a periodic, cross-pillar
  governance ARTEFACT, the same "genuinely different content gets its
  own file" call `governanceRules.ts`/`legalRegisterRules.ts` already
  made): `board_assurance_report_issued` tells staff
  (`/health-safety/<id>/board-assurance`) and the client admins
  (`/protect/board-assurance`) on the draft -> issued transition.
  Nothing here decides anything — the transition already happened, as
  a staff action taken directly on the row; this rule only reports it,
  the same posture `management_review_completed` already established.
- **Live probe** (`supabase/probes/178_board_assurance_reports.sql`,
  19 checks, all passed): draft creation, report_data frozen even for
  staff, a draft invisible to the client, the issue transition stamps
  `issued_at`/`issued_by`, un-issuing refused, the issued report
  visible to its own company and denied to a different one, a
  cross-org acknowledgement attempt refused, the fill trigger's
  derived fields proved never trusted from the caller, a duplicate
  acknowledgement refused while a second board member's own
  acknowledgement succeeds independently, acknowledging a draft
  refused, RLS enabled on both tables, neither DEFINER function
  anon-executable, the write guard's three RESTRICTIVE policies
  present on the one client-writable table, and the outbox recording
  both the created and issued events.
  **A test-writing mistake, not a schema defect**: the probe's own
  first draft checked `pg_trigger` for a `%write_guard%` name to
  confirm the write guard was applied — `apply_write_guard()` actually
  creates RESTRICTIVE POLICIES (`write_guard_ins`/`_upd`/`_del`), not a
  trigger, confirmed by reading its own live `pg_get_functiondef()`
  before trusting the assertion either way; the probe was corrected to
  query `pg_policy` instead, and the same fix was carried into
  `boardAssuranceReportsSql.test.ts`'s own equivalent assertion so it
  was never wrong in the first place.
- `boardAssuranceReportsSql.test.ts` (15 tests) pins the migration
  text; `platformEventsSql.test.ts` gained 178 to its `LATER` list
  (this migration adds a BRAND NEW trigger, the same "not just a
  redefinition" precedent `169`/`174` already established for their
  own new tables); `computeReport.test.ts` (7 tests) pins the pure
  assembly function, including the trend-severity ordering (green
  least severe, red most, amber between) in both directions.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1542 admin — up from 1518, +24 new; 712 portal, unchanged — this
group touched only the shared-dupe `notify/types.ts` mirror plus each
app's own separately-maintained `NotificationBell.tsx`, neither of
which added a new portal test file), all five CI guards pass
(`check-shared-dupes.sh`: 56 pairs, unchanged), both production builds
compile. Migration 178 applied live and verified (both tables exist,
19/19 probe checks pass).

### Group 2: admin generate/issue/PDF UI, portal read + acknowledge

- **`admin/src/lib/complianceTwin/loadSnapshot.ts`** extracts the
  Digital Twin admin page's own ~20-query assembly (Phase 12, Group 2)
  into `loadComplianceTwinSnapshot(supabase, companyId)`, so the new
  "Generate" action calls the IDENTICAL assembly rather than a second,
  potentially-drifting copy — the same "one calculation, not two" rule
  `computeValueReport()`/`computeGovernanceMetrics()` already established.
  `/health-safety/<companyId>/digital-twin/page.tsx` was rewritten to
  call this extracted function instead of inlining the logic; its
  rendering and portal's own Digital Twin page are both unchanged
  (portal reads session-scoped company id and a service-role
  `legal_requirements` lookup that has nothing to do with the
  generate action, which is staff-only anyway).
- **`admin/src/lib/boardAssurance/loadPortfolioCounts.ts`**'s
  `loadPortfolioCountsForCompany(supabase, companyId)` mirrors the
  EXACT per-table column selections `/api/cron/health-snapshot/route.ts`
  already uses for `computePortfolioCounts()` (Phase 6), scoped to one
  company via `.eq('company_id', companyId)` (or
  `.eq('client_organisation_id', companyId)` for `consultancy_visits`)
  instead of the whole portfolio — never a re-derived counting formula,
  only a narrower WHERE clause. `contractor_insurances` has no direct
  `company_id`; it is scoped by first reading the company's own
  `contractors` then `.in('contractor_id', contractorIds)`.
- **`POST /api/admin/board-assurance/generate`** (`requireStaff()`):
  reads the Digital Twin snapshot and the scoped portfolio counts in
  parallel, the most recently COMPLETED `management_reviews` row (and
  its decisions), and any existing prior-period `board_assurance_reports`
  row (for `computeBoardAssuranceReport()`'s own trend comparison — see
  Group 1: null when none exists, never guessed) — then inserts. A
  `23505` (an existing report for that company/year/quarter) is
  reported as a 409, never silently overwritten.
- **`PATCH /api/admin/board-assurance/[id]`** (`requireStaff()`): the
  ONLY session-side transition the table's own guard allows after
  generation — `{ action: 'issue' }` → a conditional `.update({
  status: 'issued' }, { count: 'exact' })`. No pre-validation of the
  transition here at all: the database's `board_assurance_reports_guard()`
  (migration 178) decides, this route only asks and surfaces its
  refusal (404 on no match — a draft the guard already reset, or a row
  that does not exist) — the same posture every H&S workflow guard in
  this codebase already takes.
- **`admin/src/lib/boardAssurance/buildReportPdf.ts`** mirrors
  `lib/valueReport/buildReportPdf.ts`'s exact parameterised-builder
  pattern (jsPDF/autoTable passed in, never imported at the module's
  own top) — title/period/overall band/trend, an areas table, a
  portfolio-counts table, and the latest completed management review's
  decisions.
- **`/health-safety/<companyId>/board-assurance`** (admin): lists every
  report for the company regardless of status (staff review drafts
  before issuing them — the whole point of this page), a "Generate a
  new report" form (year/quarter → POST `/generate`), per-report
  expand/collapse detail, "Print PDF" (lazy `import('jspdf')`/
  `import('jspdf-autotable')`, keeping the page bundle small — the
  Value Report's own precedent), and an "Issue" button on drafts only.
  A 28th `HsCompanyTabs.tsx` tab, no new sidebar entry needed (nests
  under the already-linked `/health-safety` prefix).
- **Portal gets a read-only `/protect/board-assurance`**, gated by
  `protect` alone — added to `moduleAccess.ts`'s `ROUTE_FLAGS` and the
  PROTECT `layout.tsx`'s own `TABS` list. Its own `.eq('status',
  'issued')` is defence in depth: `board_assurance_reports_client_read`
  (178) already refuses a draft to a client session, the same
  belt-and-braces `/protect/documents`' `effective_from` filter already
  applies to an RLS rule that already enforces the same thing.
  **`BoardAssuranceReportData` is declared LOCALLY and narrowly**
  (`board-assurance/types.ts`) — only `overallBand`/`trend`/
  `complianceTwin` (the three fields this read-only page actually
  renders), not admin's full type (which also carries
  `portfolioCounts`/`latestManagementReview`/`companyId`/`generatedAt`,
  none of which this page shows) — the exact "declare a narrow local
  interface naming only the fields this file reads" precedent Group 1's
  own Digital Twin work already established for its two admin-only KPI
  inputs. `ComplianceTwinSnapshot` itself IS imported directly from the
  shared-dupe `lib/complianceTwin/assemble.ts`, since that type is
  genuinely identical in both apps.
- **`BoardAssuranceAcknowledge.tsx`** is the exact `RamsAcknowledge.tsx`
  pattern: `'use client'`, a plain browser `createClient().from(
  'board_assurance_acknowledgements').insert({ report_id, comment })`
  under the signed-in session — `company_id`/`acknowledged_by`/
  `acknowledged_by_name`/`acknowledged_at` are ALL derived server-side
  by `board_assurance_acknowledgements_fill()` (178), never sent from
  the browser. **No pre-check for an existing acknowledgement** — a
  duplicate click is refused by the table's own `UNIQUE (report_id,
  acknowledged_by)`, surfaced as `error.code === '23505'` → "You have
  already acknowledged this report." rather than a client-side guess at
  the database's own rule that could drift out of step with it.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green (1542
admin, unchanged — this group's admin work is UI/routes with no new
admin test file, consistent with this codebase's established "no
component-level test" convention for presentational/route-glue code;
715 portal — 712 + 3, `portalPagesLinked.test.ts`/
`clientServerBoundary.test.ts` picking up the new page/component
automatically), all five CI guards pass with no regressions
(`check-shared-dupes.sh`: 56 pairs, unchanged — `types.ts` is portal-only,
not a shared-dupe candidate; `check-row-cap.sh`: clean; `check-route-
validation.sh`: 44, unchanged; `check-admin-routes-linked.sh`: 42
static routes, all reachable — the new admin route nests under the
already-linked `/health-safety` prefix; `check-blind-updates.sh`: 102,
unchanged — the one new admin `.update()` (issue) was built with
`{ count: 'exact' }` from the start), both production builds compile,
including `/health-safety/<companyId>/board-assurance` and
`/protect/board-assurance`.

### Group 3: regression, adversarial QA, handover (gate: PASS WITH MINOR ISSUES)

Full handover + QA report: `docs/CORE_OS_360_PHASE13_HANDOVER.md`.

One real Medium-severity defect was found and fixed:

- **The "latest completed management review" attached to a report had no
  date bound relative to the report's own (year, quarter) period.**
  `POST /generate`'s query picked the GLOBALLY most recent completed
  `management_reviews` row, regardless of which period was being
  generated — nothing stops staff generating an OLDER quarter's report
  AFTER a LATER review has already completed (backfilling a missed
  quarter is a genuine, plausible workflow), in which case the older
  report would cite a review that, read chronologically, comes AFTER the
  period the report itself claims to cover. Exactly the class of bug
  `leadMetrics.ts`'s own "Overdue is relative to the REPORT month, not
  today" rule and `computeQuarterlyValueReport.ts`'s stock/flow field
  split both exist to prevent elsewhere in this codebase — this one field
  had inherited none of that discipline. Fixed with `quarterEndDate(year,
  quarter)` (`lib/boardAssurance/computeReport.ts`) and a
  `.lte('review_date', quarterEndDate(...))` bound on the route's query,
  so a Q1 2026 report can only ever cite a review completed on or before
  31 March 2026, however many later reviews have since completed.
  Mutation-tested live: removing the bound was reintroduced and watched
  fail both new `generate/route.test.ts` cases, then restored and
  re-verified green. Three new `quarterEndDate` unit tests pin the
  boundary itself, including the Q4→31 December rollover and a leap-year
  February inside Q1.

Everything else checked and found clean: a cross-tenant acknowledgement
attempt is refused (the fill trigger derives the REAL owning company from
the report via a SECURITY DEFINER lookup that bypasses RLS, and Postgres
evaluates `WITH CHECK` against that DERIVED value, after `BEFORE INSERT`
triggers run — a caller's own claimed values are irrelevant); acknowledging
a draft is independently refused by the same trigger; two concurrent
"Issue" clicks on the same report are safe by construction (the second,
later call's `OLD.status` is already `'issued'`, so the guard's own
re-stamp branch does not fire, and the outbox only records a `status`
change when the value actually differs — no duplicate notification); a
staff-session (not service-role) read across all 13 tables
`loadPortfolioCountsForCompany()` touches was spot-checked against the
ACTUAL live RLS policy text for each one, and every table carries a
blanket staff ALL/SELECT policy, so no silent under-count; the scoped
reads are column-for-column identical to the reference cron's
portfolio-wide reads, narrowed only by an added `company_id` filter; and
no sensitive free text (`comment`, `report_data`'s full snapshot) reaches
the outbox, a notification, or an audit-trail whitelist.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green (1547
admin — 1542 + 5 new: 3 `quarterEndDate` unit tests + 2
`generate/route.test.ts` cases; 715 portal, unchanged — this group's fix
is admin-only), all five CI guards pass with no regressions
(`check-shared-dupes.sh`: 56 pairs, unchanged; `check-row-cap.sh`: clean;
`check-route-validation.sh`: 44, unchanged; `check-admin-routes-linked.sh`:
42 static routes, all reachable; `check-blind-updates.sh`: 102,
unchanged), both production builds compile.

**Phase 13 is complete. Phase 14 is NOT to begin** until this branch is
merged and deployed, per the operator's standing instruction.

---

## Core-OS 360 Phase 14: Worker QR System (in progress, migration 179)

No detailed operator brief exists in the repo for this phase (the same
situation Phases 8-13 were in). Scope: `docs/CORE_OS_360_PHASE14_PLAN.md`,
derived from the phase's own name plus a careful audit of what the
codebase already has.

Phase 3 built the whole Safe to Deploy engine and a rich per-person
profile — but reaching either needs a platform login and a search. On
an actual site, the person who needs "is this worker cleared to be here
right now" is often a security guard, a site manager, or another
contractor's supervisor — someone who may have no Core OS 360 login at
all. This phase adds a durable, revocable QR code per worker that opens
a no-login page showing a COARSE Safe to Deploy status, plus an
optional site check-in/out so "who is currently on site" becomes a
real, live fact — directly useful for Phase 4's Emergency Planning (a
muster-point roster) without building a second attendance system.

### Group 1 (migration 179): schema + pure computation

- **The public page shows STATUS ONLY, never reasons or requirements.**
  `person_deployment_status()`'s `reasons[]`/`requirements[]` name
  exactly which mandatory item is missing (e.g. "induction expired") —
  precise enough to be an HR/compliance detail nobody intended to be
  readable by anyone who photographs or shares a badge. New
  `worker_qr_status(p_token_hash)` (SECURITY DEFINER) returns only the
  raw four-value `status` string plus name/job title/employer/site —
  nothing else, and never occupational health, salary, NI, DOB, or
  address.
- **Never `person_deployment_status()`/`person_visible()` for this
  route.** Both require a real, visible-to-the-caller session — an
  anonymous badge scan has none of that. Authorisation here is the
  TOKEN itself, the exact model `hs_test_tokens`/`policy_ack_tokens`
  already established for a different no-login artefact.
  `worker_qr_status()` is SECURITY DEFINER so it may call the
  otherwise-locked-down `_wf_deployment_safe()` the same way
  `person_deployment_status()`/`workforce_readiness()` already do (all
  three are owned by the same privileged role, which is why the call
  succeeds despite `_wf_deployment_safe()`'s own blanket `REVOKE ALL
  ... FROM PUBLIC, anon, authenticated`) — granted to `service_role`
  only, never `anon`/`authenticated`, matching the `org_user_ids_with_
  capability`/`audit_log`/`prune_latest_updates` precedent for a
  service-role-only helper.
- **The token is DURABLE, not single-use — the one deliberate departure
  from every other token table in this codebase**
  (`profile_access_tokens`/091, `policy_ack_tokens`/103, `hs_test_
  tokens`/116 are all single-use, burned on redemption). A badge must
  be re-scannable indefinitely. What stays the same: SHA-256 hash only
  stored in `worker_qr_tokens`, RLS on with NO session policies at all
  (service role only), and at most one ACTIVE token per person,
  enforced by a partial unique index — a lost badge is REVOKED, never
  deleted (so the audit trail still shows it existed), and a fresh one
  minted. `company_id` is derived from the person by a BEFORE INSERT
  trigger, never trusted from the caller.
- **The raw token exists only at mint time, in the mint response —
  there is no "look the badge back up" path**, the same reason a real
  ID card is reissued rather than reprinted from a stored copy.
  `portal/src/lib/workforce/qrTokens.ts`'s `mintWorkerQrToken()` revokes
  any existing active badge first (also enforced by the DB's own
  partial unique index regardless), `revokeWorkerQrToken()` is
  idempotent, and `hasActiveWorkerQrToken()` reports only whether one
  exists, never what it is.
- **`site_checkins` is attendance, not compliance.** It records
  presence only and never feeds, or is fed by, the Safe to Deploy
  engine — a NOT_READY worker can still be checked in; this system
  reports facts, it does not gate access (`contractor_worker_access()`,
  Phase 4, already does that, for contractors specifically, untouched
  here). Its `site_checkins_fill()` trigger refuses a site belonging to
  a different organisation than the person, and at most one OPEN
  check-in per person is enforced by a partial unique index — a
  repeated scan while still on site is a no-op, never a second open
  row.
- **RLS on `site_checkins`: staff ALL, client SELECT (`workforce.read`)
  — deliberately NO client write policy at all.** Check-in/out happens
  ONLY through the public, token-gated scan route (service role,
  bypassing RLS), never a hand-typed portal action; flagged as debt in
  the plan doc, not built here.
- **No outbox entry for either table, deliberately.** A badge mint/
  revoke and a check-in/out are both audited (`audit_row()` — never the
  token hash itself in the whitelist), but nothing here has a
  consequence worth an async notification in this first pass; a future
  phase could add a "checked in but never checked out" reminder,
  flagged as debt.

### Live probe

`supabase/probes` run inline (not a separate file this group — a
single rolled-back `DO $$ ... $$` block), 14 checks: an unknown token
hash resolves `not_found`; a minted token resolves `ok:true` with name/
job title/employer/site and a valid four-value status, with NEITHER
`reasons` NOR `requirements` present in the response; `company_id` is
derived from the person; a second active token for the same person is
refused by the partial unique index; revoking then re-minting succeeds;
a revoked token resolves `not_found`; a cross-organisation site
check-in is refused; a same-organisation one succeeds with `company_id`
derived; a second open check-in for the same person is refused; closing
it then allows a new one; RLS is enabled on both tables;
`worker_qr_tokens` has zero session policies; `site_checkins` has
exactly two (staff ALL, client SELECT), no client write policy;
`worker_qr_status()` is executable by `service_role` only, never `anon`
or `authenticated`. All 14 passed.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green (1561
admin — 1547 + 14 new `workerQrSql.test.ts` cases; 722 portal — 715 + 7
new `qrTokens.test.ts` cases), all five CI guards pass (56 shared-dupe
pairs, unchanged; row-cap clean; 44 unvalidated routes, unchanged; 42
static admin routes, all reachable; 102 blind-update chains, unchanged
— the one new write path, `mintWorkerQrToken()`'s revoke-old-token
step, was built with `{ count: 'exact' }` from the start), both
production builds compile. Migration 179 applied live and verified (14/
14 probe checks pass).

### Group 2: portal badge management + public scan/check-in UI

- **`portal/src/lib/workforce/qrTokens.ts`**'s `mintWorkerQrToken()`/
  `revokeWorkerQrToken()`/`hasActiveWorkerQrToken()` are called only
  from `POST`/`DELETE /api/workforce/people/[id]/badge` — the one route
  boundary a mint/revoke can cross, since `worker_qr_tokens` is
  RLS-on-no-policies and a direct session write is never possible.
  **`has_capability()` is called under the CALLER'S OWN session, never
  the service role**, so it evaluates the caller's REAL grant for the
  PERSON's own organisation (staff included — `is_tps_staff()` already
  short-circuits it true) — the service-role client only performs the
  write itself, after that check has passed. This is the first place
  in this codebase a route calls `has_capability()` directly as an RPC
  rather than relying on it inside RLS; legitimate, since Phase 6's own
  UI already established calling it from app code "to explain a scoped
  grant's own limits."
- **The raw badge token is returned ONLY from the mint response, ever.**
  `WorkerBadgePanel.tsx` renders the QR code ENTIRELY in the browser
  (the `qrcode` npm package, a new dependency — never a third-party
  hosted QR image service, which would leak the badge URL, and
  therefore the token, off this platform) and tells the operator to
  print or save it now: reopening the page later shows only "active" —
  there is no "look the badge back up" read path, the same reason a
  real ID card is reissued rather than reprinted from a stored copy.
  Embedded in the person compliance profile page
  (`/lead/workforce/people/[id]`), visible on every tab (not gated
  behind a new profile tab of its own), gated on `workforce.manage` for
  the management actions and a plain status line otherwise.
- **`/lead/workforce/onsite`** (linked from the workforce index page's
  own action row) lists everyone with an OPEN `site_checkins` row,
  grouped by site — a plain, capability-gated (`workforce.read`) READ
  under the ordinary session; RLS already does the real work. **No
  manual check-in/out control anywhere in the portal** — the plan
  doc's own flagged debt: the only way a row appears or disappears is
  the public scan page.
- **`/w/[token]`** (outside the `(portal)` route group, the exact
  `/test/[token]`/`/policy/[token]`/`/leave/[token]` shape: a server
  preflight fetch to its own API, then a client view) shows the coarse
  status via the SAME `DEPLOYMENT_STATUS_LABELS`/`DEPLOYMENT_STATUS_
  COLOURS` vocabulary the rest of the workforce subsystem already uses
  — no separate, parallel label set invented for the public page — plus
  a single Check in/Check out button.
- **`lib/workforce/qrStatus.ts`**'s `loadWorkerQrStatus()` is the ONE
  place a token is resolved to a person, called by the GET status route
  and both check-in/out routes, so all three can never disagree about
  what a token means. All three run under the SERVICE ROLE — an
  anonymous scan has no session for RLS to evaluate anyway, and
  `worker_qr_tokens` has no session policy regardless.
- **Check-in always targets the worker's OWN assigned `people.site_id`,
  never a manual site picker** — v1 scope, flagged as debt (a scan
  station's own site is a real next step). A repeated check-in scan
  while already checked in is reported as a no-op (`alreadyCheckedIn:
  true`), never a second open row — the DB's own partial unique index
  is the real guard; the route's `23505` branch only avoids surfacing
  it as an error.
- **Rate-limited the same way `/api/test/[token]`/`/api/policy/[token]`
  already are** (`createRateLimiter`/`getRateLimitKey`, IP-keyed): 60
  GETs / 20 POSTs per 5 minutes.
- **`/w/` and `/api/w/` added to `PUBLIC_ROUTES`** in the portal
  middleware, both the page and its own server-side preflight call —
  the same reasoning every prior no-login link in this file already
  states: the person scanning a badge may have no portal login at all.
  A new middleware test pins the exemption is scoped to exactly `/w/`,
  not a lookalike like `/workspace-admin`.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green (1561
admin, unchanged — this group is portal-only; 737 portal — 722 + 15
new: 8 `badge/route.test.ts` cases + 2 new middleware cases +
`portalPagesLinked.test.ts`/`clientServerBoundary.test.ts` picking up
the new pages/routes automatically), all five CI guards pass with no
regressions (`check-shared-dupes.sh`: 56 pairs, unchanged; `check-row-
cap.sh`: clean; `check-route-validation.sh`: 44, unchanged — none of
the new routes read a request body at all; `check-admin-routes-linked.sh`:
42 static admin routes, all reachable — this group touched no admin
route; `check-blind-updates.sh`: 102, unchanged — the checkout route's
`.update()` was built with `{ count: 'exact' }` from the start), both
production builds compile, including `/api/workforce/people/[id]/badge`,
`/lead/workforce/onsite`, `/w/[token]` and `/api/w/[token]/{,checkin,
checkout}`.

### Group 3: regression, adversarial QA, handover (gate: PASS WITH MINOR ISSUES)

Full handover + QA report: `docs/CORE_OS_360_PHASE14_HANDOVER.md`.

One real Medium-severity defect was found and fixed:

- **A leaver's badge was never revoked, and stayed scannable
  indefinitely.** Phase 3's own leaver trigger
  (`workforce_employee_sync()`, migration 137) already ends role
  assignments and revokes exceptions/authorisations the instant
  `employee_records.status` reaches `'terminated'` — but `worker_qr_
  tokens` (179) postdates that migration and was never added to it.
  Reproduced live before fixing: terminating a person left their
  badge's `revoked_at` `NULL` — a former employee's physical badge
  remained scannable for ever, still showing their name, job title and
  employer to whoever held it. **Fixed** (migration 180) by extending
  the SAME "leaving" branch — never a second trigger reacting to the
  same event — with one more `UPDATE worker_qr_tokens SET revoked_at =
  now(), revoked_by = NULL WHERE ... revoked_at IS NULL`, the live
  function body read with `pg_get_functiondef()` immediately before
  writing the migration and reproduced verbatim plus the one new line.
  Mutation-tested live: reverted to the pre-180 body, the probe re-run
  and confirmed the badge stayed active after termination (the original
  bug reproduced), then the fix restored and re-verified passing.

Everything else checked and found clean: the raw token can never be
read back once minted (no session policy on `worker_qr_tokens` at all,
and no code path selects it back to a caller); cross-organisation site
check-in is refused by the fill trigger and — defence in depth — the
check-in route never accepts a caller-supplied site at all; the
capability-gated badge routes correctly refuse a session whose grant
doesn't cover the person's own organisation; a double-click
"Regenerate" race is safe by construction (the DB's own partial unique
index lets only one insert succeed) — the losing request's raw
Postgres error string is real but low-severity UX debt, not a security
or correctness issue, so it's documented rather than fixed here; a
worker gaming their own displayed check-in site has no safety
consequence, per `site_checkins`' own documented "attendance, not
compliance" posture; the profile page's parallel badge-status fetch
never leaks its result to an unauthorised viewer (discarded before the
response is built whenever `person_visible()` says no); rate limiting
mirrors the `/api/test/[token]` precedent exactly; and no sensitive
column, nor the engine's own `reasons[]`/`requirements[]`, ever reaches
a public response.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green (1563
admin — 1561 + 2 new leaver-revoke SQL-shape test cases; 737 portal,
unchanged — this group's fix is entirely SQL/admin-test-side), all five
CI guards pass with no regressions (56 shared-dupe pairs, unchanged;
row-cap clean; 44 unvalidated routes, unchanged; 42 static admin
routes, all reachable; 102 blind-update chains, unchanged), both
production builds compile. Migration 180 applied live and verified
(live-probed and mutation-tested against the real database function,
`supabase/probes/180_worker_qr_leaver_revoke.sql`).

**Phase 14 is complete. Phase 15 is NOT to begin** until this branch is
merged and deployed, per the operator's standing instruction.

---

## Core-OS 360 Phase 15: Intelligent RAMS (in progress)

No detailed operator brief exists in the repo for this phase (the same
situation Phases 8-14 were in). Scope: `docs/CORE_OS_360_PHASE15_PLAN.md`.

RAMS (migration 124) is already a fully-built workflow with 20 fixed
narrative section keys (`hs_rams_sections_valid()`). **Jev cannot draft
free text** — it only answers `noul`/`choice`/`score` questions
(`lib/jev/types.ts`'s own header comment) — so "Intelligent RAMS" is
NOT "Jev writes the method statement". It is a narrow nudge: given a
draft's `title`/`project_name`/`scope_of_work`, Jev flags which
CONDITIONAL sections likely need real content for this specific job.

### Group 1: pure computation + route

- **Only the CONDITIONAL sections are asked about**: `lifting_
  arrangements, isolations, environmental_controls, exclusion_zones,
  waste_disposal, permits_required` — each tied to a recognisable
  real-world condition. The other 14 of the 20 section keys apply to
  virtually every method statement regardless of the work described
  (purpose, scope, responsibilities, ppe, supervision, communication,
  competency_requirements, emergency_arrangements, location, work_
  sequence, materials, plant_equipment, access_egress, site_setup) —
  asking Jev about them would be a near-constant "yes" that tells the
  author nothing, a deliberate, documented scope decision.
  `lib/hs/ramsSectionQuestions.ts` reuses `RAMS_SECTION_KEYS`/`RAMS_
  SECTION_LABELS` (`lib/hs/safetyVocab.ts`) verbatim — never a parallel
  vocabulary that could drift from the DB's own 20-key CHECK.
- **No schema change at all.** `sections` already holds every field
  this touches; a suggestion is UI-only (Group 2), recorded only in
  the existing generic `jev_decisions` table via the existing
  `askJev()`. `rams_section_suggest` added to `DecisionKind`
  (shared-dupe `lib/jev/types.ts`), never to `AUTO_ACT_KINDS` — a RAMS
  is a legally-relevant document; every suggestion is reviewed by the
  human author before anything is saved.
- **A lower gate than a classification decision** (0.6, vs. `doc_
  type_suggest`'s 0.8) — a false positive here costs a glance at an
  irrelevant section; a false positive on a CHOICE is a wrong answer
  outright. `askJev()`'s own `gate`/`gated` mechanism does not apply
  to an all-`noul` question set at all (`minConfidence()` skips `noul`
  answers entirely, so `confidence` is always `null` and `gated` is
  always `false`) — checked, not assumed, before relying on it; the
  per-question probability threshold (`toRamsSectionSuggestions()`)
  is the only gate that actually does anything here.
- **`POST /api/protect/jev/rams-section`** mirrors `/api/lead/jev/
  doc-type`'s exact shape (own session, company from the session, a
  suggestion only — never writes `method_statements`). No dedicated
  route test, matching that same route's own precedent (the pure-
  function tests plus `askJev()`'s own tests already cover the
  call shape).

Verified: `tsc --noEmit` clean both apps, full `vitest run` green (1563
admin, unchanged — this group touched only the shared-dupe `lib/jev/
types.ts` mirror; 743 portal — 737 + 6 new `ramsSectionQuestions.test.ts`
cases), all five CI guards pass (56 shared-dupe pairs, unchanged; row-cap
clean; 44 unvalidated routes, unchanged — the new route reads a body but
validates it with `parseBody`; 42 static admin routes, all reachable —
this group touched no admin route; 102 blind-update chains, unchanged),
both production builds compile, including `/api/protect/jev/rams-section`.

### Group 2: RAMS editor UI

- **`RamsHeaderEditor.tsx`** gains a "Suggest sections to check" button
  next to the existing "Sections" heading — calls `POST /api/protect/
  jev/rams-section` with the CURRENT (unsaved) title/project_name/
  scope_of_work, then reuses the EXISTING `shown`/`remaining` mechanism
  (built for the hand-typed "Add section" dropdown) to reveal any
  flagged, not-yet-shown section — never a new UI panel, never
  pre-filled content. A flagged section that is still empty gets a
  small "Worth checking for this scope of work" note under its label,
  cleared automatically the moment the author types anything into it
  (the note's own condition already checks `!sections[k].trim()`).
- **Nothing is written to `method_statements` by this action.** The
  button only changes local component state (`shown`, a `suggested`
  list for the note) — the existing `Save` button, and its existing
  row-version-conditional update, are completely untouched.
- **No new test file** — a UI-only wiring change with no new pure
  logic, consistent with this codebase's established "no component-
  level test" convention; the pure logic it calls (`lib/hs/
  ramsSectionQuestions.ts`) was already tested in Group 1.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green (1563
admin, unchanged; 743 portal, unchanged — this group is UI-only), all
five CI guards pass with no regressions, both production builds
compile.

### Group 3: regression, adversarial QA, handover (gate: PASS WITH MINOR ISSUES)

Full handover + QA report: `docs/CORE_OS_360_PHASE15_HANDOVER.md`.

**One real, Medium-severity defect found: the suggestion route's own
validation ceiling was narrower than the database column it reads.**
`method_statements.scope_of_work` has always allowed up to 8000
characters (`CHECK (length(scope_of_work) <= 8000)`, migration 124).
Group 1's `POST /api/protect/jev/rams-section` validated it with
`longText(4000)` — a ceiling invented for this route alone with no
relationship to the actual field. Any RAMS whose author had typed a
genuinely long, valid scope of work (4001-8000 characters) would have
the "Suggest sections to check" button fail outright with a 400 the
moment Group 2's UI called it — a real, reproducible failure for a
real subset of legitimate RAMS records, found by the same discipline
this codebase applies everywhere else: check a route's validation
ceiling against the COLUMN's own CHECK, never against a round number
that feels reasonable. `title`'s `shortText(200)` and `project_name`'s
`optionalShortText(200)` were already correct; only `scope_of_work`
had drifted. **Fixed**: raised to `longText(8000)`, matching the
column exactly — `ramsSectionState()`'s own separate `.slice(0, 4000)`
clip (what actually reaches Jev) is untouched, since that is a
different decision (Jev does not need the full 8000 characters to
judge) from what the route is willing to validate. **Mutation-tested**:
a new route test file (`rams-section/route.test.ts`, 7 cases — Group 1
shipped with none, matching `/api/lead/jev/doc-type`'s own precedent,
but this finding justified adding one here) pins an 8000-character
scope of work succeeding and 8001 refused; reverting to `longText(4000)`
was reintroduced and watched fail the 8000-character case (400 instead
of 200) before being restored and re-verified green.

**Everything else checked and found clean**: every question's
`instructions` frames the state as data to classify, never as an
instruction to follow (pinned by both the Group 1 pure-function tests
and this group's own route test); `askJev()`'s `gate`/`gated`
mechanism does nothing at all for an all-`noul` question set
(`minConfidence()` skips `noul` answers, so `confidence` is always
`null` and `gated` always `false`) — checked directly against
`lib/jev/client.ts`'s own source, confirming the per-question
probability threshold (`RAMS_SECTION_SUGGEST_GATE`) is the only gate
that does anything here; the editor UI never writes section content
and never auto-saves (`suggestSections()` only touches local component
state; the existing Save button and its row-version-conditional
update are byte-for-byte unchanged); a flagged-but-still-empty
section's note clears itself the moment the author types anything,
with no separate dismiss action needed; capability gating matches the
existing `doc_type_suggest` precedent (any signed-in company user may
call it — it reads nothing beyond what the caller typed and writes
nothing); rate limiting (`limiters.vendor`) matches every other
Jev-calling route.

**Design decisions documented rather than left to look like
oversights**: only 6 of the 20 section keys are ever asked about (the
other 14 are near-universal and would produce a constant "yes" that
tells the author nothing); the suggestion gate (0.6) is deliberately
lower than a classification decision's gate (0.8) since a false
positive here only costs a glance at an irrelevant section, not a
wrong answer; there is no "dismiss this suggestion" action and no
persisted accept/override/ignore outcome (unlike the H&S register's
own model) — a suggestion here only ever reveals an empty section, and
the existing save-time `cleanSections` logic (an empty section is
never persisted) already answers implicitly whether the author acted
on it.

Verified: `tsc --noEmit` clean both apps throughout every group and
after the B.1 fix, full `vitest run` green (1563 admin, unchanged —
this group's fix is portal-only; 750 portal — 743 + 7 new
`rams-section/route.test.ts` cases), all five CI guards pass with no
regressions (`check-shared-dupes.sh`: 56 pairs, unchanged; `check-row-
cap.sh`: clean; `check-route-validation.sh`: 44, unchanged — the route
validates with `parseBody` and was never on the ratchet list;
`check-admin-routes-linked.sh`: 42 static admin routes, all reachable
— this phase touched no admin route; `check-blind-updates.sh`: 102,
unchanged — this phase adds no new `.update()` call site at all), both
production builds compile, including `/api/protect/jev/rams-section`
and the editor UI change. No migration exists for this phase, so no
shared table, trigger or RLS policy was touched anywhere in it.

**Phase 15 is complete. Phase 16 is NOT to begin** until this branch
is merged and deployed, per the operator's standing instruction.

---

## Core-OS 360 Phase 16: Cross-Client Lessons Learned Network
## (in progress, migration 181)

No detailed operator brief exists in the repo for this phase (the same
situation Phases 8-15 were in). Scope: `docs/CORE_OS_360_PHASE16_PLAN.md`.

**The gap**: nothing anywhere takes what was learned at ONE client's
real incident/audit finding and puts a GENERALISED version of it in
front of OTHER clients — every incident/finding table is strictly
per-company RLS, by design, and the closest existing precedents
(`hs_sector_packs`/`hs_audit_templates`) are seeded once as generic
reference material, never derived from a specific client's real
record. This is a staff-curated, never-automatic feature: the raw
source record stays exactly where it is, private to its own client; a
human writes a NEW, deliberately anonymised summary, and only that
summary is ever shown to anyone else.

### Group 1 (migration 181): schema + pure computation

- **Three tables.** `lessons_learned` is the staff-authored content
  itself — **no `company_id` column at all**, the exact
  `legal_requirements` (159) shape: staff-only RLS, no client SELECT
  policy of any kind. A client only ever sees a lesson's content via
  the portal's own service-role-mediated read (Group 2), scoped to
  exactly the ids their own RLS-protected read of
  `lesson_learned_distributions` returns — the identical Legal
  Register precedent. `lesson_learned_distributions` records which
  companies a PUBLISHED lesson was shared with (staff write, client
  read own company only). `lesson_learned_reads` is a per-user "I have
  seen this" receipt — insert-only, the ONE client-writable table in
  this migration, so it alone gets `apply_write_guard()`.
- **`source_type`/`source_id` on `lessons_learned` is STAFF-ONLY
  traceability** back to the real incident/audit finding/inspection a
  lesson was drawn from — validated via the SHARED
  `hs_entity_table()`/`hs_entity_company()` resolver (already resolves
  `'incident'`/`'audit_finding'`/`'inspection'`, no new branches
  needed), never a bespoke lookup. It is never selected in any
  client-facing read anywhere in this feature — there is no RLS on
  `lessons_learned` a client could reach in the first place, so this
  is enforced by there being no client code path to it, not by a
  policy.
- **No AI anywhere in this migration.** Distribution targeting
  (`lib/lessonsLearned/suggestDistribution.ts`) is a plain,
  deterministic sector match — "which clients share this client's
  sector" is a fact, not a judgement call. The source client itself
  and inactive companies are excluded from the suggestion; a
  manually-authored lesson with no source, or a source with no
  recorded sector, suggests nothing (staff picks manually). This is a
  pre-selection convenience only — Group 2's UI never auto-publishes
  based on it.
- **`published_at`/`published_by` are stamped once**, the first time
  `status` reaches `'published'`, and never reset by a later
  archive/republish cycle — the same "a stored fact, never
  silently re-derived" discipline `board_assurance_reports`' own
  first-issue timestamp already established.
- **A lesson may only be distributed once it is actually published** —
  enforced by `lesson_learned_distributions_fill()` reading the
  parent's own `status`, never by a UI-side check alone.
- **A read receipt derives `company_id`/`read_by`/`read_by_name` from
  the caller's own session, never trusts the request body**, and is
  refused outright unless the lesson has genuinely been distributed to
  the caller's own company — proved live, not just asserted.
- **No `apply_write_guard()` on `lessons_learned` or
  `lesson_learned_distributions`** — neither has a client-writable
  policy to guard, the exact `hs_documents` precedent (a table only
  staff can write needs no read-only-grant guard).

**Live probe** (`supabase/probes/181_lessons_learned_network.sql`,
rolled back, staff/Client A/Client B simulated sessions): 17 checks —
a plain draft lesson inserts and defaults to `draft`; an unknown
`source_type` refused; a nonexistent `source_id` refused; a real
incident source resolves; publishing stamps `published_at` once and
republishing never resets it; distributing a draft lesson refused,
a published one succeeds; no new DEFINER function is anon-executable;
a client can never read `lessons_learned` directly even for a
published lesson distributed to them; a client sees their own
distribution row; a read receipt ignores caller-supplied
`company_id`/`read_by`/`read_by_name`; a second client sees no
distribution row and is refused marking a not-distributed lesson as
read; RLS is enabled on all three tables; the write guard is present
on exactly the one client-writable table. **All 17 passed.**

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1587 admin — 1563 + 24 new: `lessonsLearnedSql.test.ts` (17),
`suggestDistribution.test.ts` (7); 750 portal, unchanged — this group
is admin/database only), all five CI guards pass (56 shared-dupe
pairs, unchanged; row-cap clean; 44 unvalidated routes, unchanged; 42
static admin routes, all reachable — this group touched no admin
route; 102 blind-update chains, unchanged), admin production build
compiles. Migration 181 applied live and verified (all three tables
exist, 17/17 probe checks pass).

### Group 2: admin authoring UI, portal read UI, publish + notify

- **Admin**: a 30th `HsCompanyTabs`-adjacent cross-client page,
  `/health-safety/lessons-learned` (linked from `AdminSidebar.tsx`'s
  PROTECT group, the same pattern `legal-register`/`iso-readiness`/
  `governance-calendar` already use — `lessons_learned` has no
  `company_id`, so this is a cross-client staff catalogue page, not a
  per-`HsCompanyTabs` tab). `LessonsLearnedClient.tsx`: draft/edit a
  lesson (title, category, anonymised summary, optional recommended
  action, an optional "drawn from" source type + a plain pasted record
  id — the same "the id field is a plain paste" precedent
  `IsoClient.tsx`'s own `standard_evidence_links` UI already
  established, never a record picker), then Publish, which opens a
  distribution picker: a "suggest by sector similarity to…" reference
  company dropdown recomputes `suggestDistributionTargets()` and ADDS
  its result to the checked list (never replaces a staff member's own
  prior selection) — a checkbox list of every active company, staff
  confirms before anything sends. Already-distributed companies show
  disabled/checked and cannot be removed from here.
- **`POST /api/admin/lessons-learned/[id]/publish`** is the ONE place
  a lesson is ever told to a client — `requireStaff()`, a conditional
  counted UPDATE moves a draft to `published`, then one
  `lesson_learned_distributions` insert per chosen company (a
  duplicate-key error, meaning already shared, is silently skipped —
  this route is also how staff adds MORE recipients to an
  already-published lesson) followed by a direct, SYNCHRONOUS
  `notify()` call to that company's admins — the same `lib/bd/
  score.ts`/H&S Tests precedent for a route that already holds the
  data a consequence rule would otherwise have to re-derive from an
  outbox event with no single `company_id` to key on at all
  (`lessons_learned` has none). `dedupeKey:
  lesson_learned_published:<lessonId>:<companyId>` — a re-run for the
  same pair notifies nobody twice.
- **New notification type `lesson_learned_published`** in the shared
  `notify/types.ts` (57 shared-dupe pairs, up from 56 — this pair was
  already tracked; the new TYPE entry itself needed no new pair), both
  bells' icon maps (`Lightbulb`/gold — a genuinely new signal, not a
  Jev suggestion, so not the `Sparkles`/purple styling those use).
- **Portal**: read-only `/protect/lessons-learned`, gated by `protect`
  alone. Follows the exact `legal-register` precedent (159/D.4):
  `lessons_learned` is staff-only RLS with no client policy at all, so
  the page reads the caller's OWN `lesson_learned_distributions` rows
  first (RLS-protected, own company only), then fetches ONLY those
  lessons' content with the SERVICE ROLE, filtered again to `status =
  'published'` as defence in depth — `source_type`/`source_id` is
  never selected in this read at all. `MarkLessonRead.tsx` inserts into
  `lesson_learned_reads` naming only the lesson id; `company_id`/
  `read_by`/`read_by_name` are entirely derived server-side by the
  migration's own fill trigger, so there is nothing else for the
  client to send.
- **`lib/lessonsLearned/types.ts` is now a shared-dupe pair** (mirrored
  byte-identical to portal, added to `check-shared-dupes.sh`) — the
  vocab/interfaces are pure and needed on both sides; `suggestDistribution.ts`
  stays admin-only, since only the authoring UI ever picks a
  distribution list.
- **Two CI-guard findings from this group's own first draft, both
  fixed before this shipped**: `check-row-cap.sh` caught three
  `.limit(1000)` reads in the admin page (converted to `readAllPages()`
  with a stable `id` tie-break sort, per the standing pagination rule);
  `check-blind-updates.sh` caught the publish route's status-flip
  UPDATE and the editor's own edit-save UPDATE, both fixed with
  `{ count: 'exact' }` + `judgeWrite()`/an explicit count check before
  this was committed — built counted from the start is the discipline,
  catching it here is the guard doing its job.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1587 admin, unchanged — this group is UI-only over Group 1's already-
tested logic, the established "no component-level test" convention;
753 portal — 750 + 3, `portalPagesLinked.test.ts`/
`clientServerBoundary.test.ts` picking up the new route and components
automatically), all five CI guards pass with no regressions
(`check-shared-dupes.sh`: 57 pairs, up from 56; `check-row-cap.sh`:
clean; `check-route-validation.sh`: 44, unchanged — the publish route
validates with `parseBody`; `check-admin-routes-linked.sh`: 43 static
routes, all reachable; `check-blind-updates.sh`: 102, unchanged), both
production builds compile, including `/health-safety/lessons-learned`
and `/protect/lessons-learned`.

### Group 3: regression, adversarial QA, handover (gate: PASS WITH MINOR ISSUES)

Full handover + QA report: `docs/CORE_OS_360_PHASE16_HANDOVER.md`.

**One real, Medium-severity defect found: the duplicate-distribution
check matched the error's own message text, not Postgres's error
code.** Group 2's first draft of `POST /api/admin/lessons-learned/
[id]/publish` recognised "already distributed to this company" with
`error.message.includes('duplicate key')` — a string match on
Postgres's own, unversioned wording. Every other place in this
codebase that needs to tell a unique-violation apart from a real
failure checks the CODE instead (`reportIncident.ts`, `qrTokens.ts`,
`feed-sources/route.ts`, `board-assurance/generate/route.ts`, both
webhook routes — all check `error.code === '23505'`). Found by
checking this exact established pattern rather than trusting a
plausible-looking string match. **Fixed**: `error.code !== '23505'`.
A related cleanup folded into the same fix: the route also passed
`{ count: 'exact' }` to the INSERT, following the UPDATE/DELETE
convention this codebase uses for a counted write — but an INSERT's
own success/error already tells the whole story (a clean insert IS a
new distribution; a duplicate always surfaces as an error, never a
silent zero-row success), so the option was removed as unnecessary —
the first, and now reverted, use of `{ count: 'exact' }` on an INSERT
anywhere in this app. **Mutation-tested**: a new
`publish/route.test.ts` (6 cases, a small hand-rolled fake rather than
the shared `fakeSupabase` — that fixture's `uniqueKeys` only supports
a single-column key, and this table's real constraint is the
composite `UNIQUE (lesson_id, company_id)`, the same reason
`pipelineIdempotency.test.ts` already uses its own narrow fake)
reverting the fix to the original string match failed 2 of 6 cases
(the duplicate-recognition case, whose fake error message deliberately
differs from the route's original guess, and the add-more-recipients
case) before being restored and re-verified green.

**Everything else checked and found clean**: cross-tenant isolation
(re-read against Group 1's own 17/17 live probe, unaffected by this
group); the publish route's abort-vs-skip comment was corrected to
match its actual behaviour (it aborts on a genuine per-company
anomaly, which is the right call since the UI only ever offers real
company ids — the code was right, the comment was wrong); race safety
on a concurrent double-click publish (the table's own UNIQUE
constraint is the real guard — the loser's insert fails with 23505 and
skips `notify()` entirely, reasoned through rather than merely
assumed); no client-identifying detail (`source_type`/`source_id`)
appears in any client-facing read; the "suggest, add rather than
replace" distribution-picker behaviour matches its own documented
intent.

**Design decisions documented rather than left to look like
oversights**: staff-wide, not portfolio-scoped to a single third-party
consultancy's own client book (Phase 6's model); no AI anywhere in
this phase — a lesson's summary and recommended action are entirely
staff-written, since Jev cannot generate free text at all and
generating anonymised prose from a real incident risks leaking exactly
the detail this feature exists to strip out; no "un-distribute" action
(a notification, once sent, is a historical fact, the platform's
general posture); the "drawn from" source id is a plain paste, not a
record picker, matching the `standard_evidence_links`/
`requirement_evidence_links` precedent exactly.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1593 admin — 1587 + 6 new `publish/route.test.ts` cases; 753 portal,
unchanged — this group's finding and fix are admin-only), all five CI
guards pass with no regressions (`check-shared-dupes.sh`: 57 pairs,
unchanged; `check-row-cap.sh`: clean; `check-route-validation.sh`: 44,
unchanged; `check-admin-routes-linked.sh`: 43 static admin routes, all
reachable; `check-blind-updates.sh`: 102, unchanged — this group's fix
REMOVED a `{ count: 'exact' }` from an INSERT rather than adding an
unguarded UPDATE), both production builds compile. No migration in
this group — the fix is entirely TypeScript over Group 1's already-
probed, unchanged schema.

**Phase 16 is complete. Phase 17 is NOT to begin** until this branch
is merged and deployed, per the operator's standing instruction.

---

## Core-OS 360 Phase 17: Regulatory Intelligence → Action (Tavily)
## (in progress)

No detailed operator brief exists in the repo for this phase (the same
situation Phases 8-16 were in). Scope: `docs/CORE_OS_360_PHASE17_PLAN.md`.

**This phase completes infrastructure the codebase already, explicitly,
reserved for it.** Tavily was named "the external search provider for
later phases" since Phase 1; migration 159 (Legal Register, Phase 5)
built `legal_requirement_research_notes` as "an inert foundation for a
LATER Tavily-based external legal research feature — no live API call
anywhere in this migration... A LATER group wires the real call and
populates it." Columns already existed for exactly this workflow
(`source`, `query_used`, `raw_result_summary`, `reviewed_by`,
`reviewed_at`, `action_taken`); `LEGAL_RESEARCH_SOURCES` vocab already
existed in both apps' `hs/vocab.ts`. The action side was already built
too: `actions.source_type` already allows `'legal_requirement'`, and
Broadcast already has a `/broadcast?legal=<id>` prefill path.

**The one absolute rule, inherited directly from 159's own header:
Tavily never decides anything.** It is a search API returning text
snippets — no more authority than a paralegal's own Google search.
Nothing it returns is ever written to `applicability_status` or
`compliance_evaluations.status`, is never summarised by an LLM into a
verdict, and never triggers an action or a broadcast on its own. A
human reads the raw result and decides.

### Group 1: Tavily client + search route

- **`lib/tavily/client.ts`** is the ONE place Tavily is ever called —
  server-only, `TAVILY_API_KEY` never reaches the client. Reuses
  `lib/http/resilient.ts` (the same `ivylens.ts` precedent: bounded
  retry, per-vendor circuit breaker, a search is safe to retry even
  though Tavily's own API carries the query over POST, since it has no
  side effects). `summariseResults()` is a VERBATIM join of Tavily's
  own titles/urls/content snippets, clipped to `raw_result_summary`'s
  own 4000-char DB limit — never an AI-generated paraphrase; there is
  no Jev involvement anywhere in this phase, since a legal summary is
  exactly the kind of authored content this platform never lets a
  model write.
- **`POST /api/admin/legal-register/[id]/research`** — `requireStaff()`,
  rate-limited (`limiters.vendor`), validates `query` with
  `optionalShortText(500)` matching `query_used`'s own DB CHECK
  exactly (the Phase 15 B.1 lesson, applied from the start this time).
  Builds a default query from the requirement's own title/jurisdiction
  when staff doesn't supply one (`defaultQueryFor()`). Inserts exactly
  one `legal_requirement_research_notes` row per call, `source:
  'tavily'` — nothing else. On-demand only, per the plan doc's own
  scope decision: no scheduled cron, since each call has a real cost
  and quota, the same caution this codebase already applies to
  IvyLens's own `dry_run` default.
- **A real test-design trap, caught before it shipped**: `client.ts`
  reads `TAVILY_API_KEY` into a module-scope `const` at import time —
  the same pattern `ivylens.ts` already uses — so a test's `beforeEach`
  setting the env var AFTER the module's own dynamic import has
  already run has no effect on the already-captured constant. The
  first draft of `client.test.ts` set the env var in `beforeEach` and
  five of its cases failed for the wrong reason (every call reported
  "not configured", masking every other assertion). Fixed by setting
  the env var BEFORE the top-level import, and — for the one test that
  needs to prove the "unset" branch — `vi.resetModules()` plus a
  scoped re-import, leaving every other test's own `tavilySearch`
  reference untouched.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1610 admin — 1593 + 17 new: `tavily/client.test.ts` (11),
`legal-register/[id]/research/route.test.ts` (6); 753 portal,
unchanged — this group is admin-only), all five CI guards pass (57
shared-dupe pairs, unchanged; row-cap clean; 44 unvalidated routes,
unchanged — the new route validates with `parseBody`; 43 static admin
routes, all reachable — this group added no admin PAGE route, only an
API route; 102 blind-update chains, unchanged), admin production build
compiles. No migration in this group — it wires the real call into
migration 159's already-reserved schema.

### Group 2: Regulatory Intelligence admin UI

- **`LegalRequirementsCatalogueClient.tsx`** (the staff-only cross-
  client catalogue page) gains a per-requirement, lazily-loaded
  "Research" panel — expanding it reads
  `legal_requirement_research_notes` directly (this table is staff
  `FOR ALL` RLS, the same posture every other staff-authored catalogue
  read in this codebase already uses; no dedicated GET route needed).
  A "Run Tavily search" button calls the ONE route that ever talks to
  Tavily (Group 1), with an optional query override defaulting to the
  requirement's own title + jurisdiction placeholder text; the returned
  note is prepended to the local list without a second round trip.
- **"Mark reviewed" is the ONLY write this UI makes beyond the
  search itself** — an inline `action_taken` text field plus a button
  that sets `reviewed_by`/`reviewed_at`/`action_taken` via a counted,
  `judgeWrite()`-checked update. It records what a HUMAN decided
  (`"No material change found"`, `"Broadcasted an update to affected
  clients"`, …) — never a verdict the platform reached on its own.
  `reviewed_by` is the ACTING staff member's own id, read client-side
  via `auth.getUser()` (no DB trigger derives it — this table's only
  trigger is the existing `BEFORE INSERT` one stamping `created_by`;
  adding a second, `BEFORE UPDATE` one for a single client-side read
  was judged unnecessary complexity for a staff-only, RLS-`FOR ALL`
  table with no cross-tenant boundary to protect here).
- **The action-raising side of "→ Action" needed NO new mechanism at
  all** — the catalogue row's existing `/broadcast?legal=<id>` link
  (Phase 5, Group 8) was already sitting right there, already doing
  exactly what a research finding might warrant acting on: picking
  affected clients, composing a message, sending through the existing
  reviewed-before-sending confirm modal. `action_taken`'s own free text
  is where staff records that a broadcast (or nothing) is what came of
  a given piece of research.
- A stray JSX-structure trap from the two-row-per-requirement layout
  (a plain row plus a conditional expanded row) was caught by `tsc`
  itself before it ever ran: `.map()` returning two sibling `<tr>`
  elements needs an explicit `<Fragment key={r.id}>` wrapper, since the
  JSX shorthand `<>...</>` cannot carry a `key` prop.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1610 admin, unchanged — this group is UI-only over Group 1's already-
tested route, the established "no component-level test" convention;
753 portal, unchanged — this group's only portal-side touch is the
shared-dupe `hs/types.ts` comment update, byte-identical, no behaviour
change), all five CI guards pass with no regressions (57 shared-dupe
pairs; row-cap clean; 44 unvalidated routes, unchanged; 43 static admin
routes, all reachable — no new admin route in this group; 102
blind-update chains, unchanged — the new "Mark reviewed" update is
counted and judged from the start), both production builds compile.

### Group 3: regression, adversarial QA, handover (gate: PASS WITH MINOR ISSUES)

Full handover + QA report: `docs/CORE_OS_360_PHASE17_HANDOVER.md`.

**One real, Low-severity defect found: the phase's own two new
environment variables were never added to this file's Environment
Variables section.** `TAVILY_API_KEY`/`TAVILY_API_URL` are read by
`lib/tavily/client.ts` but were missing from the top-of-file summary
this codebase maintains for exactly this purpose (where
`IVYLENS_API_URL`/`MANATAL_API_KEY`/the Stripe keys already live).
Without it, whoever deploys this phase has no signal a new secret
needs setting in Vercel — every "Run Tavily search" click would fail
with a correctly-reported but avoidable "not configured" error. Found
by checking this codebase's own established documentation convention
(every prior external-API phase added its vars here; Phase 17 skipped
it). **Fixed**: both vars added. A WIDER, pre-existing gap was found
while confirming this one and deliberately NOT fixed here: this
section has not been kept current since roughly Phase 29 — several
later phases' own env vars are documented only in their own sections
further down this file. Flagged as real debt for Phase 19's
platform-hardening sweep, not expanded into scope here.

**Everything else checked and found clean**: the Tavily API key never
reaches the client (grepped — imported from exactly one file, the
server-only route); neither the research route nor "Mark reviewed"
ever writes `applicability_status`/`compliance_evaluations.status` —
re-read every write path this phase adds to confirm; RLS on
`legal_requirement_research_notes` is untouched and staff-only, with
no migration in this phase to have drifted it; rate limiting reuses
the same shared `limiters.vendor` bucket every other vendor-calling
route already uses; validation ceilings match their DB columns
exactly (`query` at `optionalShortText(500)`, matching `query_used`'s
own CHECK); `defaultQueryFor()`'s output can never exceed 500 chars
regardless of input, since `title`/`jurisdiction` are themselves
capped at 200/100 by their own DB CHECKs; the "a fresh search could
drop unfetched older notes" scenario initially suspected is not
actually reachable, since the search button only renders inside a
panel that has already loaded existing notes by the time it appears.

**Design decisions documented rather than left to look like
oversights**: on-demand only, never a scheduled cron (each Tavily call
has a real cost); no AI summarisation anywhere in this phase —
`raw_result_summary` is Tavily's own verbatim snippets, never an LLM
paraphrase; the "→ Action" loop reuses the existing Broadcast prefill
link rather than inventing a bespoke per-client action-raising flow;
a concurrent "two staff members reviewing the same note at once"
scenario is an accepted, low-stakes limitation (this table has no
`row_version` column the way frequently-co-edited records elsewhere
do), not a defect fixed here.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1610 admin / 753 portal, both unchanged — this group's fix is
documentation-only), all five CI guards pass with no regressions
(`check-shared-dupes.sh`: 57 pairs; `check-row-cap.sh`: clean;
`check-route-validation.sh`: 44, unchanged; `check-admin-routes-linked.sh`:
43 static admin routes, all reachable; `check-blind-updates.sh`: 102,
unchanged), both production builds compile. No migration in this
group — the fix is entirely documentation over Groups 1-2's already-
tested, unchanged code.

**Phase 17 is complete. Phase 18 is NOT to begin** until this branch
is merged and deployed, per the operator's standing instruction.

---

## Core-OS 360 Phase 18: Core 360 Assurance — "Are we safe and
## compliant today?" (in progress)

No detailed operator brief exists in the repo for this phase (the same
situation Phases 8-17 were in). Scope: `docs/CORE_OS_360_PHASE18_PLAN.md`.

**What already exists, and why it is not quite this.** The Compliance
Digital Twin (Phase 12) already assembles five read-only modules into
one snapshot with a per-area RAG band — but all five (safety,
governance, risk graph, incident patterns, evidence coverage) are
somewhat backward-looking or slow-moving measures. Nothing in it
answers the literal, present-tense question this phase's name asks: is
anyone not currently Safe to Deploy RIGHT NOW, is an asset quarantined
RIGHT NOW, is a permit or isolation open RIGHT NOW.
`lib/health/portfolioCounts.ts` (Phase 6) already computes exactly
those "right now" facts — but it was built for, and used by, ONE
thing: the staff-only, cross-portfolio daily health-snapshot cron, an
internal BD signal never shown to a client. It is, itself, a genuinely
pure function with no Supabase client — nothing about its own logic is
staff-only; only its one existing caller and the table it writes to
are.

**The gap this phase closes**: putting those two together into a
single, TODAY-dated view a client (and staff, about that client) can
actually read — never a certification, only facts.

### Group 1: assurance-today computation

- **`lib/assurance/today.ts`** (`assembleAssuranceToday()`) is a pure
  COMPOSITION, computing no new raw fact of its own — the identical
  posture `complianceTwin/assemble.ts` itself already takes one layer
  down. It takes an already-computed `PortfolioCounts` for ONE company
  and an already-computed `ComplianceTwinSnapshot`, and combines them
  into one `AssuranceTodaySnapshot`: a `band` (`clear`/`attention`/
  `urgent`), a plain factual `headline`, and a sorted `items` list of
  only the non-zero counts (high severity before medium, tie-broken
  alphabetically by key for determinism).
- **The absolute rule, inherited from every prior phase that touched
  this ground: never assert "safe" or "compliant" as a verdict.** The
  headline is a count, or the plain absence of one — "no items are
  currently flagged" is a fact; "you are compliant" is a legal
  conclusion this platform never makes. A twin band of `red`/`amber`
  alone (even with every operational count at zero) still forces the
  overall band to at least `urgent`/`attention` — the twin's own
  slower-moving picture is never silently dropped just because
  nothing is wrong RIGHT NOW.
- **`lib/health/portfolioCounts.ts` is promoted to a shared-dupe pair**
  (mirrored byte-identical to portal, 59 pairs up from 57) — it was
  already genuinely pure (confirmed via its own header comment before
  relying on that, not assumed), the identical reasoning that made
  `hs/kpis.ts`/`governance/kpis.ts` shared-dupe pairs the moment
  Phase 12's own portal page needed them too. `lib/assurance/today.ts`
  is a new shared-dupe pair for the same reason — both apps need the
  identical combining logic.
- **A test bug caught by the test itself, not a defect in the source**:
  the first draft of `today.test.ts` asserted the clean headline
  never contains the substring `'safe'` — which also matches
  `'safety'`, the domain noun the clean headline legitimately uses
  ("...across safety, workforce, assets..."). Fixed to a word-boundary
  regex (`/\bsafe\b/`) so the assertion actually tests what it means to
  test: no standalone verdict word, not "never mentions the word
  safety at all."

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1620 admin — 1610 + 10 new `today.test.ts` cases; 753 portal,
unchanged — no new portal test file, the mirrored source needs none
of its own per the `hs/kpis.ts` precedent), all five CI guards pass
(59 shared-dupe pairs, up from 57; row-cap clean; 44 unvalidated
routes, unchanged; 43 static admin routes, all reachable — this group
added no route; 102 blind-update chains, unchanged), both production
builds compile.

### Group 2: Assurance Today UI

- **`AssuranceTodayView.tsx`** (a new shared-dupe pair, the exact
  `ComplianceTwinView.tsx` precedent: identical already-assembled
  snapshot, only per-area link targets differ by caller) renders the
  headline band, a "flagged today" table of only the non-zero items,
  and then embeds the EXISTING `ComplianceTwinView` component unchanged
  underneath it for the five-area picture — never a duplicate rendering
  of that view's own logic.
- **Admin**: a 31st `HsCompanyTabs.tsx` tab, "Assurance Today"
  (`/health-safety/<companyId>/assurance`), placed next to the existing
  "Digital Twin" tab. The page itself needed **zero new query code** —
  it composes two loaders that already existed for exactly this shape
  of read: `loadPortfolioCountsForCompany()` (Phase 13, built for Board
  Assurance's own per-company report generation) and
  `loadComplianceTwinSnapshot()` (Phase 12), then calls
  `assembleAssuranceToday()` (Group 1).
- **Portal**: read-only `/protect/assurance`, gated by `protect` alone.
  Since admin and portal are separately deployed apps with no shared
  server code, portal cannot import admin's loaders directly — its
  page copies the Digital Twin portal page's own query logic VERBATIM
  for the twin half (the established precedent: portal's Digital Twin
  page already duplicates its own reads rather than calling admin's
  loader), then adds seven NEW, narrowly-scoped queries for exactly the
  `PortfolioCounts` fields `assembleAssuranceToday()` actually reads —
  checked live against RLS before writing a line of this page:
  `actions`, `organisation_legal_obligations`, `hs_documents`,
  `hs_incidents`, `person_deployment_status`, `hs_equipment` and
  `audit_findings` all have a client-read policy; `contractors`/
  permits/isolations/`consultancy_visits` do not, so those
  `PortfolioCounts` fields are passed as empty arrays — never among the
  ones this phase's own `items` list reads, so nothing is
  under-reported on the page a client actually sees.
- **A real gap caught by the CI guard itself, not by review**: the
  first draft of this group forgot to register `AssuranceTodayView.tsx`
  in `check-shared-dupes.sh`'s pairs list — the guard's own count
  stayed at 59 (Group 1's number) instead of the expected 60, which is
  what surfaced the omission before this shipped, not after.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1620 admin, unchanged — this group is UI-only over Group 1's already-
tested logic; 755 portal — 753 + 2, the sweep tests picking up the new
`/protect/assurance` route automatically), all five CI guards pass
(`check-shared-dupes.sh`: 60 pairs, up from 59 once the missed
registration was fixed; row-cap clean; 44 unvalidated routes,
unchanged; 43 static admin routes, all reachable — the new admin route
is dynamic (`[companyId]`), so it needed no literal-reference check;
102 blind-update chains, unchanged — this group writes nothing, both
pages are read-only), both production builds compile, including
`/health-safety/<companyId>/assurance` and `/protect/assurance`.

### Group 3: regression, adversarial QA, handover (2026-09-30)

Full handover + QA report: `docs/CORE_OS_360_PHASE18_HANDOVER.md`.
**Gate: PASS.**

**No Critical, High or Medium defect was found in this pass** — a
genuinely thorough review, not a formulaic one:

- **The absolute "never a verdict" rule was checked against the actual
  rendered text, not just the intent.** Grepping every new file
  (`today.ts`, `AssuranceTodayView.tsx`, both pages) for the standalone
  words "safe"/"compliant"/"unsafe"/"non-compliant" found only: code
  comments (never rendered); the copy paragraph's own META-statement
  ("...it never says 'safe' or 'compliant' on this organisation's
  behalf" — describing the policy, not violating it); and the item
  label `'Workers not currently Safe to Deploy'`, which cites Phase 3's
  own established, capitalised system name for its engine's output
  (`READY`/`NOT_READY`/`REVIEW_REQUIRED`) — a reference to another
  system's own vocabulary, not this phase asserting a verdict of its
  own, the same distinction already drawn for "Digital Twin"/"Board
  Assurance" as named features.
- **`computePortfolioCounts([companyId], ...).get(companyId)!` is never
  actually unsafe** despite the non-null assertion — the function's own
  body unconditionally seeds a zero-defaulted entry for every id in the
  `companyIds` array it is given, regardless of whether any row
  references that company. A brand-new client with zero of everything
  gets `0` counts, not `undefined`.
- **Portal's new RLS assumptions were re-verified against the actual
  live policies, not merely restated from memory**: `hs_documents_
  client_read` (106), `audit_findings_client_read` (162),
  `person_deployment_status_read` gated by `person_visible()` (136) —
  each grepped directly out of its migration file before relying on it.
- **`loadError` aggregation in the portal page was diffed against the
  Digital Twin portal page's own chain** to confirm the seven new
  queries' errors were APPENDED, not substituted for any of the
  original eighteen — none dropped.
- **The admin `HsCompanyTabs.tsx` tab's generated href was traced
  against the actual page's route** rather than assumed to match by
  naming convention alone.
- **The triple-read of `organisation_legal_obligations` on the portal
  page** (once for governance KPIs, once for the risk graph, once for
  PortfolioCounts, each with a different column selection) is real,
  acknowledged redundancy — already documented in the page's own header
  comment as a deliberate tradeoff (clarity of separately-shaped reads
  over cross-consumer column-merging), not silently reintroduced debt.

**One real process gap, already caught and fixed the same day it was
introduced** — recorded for history, not carried into this pass as a
new finding: `AssuranceTodayView.tsx` went unregistered in `check-
shared-dupes.sh`'s own pairs list during Group 2's first draft, caught
by the guard's own reported count staying at 59 instead of the expected
60, and fixed before Group 2's PR was opened.

Every design decision that might otherwise look like an oversight is
explicitly documented rather than silently made: composition over a
sixth intelligence module, the `portfolioCounts.ts` shared-dupe
promotion, portal's separately-shaped queries (the two apps have no
shared server code), and the empty-array fields for `PortfolioCounts`
columns with no client-read policy — none of which
`assembleAssuranceToday()` ever reads, so nothing the page shows is
under-reported.

Verified: `tsc --noEmit` clean both apps (no code changed in this
pass — it is review and documentation only), full `vitest run` green
(1620 admin / 755 portal, unchanged from the end of Group 2), all five
CI guards pass (`check-shared-dupes.sh`: 60 pairs; `check-row-cap.sh`:
clean; `check-route-validation.sh`: 44, unchanged; `check-admin-
routes-linked.sh`: 43 static admin routes, all reachable; `check-
blind-updates.sh`: 102, unchanged — this phase writes nothing anywhere,
both pages are entirely read-only), both production builds compile
(verified in Group 2; unaffected by this pass since no source file
changed). No migration exists for this phase, so nothing shared (a
table, a trigger, an RLS policy) could have drifted.

**Phase 18 is complete. Phase 19 is NOT to begin** until this branch
is merged and deployed, per the operator's standing instruction.

---

## Core-OS 360 Phase 19: Full Platform Hardening, Regression, Security,
## Accessibility, Performance & Production Readiness (in progress,
## from 2026-09-30)

The final phase of the Phase 6-19 initiative. No detailed operator
brief exists in the repo for this phase either (the same situation
Phases 8-18 were in) — unlike those, this phase is not a new module: its
own name is the scope statement. Scope: `docs/CORE_OS_360_PHASE19_PLAN.md`,
derived from an Explore-agent survey across six angles (accessibility
regressions in newer components, rate-limiting coverage gaps, row-cap/
pagination discipline gaps, orphaned/dead code, stray console logging,
unresolved TODO/FIXME markers) before any group's own work began, so
the group boundaries below are grounded in real, verified findings
rather than the phase name alone.

### Group 1: Environment Variable documentation consolidation

CLAUDE.md's own "Environment Variables" section was flagged as stale by
the Phase 17 Group 3 adversarial review ("this list is not exhaustive
for every phase after 29... a genuine audit-and-consolidate pass is its
own piece of work, in scope for Phase 19") and deliberately left rather
than fixed then. This closes it.

- **Rebuilt from a plain `grep` of every live `process.env.X` reference
  in both apps, not from memory of earlier phase notes.** 33 distinct
  variables found; the old list named 10 (many post-29 vars — `JEV_*`,
  `RESEND_API_KEY`, `CRON_SECRET`, `ADMIN_SESSION_SECRET`,
  `PORTAL_SESSION_SECRET`, `AUTOMATION_DISABLED`, the referral pipeline's
  branding vars — existed only in their own phase's narrative section
  further down the file, never surfaced here where an operator setting
  up a fresh deployment would look first).
- **A genuinely dead documented var, found and removed rather than
  carried forward.** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` was in the old
  list but is referenced by NO code in either app — Stripe Checkout
  here is entirely server-side (`stripe.checkout.sessions.create()`),
  so no publishable key is ever read client-side. Documenting a var
  nothing reads is as real a drift as omitting one that something does.
- **A real ambiguity resolved by reading the actual call sites, not
  assumed from the variable name alone**: `STRIPE_SECRET_KEY`/
  `STRIPE_WEBHOOK_SECRET` are used by BOTH apps, but for two entirely
  separate Stripe integrations with their own Vercel-configured values
  — admin's client retainer/invoice billing (`lib/stripe.ts`,
  `api/stripe/webhook`) and portal's e-learning checkout — same
  variable names, deliberately unrelated values, documented as such so
  nobody assumes setting one app's key also covers the other.
- **Every var's actual app scope was verified by `grep`, not guessed
  from which section of this file first mentioned it** — this caught
  `MANATAL_API_KEY`/`MANATAL_API_URL` as genuinely BOTH-apps (portal
  reads the ATS pipeline; admin publishes/matches/hydrates) where the
  old list had filed them portal-only, and `A2I_EMAIL_LOGO_URL` as
  genuinely both-apps (each app sends its own Athletes To Industry
  welcome email) where a first draft of this section had it filed
  portal-only alongside its sibling referral-branding vars.
- **A phase-numbering collision flagged explicitly, not left for a
  future reader to trip over**: "Phase 18" in the Stripe section above
  is this repo's ORIGINAL sequential numbering (e-learning, an early
  build phase); "Phase 18" everywhere else in this document is the
  separate Core-OS 360 initiative's own restarted numbering (Core 360
  Assurance). Both schemes coexist in this file's history; the section
  heading's own wording is what tells them apart, never the bare number.

No code changed in this group — it is a documentation-accuracy pass
only, mirroring the discipline the Tech Stack section's own 2026-09-25
"not yet integrated... corrected during a documentation-accuracy pass"
entry already established for exactly this class of drift.

Verified: `tsc --noEmit` clean both apps (no source file touched), full
`vitest run` unchanged (1620 admin / 755 portal), all five CI guards
pass unchanged, both production builds compile (unaffected — no source
file touched).

### Group 2: security hardening — rate-limit gaps + a row-cap gap

Grounded in a six-angle Explore-agent survey run before this group
began (see the plan doc): the agent's report is the evidence base for
what follows, not a re-derivation of it.

- **Rate limiting: eight authenticated routes that call a metered
  vendor or send email had NO limiter at all**, inconsistent with
  sibling routes in the same feature areas that already do — the exact
  risk `rateLimit.ts`'s own header comment names ("An authenticated
  user, or a loop in a broken client, could exhaust a metered quota or
  spend money with no ceiling"). Each was given the same bucket a
  comparable existing route already uses, per the established
  `limiters.vendor`/`.email` precedent survey (`manatal-sync`,
  `requisitions/[id]/analyze` etc. → `vendor`; `service-requests/[id]/
  respond`, `broadcast` etc. → `email`):
  - `admin/src/app/api/admin/clients/route.ts` (POST) — creates a
    Stripe customer/price/subscription AND a Manatal organisation on
    every call. `limiters.vendor`.
  - `admin/src/app/api/admin/clients/[id]/retainer/route.ts` (PATCH) —
    same Stripe-mutation shape as the create route above, previously
    completely unguarded. `limiters.vendor`.
  - `admin/src/app/api/admin/athletes/route.ts` (POST) — sends a
    scheduled welcome email on every athlete creation; its own sibling
    resend route already had a limiter, this one didn't. `limiters.email`.
  - `admin/src/app/api/admin/manatal/matches/route.ts` (GET) — hits
    Manatal in a loop hydrating up to hundreds of candidate names (see
    the route's own `NAME_FALLBACK_LIMIT`/`NAME_CONCURRENCY` comments).
    `limiters.vendor`.
  - `admin/src/app/api/manatal/diag/route.ts` — its `?test=1` path
    fires a REAL, live `POST /organizations/` against Manatal on every
    call (the route's own comment: "Use sparingly — it creates a real
    org in Manatal that you'll want to delete manually"). Only that
    branch is limited (`limiters.vendor`); the plain status-check
    branch has no vendor cost and stays unlimited.
  - `portal/src/app/api/athletes/route.ts` (POST) — the portal's own
    equivalent of the admin athletes route, same gap, same fix
    (`limiters.email`).
  - `portal/src/app/api/manatal/matches/route.ts` (GET) and
    `.../move-stage/route.ts` (POST) — authenticated Manatal reads/
    writes with no limiter at all. `limiters.vendor` on both.
  - `portal/.../consultancy/clients/[id]/visits/[visitId]/report/
    issue/route.ts` (POST) — sends the client an email on every issue;
    its existing claim-first UPDATE (Phase 7 Group 8) already prevents
    a DOUBLE-send for the SAME report, but nothing capped a caller from
    issuing many DIFFERENT reports in a burst. `limiters.email`, keyed
    on `portfolio.session.userId` (the same session the route's own
    claim already authenticates against).
  - `admin/src/app/api/admin/manatal/matches/move-stage/route.ts` was
    already correctly limited — checked, not assumed, before deciding
    it needed nothing.
- **Row-cap: two `hs_links` reads in `complianceTwin/loadSnapshot.ts`
  had no `.range()`/`.limit()` at all**, unlike every other query in
  the same file (all `readAllPages()`) — exactly the row-cap guard's
  own documented blind spot ("an unbounded `.in()`/`.eq()` that could
  grow past 1000 rows" is invisible to a script that only catches a
  literal `.limit(N>1000)`). `hs_links` accumulates continuously per
  company across every H&S/governance/consultancy subsystem that links
  through it, so a large client's legal-obligation linkage could
  silently truncate, understating risk-graph coverage in both the
  Digital Twin and, downstream, the Board Assurance report generator
  that reads the identical snapshot. Fixed with `readAllPages()`,
  matching the file's own established pattern exactly — no new query
  shape invented.
- **Accessibility: two icon-only close buttons in
  `InviteUserPanel.tsx` had no `aria-label`**, the one inconsistent
  pair against ~20+ other close/dismiss controls surveyed across both
  apps that all correctly carry one. Fixed (`"Dismiss"`/`"Close"`) to
  match the established convention. The wider "disabled Link with
  `pointerEvents: none`" anti-pattern the F8/F9 sweep exists to catch
  was checked repo-wide and NOT reintroduced anywhere in Phases 6-18.
- **Checked and found clean, not carried into scope here**:
  console.log/console.error usage (all intentional error-path or
  structured cron-observability logging, nothing leaks a secret value,
  only presence/length); every TODO/FIXME/XXX marker (zero matches —
  this codebase's convention of plan-doc-referenced debt comments holds
  through Phase 18).
- **Two genuinely orphaned API routes found, deliberately NOT
  deleted in this pass** — a documented scope decision, not an
  oversight: `admin/src/app/api/admin/manatal/matches/route.ts` +
  its `move-stage` sibling (a fully-built applicant-pipeline viewer
  with its own incident-driven engineering history, dated 2026-09-02,
  but no caller anywhere in `admin/src` today — `RequisitionPanel.tsx`
  only calls `manatal-publish`) and
  `portal/src/app/api/consultancy/attention-queue/route.ts` (superseded
  when its own page was converted to a server component calling
  `loadAttentionQueue()` directly, per the route's own now-stale
  comment). Both were still given their rate-limit fix above (defence
  in depth costs nothing and the admin pair is reachable by direct
  URL/curl regardless of UI wiring) rather than left both orphaned AND
  unguarded. Deleting live, deployed route code on the strength of a
  static-analysis survey alone — with no caller found in-app, but no
  certainty an external tool, bookmark or manual workflow doesn't hit
  it directly — was judged the wrong call to make unilaterally in a
  hardening pass; flagged here for a human decision instead.

Verified: `tsc --noEmit` clean both apps, full `vitest run` unchanged
(1620 admin / 755 portal — this group added no new test, since every
fix is either a rate-limit call, a pagination helper swap, or an
`aria-label` string, none of which changed any function's observable
behaviour under test), all five CI guards pass (60 shared-dupe pairs,
row-cap clean, 44 unvalidated routes unchanged, 43 static admin routes
all reachable, 102 blind-update chains unchanged), both production
builds compile.

### Group 3: regression, adversarial QA, handover — a widespread
### missing-order() defect found and fixed (2026-09-30)

Full handover + QA report: `docs/CORE_OS_360_PHASE19_HANDOVER.md`.
**Gate: PASS.**

**An adversarial self-review of Group 2's own row-cap fix found a real
bug in that same fix, which grew into a much larger finding once
followed up.** `complianceTwin/loadSnapshot.ts`'s two new `hs_links`
reads (Group 2's fix for the row-cap gap) used `readAllPages()` with a
bare `.range(from, to)` and NO `.order(...)` at all —
`paged.ts`'s own header comment states this as an absolute rule: "A
paged read MUST carry a stable, unique sort key... without a
deterministic total order Postgres may order two pages differently —
silently dropping or duplicating rows across the boundary." Fixed
immediately, but the fact that a fix written specifically to correct a
row-cap defect could itself violate the discipline that makes
row-cap-safe pagination sound was reason to dig further, not to declare
Group 2 done.

- **A follow-up research-agent audit of every `readAllPages()` call
  site in both apps found the same pattern copy-pasted across 8 files,
  ~70 call sites**, since Phase 8 (Risk Graph), Phase 12 (Compliance
  Digital Twin) and Phase 18 (Assurance Today) — each phase's own admin
  page was later mirrored into a portal read-only twin, propagating the
  gap with every copy.
- **A worse variant in the ORIGINAL Phase 8 admin risk-graph page**:
  two `hs_links` reads there were never wrapped in `readAllPages()` at
  all — no `.range()`, no `.limit()`, a genuinely unbounded read at the
  exact row-cap class of bug this codebase has hit before (the
  referral-cron incident this file's own history already records).
  Group 2's row-cap fix addressed the SAME table's SAME shape of read
  in a DIFFERENT file without anyone checking whether the page it was
  mirrored from had the identical gap — it did.
- **17 further "soft risk" call sites** with an `.order()` present but
  on a non-unique column alone (`name`/`full_name`/`title`/
  `created_at`) — small per-company reference/lookup lists (site,
  equipment, people, authorisation-type pickers on the permits/
  isolations/emergency-plans/management-review/objectives pages, plus
  one `consultancy_visits` read).

**All of it fixed in one pass, 17 files total**: every affected query
now selects the table's real primary key (`id`, or `person_id` for
`person_deployment_status`, whose PK is genuinely `person_id` —
verified against the live migration before assuming otherwise) and
orders by it, either alone or as a tie-break appended after an existing
business-meaningful `.order()`. No new query shape invented anywhere —
every fix matches the file's own established pattern.

**Why this matters, and why it hasn't necessarily bitten anyone yet**:
every affected table is scoped to ONE company; the failure only
manifests once a single client's row count for one of these tables
crosses the 1,000-row PostgREST page boundary — unlikely for a small
reference list (people/authorisation-type pickers), more plausible for
a transactional one (`hs_incidents`, `waste_movements`, `hs_links`) on
a long-lived, heavily-used client. Real and reachable, but the exact
"compiles, renders, reports success" class of defect this codebase's
own Foundations Sweep and the referral-cron incident already recorded
as a standing lesson — invisible until a client crosses the threshold.

**Everything else checked and found clean**: every Group 2 fix
re-verified against current code (field names, control-flow placement);
the two orphaned routes remain flagged, not deleted, with no new
evidence in this pass to change that judgment call; full regression
(tsc clean both apps, 1620 admin / 755 portal unchanged throughout every
group, all five CI guards, both production builds) green at every group
boundary, not only at the end.

**Technical debt, recorded rather than silently carried**: the two
orphaned API routes (admin `manatal/matches` pair, portal
`attention-queue`) still await a human keep-or-delete decision;
CLAUDE.md's Environment Variables section will drift again unless
future phases update it directly rather than only documenting a new var
in their own narrative section; no automated guard yet catches a
`readAllPages()` call with no `.order(...)` in the same statement — the
natural next CI check to add, following this codebase's own standing
practice of turning a hand-found defect class into a permanent guard
once understood (the same path `check-row-cap.sh` itself took).

Verified: `tsc --noEmit` clean both apps at every step (not only at the
end), full `vitest run` unchanged throughout (1620 admin / 755 portal —
no fix in this phase changed any function's observable behaviour under
test), all five CI guards pass with no regression at any point (60
shared-dupe pairs; row-cap clean — this phase's own fixes are what keep
it that way; 44 unvalidated routes unchanged; 43 static admin routes,
all reachable; 102 blind-update chains, unchanged), both production
builds compile at every group.

**Phase 19 is complete. The Core-OS 360 Phase 6-19 initiative is
complete**, per the operator's original instruction to work through
Phases 6-19 sequentially, completing each in full before the next, with
regular merges along the way.

---

## The sixth CI guard: `check-paged-order.sh` (2026-09-30)

Phase 19 Group 3's own handover doc named the natural next step in its
own words: "no automated guard yet catches a `readAllPages()` call with
no `.order(...)` in the same statement — the natural next CI check to
add, following this codebase's own standing practice of turning a
hand-found defect class into a permanent guard once understood (the
same path `check-row-cap.sh` itself took)." Built as the direct
follow-on to that finding, not a new phase.

```
bash scripts/check-paged-order.sh   # every .range(from, to) is preceded by .order(...)
```

- **Heuristic, not a parser** — the same nature every other guard here
  already has (`check-row-cap.sh` itself "cannot see [an unbounded
  `.in()`/`.eq()`]... invisible to a script that only catches a literal
  `.limit(N>1000)`", per its own Phase 19 Group 2 entry above). It looks
  at the text immediately before each literal `.range(from, to)` — the
  fixed shape every `PageQueryBuilder` callback produces, regardless of
  its arrow-function's own parameter list or type arguments — and
  refuses one with no `.order(` in that span.
- **Deliberately does NOT try to also catch the "never wrapped in
  `readAllPages()` at all" variant** (the worse bug the same Group 3
  pass found in the ORIGINAL Phase 8 risk-graph page: two `hs_links`
  reads with no `.range()`/`.limit()` whatsoever). That class is a
  DIFFERENT shape (no `.range(from, to)` string to anchor on at all) and
  is exactly `check-row-cap.sh`'s own already-documented blind spot —
  recorded here as remaining debt, not silently claimed as covered by
  this guard.
- **Mutation-tested before being trusted**: reverting one already-fixed
  `readAllPages()` call in `loadSnapshot.ts` back to no `.order(...)`
  was reintroduced and watched fail this script, then restored and
  re-verified clean.
- Wired into `.github/workflows/ci.yml` alongside the existing five.

Verified: `tsc --noEmit` clean both apps (no source file touched, only
the new script and the CI workflow), full `vitest run` unchanged (1620
admin / 755 portal), all six CI guards pass — including the new one,
clean against the current codebase — both production builds compile.

---

## A deeper security/tenant-isolation adversarial pass across Phase 6-19
## (2026-09-30, migration 182)

Requested directly by the operator, distinct from and harder than the
earlier re-verification pass (which checked that CLAUDE.md's own
narrative matched the actual code across all of Phase 6-19 and found
one documentation-accuracy defect, PR #286). This pass instead tried to
BREACH the live production database — real, simulated hostile sessions
inside rolled-back transactions, attempting actual cross-tenant reads
and writes, never trusting a policy's *definition* as proof it works.

### Method

A single comprehensive `BEGIN; ... ROLLBACK;` probe (never committed —
each intermediate failure while building it was independently confirmed
to have left no trace live, including of the fabricated "Client B"
company itself) against the two real live companies (Andrews
Recruitment Group as the consultancy, Old Albanians Rugby as the
authorised client) plus one fabricated, unauthorised "Client B",
exercising real simulated sessions
(`set_config('request.jwt.claims', ...)` + `SET LOCAL ROLE
authenticated`, the codebase's own established probe technique) for:
a real ARG consultant granted access to Client A ONLY, and Old
Albanians' own real `client_admin`. Every refusal was checked for the
REAL reason (an SQLSTATE and message, or — critically — an actual
`ROW_COUNT` after an UPDATE that raised no exception, never just "no
exception was thrown").

### Everything else came back clean

Portfolio-wide consultancy RLS (`consultancy_service_scopes`,
`consultancy_visits`, `consultancy_service_ledger`, `actions`) correctly
scoped every write and read to Client A only, refusing all of it against
the unauthorised fabricated Client B — INSERT, UPDATE, and SELECT
filtering alike. `visit_observations` correctly refused a
`linked_source_id` naming another client's record (the exact
`visit_observation_fill()` guard, 42501) and correctly hid a
`client_visible = false` row from the client's own session. Board
Assurance correctly hid a draft report and a cross-company report (even
issued) from the client, correctly refused a cross-company
acknowledgement attempt, and correctly refused an "un-issue" attempt by
a client — verified was a genuine 0-row RLS-filtered no-op (confirmed
by reading the row back afterward, still `issued`), not merely "no
exception," since an unqualified "no exception" check would have been
exactly this file's own recorded lesson about testing the wrong thing.
Lessons Learned correctly hid the whole staff-only catalogue from any
client session and — a real adversarial attempt, not an assumption —
correctly REFUSED (`23514`, "This lesson has not been shared with your
organisation") a client marking an UNdistributed lesson as read,
confirming the distribution-check trigger genuinely exists and works as
documented. The Legal Register and its Tavily research notes stayed
invisible to every client session. `hs_links` refused a cross-
organisation edge unconditionally at the trigger level, for any caller.
`worker_qr_status()` was unreachable by any signed-in session at all
(`permission denied for function`, confirmed both via
`information_schema.routine_privileges` and a live RPC attempt), and
`worker_qr_tokens` itself was unreadable by ANY session — a table-level
`permission denied`, a stronger guarantee than the RLS-with-no-policies
design already documented.

### The one real, confirmed defect: `site_checkins` was unreadable by ANY session (migration 182)

The very first live attempt to read `site_checkins` under a real
session — the exact query `/lead/workforce/onsite` (portal) makes —
returned `permission denied for table site_checkins`, not an
RLS-filtered result. Root cause read directly out of 179's own text:
the site_checkins block sits immediately under the worker_qr_tokens
block, and its `REVOKE ALL ON public.site_checkins FROM PUBLIC, anon,
authenticated` line was copied verbatim from worker_qr_tokens' own
(correct, deliberate) revoke immediately above it — but unlike
worker_qr_tokens, site_checkins defines two real session-facing RLS
policies right after (`site_checkins_staff_all` FOR ALL,
`site_checkins_client_read` FOR SELECT). Postgres checks the
table-level GRANT before RLS is ever evaluated, so those two policies
were dead code from the day 179 shipped — unreachable by any session,
staff or client. **Fails closed**: no cross-tenant leak was ever
possible (nobody could read anyone's rows, not even their own), but
`/lead/workforce/onsite` returned "The on-site roster could not be
loaded" for every real user, always, in production — confirmed by
tracing the page's own code to `getWorkforceContext()` →
`getSafetyContext()` → `createServerSupabaseClient()`, the ordinary
session client, never the service role.

A systematic sweep of every `public` table for "has a client-facing RLS
policy but no `authenticated` table grant at all" found exactly one
other match, `record_sequences` (a much older, Phase 1-era table behind
`next_record_number()`, staff-read-only, never queried directly by any
session in either app's code — confirmed by grep — so its own missing
grant is dead weight, not a live defect, and is left untouched here as
out of this pass's Phase 6-19 scope).

**Fix** (migration 182): `GRANT SELECT, INSERT, UPDATE, DELETE ON
public.site_checkins TO authenticated;` — restoring exactly what the
table's own two policies need, matching the standard pattern this
codebase already uses everywhere else for a session-facing table (e.g.
`visit_observations`, 174: no REVOKE at all, RLS alone is the gate).
179 itself is a historical migration and is not edited; 182 is
additive. Applied live and verified twice: the live grant list now
shows exactly `SELECT, INSERT, UPDATE, DELETE` for `authenticated` (never
`anon` — nothing anonymous ever touches this table), and the ORIGINAL
failing read, re-run live under Old Albanians' own real session inside
a rolled-back probe, now succeeds (`0` rows — correctly RLS-filtered,
no error).

**Why the existing test suite never caught this**: 179's own SQL-shape
test (`workerQrSql.test.ts`) correctly pinned that the two RLS policies
exist with the right `USING` clauses — but a text-pattern match against
a migration file cannot reason about the INTERACTION between a
table-level `REVOKE` statement and the policies below it; that
interaction is only observable against a live database, under a real
role. The live probe this migration's own header comment says to run
before trusting a table's grants ("check with `has_function_privilege`/
`information_schema`, never the apply call's own success response") was
run for `worker_qr_status()`'s EXECUTE grant but never extended to
`site_checkins`' own base table grant. `workerQrSql.test.ts` gained
three new cases pinning: 179 really does carry the over-broad REVOKE
(so a future edit can't silently "fix" it by deleting the historical
line, breaking the paper trail); 182 grants exactly what the two
policies need; 182 never widens `worker_qr_tokens` (checked against
the GRANT statements only, not the file's own explanatory prose, which
legitimately mentions that table by name for context).

Verified: `tsc --noEmit` clean, full admin `vitest run` green (1623 —
1620 + 3 new), all six CI guards pass with no regressions (60
shared-dupe pairs; row-cap clean; 44 unvalidated routes, unchanged; 43
static admin routes, all reachable; 102 blind-update chains, unchanged
— this fix touched no application code, only a migration and a test
file; every-`.range()`-has-`.order()` clean). Portal untouched (no
source file in that app was touched by this fix). Migration 182 applied
live and verified via `information_schema.role_table_grants` and a live
rolled-back re-run of the originally-failing session read.

---

## Core-OS 360 Completion Programme: Phase 20 — Specification
## Reconciliation & Legacy Preservation (in progress, no migration)

`Core-OS 360_Remaining-Phases_Claude-Code_Master-Spec.docx` (uploaded
2026-09-30) opens a second programme, Phases 20-29, that closes the
real gaps Phases 6-19's own handovers already documented as deferred/
staff-only/UI-only — comparable in scope to the whole Phase 6-19
initiative, worked the same way: one phase at a time, small verified
groups, never batched. Phase 20 is its own explicit prerequisite:
"one authoritative truth set" before any further feature work. Full
handover: `docs/CORE_OS_360_PHASE20_HANDOVER.md`.

- **`docs/CORE_OS_360_COMPLETION_MATRIX.md`** — one table per Core-OS
  360 phase (C1-C19), every requirement cluster marked `IMPLEMENTED`/
  `PARTIAL`/`MISSING`/`DEFERRED-BUT-REQUIRED`/
  `ACCEPTED-NONREQUIREMENT`, cross-checked against the Master Spec's
  own "Known repository evidence / starting gaps" lists for Phases
  21-29 — which independently reproduce findings already on THIS
  file's own record, a cross-confirmation rather than a contradiction.
  A Consolidated Gap Ledger maps every open row to its target phase.
  `docs/core_os_360_completion_manifest.json` mirrors the ledger for a
  later phase's own gate to check programmatically.
- **A genuine, previously-undocumented finding, caught by doing the
  preservation-testing work rather than only reading past handovers**:
  `admin/src/lib/referral/runScan.ts`'s own header comment (dated
  2026-09-04, the same day as the cron-307-redirect fix above) claimed
  Vercel's Cron Jobs dashboard had never fired the referral schedule at
  all — "the cron turned out never to have existed." This directly
  contradicts this file's OWN subsequent, extensively-documented
  operational history: the 2026-09-21→24 duplicate-email incident
  required real hourly cron executions over MULTIPLE DAYS to happen at
  all. The original 2026-09-04 diagnosis was wrong — the requests were
  firing and hitting the unrelated 307-redirect bug before ever
  reaching this code, which a hosting-level cron log cannot tell apart
  from "never scheduled." Corrected in place (comment only, no logic
  change) rather than left to mislead the next reader for another 26
  days. The extraction into one shared function was still the right
  call, for a reason that survives the corrected diagnosis: a schedule
  nobody could invoke by hand had no way to be re-run or tested.
- **Preservation tests, before any Phase 21+ code change touches these
  systems** (the DoD's own ordering rule): `admin/src/app/api/cron/
  referral-scan/__tests__/route.test.ts` (5 cases — the cron's actual
  entry point had ZERO coverage of any kind before this; auth,
  per-outcome `referral_scan_runs` recording, and the first genuinely
  unmocked pass through the real pipeline, since "no enabled roles"
  needs no Manatal/IvyLens/email stub at all) and `admin/src/app/api/
  broadcast/__tests__/route.test.ts` (4 cases — a real send end to
  end: one action per company, `client_admin`-only email,
  all-or-nothing on an invalid company id, staff-auth refusal).
  `docs/PROTECTED_LEGACY_REGRESSION_SCRIPTS.md` covers the four
  protected systems (A2I public signup, Development Plans, E-Learning
  checkout/webhook, Billing/Invoicing) that did NOT get automated
  coverage built in this phase — honestly recorded as the DoD's
  permitted manual-script fallback, not a claim automation is
  impossible for them; real coverage is carried forward to Phase 29 as
  tracked debt (`PL.1`), not silently dropped.
- **A dedicated read-only audit agent** (never trusting this file's own
  narrative) found the actual protected-legacy test-coverage picture
  BEFORE any of the above was written: Referrals PARTIAL-WORKFLOW
  (fragmented, mock-heavy — `gate.test.ts`, `pipelineIdempotency.
  test.ts`, `approve.test.ts`, the referrals `[id]` route test — but
  the cron/config/send-qualified/test-email routes fully untested at
  the time); A2I and Broadcast UNIT-ONLY (template/prefill pure
  functions only); Development Plans, E-Learning and Billing/
  Invoicing NONE (zero test files of any kind, anywhere).
- **No speculative feature work** — per the phase's own rule, and
  unlike every Core-OS 360 Phase 1-19 group, this phase added no
  migration and changed no application behaviour beyond the one stale-
  comment correction above.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1632 admin — 1623 + 9 new; 755 portal, unchanged — this phase touched
admin only), all six CI guards pass with no regressions, admin
production build compiles, portal production build fails ONLY on the
long-documented sandbox-only missing-Supabase-env-var limitation
(present since Phase 5, unrelated to this phase). An independent
verification pass sampled 31 of the matrix's `IMPLEMENTED` rows against
the live code rather than trusting the matrix's own citations — see
`docs/CORE_OS_360_PHASE20_HANDOVER.md` for the result.

**Gate: PASS.** An independent agent — given only "verify this matrix's
claims against the live code, trust nothing it cites" — sampled 31
`IMPLEMENTED` rows spanning all 19 phases, weighted toward the highest-
risk claims (self-authorisation refusals, RLS/tenancy guards, post-hoc
bug fixes) plus the two rows most likely to contain a subtle
overstatement: C4.5 (LOLER immediate-danger quarantine really is
unconditional on `outcome`, checked before the fail branch) and C10.3
(the corrected window-asymmetry doc comment genuinely no longer claims
equal-length windows). **31/31 CONFIRMED, 0 NOT-CONFIRMED** — every
claim traced to the actual current migration SQL/trigger/TypeScript
body, several against real post-hoc-fixed bugs, none merely a comment
claiming a fix. One honest, structural limitation the agent itself
flagged: this was static source verification with no live database
access, so it confirms the logic is wired up correctly but does not
re-prove production currently matches what's on disk — the same
reason every schema-bearing phase ran its own live probe at ship time,
which a documentation-reconciliation pass cannot retroactively redo
for two dozen historical migrations. Full handover:
`docs/CORE_OS_360_PHASE20_HANDOVER.md`.

**Phase 21 (People, LMS, Competency & Safe-to-Deploy Closure) may
begin** once this branch merges, per the Master Spec's own sequential-
gate rule.

---

## Core-OS 360 Completion Programme: Phase 21 — People, LMS,
## Competency & Safe-to-Deploy Closure (2026-09-30)

Full handover: `docs/CORE_OS_360_PHASE21_HANDOVER.md`. Closes Phase
20's own five-row gap ledger for this phase (C1.10, C3.7, C3.8, C3.9,
C3.10). Delivered in 6 groups, each independently verified.

### Group 1: hs_tests course mapping, E-Learning course link,
### employee-document person linkage (migration 183)

- **`hs_tests.course_id`** (nullable, must reference a **standard/
  global** `training_courses` row) closes the gap where a passed
  `hs_tests` submission wrote a `training_records` row
  (`hs_test_submission_after()`, 116) that was structurally invisible
  to the Safe-to-Deploy engine's `'training'` branch (`_wf_judge`,
  142: `t.course_id = p_ref`) — nothing had ever set it.
  `hs_tests_course_guard()` refuses a company-scoped course outright:
  `hs_tests` has no `company_id` of its own (a staff-global test bank,
  same posture as `hs_audit_templates`/`hs_sector_packs`) and is
  assigned across many client companies — a company-specific course
  would fail `assert_catalogue()` the moment any OTHER company's pass
  tried to log it. `hs_test_submission_after()` now carries
  `course_id` onto the insert and stamps `source = 'hs_test'` (a value
  `training_records_source_check`, 134, already allowed but nothing
  ever set).
- **The E-Learning `learning_content_id` FK on `training_courses`**
  (133) had been completely orphaned since it was added — no UI ever
  read or wrote it. The workforce Courses catalogue tab gained a
  `learning_content` field kind (a picker over published
  `learning_content`), following the exact `'site'` field-kind pattern
  already established for `induction`'s `site_id` picker.
- **Employee documents never linked to a person.** Both `employee_
  documents.person_id` and `.employee_id` (099, 134) existed, and
  `employee_document_person_guard()` (142) already derived `person_id`
  from `employee_id` with a same-organisation check — nothing in
  either app's upload form ever populated `employee_id`. Both the
  admin HR-tab upload form and the portal's Employee Documents page
  gained an "Employee record" picker. A staff upload (the admin route
  uses the service role) is auto-marked `filed_by_authorised = true`
  the instant `person_id` is set — this is the guard's own existing
  `ELSIF TG_OP = 'INSERT' THEN ... NEW.filed_by_authorised :=
  NEW.person_id IS NOT NULL` branch, not new code; the picker was the
  only thing missing.
- **A Zod trap found and NOT repeated**: `optionalUuid`
  (`.optional().nullable().transform(v => v || null)`) materialises the
  field with value `null` even when the caller's request body never
  mentions the key — safe on an INSERT body (every column gets an
  explicit value regardless), a silent field-wipe on a PARTIAL PATCH
  (`Object.keys(parsed.data)` would include the key, defeating both the
  "nothing to update" check and overwriting an existing mapping on
  every unrelated edit). Verified with a throwaway Node/Zod script
  before deciding, not assumed. `course_id` is therefore set only at
  creation (POST); deliberately never added to the PATCH schema.
- Live-probed (`supabase/probes/183_hs_tests_course_mapping.sql`), 7/7.

### Group 2: one-click "Assign learning" from an unmet requirement

Closes the DoD's "requirement → gap → recommended/assigned learning"
step. `AssignLearningButton` on the person profile's requirement table
inserts a `development_items` row (`source_type: 'competency_gap'`,
`linked_course_id`/`linked_competency_id` from the requirement's own
`reference_id`) — the exact insert shape `AddDevelopmentForm` already
used, pre-filled from the row instead of hand-typed. Shown only for a
genuinely `unmet` training/competency requirement (the two types
`development_items` can link to), gated on `training.manage`, hidden
on a historical (`?as_of=`) view. Document verification needed no
separate UI — Group 1's picker already closes it structurally.

### Group 3: people synced back from source rows (migration 184,
### closes C1.10)

Phase 1's own handover (§H) recorded this as explicit debt:
`person_link_row()` (118) is BEFORE INSERT ONLY on `candidates`/
`athletes`/`employee_records` — it links or creates the `people` row
once, at creation, and never runs again. `person_sync_from_source()`
is a new AFTER UPDATE trigger on all three tables:

- `full_name`/`email` always overwrite (both NOT NULL on every source
  table — a corrected typo must always win).
- `phone`/`job_title`/`employee_number`/`department_id`/`site_id` only
  fill a gap via `COALESCE`, mirroring `person_link_row()`'s own
  INSERT-time behaviour exactly (`job_title = COALESCE(NEW.job_title,
  job_title)`) — a field genuinely cleared on the source row does not
  blank a `people` row that may still be the more complete record.
- Never raises (the same discipline `person_link_row()`/`person_
  employee_status()` already use) — an edit to the source row must
  always succeed even if the people-row update fails for any reason.
- Fires only AFTER `person_same_org_guard()`'s own BEFORE trigger
  (142) has already refused a cross-organisation `person_id` — proven
  by trigger execution order, not merely asserted.

Live-probed (`supabase/probes/184_people_sync_back.sql`), 8/8.

### Group 4: correction — bulk people CSV import already existed
### (closes C3.10)

Checked before building anything, per the Master Spec's own rule.
Both halves of Phase 20's own C3.10 claim were wrong:
`portal/src/lib/workforce/importCsv.ts` already covers training,
competency AND credential (all three `IMPORT_KINDS`), not "training
only"; `portal/src/app/(portal)/lead/org-chart/OrgChartClient.tsx`
already has a working bulk people-creation CSV import (add new +
update existing, matched by name) — missed by Phase 20's search,
which looked in `lib/workforce/`/`lib/lead/` and never checked the Org
Chart page. Rather than build a duplicate importer, made one small,
safe fix to the existing one: a row with no name was silently dropped
with zero indication; it is now reported by line number, the same
"fix the file first" pattern the existing missing-column warning
already used. The by-name matching (a real, accepted limitation — two
same-named people would collide) is left untouched as outside this
phase's safe, minimal scope.

### Group 5: reports/exports + Person Compliance PDF — verified
### already built, no code change

Traced every one of the DoD's eight named report categories to an
existing, filterable CSV export: `lead/workforce/page.tsx`'s
`safe-to-deploy.csv` (name, status, role, site, department,
required/met/unmet/review/expiring, **`safety_critical_gap`**,
reasons); `lead/workforce/matrix/page.tsx`'s `workforce-matrix.csv`
— ONE export spanning every `REQUIREMENT_TYPE` (training/competency/
qualification/certification/licence/card/permit/induction/…),
filtered server-side by the page's own `FilterForm` (site/department/
role/manager/worker type/**requirement type**/expiring/unmet/
safety-critical) BEFORE the CSV rows are built, so selecting
"Requirement type: Training" then downloading is genuinely a
training-only report with no separate export needed; `lead/workforce/
occupational-health/page.tsx`'s `health-surveillance.csv` ("Clinical
detail is never shown here"). Building eight narrower, separate CSVs
over the same underlying data would have been the exact "second
source of the same fact" anti-pattern this codebase avoids everywhere
else (the Digital Twin, every KPI module, the governance report all
cite this same discipline).

**Person Compliance PDF** already exists:
`lead/workforce/people/[id]/print/page.tsx` — its own header comment:
"The printable person compliance record (spec 103). Structured HTML,
the browser's 'Save as PDF' makes the PDF... nothing clinical is ever
fetched." Satisfies the DoD's own qualifier ("where existing reporting
tooling supports it") — a jsPDF rebuild of an already-correct,
already-clinical-safe document would have been redundant and
higher-risk, not what was asked for.

An earlier Explore-agent audit had reported both as "NOT BUILT" — its
search matched specific names (`buildPersonCompliancePdf`, API routes
containing `csv`) this implementation never used, since these exports
are client-side downloads inside page components (not API routes) and
the PDF is a browser-print page (not a file named `pdf` or `export`).
Corrected on direct inspection before writing a line of new code —
the same "repository reality beats handover narrative" discipline
Phase 20 itself modelled for the stale `runScan.ts` comment.

### Group 6: regression, security review, handover (gate: PASS)

No new Critical/High defect. Both write paths this phase adds UI for
(`employee_documents.employee_id`, `hs_tests.course_id`) route through
pre-existing, already-adversarially-reviewed guards from the Phase 3
QA 42 security pass (`person_same_org_guard()`, `employee_document_
person_guard()`) — neither guard was modified, only finally given a
UI caller. The one genuinely new tenancy question this phase raised —
could a company-scoped `hs_tests.course_id` leak or misfire across
companies — was closed by `hs_tests_course_guard()` and live-probed
(check 2: refused with `23514`). An hs_test-sourced training record
always lands `verification_status = 'unverified'` (probe check 4) —
rule 143 ("a mandatory item always needs verified evidence") is
unaffected; nothing in this phase auto-verifies anything.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(**1640 admin** — 1632 + 8 new: 2 `hs/tests` route-test cases, 6
`peopleSyncBackSql.test.ts` cases; **760 portal** — 755 + 5 new:
`requirements.test.ts`'s `learning_content` field-kind/`cellText`
cases), all six CI guards pass (60 shared-dupe pairs; row-cap clean;
44 unvalidated routes, unchanged; 43 static admin routes, all
reachable; 102 blind-update chains, unchanged; every paged query's
`.order()` present), both production builds compile (portal's one
prerender failure is the long-documented sandbox-only missing-
Supabase-env-var limitation, unrelated to this phase). Migrations 183
and 184 applied and live-probed in rolled-back transactions, 15/15
checks total.

**Phase 22 (Operational H&S & Client Workflow Closure) may begin**
once this branch merges, per the Master Spec's own sequential-gate
rule.

---

## Core-OS 360 Completion Programme: Phase 22 — Operational H&S &
## Client Workflow Closure (in progress)

Closes six of the seven gap-ledger rows Phase 20 assigned to this
phase: C4.11, C4.12, C4.13, C5.3 fully, C2.7/C2.8/C4.14 (mobile/tablet
and post-deploy notification observation) left honestly open — no
device/browser testing capability exists in this environment. Full
handover: `docs/CORE_OS_360_PHASE22_HANDOVER.md`.

### Group 1 (migration 185): `consultancy_visits_lifecycle_guard()`

173's own header comment flagged this as debt: "any authorised
session may move between any two listed values." A `BEFORE UPDATE`
trigger mirroring `permits_lifecycle_guard()`/`isolations_lifecycle_
guard()`'s own shape (152/153) — one `ELSIF` per allowed `OLD → NEW`
transition, refused with `23514` otherwise. Transitions read from the
two real write paths that exist today (`VisitCaptureClient.tsx`'s
start/finish buttons, the report-issue route's own advance) plus the
full CHECK-constraint vocabulary, so the guard never blocks a state
the schema itself already allows. `cancelled` reachable from every
non-terminal status; `closed`/`cancelled` both dead ends. Live probe
12/12, SQL-shape test 8/8.

### Groups 2-4: portal UI for contractors, permits, isolations
### (closes C4.11, C4.12)

**Checked live, before writing any UI, and it changed the whole
design**: a plain `client_admin` session already holds `contractors.
manage` for their own organisation — `client_admin` maps to
`organisation_admin` (117's `legacy_role_map`), which has held that
capability since Phase 4. `has_capability()`'s home-organisation
branch derives this automatically, no per-user grant needed. So Groups
2-4 needed **no new RLS policy or capability at all** — the whole gap
was missing UI, exactly as Group 13's own scope note said.

`ContractorsClient.tsx`/`PermitsClient.tsx`/`IsolationsClient.tsx`
were already fully self-contained (`companyId` as a prop, no
route-param coupling) — reused VERBATIM as three new shared-dupe pairs
rather than rebuilt. Three new portal pages (`/protect/{contractors,
permits,isolations}`) read `companyId` from `getSessionProfile()`.

`PermitsClient.tsx` gained the genuinely new piece — permit checklist
responses (152's `permit_checklist_responses`, "deliberately left
out" per Group 13's own note): `TemplateItemsPanel` (add checklist
items to a template) and `ChecklistPanel` (confirm/N-A with an
optional comment per permit) — insert-only, the register's own "a
correction is a new row" discipline.

**Live cross-tenant proof** (a real Old Albanians `client_admin`
session against genuinely different-company seeded rows): 7/7 checks
— cross-tenant contractor read/UPDATE/INSERT all refused, cross-tenant
permit read/issue refused, cross-tenant isolation read/verify refused.

### Group 5 (migration 186): environmental monitoring lower/range-bound
### limits (closes C5.3)

157's own header comment: "assumes an upper-bound limit... a
lower-bound limit is a known, documented simplification for a later
group." `limit_direction` (`upper | lower | range`, defaulting to
`upper` — every existing reading's `within_limit` is byte-identical
after this migration) and `recorded_limit_upper` for a genuine
two-bound range. `within_limit` dropped and re-added as a `GENERATED`
column (Postgres cannot alter a generation expression in place): the
`upper` branch is unchanged from the original formula, `lower` inverts
the comparison, `range` requires both bounds present before ever
evaluating. An inverted range is refused at insert time by a new
`BEFORE INSERT` guard. Audit/outbox triggers re-created to widen their
whitelist to the two new classifying columns, never free text. Live
probe 12/12, SQL-shape test 10/10.

### Group 6: site-level Attention Queue detail + notification audience
### widening

`hsRules.ts`'s `contractor_status_changed`/`permit_status_changed`/
`isolation_applied` widened from `staffOnly` to also tell the client's
own admins, per each rule's own "widen to `admins()` once that page
exists" comment — now true. Each keeps its staff notification (admin
link corrected to the specific per-record page) and gains a client one
(portal link).

`attentionQueue.ts` gains `siteId`/`siteName` on every item (`null`
except for genuinely site-scoped rows) and three new source categories
that did not exist before this group: permits suspended/revoked (the
exact condition `permit_status_changed` already treats as worth a
nudge), an isolation still `applied` (not yet verified — distinct
from the existing equipment item, which only says the asset is
unavailable, never whether the isolation itself has been checked), and
an environmental monitoring exceedance within a 30-day recency window
(insert-only, so recency is the only "still worth attention" signal).
Fixed the equipment item's stale "no dedicated portal page today"
contractor link (now `/protect/contractors`) and gave it the asset's
own site. Deliberately no site on the contractor category — 150's own
table has no `site_id`, a contractor is company-wide.
`loadAttentionQueue.ts` fetches the three new tables plus `hs_sites`,
scoped by the existing `portfolioOrgIds()` filter — no new
tenant-scoping mechanism.

### Group 7: full regression, adversarial QA, handover

Beyond the Groups 2-4 cross-tenant proof above: permit
self-authorisation (155, Phase 4's own adversarial security review)
re-verified LIVE — a real ARG person, set as a permit's own
`authorised_person_id`, attempting to issue that SAME permit under
their own session, refused with `23514`, confirming this phase's
changes to a different table did not weaken it. LOTO lock removal by
another worker (153) was NOT re-run — migration 153 untouched by this
phase, its own 16/16 probe from ship time already covers it, and
re-testing unrelated unchanged code was judged not a good use of this
phase's QA budget. Invalid `consultancy_visits` status jumps via
direct API is Group 1's own subject (already 12/12).

**Mobile/tablet (C2.7, C2.8, C4.14): genuinely NOT verified.** No
device/browser testing capability exists in this sandbox. What WAS
checked: every new component reuses the platform's existing `.card`/
`.input`/`.btn-*`/`table-wrapper` classes exclusively, no new bespoke
stylesheet or fixed non-responsive width, and the handful of
`min-width` declarations added match the pre-existing `AddLockForm`
pattern already shipped in `IsolationsClient.tsx`. Reported as open,
per the Master Spec's own Completion Claim Rule, not claimed done.

Verified: `tsc --noEmit` clean both apps throughout, full `vitest run`
green (**1660 admin** — 1648 + 8 `visitLifecycleGuardSql.test.ts` + 1
`vocab.test.ts` case + 10 `environmentalMonitoringLimitDirectionSql.
test.ts`, `hsRules.test.ts` cases widened not added; **773 portal** —
760 + 9 from the three new routes' automatic sweep coverage + 4 new
`attentionQueue.test.ts` cases), all six CI guards pass (63
shared-dupe pairs, up from 60), both production builds compile
(portal's one prerender failure is the long-documented sandbox-only
missing-env-var limitation). Migrations 185 and 186 applied and
live-probed, 24/24 checks; 8/8 further adversarial cross-tenant/
self-authorisation checks this group — 32/32 live database checks
total this phase, all passing.

**Gate: PASS WITH ONE OPEN ITEM** — C4.14 (mobile/tablet, C2.7/C2.8
folded in) carried forward as unclosed debt for whichever future pass
has real device-testing capability; everything else this phase was
assigned is closed with live evidence.

**Phase 23 (Risk Graph/Evidence Engine/Digital Twin completion) may
begin** once this branch merges, per the Master Spec's own
sequential-gate rule.

---

## Core-OS 360 Completion Programme: Phase 23 — Risk Graph / Evidence
## Engine / Digital Twin completion (in progress)

No detailed operator brief exists for this phase either. Scope: the
nine gap-ledger rows Phase 20 assigned here — `docs/
CORE_OS_360_COMPLETION_MATRIX.md` rows C8.3, C8.4, C8.5, C11.3, C11.4,
C11.5, C12.4, C12.5, C12.6. Plan: `docs/CORE_OS_360_PHASE23_PLAN.md`,
written after checking the live code (`intelligence.ts`,
`RiskGraphClient.tsx`, `evidenceEngine/analyze.ts`,
`EvidenceEngineClient.tsx`, `complianceTwin/assemble.ts`,
`loadSnapshot.ts`, and `hs_links`'/`hazards`'/`risk_assessments`'
current RLS — none had a consultancy-read policy except `actions`) —
the session's own "repository reality beats handover narrative" rule.

### Group 1: reusable Connections panel + broader label resolution
### (closes C8.3, C8.4)

- **`lib/riskGraph/entityLabels.ts`** (new shared-dupe pair): a
  curated `{ table, column }` map for 14 entity types whose
  title/name column was verified against its own migration file
  before being added — never guessed from a table name. Types that
  looked like good candidates but have no single clean title column
  (isolations, consultation records, environmental complaints,
  management reviews) are deliberately left uncurated rather than
  guessing one; `legal_obligation` (no title column — resolved via
  its `legal_requirement_id` join, the existing `intelligence.ts`
  precedent) and `incident` (`${type} — ${occurred_on}`, since
  `hs_incidents` has no title column at all) are special-cased.
  `resolveEntityLabels()` batches ONE query per DISTINCT type actually
  present in a result set — `risk_graph_neighbors()`'s own 500-row/
  3-hop cap already bounds how many distinct types can ever appear at
  once, closing Phase 8's own "would need a query per branch" concern
  without inventing a heavier mechanism. Never throws — a failed
  lookup for one type falls back to a humanised type + truncated id
  for just that type's rows, the same posture GlobalSearch/WhatChanged
  label resolution already takes.
- **`hrefForEntity()` takes an explicit `{ role, companyId?, portalBase?
  }`, never an imported `portalUrl()`** — this file must stay a true
  byte-identical shared-dupe pair, and admin's `portalUrl()` helper (to
  link OUT) has no portal-side equivalent (linking to itself would be
  self-referential). The admin caller passes `portalUrl()`'s own
  resolved string; the portal caller passes nothing (defaults to `''`),
  so a "portal-only" type (hazard/risk_assessment/method_statement/
  coshh_assessment/substance — all portal-only pages, per Phase 8's own
  established note) resolves to a plain relative path when the page
  itself IS the portal. The exact `ComplianceTwinView.tsx` precedent
  (Phase 12, Group 2): "each page supplies its own correct hrefs"
  rather than this file guessing a shared routing suffix. Every other
  curated type resolves to a real per-company admin tab
  (`HsCompanyTabs.tsx`'s own segment list, checked live before writing
  this) when `role: 'admin'`, or a portal list/record page when
  `role: 'portal'`; an uncurated type gets no link at all rather than a
  guessed one.
- **`ConnectionsPanel.tsx`** (new shared-dupe component): the GENERIC
  version of `RaLinks.tsx`/`IncidentLinks.tsx`/`RamsCoshhLinks.tsx` —
  those three stay exactly as they are (bespoke, two link types each,
  genuinely useful), this is additive for every OTHER connection a
  record might have. Queries `hs_links` DIRECTLY at depth 1 (never the
  multi-hop `risk_graph_neighbors()` RPC, which does not return the
  underlying `hs_links` row id — a per-record panel needs that id to
  support removal, the exact reason `RaLinks.tsx` already queries
  `hs_links` directly rather than the RPC). "Add a connection" is a
  plain-paste target id, the established `EvidenceLinksPanel.tsx`/
  `LessonsLearnedClient.tsx` precedent for a generic link tool with no
  per-type options list to fetch.
- **Wired into two reference pages, one per app** — a documented,
  bounded scope decision, not an exhaustive rollout (the same
  "adopted in its first two forms, not retrofitted everywhere"
  precedent Phase 6 Group 7's `useUnsavedChangesWarning` already set):
  admin's audit detail page (`/health-safety/<companyId>/audits/
  <auditId>` — no link mechanism of any kind existed there before) and
  portal's incident detail page, ADDITIVE alongside the existing
  `IncidentLinks.tsx` (which only covers hazard/RA links —
  `ConnectionsPanel` now covers every other kind: a contractor, a
  permit, an action).
- A TypeScript type-checking trap caught by `tsc`, not review: a
  template-literal `.select(\`id, ${cfg.column}\`)` call made
  supabase-js's generic type inference produce a `ParserError` type for
  the response rows — the exact "`.select()` must stay ONE string
  literal" footgun this file's own history already recorded once for a
  different reason (splitting with `+`); fixed by casting through
  `unknown` first, since the column name is genuinely dynamic here by
  design (one resolver serving 14 different tables/columns).

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1674 admin — 1660 + 14 new `entityLabels.test.ts` cases; 788 portal —
773 + 15, 14 mirrored `entityLabels.test.ts` cases + the sweep tests
picking up the new component/page reference automatically), all six
CI guards pass (`check-shared-dupes.sh`: 65 pairs, up from 63;
`check-row-cap.sh`: clean; `check-route-validation.sh`: 44, unchanged;
`check-admin-routes-linked.sh`: 43 static routes, all reachable — the
touched admin route is dynamic (`[auditId]`), so it needed no literal-
reference check; `check-blind-updates.sh`: 102, unchanged — this
group's only writes are `hs_links` inserts/deletes, the same
guardless-by-design shape `RaLinks.tsx`/`EvidenceLinksPanel.tsx`
already use; `check-paged-order.sh`: clean — this group added no
`readAllPages()` call), both production builds compile.

### Group 2 (migration 187): portfolio-safe consultant Risk Graph view (C8.5)

Phase 8's own migration (177) deliberately added no portfolio-wide
RLS: "nothing about 'Risk Graph & Connected Compliance Intelligence'
as a phase name implies a cross-client capability." Phase 23's own
gap ledger disagrees, explicitly — this closes it.

- **Six new, narrowly-scoped, ADDITIVE, SELECT-ONLY policies**, the
  exact `actions_consultancy_select` shape migration 175 already
  established: `USING ((SELECT public.has_capability(company_id,
  'consultancy.service_manage')))` on `hazards`, `risk_assessments`,
  `risk_assessment_items`, `risk_item_controls`,
  `organisation_legal_obligations` (all five feed
  `computeRiskGraphIntelligence()`) and `hs_links` (which had the
  identical gap). No new capability — reuses the one every Phase 6/7
  consultancy write already keys on. RLS ORs permissive policies, so
  none of the six existing policies on these tables were touched.
- **SELECT-only, deliberately**: this closes a READ gap ("view the
  risk graph across my portfolio"), not a write one — a consultant
  creating hazards/risk assessments on behalf of a client they have
  not switched into is a separate, bigger feature this group's own
  scope note does not ask for.
- **Because `risk_graph_neighbors()` (177) is `SECURITY INVOKER`,
  opening `hs_links` here alone makes the EXPLORER portfolio-safe with
  NO code change**: a consultant calling it for a genuine record in an
  authorised client now succeeds regardless of which organisation is
  "active" in their session — the walk can never cross companies
  anyway (`hs_links_check()`'s own same-organisation guard, untouched
  by this migration). Proved live (checks 5/5b): the explorer finds an
  authorised client's linked hazard and sees nothing of an
  unauthorised one's graph.
- **`RiskGraphClient.tsx` (admin's own Phase 8 dashboard+explorer
  component) is promoted to a shared-dupe pair** (66 pairs, up from
  65) — the exact `ComplianceTwinView.tsx`/`AssuranceTodayView.tsx`
  precedent: an identical already-assembled snapshot, only per-link
  routing differs by caller. `role`/`portalBase` are now explicit
  params (never the imported, admin-only `portalUrl()` helper it used
  before), and every href is resolved through `hrefForEntity()`
  (Group 1) instead of hand-built strings — the same de-duplication
  Group 1's own component already modelled.
- **New portal page `/consultancy/clients/[id]/risk-graph`** — the
  exact Client 360 sub-page shape (168/Group 4):
  `requirePortfolioSession()` + `portfolioIncludes()` gate the id
  first, then a SERVICE-ROLE-scoped read (`.eq('company_id', id)`,
  copied verbatim from admin's own risk-graph page query shape) feeds
  the identical `computeRiskGraphIntelligence()` and the same
  `RiskGraphClient` component with `role="portal"`. Linked from Client
  360's own header alongside "Open full workspace".
- **A fixture-schema gap found live while writing the probe, not
  assumed from a per-column CHECK scan**: `hazards` carries a
  table-level `hazards_check` CHECK (`site_id IS NOT NULL OR
  linked_location IS NOT NULL`) invisible from the individual
  per-column CHECKs alone — a fixture hazard needs one of the two.
  Found by reading `pg_get_constraintdef()` directly after the first
  probe attempt failed with `23514`, not by re-reading the migration
  file (which never defined this constraint — it predates Phase 4's
  own asset-register work). Also hit
  `organisation_legal_obligations_stamp()`'s own 159-era guard
  ("An applicability decision must be confirmed by a named
  assessor") — the probe's fixture obligations now set
  `assessed_by`/`assessed_at` together, matching 159's own rule.
- **`pg_policies.qual` renders a USING clause's column TABLE-QUALIFIED**
  (`risk_assessments.company_id`, not bare `company_id`) — found live
  when the first structural check (comparing against an unqualified
  pattern) failed on all three of `risk_assessments`/
  `risk_assessment_items`/`risk_item_controls` despite the policies
  being correctly applied (confirmed separately by reading `qual` back
  directly). The probe's LIKE patterns were corrected to match the
  real, qualified rendering rather than the schema-agnostic string
  originally guessed.

**Live probe** (`supabase/probes/187_risk_graph_portfolio_read.sql`,
rolled back, the Phase 7 Group 7 consolidated-proof style: one
consultant session, authorised for Client A only, a genuinely SEPARATE
consultancy owning Client B's relationship): 8 checks — `hazards`
(Client A visible, Client B invisible), SELECT-only (an INSERT for the
AUTHORISED client still refused), `organisation_legal_obligations` (A
visible, B invisible), `hs_links` (A visible, B invisible),
`risk_graph_neighbors()` finds Client A's linked hazard and sees
nothing of Client B's graph, and `risk_assessments`/
`risk_assessment_items`/`risk_item_controls` proven structurally via
`pg_policies` (the exact USING clause, not merely that a policy with
this name exists — the disproportionate fixture cost of a valid
`risk_assessments` row, which needs a `risk_matrices` row, was judged
not worth a full live round-trip for three tables whose policy shape
is byte-identical to the three already proven live). **All 8 passed.**
No trace left live (confirmed via a post-rollback count query).

`riskGraphPortfolioReadSql.test.ts` (5 tests, the `riskGraphFoundationSql
.test.ts` precedent) pins the migration text: exactly six policies, one
per table; every one gated on `has_capability(company_id,
'consultancy.service_manage')`, never `my_company_id()`; SELECT-only
(no `WITH CHECK`/`FOR ALL`/`FOR INSERT`/`FOR UPDATE`/`FOR DELETE`
anywhere); no new table/trigger/function/DEFINER; no `DROP POLICY`/
`ALTER POLICY` (additive only).

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1679 admin — 1674 + 5 new `riskGraphPortfolioReadSql.test.ts` cases;
790 portal — 788 + 2, `portalPagesLinked.test.ts`/
`clientServerBoundary.test.ts` picking up the new page/component
reference automatically), all six CI guards pass (`check-shared-dupes
.sh`: 66 pairs, up from 65; `check-row-cap.sh`: clean; `check-route-
validation.sh`: 44, unchanged; `check-admin-routes-linked.sh`: 43
static routes, all reachable — no admin route changed shape;
`check-blind-updates.sh`: 102, unchanged — this group writes nothing
new, purely additive RLS + a read-only portal page; `check-paged-order
.sh`: clean — every new `readAllPages()` call in the portal page
carries `.order('id')`, copied from admin's own query shape), both
production builds compile (portal's one prerender failure is the
long-documented sandbox-only missing-Supabase-env-var limitation,
unrelated to this change and confirmed by `tsc`'s own clean pass
completing before that unrelated page's static-export step). Migration
187 applied live and verified (`pg_policies`: all six policies present
with the exact `USING` clause).

### Group 3: Evidence Engine filters + current-vs-historical + cross-reference navigation (C11.3, C11.4, C11.5)

No migration — entirely TypeScript over the already-shared Phase 11
schema and shared-dupe files.

- **`analyzeEvidenceCoverage()` gains `currentGaps: EvidenceGap[]`**
  (closes C11.4) — the subset of `gaps` restricted to, per item, only
  its NEWEST completion (by `completed_on`, ties broken by id for
  determinism), mirroring the "only the newest row decides current
  state" rule `hs_equipment_inspection_roll()`/148a's PUWER review-date
  roll already established. A genuinely different, correct computation
  from "every gap ever", proven by a test pinning the exact scenario
  the rule exists for: an item whose OLDER completion lacked evidence
  but whose NEWEST one has it is excluded from `currentGaps` while
  still counted in `gaps`. `EvidenceGap` gains `category` (closes half
  of C11.3) — already resolvable via the existing `itemById` lookup,
  just not carried onto the row before this.
- **`crossReferenceComplianceItems()`** (closes C11.5) — given a
  compliance item id, how many OTHER records already point at it as
  evidence, broken down by SOURCE kind (ISO clause via
  `standard_evidence_links`, legal obligation/objective/audit finding
  via `requirement_evidence_links`). Deliberately COUNTS ONLY, never a
  per-link title resolution — the same "reporting a fact, never
  re-deriving a label chain that already lives on its own page"
  economy Phase 8's own explorer scope note already accepted for
  uncurated neighbours. An item with zero cross-references is excluded
  entirely from the result, never a zero-count row.
- **`EvidenceEngineClient.tsx` gains client-side filters** (closes the
  other half of C11.3): current/history toggle (switches the gaps
  table between `coverage.currentGaps` and `coverage.gaps` — two
  genuinely different pre-computed lists, never a UI filter
  recomputing the same thing `analyze.ts` already decided), category,
  outcome, and a from/to date range on the gaps table, plus an
  entity-type filter on the Evidence Library files table — all running
  over the already-bounded, already-fetched arrays (200/500-row caps,
  well under PostgREST's ceiling), no new query shape, the same "the
  data is already loaded, filter it in the browser" posture this
  codebase already uses for bounded browsing lists. A new "Compliance
  items referenced elsewhere" section renders `crossReferences`,
  linking each non-zero count to the relevant CATALOGUE page — admin's
  own `/health-safety/<companyId>/{iso,legal,objectives,audits}`,
  portal's `/protect/{iso-readiness,legal-register,objectives,audits}`
  — via a small internal `catalogueHref()` helper (there is no separate
  "audit findings" catalogue page, since a finding lives on its own
  audit, so that count links to the audits list instead).
- **Both page.tsx files** (admin's `/health-safety/<companyId>/
  evidence`, portal's `/protect/evidence`) gained two new parallel
  reads (`standard_evidence_links`/`requirement_evidence_links`,
  filtered to `entity_type = 'compliance_item'`, capped at 500 —
  matching the file's own existing cap) and now pass `items`,
  `crossReferences`, `role`, `companyId` to the shared component.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1686 admin — 1679 + 9 new `analyze.test.ts` cases (5→14) + 1 fixture
fix in `complianceTwin/assemble.test.ts` (a missing `currentGaps` field
TypeScript itself caught, not a behaviour change); 804 portal — 790 +
14, `analyze.test.ts` mirrored byte-identical, its first portal copy —
no new portal page/component test needed since `EvidenceEngineClient.
tsx` stayed a shared-dupe pair), all six CI guards pass
(`check-shared-dupes.sh`: 66 pairs, unchanged; `check-row-cap.sh`:
clean; `check-route-validation.sh`: 44, unchanged; `check-admin-
routes-linked.sh`: 43 static routes, all reachable — no admin route
changed shape; `check-blind-updates.sh`: 102, unchanged — this group
adds no write path, purely additive reads and client-side filtering;
`check-paged-order.sh`: clean — this group added no `readAllPages()`
call), both production builds compile (portal's one prerender failure
is the same long-documented sandbox-only missing-Supabase-env-var
limitation, unrelated to this change).

### Group 4 (migration 188): stored Digital Twin snapshot / history (C12.4)

**Explicit, human-triggered capture — never a blind daily per-company
loop.** Checked before deciding: the existing daily
`/api/cron/health-snapshot` computes `computePortfolioCounts()` via
WHOLE-PORTFOLIO batched reads — cheap regardless of company count. The
Digital Twin's `loadComplianceTwinSnapshot()` is the opposite shape:
~15 PER-COMPANY-SCOPED queries. Looping it over every active company
inside the existing cron would multiply that cost by company count.
Board Assurance (Phase 13) already solved "posture trend" for a
structurally identical problem with an EXPLICIT, human-triggered
generate-then-store action — the same precedent applies here.

- **`compliance_twin_snapshots`** — `company_id, snapshot_date,
  overall_band, areas jsonb`, `UNIQUE (company_id, snapshot_date)` so
  a same-day re-save upserts rather than duplicating. Staff-only RLS,
  the exact `management_review_data_pack` (161) shape — an internal
  artefact of a staff action, never client-facing. No
  `apply_write_guard()`: that guard protects a read-only CONSULTANCY
  grant from writing to a CLIENT-readable table; this table has no
  client policy at all, the same "staff-only tables don't get the
  write guard" precedent 158's own `management_system_standards`/
  `standard_clauses` already established. Audit trail whitelists
  `overall_band`/`snapshot_date` only, never the `areas` jsonb blob.
- **"Save today's snapshot"** (`SaveSnapshotButton.tsx`) inserts the
  ALREADY-COMPUTED, ALREADY-RENDERED snapshot the page just built —
  zero extra query cost. A staff session writes directly under RLS
  (`compliance_twin_snapshots_staff_all`), the same "session
  insert/upsert under RLS" pattern `DocumentsClient.tsx`/
  `ContractorsClient.tsx` already use — no API route needed.
- **`SnapshotTrend.tsx`** — a plain dot-per-day trend, last 30 stored
  snapshots, newest last. Admin only: `compliance_twin_snapshots` is
  staff-only RLS, so there is no client-facing equivalent to mirror
  this into.

**Live probe** (`supabase/probes/188_compliance_twin_snapshots.sql`,
rolled back): 6 checks — staff insert; same-day re-save upserts (one
row, updated band); a client (non-staff) session can neither read nor
write; RLS enabled; the audit trigger fires. **All 6 passed.**

### Group 5 (migration 189): configurable thresholds, safe defaults, audited (C12.5)

- **`compliance_twin_thresholds`** — `company_id` UNIQUE, five
  nullable override columns matching `assemble.ts`'s five named
  constants. Staff-only RLS + `audit_row()` whitelisting the five
  threshold columns only. Deciding these thresholds decides what a
  CLIENT sees as red/amber/green on their own compliance posture, so
  — matching the H&S register's standing "nothing here is
  self-certified" posture — a client never gets a write path to
  loosen their own thresholds.
- **`assembleComplianceTwin()` gains an optional second
  `thresholds` param.** Every named constant is renamed
  `DEFAULT_X` and each area function now reads `thresholds?.X ??
  DEFAULT_X` — null/unset ALWAYS falls back to the documented
  default, never silently guessed. `riskGraphArea()`/
  `incidentPatternsArea()` take no threshold at all — neither area
  ever had one.
- **`loadComplianceTwinSnapshot()` reads the company's own threshold
  row (or none) and passes it through** — the ONE place all three
  admin callers (Digital Twin page, Board Assurance's `generate`
  route, Assurance Today) go through, so wiring it there once avoids
  three separate reads that could drift, the same "one calculation,
  not two" discipline this codebase holds to throughout.
- **A deliberate, documented scope decision**: portal's own
  digital-twin/assurance pages (which duplicate their own query logic
  rather than importing admin's loader — Phase 12's own established
  reason: the two apps share no server code) are UNCHANGED and
  continue to use the documented defaults always, never a per-client
  override. `assembleComplianceTwin()`'s `thresholds` param is
  optional specifically so this needed zero code changes on the
  portal side — only the three named admin callers were in scope. A
  possible admin/portal reporting asymmetry for an overridden client
  is an accepted, documented consequence of this scope, not an
  oversight.
- **`ThresholdsForm.tsx`** (admin-only, on the Digital Twin page): a
  collapsible form, five number inputs, blank means "use the default"
  (shown as placeholder text, never pre-filled as a guessed number). A
  staff session upserts directly under RLS
  (`onConflict: 'company_id'`).

**Live probe** (`supabase/probes/189_compliance_twin_thresholds.sql`,
rolled back): 7 checks — staff insert/update; `UNIQUE(company_id)`
refuses a second row for the same company; a client session can
neither read nor write; RLS enabled; the audit trigger fires. **All 7
passed.**

### Group 6: every score exposes its inputs (C12.6)

- **`ComplianceTwinArea` gains `inputs: Record<string, number |
  string | null>`** — the exact raw values that area's own red/amber
  checks read (e.g. `riddorLast12Months`, `lastAuditScore`), PLUS the
  threshold actually used (post-Group-5-override) alongside the value
  it was compared against — never a re-derivation, the same numbers
  already driving `reasons`, just also exposed structurally.
  `buildArea()` takes `inputs` as a new required parameter; every one
  of the five area functions passes its own. `risk_graph` carries
  plain counts only — that area has no threshold of its own.
- **`ComplianceTwinView.tsx` gains a collapsible "Show inputs" per
  area** — a native `<details>`/`<summary>` element, needing no
  JavaScript and no `'use client'` conversion, keeping this
  server-renderable component exactly as it was. `humaniseKey()`
  turns each camelCase field name into a plain label — the object's
  own key names are already the only vocabulary needed, no separate
  label map to drift out of step with `assemble.ts`'s own field
  names.
- Every pre-existing test fixture literal-constructing a
  `ComplianceTwinArea` (`board-assurance/generate/route.test.ts`,
  `assurance/today.test.ts`, `boardAssurance/computeReport.test.ts`)
  needed a trivial `inputs: {}` addition — caught immediately by
  `tsc`, not by review.

Verified (Groups 4-6 together): `tsc --noEmit` clean both apps, full
`vitest run` green (1709 admin — 1686 + 23 new: 6
`complianceTwinSnapshotsSql.test.ts` + 5
`complianceTwinThresholdsSql.test.ts` + 12 new `assemble.test.ts`
cases across Groups 5-6; 804 portal, unchanged — this work touched
only the shared-dupe `assemble.ts`/`ComplianceTwinView.tsx` mirrors,
byte-identical, no new portal test file needed, matching Phase 12's
own established admin-only-test asymmetry for this module), all six
CI guards pass (`check-shared-dupes.sh`: 66 pairs, unchanged —
`assemble.ts`/`ComplianceTwinView.tsx` were already registered pairs;
`check-row-cap.sh`: clean; `check-route-validation.sh`: 44, unchanged;
`check-admin-routes-linked.sh`: 43 static routes, all reachable — no
new admin route, only new sections on the existing Digital Twin page;
`check-blind-updates.sh`: 102, unchanged — every new write is an
upsert (never a blind conditional UPDATE) or an insert;
`check-paged-order.sh`: clean), both production builds compile
(portal's one prerender failure is the same long-documented
sandbox-only missing-Supabase-env-var limitation, unrelated to this
change). Migrations 188 and 189 applied live and verified (13 live
probe checks total across both, all passing).

### Group 7: regression, adversarial QA, handover (gate: PASS)

Full handover + QA report: `docs/CORE_OS_360_PHASE23_HANDOVER.md`.

No Critical, High or Medium defect found in a dedicated adversarial
pass across all six groups. One hardening applied:
`ThresholdsForm.tsx`'s number parsing now explicitly checks
`raw === '' || Number.isNaN(n)` rather than relying on
`JSON.stringify(NaN)` happening to serialise to `null` — the original
behaviour was already safe, just implicit rather than explicit.
Confirmed clean: `ConnectionsPanel.tsx`'s "Add a connection" cannot
create a cross-organisation link (`hs_links_check()`, 122, enforces
this at the trigger level regardless of what the form sends);
`resolveEntityLabels()` relies entirely on each target table's own
RLS with no filter of its own, and can only ever be asked to resolve
an id that arrived via an already-same-organisation `hs_links` row;
migration 187's consultancy policies are proven SELECT-only against a
real INSERT attempt, not merely named that way; migrations 188/189
are proven staff-only against a genuine non-staff session, not merely
a policy definition read back.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1709 admin / 804 portal, unchanged from Groups 4-6 — this pass's only
code change was the `ThresholdsForm.tsx` hardening, which added no new
test), all six CI guards pass with no regressions, both production
builds compile.

**Phase 23 is complete.**

---

## Core-OS 360 Completion Programme: Phase 24 — Consultant Command
## Centre / Ledger completion (in progress)

Scope read fresh from `docs/CORE_OS_360_COMPLETION_MATRIX.md`'s own
gap ledger (the "repository reality beats handover narrative"
discipline every phase since Phase 20 has used), not assumed from any
prior handover: gap-ledger rows **C1.9, C1.12 (the Phase-24 slice —
shared with 28), C6.13, C6.14, C6.15**.

### Group 1 (migration 190): row_version optimistic lock on
### `consultancy_visit_reports` (the Phase-24 slice of C1.12)

Checked live before writing anything, not assumed from the gap-
ledger's own one-line description of C1.12: `consultancy_service_
scopes` has NO update writer anywhere in either app (`POST /api/
consultancy/clients/[id]/service-scope` is insert-only) — there is no
concurrent-edit path to protect, so it is deliberately left untouched.
`consultancy_visits`' status transitions already have a real guard
(`consultancy_visits_lifecycle_guard()`, 185, Phase 22 Group 1): a
double-click race is already refused, because the second call's
`OLD.status` no longer matches an allowed source state — no
`row_version` needed on top of a state machine that already rejects
the race.

The one genuine gap: `consultancy_visit_reports`' DRAFT SAVE
(`ReportBuilderClient.tsx`'s `saveDraft()`, Phase 7 Group 5) is
free-text narrative (summary/recommendations/next-visit-date) with no
state machine protecting it at all — two consultants editing the same
draft would have the second save silently overwrite the first's text
with zero detection.

- Same pattern this codebase already uses throughout (123's hazard/RA
  guards, 124's RAMS/COSHH guards, 125's incident guard): `row_version`
  forced to 1 on INSERT and to `OLD.row_version + 1` on every UPDATE
  **regardless of whatever the caller sent** — the trigger's own
  overwrite is what makes a client's `.eq('row_version', ...)`
  conditional update an honest optimistic-lock check, not a value a
  caller could game by sending a higher number.
  `consultancy_visit_report_fill()`/`_touch()` (176) extended in
  place, not duplicated.
- `ReportBuilderClient.tsx`'s save is now `.eq('id', report.id)
  .eq('row_version', report.row_version)`; a lost race (0 rows, no
  error) surfaces as "Someone else changed this draft since you opened
  it. Refresh to see their change." — the exact `RamsHeaderEditor.tsx`
  precedent.
- **Live probe** (`supabase/probes/190_visit_report_optimistic_
  locking.sql`, rolled back, using two real live companies with a
  fabricated, rolled-back `consultancy_client` relationship — no live
  `organisation_relationships` rows exist at rest, confirmed before
  writing the probe): 6 checks — row_version starts at 1; a normal save
  succeeds and increments to 2; a stale-tab save using the ORIGINAL
  row_version is a silent no-op (0 rows); the content is proven
  unchanged; the trigger ignores a caller-sent `row_version = 999` and
  still advances to exactly `OLD + 1`; `visit_id` stays immutable.
  **All 6 passed.**

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1716 admin — 1709 + 7 new `visitReportOptimisticLockingSql.test.ts`;
804 portal, unchanged — `ReportBuilderClient.tsx` has no component
test, the established convention), all six CI guards pass with no
regressions. Migration 190 applied live and verified.

### Group 2: portal UI for consultancy owners to grant access (C1.9)

Phase 1's own handover (§H) left this as "RPC ready, no UI":
`grant_organisation_access()`/`revoke_organisation_access()` (117)
have existed, fully guarded, since the very first Core-OS 360
migration — this is the first caller either has ever had. **No new
migration** — every write runs through the existing RPCs, under the
caller's own session; the RPCs are their own security boundary
(self-grant refused, only your own colleagues, only a role marked
`consultancy_grantable`, only a client you hold a LIVE
`consultancy_client` relationship with) — this page pre-filters the
pickers to plausible choices as a convenience, the database decides,
not the page.

- **`/consultancy/access`** (new portal page, linked from the Command
  Centre home): gated by `requirePortfolioSession()` (the same base
  gate every `/consultancy/*` page uses) plus a live
  `has_capability(home, 'consultancy.manage_access')` RPC check — a
  portfolio user without that capability sees a plain "you do not
  manage access grants" state rather than a redirect, since a
  legitimate Command Centre user may simply lack this one capability.
- **Reads under RLS, not the service role** — `profiles` (own
  colleagues, `company_id = home`), `organisation_relationships`
  (live `consultancy_client` rows — the party-read policy since 117
  already scopes this to "my own home organisation's relationships"),
  `access_roles` (`consultancy_grantable = true`), and
  `user_organisation_access` (RLS's own "a consultancy manager sees
  the grants of their own people" clause, 117, already answers this
  with no new policy). Org/person NAMES for the picker lists AND for
  already-existing grants (which may reference a colleague or
  organisation outside the "currently offerable" sets — e.g. a stale
  grant against a lapsed relationship) are resolved by a second,
  by-id-list fetch — the standing "fetch by id list, never a chained
  embed" rule this codebase has followed since the referral PATCH
  route's own PGRST200 lesson.
- **`ACCESS_SCOPES`** (`full | health_safety | hr | recruitment`,
  `lib/consultancy/vocab.ts`, shared-dupe pair) is the first TS
  vocabulary tuple pinned against a Phase 1 (117) CHECK rather than a
  Phase 6+ one — the grant form is the first UI anywhere to let a
  person actually pick a scope. Pinned by the new
  `accessGrantSql.test.ts` (admin), following this codebase's own
  established "each migration's own SQL-shape test pins ITS tuple"
  discipline rather than one central vocab test file.
- **`AccessGrantClient.tsx`**: a grant form (person / client / role /
  scope / optional expiry) calling `grant_organisation_access` via
  `supabase.rpc(...)`, and a Revoke button per current grant calling
  `revoke_organisation_access`. Every RPC error surfaces verbatim —
  no client-side pre-validation duplicating what the RPC already
  checks, the same posture every H&S/Command-Centre workflow guard in
  this codebase already takes.
- **`accessGrantSql.test.ts`** pins, against the LIVE 117 migration
  text: both RPCs' exact parameter names/order (what the client
  component calls by name), the `GRANT EXECUTE .. TO authenticated`/
  `REVOKE .. FROM PUBLIC, anon` pair, the self-grant refusal, the
  `consultancy_grantable` role check, the live-relationship date-range
  check, the `ACCESS_SCOPES` tuple against the CHECK, and the
  colleague-scoped read policy — so a future edit to any of these
  cannot silently break this page without a test failing first.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1724 admin — 1716 + 8 new; 807 portal — 804 + 3, the sweep tests
picking up `/consultancy/access` automatically), all six CI guards
pass with no regressions, both production builds compile (portal's
one prerender failure is the long-documented sandbox-only missing-
Supabase-env-var limitation, unrelated to this change — confirmed by
"Compiled successfully" completing cleanly before that unrelated
page's static-export step).

### Group 3: site-level Command Centre drilldown (C6.13)

**No new migration.** The Attention Queue's own `siteId`/`siteName`
(Phase 22, Group 6) already labelled each item; nothing let a
consultant actually CLICK a site and see everything open there —
confirmed live before building anything: the Site column rendered as
plain text with no link. `hs_sites` was already read cross-client
under the portfolio session (`loadAttentionQueue.ts`'s own `sites`
query, scoped `.in('company_id', orgIds)`), so no new read pattern was
needed either.

- **`/consultancy/clients/[id]/sites/[siteId]`** (new portal page):
  the exact Client 360 access-gating shape
  (`requirePortfolioSession()` + `portfolioIncludes()` → `notFound()`)
  plus a same-organisation check on the site itself
  (`.eq('id', siteId).eq('company_id', id)` — refuses a site id that
  belongs to a DIFFERENT client, `notFound()` either way). It never
  re-derives the queue — it calls the SAME `loadAttentionQueue()` the
  `/consultancy/attention-queue` page uses and filters client-side to
  `(clientOrganisationId, siteId)`, so the two views can never
  disagree about what counts as an open issue at that site.
- **The Attention Queue's own Site column is now a link** (to this
  new page) whenever `item.siteId` is set, plain text otherwise
  (contractors and every pre-Phase-22 category still have no site of
  their own, unchanged).
- **Client 360 deliberately gained no "Sites" section of its own** —
  the drilldown chain this gap actually asks for (portfolio issue →
  site → responsible record) is now complete via the Attention
  Queue's own link and the new page's own "Open" links out to each
  record; a redundant per-site grouping on Client 360 too would have
  been scope invented beyond the gap's literal wording, the same
  "documented, bounded scope decision" discipline this codebase
  applies throughout the Completion Programme.

Verified: `tsc --noEmit` clean (portal only — this group touched no
admin file), full `vitest run` green (portal 808 — 807 + 1, the sweep
tests picking up the new dynamic route automatically; admin unchanged
at 1724), all six CI guards pass with no regressions, portal
production build compiles (the same long-documented sandbox-only
missing-Supabase-env-var limitation, unrelated to this change).

### Group 5: visit reports as a Communication Timeline source (C6.15)

Checked before Group 4: `communicationTimeline.ts` had no
`VisitReportRow` input of any kind — a genuinely separate gap from the
value-report `reports` table it already covered (Phase 6, Group 6).
Closed first so Group 4's own filtering/pagination work automatically
covers the new source too, rather than needing a second pass.

- **`VisitReportIssuedRow { id, version, issued_at }`** and a new
  `'visit_report_issued'` `CommunicationKind`. `buildCommunicationTimeline()`
  gains one more loop, always `visibility: 'shared_with_client'` — a
  visit report (Phase 7, migration 176) is only ever passed into this
  function once `status = 'issued'`; a draft is never a communication
  event and this file needs no status check of its own to enforce
  that, since the caller (Client 360) only ever queries issued rows.
- **Dated by `issued_at`, never `created_at`.** A report can sit in
  `draft` for days before it is ever shared with the client — only the
  issue itself, not the drafting, is the event this timeline records.
- Client 360's new query: `consultancy_visit_reports` filtered to
  `client_organisation_id = id AND status = 'issued'`, capped at 20,
  ordered `issued_at desc` — matching every other source query on the
  page already.

### Group 4: Communication Timeline pagination/filtering (C6.14)

The timeline section had always hard-truncated to `.slice(0, 30)` with
no way to see anything older, and no way to narrow it by kind or
visibility — the actual gap-ledger wording.

- **Filtering runs over the already-bounded, already-fetched array —
  no second query.** Every source query on the page is individually
  capped at 10-20 rows, so the combined, merged timeline is already
  small; `ClientCockpitPage` filters and paginates it server-side
  (this page has no `'use client'` component of its own to filter in,
  unlike the Evidence Engine's own client-side filters from Phase 23,
  Group 3 — the same posture, applied server-side here since that's
  what this page already is).
- **`searchParams: Promise<{ kind?: string; visibility?: string; page?:
  string }>`** added to `ClientCockpitPage`'s signature, the standing
  Next 15 async-props convention. `FilterForm`
  (`components/safety/FilterForm.tsx`, already a generic, reusable
  plain-GET-form component — reused unchanged, no new component
  needed) renders the kind/visibility `<select>`s; submitting resets
  to page 1 by simply not carrying a `page` param forward, the same
  "a plain GET form, filters live in the URL" shape that component's
  own header comment already documents.
  **Pagination copies the admin Candidates-table idiom verbatim**
  (`hiring/[id]/page.tsx`, 2026-09-04): a disabled Prev/Next is a
  `<span>`, never a `<Link>` with `pointerEvents: none` — the same
  accessibility discipline recorded there.
- `TIMELINE_PAGE_SIZE = 20`. The page count/empty-state copy
  distinguishes "no communications recorded yet" (nothing at all) from
  "no communications match this filter" (a real filter with zero
  results) — the same distinction the Digital Twin's own null-vs-zero
  handling already established for a different kind of count.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(portal 809 — 808 + 1 new `communicationTimeline.test.ts` case for the
visit-report kind; admin unchanged at 1724 — this pair of groups
touched no admin file beyond nothing at all), all six CI guards pass
with no regressions (66 shared-dupe pairs, unchanged —
`communicationTimeline.ts` is portal-only, not a shared-dupe pair, per
its own header comment; row-cap clean; 44 unvalidated routes,
unchanged; 43 static admin routes, all reachable — this pair of groups
touched no admin route; 102 blind-update chains, unchanged; every
paged query's `.order()` present), portal production build compiles
(the same long-documented sandbox-only missing-Supabase-env-var
limitation, unrelated to this change — confirmed by the build
compiling successfully before failing only on that one unrelated
page's static export), admin production build compiles clean.

### Group 6: full regression, adversarial QA, handover (gate: PASS)

Full handover: `docs/CORE_OS_360_PHASE24_HANDOVER.md`.

A dedicated adversarial pass across all five prior groups found no
Critical, High or Medium defect. Confirmed clean: `ReportBuilderClient
.tsx`'s row_version propagates correctly after `router.refresh()`, so
a second save always conditions on the current version, never a stale
client-cached one; `/consultancy/access`'s colleagues picker
deliberately does not pre-exclude the caller (the RPC's own self-grant
refusal is the real guard, per the page's own "the database decides,
not the page" design); the site drilldown's `hs_sites` query checks
`id` AND `company_id` together, so a site belonging to a different
client 404s rather than resolving wrong; a manually-crafted
`?page=999` on the timeline produces an empty slice with no error,
matching the established admin Candidates-table pagination idiom
exactly (neither clamps to the real total). One documentation-only fix
applied: `communicationTimeline.ts`'s header comment had a stale "one
of the four kinds above" cross-reference, no longer accurate once this
phase added a fifth `shared_with_client`-producing kind.

**C1.12 stays correctly split, not silently widened or narrowed.**
The Phase-24 slice (`consultancy_visit_reports`, the one genuinely
unprotected concurrent-edit path) is fully closed; the rest — general
optimistic-locking hardening across the app — remains assigned to
Phase 28 per the matrix's own existing `24/28` split, updated in
`docs/CORE_OS_360_COMPLETION_MATRIX.md` and
`docs/core_os_360_completion_manifest.json` to record exactly that
(`PARTIAL`, `closed_in_phase: 24`, `assigned_to_phase: 28`).

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(admin **1724** — unchanged from the end of Group 2, since Groups 3-5
touched portal only; portal **809** — 804 + 1 new
`communicationTimeline.test.ts` case for the visit-report kind, plus
the sweep tests picking up the two new routes from Groups 2-3
automatically), all six CI guards pass with no regressions (66
shared-dupe pairs, unchanged; row-cap clean; 44 unvalidated routes,
unchanged; 43 static admin routes, all reachable — this phase added no
admin route; 102 blind-update chains, unchanged — the one new counted
UPDATE, `ReportBuilderClient.tsx`'s `saveDraft()`, was built with
`COUNT_EXACT`/`judgeWrite()` from the start; every paged query's
`.order()` present), both production builds compile (portal's one
prerender failure is the same long-documented sandbox-only missing-
Supabase-env-var limitation).

**Phase 24 is complete.**

---

## Core-OS 360 Completion Programme: Phase 25 — Operational
## Intelligence / Regulatory / Broadcast completion (2026-09-30)

Full handover: `docs/CORE_OS_360_PHASE25_HANDOVER.md`. Closes all
seven gap-ledger rows Phase 20 assigned here — **C1.11, C9.4, C9.5,
C10.4, C17.5, C17.6, C17.7** — read fresh from the completion matrix's
own gap ledger at the start of this phase, not assumed from any prior
handover.

### What was found before any code was written

- **C1.11 (Broadcast idempotency) had no precedent to copy
  directly.** The `sendKeyedEmail`/visit-report-issue-route
  claim-first patterns both claim against an EXISTING row tied to a
  different primary action; Broadcast has no such row, so a fresh
  `broadcast_sends` table keyed by a client-generated retry-safe id
  was the right shape.
- **C17.6 (concurrent review handling) needed a genuinely new rule.**
  Every prior `row_version` precedent (123/124/125/176/190) protects a
  table whose CONTENT keeps changing. `legal_requirement_research_notes`
  is different: the search RESULT must never change once recorded,
  only the human REVIEW of it may — so content columns are made
  immutable by trigger, and `row_version` locks only the review
  fields.
- **C9.4's obvious fix (a client RLS policy on `platform_events`) was
  rejected** — that table carries staff-internal outbox payloads a
  client must never see. The established service-role-mediated
  scoped-read pattern (Board Assurance, Digital Twin) was reused
  instead, with a NEW curated allowlist (`lib/whatChanged/
  clientScope.ts`) deciding what a client may see, pinned against the
  real `TRIGGERED_ENTITIES` array.
- **C17.7's vocabulary was already anticipated.**
  `actions.source_type`'s CHECK already listed `'regulatory_broadcast'`
  with no writer. Checked `legalRegisterRules.ts` for a collision
  before choosing it — confirmed `'legal_requirement'` was already
  used there with a DIFFERENT id-space meaning, so the unused value
  was the correct pick, avoiding a silent id-space merge.

### Group 1 (migration 191): Broadcast idempotency (C1.11)

`broadcast_sends` — a client-generated key as PRIMARY KEY, claimed
FIRST (before any action/email work), reverted on failure so a
genuine retry can still proceed. `POST /api/broadcast` reports
`{ created: 0, duplicate: true }` on a duplicate key with zero new
actions or emails. Staff-only RLS; no write guard (nothing client-
writable to guard); no `audit_row()` (an internal idempotency
artefact, already covered by the `actions` rows it gates).
`broadcastIdempotencySql.test.ts` + 5 new `route.test.ts` cases (claim
precedes work, duplicate short-circuits, failed claim releases,
released claim allows retry).

### Group 2 (migration 192): Legal Register research notes — row_version + manual entry (C17.5, C17.6)

`row_version` on `legal_requirement_research_notes`, forced by
fill/touch triggers regardless of caller input — the established
pattern, plus a new rule: content columns
(`raw_result_summary`/`query_used`/`source`) are refused on any UPDATE
that changes them; only `reviewed_by`/`reviewed_at`/`action_taken` may
move. "Mark reviewed" is a conditional `.eq('row_version', ...)`
update; a lost race surfaces the established "someone else reviewed
this" message. A manual-entry form inserts `source: 'manual'` notes
alongside Tavily's `source: 'tavily'` ones, same provenance badge, no
separate UI section or vocabulary.
`legalResearchNotesRowVersionSql.test.ts` pins both the version
forcing and the content-immutability rule.

### Group 3: configurable incident-pattern analysis window (C10.4)

`incidentPatternWindows()` was already fully generic — only the
UI/route layer artificially restricted `days` to 30/90/365. New
`clampWindowDays()` (shared-dupe pair, `MIN_WINDOW_DAYS`/
`MAX_WINDOW_DAYS`) bounds a user-supplied `?days=` server-side before
it reaches the window-fairness computation, preserving the existing
equal-length guarantee regardless of what a caller requests. Both
apps' `IncidentPatternsView.tsx` gained a custom-window input; both
`page.tsx` files switched to `clampWindowDays()`. 6 new
`analyze.test.ts` cases (below/above/at bounds, NaN fallback).

### Group 4: client-facing What Changed? (C9.4)

`/protect/what-changed` reuses `computeWhatChanged()` (promoted to a
shared-dupe pair) via a service-role-mediated read of
`platform_events`, scoped by a LIVE `effectiveCompanyId()` lookup —
never the cached-cookie company. New `lib/whatChanged/clientScope.ts`
(shared-dupe pair) curates which entity types are client-appropriate,
pinned against the real `TRIGGERED_ENTITIES` array so a new entity
type can neither silently disappear from the client view nor silently
leak a staff-internal one into it. `clientScope.test.ts`, 5 cases.

### Group 5 (migration 193): scheduled digest with preferences + dedup (C9.5)

`notification_preferences.what_changed_digest`
(`'off'|'daily'|'weekly'`, default `'off'` — explicit opt-in, matching
the IvyLens `ai_assist`/referral `dry_run` caution precedent).
`/api/cron/what-changed-digest` (07:10 UTC daily; weekly recipients
processed only on a Monday — ONE cron merging both cadences,
deliberately deviating from `weeklySummary.ts`'s separate-schedule
precedent given how much query/render logic the two cadences share).
Sends via `sendKeyedEmail`'s claim-before-send pattern (dedupe key
includes recipient + date + mode) — a re-run sends nothing twice, and
a recipient with nothing to report gets no email. `digest.test.ts` (7
cases, two purpose-built fixtures — a Tuesday-run proving daily
aggregation, a Monday-run proving genuine weekly aggregation with an
event inside the weekly window but outside the daily one),
`route.test.ts` (3 cases), `whatChangedDigestPreferenceSql.test.ts`
(2 cases).

### Group 6 (migration 194): full regulatory-change flow tracing (C17.7)

`broadcast_sends.source_type`/`source_id` (nullable, CHECK-restricted
to `'legal_requirement' | 'regulatory_update'`, must be set together)
trace a send back to its origin — the Legal Register's existing
"Broadcast" link and the regulatory-classification flow both now pass
this through. Raised `actions` rows carry
`source_type: 'regulatory_broadcast'` / `source_id: <broadcast_sends
key>` — a documented TWO-HOP trace (action → send → origin), avoiding
the `'legal_requirement'` collision found in reconnaissance.
`lib/broadcast/rollup.ts`'s `groupBroadcastActions()` re-assembles the
per-company `actions` rows one send produced back into one bucket per
send (keyed by `source_id`, falling back to a title/description/
timestamp heuristic for hand-typed broadcasts with no `source_id`;
proven to never merge two DIFFERENT sends sharing a title).
`RecentBroadcasts.tsx` rewritten to render per-bucket, adding a
Completion column and a "Regulatory" badge — closing the
acknowledgement/evidence/completion tracking loop. `rollup.test.ts`
(6 cases), `broadcastRegulatoryOriginSql.test.ts` (3 cases), 4 more
`route.test.ts` cases for the widened schema.

### Group 7: regression, adversarial QA, handover (gate: PASS)

A dedicated adversarial pass across all six groups found no Critical,
High or Medium defect. Confirmed clean: the Broadcast claim/revert
race is genuinely closed by the unique-key insert, never a window
where two concurrent tabs both succeed; a lost Legal Register
`row_version` race matches exactly zero rows, never a partial write;
`clampWindowDays()`'s bound is enforced server-side, not merely in the
UI; `/protect/what-changed`'s scoping uses a LIVE session-derived
company id, re-checked on every render; the digest's dedupe key
includes both recipient and date/week, so no duplicate send is
possible even hypothetically. One accepted, documented, low-severity
scope limitation: `broadcast_sends.source_id` is an unvalidated
uuid with no FK constraint (it points at one of two different tables
depending on `source_type`) — staff-only internal tooling, matching
the established "plain paste id" precedent (`standard_evidence_links`,
`requirement_evidence_links`, `lessons_learned`'s "drawn from" field),
not a new pattern invented carelessly for this phase.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(admin **1775** — up from 1724 at the start of this phase; portal
**811** — up from 804), all six CI guards pass with no regressions
(**68 shared-dupe pairs**, up from 66 — `lib/whatChanged/clientScope.ts`
+ `lib/whatChanged/compute.ts`, Group 4; row-cap clean; 44 unvalidated
routes, unchanged; 43 static admin routes, all reachable — this
phase's one new page, `/protect/what-changed`, is portal-only; 102
blind-update chains, unchanged — every new/changed write (the
Broadcast claim/revert, the Legal Register "Mark reviewed") carries an
explicit count check from the start; every paged query's `.order()`
present), both production builds compile (portal's one prerender
failure is the same long-documented sandbox-only missing-Supabase-
env-var limitation, unrelated to this phase). Four migrations (191,
192, 193, 194) applied and live-probed in rolled-back transactions
throughout; all checks passed.

**Phase 25 is complete.**

---

## Core-OS 360 Completion Programme: Phase 26 — Worker QR / Intelligent
## RAMS / adoption completion (in progress)

Scope read fresh from `docs/CORE_OS_360_COMPLETION_MATRIX.md`'s own
gap ledger at the start of this phase, not assumed from any prior
handover: **C14.6, C14.7, C14.8, C14.9** (Worker QR System, Phase 14)
and **C15.4, C15.5, C15.6** (Intelligent RAMS, Phase 15).

### Group 1: printable worker QR badge + human-readable fallback ID (C14.6)

`worker_qr_tokens` (179) never lets the raw token be read back once
minted, so a dedicated print page has nothing to render from. "Print
badge" instead toggles a `<body>` class the print stylesheet uses to
hide every other section on the current page, leaving just the badge
card (name, company, human-readable fallback ID, QR) for the browser's
native Print/Save-as-PDF — the whole panel previously carried
`no-print`, so the existing "print or save this now" instruction never
actually worked. `humanBadgeId()` (new, tested) prints
`people.employee_number` next to the QR, falling back to a short
reference built from the person's own id for a worker with no
`employee_records` row (contractors etc.) — a reader whose scanner
can't read the code looks the person up manually through the existing,
already-authenticated person search, never a new public lookup key of
its own.

### Group 2 (migration 195): site/kiosk manual check-in/out (C14.7)

`site_checkins` (179) has always been badge-scan-only via the public
`/api/w/[token]` routes, with `recorded_via` defaulting to `'qr_scan'`
and a CHECK constraint refusing anything else — the on-site roster
page's own header comment already flagged this as debt. A worker with
no badge, a lost badge, or a site running a staffed kiosk had no way
onto the roster at all.

- `recorded_via` widens to `'qr_scan' | 'manual'`; a new
  `site_checkins_client_manual_insert` RLS policy lets a session with
  `workforce.manage` insert a `'manual'` row for their own company
  only; `site_checkins_client_manual_update` lets that same capability
  close out ANY open check-in (deliberately not restricted to
  `recorded_via = 'manual'`, since a manager may complete a checkout
  for a worker who self-scanned in too); a new
  `site_checkins_manual_guard()` BEFORE UPDATE trigger — the allow-list
  discipline this table never had — refuses a non-staff session
  changing anything except `checked_out_at`. A service-role session
  (`current_user = 'service_role'`) is exempt by construction, so the
  two existing public scan routes are entirely unaffected.
- Portal: `ManualCheckinForm.tsx` (person + EXPLICIT site picker, never
  a guessed default) and `CheckoutButton.tsx`, both plain session
  inserts/updates under the new RLS — no bespoke API route needed.
  `CheckoutButton`'s UPDATE uses `COUNT_EXACT`/`judgeWrite()` from the
  start, per this codebase's own blind-update discipline.
- Live probe 7/7 checks passed, no trace left.

### Group 3: stale check-in detection (C14.8)

The reminders framework (date-granularity only — `dueDateOf` returns a
date, no native "N hours stale" support) gains a `site_checkins` rule
keyed off `checked_in_at`: an open check-in (`checked_out_at` still
null) flags `overdue` the morning after it was opened — the earliest
this daily cron can possibly say it — then weekly after that, the
exact shape the existing `role_stale` (requisitions) rule already
established. `site_checkins` gets no outbox entry of its own (179's
own "attendance, not compliance" posture) — `REMINDER_ENTITIES` only,
the `training_records` precedent.

`workforceRules.ts` (the natural home: `workforce.manage` is the same
capability `CheckoutButton` is gated on) gains the consuming rule:
notifies `workforce.manage` holders by person and site name, links to
the on-site roster, and re-checks the row live before notifying so a
re-processed event for someone already checked out since is silent
rather than a stale nag. New notification type `site_checkin_stale`
(shared `notify/types.ts`, both bells) — this fires to the PORTAL bell
(`workforce.manage` is a client-side capability), unlike some
admin-only Phase 15/18 types.

### Group 4 (migration 196): QR coverage beyond people (C14.9)

Worker badges (179) only ever covered PERSONS. `entity_qr_tokens` is a
new, genuinely polymorphic table covering the two other object kinds
this codebase already tracks with a real coarse-status concept:
machines/assets (`hs_equipment`) and COSHH assessments — mirroring
`worker_qr_tokens`' exact shape (durable, SHA-256 hash only,
RLS-on-no-policies, at-most-one-active-per-entity), but keyed on
`(entity_type, entity_id)` instead of `person_id`. `entity_type` is
validated against `hs_entity_company()`/`hs_entity_table()` — the
platform's one polymorphic entity resolver — so `company_id` is always
derived, never trusted from the caller, and an unknown `entity_id` is
refused outright.

**Deliberately, honestly scoped narrower than the gap-ledger's own
five-item wording** ("machines/assets, work areas, COSHH, site
entrance/induction, PPE"), documented in the migration's own header:
no site-management UI exists anywhere in either app to host a mint
action, so "work areas/site entrance" is left out rather than built
half-finished; "induction" is already covered by the existing worker
badge (a per-person Safe to Deploy requirement); "PPE" has no
standalone catalogue/register table in this codebase at all.

New shared-dupe pairs: `lib/entityQr/qrTokens.ts` (mint/revoke
helpers) and `components/hs/EntityQrPanel.tsx` (the
`WorkerBadgePanel.tsx` pattern generalised over an entity). Public scan
surface: portal's `/e/[token]` + `/api/e/[token]` (added to
`PUBLIC_ROUTES`, the `/w/[token]` precedent), reading
`entity_qr_status()` under the service role. Mint/revoke: admin's
`POST`/`DELETE /api/admin/hs/equipment/[id]/qr` (staff-only, wired
into `EquipmentClient.tsx`'s expanded row) and portal's
`POST`/`DELETE /api/protect/coshh/[id]/qr` (`risk.create` against the
assessment's own organisation, wired into the COSHH detail page). Both
routes derive their service-role read from the ENTITY's own
organisation, never the caller's home company. Live probe 9/9 checks
passed: a token resolves status-only fields for a real asset/COSHH
assessment, an unknown `entity_id` is refused, a second active token
for the same entity is refused, revoking then minting succeeds, an
unrecognised `entity_type` is refused both by the fill trigger AND the
CHECK constraint independently, an unknown token hash resolves
`not_found` with no error.

### Group 5: RAMS suggestion uses verified internal context (C15.4)

The suggestion state (`lib/hs/ramsSectionQuestions.ts`'s
`ramsSectionState()`) was `title`/`project_name`/`scope_of_work` text
only — no read of the site's own hazard/plant/incident record. Jev
still cannot draft free text (`lib/jev/types.ts`'s own header comment,
unchanged by this group) — this only widens what real, VERIFIED facts
the noul questions are asked against.

- **The state now carries four extra named fields, only when a real
  site has been selected**: `site_name`, `open_hazards_at_site`
  (`hazards` not `closed`/`archived`), `lifting_or_plant_equipment_at_site`
  (`hs_equipment` where `asset_type IN ('plant','machinery',
  'lifting_equipment')` and not `decommissioned`), and
  `incidents_at_site_last_12_months` (`hs_incidents` in a trailing
  365-day window — the same "trailing 12 months" convention
  `lib/hs/kpis.ts` already uses elsewhere). Every one is a plain count
  or a name straight from the register, never free text a person
  typed — there is nothing here for someone to phrase as an
  instruction the way the scope-of-work field already could.
- **The route (`/api/protect/jev/rams-section`) resolves the site
  SERVER-SIDE**, scoped to the caller's own company
  (`.eq('id', site_id).eq('company_id', companyId)`) — a `site_id`
  belonging to a different company, or one that doesn't resolve at
  all, is silently ignored (no error, no site fields), since this is
  an enrichment signal, not a hard requirement; the suggestion already
  worked fine with none of it before this group.
  `RamsHeaderEditor.tsx`'s `suggestSections()` now sends the form's
  own `site_id` alongside the existing three fields.
- **Deliberately NOT included: people/competency/controls/documents.**
  A RAMS has no "assigned people" column and no controls/evidence
  linkage of its own to read honestly (checked live before deciding —
  `method_statements` has `site_id`/`department_id` directly but
  nothing naming assigned workers) — inventing one here would be
  exactly the guessed-signal shortcut this codebase's standing
  discipline rejects elsewhere (the referral gate's "absence of
  evidence is a FAIL, not a pass"; the audit engine's "recorded
  outcome, never a guessed one"). "People/competency" is the natural
  subject of the NEXT group's own work (C15.5, hard warnings before
  issue/approval), not this suggestion signal.
- 9 new `ramsSectionQuestions.test.ts` cases (no-context state
  unchanged, a real site context's four fields, clipping, the
  "VERIFIED facts... never typed by the person" framing) and 4 new
  `route.test.ts` cases (a resolving site, a cross-company site
  silently ignored, an unknown site silently ignored, a malformed
  `site_id` refused with 400 before the database is ever touched).

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(portal **848** — up from 839 at the end of Group 4; admin unchanged
at **1799**, since this group touched no admin file), all six CI
guards pass with no regressions (70 shared-dupe pairs, unchanged; row-
cap clean; 44 unvalidated routes, unchanged; 43 static admin routes,
all reachable; 102 blind-update chains, unchanged — this group adds no
new write path, only reads; every paged query's `.order()` present),
both production builds compile (portal's one prerender failure is the
same long-documented sandbox-only missing-Supabase-env-var
limitation). No migration in this group — entirely TypeScript over the
already-live schema.

### Group 6: hard warnings before RAMS issue/approval for failing checks (C15.5)

`ramsApprovalWarnings()` (new, pure, tested) is a plain deterministic
check against facts the platform has ALREADY computed — never a guess,
never AI. Two sources, both real:

- **"Assigned equipment"** is whatever a RAMS is linked to via
  `hs_links` — the only real equipment linkage a method statement has.
  A linked asset that is `quarantined`, `decommissioned` or
  `out_of_service`, or one that is `in_service` but past its own
  `next_inspection_due`, produces a warning.
- **"Assigned people"** means the two individuals a RAMS genuinely
  names on the row itself — its `author_id` and `responsible_manager_id`
  — resolved to a `people` row via `people.user_id`, then read through
  `person_deployment_status()` (136), the ONE public Safe to Deploy
  read. A `NOT_READY` or `REVIEW_REQUIRED` author/manager produces a
  warning; `CONDITIONALLY_READY` deliberately does not (restrictions
  recorded, not a failing requirement). A method statement has no
  "assigned workforce" list of its own (Group 5's own finding,
  unchanged here) — widening this to every acknowledging worker would
  be inventing a linkage that doesn't exist.
- **A UI-level gate, deliberately not a database one.** The shared
  `hs_doc_guard()` (123) governs every controlled-document transition
  for hazards, risk assessments, method statements AND COSHH
  assessments alike; teaching it a RAMS-specific side-check would
  entangle three other document kinds in a rule that only applies to
  one. Instead: the page computes `approvalWarnings` server-side and
  renders them in a `Notice tone="bad"` banner; `RamsCoshhWorkflow.tsx`
  (shared with COSHH, which never passes the new optional
  `approvalWarnings` prop and is therefore unaffected) requires an
  explicit "I have reviewed the warnings and want to proceed anyway"
  checkbox before Confirm is enabled, but only while moving to
  `'approved'` or `'active'` — every other transition is unaffected.
- **An RPC error for a given person is treated as "cannot determine",
  never a false alarm.** `person_deployment_status()` can refuse a
  caller who may not see the person (`person_visible()`); rather than
  surface that as a scary warning on a transient/permission edge case,
  that person's fact is simply omitted — a documented, deliberate
  choice.
- **Skipped entirely for an archived or superseded version** — a dead
  record has nothing left to warn about before issue/approval, and
  showing one there would only be noise.
- 8 new `ramsApprovalWarnings.test.ts` cases (clean baseline, each
  equipment status, overdue-vs-future-vs-no inspection date, the
  NOT_READY/REVIEW_REQUIRED/CONDITIONALLY_READY split, combined
  ordering). No component-level test for the page/workflow wiring
  itself, consistent with this codebase's established convention.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(portal **856** — up from 848; admin unchanged at **1799**, since this
group touched no admin file), all six CI guards pass with no
regressions (70 shared-dupe pairs, unchanged — this group's new file
is portal-only, no admin equivalent page exists for RAMS; row-cap
clean; 44 unvalidated routes, unchanged; 43 static admin routes, all
reachable; 102 blind-update chains, unchanged — this group adds no new
write path, only reads; every paged query's `.order()` present), both
production builds compile (portal's one prerender failure is the same
long-documented sandbox-only missing-Supabase-env-var limitation). No
migration in this group — entirely TypeScript over the already-live
schema.

### Group 7: RAMS suggestion provenance UI (C15.6)

`jev_decisions` (098) has recorded EVERY Jev call in full since Phase
9 of the original programme — state sent, questions asked, raw
response, what was selected — but nothing RAMS-specific ever read one
back. This group adds no new write: `askJev()` already inserts the row
the moment a suggestion is asked for (Group 5); `jev_decisions_actor_
read` (098's own RLS) already lets the person who asked read their own
decision back. All that was missing was somewhere to look.

- **`RamsHeaderEditor.tsx` keeps the `decision_id`** the suggest route
  already returned and discarded before this group, and a new "What
  informed this?" toggle (shown only once a real decision exists)
  lazily fetches that one `jev_decisions` row — a plain client-side
  `.select('state, selected, model, created_at').eq('id', decisionId)`
  under the caller's own session, no new API route needed.
- **`formatRamsSuggestionProvenance()`** (new, pure, tested) turns that
  row into two lists: the SITE-DERIVED facts actually used (site name,
  open hazard/lifting-plant/incident counts — Group 5's own new
  signals) and each conditional section's probability, highest first.
  **Deliberately excludes `title`/`project_name`/`scope_of_work`** —
  the author just typed those on the same form a moment ago and can
  already see them; echoing their own free text back as "provenance"
  would be noise, not a new fact.
- **Scoped to the same actor who asked, matching every other Jev
  integration in this codebase** (`doc_type_suggest`, `hs_item_
  classify`, …), none of which expose a cross-user "what informed a
  past suggestion" panel either. Widening visibility to a DIFFERENT
  viewer (e.g. a later approver) would need a new RLS policy or a
  persisted reference column on `method_statements` — real future
  scope, not silently built here, and more than every sibling Jev
  feature already has.
- A new suggestion clears any open provenance panel from the last one
  — `decisionId`/`provenance` are reset at the start of
  `suggestSections()`, so a stale panel can never be shown next to a
  fresh set of suggested sections.
- 6 new `ramsSuggestionProvenance.test.ts` cases (facts list excludes
  the free-text fields, empty-state with no site context, a null state
  handled without throwing, sections sorted highest-probability-first,
  a non-conditional key never leaks through even if present in
  `selected`, model/asked-at pass through unchanged). No component-
  level test for the toggle/panel wiring, consistent with this
  codebase's established convention.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(portal **862** — up from 856; admin unchanged at **1799**, since this
group touched no admin file), all six CI guards pass with no
regressions (70 shared-dupe pairs, unchanged — portal-only, no admin
equivalent page exists for RAMS; row-cap clean; 44 unvalidated routes,
unchanged; 43 static admin routes, all reachable; 102 blind-update
chains, unchanged — this group writes nothing, only reads a row that
already existed; every paged query's `.order()` present), both
production builds compile (portal's one prerender failure is the same
long-documented sandbox-only missing-Supabase-env-var limitation). No
migration in this group — entirely TypeScript over the already-live
schema.

### Group 8: full regression, adversarial QA, handover (gate: PASS)

Full handover: `docs/CORE_OS_360_PHASE26_HANDOVER.md`. A dedicated
adversarial review pass across all seven groups found no Critical,
High or Medium defect — four accepted, documented, low-severity scope
limitations (C14.9's narrower object coverage, C15.4's excluded
signal types, C15.5's UI-level-only gate, C15.6's same-actor-only
provenance) were confirmed correctly documented rather than silently
narrowed. `docs/CORE_OS_360_COMPLETION_MATRIX.md` and `docs/
core_os_360_completion_manifest.json` updated to close all seven
gap-ledger rows (C14.6, C14.7, C14.8, C14.9, C15.4, C15.5, C15.6).

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(admin **1799**, unchanged since Group 4; portal **862**, unchanged
since Group 7), all six CI guards pass with no regressions (70
shared-dupe pairs; row-cap clean; 44 unvalidated routes, unchanged; 43
static admin routes, all reachable; 102 blind-update chains,
unchanged; every paged query's `.order()` present), both production
builds compile (portal's one prerender failure is the same
long-documented sandbox-only missing-Supabase-env-var limitation).

**Phase 26 is complete.**

---

## Core-OS 360 Completion Programme: Phase 27 — Board Assurance
## completion (in progress)

Scope read fresh from `docs/CORE_OS_360_COMPLETION_MATRIX.md`'s own
gap ledger at the start of this phase: **C13.6** (cross-client
consultant assurance dashboard), **C13.7** (draft report regenerate/
refresh from current evidence), **C13.8** (Core 360 Status view —
People/Plant/Training/Risk Controls/Environmental/Contractors). Plan:
`docs/CORE_OS_360_PHASE27_PLAN.md`, written after checking the live
`board_assurance_reports` guard, `PortfolioCounts`, `RiskGraphIntelligence`
and the portfolio-wide consultancy read pattern before designing
anything — no migration is expected anywhere in this phase, since every
piece composes already-live schema.

### Group 1: draft Board Assurance report regenerate (C13.7)

`report_data` is an immutable JSONB snapshot once inserted
(`board_assurance_reports_guard()`, 178, a `BEFORE INSERT OR UPDATE`
trigger with no `AFTER DELETE` branch at all) — the ONLY way to refresh
a draft from current evidence is to replace the row outright, and
nothing in the product could do that: `POST /generate` always 409'd on
the table's own `UNIQUE (company_id, year, quarter)` the moment ANY row
already existed for that period, draft or issued, with no
delete/regenerate control anywhere in the admin UI.

- **`POST /api/admin/board-assurance/generate` gains an optional
  `regenerate: true` flag.** When set and an existing row is found for
  that (company, year, quarter): an `issued` row is refused outright
  (409, "already issued... generate a later quarter instead") — a
  distributed, signed-off document is never rewritten, the same
  "material change is a new row/new period" discipline every other
  document table in this codebase applies; a `draft` row is removed via
  a **conditional, counted DELETE** (`.eq('id', existing.id).eq('status',
  'draft')`, `{ count: 'exact' }`) before the normal insert proceeds —
  a concurrent issue between the read and the delete leaves the count
  at 0, refused with a fresh 409 rather than silently inserting a
  second, duplicate-period row. Without `regenerate`, behaviour is
  byte-for-byte unchanged (still a plain 23505-derived 409 on a
  pre-existing row).
- **`BoardAssuranceClient.tsx` gains a "Regenerate" button** next to
  "Issue" on every `draft` row only — an issued report has no such
  button, since the route itself would refuse the call anyway; the UI
  simply never offers an action the database has already decided is
  invalid, the same posture every H&S workflow guard in this codebase
  takes.
- 3 new `generate/route.test.ts` cases (a draft is replaced with a
  fresh row — different id, new computed data; an issued report is
  refused and left untouched; regenerating with no existing row behaves
  like a plain generate). A fourth case (the lost-race/count-0 branch)
  was NOT added — `fakeSupabase`'s delete is synchronous, so a genuine
  concurrent-modification race cannot be reproduced without a second,
  purpose-built fake; the branch is proven by construction (the same
  conditional-count pattern this codebase already uses, tested
  elsewhere, e.g. the referral pipeline's claim-before-send) rather than
  by a dedicated test here.

No migration in this group — `board_assurance_reports_staff_all` (178)
is already `FOR ALL`, which already includes DELETE; the guard trigger
only fires on INSERT/UPDATE, so a staff-session DELETE needed no new
grant or guard at all.

Verified: `tsc --noEmit` clean (portal untouched, this group is
admin-only), full `vitest run` green (admin **1802** — up from 1799 at
the end of Phase 26, +3 new), all six CI guards pass with no
regressions (70 shared-dupe pairs, unchanged; row-cap clean; 44
unvalidated routes, unchanged; 43 static admin routes, all reachable;
102 blind-update chains, unchanged — a DELETE is not an UPDATE and this
guard does not track it; every paged query's `.order()` present),
admin production build compiles.

### Group 2: cross-client consultant assurance dashboard (C13.6)

`board_assurance_reports` (178) had no consultancy surface anywhere —
confirmed live before building anything: zero references in
`portal/src/app/(portal)/consultancy/` or `portal/src/lib/consultancy/`.
The table's own RLS is staff `FOR ALL` plus a client-read policy gated
on `company_id = my_company_id()` (the ACTIVE org) — the same
portfolio-wide gap every consultancy read has had to work around since
Phase 6.

- **`lib/consultancy/boardAssuranceStatus.ts`** (portal-only — no
  admin-side cross-client consultancy reader exists to share this
  with): `classifyBoardAssuranceStatus()`, pure, classifies every
  authorised organisation into one of three buckets from its OWN
  `board_assurance_reports` history — `missing` (no row of any status,
  ever), `overdue` (no `issued` report for the CURRENT quarter, and the
  quarter is at least `OVERDUE_GRACE_DAYS` (15) days old — a grace
  window before flagging overdue, the same shape `lib/reminders/
  rules.ts`'s own due-bucket scheme already uses elsewhere, applied to
  a genuinely new quarterly cadence), `current` (everything else) —
  plus an ORTHOGONAL `deteriorating` flag read straight from the most
  recent ISSUED report's own already-computed `report_data.trend`
  (Phase 13's `computeBoardAssuranceReport()`), never re-derived. A
  `draft`-only row for the current quarter still counts toward
  `everHadAnyReport` but never toward `currentPeriodIssued` or
  `deteriorating` — only an issued report is ever "shown to the board".
- **`lib/consultancy/loadBoardAssuranceStatus.ts`** reads with the
  service role, scoped to `portfolioOrgIds()`, via `readAllPages()` —
  one company's own history is small, but the PORTFOLIO'S combined
  history across many clients and years could plausibly cross the
  1,000-row PostgREST cap the exact way Phase 19's own sweep found
  elsewhere, so this is bounded from the start rather than retrofitted.
- **`/consultancy/board-assurance`**: three columns (Missing/Overdue/
  Current), each client linking to Client 360, a `deteriorating` badge
  shown independently of bucket. Linked from the Command Centre home's
  own button row.
- **Client 360 gains its own Board Assurance summary card**, reading
  only that ONE client's rows directly (no `readAllPages` needed at
  that scope) and calling the identical `classifyBoardAssuranceStatus()`
  — the dashboard and the per-client card can never disagree about a
  bucket, since both run the same pure function over rows shaped the
  same way.
- 10 new `boardAssuranceStatus.test.ts` cases: missing/current/overdue,
  the exact grace-window boundary (`>=`, not `>`), a draft-only current-
  quarter row still counting as overdue, deteriorating read from the
  latest ISSUED row only (a newer draft never counts), `latestIssued`
  picked by (year, quarter) rather than array order, and a different
  company's rows never leaking into this one's classification.

Verified: `tsc --noEmit` clean both apps (admin untouched), full
`vitest run` green (portal **874** — up from 862 at the end of Phase
26: +10 new `boardAssuranceStatus.test.ts` cases + 2 from the sweep
tests picking up the new route automatically), all six CI guards pass
with no regressions (70 shared-dupe pairs, unchanged — this group's
new files are portal-only, no admin equivalent; row-cap clean; 44
unvalidated routes, unchanged; 43 static admin routes, all reachable;
102 blind-update chains, unchanged — this group writes nothing, both
new surfaces are read-only; every paged query's `.order()` present),
both production builds compile (portal's one prerender failure is the
same long-documented sandbox-only missing-Supabase-env-var limitation).

### Group 3: Core 360 Status computation (C13.8)

`lib/core360Status/assemble.ts` (new shared-dupe pair, 71 pairs up
from 70): a PURE COMPOSITION, sibling to `complianceTwin/assemble.ts`/
`assurance/today.ts` — computes no new raw fact beyond two small counts
neither existing module already has (training-record expiry, open
environmental spills / waste-movement non-conformances). Checked
before building, not assumed: this is genuinely NOT a duplicate of the
Digital Twin (Phase 12) or Assurance Today (Phase 18) — both are
explicitly narrower predecessors (C18.4's own note: "Phase 18 was
always scoped as 'today only'... Phase 27 supersedes/extends it").
This is the first DOMAIN-scored, six-area-NAMED surface the Master
Spec's own C13.8 wording asks for (People / Plant / Training / Risk
Controls / Environmental / Contractors), reusing already-computed
inputs (`PortfolioCounts`, `RiskGraphIntelligence`) rather than
inventing new raw facts a third time.

- **No AI anywhere in this file.** Every domain band (`ok | attention
  | critical`) is a fixed, named-threshold `if`-chain over inspectable
  counts — the same `complianceTwin/assemble.ts` posture, never a
  formula or a score. `overallBand` is the worst of the six domains
  (`worstBand()`), the exact `complianceTwin`/`assurance` precedent.
- **People**: `safety_critical_gaps > 0` is Phase 3's own ONE
  definition of safety-critical (`person_deployment_status`'s stored
  summary) — any nonzero value is critical; an ordinary not-ready
  worker with no safety-critical gap is only attention.
- **Plant**: `assets_unavailable` (quarantined + out-of-service,
  already merged by `PortfolioCounts`) — 1-2 is attention, 3+ is
  critical (a documented, named threshold: a single asset off the
  floor is routine maintenance, several at once is a pattern).
- **Training**: `computeTrainingExpiry()` — the one genuinely new
  count, reading `training_records.expires_on` directly. An expiry
  EXACTLY TODAY counts as expired, not "expiring soon" (the reminders
  framework's own `due_0`-is-already-due convention, applied here —
  caught by a failing test during development, `<` corrected to `<=`).
  Any expired record is critical; expiring-only (within 30 days,
  matching `due_30`) is attention.
- **Risk Controls**: reuses `RiskGraphIntelligence` (Phase 8) verbatim
  — an ineffective SHARED control (relied on by 2+ assessments,
  Phase 8's own definition of "shared") is critical; an uncovered
  hazard alone is attention.
- **Environmental**: `computeEnvironmentalOpen()` — the other
  genuinely new count, reading `environmental_spills.status` and
  `waste_movements.non_conformance` directly, the same two source
  tables `environmentalRules.ts`'s own consequence rules already key
  on. An open (not `closed`) spill is critical; a waste non-conformance
  alone, or an environmental permit expiring within 30 days
  (`PortfolioCounts.environmental_permits_expiring`), is attention.
- **Contractors**: `PortfolioCounts.contractor_expiring` already
  merges a non-approved status with an expiring/missing required
  insurance policy (per its own doc comment) — no second, narrower read
  exists to split the two apart, so this domain has no distinct
  critical tier, a deliberate, documented simplification: any flagged
  contractor is attention.
- 18 new `assemble.test.ts` cases (mirrored byte-identical to admin):
  an entirely clean input is `ok` across all six domains; each
  domain's own attention/critical split independently; the training
  expiry boundary at exactly today; overallBand as the worst of six;
  a clean domain reports exactly one reason.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(admin **1820** — up from 1802 at the end of Group 1: +18 new,
mirrored byte-identical to portal's own copy; portal **892** — up from
874 at the end of Group 2: +18 new), all six CI guards pass with no
regressions (**71 shared-dupe pairs**, up from 70 — `core360Status/
assemble.ts` newly registered; row-cap clean; 44 unvalidated routes,
unchanged; 43 static admin routes, all reachable — this group added no
route, pure computation only; 102 blind-update chains, unchanged; every
paged query's `.order()` present), both production builds compile
(portal's one prerender failure is the same long-documented
sandbox-only missing-Supabase-env-var limitation).

### Group 4: Core 360 Status UI (C13.8)

`Core360StatusView.tsx` (new shared-dupe pair, 72 pairs up from 71),
the exact `ComplianceTwinView.tsx`/`AssuranceTodayView.tsx` shape: an
overall band banner plus a card per domain (band icon, reasons, a
collapsible "Show inputs" panel), no interactivity beyond navigation
links, server-renderable in both apps. Admin: a 31st `HsCompanyTabs.tsx`
tab (`core-360-status`, after Board Assurance), no new sidebar entry
(dynamic route, nests under the already-linked `/health-safety`
prefix). Portal: `/protect/core-360-status`, gated by `protect` alone,
added to `moduleAccess.ts` and the PROTECT layout's own tab list.

- **Admin's `lib/core360Status/loadStatus.ts`** (admin-only, the
  `loadComplianceTwinSnapshot.ts`/`loadPortfolioCounts.ts` precedent —
  portal shares no server code and duplicates its own query logic)
  composes `loadPortfolioCountsForCompany()` (Phase 13) with a fresh
  Risk Graph read (the exact shape every other Risk Graph consumer in
  this codebase already duplicates per caller, never factored out of
  `loadComplianceTwinSnapshot` since Risk Graph was never exported from
  it) plus the two new reads `assembleCore360Status()` needs. No new
  query shape beyond those two.
- **A real finding, checked live rather than assumed from an older
  page's own comment**: the Phase 18 Assurance Today portal page's own
  header says "contractors/permits/isolations/consultancy_visits do
  not [have a client-read policy]" — true for permits/isolations, but
  checked live against the actual migration text before writing this
  group's own portal reads and found FALSE for contractors and
  consultancy_visits. `contractors_manage`/`contractor_insurances_manage`
  (150) already grant any session holding `contractors.manage` on its
  own `company_id` — which `client_admin` has held via the
  `organisation_admin` role mapping since Phase 4, confirmed live by
  Phase 22's own contractors-portal-UI work — and
  `consultancy_visits_client_read` (168, `client_organisation_id =
  my_company_id()`) has existed since Phase 6 and was never dropped or
  redefined. `environmental_permits`/`management_reviews`/
  `service_requests` all already have real portal pages reading them
  directly. Since the Contractors DOMAIN is exactly what this page's
  Contractors card depends on, the portal reads here include
  contractors/contractor_insurances/consultancy_visits/
  environmental_permits/management_reviews/service_requests properly
  under the client's own session — not passed as empty arrays the way
  the older Phase 18 page does for its own, narrower purpose (that
  page's own choice remains correct for what IT renders, since its
  `items` list never surfaces `contractor_expiring` at all — this is a
  finding about this page's own needs, not a defect to fix in Phase
  18's unrelated page, which is out of this group's scope).
- **Link targets**: People and Training have no admin-side page of
  their own (workforce and training records are managed only through
  the portal's LEAD workspace, staff included — the exact "Hazards and
  risk assessments have no admin-side per-record page" precedent
  Phase 8's own risk-graph page already established) — the admin page
  links out to the portal (`portalUrl()`) for those two; Plant, Risk
  Controls, Environmental and Contractors all have a real admin tab
  already and link internally.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(admin **1820**, unchanged — this group is UI/route-glue only, the
established "no component-level test" convention; portal **894** — up
from 892: +2, the sweep tests picking up the new route automatically),
all six CI guards pass with no regressions (**72 shared-dupe pairs**,
up from 71; row-cap clean; 44 unvalidated routes, unchanged; 43 static
admin routes, all reachable — the new admin route is dynamic, needing
no literal-reference check; 102 blind-update chains, unchanged — this
group writes nothing, both new surfaces are read-only; every paged
query's `.order()` present), both production builds compile (portal's
one prerender failure is the same long-documented sandbox-only
missing-Supabase-env-var limitation), including
`/health-safety/[companyId]/core-360-status` and
`/protect/core-360-status`.

### Group 5: full regression, adversarial QA, handover (gate: PASS)

Full handover: `docs/CORE_OS_360_PHASE27_HANDOVER.md`.

A dedicated adversarial pass across all four groups found **one real
Medium-severity defect and fixed it**: the People domain in
`core360Status/assemble.ts` hid the broader `workers_not_ready` count
behind the narrower `safety_critical_gaps` one — the EXACT bug class
Phase 23's own Compliance Twin adversarial pass already found and
fixed once (a red domain silently under-reporting a true amber-level
fact), reintroduced here in a sibling module. The two counts are
independently derived (`countBy()` runs two separate predicates over
the same `person_deployment_status` rows, not a guaranteed subset
relationship), so the original ternary could genuinely hide
information a reader needed. Fixed to the same independent-`if`-push
pattern the Training/Environmental domains in the same file already
used correctly. **Mutation-tested**: a new test was confirmed to fail
against the reverted (buggy) code, then the fix was restored and
re-verified passing, re-mirrored byte-identical to admin.

Also checked and found clean: every query in both
`lib/core360Status/loadStatus.ts` (admin) and `/protect/
core-360-status/page.tsx` (portal) carries an explicit company-scope
filter except two deliberate, safe exceptions (`legal_requirements`,
scoped upstream via an already-filtered id list; `contractor_
insurances`, which has no `company_id` column of its own and is
scoped via an already-filtered `contractor_id` list) — matters more in
the admin loader, which runs as staff with no RLS backstop of its own,
than the portal page, where RLS is a backstop regardless; the Group 1
regenerate route's concurrent-request race is safe by construction
(the loser's conditional DELETE matches zero rows, refused rather than
proceeding to a duplicate insert); `requireStaff()` is unchanged on
the one write route this phase touches.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(admin **1821** — 1820 + 1 new mutation-tested case; portal **895** —
894 + 1), all six CI guards pass with no regressions (72 shared-dupe
pairs, unchanged; row-cap clean; 44 unvalidated routes, unchanged; 43
static admin routes, all reachable; 102 blind-update chains, unchanged
— this phase's only write, Group 1's conditional DELETE, is not an
UPDATE and this guard does not track it; every paged query's `.order()`
present), both production builds compile (portal's one prerender
failure is the same long-documented sandbox-only missing-Supabase-
env-var limitation). No migration anywhere in this phase — every
group composes already-live schema, confirmed rather than assumed per
the plan doc's own stated expectation.

`docs/CORE_OS_360_COMPLETION_MATRIX.md` and `docs/
core_os_360_completion_manifest.json` updated: C13.6, C13.7, C13.8 all
→ `IMPLEMENTED`, `closed_in_phase: 27`.

**Phase 27 is complete.**

---

## Core-OS 360 Completion Programme: Phase 28 — UX role-check
## consolidation & optimistic locking completion (2026-09-30)

Full handover: `docs/CORE_OS_360_PHASE28_HANDOVER.md`. Closes the two
gap-ledger rows Phase 20 assigned here — **C1.12** ("optimistic
locking on shared records" — the general hardening left over after
Phase 24 Group 1 closed the `consultancy_visit_reports` slice) and
**C1.13** ("UI still uses legacy role checks in places" — Phase 1
handover §H, item 1) — read fresh from the completion matrix's own
gap ledger, not assumed from any prior phase's handover. Full
investigation: `docs/CORE_OS_360_PHASE28_PLAN.md`.

### What the investigation found before any code was written

- **The "42501 on a shown button" scenario §H worried about does not
  reproduce.** `get_my_role()` is already grant-aware — a `read_only`
  consultant's own grant resolves `legacy_role = 'client_user'`,
  never `'client_admin'`, verified against the live function and
  `access_roles.legacy_role`. Every one of the 8 surveyed pages'
  backing tables is gated by `is_company_super_user()`, a predicate
  the Phase 1 capability model never migrated onto — there is no
  finer capability that actually governs these writes today, so
  inventing one in the UI would have been a false abstraction. What
  remained real was pure duplication-drift risk: the same
  `role === 'client_admin' || <staff check>` spelled out
  independently across many files.
- **`employee_records` has no `row_version` column.**
  `EmployeeRecordsClient.tsx`'s edit-form save was an unconditional
  `.update(body).eq('id', editingId)` — the exact "last write wins"
  scenario §H described.

### Group 1: consolidate legacy role checks (C1.13)

`portal/src/lib/auth/companyAdmin.ts` — `isCompanySuperUser({ role,
isTpsStaff })`, mirroring `is_company_super_user() OR is_tps_staff()`
exactly. `companySuperUserSql.test.ts` pins it against migration 117's
own text (the only migration that ever defines
`is_company_super_user()`) and a live-read SNAPSHOT of
`is_tps_staff()` — no migration in this repo defines that function at
all; it predates the migration history, created directly in the
Supabase SQL editor, and its body was read live via `execute_sql` and
embedded as documented history, never guessed.

Converted: `employee-records`, `policy-acknowledgements`,
`offboarding`, `onboarding`, `calendar`, `org-chart`'s general
`canEdit` gate (its OWN, deliberately different self-seed check at a
different line, gated on the bare `client_admin` role by design, is
untouched), `billing` (the page AND its `portal-session` API route),
and a genuine ninth site found only by grepping API routes, not just
pages — `POST /api/portal/policy-acks/[id]/resend`. That route is
`requireLiveSession()`-shaped, whose `role` can literally BE
`'tps_admin'` (unlike `getSessionProfile()`'s always-legacy-mapped
`role`, with `isTpsStaff` carried alongside it) —`isTpsStaff` is
derived inline as `role === 'tps_admin'`, mutation-tested (reverted,
watched the new staff-allowed test case fail with 403 instead of 200,
restored).

**Deliberately left alone**: `hire/internal/page.tsx`'s `isAdmin =
role === 'client_admin' || isTpsStaff` already spells the correct
predicate, just not through the named function — its own `isAdmin`
prop conflates two DIFFERENT authorisations (`requisitions`,
unrestricted by role, and `employee_records`, super-user only) under
one flag, and splitting that is a product decision out of scope here.

### Group 2: employee_records optimistic lock (C1.12)

Migration 197: `row_version integer NOT NULL DEFAULT 1`, forced to 1
on INSERT and `OLD.row_version + 1` on every UPDATE by a trigger pair
regardless of caller input. **`SECURITY INVOKER`, not `DEFINER`** —
matches this table's OWN existing trigger convention (`person_same_
org_guard`/`person_sync_from_source`/`employee_records_sensitive_
write_guard`, none of which are DEFINER), a deliberate departure from
190's own DEFINER choice for `consultancy_visit_reports`, whose fill
function needs a cross-table lookup this one does not. An additive
`GRANT SELECT (row_version)` mirrors 131's own "a new column needs its
own additive grant" discipline, never a rewrite of 131's whole column
list.

**A mid-implementation re-survey, not the plan doc's own first
pass, found a second genuine race surface**: the plan doc's original
C1.12 investigation claimed only one edit-form UPDATE site existed on
this table. Re-running the same exhaustive grep immediately before
writing the migration — per this codebase's own "repository reality
beats handover narrative" discipline — found `OrgChartClient.tsx`'s
drag-and-drop `persistChange()`: a SECOND, genuinely unconditional
edit surface on the SAME rows (reassigning `line_manager` by dragging
one person onto another). Guarding only the form's save would have
left the race **half-closed** — a form save that wins its own
conditional check could still be silently overwritten a moment later
by the unguarded drag-and-drop write, or vice versa. Both are now
guarded, each with a clear "someone else changed this" message on a
lost race. The plan doc's own C1.12 section was corrected in place to
record this rather than left to mislead a future reader.

**Deliberately left unguarded**: the bulk CSV import inside the same
`OrgChartClient.tsx` file (`ImportModal`'s per-row reconcile-with-CSV
update) — a documented, already-accepted limitation from Phase 21
Group 4 ("the by-name matching... left untouched as outside this
phase's safe, minimal scope"), and a bulk "make this row match the
CSV" reconciliation is a genuinely different act from two humans
independently drafting changes to the same record, the actual risk
§H names. Two leave-token rotation routes also write this table and
are left unguarded too — a narrow, single-field security rotation, not
a general HR edit; any concurrent write still correctly bumps
`row_version`, so the edit form's own lock stays safe against them, it
may simply refuse slightly more often than strictly necessary, the
accepted cost of a whole-row version lock every `row_version`
implementation in this codebase already carries.

`row_version` is captured at `openEdit()` time in
`EmployeeRecordsClient.tsx` (never re-read from `employees` state at
save time, which a background `router.refresh()` could have already
moved on without the open form knowing) and at drag time in
`OrgChartClient.tsx`. Added to neither table's `audit_row()` nor
`platform_event_row()` whitelist — bookkeeping, not a fact worth
reporting, the identical choice 190 made for its own column.

Live-probed in a rolled-back transaction, 5/5 checks: a fresh insert
gets `row_version` 1; a caller-sent `row_version` is ignored, forced
to `OLD + 1`; a stale conditional update affects 0 rows and the stale
write never lands; a current-version conditional update succeeds and
advances the version.

### Adversarial review (this group)

- **The resend route's existing 2-test suite never exercised the
  staff-allowed path at all** — only `client_admin` (allowed) and
  `client_user` (refused). Since this was the one site whose Group 1
  conversion genuinely changed HOW staff are recognised (the inline
  `role === 'tps_admin'` derivation, unique among the 9 converted
  sites), it was the one site actually at risk of a silent
  regression. A new test case was added and mutation-verified:
  reverted the derivation, watched the new case fail (403 instead of
  200), restored, re-verified green.
- **Cross-tenant scoping on both new row_version UPDATE call sites**:
  neither relies on the client-side filter alone — RLS (`company_id =
  my_company_id() AND is_company_super_user() OR is_tps_staff()`) is
  the real boundary, unchanged by this migration, both before and
  after this fix.
- **True concurrent transactions**: Postgres row-level locking
  serialises a genuinely simultaneous pair of UPDATEs — the second
  transaction blocks until the first commits, then evaluates `OLD`
  fresh, so the forcing trigger's `OLD.row_version + 1` is correct
  under real concurrency, the same reasoning this codebase already
  relies on for 123/124/125/176/190.

### Verified

`tsc --noEmit` clean both apps throughout every group and after the
adversarial additions. Final counts: portal vitest **912 passed / 65
test files** (up from 903 at the start of the phase); admin vitest
**1821 passed / 181 test files**, unchanged — this phase touched no
admin file. All six CI guards pass: `check-shared-dupes.sh` — 72
pairs, unchanged (every file this phase touched is portal-only);
`check-row-cap.sh` — clean; `check-route-validation.sh` — 44
unvalidated routes, unchanged; `check-admin-routes-linked.sh` — 43
static admin routes, all reachable, unchanged; `check-blind-updates.sh`
— **101, down from 102** (`OrgChartClient.tsx`'s drag-and-drop write is
now counted; `EmployeeRecordsClient.tsx`'s was already recognised safe
via its pre-existing `.select().single()`), baseline lowered in the
same commit per the script's own instruction; `check-paged-order.sh`
— clean. Both production builds compile (portal's one prerender
failure is the long-documented sandbox-only missing-Supabase-env-var
limitation, unrelated). Migration 197 applied and verified live
(column, NOT NULL default, additive grant, both triggers, both
functions' `SECURITY INVOKER` status all read back from
`information_schema`/`pg_trigger`/`pg_proc`, never trusted from the
apply call's own success response).

`docs/CORE_OS_360_COMPLETION_MATRIX.md` and `docs/
core_os_360_completion_manifest.json` updated: C1.12, C1.13 both →
`IMPLEMENTED`, `closed_in_phase: 28`.

**Phase 28 is complete.**

---

## Core-OS 360 Completion Programme: Phase 29 — Security, Regression &
## Production Certification (the final gate) (2026-09-30)

Full handover: `docs/CORE_OS_360_PHASE29_HANDOVER.md`. Closes the two
gap-ledger rows the completion matrix assigned here — **C19.9** and
**PL.1** — read fresh from the matrix's own gap ledger, per the
"repository reality beats handover narrative" discipline every phase
since Phase 20 has used. This is the Completion Programme's own
closing gate, per the matrix's own words: "Every row in this ledger
must close... before Phase 29's final gate."

### Group 1: C19.9 — the seventh CI guard

```
bash scripts/check-unbounded-reads.sh   # every select() chain has SOME bound
```

`check-row-cap.sh` catches an author-specified `.limit(N>1000)`;
`check-paged-order.sh` catches a paged builder's `.range(from, to)`
with no preceding `.order(...)`. Neither catches the WORSE shape this
codebase has hit twice before (`lib/complianceTwin/loadSnapshot.ts`'s
and the original Phase 8 risk-graph page's `hs_links` reads): a
`.select(...)` chain with NO bound at all, relying entirely on
PostgREST's own silent 1,000-row default. `scripts/lib/scan-unbounded-
reads.mjs` is a real method-chain walker (the `scan-blind-updates.mjs`
precedent) flagging exactly that shape, excluding a head-only count
(`{ count: 'exact', head: true }`, which returns zero rows regardless).
**302 pre-existing matches**, hand-sampled and confirmed real but too
many to fix without per-table risk analysis this guard cannot do —
per this codebase's own established discipline for exactly this
situation, a **ratchet** (`BASELINE=302`): a PR may never raise the
count, and a lowered count is celebrated, not merely tolerated.
Mutation-tested: a throwaway unbounded chain was confirmed to fail the
guard before removal.

### Groups 2-5: PL.1 — the four Protected Legacy systems get real tests

Each of `docs/PROTECTED_LEGACY_REGRESSION_SCRIPTS.md`'s four
manual-only systems (Phase 20's own audit: A2I `UNIT-ONLY`, Development
Plans `NONE`, E-Learning `NONE`, Billing/Invoicing `NONE`) now has real,
route-level, fake-Supabase-client automated coverage — the same pattern
this codebase already uses for every other route test. **A genuine
defect found while writing a test is fixed in place, the same as every
phase before this one.**

- **A2I public signup** (`portal/.../r/athlete/[slug]/route.ts`, 11
  cases): **a real, previously unfixed duplicate-submission defect,
  found and fixed.** A repeated public submission with the same
  company + email inserted a SECOND athlete row and sent a SECOND
  welcome email — this codebase's own referral pipeline already paid
  for exactly this class of bug once ("the referral cron re-emailed 21
  people every hour", above). Fixed with an app-level check
  (`.eq('company_id', ...).ilike('email', email).limit(1)`) immediately
  before the insert, deliberately NOT a DB-level UNIQUE constraint —
  `athletes` has other writers (admin's manual add, the portal's own
  authenticated route) a hard constraint would need a wider audit of
  than this route alone; checked live first and confirmed no existing
  duplicate rows. The welcome email's A2I navy/gold shell is exercised
  for real (`buildAthleteWelcomeEmail` left unmocked).
- **Development Plans** (athlete + employee, 30 cases across both
  apps): no dedicated API route exists (direct client-side writes
  under RLS), so this slice pins the content model
  (`devPlan.test.ts`, proving the shared model round-trips exactly
  through `JSON.stringify`/`parse` — the same semantics the JSONB
  columns apply) and the LIVE RLS shape (`devPlansSql.test.ts`: 117
  superseded 066's client-select policy with a `my_company_id()`-scoped
  one, mutation-tested by dropping 117 from the pinned files and
  watching 3 of 10 assertions correctly fail). Pins that the "athlete"
  and "employee" use cases share ONE nullable `athlete_id` column with
  no second identity for content to leak into — there is no
  `employee_id` column anywhere in this schema at all. `lib/devPlan.ts`
  was already a byte-identical shared-dupe pair per its own header
  comment but had never been registered in `check-shared-dupes.sh` —
  fixed as part of this slice.
- **E-Learning** (`checkout`/`webhook`, 23 cases): the webhook's
  signature verification is exercised for REAL, node's own `crypto`,
  not mocked — mutation-tested by signing with the wrong secret and
  watching 9 of 13 cases correctly fail. Idempotent replay via the
  `stripe_events` unique-key collision. `checkout.session.completed`
  sets `access_expires_at` from `LEARNING_ACCESS_DAYS` (default 7, 14
  also tested).
- **Billing/Invoicing** (`retainer`/`raise-invoice`/`stripe/webhook`,
  49 cases): `raise-invoice`'s own explicit `requireStaff()` refusal is
  pinned directly, per the route's own header comment naming why it
  matters most — it was "the one admin API with none" until the
  role-cookie fix. The `stripe/webhook`'s signature verification uses
  the Stripe SDK's own `webhooks.generateTestHeaderString()` against
  `webhooks.constructEvent()` — never a mocked verifier. `invoice.paid`'s
  "only flip if not already active" optimisation is proven by an actual
  write-COUNT assertion, not merely an unchanged end value — mutation-
  tested by removing the route's own `.neq('subscription_status',
  'active')` guard and watching the discriminating test correctly fail
  (a naive "still says active" assertion could not have caught this).

### Group 6: adversarial QA finds one real gap, closes it

Re-reading the plan doc's own PL.1 scope against what Groups 2-5
shipped found the A2I slice named THREE things — the welcome shell,
duplicate-submission throttling, and **"the admin resend route sends
the same shell"** — and only the first two were covered, via the
PUBLIC signup route. The admin STAFF resend route (`POST /api/admin/
athletes/[id]/welcome-email`) had zero coverage, the exact named item
left uncovered. Fixed: 8 new cases proving it sends the SAME A2I shell,
explicitly allows a re-send (the route's own documented behaviour),
stamps the sender from the staff session, and updates nothing on a
failed send.

Every mutation test from Groups 2-5 was independently RE-broken and
re-confirmed in this pass, not merely trusted from its own group's
report. No fake Supabase client in this phase shares the chain-order
bug Group 5's own billing webhook test caught mid-flight (`.eq()`
executing before a later `.neq()` was ever applied).

### Verified

`tsc --noEmit` clean both apps at every group boundary. Full `vitest
run`: **admin 187 passed / 187 test files** (up from 181 at the start
of the phase), **portal 69 passed / 69 test files**, both fully green
— every addition is new coverage, nothing pre-existing was weakened.
All seven CI guards pass: `check-shared-dupes.sh` — **73 pairs, up
from 72** (`devPlan.ts` newly registered); `check-row-cap.sh` — clean;
`check-route-validation.sh` — 44, unchanged; `check-admin-routes-
linked.sh` — 43 static routes, all reachable; `check-blind-updates.sh`
— 101, unchanged (every new/changed write this phase carries an
explicit count/condition check from the start); `check-paged-order.sh`
— clean; `check-unbounded-reads.sh` — the new guard's own 302
baseline, unchanged. Both production builds compile clean.

`docs/CORE_OS_360_COMPLETION_MATRIX.md` and `docs/
core_os_360_completion_manifest.json` updated: C19.9, PL.1 both →
`IMPLEMENTED`, `closed_in_phase: 29`.

**Phase 29 is complete.**

## The Core-OS 360 Completion Programme (Phases 20-29) is complete.

Every requirement the completion matrix assigned to a numbered phase
(21 through 29) is now `IMPLEMENTED`. Three rows remain permanently
open — **C2.7** (live notifications proven after deployment), **C2.8**
and **C4.14** (mobile/tablet field verification) — each explicitly
`DEFERRED-BUT-REQUIRED` with no further phase assignment, recorded as
an environment-limited exception at the phase that found it (22): each
needs a real post-deployment environment or real device/browser
hardware that no code change in any sandbox can supply. This is the
documented exception the matrix's own closing rule anticipates, not
debt discovered only at this final gate.

---

## The one page built to catch RLS drift was itself crying wolf
## (2026-10-01, migration 198)

Operator: "have a look at the system health page on the platform, lots
of issues there." The admin `/health` page's "Row-level security"
panel — `rls_policy_audit()` (080, Foundations Sweep), run live on
every page load specifically to surface real tenant-isolation drift —
was reporting **6 critical + 25 warning** findings on the only two
live companies in production. Investigated each one against the LIVE
policy text (`pg_policies`), never assumed from the audit's own label,
before touching anything.

- **25/25 warnings were false positives, and all for the same reason.**
  Every one is a `_read` policy scoped by a bare `person_visible
  (person_id)` or `is_me(person_id)` call — `person_authorisations`,
  `person_competencies`, `person_credentials`, `person_deployment_
  status`, `role_assignments`, `training_records`, `training_
  attendance`, `pre_employment_checks`, `ppe_issues`,
  `induction_assignments`/`completions`, `development_items`,
  `requirement_exceptions`, `authorisation_suspensions`,
  `competency_suspensions`, `deployment_status_log` — real, correct
  Phase 3 scoping ("You see a person if you can see a linked employee/
  candidate/athlete row, or they are your own workforce"). The
  audit's regex (`company_id|is_tps_staff|get_my_role|my_company_id|
  auth\.uid|user_id`) was written in migration 080, before `person_
  visible()`/`is_me()` existed — nobody revisited it as Phase 1-29
  introduced the workforce scoping vocabulary. Fixed by adding both
  function names to the recognised list.
- **2/6 criticals were also false positives.** `entity_qr_tokens`
  (196) and `worker_qr_tokens` (179) are RLS-on with deliberately ZERO
  session policies — service role only, the documented "fails closed"
  pattern this file already records for both tables. `policy_ack_
  tokens`/`hs_test_tokens`/`profile_access_tokens` use the SAME
  posture but via 3 RESTRICTIVE write-guard policies with no SELECT
  grant, which is why those three never tripped this check at all —
  two different implementations of "service role only," only one of
  which the audit recognised. Exempted both tables by exact name,
  mirroring the `salary_benchmarks` exemption already in this
  function.
- **4/6 criticals were real `USING(true)` policies, and legitimately
  so.** `access_capabilities`/`access_role_capabilities`/`access_
  roles`/`legacy_role_map` (117) are the platform-wide capability/role
  catalogue — non-tenant reference data every authenticated session
  must resolve (`has_capability()`, role labels), the same category as
  `salary_benchmarks`' own existing SELECT exemption. Each policy is
  already restricted `TO authenticated` (verified via `pg_policies.
  roles`), so the separate `anon` table grant these four tables also
  carried was inert under RLS — **tightened anyway** (`REVOKE SELECT,
  REFERENCES, TRIGGER ... FROM PUBLIC, anon`), matching 093's own
  "revoke what nothing needs, even when already inert" discipline,
  rather than left as a latent permission a future RLS change could
  turn live. Exempted by **exact policy name**, not by relaxing the
  `USING(true)` detection itself — a future accidental blanket policy
  on a genuinely tenant-scoped table must still be caught.
- **Net effect, verified live**: 6 critical + 25 warning → **0**. No
  RLS policy, grant visible to `authenticated`, or actual tenant-
  isolation behaviour changed for any live session — only the audit's
  own detection and one dead `anon` grant.
- **Mutation-tested live, in a rolled-back transaction**: a fresh
  blanket `USING(true)` policy on a throwaway table, a fresh policy
  scoped by neither recognised predicate, and a fresh RLS-enabled
  table with zero policies were all still correctly caught (critical/
  warning as appropriate) — only the four named catalogue policies and
  two named service-role-only tables are exempted by name; nothing
  about the detection logic itself was weakened.
- **While reading the page, confirmed `/health`'s RAG band itself
  (`computeBand`) and its churn-trend signal degrade correctly on
  thin data** — the live database currently holds two companies, most
  Phase 1-29 tables at zero rows, and 10 days of `client_health_
  snapshots`; the band never depends on that history (computed live
  from `compliance_items`/`tickets`/`requisitions` each load) and the
  Trend column correctly renders "—" rather than a false signal when
  fewer than one snapshot exists. Not a bug — the RLS panel was the
  only genuinely broken thing on this page.
- **A real naming/overlap issue, found but not fixed here**: `/health`
  (RAG bands from compliance/tickets/stalled-roles), `/engagement`
  (a differently-scored 0-100 engagement band, same page family,
  different taxonomy), and `/health-safety` plus its four per-client
  sub-pages (Digital Twin, Assurance Today, Core 360 Status, Board
  Assurance) are five-plus surfaces that all answer some version of
  "is this client okay" with no cross-link or reconciliation — a
  client can read "On track" on one and "At risk" on another with no
  indication why. Recorded as a known UX gap, not touched in this
  pass (a reconciliation or rename is a design decision, not a bug
  fix).

Migration 198 applied live and verified (function redefinition,
`anon` grant revoked, `authenticated` grant unaffected, zero findings
returned, mutation probe rolled back with zero trace left).

---

## New-client onboarding and billing never learned about Phases 1-29
## (found 2026-10-01, not yet fixed — needs a product decision)

Same session, following on from the operator's "make sure the new
elements are connected to the old parts" instruction. Audited the
client-onboarding wizard and the billing/invoicing code against
everything Core-OS 360 Phases 1-29 built. Three real, confirmed gaps,
left for a scoping decision rather than silently redesigned:

- **A new client is onboarded with ZERO H&S/workforce/governance
  scaffolding.** `POST /api/admin/clients` (the onboarding wizard's
  only creation path) writes exactly the `feature_flags` a staff
  member ticked, optionally creates a Stripe customer/subscription and
  a Manatal org, and sends an invite — nothing else. No sector pack is
  applied (`hs_sector_packs`/`ApplyPackPanel.tsx` exist and work, but
  are never referenced from the wizard — staff must separately open
  the new client's H&S register afterward and apply one by hand), no
  default onboarding template, no Safe-to-Deploy baseline. The old
  Phase 38 "auto-seed on BD-to-client convert" behaviour this file
  once documented belongs to a flow that no longer exists in the
  codebase (BD Intelligence/BD Roles were removed 2026-09-25) and was
  never replaced with an equivalent in the current wizard.
- **Billing has no connection to any service this platform added since
  Phase 4.** The only real billing state is `companies.monthly_
  retainer_pence` + `feature_flags`, set by the onboarding wizard and
  the `/retainer` PATCH route. `raise-invoice`'s `PACKAGES` constant is
  still `['HIRE','LEAD','PROTECT','OTHER']` — there is no Consultancy,
  H&S-as-a-service, or Workforce/Safe-to-Deploy line; staff must
  shoehorn any of those into free-text "OTHER". `consultancy_service_
  scopes` (Phase 6, tracks service type/dates/commercial reference) is
  written by its own portal route with zero code anywhere joining it
  to retainer, flags, `client_services`, or Stripe — a client can carry
  a full consultancy service scope on record with billing having no
  idea, or vice versa.
- **`client_services` is dead, orphaned data.** No insert path exists
  anywhere in the codebase (confirmed by a full grep); its only readers
  are the Value Report and the monthly cron. The client-detail page's
  own tab list no longer has a "Services" tab — it was pulled at some
  earlier point and nothing ever flagged the table as now-unused the
  way this file's standing discipline usually catches (e.g. `leave_
  records` being retired after its own fix — this one was simply
  missed).
- **Feature flags themselves are NOT the gap** — checked and found
  fine: `FLAG_GROUPS` (`lib/featureFlags.ts`) is a real single source
  of truth, exposed in both the onboarding wizard and a dedicated
  `/feature-flags` page; staff never hand-edit JSONB. The newer Phase
  1-29 modules are deliberately gated on the existing `protect`/`lead`
  masters rather than given their own flags (documented inline in
  `moduleAccess.ts`), and Consultancy is deliberately capability-gated
  rather than flag-gated — both coherent, already-made design choices,
  not unfixed debt.

**Not fixed in this pass** — each of the first three needs an actual
product/business decision (what a new client should be auto-seeded
with, what billing should call the newer service lines, whether
`client_services` should be revived or formally retired) rather than
a unilateral change to live invoicing and onboarding behaviour.

---

## Onboarding/billing integration gaps closed (2026-10-01,
## migrations 199-200)

The three gaps above were put to the operator as a decision, not
silently resolved. Decision: auto-apply a sector pack on client
creation; add explicit Consultancy/H&S billing packages and surface
`consultancy_service_scopes` on the retainer panel; retire
`client_services` formally (stop every reader, drop the table).

- **Onboarding auto-seed.** `POST /api/admin/clients` now looks up the
  new company's own `sector` against `lib/hs/sectorPackMapping.ts`'s
  `packSectorKeyForCompanySector()` — a deliberately CONSERVATIVE,
  curated map from the onboarding wizard's 65+ free-text `SECTORS`
  values onto one of the five seeded `hs_sector_packs` keys (106:
  office/construction/manufacturing/care/hospitality). The same "never
  guess" discipline this file already applies to a country/industry
  match elsewhere (the referral gate's `KNOWN_COUNTRIES`, Manatal's
  `splitLocation`): a sector that could plausibly be office- or
  site-based (Engineering, Agriculture, Mining, Education, …) maps to
  `null` — no pack applied, staff still picks one by hand from the
  register's own `ApplyPackPanel`, exactly as before. A confident match
  applies every item from that pack to `compliance_items` (reusing
  `itemsToApply()`/`firstDueDate()` verbatim — a fresh company has no
  existing titles to de-dup against, so every item applies). Best-effort,
  the same posture as the existing Manatal/Stripe onboarding steps: a
  failure here never undoes the company row, surfaced in the route's
  own response as `sector_pack: { error }` rather than failing the
  whole request.
- **Billing gets a real Consultancy line.** `one_off_invoices.package`'s
  CHECK (065) widened from `HIRE/LEAD/PROTECT/OTHER` to add
  `CONSULTANCY` (migration 199 — checked live first: 0 rows on the
  table, so the CHECK was tightened directly). `raise-invoice`'s
  `PACKAGES`, `InvoicesTab.tsx`'s dropdown, and `lib/stripe.ts`'s
  `raiseOneOffInvoice()` parameter type all widened to match — one
  vocabulary, not three that could drift.
- **The retainer panel now shows what's actually being delivered.**
  `lib/cache/clientDetail.ts`'s `getCachedClientDetail()` (the
  `/clients/[id]` page's existing per-client cache, already invalidated
  by the retainer PATCH route via `revalidateTag`) gains one more
  parallel read: the client's own `consultancy_service_scopes` rows
  (168, read-only here — staff already hold `is_tps_staff()`'s own
  `FOR ALL` policy on this table, so no capability wiring was needed
  for the admin app at all, unlike the portal Command Centre's own
  portfolio-wide write path). `BillingPanel` (in `ClientDetailTabs.tsx`)
  renders them read-only, labelled via the existing
  `lib/consultancy/vocab.ts` (`SERVICE_TYPE_LABELS`/
  `SERVICE_SCOPE_STATUS_LABELS`) — no new vocabulary invented. This
  closes the actual gap named above: a consultancy service scope and a
  retainer figure can now be read side by side by whoever is setting
  either.
- **`client_services` is gone — formally, not just abandoned.**
  Checked live immediately before dropping it (0 rows, same as every
  earlier check this session): table dropped (migration 200,
  `DROP TABLE ... CASCADE` — its own `updated_at` trigger goes with it;
  the shared `update_updated_at()` function, used by 10+ other tables,
  is untouched). Every reader removed: the admin client-tab-data API's
  unreachable `case 'Services':` branch (confirmed dead — no caller
  anywhere sends `tab=Services`, the UI tab itself was removed at some
  earlier point); the portal dashboard's always-empty "Active Services"
  panel; and the Value Report's own MRR calculation, which was
  silently reporting **£0 for every real paying client** because
  nothing had ever written to the table it was reading from. `usage.mrr`
  now reads the real `companies.monthly_retainer_pence` directly — a
  genuine correctness fix, not just a removal. `usage.activeServices`
  (a chip list that was always empty) is dropped from the report
  entirely rather than replaced with an invented substitute. The
  `ClientService` TS interface and its `client_services` Database-type
  entry are removed from both apps' type files.
- **Every test fixture referencing the old shape was updated, not
  just the application code**: `computeReport.test.ts` (MRR now comes
  from a `companies` fixture, not a `services` one, with a dedicated
  "no retainer on file → £0" case), `computeQuarterlyValueReport.test.ts`
  (the "usage is taken wholesale from the last month" property still
  holds under the new input shape), and the monthly-value-reports cron's
  own route test (the `client_services: []` fixture key dropped, since
  nothing reads that table name any more).
- New `sectorPackMapping.test.ts` (6 cases): each of the five pack keys
  reachable from a real sector; an ambiguous or unlisted sector never
  guessed; every mapped sector is a real `SECTORS` entry (so the map
  can't silently drift from the onboarding dropdown); every mapped
  value is one of the five real pack keys.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(admin 1905/1905 — up from before this change by the new
`sectorPackMapping.test.ts` cases plus the two rewritten MRR cases;
portal 956/956, unchanged — this work touched admin only beyond the
two shared type-file edits), all seven CI guards pass with no
regressions (73 shared-dupe pairs, unchanged; row-cap clean; 44
unvalidated routes, unchanged; 43 static admin routes, all reachable;
101 blind-update chains, unchanged; every paged query's `.order()`
present; 302 unbounded-read baseline, unchanged), both production
builds compile (portal's one prerender failure on `/onboarding` is the
same long-documented sandbox-only missing-Supabase-env-var limitation
recorded throughout this file's history, unrelated to this change).
Migrations 199 and 200 applied live and verified: the widened CHECK
read back via `pg_get_constraintdef()` and probed both directions
(CONSULTANCY accepted, a bogus value still refused) before the real
apply; `client_services` confirmed gone via `to_regclass()`, the
shared `update_updated_at()` function confirmed still present.

---

## QR field reporting + real LMS assignment/progress tracking
## (2026-10-01, migrations 201-202)

Closes the two gaps the go-live feature audit named explicitly: the
Worker/Entity QR scan pages (`/w/[token]`, 179; `/e/[token]`, 196) had
exactly one button (check in/out) and no way for a person on site with
no portal login to report an incident or hazard, upload a photo, or
read a company's current H&S documents; and the E-Learning marketplace
(`learning_content`/`learning_purchases`, 006) only ever granted a
COMPANY-WIDE access window, never a way to assign a specific piece of
content to a specific employee or track their own completion.

### QR field reporting (migration 201)

- **The reporter has no session, by construction.** Every insert runs
  under the SERVICE ROLE from the public, token-gated route
  (`worker_qr_tokens`/`entity_qr_tokens`'s own "possession of the token
  is the proof" model) — never a direct session write, the same reason
  `site_checkins`' own mutations are route-only. `hs_incident_guard`/
  `hs_hazard_guard` already branch on `current_user IN
  ('authenticated','anon')`, which is false for a service-role
  connection, so their own session-only defaulting is skipped and the
  route supplies sensible values directly — no change needed to either
  guard.
- **`hs_check_refs()` gains one more reference to validate**
  (`reported_by_person_id → people`), added to its existing shared
  VALUES list — the standing "extend the list, never invent a bespoke
  check" rule — after reading the LIVE function body first (confirmed
  byte-identical to 125's own canonical definition before extending
  it, not guessed from an older migration file).
- **`entity_qr_report_context(p_token_hash)`** is the one new DEFINER
  function, grant-shape-identical to `worker_qr_status()`
  (`service_role` only, `REVOKE ALL FROM PUBLIC, anon, authenticated`)
  — `entity_qr_status()` deliberately never exposes `entity_id`/
  `company_id` to the browser, so a report route needs this
  server-side companion to resolve a badge token to what it actually
  needs to insert a correctly-scoped hazard.
- **Four new routes**: `/api/w/[token]/report-incident`,
  `/report-hazard`, `/evidence` (photo upload, reusing
  `uploadEvidence()` verbatim — the exact helper `IncidentReportForm
  .tsx` already calls under a real session, only the client passed to
  it differs here), `/documents` (reads the company's currently
  `active` `hs_documents`, signs the latest `hs_files` row per
  document under the service role, 300s like every other evidence link
  in this codebase); and `/api/e/[token]/report-hazard` (links a
  `linked_asset_id` for equipment, folds a COSHH assessment's name into
  the hazard's own title/description — hazards has no FK column for a
  COSHH link, a documented, honest scope limit rather than inventing
  one). All four validated with `parseBody`/`parseForm` + zod, field
  ceilings matched EXACTLY to the underlying CHECK constraints
  (`hs_incidents`/`hazards`: title≤200, description≤4000,
  location≤300) — the Phase 15 B.1 lesson, applied from the start.
- **No new consequence rule needed anywhere.** The existing
  `incident_reported`/`hazard_reported` rules in `safetyRules.ts`
  already react to any row regardless of who or what inserted it.
- **Worker scan UI** (`WorkerScanView.tsx`) gains Report incident/
  Report hazard buttons (`ReportForm.tsx`, photo upload after the
  report is created) and a Documents section (`DocumentsList.tsx`,
  lazy-fetched, expand-on-click). **Entity scan UI**
  (`EntityScanView.tsx`) converted to a client component and gains a
  single "Report an issue with this" button (`EntityReportForm.tsx`).
  Both `/api/w/` and `/api/e/` were already prefix-matched in the
  portal middleware's `PUBLIC_ROUTES` — no middleware change needed.

### Real LMS assignment + progress tracking (migration 202)

- **`learning_assignments` is deliberately separate from
  `development_items.linked_course_id`** (134, which links to
  `training_courses` — the formal H&S/workforce training register, a
  different catalogue) and additive alongside `learning_purchases`
  (006, untouched) — this table is keyed to `learning_content` and
  tracks one specific assignment to one specific person.
  `UNIQUE (content_id, person_id)`: a re-assignment upserts the same
  row, the idempotency discipline this codebase uses throughout.
- **Progress is self-reported** (`status` + `progress_percent`) — the
  same honest default this codebase uses everywhere rather than
  fabricate a number: there is no video-player hook to read actual
  watch time from, so the learner's own "mark complete" is the real
  signal.
- **A real bug caught by this codebase's own standing regression
  test, not by review**: the first draft derived `company_id` via a
  raw `SELECT company_id FROM people WHERE id = NEW.person_id` inside
  a function declared `SECURITY DEFINER`, and the self-restriction
  branch keyed on `current_user IN ('authenticated','anon')` —
  `invokerGuards.test.ts` (088's own rule, reaffirmed after 134
  shipped the identical mistake and a self-submitted certificate was
  stored as verified until 134a caught it live) immediately failed:
  under DEFINER, `current_user` becomes the function's OWNER, never
  `'authenticated'`/`'anon'`, which would have silently skipped the
  whole self-restriction for EVERY session — a self-user could have
  changed their own `due_date`/`notes`/`assigned_by` despite the
  trigger's own stated intent. **Fixed**: the function is `SECURITY
  INVOKER`, and the person→company lookup now calls the existing
  `workforce_person_company()` DEFINER helper (134a) instead of a raw
  SELECT, the exact `workforce_evidence_guard()` (142) precedent for
  "a session-keyed guard stays INVOKER; a small DEFINER helper does
  the one cross-table lookup it needs."
- **Mutation-tested live, not just via the SQL-shape test**: a
  rolled-back probe built two genuinely non-privileged identities
  (real throwaway `auth.users` rows inside the transaction, since
  every live `people.user_id` in production belongs to a
  `client_admin`, who already holds `training.manage` — testing
  against one of those would have falsely looked like a pass) and
  confirmed: the assigned person updates their own progress; the SAME
  person is refused changing `due_date` ("You may only update your own
  progress"); an unrelated non-manager person cannot touch the row at
  all (RLS-filtered, 0 rows); `row_version` is forced to 2 regardless
  of anything the caller sent. All 6 checks passed; no trace left live
  after rollback.
- **RLS**: staff `FOR ALL`; a session holding `training.manage` on its
  own company may change anything; the assigned person's own linked
  portal login sees and updates only their own row (the trigger above
  decides which columns they may actually touch).
  `apply_write_guard()` applied; `audit_row()` whitelists identifying
  columns only, never `notes`.
- **UI**: `LearningAssignmentPanel.tsx` — a manager's "Assign to a team
  member" picker (`teamPeople`, `worker_type = 'employee'`) and the
  assigned person's own Start/Mark complete buttons, both counted
  writes (`{ count: 'exact' }` + `judgeWrite()` from the start — this
  codebase's own blind-update discipline, never retrofitted after the
  guard catches it). An "Assigned to you" section on the Learning
  browse page reads the viewer's own assignments
  (`/lead/learning/page.tsx`).
- **Reminders**: `learning_assignments` joins `REMINDER_ENTITIES`
  (`due_30`/`due_7`/`overdue`, excluding completed rows), a new
  `learning_assignment_reminder` consequence rule resolves the
  content title and person name by id (never a reminder-payload
  embed — the standing `slimRow()` discipline), new notification types
  `learning_assignment_due`/`learning_assignment_overdue` added to the
  shared `notify/types.ts` (both the type tuple AND the label map —
  caught by `tsc`, not by review, when the first pass only added the
  tuple entry).

### Two CI-guard regressions found and fixed before this shipped

- **`check-unbounded-reads.sh`'s ratchet (baseline 302) caught two new
  unbounded chains**: `documents/route.ts`'s `hs_files` read (bounded
  by construction — at most 30 doc ids — but the scanner can't see
  that) and the Learning page's new `learning_assignments` read.
  Fixed with `.limit(500)`/`.limit(500)`, the exact `.in('entity_id',
  …).limit(500)` precedent already used throughout the H&S register
  reads, rather than widening the baseline.
- **`check-blind-updates.sh`'s ratchet (baseline 101) caught two new
  blind UPDATEs** in `LearningAssignmentPanel.tsx` (mark-complete,
  start). Fixed with `COUNT_EXACT` + `judgeWrite()`, the
  `CheckoutButton.tsx` precedent, before this shipped — built counted
  from the start is the discipline, catching it here is the guard
  doing its job.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(admin 1921/1921 — up from before this change by 17 new:
`qrFieldReportingSql.test.ts` (5), `learningAssignmentsSql.test.ts`
(10, including the new SECURITY-INVOKER-pinning case), plus
`invokerGuards.test.ts` correctly catching and then confirming the
fix; portal 961/961 — unchanged test-file count, this work touched
portal application code but added no new portal test file beyond
what the admin-side SQL-shape tests already pin), all seven CI guards
pass with no regressions (73 shared-dupe pairs, unchanged; row-cap
clean; 44 unvalidated routes, unchanged — all five new routes
validated with `parseBody`/`parseForm`; 43 static admin routes, all
reachable — this work touched no admin route; 101 blind-update
chains, back to baseline after the two-chain regression above was
fixed; every paged query's `.order()` present; 302 unbounded-read
chains, back to baseline after the two-chain regression above was
fixed), both production builds compile, including `/w/[token]`,
`/e/[token]`, `/api/w/[token]/{report-incident,report-hazard,
evidence,documents}`, `/api/e/[token]/report-hazard`,
`/lead/learning` and `/lead/learning/[id]`. Migrations 201 and 202
applied live via a mix of `apply_migration` (201, and 202's own
history row recorded by hand after `apply_migration` itself twice
timed out/was cancelled mid-call on 202 — confirmed via `to_regclass()`
that neither partial attempt left anything behind before re-applying
the DDL statement-by-statement through `execute_sql`) and verified
independently afterward: all four new `hs_incidents`/`hazards`
columns present, `entity_qr_report_context()`'s grant shape matches
`worker_qr_status()`'s exactly, `learning_assignments` has RLS on
with exactly 7 policies (4 of its own + the write guard's 3), both
triggers present, `learning_assignments_fill()` confirmed
`prosecdef = false` (SECURITY INVOKER) directly from `pg_proc` — and
the full self-restriction/cross-person-isolation/row_version-forcing
behaviour proven end to end in the rolled-back live probe described
above, not merely asserted from the function body text.

---

## Entity QR reports now track back to the item, and admin got its own
## QR management page (2026-10-02)

Operator: the scanned-report flow should "track to the item" so the
client and admin can both see it, and admin needs its own place to
"easily add and create the codes per client." No migration — both
pieces were missing UI over schema that already existed.

- **The gap was real, not just hidden.** `/e/[token]`'s `report-hazard`
  route (201) has always written `linked_asset_id` onto the `hazards`
  row it inserts — but nothing anywhere read that column back. A
  worker's scanned report vanished into the general register with no
  visible link to the machine it was actually about, on either side.
- **Equipment pages now show "Reports from this item's QR code."**
  Admin's `EquipmentClient.tsx` (under the existing `EntityQrPanel`)
  and portal's `/protect/equipment` (as an inline row under each item)
  both query `hazards` filtered to `linked_asset_id` for that
  company's equipment ids and list the open reports, each linking to
  the hazard itself. Admin has no hazard detail page (hazards are
  worked only in the portal workspace, staff included — the standing
  rule since Phase 1), so its list links OUT via `portalUrl()`.
- **The hazard detail page shows the reverse link.** When
  `linked_asset_id` is set, `/protect/hazards/[id]` now shows
  "Reported against: <equipment name>", linking back to
  `/protect/equipment#eq-<id>` — each equipment row carries that
  anchor id now, so the link lands on the right row.
- **A real JSX trap, caught before it shipped, not after.** The
  equipment page's `.map()` now returns two sibling `<tr>`s (the item
  row plus a conditional reports row) — the exact "`<>...</>` cannot
  carry a `key` prop" footgun this file's own history already records
  once for a different reason. Fixed with an explicit
  `<Fragment key={item.id}>` from the start.
- **Admin's new "QR Codes" tab** (`HsCompanyTabs.tsx`, nests under the
  already-linked `/health-safety` prefix, no new sidebar entry needed)
  is one page per client listing every equipment item and every COSHH
  assessment with its own mint/revoke control
  (`QrCodesClient.tsx` + the existing `EntityQrPanel.tsx`, unchanged) —
  additive alongside the equipment tab's own per-row panel, not a
  replacement for it.
- **COSHH never had an admin-side mint path at all** — it's portal-
  only, so the only way to generate a COSHH QR before this was the
  portal's own assessment detail page. A new
  `POST`/`DELETE /api/admin/hs/coshh/[id]/qr` route mirrors the
  existing equipment route exactly (`requireStaff()` is the only
  gate — the whole `/health-safety` section is already staff-only by
  the admin app's own auth layer, the identical posture the equipment
  route already has) and calls the same shared
  `mintEntityQrToken`/`revokeEntityQrToken` helpers (196) the portal's
  own COSHH route already uses.
- **`entity_qr_tokens` carries its own `company_id`** — confirmed live
  before writing the query — so scoping the new QR Codes page to one
  client needed no id-list join, just `.eq('company_id', ...)`.
- **One unbounded-read regression, caught and fixed by the guard
  itself before this shipped**: the first draft of the QR Codes page's
  `entity_qr_tokens` read had no bound at all
  (`check-unbounded-reads.sh` correctly flagged it, 303 vs the 302
  baseline); adding `.limit(1000)` then tripped the SIBLING guard
  (`check-row-cap.sh`, which treats exactly 1,000 as indistinguishable
  from unbounded at the PostgREST cap boundary) — settled on
  `.limit(500)`, satisfying both.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green
(1921/1921 both apps, unchanged — this is UI/route work with no new
pure-logic module, the established "no component-level test"
convention), all seven CI guards pass with no regressions
(73 shared-dupe pairs, unchanged — `EntityQrPanel.tsx` was already a
registered pair and is reused unchanged, not duplicated; row-cap
clean; 44 unvalidated routes, unchanged — the new COSHH route takes no
request body; 43 static admin routes, all reachable — the new page is
dynamic (`[companyId]/qr-codes`), needing no literal-reference check;
101 blind-update chains, unchanged — this work adds no new write path
beyond the existing mint/revoke calls; 302 unbounded-read chains, back
to baseline after the fix above; every paged query's `.order()`
present), both production builds compile, including
`/health-safety/[companyId]/qr-codes` and
`/api/admin/hs/coshh/[id]/qr` (admin) — confirmed present in the build
output by name, not just a clean exit code. Portal's one prerender
failure (`/auth/reset-password`) is the same long-documented
sandbox-only missing-Supabase-env-var limitation recorded throughout
this file's history, unrelated to this change.

---

## A follow-up go-live audit's own "dead table" claim was wrong — the real
## bug was ten silent reads of a table nothing had written to since
## 2026-09-25 (2026-10-02, migration 203 pending)

A confirmation pass following the 2026-10-01 full feature/tenancy audit
re-checked its consolidated gap list and was asked to close it. The
audit's own §4 flagged `tickets`/`ticket_messages` as "still physically
exist, unused, unaudited — recommend dropping." **That claim was wrong
for `tickets`.** A repo-wide search for the literal table name (not the
word "tickets", which also appears in comments, placeholder copy and an
unrelated IvyLens-ticket feature) found it was still being READ from —
just never written to since "Support & BD in sync" moved the real
support object to `service_requests` — by **ten call sites across both
apps**: `/health`, `/engagement`, `/activity`, `/reports`,
`/value-reports`, the client-detail billing cache
(`lib/cache/clientDetail.ts`), `api/clients/summary`, two crons
(`health-snapshot`, `monthly-value-reports`), and the portal's HIRE
metrics page. Every one of them had been silently reading **zero rows,
forever**, since the cutover — a real, live regression on the
**client-facing Value Report** (`ticketsRaised`/`ticketsResolved`/
`avgResolutionHours` always reported 0) and on the internal `/health`
and `/engagement` dashboards' "open tickets" signal, exactly the
"compiles, renders, reports success" class of silent defect this file's
own history already warns about repeatedly.

- **Every read site redirected to `service_requests`**, the actual live
  support object, with the status vocabulary corrected
  (`open`/`in_progress`/`resolved`/`closed` → `new`/`in_progress`/
  `complete`). `computeValueReport()`'s `support` section replaced
  `ticketsRaised`/`ticketsResolved`/`avgResolutionHours` with
  `avgResponseHours` (computed from `service_requests.responded_at -
  created_at`) — a genuinely working metric instead of a permanently-
  zero one, propagated through `buildReportPdf.ts`,
  `ValueReportClient.tsx`, both callers and all affected tests.
- **`health-snapshot`'s cron used to read the dead `tickets` table
  TWICE more** (once unpaged for the open-count, once paged for
  recency) **on top of a THIRD, already-live `service_requests` read**
  feeding `computePortfolioCounts` — consolidated into ONE paged read
  serving all three consumers, removing two redundant queries rather
  than just swapping the table name.
- **`activity/page.tsx`'s dead `ticket_created` feed block was removed
  outright** rather than fixed — `service_requests`' own `service_
  request` feed item already covers the same signal correctly; keeping
  both would have been two vocabularies for one fact.
- **The admin dashboard home page (`dashboard/page.tsx`) was checked and
  found to already be correct** — it already read `service_requests`
  under a `ticketRes`/`tickets` variable name (historical naming, not a
  bug); the audit's grep-for-the-word-"tickets" false-positived on its
  own explanatory comment.
- **UI copy fixed where it said "tickets"** (`GlobalSearch.tsx`'s
  placeholder and footer hint, the client-detail "Open Tickets" stat
  label, the portal HIRE metrics Support card) — `search_records()`
  (Phase 1) already has a real `service_request` branch, so the
  GlobalSearch copy was describing a dead table when the live search
  already covered the right one.
- **`ticket_messages` genuinely was dead** — zero references anywhere,
  confirmed by the same literal-table-name search. Both tables' now-
  orphaned type declarations (`Ticket`/`TicketMessage`/`TicketStatus`/
  `TicketPriority` interfaces, the `tickets`/`ticket_messages` `Database`
  table entries, the `ticket_status` enum entry) were removed from both
  apps' `database.types.ts`/`types.ts`, mirroring the `client_services`
  removal precedent (2026-10-01).
- **Migration 203 drops both tables** — written and verified safe live
  first (0 rows each, confirmed again immediately before every attempt;
  the only FKs are `tickets→companies`/`auth.users` and `ticket_
  messages→tickets`/`auth.users`, nothing else references either
  table). **Still not applied, re-tried a fifth time (2026-10-02)**:
  every `apply_migration`/`execute_sql` DDL call against these two
  tables has timed out (60s) across two separate sessions now,
  including the original trivial scratch-table `CREATE`/`DROP`
  round-trip that confirmed the timeout was a general DDL-path issue
  and not specific to these two tables — ordinary `SELECT`s against the
  same project (including `to_regclass()` checks run immediately before
  and after each retry) succeeded instantly throughout, and
  `pg_stat_activity` showed no blocking session each time, ruling out
  lock contention again on this retry too. The application code no
  longer references either table either way, so this remains purely
  pending cleanup, not a blocker — re-run `203_drop_dead_tickets_
  tables.sql` once the DDL path is responsive again, then verify via
  `to_regclass('public.tickets')`/`to_regclass('public.ticket_messages')`
  reading back `NULL`, never trusting a bare success response for DDL
  (this file's own standing rule since the IvyLens telemetry table
  incident).
- `check-unbounded-reads.sh`'s baseline lowered 302 → 301 — removing
  `health-snapshot`'s redundant unpaged `tickets` read deleted one
  unbounded chain outright, a real improvement the guard's own exit
  message asked to be recorded.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green (1921
admin, unchanged count — this touched existing tests, not added new
ones; portal unaffected, no portal test file touched beyond the UI copy
fix with no test coverage of its own), all seven CI guards pass
(unbounded-reads baseline correctly lowered; row-cap clean;
paged-order clean; blind-updates 101, unchanged), both production
builds compile (portal's one prerender failure is the same long-
documented sandbox-only missing-Supabase-env-var limitation, unrelated
to this change).

---

## Closing the go-live audit's gap list, decided items first: Evidence
## Coverage gets a real "unverified" band (2026-10-02)

Follow-up to the gap-closure pass above. The 2026-10-01 audit's own
§3 flagged this explicitly: "a brand-new client with ZERO evidence on
file renders the identical green band as one with 100% coverage" on
the Compliance Digital Twin's Evidence Coverage area
(`lib/complianceTwin/assemble.ts`). Put to the operator as a decision
(changing a deliberate prior design choice, not a bug) — the answer
was to add a distinct "unverified" state rather than leave it.

- **A new `ComplianceTwinAreaBand = ComplianceTwinBand | 'unverified'`
  type, confined to the per-AREA field only.** `ComplianceTwinSnapshot
  .overallBand` deliberately stays the plain 3-state
  `ComplianceTwinBand` — `worstBand()` now explicitly skips
  `'unverified'` entries when computing the rollup (tied with green's
  severity, but never itself a candidate for "worst"), so the type
  genuinely cannot leak into `overallBand`. That is what let every
  existing consumer of `overallBand` — Board Assurance's trend
  comparison (`deriveTrend()`'s severity ordering), Assurance Today,
  the stored-snapshot trend UI — go **completely untouched**: the
  widening is invisible to anything that only ever reads the rollup.
- **`buildArea()` gained an optional `cleanBand` parameter** (default
  `'green'`, unchanged for the other four areas) rather than a
  special-cased branch bolted onto `evidenceArea()` alone — the same
  shared helper every area already calls.
  `evidenceArea()` passes `'unverified'` exactly when
  `coveragePercent == null` (genuinely zero register completions to
  judge, not a 0% finding — a real 0% with real completions already,
  correctly, hits the red/amber checks above it) and gives it its own,
  specific reason text ("No register completions have been recorded
  yet — evidence coverage cannot be verified") instead of reusing the
  old dual-purpose sentence that used to paper over the ambiguity.
- **`ComplianceTwinView.tsx`** (shared-dupe pair) gained a fourth
  colour/label/icon (`HelpCircle`, muted `--ink-faint`, "Not yet
  verified") — `BAND_COLOUR`/`BAND_LABEL`'s `Record<...>` types made
  this compiler-enforced: leaving the entry out would not compile.
  **`BoardAssuranceClient.tsx`** needed the identical widening on its
  own local `BAND_COLOUR` map (it renders each area's band directly,
  not through the shared view component) — the one other real
  consumer `tsc` surfaced; nothing else in either app indexes a
  `Record` by an area's own band.
- **Mutation-tested via the existing test, not a new one bolted on**:
  the exact test that used to assert `'green'` for a null-coverage
  input (`assemble.test.ts`) was rewritten to assert `'unverified'`
  instead, plus its own specific reason text — this IS the regression
  test for the bug the audit found, not a new case alongside the old,
  now-wrong one. A second new case pins that an unverified evidence
  area never promotes `overallBand` away from green, proving the
  confinement claim above rather than just asserting it in a comment.

Verified: `tsc --noEmit` clean both apps (one other real consumer,
`BoardAssuranceClient.tsx`, found and fixed by the compiler itself,
not by inspection), full `vitest run` green (1922 admin — 1921 + 1 net
new case; portal unchanged, no portal test file for this module per
the established convention), all seven CI guards pass (73 shared-dupe
pairs, unchanged — both widened files were already registered pairs),
both production builds compile (portal's one prerender failure is the
same long-documented sandbox-only missing-Supabase-env-var limitation).

---

## Closing the go-live audit's gap list, decided item 2: Core 360 Status
## designated the primary "is this client OK" dashboard (2026-10-02)

The audit's gap list named five-plus overlapping dashboards answering
some version of "is this client OK" — `/health`, `/engagement`,
`/health-safety`'s own per-client KPIs tab, Digital Twin, Assurance
Today, Board Assurance, Core 360 Status — with no cross-link or
reconciliation, so a client could read "On track" on one and "At risk"
on another with no indication why. Given the choice between adding
cross-links alone and the bigger UX change of picking one canonical
answer, the operator chose the latter.

- **Core 360 Status (Phase 27, C13.8) is the designated primary view.**
  It already composes `PortfolioCounts` and `RiskGraphIntelligence`
  into six NAMED domains (People, Plant, Training, Risk Controls,
  Environmental, Contractors) rather than Digital Twin/Assurance
  Today's five EHS-pillar areas — the domain framing is the one most
  directly answering "is this client OK" in plain business terms, and
  it already sits downstream of (reuses, never duplicates) every other
  dashboard's own computation.
- **Moved to the front of both tab lists**, not merely added a link:
  `HsCompanyTabs.tsx`'s `TABS` array now opens with `core-360-status`
  (ahead of `register`); the portal `/protect` layout's `TABS` now
  places it immediately after Overview. Both apps keep every other tab
  — this is a prominence change, not a removal.
- **Digital Twin, Assurance Today and Board Assurance are now
  explicitly framed as detail views**, in both apps: each page gained
  a one-line `card` banner at the top — "This is a detail view. See
  Core 360 Status for the one overall verdict across People, Plant,
  Training, Risk Controls, Environmental and Contractors." — linking to
  `core-360-status`/`core-360-status`. `/health` and `/engagement`
  (the client-portfolio BD/account-management signals, staff-only,
  genuinely answering a different question — churn risk and raw
  compliance/ticket counts, not an EHS domain verdict) were
  deliberately left untouched: reconciling THEM into this hierarchy is
  a separate, larger product decision (what "client health" even means
  across Sales vs. Safety) that was not part of what was asked for
  here, and forcing a link from a commercial-health page to an EHS
  dashboard would have implied an equivalence that isn't actually true.
- **No schema, no new component — pure routing/labelling.** The banner
  is an inline `<div className="card">` + `<Link>`, not a new shared
  component: the exact wording and link target differ only by which
  page it sits on (admin needs `/health-safety/<companyId>/...`,
  portal needs `/protect/...`), so a shared component would have
  needed the same per-caller-href plumbing `ComplianceTwinView.tsx`
  already uses for its own area links, for a three-line banner that
  isn't worth the indirection.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green (190
test files / 1922 tests admin, 69 test files / 961 tests portal — both
unchanged counts, confirming this is a pure UI/routing change with no
new or altered pure logic), all seven CI guards pass with no
regressions (73 shared-dupe pairs, unchanged; row-cap clean; 44
unvalidated routes, unchanged; 43 static admin routes, all reachable;
101 blind-update chains, unchanged; every paged query's `.order()`
present; 301 unbounded-read chains, unchanged), both production builds
compile (portal's one prerender failure on `/auth/reset-password` is
the same long-documented sandbox-only missing-Supabase-env-var
limitation, unrelated to this change).

---

## Go-live gap list, round two: five more items closed (2026-10-02,
## migration 204)

Following the two confirmation audits above, the operator asked to
keep working down the full go-live feature-gap list — "all of it."
Five of the ten remaining items are closed in this pass, each checked
against the live code FIRST (a background survey agent traced all ten
against the real codebase before any line was written) — three turned
out to need no new table at all, reusing data this platform already
computes daily; two needed a small, honestly-scoped schema addition.

- **Daily Management Briefing** (admin `/briefing`,
  `lib/briefing/compute.ts`): "what needs attention today" across the
  whole portfolio for staff, genuinely different from `/health` (a
  per-client RAG roll-up a staff member has to open client-by-client)
  and the per-client `WhatChangedTab` (a retrospective, not a "what's
  outstanding right now" view). Pure composition over TODAY's already-
  written `client_health_snapshots` row (107/168, written daily by the
  existing cron) — no new table, no AI. Each of the 13 already-stored
  counts is bucketed into a fixed, named critical/warning severity
  (never a score); `assets_unavailable` gets the one three-way
  threshold (1-2 is a warning, 3+ is critical), mirroring
  `lib/core360Status/assemble.ts`'s own Plant domain. Falls back to
  yesterday's snapshot, labelled as stale, if today's cron (06:45 UTC)
  hasn't run yet. Linked from `AdminSidebar.tsx`'s Intelligence group,
  ahead of Health Status.
- **People Timeline** (portal person profile, new "Timeline" tab,
  `lib/workforce/timeline.ts`): a single chronological feed for ONE
  person across training, competency, qualifications, inductions,
  authorisations, PPE, pre-employment checks, development items, Safe
  to Deploy status changes and safety/incident mentions — distinct
  from the per-COMPANY Safety Timeline (`hs_events`) and the per-client
  admin "What Changed" feature. `loadProfile.ts` already fetches every
  one of these ~10 tables under the viewer's own RLS session for the
  profile's existing tabs; this file only UNIONs and sorts what was
  already loaded — no new query, no new table, and nothing from the
  gated Occupational Health tab is ever included (health stays behind
  its own, separate capability check).
- **Group Roll-Up Reporting** (admin `/clients/groups`,
  `lib/groupRollup/compute.ts`): `companies.parent_organisation_id`
  (117) has existed since Phase 1 but was, until now, read or written
  in exactly one place — the Organisations page's own plain reassignment
  dropdown. This adds the actual roll-up: combined monthly retainer
  across a parent and its direct children, plus the SAME
  `assembleDailyBriefing()` bucketing the Daily Briefing already uses,
  scoped to just that group's own companies. A group is exactly one
  level deep (the parent plus its direct children), matching the only
  relationship the Organisations page's own UI ever creates — no
  grandchild-chain traversal invented for a shape nothing populates.
- **Emergency Readiness live-check** (admin Emergency Plans,
  `lib/emergencyReadiness/compute.ts`): migration 154's own header
  comment named the intended design in 2026-09-28 — "who currently
  holds that authorisation is read LIVE from `person_authorisations`"
  — but the live join was never actually built into the UI; the page
  only ever showed the REQUIRED minimum headcount, never the CURRENT
  one. This reads `person_authorisations` directly (status `active`,
  not expired, scoped to the plan's own site when it names one) and
  `hs_equipment.status` for linked equipment, producing a per-plan
  Ready/Needs attention/Critical gap band with named reasons — a
  missing role is critical, unavailable equipment or an overdue drill
  (no drill in the last documented, fixed 365 days) is a warning. No
  AI, no score — every number is a live headcount against a stored
  minimum.
- **Time-to-Interview / Time-to-Offer / Stage-Duration analytics**
  (admin Hiring Analytics, migration 204 +
  `lib/hiring/stageDuration.ts`): `requisitions.stage_changed_at` (104)
  only ever held ONE fact — when the CURRENT stage began, overwritten
  on every move — so no per-stage duration had ever been computable
  after the fact; the existing "Time to Hire" metric is the only
  duration this codebase had ever measured, and it spans the whole
  pipeline. **`requisition_stage_history`** is a new, insert-only
  append log, extending the EXISTING `requisition_stage_stamp()`
  trigger (104) in place — re-created, never a parallel mechanism — so
  the one function that already stamps `stage_changed_at` also records
  the transition it just computed; the two can never drift apart.
  Honestly scoped: history starts the day this migration applies, with
  a one-time backfill inserting exactly ONE row per existing
  requisition (its current stage, dated by the `stage_changed_at` it
  already had) rather than a guessed prior transition that was never
  actually recorded. `computeStageDurations()` derives days-to-interview/
  offer/filled from the first transition into each named stage, and an
  average time spent per stage — averaged only across requisitions that
  actually reached each milestone, never treating a non-reaching one as
  zero (the exact "absence of evidence is not a pass/fail, it's absence"
  discipline this codebase applies everywhere else).

### A note on the one item explicitly NOT attempted here

**Operational Exception Detection** (the tenth item) was flagged by
the survey agent as potentially conflicting with this codebase's own
absolute, repeatedly-stated rule: "no AI, no scores, no prediction
anywhere." A literal reading of "exception detection" as statistical/
ML anomaly detection (z-scores, outlier models) would be a genuine,
first-of-its-kind departure from that rule and needs a product
decision before it is built, not a unilateral interpretation — left
for the next pass, to be scoped as deterministic cross-signal
correlation (e.g. several independent, already-computed fixed-
threshold facts co-occurring on the same record) rather than anything
statistical, matching every other "intelligence" feature this codebase
has ever shipped.

### Verified

Migration 204 applied live (via `execute_sql`, statement-by-statement,
after `apply_migration`'s own DDL call timed out — the same persistent,
transient DDL-path issue this file's history already records for
migration 203 twice; `to_regclass()`/`pg_policy`/`information_schema`
read back directly rather than trusting any apply call's own success
response) and live-probed in a rolled-back transaction: a real stage
UPDATE on an existing requisition correctly inserted a new history row,
confirmed rolled back with zero trace afterward. `tsc --noEmit` clean
both apps, full `vitest run` green both apps (1963 admin, 970 portal),
all seven CI guards pass with no regressions (73 shared-dupe pairs;
row-cap clean; 44 unvalidated routes, unchanged; 45 static admin
routes, all reachable — the three new admin routes are all linked from
the sidebar or each other; 101 blind-update chains, unchanged; every
paged query's `.order()` present; 301 unbounded-read chains, unchanged
after converting three newly-added pages from a bare `.select()` to
`readAllPages()`/a narrowly-scoped `.eq()` read from the start), both
production builds compile, including `/briefing`, `/clients/groups`,
`/clients/groups/[parentId]` and the extended `/health-safety/
[companyId]/emergency-plans` and `/hiring/analytics` pages.

---

## Go-live gap list, item 4: Critical Control Visibility (2026-10-02,
## migration 205)

`lib/riskGraph/intelligence.ts`'s `ineffectiveSharedControls` (Phase 8)
already flags an ineffective control relied on by 2+ DISTINCT risk
assessments — but that is a SHARED-exposure signal, not a dedicated "is
every control we rely on for safety actually working" view, and
`controls`/`risk_item_controls` (123) had no safety-critical concept at
all: a control's own `effectiveness` on each use already exists, but
nothing distinguished "this control happens to be ineffective somewhere"
from "this is one of our SAFETY-CRITICAL controls and it has a gap."

- **`controls.safety_critical`** (migration 205): a plain boolean, NOT
  NULL DEFAULT false — the catalogue, the same place
  `training_courses`/`competencies`/`authorisation_types`/`job_roles`
  already carry their own safety-critical flag (Phase 3). Never
  retroactively set on an existing control; a staff/client user ticks it
  explicitly when adding or editing a control.
- **`lib/criticalControls/compute.ts`** (shared-dupe pair,
  `computeCriticalControlVisibility()`): pure, deterministic, computed
  at read time — no stored aggregate, no AI, no score. Groups
  `risk_item_controls` uses by `control_id`, restricted to ACTIVE
  safety-critical controls that are actually relied on by at least one
  assessment (a safety-critical control with zero uses is a catalogue
  entry nobody has applied yet — a different, separately worth-knowing
  fact from "applied, and failing," so it is excluded rather than shown
  as a false "OK"). Each use bands `effective`/`unverified`/`gap`
  (`gap` = `ineffective`/`not_implemented`; `unverified` =
  `verification_required` — the same "unverified is not the same as
  failing" distinction this codebase already draws elsewhere, e.g.
  Evidence Coverage's own `'unverified'` compliance-twin band). A
  control relied on by several assessments takes the WORST band across
  all of them, sorted gap-first.
- **Two dedicated views**, both reading `controls`/`risk_item_controls`/
  `risk_assessment_items`/`risk_assessments` by id list and joining in
  TypeScript — never a chained embed, the standing "fetch by id list"
  rule this codebase has followed since the referral PATCH route's own
  PGRST200 lesson: admin's `/health-safety/<companyId>/critical-controls`
  (a new `HsCompanyTabs.tsx` tab, no new sidebar entry needed — nests
  under the already-linked `/health-safety` prefix) and portal's
  read-only `/protect/critical-controls` (gated by `protect` alone,
  added to `moduleAccess.ts` and the PROTECT `SectionTabs`).
  `CriticalControlsView.tsx` (shared-dupe pair, the
  `ComplianceTwinView.tsx` precedent) is the one presentational
  component both pages render, taking an `raHref: (id) => string`
  callback so each app supplies its own correct per-assessment link
  rather than guessing a shared routing suffix.
- **The one write path, portal's `ItemControls.tsx`** (the existing
  risk-assessment controls panel), gained a "Safety-critical control"
  checkbox on the new-control form and a per-control toggle button
  (`toggleSafetyCritical()`), both plain session writes under
  `risk.create`/`risk.read` RLS — the counted-write discipline
  (`COUNT_EXACT`/`judgeWrite()`) from the start, not retrofitted after
  the blind-updates guard caught it.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green both
apps, all seven CI guards pass with no regressions (the new shared-dupe
pair registered in `scripts/check-shared-dupes.sh`), both production
builds compile, including `/health-safety/<companyId>/critical-controls`
and `/protect/critical-controls`. Migration 205 applied live.

---

## Go-live gap list, item 2: Required Acknowledgement on Broadcasts
## (2026-10-02, migration 206)

`POST /api/broadcast` (admin) raises one `actions` row per company
(`created_by_admin = true`) and sends an email — nothing had ever
recorded whether the recipient actually read or acted on it, the exact
gap `policy_acknowledgements` (103) and `board_assurance_acknowledgements`
(178) already closed for their own artefacts.

- **`broadcast_acknowledgements`** (migration 206): the identical
  shape — insert-only, `UNIQUE (action_id, acknowledged_by)` so the
  same person can never acknowledge the same broadcast twice.
  `company_id`/`acknowledged_by`/`acknowledged_by_name`/
  `acknowledged_at` are ALL derived from the parent action and the
  session by `broadcast_acknowledgements_fill()` (BEFORE INSERT,
  SECURITY DEFINER) — never trusted from the caller, the same
  discipline `board_assurance_acknowledgements_fill()` already uses.
  The trigger also refuses acknowledging an action that was NOT raised
  by a broadcast (`created_by_admin IS NOT TRUE`) — acknowledging a
  message is a genuinely different fact from completing the task an
  ordinary action already has its own "mark complete" lifecycle for,
  and the two must never be conflated.
- **No capability gate, deliberately** — `actions` itself predates the
  Phase 1 capability model and stays a plain company-scoped read/write
  for any signed-in client user; this mirrors that (`company_id =
  my_company_id()`), not the H&S `risk.read`/`risk.create` pair.
- **No outbox entry** — the original broadcast's own `actions.created`
  event and email already told the client; an acknowledgement coming
  BACK needs no automated consequence, only a record staff can read.
- **`AcknowledgeBroadcastButton.tsx`** (portal): the exact
  `RamsAcknowledge.tsx`/`BoardAssuranceAcknowledge.tsx` pattern — a
  plain session insert, with the `23505` duplicate-click case treated
  as already-acknowledged rather than an error. Wired into
  `/protect/actions`' generic (non-safety) `ActionCard`, shown only
  when `action.created_by_admin === true`, alongside the existing
  `ActionButtons`. The page fetches which of the visible broadcast
  actions the signed-in user has already acknowledged in one
  by-id-list read (bounded, `.limit(500)`, matching every other
  by-id-list read in this codebase) rather than per-card.
- **Admin visibility**: `lib/broadcast/rollup.ts`'s
  `groupBroadcastActions()` gained an optional `acknowledgedActionIds`
  parameter — the SAME "pure grouping, data handed in" shape `complete`
  already uses for `status`, never fetched inside the pure function
  itself. `RecentBroadcasts.tsx` gained an "Acknowledged" column
  alongside the existing "Completion" one — a genuinely different fact
  (a client reading a message vs. finishing the task it may also have
  raised), never merged into one count. `/broadcast`'s own page reads
  `broadcast_acknowledgements` for the same 200-action, 90-day buffer
  the actions query already uses, bounded identically.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green both
apps, all seven CI guards pass with no regressions (the new by-id-list
reads on both apps' actions/broadcast pages were built with an explicit
`.limit(500)` from the start, so `check-unbounded-reads.sh`'s ratchet
did not move), both production builds compile. Migration 206 applied
live and verified (RLS enabled, the fill trigger refuses a non-broadcast
action and derives every sensitive field server-side, the write guard
applied, `UPDATE`/`DELETE`/`TRUNCATE` revoked from every session role).

---

## Go-live gap list, item 7: Shareable Reports (2026-10-02, migration 207)

Neither app had any way to hand a report (an uploaded document or a
generated Value Report, both rows on the generic `reports` table) to
an external party — an insurer, an auditor, a regulator — without
giving them a portal or admin login. No code anywhere built this; a
new token table was needed from scratch.

- **`report_share_tokens`** (migration 207): the exact
  `policy_ack_tokens`/`hs_test_tokens`/`worker_qr_tokens` shape — RLS
  on, **no policies at all**, service role only, "fails closed by
  design." Unlike a single-use set-password token, a share link is
  DURABLE (the `worker_qr_tokens` model): the recipient may open it
  more than once before it expires or is revoked. Bounded to a hard
  **90-day maximum lifetime** by the table's own CHECK — never an
  indefinitely-living external link to a client's own document.
  `token_hash` is the primary key, shaped like a SHA-256 hex digest by
  its own CHECK. `rls_policy_audit()` (080, re-tuned 198) is
  re-defined in the same migration to add this table to its existing
  "RLS-on-no-policies is a deliberate, exempted shape" list, alongside
  `entity_qr_tokens`/`worker_qr_tokens` — otherwise the admin `/health`
  page's own RLS panel would report it as a false-positive critical
  finding the moment it shipped.
- **`lib/auth/reportShareTokens.ts`** (shared-dupe pair): the
  mint/peek/touch/revoke/list functions, reusing `hashAccessToken`/
  `normaliseAccessToken` from the existing `accessTokens.ts` — the same
  UUID-token-then-SHA-256 shape every other token table in this
  codebase already uses, never a bespoke format. `listReportShareTokens`
  never returns the raw token OR its full hash — only a 12-hex-char
  **prefix** (48 bits), enough for a "revoke this one" UI action,
  nowhere near enough to help anyone recover the original random token
  (that would mean inverting SHA-256, not guessing from a prefix).
  `revokeReportShareToken` resolves that prefix back to exactly one row
  (bounded `.limit(2)` — only ever needs to tell "exactly one" from
  "more than one") before revoking it, scoped to the report and company
  that created it.
- **Two mint/list/revoke routes**, each the real authorisation
  boundary since the table itself has none: admin's `POST`/`GET`/
  `DELETE /api/admin/reports/<id>/share` (`requireStaff()` — staff may
  share any report) and portal's own `/api/reports/<id>/share`
  (`getSessionProfile()` + `isCompanySuperUser()`, the Phase 28
  consolidated helper — a client's own account admin only, scoped to
  their own company's reports). Both read/write with the service role
  only after the session check passes.
- **The public open page is portal-only**, the same reasoning every
  other no-login link in this codebase already states: whoever holds
  the link has no login on EITHER app. `/report/[token]` (outside the
  `(portal)` route group, the `/policy/[token]`/`/test/[token]` shape)
  + its own server-side preflight `/api/report/[token]` — both added
  to `PUBLIC_ROUTES` in the portal middleware. Signs the underlying
  file via the existing `signFileUrl()`/`documents` bucket path (the
  same `kind: 'report'` mapping `/api/files/sign` already uses for a
  signed-in session), bumps `access_count`/`last_accessed_at`
  best-effort, and never trusts a 404-vs-410 distinction to leak
  whether a report exists — `peekReportShareToken` returns `null` for
  "nothing matches this hash" either way, and `'revoked'`/`'expired'`
  only once a real row is found.
- **`ShareReportButton.tsx`** (shared-dupe pair): a `fixed inset-0`
  modal overlay, not an absolutely-positioned dropdown — the admin
  Reports table's own row wrapper is `card overflow-hidden`, which
  would have silently clipped a dropdown anchored to the row's own
  "Share" button, the exact kind of defect this codebase's own
  discipline exists to catch before it ships, not after. The raw share
  URL is shown exactly once, right after minting, and the component
  never asks for it back. Wired into admin's `/reports` page (every
  report, staff-only) and portal's `/protect/reports` page (only when
  `isCompanySuperUser()`, matching the route's own gate — the button
  is simply not rendered for a plain `client_user`, rather than
  rendering it and letting the route's 403 be the first signal).

Verified: `tsc --noEmit` clean both apps, full `vitest run` green both
apps (the new `reportShareTokensSql.test.ts` plus a new middleware
exemption test case), all seven CI guards pass with no regressions —
two real violations were caught and fixed before this shipped, not
after: `touchReportShareToken`'s access-stat bump had no `{ count:
'exact' }` (fixed, `check-blind-updates.sh`), and
`revokeReportShareToken`'s prefix-lookup `SELECT` had no bound at all
(fixed with `.limit(2)`, `check-unbounded-reads.sh`) — both ratchets
back to their exact baseline after the fix. Both production builds
compile, including `/report/[token]`, `/api/report/[token]`,
`/api/reports/<id>/share` and `/api/admin/reports/<id>/share`.
Migration 207 applied live and verified (table exists, RLS enabled, 0
policies, 0 `rls_policy_audit()` findings for the table, and a full
rolled-back functional probe: a valid insert, a 91-day expiry refused,
a malformed token_hash refused, an overlong recipient_note refused, a
duplicate token_hash refused, and a plain UPDATE revoke proven to work
— 0 leftover rows after rollback).

---

## Go-live gap list, item 8: Continuous Improvement named view (2026-10-02)

"Are we getting better?" had no dedicated answer anywhere — every
existing H&S intelligence surface answers a different question: the
Digital Twin/Core 360 Status/Assurance Today family reports what is
true RIGHT NOW; Incident Pattern Intelligence reports what keeps
happening at a site. Nothing composed audit findings, recurring root
causes and objective progress into one period-over-period trend. No
migration — this is pure composition over three already-live tables
(`audit_findings`, 162; `objectives`, 161; the existing incident/
investigation/cause tables Incident Pattern Intelligence already
reads), reusing `analyzeIncidentPatterns()` VERBATIM for the
root-cause signal rather than re-deriving the same grouping logic a
second time — the "REUSE, never a parallel system" rule this codebase
has followed since Phase 4's own existing-operations audit.

- **`lib/continuousImprovement/analyze.ts`** (new shared-dupe pair,
  79 pairs up from 78): `computeContinuousImprovement()` composes
  `computeAuditFindingsTrend()` (raised/closed per window, plus a
  point-in-time `openNow` unaffected by the window — the exact
  `incidentPatterns`-style distinction between a window-scoped count
  and "what's true right now") and `computeObjectivesSummary()`
  (status breakdown + `healthyPercent`, null — never zero — when there
  are no in-flight objectives, the standing null-vs-zero discipline
  this codebase draws throughout) with `analyzeIncidentPatterns()`'s
  own `recurringRootCauses` output, imported and called directly, not
  copied. `incidentPatternWindows`/`clampWindowDays` are re-exported
  from the same module so both this file's callers and the existing
  Incident Patterns pages share one window-fairness computation.
- **`avgDaysToCloseClosed` is computed only for findings CLOSED in the
  current window**, and is `null` — never `0` — when nothing closed,
  the identical null-vs-zero rule the rest of this codebase already
  applies everywhere a average could otherwise silently read as "zero
  days, fully healthy" for a period with no real data.
- **`healthyPercent` excludes `draft`/`abandoned` from its
  denominator** — neither is currently being pursued, so counting them
  would understate a genuinely on-track portfolio of real, in-flight
  objectives.
- **`ContinuousImprovementView.tsx`** (new shared-dupe pair, 80 pairs):
  the exact `IncidentPatternsView.tsx` precedent — a window picker
  (30/90/365-day quick-picks plus a custom-days form,
  `clampWindowDays`-bounded server-side) and three cards (audit
  findings trend table, recurring root causes list, objective status
  breakdown), no interactivity beyond plain navigation links, so no
  `'use client'` needed. Reported entirely as counts and a
  period-over-period comparison, never a score or a trend LINE drawn
  from fewer than two real data points — no AI anywhere in this view.
- **Admin**: a new `HsCompanyTabs.tsx` tab
  (`/health-safety/<companyId>/continuous-improvement`), nesting under
  the already-linked `/health-safety` prefix, no new sidebar entry
  needed. **Portal**: `/protect/continuous-improvement`, gated by
  `protect` alone (added to `moduleAccess.ts`'s `ROUTE_FLAGS` and the
  PROTECT layout's own tab list) — read-only, the standing PROTECT
  posture that nothing here is self-certified. Both pages read under
  their own normal access path: admin as staff with no row filter
  beyond `company_id`; portal under the signed-in company's own
  session RLS — `audit_findings_client_read` (Phase 4 Group 7) and
  `objectives`' own client-read policy (Phase 5 Group 6, reusing
  `risk.read`) already cover the two tables the Incident Patterns page
  didn't already need, so no service role was required anywhere on
  the portal page.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green both
apps (1996/200 admin, 988/71 portal — the new `analyze.test.ts`, 9
cases, mirrored byte-identical to both), all seven CI guards pass with
no regressions (79 → 80 shared-dupe pairs; row-cap clean; 44
unvalidated routes, unchanged — this item added no new route, only two
pages; 45 static admin routes, all reachable; 101 blind-update chains,
unchanged — this item writes nothing, purely read-only; every paged
query's `.order()` present; 301 unbounded-read chains, unchanged), both
production builds compile, including
`/health-safety/<companyId>/continuous-improvement` and
`/protect/continuous-improvement`. No migration in this item —
entirely TypeScript composition over already-live schema.

---

## Go-live gap list, item 10: Operational Exception Detection (2026-10-02)

The last of the ten items, deliberately left for last: the survey
itself flagged that a literal reading of "exception detection" (z-
scores, outlier models) would be the first genuine departure from this
codebase's own absolute, repeatedly-stated rule — "no AI, no scores,
no prediction anywhere" — and asked for a product decision rather than
a unilateral interpretation. The decision, already recorded in this
file: scope it as **deterministic cross-signal correlation** — several
independent, already-computed, fixed-threshold facts true on the SAME
record at once — never anything statistical. No migration: every
signal is read verbatim from a table/RPC this codebase already
computes correctly on its own terms.

- **`lib/operationalExceptions/analyze.ts`** (new shared-dupe pair, 81
  pairs up from 80): `computeOperationalExceptions()` flags a PERSON
  where 2+ of `{ Safe-to-Deploy status != READY (workforce_matrix,
  Phase 3's own engine), a stale open site check-in (site_checkins,
  the exact "checked in on a previous calendar day and never checked
  out" definition the existing reminders rule already uses) }` are
  true at once, and an ASSET where 2+ of
  `{ quarantined/out_of_service, an overdue inspection
  (next_inspection_due < today — the same threshold lib/hs/kpis.ts
  already uses for equipmentOverdueCount), an isolation still applied
  and not yet verified removed, an issued/suspended permit still
  naming it }` are true at once. The THRESHOLD (2+) is itself fixed
  and named, never tuned or learned. A single flagged fact alone is
  routine and already shown on its own page (the Register, the
  Equipment tab, the workforce dashboard) — what none of them show is
  the SAME record carrying two or more unrelated problems
  simultaneously, which is the actual compound situation worth a
  human's attention right now.
- **Every signal was verified against the live RLS/grant shape before
  being chosen**, not assumed: `workforce_matrix(p_company)` (138)
  explicitly allows `is_tps_staff()` OR the caller's own
  `my_company_id()`; `hs_equipment`/`isolations`/`permits` all carry a
  `staff ALL` policy plus a client policy reusing `asset.read`/
  `contractors.manage` (a plain `client_admin` already holds
  `contractors.manage` via the `organisation_admin` role mapping,
  confirmed against Phase 22's own contractors/permits/isolations
  portal work); `site_checkins` carries `workforce.read`. So both the
  admin page (staff session) and the portal page (the client's own
  session) read every table DIRECTLY — no service role needed
  anywhere, the exact `ConnectionsPanel`/Core 360 Status precedent.
- **Decommissioned assets are excluded at the query level, not
  specially handled in the pure function** — a decommissioned asset
  is a terminal, intentional retirement, never an "exception" to flag,
  and nothing can legally hold an isolation or a live permit against
  one once retired, so there is nothing for the second signal to ever
  attach to regardless.
- **`OperationalExceptionsView.tsx`** (new shared-dupe pair, 82
  pairs): the `ComplianceTwinView`/`Core360StatusView` precedent — a
  plain two-section table (People, Assets), each row showing the
  record's own signal count and the plain-English reason for each one,
  sorted by signal count descending then label ascending for
  determinism. `personHref`/`assetHref` are supplied by the caller,
  since the two apps' own routing for a person or an asset genuinely
  diverges (admin has NO person profile page of its own — the Core
  360 Status "People" domain's own established precedent — so its
  person rows link OUT to the portal's `/lead/workforce/people/<id>`;
  asset rows link to the Equipment tab, with the portal side using
  the existing `#eq-<id>` row anchor that page already carries).
- **Admin**: a new `HsCompanyTabs.tsx` tab
  (`/health-safety/<companyId>/operational-exceptions`). **Portal**:
  `/protect/operational-exceptions`, gated by `protect` alone.

Verified: `tsc --noEmit` clean both apps, full `vitest run` green both
apps (2009/201 admin, 1003/72 portal — the new `analyze.test.ts`, 13
cases, mirrored byte-identical), all seven CI guards pass with no
regressions (80 → 82 shared-dupe pairs; row-cap clean; 44 unvalidated
routes, unchanged; 45 static admin routes, all reachable; 101
blind-update chains, unchanged — this item writes nothing, purely
read-only; every paged query's `.order()` present; 301 unbounded-read
chains, unchanged), both production builds compile, including
`/health-safety/<companyId>/operational-exceptions` and
`/protect/operational-exceptions`. No migration in this item —
entirely TypeScript composition over already-live schema.

---

**The go-live gap list (all ten items) is complete.**

