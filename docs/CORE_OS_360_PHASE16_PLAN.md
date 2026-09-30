# Core-OS 360 Phase 16: Cross-Client Lessons Learned Network

No detailed operator brief exists in the repo for this phase (the same
situation Phases 8-15 were in). Scope derived from the phase's own name
plus a careful audit of what already exists, before deciding what is
genuinely missing.

## What already exists, and why it is not this feature

- **`hs_incidents`/`incident_investigations`/`incident_causes`** (125)
  and **`audit_findings`** (162) already record, per client, what went
  wrong and why. Nothing anywhere takes what was learned at ONE client
  and puts it in front of OTHERS — every one of these tables is
  strictly per-company RLS, by design (an incident is that client's own
  legal record).
- **`lib/incidentPatterns/analyze.ts`** (Phase 10) aggregates incidents
  WITHIN one client, never across clients — and correctly refuses to
  ("no prediction... a real inspectable count behind it"), because
  cross-client comparison of raw incident data would itself be a
  cross-tenant leak.
- **`hs_sector_packs`/`hs_audit_templates`** (106, 110) are the closest
  existing precedent for "staff-authored content, distributed to
  clients" — but both are seeded ONCE as generic reference material,
  never DERIVED from a specific client's real incident. Neither has a
  "where did this come from" traceability field, because neither
  needs one.
- **Broadcast** (`/broadcast`) pushes ACTIONS (things to DO) to
  multiple clients at once. A lesson learned is something to READ, not
  an action item — the wrong shape to force onto that table.

**The gap**: nothing turns a real incident/finding at Client A into an
anonymised, generalised lesson that Client B (who never had that
incident) can benefit from. This is squarely a STAFF-CURATION feature,
never automatic — the raw incident stays exactly where it is (private
to Client A); a human writes a NEW, deliberately generalised summary,
and ONLY that summary is ever shown to anyone else.

## The one absolute rule

**No client-identifying detail of the SOURCE client ever reaches
another client.** A lesson's `summary`/`recommended_action` fields are
staff-written free text — this is explicitly NOT an AI-drafting
feature (Jev cannot write free text at all, and even if it could,
generating anonymised prose from a specific incident record risks
leaking exactly the detail this feature exists to strip out). The
`source_type`/`source_id` traceability field pointing back at the real
incident/finding is STAFF-ONLY, never selected in any client-facing
read, and never appears in any notification or the portal UI at all.

## Scope, and what is deliberately left out

- **Staff-wide, not per-consultancy-portfolio.** Phase 6 built a
  portfolio-scoped access model for THIRD-PARTY consultancies (Laws
  Safety) working a limited client subset. This feature is simpler and
  broader: Core OS 360's own internal staff (`is_tps_staff()`) already
  see every client, and a lesson learned at one client is exactly the
  kind of cross-client knowledge the whole PLATFORM should be able to
  circulate, not one consultancy's own book of business. A
  portfolio-scoped variant (a consultancy publishing lessons only to
  ITS OWN clients) is a documented, straightforward future extension —
  nothing here blocks it, since distribution is already per-company —
  but is not built in this phase.
- **No AI-authored content, anywhere.** Jev is used for exactly one
  thing in this phase: a deterministic-adjacent DISTRIBUTION aid is
  NOT even Jev-based — it is a plain, non-AI sector-match suggestion
  (`lib/lessonsLearned/suggestDistribution.ts`), because "which clients
  share this client's sector" is a fact, not a judgement call, and
  needs no model at all. Jev is not used in Group 1; if a later group
  finds a genuine noul-shaped use (e.g. "is this incident likely
  generalisable"), it will be added and documented as its own decision
  kind, never a text-generation shortcut.
- **No new capability.** Distribution and reading are both plain
  company-scoped RLS with no capability gate, the exact `hs_documents`/
  `hs_sector_packs` precedent (staff `ALL`, client `SELECT` own company
  only) — a lesson is read-only content, not a register a client acts
  on.

## Delivery

3 groups, the established discipline: migration → live probe → SQL-shape
test → pure computation → TS/UI → tsc/vitest/CI guards/builds clean →
CLAUDE.md → commit → PR → merge → next group.

- **Group 1**: schema (`lessons_learned`, `lesson_learned_distributions`,
  `lesson_learned_reads`) + triggers/RLS + the pure, non-AI
  `suggestDistribution.ts` sector-match helper.
- **Group 2**: admin UI (author/curate/publish, from scratch or from a
  real incident/audit finding, with distribution selection) + portal UI
  (read-only list + mark-as-read) + the publish notification (direct
  synchronous `notify()` calls from the publish route, the established
  `lib/bd/score.ts`/H&S Tests precedent for a route that already holds
  the data a consequence rule would otherwise have to re-derive from an
  outbox event with no single company_id to key on).
- **Group 3**: regression, adversarial QA (cross-tenant leakage of
  `source_id`/other companies' distribution and read rows, RLS proven
  live), handover, CLAUDE.md, merge.

**Phase 17 is NOT to begin** until this phase is fully merged and
deployed, per the operator's standing instruction.
