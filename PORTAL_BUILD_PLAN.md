# The People Office — Portal Build Plan

## Existing Routes & Status

### Portal (`/portal/src/app/(portal)/`)

| Route | File | Status | Notes |
|-------|------|--------|-------|
| `/dashboard` | dashboard/page.tsx | Wired — rebuilt Phase 2D | Active services, friction alerts, live roles, actions |
| `/hiring` | hiring/page.tsx | Wired — rebuilt Phase 2C | Friction badge in table, filter by level |
| `/hiring/new` | hiring/new/page.tsx | Wired — rebuilt Phase 2C | Full intake form + Friction Lens scoring on submit |
| `/hiring/[id]` | hiring/[id]/page.tsx | Wired — rebuilt Phase 2C | FrictionScoreCard, Re-score, candidate tab |
| `/documents` | documents/page.tsx | Wired — rebuilt Phase 3A | Upload, categories, versioning, approval workflow |
| `/actions` | actions/page.tsx | New — Phase 3B | System-generated actions, dismiss/complete |
| `/roadmap` | roadmap/page.tsx | New — Phase 3B | Quarterly milestones across HIRE/LEAD/PROTECT |
| `/support` | support/page.tsx | Wired | Ticket list |
| `/support/new` | support/new/page.tsx | Needs build — Phase 3D | Six service request types |
| `/support/[id]` | support/[id]/page.tsx | Needs build | Ticket detail + reply |
| `/settings` | settings/page.tsx | Wired — rebuilt Phase 3D | Company profile, team invites, notification prefs |
| `/reports` | reports/page.tsx | Wired | Report list, download |

### Admin (`/admin/src/app/(admin)/`)

| Route | File | Status | Notes |
|-------|------|--------|-------|
| `/dashboard` | dashboard/page.tsx | Wired — enhanced Phase 4A | Cross-client stats, service requests, friction alerts |
| `/clients` | clients/page.tsx | Wired | Client table |
| `/clients/new` | clients/new/ | Needs build | Create company + send invite |
| `/clients/[id]` | clients/[id]/page.tsx | Wired — enhanced Phase 4A | 6 tabs including roadmap, services, actions |
| `/hiring` | hiring/page.tsx | New — Phase 4C | All roles across all clients |
| `/roadmap` | roadmap/page.tsx | New — Phase 4C | Admin roadmap editor |
| `/bd-intelligence` | bd-intelligence/page.tsx | New — Phase 4B | IvyLens BD data |
| `/support` | support/page.tsx | Wired | Ticket list |
| `/requests` | requests/page.tsx | New — Phase 4A | Service request inbox |

## Supabase Table → Portal Page Mapping

| Table | Portal Page | Admin Page |
|-------|-------------|------------|
| requisitions | /hiring, /hiring/new, /hiring/[id] | /clients/[id] Tab 2, /hiring |
| candidates | /hiring/[id] | /clients/[id] Tab 2 |
| documents | /documents | /clients/[id] Tab 3 |
| tickets | /support | /support |
| ticket_messages | /support/[id] | /support/[id] |
| compliance_items | /dashboard | /clients/[id] Tab 1 |
| client_services | /dashboard | /clients/[id] Tab 6 |
| actions | /dashboard, /actions | /clients/[id] Tab 5 |
| milestones | /roadmap | /roadmap, /clients/[id] Tab 4 |
| service_requests | /support/new | /requests |
| bd_companies | — (admin only) | /bd-intelligence |
| bd_scanned_roles | — (admin only) | /bd-intelligence |

## Build Order (Priority)

1. **2A** Migrations + TypeScript types + PORTAL_BUILD_PLAN.md ✅
2. **2B** Friction Lens lib (`frictionLens.ts`) + FrictionScoreCard + FrictionAlert ✅
3. **2C** Hiring module (new intake + role detail + roles list)
4. **2D** Dashboard (live data widgets)
5. **3A** Document Centre (upload, versioning, approval)
6. **3B** Actions + Roadmap pages
7. **3C** Candidate review (enhanced hiring/[id])
8. **3D** Settings, service requests, onboarding flow
9. **4A** Admin client management + service request inbox
10. **4B** BD Intelligence table

## Key Architecture Patterns

- Server pages: `createServerSupabaseClient()` from `@/lib/supabase/server` (async RSC)
- Client mutations: `createClient()` from `@/lib/supabase/client`
- Types: `@/lib/supabase/types`
- Portal CSS: `.card`, `.btn-cta`, `.btn-secondary`, `.btn-sm`, `.badge`, `.form-group`, `.label`, `.input`, `.portal-page`, `.empty-state`, `.divider`
- Colors: `var(--purple)`, `var(--teal)`, `var(--blue)`, `var(--pink)`, `var(--surface)`, `var(--surface-alt)`, `var(--line)`, `var(--ink)`, `var(--ink-soft)`, `var(--ink-faint)`, `var(--navy)`
- Layout: `Sidebar` (240px fixed left) + `Topbar` (60px fixed top)

## Friction Lens Integration

- Client: `portal/src/lib/frictionLens.ts` → `scoreFriction(RoleInput): Promise<FrictionScore>`
- Card: `portal/src/components/FrictionScoreCard.tsx` — full breakdown
- Badge: `portal/src/components/FrictionAlert.tsx` — compact inline badge with tooltip
- Stored on `requisitions` table: `friction_score JSONB`, `friction_level TEXT`, `friction_recommendations JSONB`, `friction_scored_at TIMESTAMPTZ`
