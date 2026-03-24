# The People Office — Claude Code Sprint Commands
## Ravello-HR Repo → The People Office

**Rules for every session:**
- No changes to global CSS, layout, fonts, or colour system — Ravello brand stays intact
- New context only: copy, page content, new pages, portal features
- Each phase is sized to complete within one Pro window (2–3 hours of Claude Code work)
- Run `/status` before starting each phase to check remaining allowance
- Commit at the end of every phase before stopping

---

## PRE-SPRINT: Do This Before Day 1

Spend 30 minutes writing answers to these in a file called `SPRINT_CONTEXT.md` in the repo root. Claude Code will read this at the start of every session.

```
Create a file called SPRINT_CONTEXT.md in the repo root with the following content:

# The People Office — Sprint Context

## Business
Name: The People Office
Tagline: Hire. Lead. Protect.
Heading: We hire your people. We lead your function. We protect your business.
Sub-heading: One partner. Total control of your people function.

## Three Pillars
- HIRE: Talent strategy, embedded recruitment delivery, Friction Lens role scoring
- LEAD: Fractional People leadership, manager enablement, people strategy
- PROTECT: HR foundations, documentation, compliance, risk reduction

## Founders
- Lucy: HR/People lead — 18+ years, handles Protect and Lead delivery
- Tom: Talent/Recruitment lead — handles Hire delivery, built Friction Lens and IvyLens

## ICP
- Founder-led SMEs scaling 20–150 staff
- VC/PE-backed businesses post-raise or post-acquisition
- Businesses with no proper People function
- Firms with bad hire history or inconsistent hiring managers

## Friction Lens Dimensions (5)
1. Location — candidate pool density vs commutable distance, remote/hybrid vs market norm
2. Salary — competitiveness vs live market rate for role type and location
3. Skills — stack complexity, rare combinations, must-have vs nice-to-have
4. Working Model — office vs hybrid vs remote vs market expectation for this role type
5. Process — interview stages vs market norm, time-to-fill estimate

## Friction Score Levels
- Low (green): role is well-positioned, proceed to market
- Medium (amber): 1–2 friction points to address, recommended changes given
- High (red): multiple friction points, role needs revision before launch
- Critical (dark red): role will fail to market as-is, strategic review required

## Admin Portal — BD Intelligence Feature
The browser extension (IvyLens) scans job board URLs and captures:
- Company name
- Role title
- Salary (where shown)
- Location
- Working model
- Skills/requirements
- Date scanned
- Source URL

This data should populate a BD Intelligence table in the admin portal showing:
- All companies currently hiring (deduplicated by company name)
- Number of active roles per company
- Role titles listed
- Salary ranges where captured
- Location breakdown
- First seen / last seen dates
- Each row expandable into a modal showing all roles for that company
- Action column: "Add to CRM" button, "Mark as Prospect", "Mark as Client"
- Filterable by: location, sector (if detectable), date range, hiring volume
- This is for Tom's business development — spotting companies actively hiring = potential clients

## Tone of Voice
Direct. Commercial. No fluff. Speaks to founders, not HR administrators.
Plain English. Challenges bad decisions. Evidence-led.
```

Commit this file: `docs: add sprint context for Claude Code sessions`
```

---

---

# DAY 1 — WEDNESDAY

---

## PHASE 1A — Morning Window (5am start)
**Estimated time: 2–2.5 hours**
**Goal: Full site content audit + homepage rewrite**

```
Read SPRINT_CONTEXT.md first. Then do the following:

1. Read every file in src/app/ and src/components/ — understand the full current site structure, all pages, all components. Do not edit anything yet.

2. Create a file called AUDIT.md in the repo root documenting:
   - Every page that exists (route and file path)
   - Current headline/purpose of each page
   - What needs to change for The People Office (content only, no layout/CSS changes)
   - Any pages that need to be created new
   - Any pages that should be removed or repurposed

3. Rewrite the homepage (src/app/page.tsx or equivalent) with The People Office content:
   - Main heading: "We hire your people. We lead your function. We protect your business."
   - Sub-heading: "One partner. Total control of your people function."
   - Tagline visible: "Hire. Lead. Protect."
   - Three pillar section: HIRE / LEAD / PROTECT — each with a short sharp description (3–4 lines max, commercial language, no fluff)
   - CTA buttons pointing to the three conversion funnels
   - Keep all existing layout, components, styling exactly as-is
   - Only change text content and CTA destinations

4. Commit: `content: homepage rewritten for The People Office`
```

---

## PHASE 1B — Mid-Morning (after first reset or continuation)
**Estimated time: 2–2.5 hours**
**Goal: Rewrite the three conversion funnels**

```
Read SPRINT_CONTEXT.md. Read AUDIT.md. Then:

The three conversion funnels in the site are:
- Smart Hiring System funnel → this becomes the HIRE entry funnel
- PolicySafe funnel → this becomes the PROTECT entry funnel
- DealReady People funnel → this stays as a specialist project product (M&A/TUPE work)

For each funnel, rewrite all text content only (no layout, CSS, or structural changes):

HIRE funnel (Smart Hiring System):
- Headline: "Your hiring is broken. We fix it before it costs you."
- Target pain: founders frustrated with agency fees, bad hires, inconsistent hiring managers
- Three outcomes: Better role definition. Faster process. Higher quality hires.
- Introduce Friction Lens: "Before any role goes live, we score it. You see exactly where it will struggle and what to fix."
- CTA: "Start with a Hiring Audit"

