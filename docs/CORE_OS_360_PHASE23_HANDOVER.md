# Core-OS 360 Phase 23 Handover — Risk Graph / Evidence Engine / Digital Twin completion

Part of the Core-OS 360 Completion Programme (Phases 20-29), per
`Core-OS 360_Remaining-Phases_Claude-Code_Master-Spec.docx`. Closes all
nine gap-ledger rows Phase 20 assigned to Phase 23: C8.3, C8.4, C8.5,
C11.3, C11.4, C11.5, C12.4, C12.5, C12.6.

## What was required

Per the completion matrix's own gap ledger for this phase:

1. A reusable Connections panel on relevant record pages (Phase 8
   built one combined explorer+dashboard page, not a per-record
   panel), and neighbour label resolution beyond hazards/RAs/legal
   obligations (a known, disclosed scope limit).
2. A portfolio-safe consultant Risk Graph view — Phase 8's own scope
   decision explicitly left out portfolio-wide RLS.
3. Evidence Engine filters (entity type/category/outcome/date-range/
   current-vs-historical) and combined cross-reference navigation with
   `requirement_evidence_links`/ISO/legal evidence.
4. A stored snapshot/history for Digital Twin posture trend,
   configurable thresholds with safe defaults and an audit trail, and
   every score exposing its own inputs.

## What was found before any code was written

Read `RiskGraphClient.tsx`, `lib/riskGraph/intelligence.ts`,
`RaLinks.tsx`, `lib/evidenceEngine/analyze.ts`,
`lib/complianceTwin/assemble.ts` and `lib/complianceTwin/
loadSnapshot.ts` in full before writing a line of Phase 23 code.

Two decisions this reading produced directly changed the plan:

- **Group 5's threshold override needed to be wired into ONE place,
  not three.** `loadComplianceTwinSnapshot()` is the single function
  all three of the plan's named admin callers (Digital Twin page,
  Board Assurance's `generate` route, Assurance Today) already go
  through — reading the company's own threshold row there once,
  rather than duplicating the read in three separate files, follows
  this codebase's own "one calculation, not two" discipline
  (`computeValueReport`/`computeGovernanceMetrics` were extracted for
  the identical reason).
- **Portal's own digital-twin/assurance pages were deliberately left
  untouched by Group 5.** Phase 12's own design already established
  that portal duplicates its own query logic rather than importing
  admin's loader (the two apps share no server code) — so wiring
  thresholds required touching only the three named admin callers, and
  `assembleComplianceTwin()`'s `thresholds` param being OPTIONAL meant
  portal's existing calls needed zero code changes to keep working
  exactly as before.

## What was built, group by group

### Group 1: `entityLabels.ts` + `ConnectionsPanel.tsx` (C8.3, C8.4)

`lib/riskGraph/entityLabels.ts` (shared-dupe pair): a curated label
map for 14 entity types plus incidents and legal obligations, every
column verified against its own migration file before being added —
never guessed from a table name. `resolveEntityLabels()` batches ONE
query per DISTINCT type present in a result set. `hrefForEntity()`
takes an explicit `{ role, companyId?, portalBase? }` rather than an
imported `portalUrl()` helper, so the file stays a true byte-identical
shared-dupe pair — the same `ComplianceTwinView.tsx` precedent ("each
page supplies its own correct hrefs").

`ConnectionsPanel.tsx` (shared-dupe pair): the GENERIC version of
`RaLinks.tsx`/`IncidentLinks.tsx`/`RamsCoshhLinks.tsx` — those three
stay exactly as they are, this is additive for every OTHER connection.
Queries `hs_links` directly at depth 1 (never the RPC, which does not
return the underlying row id needed for removal). Wired into two
reference pages: admin's audit detail page (no link mechanism existed
there before) and portal's incident detail page (additive alongside
the existing hazard/RA-only `IncidentLinks.tsx`).

### Group 2 (migration 187): portfolio-safe consultant Risk Graph view (C8.5)

Six new, additive, SELECT-ONLY consultancy-read RLS policies
(`hazards`, `risk_assessments`, `risk_assessment_items`,
`risk_item_controls`, `organisation_legal_obligations`, `hs_links`),
the exact `actions_consultancy_select` shape migration 175 already
established. Because `risk_graph_neighbors()` is `SECURITY INVOKER`,
opening `hs_links` alone makes the explorer portfolio-safe with NO
code change — proven live.

