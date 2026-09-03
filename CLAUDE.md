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
user_role:               client_admin | client_user | tps_admin | tps_client | client_editor
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
│       ├── ComplianceStatusButton.tsx
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
bash scripts/check-shared-dupes.sh         # 13 byte-identical pairs across the two apps
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