PROTECT funnel (PolicySafe):
- Headline: "Get your HR foundations right. Before something goes wrong."
- Target pain: missing contracts, no handbook, compliance exposure, Employment Rights Bill changes
- Three outcomes: Documented. Protected. Ready to scale.
- CTA: "Get a Free HR Audit"

DealReady People funnel:
- Headline: "People due diligence and integration support for M&A and restructures."
- Target: acquirers, founders going through deals, PE-backed businesses
- Keep specialist positioning, not a retainer product
- CTA: "Talk to us about your deal"

Commit: `content: three conversion funnels rewritten for The People Office`
```

---

## PHASE 1C — Afternoon Window
**Estimated time: 2–2.5 hours**
**Goal: Services pages + about/team page**

```
Read SPRINT_CONTEXT.md. Then:

1. Rewrite or create a HIRE services page covering:
   - Hire Foundations: £1,000/month + 10% fee, 3-month minimum
   - Hire Optimiser: £2,500 one-off or £1,500/month x 3, + reduced fee
   - Hire Embedded: £5,000/month, 6-month minimum, fees included in scope
   - Hire Build: £6,500–£8,500+/month, 6-month minimum
   - Each package: who it's for, what's included, why it works
   - No tables — write in plain commercial prose, short sharp paragraphs

2. Rewrite or create a PROTECT services page covering:
   - Protect Essentials: from £495 one-off
   - Protect Core: from £1,200 one-off, optional retainer £500–£750/month
   - Protect Partner: £1,500–£2,500/month
   - Protect Enterprise: bespoke £3,000–£5,000+/month
   - Protect Transaction: from £3,500 one-off project
   - Employment Rights Bill callout: immediate compliance pressure for SMEs

3. Rewrite or create a LEAD services page covering:
   - Lead Foundations: £1,000/month
   - Lead Optimiser: £2,500 one-off or £1,500/month x 3
   - Lead Partner: £3,000–£4,500/month
   - Lead Build: £5,000–£7,500+/month

4. Rewrite the About/Team page:
   - Lucy: HR/People lead, 18+ years, ex-corporate HR, founder of Ravello HR
   - Tom: Talent/Recruitment lead, 10+ years, built Friction Lens and IvyLens, founder of Andrews Recruitment Group
   - Combined positioning: "Not HR with a bit of recruitment. Not recruitment pretending to do HR. A proper blend."
   - No fluffy mission statements. Commercial and direct.

Commit: `content: services pages and about page written for The People Office`
```

---

## PHASE 1D — Evening Window
**Estimated time: 1.5–2 hours (lighter session)**
**Goal: Friction Lens landing page + remaining site pages**

```
Read SPRINT_CONTEXT.md. Then:

1. Create a new Friction Lens page at /friction-lens (or equivalent route):
   - Headline: "Before a role goes live, you should know where it will struggle."
   - Explain the five dimensions: Location, Salary, Skills, Working Model, Process
   - Explain what the score output looks like: Low/Medium/High/Critical
   - Explain recommendations: specific actionable changes before going to market
   - Competitive positioning: "No SME-accessible tool offers this. Enterprise systems like Gartner TalentNeuron charge £50,000+/year. Friction Lens is built into your portal from day one."
   - CTA: "See it in action — raise your first role"

2. Rewrite the contact/enquiry page:
   - Three routes: "I need help hiring" / "I need HR foundations" / "I'm going through a deal"
   - Each route captures relevant context
   - Form confirmation message: direct, no fluff

3. Update the site navigation to reflect new page structure:
   - Services dropdown: Hire / Lead / Protect / Friction Lens
   - About
   - Contact / Get Started

4. Update meta titles, descriptions, and og tags on every page to reflect The People Office brand and positioning.

Commit: `content: Friction Lens page, contact page, navigation updated`
```

---

---

# DAY 2 — THURSDAY

---

## PHASE 2A — Morning Window (5am start)
**Estimated time: 2.5–3 hours**
**Goal: Portal — full audit and Supabase schema mapping**

```
Read SPRINT_CONTEXT.md. Then:

1. Read every file in portal/src/ in full — every page, every component, every lib file, the middleware.

2. Read the full Supabase migration file at supabase/migrations/001_initial_schema.sql in full.

3. Create a file called PORTAL_BUILD_PLAN.md documenting:
   - Every portal route that exists and its current state (wired to real data / UI only / placeholder)
   - Every Supabase table and which portal page it maps to
   - Gaps: portal pages with no data layer
   - Gaps: Supabase tables with no portal UI
   - Priority build order for remaining phases

4. Read portal/src/lib/supabase/ in full — understand the existing Supabase client setup.

5. Generate TypeScript types from the Supabase schema. Create portal/src/types/database.ts with typed interfaces for every table. Use the schema to define:
   - Client/Company type
   - Role type (including friction_score field — add this if not present)
   - Document type
   - Candidate type
   - Action/Task type
   - User/Profile type

6. Check if a friction_score column exists on the roles table. If not, write a new migration file at supabase/migrations/002_add_friction_score.sql that adds:
   - friction_score JSONB (stores the full five-dimension score object)
   - friction_level TEXT (Low/Medium/High/Critical)
   - friction_recommendations JSONB (array of recommendation strings)
   - friction_scored_at TIMESTAMP

