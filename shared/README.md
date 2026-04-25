# Shared

Cross-app code shared between `admin/` and `portal/`. Imported via the
`@shared/*` TypeScript path alias.

## Why not `packages/shared` with npm workspaces?

The repo currently has three independent Next.js projects (root marketing
site + admin + portal) each with its own `package.json` and lockfile.
Migrating to npm workspaces is a separate concern and was deferred.

This `shared/` directory is the lighter-weight alternative:
- Each app's `tsconfig.json` adds `"@shared/*": ["../shared/*"]` to its
  `paths`.
- Each app's `next.config.mjs` has a webpack alias `@shared` so module
  resolution at build time finds these files.
- Files inside `shared/` are compiled by each app's webpack (no separate
  build step). They CANNOT use `'use client'` directives that depend on
  app-specific React versions; both apps must stay on matching React
  major versions (currently both on 18).

## What lives here

| Path | Purpose |
|-|-|
| `components/ui/AvatarInitials.tsx` | Initial-letter avatar with deterministic colour |
| `components/ui/useModalShell.ts`   | Modal hook: Esc + body lock + focus trap + restore |
| `lib/athletes/validate.ts`         | POST/PATCH validation for athletes |
| `lib/interests/validate.ts`        | Bulk + patch validation for athlete-partner interests |
| `lib/ui/statusMaps.ts`             | Ticket status badge classes + hiring stage labels |

## What stays per-app

- `lib/supabase/server.ts` — uses `next/headers` (App Router only)
- `lib/supabase/client.ts` — uses `next/navigation`
- `lib/supabase/types.ts` — admin and portal each include app-specific
  types (e.g. admin has BD intelligence types, portal has IvyLens types)
- `lib/partners/roleOpportunities.ts` — admin-only (the portal doesn't
  validate role opportunities; it only reads them)
