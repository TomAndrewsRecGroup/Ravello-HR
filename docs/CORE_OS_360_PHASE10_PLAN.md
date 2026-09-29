# Core-OS 360 Phase 10: Incident Pattern Intelligence — Plan

No detailed operator brief exists in the repo for this phase (the same
situation Phases 8-9 were in) — scope is derived from the phase's own
name, grounded in what the codebase already has.

## What already exists (checked, not assumed)

- **`hs_incidents`** (112, extended by 125): `incident_type` (9 values:
  accident/injury/near_miss/dangerous_occurrence/property_damage/
  environmental/occupational_ill_health/security/other), `severity`
  (nullable, 6 values), `site_id`, `department_id`, `linked_asset_id`,
  `linked_contractor_id`, `occurred_on`, `status`. No injury/medical
  detail lives on this table — that is `incident_person_sensitive`,
  gated on `incident.sensitive.read`, and this phase never reads it.
- **`incident_causes`** (125): one row per confirmed cause on an
  investigation, `cause_level` (immediate/underlying/root),
  `category` (a curated 13-value taxonomy: people, plant_equipment,
  process, procedure, environment, management, training, supervision,
  maintenance, communication, design, contractor, organisational).
  This IS the "pattern" data — a recurring root-cause category across
  incidents is exactly what "Incident Pattern Intelligence" as a name
  promises, and the taxonomy already exists; nothing needs inventing.
- **No existing UI aggregates incidents ACROSS records at all.**
  `lib/hs/kpis.ts` counts incidents in the trailing 12 months as ONE
  number; nothing groups by type, site, department or root-cause
  category, and nothing compares one period against another.

## The one absolute rule this phase must never cross

**No predictive or AI safety scoring, anywhere** — this codebase's own
standing rule, stated explicitly and repeatedly since Phase 4
("Explicitly forbidden... predictive/AI safety scoring: machine
failure prediction, accident probability, unsafe-worker prediction").
"Incident Pattern Intelligence" is read as **historical, factual
pattern surfacing** — "3 incidents at Site X shared the same root-cause
category in the last 90 days" — never "Site X is at elevated risk of a
future incident." Every insight in this phase reports what has ALREADY
happened, in the past tense, with a real, inspectable count behind it.
No score, no probability, no AI anywhere in this phase's own code.

## Scope for this phase

1. **Group 1 (no migration): the pure computation.**
   `lib/incidentPatterns/analyze.ts` — given a company's incidents and
   incident_causes rows already fetched for a chosen window, surfaces:
   incident counts by type (most frequent first); a recurring root-cause
   category (2+ CONFIRMED `cause_level = 'root'` causes sharing a
   category within the window); a site/department with 2+ incidents in
   the window (a historical concentration, reported as a count, never a
   risk rating); and a simple period-over-period severity comparison
   (major/critical/fatal counts, this window vs. the immediately
   preceding window of the same length). Deterministic, no AI, no
   stored aggregate.
2. **Group 2 (no migration): UI.** Admin tab on the per-client H&S
   workspace, `/health-safety/<companyId>/incident-patterns` — a
   window picker (30/90/365 days). Portal read-only equivalent under
   `/protect`, gated by `protect` alone.
3. **Group 3: regression, adversarial QA, handover.**

## What this phase deliberately does NOT do

- **No prediction, no score, no "risk level."** Stated above; the
  single most important scope boundary in this phase.
- **No injury/medical/personal detail anywhere.** Only `hs_incidents`'
  own non-sensitive columns and `incident_causes.category` are read —
  never `incident_person_sensitive`, never `incident_causes.
  description` (free text) in any aggregate output.
- **No cross-client pattern surfacing.** Each client's incidents are
  their own; nothing in this phase compares one client against
  another or builds an industry-wide benchmark — that would need its
  own explicit product decision (and likely its own consent model),
  not something to fold in here.
