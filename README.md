# Ravello HR — Platform

Three Next.js apps deployed as separate Vercel projects from a single monorepo.

| App | Directory | Domain |
|---|---|---|
| Marketing site | `/` (repo root) | `ravellohr.co.uk` |
| Client portal | `/portal/` | `portal.ravellohr.co.uk` |
| Admin panel | `/admin/` | `admin.ravellohr.co.uk` |

---

## Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Auth & Database:** Supabase (`@supabase/ssr`)
- **Deployment:** Vercel (multi-project monorepo)

---

## Vercel Deployment Setup

Each app is deployed as a **separate Vercel project** pointing to the same GitHub repository with a different root directory.

### Marketing Site

1. Create a new Vercel project → import `TomAndrewsRecGroup/Ravello-HR`
2. **Root Directory:** leave blank (repo root)
3. **Framework Preset:** Next.js
4. Add domain: `ravellohr.co.uk`
5. No Supabase env vars needed for the marketing site

### Client Portal

1. Create a new Vercel project → import `TomAndrewsRecGroup/Ravello-HR`
2. **Root Directory:** `portal`
3. **Framework Preset:** Next.js
4. Add domain: `portal.ravellohr.co.uk`
5. Set environment variables (see below)

### Admin Panel

1. Create a new Vercel project → import `TomAndrewsRecGroup/Ravello-HR`
2. **Root Directory:** `admin`
3. **Framework Preset:** Next.js
4. Add domain: `admin.ravellohr.co.uk`
5. Set environment variables (see below)

---

## Environment Variables (Portal & Admin)

Add these in Vercel → Project → Settings → Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Find these in your Supabase dashboard → Project Settings → API.

The `SUPABASE_SERVICE_ROLE_KEY` is optional — only needed for elevated server-side operations that bypass RLS.

---

## Supabase Setup

### 1. Run the migration

Copy the contents of `supabase/migrations/001_initial_schema.sql` and run it in the **Supabase SQL Editor** (Dashboard → SQL Editor → New query).

This creates:
- All tables: `companies`, `profiles`, `requisitions`, `candidates`, `documents`, `tickets`, `ticket_messages`, `reports`, `compliance_items`
- All enums: `hiring_stage`, `ticket_status`, `doc_category`, `user_role`
- RLS policies and helper functions (`my_company_id()`, `is_ravello_staff()`)
- Triggers for `updated_at` timestamps

### 2. Create the documents storage bucket

In Supabase Dashboard → Storage → New bucket:
- **Name:** `documents`
- **Public:** No (private)

### 3. Create the first admin user

1. In Supabase Dashboard → Authentication → Users → Invite user (use your Ravello email)
2. After the user signs up, run this in the SQL Editor to grant admin role:

```sql
UPDATE profiles 
SET role = 'ravello_admin' 
WHERE email = 'your@email.com';
```

### 4. Generate TypeScript types (once connected)

```bash
npx supabase gen types typescript --project-id <your-project-id> \
  > portal/src/lib/supabase/types.ts

# Copy the same file to admin
cp portal/src/lib/supabase/types.ts admin/src/lib/supabase/types.ts
```

Then update `portal/src/lib/supabase/client.ts` and `server.ts` to import and use the `Database` type instead of `any`.

---

## Local Development

### Marketing site
```bash
npm install
npm run dev
# → http://localhost:3000
```

### Portal
```bash
cd portal
cp .env.example .env.local
# Fill in Supabase values in .env.local
npm install
npm run dev
# → http://localhost:3001
```

### Admin
```bash
cd admin
cp .env.example .env.local
# Fill in Supabase values in .env.local
npm install
npm run dev
# → http://localhost:3002
```

---

## Architecture Notes

### Auth & Sessions

Both portal and admin use `@supabase/ssr` with cookie-based sessions for SSR compatibility. Middleware runs on every request to refresh the session token.

### Role-Based Access

| Role | Access |
|---|---|
| `client_admin` | Full portal access for their company |
| `client_user` | Portal access (read-only where relevant) |
| `ravello_staff` | Full admin panel access |
| `ravello_admin` | Full admin panel access + elevated ops |

Admin middleware (`admin/src/middleware.ts`) enforces `ravello_admin` or `ravello_staff` role — any other role is redirected to `/auth/unauthorised`.

### Feature Flags

Feature flags are stored as JSONB on each `companies` row:

```json
{
  "hiring": true,
  "documents": true,
  "reports": false,
  "support": true,
  "metrics": false,
  "compliance": false
}
```

Toggle them live via the admin panel → Feature Flags page. Portal sidebar shows/hides modules based on the client's flags.

### Hiring Pipeline Stages

`submitted → in_progress → shortlist_ready → interview → offer → filled → cancelled`

### Candidate Visibility

Candidates are only visible to clients when `approved_for_client = true`. The admin controls this — clients cannot see unapproved candidates.

---

## Project Phases

| Phase | Status | Description |
|---|---|---|
| 1 | ✅ Done | Marketing homepage rebuild |
| 2 | ✅ Done | Design system (CSS variables, tokens) |
| 3 | ✅ Done | Core marketing pages (About, Contact, How It Works, Services) |
| 4 | ✅ Done | Client portal MVP (`/portal`) |
| 5 | ✅ Done | Portal advanced features (hiring detail, candidate feedback, compliance) |
| 6 | ✅ Done | Admin system (`/admin`) — clients, users, hiring, documents, support, feature flags |