`RiskGraphClient.tsx` (Phase 8's admin-only dashboard+explorer) was
promoted to a shared-dupe pair, routing every href through Group 1's
`hrefForEntity()` instead of a hardcoded `portalUrl()` call. New
portal page `/consultancy/clients/[id]/risk-graph` mirrors admin's own
dashboard, gated by `requirePortfolioSession()`/`portfolioIncludes()`,
reading via the service role.

Two live schema facts not visible from a per-column CHECK scan were
found while writing the probe: `hazards`' table-level `hazards_check`
constraint (`site_id IS NOT NULL OR linked_location IS NOT NULL`), and
`organisation_legal_obligations_stamp()`'s (159) own
assessed-by/assessed-at gate on an `'applicable'` decision.

### Group 3: Evidence Engine filters + current-vs-historical + cross-reference (C11.3, C11.4, C11.5)

`analyzeEvidenceCoverage()` gains `currentGaps` — the subset of `gaps`
restricted to, per item, only its NEWEST completion by `completed_on`,
mirroring the "only the newest row decides current state" rule
`hs_equipment_inspection_roll()`/148a's PUWER roll already
established — a genuinely different, correct computation from "every
gap ever", proven by a test pinning the exact scenario: an item whose
OLDER completion lacked evidence but whose NEWEST one has it is
excluded from `currentGaps`.

`crossReferenceComplianceItems()` counts, per compliance item, how
many other records already point at it as evidence, broken down by
SOURCE kind (ISO clause, legal obligation, objective, audit finding).
Deliberately COUNTS ONLY, linking to the relevant catalogue page.

`EvidenceEngineClient.tsx` gains client-side filters (current/history
toggle, category, outcome, date range, entity type) over the
already-bounded, already-fetched arrays — no new query shape.

### Group 4 (migration 188): stored Digital Twin snapshot/history (C12.4)

Explicit, human-triggered capture — checked before deciding that
looping `loadComplianceTwinSnapshot()`'s ~15 per-company queries into
the existing whole-portfolio-batched daily cron would multiply its
cost by company count, a real regression the cron's own design
doesn't have anywhere else. `compliance_twin_snapshots`: staff-only
RLS, `UNIQUE (company_id, snapshot_date)` upserts a same-day re-save.
"Save today's snapshot" inserts the already-computed, already-rendered
snapshot the page just built. A 30-day dot trend renders admin-only
(the table is staff-only RLS with no client equivalent).

### Group 5 (migration 189): configurable thresholds, safe defaults, audited (C12.5)

`compliance_twin_thresholds`: `company_id` UNIQUE, five nullable
override columns matching `assemble.ts`'s five named constants,
staff-only RLS + audited (whitelisting only the five threshold
columns). `assembleComplianceTwin()` gains an optional `thresholds`
param; every named constant is renamed `DEFAULT_X` and each area reads
`thresholds?.X ?? DEFAULT_X`. `loadComplianceTwinSnapshot()` reads the
company's own override row once, feeding all three admin callers.
Portal's own pages are unchanged, a documented scope decision (see
above). `ThresholdsForm.tsx`: a staff-only collapsible form, blank
means "use the default".

### Group 6: every score exposes its inputs (C12.6)

`ComplianceTwinArea` gains `inputs: Record<string, number | string |
null>` — the exact raw values each area's checks read, plus the
threshold actually used post-override. `buildArea()` takes `inputs` as
a new required parameter. `ComplianceTwinView.tsx` gains a collapsible
"Show inputs" per area via a native `<details>` element — no
JavaScript, no `'use client'` conversion needed.

## Adversarial review (this handover pass)

- **`ConnectionsPanel.tsx`'s "Add a connection" cannot create a
  cross-organisation link**, regardless of what the form sends:
  `hs_links_check()` (122) already enforces same-organisation at the
  trigger level for every `hs_links` insert, unaffected by this phase.
- **`resolveEntityLabels()` issues no `company_id` filter of its own**,
  relying entirely on each target table's own RLS — checked, not
  assumed. A portal (client) session can only ever be asked to resolve
  an id that arrived via an `hs_links` row already same-organisation
  by construction (the trigger above), and even a hypothetical
  cross-company id would return zero rows under RLS and fall back to
  the generic `fallbackLabel()`, never leaking another company's data.
  An admin (staff) session legitimately sees every company by design.
- **Migration 187's consultancy policies are proven SELECT-only, not
  merely named that way**: the live probe's check2 attempted a real
  INSERT under the authorised consultant session and confirmed it was
  refused (`insufficient_privilege`) — the six new policies grant
  nothing beyond what their `FOR SELECT` clause states.