Commit: `feat: portal audit complete, TypeScript types, friction score migration`
```

---

## PHASE 2B — Mid-Morning
**Estimated time: 2.5–3 hours**
**Goal: IvyLens API client + Friction Lens integration**

```
Read SPRINT_CONTEXT.md and PORTAL_BUILD_PLAN.md. Then:

1. Create portal/src/lib/frictionLens.ts — the TypeScript client that calls the IvyLens Rust API:

   - Function: scoreFriction(roleData: RoleInput): Promise<FrictionResult>
   - RoleInput type:
     {
       title: string
       location: string
       salary_min: number
       salary_max: number
       skills: string[]
       working_model: 'office' | 'hybrid' | 'remote'
       interview_stages: number
       sector?: string
     }
   - FrictionResult type:
     {
       overall_level: 'Low' | 'Medium' | 'High' | 'Critical'
       overall_score: number (0–100, higher = more friction)
       dimensions: {
         location: { score: number, label: string, explanation: string }
         salary: { score: number, label: string, explanation: string }
         skills: { score: number, label: string, explanation: string }
         working_model: { score: number, label: string, explanation: string }
         process: { score: number, label: string, explanation: string }
       }
       recommendations: string[]
       time_to_fill_estimate: string
     }
   - The API endpoint is the IvyLens Rust API POST /api/role/analyze
   - Add NEXT_PUBLIC_IVYLENS_API_URL to portal/.env.example
   - Handle errors gracefully — if IvyLens API is unavailable, return a fallback object with overall_level 'Unknown' and a message

2. Create portal/src/components/FrictionScoreCard.tsx:
   - Takes a FrictionResult as props
   - Shows overall score level with colour coding (green/amber/red/dark red)
   - Shows five dimension bars — each with score, label, and one-line explanation
   - Shows recommendations list below the score
   - Shows time-to-fill estimate
   - Compact enough to fit in a portal sidebar, expandable to full-width modal
   - Use existing Tailwind classes and component patterns from the codebase — no new CSS

3. Create portal/src/components/FrictionAlert.tsx:
   - A compact badge version of the score for use in tables and lists
   - Shows just the level (Low/Medium/High/Critical) with colour dot
   - Tooltip on hover shows top recommendation

Commit: `feat: Friction Lens API client and score components`
```

---

## PHASE 2C — Afternoon Window
**Estimated time: 2.5–3 hours**
**Goal: Role intake form + role detail page with Friction Lens**

```
Read SPRINT_CONTEXT.md. Read portal/src/app/(portal)/hiring/ in full. Then:

1. Rewrite portal/src/app/(portal)/hiring/new/page.tsx — the role intake form:
   The form should capture:
   - Role title (text)
   - Department/team (text)
   - Location (text + dropdown: On-site / Hybrid / Remote)
   - Salary range: min and max (number inputs)
   - Must-have skills (tag input — comma separated)
   - Nice-to-have skills (tag input)
   - Interview stages (number: 1–6)
   - Reason for hire (dropdown: New headcount / Replacement / Expansion)
   - Urgency (dropdown: ASAP / Within 1 month / Within 3 months)
   - Reporting line (text)
   - Brief role description (textarea, max 500 chars)

   On submit:
   a. Save the role to Supabase roles table with status 'draft'
   b. Call frictionLens.scoreFriction() with the form data
   c. Update the role record with the friction score result
   d. Redirect to the role detail page /hiring/[id]
   e. Show a loading state during the Friction Lens scoring ("Scoring your role against live market data...")

2. Rewrite portal/src/app/(portal)/hiring/[id]/page.tsx — the role detail page:
   - Role header: title, status badge, days open counter
   - Friction Lens score card (FrictionScoreCard component) — prominent at the top
   - Role details section: all fields from intake form
   - "Re-score" button — re-runs Friction Lens if role details change
   - Tabs below: Candidates | Timeline | Notes
   - Candidates tab: placeholder for now (Phase 3 builds this out)
   - Status workflow buttons: Draft → Live → Shortlisting → Interviewing → Offer → Closed

3. Rewrite portal/src/app/(portal)/hiring/page.tsx — the roles list:
   - Table showing all active roles
   - Columns: Role title | Location | Working Model | Days Open | Status | Friction (FrictionAlert badge) | Actions
   - Sort by: Days Open (default), Friction Level, Status
   - Filter by: Status, Friction Level
   - "Raise a New Role" button prominent at top
   - Empty state: "No roles yet. Raise your first role and run it through Friction Lens before going to market."

Commit: `feat: hiring module — role intake, Friction Lens scoring, role detail, roles list`
```

---

## PHASE 2D — Evening Window
**Estimated time: 1.5–2 hours**
**Goal: Dashboard — live data**

```
Read SPRINT_CONTEXT.md. Read portal/src/app/(portal)/dashboard/ in full. Then:

Rewrite the dashboard page with live data from Supabase:

1. Welcome banner: "Good [morning/afternoon/evening], [first name]." — uses time of day and user's name from Supabase auth

