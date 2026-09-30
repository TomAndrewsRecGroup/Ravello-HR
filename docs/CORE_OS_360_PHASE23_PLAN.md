# Core-OS 360 Phase 23: Risk Graph / Evidence Engine / Digital Twin
# completion

No detailed operator brief exists for this phase (the same situation
every no-operator-brief phase since 8 was in). Scope: the nine
gap-ledger rows Phase 20 assigned here — `docs/
CORE_OS_360_COMPLETION_MATRIX.md` rows C8.3, C8.4, C8.5, C11.3, C11.4,
C11.5, C12.4, C12.5, C12.6.

Checked against the live code before writing a line of this plan (the
session's standing "repository reality beats handover narrative"
discipline): `lib/riskGraph/intelligence.ts`, `RiskGraphClient.tsx`,
`lib/evidenceEngine/analyze.ts`, `EvidenceEngineClient.tsx`,
`lib/complianceTwin/assemble.ts`, `loadSnapshot.ts`, `hs_links`'
current RLS, `hazards`/`risk_assessments`/`risk_assessment_items`/
`risk_item_controls`/`organisation_legal_obligations`' current RLS
(none of the five have a consultancy-read policy — only `actions` was
widened in Phase 6 Group 7), and `RaLinks.tsx` (the existing bespoke,
non-reusable per-record link panel this phase's C8.3 must NOT copy).

## C8.3 + C8.4: reusable Connections panel + broader label resolution

One shared module, `lib/riskGraph/entityLabels.ts` (shared-dupe pair):
a curated `{ table, titleColumn }` map for the ~18 most commonly
LINKED entity types (hazard, risk_assessment, method_statement,
coshh_assessment, incident, action, audit, document, equipment,
contractor, permit, isolation, objective, milestone, legal_obligation
— special-cased via its `legal_requirements` join, exactly `intelligence.ts`'s
own existing pattern — consultation_record, environmental_complaint,
environmental_aspect, management_review), batched one query per
DISTINCT type actually present in a result set (never per branch —
`risk_graph_neighbors()`'s own 500-row/3-hop cap already bounds how
many distinct types can appear), falling back to `${humanise(type)}
${id.slice(0,8)}…` for anything uncurated — the SAME "curated map +
humanised fallback" shape Phase 9's `compute.ts` already established
for exactly this reason.

`ConnectionsPanel.tsx` (new shared-dupe component): generic, given
`{ entityType, entityId, companyId, canEdit }` — queries `hs_links`
DIRECTLY (not the multi-hop RPC: a per-record panel needs depth 1 and
the link's own row id to support removal, exactly `RaLinks.tsx`'s own
query shape, generalised to any entity type instead of hazard/incident
only), resolves labels via the new resolver, and offers add/remove —
add is a plain-paste target id (the `EvidenceLinksPanel.tsx`/
`LessonsLearnedClient.tsx`-established precedent for a generic link
tool: no per-type options list to fetch). This is ADDITIVE to
`RaLinks.tsx`/`IncidentLinks.tsx`/`RamsCoshhLinks.tsx` (which stay
exactly as they are — narrower, curated panels that already work) —
never a replacement.

Wired into two reference pages, one per app, proving genuine
cross-app reuse without an exhaustive rollout (an honest, documented
scope decision — the same "adopted in its first two forms, not
retrofitted everywhere" precedent Phase 6 Group 7's
`useUnsavedChangesWarning` already set): admin's audit detail page
(`/health-safety/<companyId>/audits/<auditId>` — no link mechanism of
any kind exists there today) and portal's incident detail page
(ADDITIVE alongside the existing `IncidentLinks.tsx`, which only
covers hazard/RA links — `ConnectionsPanel` covers every other type:
a contractor, a permit, an action).

## C8.5: portfolio-safe consultant Risk Graph view

Migration 187: five additive consultancy-read RLS policies, the exact
`actions_consultancy_select` shape from migration 175 — `USING
((SELECT public.has_capability(company_id, 'consultancy.service_manage')))`
— on `hazards`, `risk_assessments`, `risk_assessment_items`,
`risk_item_controls`, `organisation_legal_obligations` (all five feed
`computeRiskGraphIntelligence()`; `hs_links` already has an identical
gap and gets the sixth policy). No new capability — reuses the one
every Phase 6/7 consultancy write already keys on.

Because `risk_graph_neighbors()` is `SECURITY INVOKER`, this alone
makes the EXPLORER portfolio-safe with no code change: a consultant
calling it for a genuine record in an authorised client now succeeds
regardless of which organisation is "active" in their session — the
walk can never cross companies anyway (`hs_links_check()`'s own
same-organisation guard, untouched).

New portal page `/consultancy/clients/[id]/risk-graph` — the exact
`Client 360` sub-page shape (168/Group 4): a service-role-scoped
dashboard (`computeRiskGraphIntelligence()` fed by
`.eq('company_id', id)` reads, `id` checked against
`portfolio_organisations()` first) plus the SAME `ConnectionsPanel`-
style explorer, this time calling `risk_graph_neighbors()` directly
under the session (now readable thanks to the new RLS).

## C11.3 + C11.4: Evidence Engine filters + current-vs-historical

`analyzeEvidenceCoverage()` gains `currentGaps: EvidenceGap[]` — the
subset of `gaps` restricted to, per item, only its NEWEST completion
(by `completed_on`), mirroring the "only the newest row decides
current state" rule `hs_equipment_inspection_roll()`/148a's PUWER
review-date roll already established — a genuinely different,
correct computation from "every gap ever", not a UI filter over the
same list. `EvidenceGap` gains `category` (already resolvable via the
existing `itemById` lookup, just not carried onto the row before this).

`EvidenceEngineClient.tsx` gains client-side filters (entity type,
category, outcome, date-range, current-vs-history toggle) over the
already-bounded, already-fetched arrays (200/500-row caps, well under
PostgREST's ceiling) — no new query shape, the same "the data is
already loaded, filter it in the browser" posture the codebase already
uses for bounded browsing lists.

## C11.5: combined cross-reference navigation

`crossReferenceComplianceItems()` (new pure function,
`lib/evidenceEngine/analyze.ts`): given the page's own compliance-item
ids plus `standard_evidence_links`/`requirement_evidence_links` rows
where `entity_type = 'compliance_item'`, returns per-item counts by
SOURCE kind (ISO clause / legal obligation / objective / audit
finding) — deliberately COUNTS ONLY, no per-link title resolution (no
join into `standard_clauses`/`legal_requirements`/`objectives`/
`audit_findings` for a label), linking instead to the relevant
CATALOGUE page (`/iso`, `/legal`) — the same "reporting a fact,
never re-deriving a label chain that already lives on its own page"
economy Phase 8's own explorer scope note already accepted for
uncurated neighbours.

## C12.4: stored snapshot / history for posture trend

**Explicit, human-triggered capture — not a blind daily per-company
loop.** Checked before deciding: the existing daily `/api/cron/
health-snapshot` computes `computePortfolioCounts()` via
WHOLE-PORTFOLIO batched reads (`readAllPages` with no per-company
filter, grouped in memory) — cheap regardless of company count. The
Digital Twin's `loadComplianceTwinSnapshot()` is the opposite shape:
~15 PER-COMPANY-SCOPED queries. Looping it over every active company
inside the existing cron would multiply that cost by company count —
a real, avoidable regression the existing cron's own design doesn't
have anywhere else. Board Assurance (Phase 13) already solved
"posture trend" for a structurally identical problem with an
EXPLICIT, human-triggered generate-then-store action, never an
automatic daily one — the same precedent applies here.

Migration 188: `compliance_twin_snapshots` (`company_id,
snapshot_date, overall_band, areas jsonb`), `UNIQUE (company_id,
snapshot_date)` so a same-day re-save upserts rather than duplicating,
staff-only RLS (matching `management_review_data_pack`/
`client_health_snapshots`' own staff-only posture — this is an
internal artefact of a staff action, not a client-facing document).
"Save today's snapshot" button on the admin Digital Twin page inserts
the ALREADY-COMPUTED, ALREADY-RENDERED snapshot the page just built —
zero extra query cost, since the page already ran
`loadComplianceTwinSnapshot()` to render itself. A small trend
sparkline/list (last 30 stored snapshots' overall band) renders
beneath the live view once any snapshots exist.

## C12.5: configurable thresholds, safe defaults, audited

Migration 189: `compliance_twin_thresholds` (`company_id` UNIQUE,
nullable override columns matching each of `assemble.ts`'s five named
constants), staff-only RLS + `audit_row()` (whitelisting the five
threshold columns only — this is a decision, not free text). Deciding
these thresholds decides what a CLIENT sees as red/amber/green on
their own compliance posture, so — matching the H&S register's
standing "nothing here is self-certified" posture — a client never
gets a write path to loosen their own thresholds.

`assembleComplianceTwin()` gains an optional `thresholds` param;
every named constant becomes `thresholds?.X ?? DEFAULT_X` — an
override always falls back to the documented default when null/unset,
never silently guessed. All three existing callers (Digital Twin
page, Board Assurance's `generate` route, Assurance Today) updated to
read the company's own row (or defaults) before calling.

## C12.6: every score exposes its inputs

`ComplianceTwinArea` gains `inputs: Record<string, number | string |
null>` — the exact raw values `buildArea()`'s own red/amber checks
read for that area (e.g. `riddorLast12Months`, `equipmentOverdueCount`,
`lastAuditScore`), plus the THRESHOLD actually used (post-override) —
never a re-derivation, the same numbers already driving `reasons`,
just also exposed structurally rather than only as a sentence.
`ComplianceTwinView.tsx` gains a collapsible "Show inputs" per area.

## Verification discipline (unchanged from every prior phase)

Each group: migration (where one exists) → live rolled-back probe →
SQL-shape test → TS/UI → `tsc --noEmit` both apps → full `vitest run`
→ all six CI guards → both production builds → CLAUDE.md update →
commit/push. Regression + adversarial QA as the final group; PR opened
and merged once green, per the standing "merge it then keep going"
instruction.
