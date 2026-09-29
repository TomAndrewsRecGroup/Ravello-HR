# Core-OS 360 Phase 8: Risk Graph & Connected Compliance Intelligence — Plan

No detailed operator brief exists in the repo for this phase (unlike
Phases 1-3, which had a `_PLAN.md`, and Phase 5's `_GOVERNANCE_MAP.md`)
— this plan is derived from the phase's own name in the working task
list, and grounded entirely in what the codebase ALREADY has, per the
platform's own standing "REUSE/EXTEND, never a parallel system" rule.

## What already exists (checked, not assumed)

- **`hs_links`** (migration 122, Phase 2 Group 1) is already, in its
  own header comment, "the Risk Graph's foundation — relationships as
  rows, not free text": a typed `(from_type, from_id, relation,
  to_type, to_id)` edge table, both ends checked to belong to the same
  organisation (`hs_links_check()`), RLS'd to staff-all / read+write
  under `risk.read`/`risk.create`/`incident.investigate`/
  `hazard.manage`, write-guarded. **It has sat unused as anything but a
  per-record "linked items" list since Phase 2** — five portal pages
  (`RaLinks.tsx`, `IncidentLinks.tsx`, `RamsCoshhLinks.tsx`, the hazard
  and COSHH detail pages) each show ONE record's direct links; nothing
  anywhere TRAVERSES the graph beyond one hop, and nothing surfaces a
  cross-cutting insight from the connections themselves.
- **`hs_entity_table()`/`hs_entity_company()`** (122, extended by 11
  later migrations) is the generic "which table, which organisation"
  resolver every polymorphic link/evidence feature in this codebase
  already shares. Its LATEST definition (174) is missing four entity
  types that exist and have a `company_id` column but were never wired
  in: `permit` (152), `isolation` (153), `emergency_plan` (154),
  `management_review` (161) — each added to its own migration without
  anyone circling back to this shared resolver. A genuine, checked gap,
  not a guess.
- **No graph traversal, no cross-entity intelligence dashboard, and no
  admin equivalent of the portal's per-record link panels exist
  anywhere in either app.**

## Scope for this phase

1. **Group 1 (migration 177): Risk Graph foundation.** Extend
   `hs_entity_table()` with the four missing types (additive only,
   regression-tested against every prior branch). Add
   `risk_graph_neighbors(p_type, p_id, p_depth)` — a `SECURITY INVOKER`
   recursive-CTE function walking `hs_links` in BOTH directions up to a
   capped depth, returning `(type, id, relation, hop, direction)`.
   `SECURITY INVOKER` is deliberate and non-negotiable, the exact
   `search_records()` rule already states: it can never return a row
   the caller's own RLS would refuse them directly, because every
   underlying read runs AS the caller. Depth and row-count are both
   hard-capped in the function itself, not left to the caller, the same
   discipline `readAllPages()`/the CI row-cap guard apply everywhere
   else in this codebase.
2. **Group 2 (no migration): Connected Compliance Intelligence.** Pure,
   deterministic, no-AI read-time functions
   (`lib/riskGraph/intelligence.ts`) computing insights ONLY the graph
   of connections can produce and that no single-entity view already
   shows: hazards with no risk-assessment coverage; approved risk
   assessments with no linked evidence or control; a control's own
   reuse count across risk assessments (a single point of failure, made
   visible); applicable legal obligations with no risk assessment or
   evidence link at all; and safety-critical clusters — an asset or
   contractor carrying BOTH a major/critical audit finding AND an open
   incident or active risk assessment naming it. No stored aggregate,
   no score, no significance judgement — the same posture
   `lib/hs/kpis.ts`/`lib/governance/kpis.ts` already take, extended to
   connection-shaped questions those modules never asked.
3. **Group 3 (no migration): UI.** Admin gets a per-record "Connections"
   panel (reusable, generic — the one thing the five existing portal
   link panels each reimplemented independently) plus a Risk Graph
   explorer and a Connected Compliance Intelligence dashboard, both
   under the existing `/health-safety/<companyId>` prefix (no new
   sidebar entry, the established precedent). Portal gets a read-only
   equivalent under `/protect`, gated by `protect` alone — nothing here
   is self-certified, the standing H&S posture.
4. **Group 4: regression, adversarial QA, handover.**

## What this phase deliberately does NOT do

- **No portfolio-wide (consultancy) RLS is added to `hs_links` or the
  new graph function.** Unlike Phases 6-7, nothing about "Risk Graph &
  Connected Compliance Intelligence" as a phase NAME implies a
  cross-client capability — it is squarely a single-tenant deepening of
  data Core-OS 360 already collects per client. `hs_links`' existing
  `my_company_id()`-scoped RLS (staff-in-client-workspace, or a client's
  own session) already covers every reader this phase's UI targets. If
  a later phase needs a consultant to browse a client's risk graph
  without switching in, that is an explicit, separate decision for that
  phase to make and document — not assumed here.
- **No new relationship vocabulary.** `hs_links.relation` already
  accepts any `^[a-z_]{2,40}$` value with `'related'` as the only value
  any existing writer actually sends; this phase does not invent a
  curated set of relation types, since nothing in scope needs one.