2. Active Services panel:
   - Shows which packages the client is currently on (Hire Foundations, Protect Partner, etc.)
   - Pulled from a client_services table — if this doesn't exist yet, create a simple version: client_id, service_name, service_tier, start_date, status
   - If no services yet: "Your services will appear here once your engagement is confirmed."

3. Live Roles widget:
   - Shows all roles with status != 'Closed'
   - Each role shows: title, days open, friction level badge (FrictionAlert)
   - Critical/High friction roles highlighted with amber border
   - "Raise a Role" CTA if no roles

4. Outstanding Actions widget:
   - For now: any roles in 'Draft' status = action "Review and launch this role"
   - Any roles open 30+ days = action "Review progress on [role title]"
   - Empty state: "No actions outstanding. You're up to date."

5. Friction Alerts widget:
   - Any role with friction level 'Critical' or 'High' gets a card here
   - Shows the top recommendation for that role
   - "View Role" link

Commit: `feat: dashboard — live data widgets, friction alerts, active services`
```

---

---

# DAY 3 — FRIDAY

---

## PHASE 3A — Morning Window (5am start)
**Estimated time: 2.5–3 hours**
**Goal: Document Centre**

```
Read SPRINT_CONTEXT.md and PORTAL_BUILD_PLAN.md. Read portal/src/app/(portal)/documents/ in full. Then:

Build a fully functional Document Centre:

1. Document upload:
   - File input accepting: PDF, DOCX, DOC, XLSX, PNG, JPG
   - Category selector: Contracts | Policies | Handbooks | Templates | Role Packs | Meeting Notes | Strategic Plans
   - Name field (auto-populated from filename, editable)
   - Upload to Supabase Storage bucket 'documents'
   - Save metadata to documents table: id, client_id, name, category, file_path, file_size, uploaded_by, uploaded_at, version, status ('active'/'archived'), requires_approval (boolean), approved_at, approved_by

2. Document list view:
   - Grouped by category (collapsible sections)
   - Each document: name, uploaded date, version, status badge, download button, actions menu
   - Actions: Download | Archive | Replace (upload new version) | Request Approval
   - Sort: by date (default), by name, by category
   - Search: client-side search across document names

3. Version history:
   - Each document can have multiple versions
   - "Replace" uploads a new file but retains previous versions as archived
   - Version history accessible via a dropdown on each document row

4. Approval workflow:
   - Documents marked 'requires_approval' show a pending badge
   - Approved documents show a green tick with approved date
   - Admin portal can approve (Phase 4 builds admin side)

5. Empty state: "No documents uploaded yet. Start by uploading your employment contracts or staff handbook."

Commit: `feat: document centre — upload, versioning, categories, approval workflow`
```

---

## PHASE 3B — Mid-Morning
**Estimated time: 2–2.5 hours**
**Goal: Action Centre + People Roadmap**

```
Read SPRINT_CONTEXT.md. Read portal/src/app/(portal)/reports/ and any existing roadmap components. Then:

