# Phases 15–20: HIRE Section

> Read CLAUDE.md first for full project context, conventions, and file structure.
> Branch: `claude/review-peoples-office-docs-faDg8`
> Commit and push after every phase.

---

## Phase 15 — Full Requisition Workflow

**Goal**: Upgrade the requisition raise process from a basic form to a proper workflow with approval states, JD templates, and richer fields.

### DB migration: `supabase/migrations/004_requisition_workflow.sql`
```sql
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS working_model TEXT; -- 'remote'|'hybrid'|'on-site'
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS benefits TEXT[];
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS interview_stages TEXT[]; -- e.g. ['Screening call','Technical','Final']
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS target_start_date DATE;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS headcount INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS jd_templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title       TEXT NOT NULL,
  department  TEXT,
  description TEXT,
  must_haves  TEXT[],
  benefits    TEXT[],
  created_by  UUID REFERENCES auth.users(id)
);
```

### Admin: JD Templates page
- **File**: `admin/src/app/(admin)/hiring/templates/page.tsx` — server component, fetches `jd_templates`
- **File**: `admin/src/app/(admin)/hiring/templates/TemplatesClient.tsx` — client component
  - List of templates with title, department, created date
  - "+ New Template" button opens inline create form
  - Each template has "Edit" (inline) and "Delete" buttons
  - "Use Template →" button navigates to `/hiring/new?template=ID`

### Admin: New Role Form updates
- **File**: `admin/src/app/(admin)/hiring/new/AdminNewRoleForm.tsx` — update existing
  - Add `working_model` select (Remote / Hybrid / On-site)
  - Add `target_start_date` date input
  - Add `headcount` number input (default 1)
  - Add `benefits` textarea (comma-separated → stored as array)
  - Add `interview_stages` — a dynamic list where user can add/remove stage names
  - Add template selector at top: dropdown of `jd_templates`, selecting one pre-fills title/description/must_haves
  - On submit: include all new fields

### Admin: Requisition detail updates
- **File**: `admin/src/app/(admin)/hiring/[id]/page.tsx` — update existing
  - Show `working_model`, `target_start_date`, `headcount`, `benefits` in role details panel
  - Show `interview_stages` as ordered list

### Admin: Approve requisition
- In `RequisitionPanel.tsx` add an "Approve Role" button (shown when stage is `submitted`)
  - Sets `approved_at = now()`, `approved_by = user.id`, advances stage to `briefing`
  - Shows approved timestamp + approver once done

### Portal: Role raise form updates
- **File**: `portal/src/app/(portal)/hiring/new/page.tsx` — update existing (if exists) or create
  - Add same new fields: working_model, target_start_date, headcount, benefits, interview_stages

---

## Phase 16 — CV Upload & Screening

**Goal**: Admins can upload CVs against candidates; CVs are viewable in admin. Screening notes per candidate.

### DB migration: `supabase/migrations/005_cv_screening.sql`
```sql
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cv_file_path TEXT;  -- Supabase Storage path
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cv_file_name TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS screening_score INTEGER; -- 1-10 manual score
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS screening_notes TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS screened_at TIMESTAMPTZ;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS screened_by UUID REFERENCES auth.users(id);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source TEXT; -- 'direct'|'linkedin'|'referral'|'agency'|'job_board'
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'applied';
-- stage: 'applied'|'screening'|'interviewing'|'offer'|'hired'|'rejected'
```

### Supabase Storage bucket
- Create bucket `cvs` (private) via migration or note in comments
- Path convention: `cvs/{requisition_id}/{candidate_id}/{filename}`

### Admin: CV Upload component
- **File**: `admin/src/components/modules/CVUpload.tsx` — new client component
  - File input (PDF only, max 10MB)
  - Uploads to Supabase Storage `cvs` bucket
  - On success: updates `candidates.cv_file_path` and `cv_file_name`
  - Shows upload progress, existing file name with "Replace" option
  - "View CV" button generates signed URL (60min) and opens in new tab

### Admin: Candidate screening panel
- **File**: `admin/src/app/(admin)/hiring/[id]/page.tsx` — update existing
  - Candidates table: add CV upload cell, screening score (1–10 stars or number input), screening notes textarea
  - Each candidate row expandable to show full screening form
  - "Screen" button saves score + notes + sets screened_at

### Admin: Candidates list page
- **File**: `admin/src/app/(admin)/candidates/page.tsx` — new server component
  - All candidates across all requisitions
  - Columns: name, email, requisition title, company, source, stage, screening score, CV
  - Filter by stage, company, requisition
  - **File**: `admin/src/app/(admin)/candidates/CandidatesClient.tsx`

