# Core-OS 360 Phase 9: "What Changed?" Daily Operational Intelligence — Plan

No detailed operator brief exists in the repo for this phase (the same
situation Phase 8 was in) — scope is derived from the phase's own name
in the working task list, grounded in what the codebase already has.

## What already exists (checked, not assumed)

- **`platform_events`** (096) is already an append-only outbox recording
  every create/update/delete across 51+ tables (`TRIGGERED_ENTITIES`),
  with a per-table column whitelist and `occurred_at`/`company_id`/
  `entity_type`/`event_type` on every row. It has existed since
  2026-09-25 purely as automation fuel — the ONE consumer is
  `/api/cron/process-events`, which claims rows and runs consequence
  rules. **Nothing anywhere renders this table as a human-readable
  narrative.** The one existing UI reading it (`/automation`, admin) is
  a cross-client OPERATIONS view of the queue itself (pending/failed
  counts, Jev stats) — not a per-client "what happened yesterday"
  summary, and explicitly staff-only, cross-tenant by design.
- **`platform_events` RLS is staff-only SELECT**
  (`platform_events_staff_read`, `is_tps_staff()`) — a client session
  cannot read it at all under RLS. Building a client-facing version
  would need a service-role-mediated read (the same pattern the portal
  Legal Register page already uses for the staff-only `legal_
  requirements` catalogue) — real, buildable work, but a second surface
  this phase does not need to build to deliver its core value.

## Scope for this phase

**Deliberately scoped to STAFF (admin), not client-facing, for this
first pass** — "Daily Operational Intelligence" reads as an internal
ops need (staying on top of client accounts day to day), matching the
existing internal-tooling precedent (`/automation`, `/health`,
`/tasks`) more than a client-facing product surface. A portal version
is real, disclosed future work (see the handover's technical debt
section), not silently dropped.

1. **Group 1 (no migration): the pure computation.**
   `lib/whatChanged/compute.ts` — given a day's `platform_events` rows
   for ONE organisation, groups by `entity_type` and `event_type`
   (created/updated/deleted), and produces a categorised, human-
   readable change list. Deterministic, no AI, no stored aggregate —
   the exact posture every KPI/intelligence module in this codebase
   already takes. `platform_events` already carries everything needed;
   no schema change.
2. **Group 2 (no migration): admin UI.** A new "What Changed" tab on
   the existing per-client detail page (`ClientDetailTabs.tsx`) — the
   cross-pillar per-client home already used for Overview/Roles/
   Documents/Roadmap/HR, the natural place for a cross-pillar daily
   summary, rather than nesting it under the H&S-specific `/health-
   safety/<companyId>` prefix, which would undersell how far
   `platform_events` actually spans (HIRE/LEAD/PROTECT/Governance/
   Consultancy alike). A date picker looks back up to 30 days, one day
   at a time.
3. **Group 3: regression, adversarial QA, handover.**

## What this phase deliberately does NOT do

- **No portal/client-facing page.** Real future work, not silently
  dropped — see above.
- **No emailed daily digest.** The existing digest (07:00, pending
  notifications) and weekly-summary (Monday, H&S) crons already cover
  scheduled push; adding a THIRD, genuinely different "yesterday's
  changes" email is real scope (recipient logic, an opt-in preference,
  claim-before-send) that would roughly double this phase's size for a
  delivery mechanism the brief's own name ("What Changed?") does not
  strictly require — an on-demand page answers the question asked.
- **No Jev narrative layer.** The deterministic list (counts + short
  descriptions per entity type) is a complete, honest answer to "what
  changed" on its own; a one-paragraph Jev summary on top would be a
  real enhancement for a LATER pass, not required to deliver this
  phase's own name.
- **No exhaustive hand-labelled vocabulary for all 51+ table names.**
  A curated label map covers the ~20 most operationally interesting
  entity types (hazards, risk assessments, incidents, actions,
  requisitions, candidates, offers, documents, compliance items,
  audits, permits, isolations, emergency plans, environmental *,
  contractors, training records, service requests, absence records,
  performance reviews); everything else falls back to a generic
  humaniser (underscores to spaces, trailing "s" stripped) — readable,
  never crashes on an unlisted table, disclosed rather than silently
  incomplete.
