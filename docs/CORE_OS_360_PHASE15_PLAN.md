# Core-OS 360 Phase 15: Intelligent RAMS — Plan

No detailed operator brief exists in the repo for this phase (the same
situation Phases 8-14 were in). Scope derived from the phase's own name
plus a careful audit of what the codebase already has.

## What already exists

RAMS (Risk Assessment Method Statement) is already a fully-built
workflow (migration 124): `method_statements` — draft → pending_review
→ changes_requested → approved → active → superseded/archived,
versioned, templated, linked to hazards/risk assessments via `hs_links`,
acknowledged on-site (`rams_acknowledgements`). Its narrative content
lives in `sections`, a JSONB object with exactly 20 fixed keys
(`hs_rams_sections_valid()`'s own CHECK), each a free-text string:
`purpose, scope, location, work_sequence, responsibilities,
plant_equipment, materials, ppe, access_egress, site_setup,
exclusion_zones, lifting_arrangements, isolations,
environmental_controls, emergency_arrangements, waste_disposal,
supervision, communication, competency_requirements, permits_required`.

## What "Intelligent" cannot mean here

Jev (`lib/jev/`) answers exactly three question shapes — `noul`
(yes/no probability), `choice` (pick one from a fixed option list),
`score` (rank against ordered labels) — and nothing else. Its own
header comment states this as the reason it is the one model this
platform calls at all: "a probability over a fixed option list is
checkable, loggable and cheap; a paragraph is none of those." **Jev
cannot draft, summarise or write the free-text content of a RAMS
section.** Any design for this phase that has Jev "write the method
statement" does not fit the platform's own AI architecture and is not
what gets built.

## What this phase builds instead

A narrow, genuinely useful nudge: given a DRAFT RAMS's `title`,
`project_name` and `scope_of_work` (already typed by the author before
this feature exists), Jev answers one `noul` question per CONDITIONAL
section — is this section likely to need real, specific content for
THIS job, not just "not applicable" — and the author sees which
sections are worth a second look before submitting for review. It never
writes into a section, never blocks submission, never saves anything on
its own.

- **Only the CONDITIONAL sections are asked about**: `lifting_
  arrangements, isolations, environmental_controls, exclusion_zones,
  waste_disposal, permits_required` — each tied to a recognisable
  real-world condition (lifting equipment, energy isolation, an
  environmental/waste impact, excluding others from an area, a
  permit-to-work requirement). The other 14 sections apply to virtually
  every method statement regardless of the work described (purpose,
  scope, responsibilities, ppe, supervision, communication,
  competency_requirements, emergency_arrangements, location,
  work_sequence, materials, plant_equipment, access_egress, site_setup)
  — asking Jev about them would be a near-constant "yes" that tells the
  author nothing.
- **No schema change.** `sections` already holds every field this
  suggestion touches; a suggestion is UI-only (a "worth a check" list
  next to the form), recorded only in the existing generic
  `jev_decisions` table via the existing `askJev()` — no new table.
- **A lower gate than a classification decision** (0.6, vs.
  `doc_type_suggest`'s 0.8) — a false positive here costs a glance at
  an irrelevant section; a false positive on a CHOICE is a wrong
  answer outright. Documented, not accidental.
- **Never auto-acts, never added to `AUTO_ACT_KINDS`.** A RAMS is a
  legally-relevant document; every suggestion is reviewed by the human
  author before anything is saved.
- **No hazard-category invention, no new vocabulary.** The 20 section
  keys and their labels already exist (`lib/hs/safetyVocab.ts`'s
  `RAMS_SECTION_KEYS`/`RAMS_SECTION_LABELS`) and are reused verbatim —
  never a parallel list that could drift.

## Delivered in 3 groups

1. **Pure computation + route**: `lib/hs/ramsSectionQuestions.ts`
   (the conditional-section subset, the noul questions, state framing,
   the suggestion filter), `rams_section_suggest` added to
   `DecisionKind` (never `AUTO_ACT_KINDS`), `POST /api/protect/jev/
   rams-section`.
2. **UI**: a "Suggest sections to check" action on the RAMS
   authoring/editing form, showing the flagged conditional sections
   next to the existing section fields.
3. **Regression, adversarial QA, handover.**