### Admin sidebar: add Candidates link
- **File**: `admin/src/components/layout/AdminSidebar.tsx` — add `{ href: '/candidates', label: 'Candidates', icon: Users2 }`

---

## Phase 17 — Interview Management

**Goal**: Track interviews per candidate — schedule, interviewer, outcome, feedback.

### DB migration: `supabase/migrations/006_interviews.sql`
```sql
CREATE TABLE IF NOT EXISTS interviews (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  requisition_id  UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  stage_name      TEXT NOT NULL,          -- 'Screening call' | 'Technical' | 'Final' etc
  interviewer     TEXT,                   -- free text name
  scheduled_at    TIMESTAMPTZ,
  duration_mins   INTEGER DEFAULT 60,
  format          TEXT,                   -- 'video'|'phone'|'in-person'
  outcome         TEXT,                   -- 'pending'|'pass'|'fail'|'no-show'
  feedback        TEXT,
  rating          INTEGER,                -- 1-5
  completed_at    TIMESTAMPTZ
);
```

### Admin: Interview panel on requisition detail
- **File**: `admin/src/app/(admin)/hiring/[id]/InterviewsPanel.tsx` — new client component
  - Fetches interviews for this requisition
  - Groups by candidate name
  - Add interview button: opens inline form (stage name, interviewer, scheduled_at datetime, format, duration)
  - Each interview card: shows stage, interviewer, date, format
  - Outcome dropdown: Pending / Pass / Fail / No Show
  - Feedback textarea + rating stars (1-5)
  - "Mark Complete" button sets completed_at

### Admin: Requisition detail page
- **File**: `admin/src/app/(admin)/hiring/[id]/page.tsx` — update
  - Add `interviews` to parallel fetch
  - Add InterviewsPanel to right column below RequisitionPanel

### Portal: Interview schedule view
- **File**: `portal/src/app/(portal)/hiring/page.tsx` — update existing
  - For each requisition section, show upcoming interviews (where `outcome = 'pending'` and `scheduled_at` is future)
  - Show: stage name, date, format, interviewer name
  - No edit ability — read only

---

## Phase 18 — Offer Management

**Goal**: Generate and track job offers per candidate through to acceptance/rejection.

### DB migration: `supabase/migrations/007_offers.sql`
```sql
CREATE TABLE IF NOT EXISTS offers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  requisition_id  UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  salary          INTEGER NOT NULL,           -- pence
  job_title       TEXT NOT NULL,
  start_date      DATE,
  contract_type   TEXT,                       -- 'permanent'|'fixed-term'|'contract'
  benefits_summary TEXT,
  additional_notes TEXT,
  status          TEXT NOT NULL DEFAULT 'draft', -- 'draft'|'sent'|'accepted'|'declined'|'withdrawn'
  sent_at         TIMESTAMPTZ,
  responded_at    TIMESTAMPTZ,
  decline_reason  TEXT,
  created_by      UUID REFERENCES auth.users(id)
);
```

### Admin: Offer creation + tracking
- **File**: `admin/src/app/(admin)/hiring/[id]/OffersPanel.tsx` — new client component
  - "Create Offer" button (shown when candidate stage = 'interviewing' or later)
  - Form: salary (£), job title (pre-filled from requisition), start date, contract type, benefits summary, notes
  - Offer card shows all details + status badge
  - Status actions: "Mark Sent" → "Mark Accepted" / "Mark Declined" (with decline reason textarea)
  - "Withdrawn" option always available
  - When accepted: updates candidate `stage = 'hired'` and requisition `stage = 'filled'`

### Admin: Requisition detail page update
- **File**: `admin/src/app/(admin)/hiring/[id]/page.tsx`
  - Add `offers` to parallel fetch
  - Render OffersPanel in right column

### Portal: Offer status visibility
- **File**: `portal/src/app/(portal)/hiring/page.tsx` — update
  - For candidates with offers, show offer status badge (Sent / Accepted / Declined)
  - No salary details shown — just status

---

## Phase 19 — Hiring Analytics Dashboard

**Goal**: Admin-side analytics page for full hiring funnel visibility.

### Admin: Hiring analytics page
- **File**: `admin/src/app/(admin)/hiring/analytics/page.tsx` — new server component
- **File**: `admin/src/app/(admin)/hiring/analytics/HiringAnalyticsClient.tsx` — new client component

**Fetch in parallel**:
```tsx
const [reqs, candidates, interviews, offers] = await Promise.all([
  supabase.from('requisitions').select('*, companies(name)'),
  supabase.from('candidates').select('*'),
  supabase.from('interviews').select('*'),
  supabase.from('offers').select('*'),
]);
```

