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
- **Payments**: Stripe (not yet integrated: needed for e-learning Phase 22)
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

```
# Both apps
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Admin only
SUPABASE_SERVICE_ROLE_KEY=    # for auth admin operations

# Portal only: IvyLens Friction Lens
IVYLENS_API_URL=              # Phase 21: e.g. https://ivylens.yourdomain.com

# Portal only: Manatal ATS integration
MANATAL_API_KEY=              # Phase 29: set in Vercel env vars
MANATAL_API_URL=              # Phase 29: defaults to https://api.manatal.com/open/v1

# Portal only: Stripe (e-learning payments)
STRIPE_SECRET_KEY=            # Phase 18: e-learning purchases
STRIPE_WEBHOOK_SECRET=        # Phase 18
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=  # Phase 18
```

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
bash scripts/check-shared-dupes.sh         # 22 byte-identical pairs across the two apps
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
- **Still open (not this PR):** Next 14.2.4 predates the
  CVE-2025-29927 middleware-bypass fix (14.2.25). Vercel's edge
  mitigates it, so it bites only off Vercel; upgrade in its own PR.

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