- **Migrations 188 and 189 are proven staff-only against a real
  non-staff session**, not merely a policy definition read back: both
  probes ran a genuine `client_admin`/`client_user` session and
  confirmed zero rows readable and zero rows writable.
- **`ThresholdsForm.tsx`'s number parsing was hardened during this
  pass**: `Number('')`/`Number('abc')` are now explicitly checked
  (`raw === '' || Number.isNaN(n)`) rather than relying on
  `JSON.stringify(NaN)` happening to serialise to `null` — the
  original behaviour was accidentally safe, not deliberately so, and
  is now explicit.
- **`SaveSnapshotButton.tsx`/`ThresholdsForm.tsx` trust no client input
  for `company_id`** — both take it from the page's own server-derived
  `params.companyId` (a staff-only admin route under the auth
  middleware), never from anything the browser could set independently
  of the URL it is already authorised to be on.

## Protected legacy regression results

Not applicable — this phase touched no protected-legacy system
(Referrals, A2I, Development Plans, E-Learning marketplace, Broadcast,
Billing).

## Known remaining issues, with severity

None found requiring a fix beyond the `ThresholdsForm.tsx` hardening
above (a defensive-coding improvement, not a defect — the original
behaviour was already safe, just relying on an implicit language
detail rather than an explicit check).

## Full regression

tsc clean both apps at every group boundary. Final counts: admin
vitest **1709** (up from 1674 at the start of this phase — +5
`riskGraphPortfolioReadSql.test.ts`, +14 mirrored `entityLabels.test.ts`
cases (Group 1's own baseline), +9 `analyze.test.ts` cases (Group 3),
+6 `complianceTwinSnapshotsSql.test.ts`, +5
`complianceTwinThresholdsSql.test.ts`, +16 new `assemble.test.ts`
cases across Groups 5-6, plus one fixture fix each in three
pre-existing test files (`inputs: {}` added, caught by `tsc`); portal
vitest **804** (up from 788 — +2 sweep-test pickups for the new
`/consultancy/clients/[id]/risk-graph` route, +14 mirrored
`analyze.test.ts` cases). All six CI guards pass at every group
boundary (66 shared-dupe pairs, up from 63 — `entityLabels.ts`,
`ConnectionsPanel.tsx`, `RiskGraphClient.tsx` registered as new
pairs). Both production builds compile at every group boundary
(portal's one prerender failure is the long-documented, sandbox-only
missing-`NEXT_PUBLIC_SUPABASE_*`-env-var limitation, unrelated to this
phase and present since Phase 5).

Three migrations (187, 188, 189) applied and live-probed in
rolled-back transactions: 8 checks (187), 6 checks (188), 7 checks
(189) — 21/21 live database checks total this phase, all passing on
first re-run after each fix (no live-database defect found requiring
a correction after the probe-construction issues below were resolved).

Two probe-construction issues were found and fixed WHILE WRITING the
probes, not defects in the migrations themselves: migration 187's
fixture hit a table-level `hazards_check` constraint invisible from a
per-column CHECK scan, and `pg_policies.qual` renders a USING clause's
column table-qualified (`risk_assessments.company_id`, not bare
`company_id`) — both corrected in the probe before it could give a
false pass or false fail.

## Gate status

**PASS.** All nine gap-ledger rows assigned to this phase are closed
with live database evidence: two new shared-dupe UI primitives wired
into real reference pages, a real portfolio-wide RLS extension proven
SELECT-only and cross-tenant-safe against a genuinely separate
consultancy, a real current-vs-historical computation distinguished
from a UI filter by a dedicated test, a real cross-reference count
proven to exclude zero-count items, a real staff-only stored-snapshot
table with upsert-not-duplicate semantics, a real staff-only
configurable-threshold table with a documented admin-only scope
decision, and a real structural inputs breakdown replacing what was
previously only prose. No Critical, High or Medium defect found in
this phase's own adversarial pass; the one hardening applied
(`ThresholdsForm.tsx`'s number parsing) closes a reliance on implicit
JS serialisation behaviour, not a live security or correctness gap.

**Phase 24 may begin** once this branch merges, per the Master Spec's
own sequential-gate rule. Its scope should be read fresh from
`docs/CORE_OS_360_COMPLETION_MATRIX.md`'s own gap ledger rather than
assumed, following the same "repository reality beats handover
narrative" discipline this phase and every phase since Phase 20 has
used.