**Stats row** (6 cards):
- Total active roles
- Total candidates in pipeline
- Avg time-to-hire (days from requisition created_at to offer accepted)
- Offer acceptance rate (accepted / sent)
- Interview pass rate (pass outcomes / total completed)
- Roles filled this month

**Charts** (use `BarRow` style from portal metrics — percentage bars, no chart library):
- Stage funnel: submitted → briefing → sourcing → screening → interviewing → offer → filled
- Candidate source breakdown (direct / linkedin / referral / agency / job_board)
- Requisitions by company (top 10)
- Offers by status (draft / sent / accepted / declined / withdrawn)
- Interview outcomes (pass / fail / no-show / pending)
- Monthly hires trend (last 6 months bar chart)

**Filter**: by company (dropdown), by date range (last 30/60/90 days / all time)

### Admin: Hiring page link
- **File**: `admin/src/app/(admin)/hiring/page.tsx` — add "Analytics →" link in topbar actions alongside "+ New Role"

---

## Phase 20 — E-Learning Admin Upload

**Goal**: TPO staff can upload e-learning content (video, PDF, PPTX) with metadata, pricing, and publish controls.

### DB migration: `supabase/migrations/008_elearning.sql`
```sql
CREATE TABLE IF NOT EXISTS courses (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title            TEXT NOT NULL,
  description      TEXT,
  creator          TEXT NOT NULL,    -- author/presenter name
  category         TEXT NOT NULL,    -- 'hiring'|'lead'|'protect'|'compliance'|'management'|'wellbeing'|'other'
  tags             TEXT[],
  content_type     TEXT NOT NULL,    -- 'video'|'pdf'|'presentation'|'link'
  file_path        TEXT,             -- Supabase Storage or Vercel Blob path
  file_name        TEXT,
  file_size        BIGINT,
  external_url     TEXT,             -- for 'link' type
  thumbnail_path   TEXT,
  duration_mins    INTEGER,          -- video duration or estimated read time
  price_pence      INTEGER NOT NULL DEFAULT 0,   -- 0 = free
  published        BOOLEAN NOT NULL DEFAULT FALSE,
  published_at     TIMESTAMPTZ,
  view_count       INTEGER NOT NULL DEFAULT 0,
  purchase_count   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS course_purchases (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  purchased_by    UUID NOT NULL REFERENCES auth.users(id),
  stripe_session_id TEXT,
  amount_paid     INTEGER,           -- pence
  expires_at      TIMESTAMPTZ NOT NULL,  -- purchased_at + 7 days
  UNIQUE(course_id, company_id)
);
```

### Storage
- Use Supabase Storage bucket `courses` for PDF/PPTX files
- Use Supabase Storage bucket `course-thumbnails` for thumbnail images
- Video files: use Vercel Blob (larger files) — store URL in `external_url` or `file_path`
- Note in code comments: `// Large video files should use Vercel Blob; PDFs/PPTXs use Supabase Storage`

### Admin: Courses management page
- **File**: `admin/src/app/(admin)/courses/page.tsx` — server component
  - Fetches all courses ordered by `created_at DESC`
  - Stats: total courses, published count, total purchases, total revenue
  - **File**: `admin/src/app/(admin)/courses/CoursesClient.tsx` — client component
    - Table: thumbnail, title, creator, category, type, price, published status, views, purchases
    - "Publish / Unpublish" toggle per row
    - "+ Upload Course" button opens `CourseUploadPanel`
    - "Edit" opens inline edit form

### Admin: Course upload panel
- **File**: `admin/src/components/modules/CourseUploadPanel.tsx` — new client component
  - Fields:
    - Title (required)
    - Description (textarea)
    - Creator / Presenter name
    - Category (select: Hiring / Lead / Protect / Compliance / Management / Wellbeing / Other)
    - Tags (comma-separated input → stored as array)
    - Content type (select: Video / PDF / Presentation / Link)
    - File upload OR external URL (shown based on content type)
    - Thumbnail upload (image)
    - Duration (number input, minutes)
    - Price (£ input — 0 for free)
    - Publish immediately toggle
  - File upload: uploads to Supabase Storage `courses` bucket, stores path
  - Thumbnail: uploads to `course-thumbnails` bucket
  - On save: inserts to `courses` table
  - Shows upload progress bar

### Admin sidebar
- **File**: `admin/src/components/layout/AdminSidebar.tsx`
  - Add `{ href: '/courses', label: 'E-Learning', icon: GraduationCap }`
