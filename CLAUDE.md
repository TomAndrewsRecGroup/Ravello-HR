# Ravello HR — Claude Code Context

## Project Overview

**Ravello HR** is a two-app HR SaaS platform built for **The People Office** (TPO), an HR consultancy. TPO's clients are SME companies who access a client portal; TPO's internal staff use an admin portal to manage those clients.

- **Admin app** — internal TPO staff only. Manage clients, BD pipeline, hiring, compliance, service requests.
- **Portal app** — client companies. See their hiring pipeline, compliance, actions, documents, support, metrics.

---

## Architecture

```
/home/user/Ravello-HR/
├── admin/          # Next.js 14 app — internal TPO admin
├── portal/         # Next.js 14 app — client portal
├── supabase/
│   └── migrations/ # SQL migration files
└── CLAUDE.md
```

Both apps share a single **Supabase** project (same DB, same auth).

---

## Tech Stack

- **Framework**: Next.js 14 App Router (server components for data, client components for interactivity)
- **Database**: Supabase (PostgreSQL + RLS + Auth)
- **Storage**: Supabase Storage (files/documents) — Vercel Blob available for large video
- **Styling**: Tailwind CSS + CSS custom properties (no component library)
- **TypeScript**: strict throughout
- **Icons**: lucide-react
- **Payments**: Stripe (not yet integrated — needed for e-learning Phase 22)
- **Deployment**: Vercel Pro

---

## Key Conventions

### Server vs Client components
```tsx
// Server component — data fetching (default)
export default async function Page() {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase.from('table').select('*');
  return <ClientComponent data={data} />;
}

// Client component — interactivity
'use client';
export default function ClientComponent({ data }: Props) { ... }
```

### Parallel data fetching (always do this — no waterfalls)
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

// Admin operations (invite users etc) — service role key
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

Both apps use CSS custom properties. Always use these — never hardcode colours.

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
.card            — white rounded card with border
.btn-cta         — purple gradient primary button
.btn-secondary   — bordered secondary button
.btn-ghost       — transparent ghost button
.btn-icon        — square icon button
.btn-sm          — small size modifier
.input           — form input / select / textarea
.label           — form field label
.table-wrapper   — scrollable table container
.table           — styled table
.badge           — inline status pill
.empty-state     — centered empty state block
.portal-page     — portal main content padding
font-display     — Plus Jakarta Sans (headings)
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
| `profiles` | Auth users. Has `company_id`, `email`, `full_name`, `role` (enum: `ravello_admin`, `ravello_recruiter`, `client_admin`, `client_viewer`, `client_user`) |
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
```sql
hiring_stage: submitted | briefing | sourcing | screening | interviewing | offer | filled | cancelled
candidate_client_status: pending | shared | approved | rejected
user_role: ravello_admin | ravello_recruiter | client_admin | client_viewer | client_user
doc_category: contract | policy | handbook | compliance | report | other
ticket_status: open | in_progress | resolved | closed
ticket_priority: low | normal | high | urgent
```

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
│   │   └── invite/route.ts      # POST — creates auth user + profile
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

Scoring system for requisitions. Scores 0–100 on 5 dimensions:
- `location` — remote/hybrid score better
- `salary` — above-market scores better
- `skills` — fewer must-haves scores better
- `working_model` — flexibility score
- `process` — stage/speed score

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

# To be added
STRIPE_SECRET_KEY=            # Phase 22 — e-learning purchases
STRIPE_WEBHOOK_SECRET=        # Phase 22
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=  # Phase 22
```

---

## Git

- **Branch**: `claude/review-peoples-office-docs-faDg8`
- **Remote**: `origin`
- Always commit with descriptive messages referencing the phase
- Always `git push -u origin claude/review-peoples-office-docs-faDg8` after each phase

---

## What Has Been Built (Phases 1–14)

| Phase | What |
|-------|------|
| 1–4 | Project scaffold, auth, Supabase setup, design system |
| 5 | Portal dashboard, sidebar with feature flags, topbar |
| 6 | Admin clients list + detail page with tabs (Overview, Roles, Documents, Roadmap, Services) |
| 7 | Portal hiring page (requisitions, friction score display, candidate feedback) |
| 8 | Candidate pipeline tab in admin client detail; Actions tab with priority/due date |
| 9 | Compliance tracker — admin tab + portal `/compliance` page with status advancement |
| 10 | Admin requisition detail page `/hiring/[id]` with RequisitionPanel (friction, stage select, recruiter) |
| 11 | Notification badges in portal sidebar; Admin `/hiring/new` with full role form + friction scoring |
| 12 | User invite panel (admin); Users management page with inline role editing; Dashboard link fix |
| 13 | Portal `/metrics` analytics page — 6 stat cards, hiring/candidate/compliance/support/documents/actions breakdowns |
| 14 | BD "Convert to Client" full flow in BDCompanyModal; service request response notes in admin; portal support page shows service requests with response notes |

---

## Patterns to Follow When Continuing

1. **Always read a file before editing it**
2. **Server components fetch data, pass to client components as props**
3. **All fetches in parallel via Promise.all**
4. **Use CSS vars — never hardcode hex colours**
5. **New portal sidebar items need adding to both `Sidebar.tsx` and the counts map if they need badges**
6. **New feature-flag-gated pages check `flags.X === false` not `!flags.X`**
7. **New DB tables go in a new migration file in `supabase/migrations/`**
8. **Commit and push after every phase**