1. Build Action Centre — add to dashboard as a full section and as its own page at /actions:

   Actions are generated automatically from portal state:
   - Role in 'Draft' for more than 2 days → "Review and launch [role title]"
   - Role open 30+ days with no candidate activity → "Chase update on [role title]"
   - Document with requires_approval = true and not yet approved → "Sign off [document name]"
   - No active services on account → "Confirm your service package with The People Office"

   Each action has:
   - Title and description
   - Related entity link (goes to the role or document)
   - Priority: High / Medium / Low
   - Dismiss button (marks as dismissed, doesn't reappear for 7 days)
   - Complete button (marks as done)

   Store actions state in an actions table: id, client_id, action_type, related_entity_id, related_entity_type, priority, status ('active'/'dismissed'/'complete'), created_at, dismissed_at, completed_at

2. Build People Roadmap page at /roadmap:

   A quarterly view showing progress across all three pillars:

   Structure:
   - Current quarter shown by default, navigation to past/future quarters
   - Three columns: HIRE | LEAD | PROTECT
   - Each column shows milestones for that pillar in the current quarter
   - Milestone states: Not Started | In Progress | Complete | At Risk
   - Each milestone: title, description, owner (Lucy or Tom), due date, status

   Data model — create milestones table:
   id, client_id, pillar (hire/lead/protect), title, description, owner, due_date, status, quarter (e.g. 'Q2-2026'), created_at, updated_at

   For now: milestones are created by admin (Phase 4 builds admin side)
   Client view: read-only roadmap with milestone details on click

   Empty state: "Your people roadmap will be set up during your onboarding call."

Commit: `feat: action centre and people roadmap — live state, quarterly view`
```

---

## PHASE 3C — Afternoon Window
**Estimated time: 2.5–3 hours**
**Goal: Candidate review area**

```
Read SPRINT_CONTEXT.md. Read portal/src/app/(portal)/hiring/[id]/ in full. Then:

Build the Candidates tab within the role detail page:

1. Candidate list for a role:
   - Each candidate card: name, current role/company, date added, stage, overall score (if scored)
   - Stage pipeline: Applied → Reviewed → Shortlisted → Interviewing → Offer → Placed | Rejected
   - Drag or button to move between stages
   - Bulk actions: Reject selected | Move to next stage

   Data model — candidates table:
   id, role_id, client_id, name, current_role, current_company, cv_file_path, linkedin_url, stage, added_at, updated_at, added_by, status

2. Individual candidate view (modal or expand):
   - CV download button
   - Scorecard: five criteria (to be defined per role, for now: Cultural Fit | Technical Skills | Communication | Experience | Motivation) each scored 1–5 by the hiring manager
   - Feedback notes (rich text, saved to Supabase)
   - Decision buttons: Shortlist | Hold | Reject — with mandatory one-line reason for Reject
   - Interview notes tab: date, interviewer, notes, outcome
   - Offer status: Not Made | Verbal | Written | Accepted | Declined

3. Candidate comparison view:
   - Select 2–3 candidates from the list
   - Side-by-side comparison: scorecard scores, stage, notes summary
   - Accessible from a "Compare" button on the candidate list

4. CV upload (admin side — adds candidates to a role):
   - For now, add a placeholder "Upload Candidate" button that shows "Your consultant will add candidates to this role."
   - Full CV upload by admin built in Phase 4

Commit: `feat: candidate review — pipeline, scorecard, feedback, comparison`
```

---

## PHASE 3D — Evening Window
**Estimated time: 1.5–2 hours**
**Goal: Settings, support, and client onboarding flow**

```
Read SPRINT_CONTEXT.md. Read portal/src/app/(portal)/settings/ and portal/src/app/(portal)/support/ in full. Then:

1. Settings page:
   - Company profile: name, industry, headcount range, website, primary contact name/email
   - Team members: invite by email (sends Supabase auth invite), list current members, remove member
   - Notification preferences: email alerts for new candidates, friction alerts, action reminders (checkboxes stored in user preferences)
   - Save all settings to Supabase

2. Support / Service Request Centre page:
   Six clearly labelled request buttons, each opens a short form:
   - "Raise a New Role" → goes to /hiring/new
   - "Request a Policy Update" → form: which policy, what change needed, urgency
   - "Request Salary Benchmark" → form: role title, location, level
   - "Request Manager Support" → form: situation description, urgency
   - "Book a Strategic Review" → form: preferred dates (3 options), topics to cover
   - "Request HR Audit" → form: company size, current HR setup, main concerns
   All forms save to a service_requests table and send a notification email to Tom/Lucy

3. First-login onboarding flow:
   Check if user has completed onboarding (onboarding_completed boolean on profile)
   If not completed, show a 4-step guided flow:
   - Step 1: Complete your company profile (links to settings)
   - Step 2: Raise your first role and run it through Friction Lens
   - Step 3: Upload your first document (employment contract or handbook)
   - Step 4: Book your onboarding call with The People Office
   Progress tracker visible at top. Can be dismissed and resumed. Mark complete when all 4 steps done.

Commit: `feat: settings, service requests, first-login onboarding flow`
```

---

---

# DAY 4 — SATURDAY

---

## PHASE 4A — Morning Window (5am start)
**Estimated time: 2.5–3 hours**
**Goal: Admin portal — client management and role oversight**

```
Read SPRINT_CONTEXT.md and PORTAL_BUILD_PLAN.md. Read admin/ directory in full — every file, every page, every component. Then:

Build the core admin portal functionality:

1. Admin dashboard (admin home page):
   - Total active clients count
   - Total live roles across all clients
   - Roles by friction level: counts of Low/Medium/High/Critical across all clients
   - Roles open 30+ days (ageing alert)
   - Outstanding service requests (unread)
   - Clients with no active roles (potential check-in needed)
   - Recent activity feed: last 10 actions across all clients

2. Client management page /admin/clients:
   - Table: Client name | Industry | Headcount | Active services | Live roles | Last active | Actions
   - Actions per client: View Portal | Edit Details | Add Service | Suspend Account
   - "Add New Client" button — creates company + sends invite email to primary contact
   - Click into a client goes to their full client view

3. Individual client view /admin/clients/[id]:
   - Tab 1: Overview — same as the client's own dashboard but read-only, with admin add/edit capability
   - Tab 2: Roles — all roles for this client, with friction scores, admin can add/edit candidates
   - Tab 3: Documents — all client documents, admin can upload and approve
   - Tab 4: Roadmap — admin can create/edit milestones for this client
   - Tab 5: Actions — admin can create actions for this client
   - Tab 6: Services — which packages they're on, start/end dates, notes

4. Service request inbox /admin/requests:
   - All service requests from all clients
   - Filter by: type, client, status (New/In Progress/Complete)
   - Mark as In Progress, Complete, add response notes
   - Email notification to client when status changes

Commit: `feat: admin portal — client management, client detail view, service request inbox`
```

---

## PHASE 4B — Mid-Morning
**Estimated time: 2.5–3 hours**
**Goal: Admin portal — BD Intelligence table (IvyLens extension data)**

```
Read SPRINT_CONTEXT.md. This phase builds the BD Intelligence feature fed by the IvyLens browser extension.

The IvyLens browser extension scans job board pages and sends structured data to Supabase. Build the admin-side view of this data for Tom's business development.

1. First, create the Supabase migration for BD intelligence data:
   Create supabase/migrations/003_bd_intelligence.sql:

   -- Companies table (deduplicated from scanned job data)
   CREATE TABLE bd_companies (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     company_name TEXT NOT NULL,
     company_name_normalised TEXT NOT NULL, -- lowercase, trimmed for dedup
     first_seen_at TIMESTAMPTZ DEFAULT NOW(),
     last_seen_at TIMESTAMPTZ DEFAULT NOW(),
     total_roles_seen INTEGER DEFAULT 0,
     status TEXT DEFAULT 'prospect', -- prospect | contacted | client | not_relevant
     notes TEXT,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- Individual roles scanned per company
   CREATE TABLE bd_scanned_roles (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     company_id UUID REFERENCES bd_companies(id) ON DELETE CASCADE,
     role_title TEXT NOT NULL,
     salary_min INTEGER,
     salary_max INTEGER,
     salary_text TEXT, -- raw salary string as scraped
     location TEXT,
     working_model TEXT,
     skills TEXT[], -- array of skill strings
     source_url TEXT NOT NULL,
     source_board TEXT, -- 'linkedin' | 'indeed' | 'reed' | 'totaljobs' | 'cv-library' | 'other'
     date_posted TEXT,
     scanned_at TIMESTAMPTZ DEFAULT NOW(),
     still_active BOOLEAN DEFAULT TRUE,
     raw_data JSONB -- full scraped payload for reference
   );

   -- Index for performance
   CREATE INDEX idx_bd_companies_normalised ON bd_companies(company_name_normalised);
   CREATE INDEX idx_bd_scanned_roles_company ON bd_scanned_roles(company_id);
   CREATE INDEX idx_bd_scanned_roles_scanned_at ON bd_scanned_roles(scanned_at);

2. Create the BD Intelligence page at /admin/bd-intelligence:

   Main table — one row per company:
   Columns:
   - Company Name (clickable — opens company modal)
   - Active Roles (count of still_active roles)
   - Total Roles Seen (all-time)
   - Role Titles (show first 3 with "+N more" if more)
   - Salary Range (min–max across all active roles, shown as "£X – £Y")
   - Locations (distinct locations, show first 2 with "+N more")
   - First Seen
   - Last Seen
   - Status badge (Prospect / Contacted / Client / Not Relevant)
   - Actions column: three buttons — "View Roles" (opens modal) | "Mark as Prospect" | "Add Note"

   Table features:
   - Sort by: Last Seen (default) | Active Roles | Company Name | First Seen
   - Filter by: Status | Location (text search) | Date range (last 7 / 30 / 90 days / all time) | Hiring volume (1 role / 2–5 roles / 5+ roles)
   - Search: live search across company name
   - Pagination: 25 per page

3. Company detail modal (opens when clicking company name or "View Roles"):
   
   Modal header:
   - Company name
   - Status badge with inline change dropdown
   - Notes field (inline edit and save)
   - "This could be a client" insight: if company has 3+ active roles = show amber flag "Active hiring — potential Hire Foundations or Hire Embedded client"

   Modal body — roles table:
   - Role Title
   - Salary (formatted)
   - Location
   - Working Model
   - Skills (comma-separated tags)
   - Source Board (LinkedIn / Indeed / etc.)
   - Scanned Date
   - Status (Active / Expired)
   - Source URL (external link icon)

   Modal footer:
   - "Mark as Client" button — sets status to 'client', shows prompt "Add them to the client portal?"
   - "Add to CRM note" button — opens a text field to add a BD note
   - "Dismiss Company" button — sets status to 'not_relevant'

4. BD Summary stats bar above the table:
   - Total companies tracked
   - Total active roles across all companies
   - New companies this week
   - Companies with 5+ roles (high-priority prospects)

Commit: `feat: admin BD Intelligence — companies table, roles modal, prospect management`
```

---

## PHASE 4C — Afternoon Window
**Estimated time: 2.5–3 hours**
**Goal: Admin portal — hiring oversight + roadmap management**

```
Read SPRINT_CONTEXT.md. Then:

1. Admin hiring overview /admin/hiring:
   - All live roles across all clients in one table
   - Columns: Client | Role Title | Location | Working Model | Days Open | Friction Level | Candidates | Stage | Actions
   - Friction level column uses FrictionAlert component
   - Rows sorted by: Critical friction first, then days open descending
   - Filter: by client, by friction level, by stage
   - Ageing alert: rows with 30+ days open shown with amber left border
   - Click into a role → goes to that client's role detail page

2. Admin roadmap management /admin/roadmap:
   - All clients listed with their current quarter roadmap status
   - Per client: progress bar showing milestones complete / in progress / not started
   - Click into a client → shows their roadmap editor
   - Roadmap editor:
     - Add milestone: pillar (Hire/Lead/Protect), title, description, owner (Lucy/Tom), due date, status
     - Edit existing milestone status
     - Reorder milestones within a pillar (drag or up/down arrows)
     - Quarter navigation: set milestones for Q2, Q3, Q4 2026

3. Admin candidate management:
   - Add to the admin client view (Tab 2 — Roles): ability to upload a CV against a role
   - CV upload: PDF/DOCX → Supabase Storage → creates candidate record linked to role
   - Auto-populates candidate name from filename if possible
   - Stage set to 'Applied' on creation
   - Client sees candidate appear in their portal immediately

Commit: `feat: admin — hiring overview, roadmap editor, candidate upload`
```

---

## PHASE 4D — Evening Window
**Estimated time: 1.5–2 hours**
**Goal: Browser extension data pipeline to BD Intelligence**

```
Read SPRINT_CONTEXT.md. Read the browser-extension/ directory in full — background.js, content.js, popup.js, popup-bd.js, manifest.json. Then:

The extension currently sends data to the IvyLens Supabase instance. 
Configure it to also write to The People Office Supabase instance's bd_scanned_roles and bd_companies tables.

1. Update popup-bd.js (BD scanning mode):
   When a scan completes and data is extracted from the job board page:
   a. Parse the scraped data into the bd_scanned_roles format:
      - company_name: extract from page
      - role_title: extract from page
      - salary_min / salary_max: parse from salary string
      - salary_text: raw salary string
      - location: extract from page
      - working_model: detect 'remote'/'hybrid'/'on-site' keywords in text
      - skills: extract from requirements section
      - source_url: window.location.href
      - source_board: detect from URL pattern (linkedin.com → 'linkedin', indeed.com → 'indeed', etc.)
   b. POST this data to The People Office Supabase instance via REST API
   c. The Supabase upsert logic:
      - Normalise company name (lowercase, trim, remove Ltd/Limited/PLC)
      - Check if company exists in bd_companies by normalised name
      - If exists: update last_seen_at, increment total_roles_seen
      - If not exists: create new company record
      - Insert role into bd_scanned_roles with the company_id

2. Add VITE_TPO_SUPABASE_URL and VITE_TPO_SUPABASE_ANON_KEY to the extension's config/env handling

3. Update popup.html and popup-bd.html — subtle branding addition:
   - Add a small "Powered by The People Office" text at the bottom of the BD mode popup
   - Keep the IvyLens primary branding intact (extension still serves IvyLens too)

4. Update manifest.json:
   - Add The People Office Supabase domain to host_permissions if not already present

Commit: `feat: browser extension — BD scan data writes to TPO Supabase BD intelligence tables`
```

---

---

# DAY 5 — SUNDAY

---

## PHASE 5A — Morning Window (5am start)
**Estimated time: 2.5–3 hours**
**Goal: Admin portal — insights dashboard + reporting**

```
Read SPRINT_CONTEXT.md. Then:

Build the admin insights and reporting section:

1. Admin insights page /admin/insights:

   Section 1 — Hiring Health (across all clients):
   - Average time to shortlist (days from role creation to first candidate added)
   - Average time to fill (days from role creation to Placed stage)
   - Friction score distribution: pie chart or bar — % Low / Medium / High / Critical
   - Most common friction dimension: which dimension causes the most High/Critical scores
   - Roles at risk: open 45+ days with no recent candidate activity

   Section 2 — Client Health:
   - Client engagement score: based on portal logins in last 30 days, documents uploaded, roles raised
   - Clients not logged in for 14+ days: list with "chase" note
   - Upcoming quarterly reviews due (based on service start dates)

   Section 3 — Document Activity:
   - Documents uploaded this month (total and per client)
   - Documents awaiting approval

   All numbers are real data from Supabase. Use simple numeric displays — no chart libraries needed, just well-formatted numbers with context labels.

2. Exportable client report:
   Add a "Generate Report" button on the individual client view (/admin/clients/[id]):
   - Generates a simple HTML summary page (print-friendly) showing:
     - Client name and service summary
     - Roles this quarter: raised, in progress, filled
     - Friction scores summary
     - Documents added this quarter
     - Roadmap progress
     - Outstanding actions
   - Opens in new tab for printing/saving as PDF
   - Do not use any PDF library — just a clean print-optimised HTML page with inline styles

Commit: `feat: admin insights dashboard + printable client report`
```

---

## PHASE 5B — Mid-Morning
**Estimated time: 2–2.5 hours**
**Goal: Auth flow + client invite + email notifications**

```
Read SPRINT_CONTEXT.md. Read portal/src/app/auth/ and portal/src/middleware.ts in full. Then:

1. Verify the full auth flow works correctly:
   - /auth/login: email + password login, redirects to /dashboard on success
   - /auth/signup: not public-facing (clients are invited, not self-sign-up). If someone hits /signup, redirect to the marketing site contact page
   - /auth/invite: handles the Supabase auth invite link — sets password, completes profile, redirects to onboarding flow
   - /auth/reset-password: password reset flow
   - /auth/callback: Supabase OAuth callback handler
   - Middleware: protect all /portal routes, redirect unauthenticated to /auth/login

2. Client invite flow from admin:
   When admin clicks "Add New Client" and enters their email:
   a. Create company record in Supabase
   b. Create user profile linked to company
   c. Send Supabase auth invite email
   d. The invite email should say:
      Subject: "Your People Office portal is ready"
      Body: "Hi [name], Tom and Lucy at The People Office have set up your client portal. Click below to set your password and get started. Your first step: raise a role and run it through Friction Lens to see exactly where it will struggle before going to market."
      CTA: "Access Your Portal"

3. Notification emails — set up Supabase Edge Function or use Resend API:
   Create portal/src/lib/notifications.ts with functions for:
   - notifyClientNewCandidate(clientId, roleId, candidateName): email to client primary contact
   - notifyAdminServiceRequest(requestId, clientName, requestType): email to Tom
   - notifyClientFrictionAlert(clientId, roleId, frictionLevel): email if role scores Critical
   - All emails: plain text, direct, no fluff. Subject lines are short and specific.
   Add RESEND_API_KEY (or equivalent) to .env.example

Commit: `feat: auth flow verified, client invite, notification emails`
```

---

## PHASE 5C — Afternoon Window
**Estimated time: 2.5–3 hours**
**Goal: End-to-end QA across all routes**

```
Read SPRINT_CONTEXT.md. Then systematically test every user journey:

For each journey below, read the relevant code and fix any bugs found:

JOURNEY 1 — New client onboarding:
- Admin creates client → invite email sent → client clicks link → sets password → lands on onboarding flow → completes company profile → raises first role → Friction Lens scores it → client sees score and recommendations

JOURNEY 2 — Role lifecycle:
- Client raises role → Friction Lens scores it → role shows in list with friction badge → admin adds candidate → client reviews candidate → client scores candidate → client shortlists → candidate moves to interview → offer made → role marked Placed

JOURNEY 3 — Document lifecycle:
- Client uploads document → categorised → appears in Document Centre → admin approves → client sees approved status

JOURNEY 4 — BD Intelligence:
- Extension scans a job board URL → data appears in admin BD Intelligence table → admin opens company modal → admin marks as prospect → admin adds note → admin views all roles for that company

JOURNEY 5 — Admin oversight:
- Admin logs in → sees dashboard with all client metrics → navigates to a specific client → reviews their hiring health → creates a roadmap milestone → views their documents → responds to a service request

For each journey: fix any broken links, missing data connections, or error states that don't handle gracefully.

Document any items that cannot be fixed in this session in a file called KNOWN_ISSUES.md.

Commit: `fix: QA pass — all journeys tested, bugs fixed, known issues documented`
```

---

## PHASE 5D — Evening Window
**Estimated time: 1.5–2 hours**
**Goal: Production deployment prep**

```
Read SPRINT_CONTEXT.md. Then:

1. Environment variable audit:
   Create a DEPLOYMENT_CHECKLIST.md file listing every environment variable needed across:
   - Marketing site (root .env)
   - Client portal (portal/.env)
   - Admin portal (admin/.env)
   - Browser extension
   
   For each variable: what it is, where to get it, which services it connects to.

2. Vercel configuration:
   Verify vercel.json (or next.config.mjs) is correctly configured for:
   - Marketing site deployment from root
   - Portal deployment from /portal subdirectory
   - Admin deployment from /admin subdirectory
   - All three can be deployed as separate Vercel projects from the same repo

3. Supabase production checklist:
   Create a SQL file at supabase/PRODUCTION_SETUP.sql with comments listing:
   - All migrations to run in order (001, 002, 003)
   - RLS policies to enable on each table
   - Storage buckets to create (documents, cvs)
   - Storage policies (authenticated users can upload to their own client bucket)
   - Email templates to configure in Supabase Auth

4. Final README update:
   Rewrite README.md to reflect The People Office:
   - What the repo contains (marketing site + client portal + admin portal)
   - Local dev setup for each application
   - Environment variables required
   - Deployment instructions
   - IvyLens integration setup

Commit: `docs: deployment checklist, production setup guide, README updated`
```

---

---

# POST-SPRINT: First Client Onboard Command

Run this after you have a real client ready to onboard:

```
Read SPRINT_CONTEXT.md. Then:

I am about to onboard the first real client. Their details are:
- Company name: [INSERT]
- Primary contact name: [INSERT]
- Primary contact email: [INSERT]
- Services they are starting with: [INSERT e.g. "Hire Foundations + Protect Core"]
- Their approximate headcount: [INSERT]

Please:
1. Verify the admin "Add New Client" flow works correctly
2. Walk me through creating their account step by step
3. Check that the invite email will send correctly
4. Confirm the onboarding flow they'll see on first login is correct for their service package
5. Create their first roadmap milestone: "Onboarding Call with The People Office" — due [INSERT DATE] — pillar: all three — status: In Progress
```

---

---

# NOTES FOR TOM

**Before starting Day 1:**
1. Create `SPRINT_CONTEXT.md` as described in the Pre-Sprint section
2. Decide the Friction Lens weighting for Working Model and Process dimensions (30 minutes, just write down what you consider High friction for each — e.g., "5-day office mandate in a hybrid market = High on Working Model")
3. Have your Supabase project URL and anon key ready
4. Have your IvyLens Rust API production URL ready
5. Set up extra usage in Claude.ai settings with a £75 cap — you may need it on Days 2 and 4 which are the heaviest token sessions

**Each session:**
- Start with `/status` to check remaining allowance
- Pass `SPRINT_CONTEXT.md` at the start of every new Claude Code session: `Read SPRINT_CONTEXT.md before starting.`
- If you hit the limit mid-phase, note exactly where you stopped and start the next session with: `Read SPRINT_CONTEXT.md. Continue from where the last session stopped. The last commit was: [paste commit message].`

**The BD Intelligence table (Phase 4B) is the most commercially valuable feature outside of Friction Lens.** Every company the extension scans is a potential client. A company with 5+ active roles and no People function is exactly the ICP described in the business model. This table turns the extension from a data collection tool into a live business development engine.

**Do not change:**
- Global CSS
- Tailwind config colours or fonts
- Layout components or page structure
- Anything in the Ravello HR design system

**Only change:**
- Text content
- Page-level copy
- New pages and new components
- Data connections and API integrations
- New Supabase tables and migrations
