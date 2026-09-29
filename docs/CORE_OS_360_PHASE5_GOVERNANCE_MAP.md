# Core-OS 360 Phase 5: EHS Governance Map

Read this before touching any related code in a later Phase 5 group. It
classifies every existing EHS/governance-relevant component as REUSE,
EXTEND, MIGRATE, DEPRECATE or REPLACE, with a one-line justification each,
based on actually reading the referenced files and migrations (not
assumed). Phase 5's own spec forbids building a parallel system, so any
REPLACE below needs to carry real weight — there are none.

Group 1 (this PR) builds only the Environmental Aspects & Impacts
subsystem and this map. Later groups (environmental incidents / waste /
spills / monitoring / permits, the ISO 45001/14001 framework layer, the
legal register, document control, objectives & targets, management
review, audit-engine enhancement, UI, final QA) build on migration 156
onward and should read this map first.

## Classification

| Component | Verdict | Why |
|---|---|---|
| `compliance_items` (register, `domain` generated column, `hs_next_due()`) | **REUSE** | Already the one register for HR + H&S recurring obligations. Environmental compliance OBLIGATIONS (Phase 5's "Compliance Obligations" deliverable, a later group) belong here as a `domain` addition or a parallel `HS_REGISTER_CATEGORIES`-style vocabulary, not a new register table. |
| `hs_documents` + its versioning discipline (106) | **EXTEND (pattern reused, table not)** | `environmental_aspects` in this migration copies its exact "a new version is a new row, old row flips to superseded" discipline — the same call `emergency_plans` (154) already made. A later "Controlled Documents" group should extend `hs_documents` itself (it is already generic metadata over `hs_files`), not fork a second document table. |
| `hs_audits` / `hs_audit_templates` (110) | **REUSE** | The on-site audit engine (offline runner, client-generated ids, atomic idempotent submit, server-side scoring) is generic enough to host an "EHS management system audit" (ISO clause 9.2) as just another template category. No new audit engine needed for Phase 5's audit-evidence work. |
| `hs_incidents` (112, 125) + RIDDOR decision support | **EXTEND** | Environmental incidents (spills, pollution events, permit breaches) are incidents in the same sense H&S incidents are — same investigation/root-cause/corrective-action shape. A later group should add an `incident_type` value or a parallel `environmental` flag on `hs_incidents` rather than a second incidents table, mirroring how `compliance_items.domain` already distinguishes HR from H&S on one table. |
| `hs_equipment` / asset register (112, 144) | **REUSE** | Environmental permits/monitoring equipment (flow meters, effluent monitors) are assets. `asset_type` already has an `other` escape hatch; a later group can add `emissions_monitor`/`effluent_meter` values rather than a new asset concept. |
| `contractors` / `contractor_insurances` (150) | **REUSE** | Environmental permits and waste-carrier licences are conceptually adjacent to contractor prequalification (an approval/expiry-tracked compliance fact about a third party) but are NOT contractors themselves — a later "Environmental Permits" group should follow the same *shape* (approval status + expiry tracking) on its own table, not attach permit data to the contractor table. |
| `policy_acknowledgements` + its token/link infrastructure (103) | **REUSE (pattern)** | The no-login personal-link + SHA-256 token table + claim-before-send email discipline (`policy_ack_tokens`) is the template for any future "external sign-off" flow this phase needs (e.g. an EHS policy statement acknowledgement, ISO clause 5.2) — copy the pattern, do not add a second token table unless the entity genuinely differs (a real new entity gets its own `<x>_tokens` table, same shape, per the `hs_test_tokens` (116) precedent). |
| `latest_updates` + `regulatory_category`/`classify.ts` (115) | **REUSE** | Environmental regulatory-change detection (a later group, if built) is the identical shape already shipped for H&S/HR regulatory change — same Jev classify cron, same `/broadcast` human-in-the-loop hand-off. No new classification pipeline needed. |
| `actions` (universal action/corrective-action table, 119/125) | **REUSE** | Absolute rule #1 of this phase: every environmental finding, non-conformance or corrective action is an `actions` row with a new `source_type` value (`environmental_aspect` added in this migration; later groups add `environmental_incident`, `environmental_permit_breach`, etc. as needed). Never a second findings/actions table. |
| Broadcast (`admin/(admin)/broadcast`) | **REUSE** | The existing multi-client push-action mechanism is sufficient for any EHS-wide announcement (e.g. a new environmental regulation); no changes needed for Phase 5 Group 1. |
| Value reports (`lib/valueReport/`) | **EXTEND (future)** | A later group may add an "Environmental" section to the Value Report PDF, following the exact pattern the LEAD section (2026-09-25) already established (`computeLeadMetrics`-style pure function, a fourth/fifth `section()` block). Not needed for Group 1. |
| `platform_events` / `notify()` / `lib/events/rules.ts` + `hsRules.ts` | **EXTEND** | The outbox/consequence/notify machinery is the one mechanism for every "something happened, tell someone" case platform-wide. This migration adds `environmental_aspects` to `TRIGGERED_ENTITIES` and a new `admin/src/lib/events/environmentalRules.ts` file (mirroring `hsRules.ts`'s structure/imports) rather than inventing a second notification system. |
| Phase 1 organisations/capabilities model (117, `has_capability()`, `access_role_capabilities`) | **REUSE** | Two new capabilities (`environmental.read`, `environmental.manage`) are seeded in the exact 117/122/132/144/150 literal `('capability', ARRAY[roles])` shape — never a dynamic `SELECT ... FROM access_role_capabilities` grant, which `tenancySql.test.ts`'s regex-driven parity check cannot parse (the 144a/147a trap this file's own history warns about twice). |
| `hs_files` / evidence infrastructure (`hs_scope_for_entity()`, `hs_evidence_readable/writable()`, `hs_files_entity_check()`) | **EXTEND** | This migration adds an `'environmental_aspect'` branch to all four functions (the exact pattern Group 2's `'equipment'` branch and Group 3's `'inspection'` branch already established in Phase 4) — never a new bucket or a new evidence table. |
| `apply_write_guard()` / read-only consultancy grant (117) | **REUSE** | Called on both new tables in this migration, as every client-writable table since Phase 1 must. |
| `audit_row()` / `audit_events` (117) | **REUSE** | Both new tables fire `audit_row()` with an identifying/classifying-only column whitelist (never `description`/`methodology_notes`), the same discipline every H&S table since Phase 1 follows. |
| Jev (`lib/jev/`) | **NOT USED for significance** | Absolute rule #2 of this phase: significance is computed by an explicit, inspectable numeric formula with mandatory human confirmation, never by Jev or any model. Jev is not invoked anywhere in this subsystem. A later group MAY use Jev for a genuinely advisory, non-deciding purpose (e.g. suggesting an `aspect_type` from free text, the same "pre-fills a form, never writes the record" posture `doc_type_suggest`/`hs_item_classify` already take) but that is out of scope for Group 1 and not built here. |
| BD Intelligence / BD pipeline | **N/A** | No EHS relevance; untouched. |

## REPLACE list

**None.** Every relevant existing component is REUSE or EXTEND. No
component needed replacing to build Environmental Aspects & Impacts, and
the plan for every later Phase 5 group above also resolves to REUSE/EXTEND
against existing infrastructure — consistent with the platform-wide rule
this codebase has followed since Phase 4's own existing-operations audit:
extend what already does the job, never fork a parallel system.

## Decisions Group 1 makes for later groups to follow

- **Admin UI placement**: Environmental Aspects lives under the existing
  `/health-safety/<companyId>/environmental-aspects` tab on
  `HsCompanyTabs.tsx` (a 13th tab), NOT a new top-level "Environmental"
  sidebar section. Reasoning: it needs no new sidebar link
  (`check-admin-routes-linked.sh` matches by path prefix, and
  `/health-safety` is already linked), and Environmental sits inside the
  same per-client H&S/EHS workspace as Register/Incidents/Equipment —
  the same "PROTECT" pillar, broadened. A later group with enough new
  environmental pages to justify its own top-level group (e.g. Waste,
  Spills, Emissions, Permits each as separate pages) should revisit this
  and may promote to a dedicated "Environmental" `NAV_GROUPS` entry at
  that point — noted here so that decision is made deliberately, not by
  accretion.
- **Portal flag key**: gated by `protect` alone (the same flag every
  other H&S PROTECT page uses — Register, Documents, Audits, Incidents,
  Equipment, Emergency Plans), not a new `environmental` flag. Nothing
  here is self-certified by a client (read-only page), matching the
  standing H&S posture since Phase 1b. A later group should keep this
  unless environmental becomes a separately-sold module, in which case a
  new flag key (`environmental`) should gate ALL environmental pages
  together, added to `ROUTE_FLAGS` in one pass, not per-page.
- **Vocabulary location**: `ENVIRONMENTAL_ASPECT_TYPES`/`_STATUSES` (+
  labels) live in the existing `lib/hs/vocab.ts` shared-dupe pair, not a
  new `lib/environmental/vocab.ts` file — Phase 4's asset/permit/
  isolation/emergency-plan vocabularies all live there too, and one file
  per domain-adjacent vocabulary avoids yet another shared-dupe pair to
  keep in sync by hand.
