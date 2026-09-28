# Core-OS 360 Phase 2: Operational Health & Safety Core (plan)

**Written 2026-09-26, before any Phase 2 change.**

## Pre-flight: Phase 1 gate

Phase 1 closed with **no Critical or High defects open** (QA verdict: PASS WITH MINOR ISSUES). Live state was checked immediately before this plan:

- The referral cron has run `ok` every hour since Phase 1 was applied.
- All 2,634 candidates are linked to a person.
- No automation run has failed since the migrations.
- `audit_events` and `user_organisation_access` exist.

The Medium items still open from Phase 1 are:
- the switcher has not been verified in a browser;
- the Stripe run is blocked by external credentials;
- broadcast has no idempotency key;
- there is no optimistic locking.

None of these blocks Phase 2. Two of them are addressed below: optimistic locking is added for H&S records, and staff get access to the portal workspace.

## Existing H&S map

Row counts were read live on 2026-09-26. **Every operational H&S table holds 0 rows.** Only seeded reference data exists: 5 sector packs (45 items) and 1 audit template (8 items). No migration of live H&S data is therefore needed, and extending tables carries no data risk.

| Component | Tables / code | Decision | Why |
|---|---|---|---|
| Sites | `hs_sites` + `sites` view (Phase 1) | **REUSE** | Already carries every H&S FK and the Phase 1 site model. |
| Departments / areas | `departments` (Phase 1) | **REUSE** | Already covers both departments and operational areas. |
| People | `people` (Phase 1) | **REUSE** | Persons at risk, incident people, owners and contractors all reference it. |
| Statutory register | `compliance_items` (domain `hs`), `hs_register_completions`, `hs_next_due()` | **REUSE** | Recurring statutory checks are a different thing from hazards and risk assessments. Nothing is duplicated. |
| Activities / toolbox talks | `hs_activities`, `hs_activity_attendees` | **REUSE** | Unchanged. |
| Evidence | `hs_files` + private `hs-evidence` bucket, `hs_scope_for_entity()`, `lib/hs/evidence.ts` | **EXTEND** | New entity types (hazard, risk assessment, RAMS, SDS, COSHH, investigation, action). Adds `evidence_type` and `description`, lets clients upload (with capability checks), and makes storage reads inherit the `hs_files` row's RLS. |
| Safety Timeline | `hs_events`, `hs_log()` | **EXTEND** | One timeline trigger per new table. The incident summary no longer copies free-text description into the timeline. |
| H&S documents | `hs_documents` | **REUSE** | Linked by reference from RAs, RAMS and COSHH through `hs_links`. |
| Audits | `hs_audits` and related | **REUSE** | Findings already become actions. |
| Incidents | `hs_incidents` | **EXTEND** (not replace) | Gains number, title, time, reporter, location, department, the full lifecycle, investigation, RIDDOR review, links and optimistic locking. Its vocabularies are replaced, which is safe with 0 rows. The legacy `injured_person_name` moves to the permission-restricted `incident_person_sensitive` table, and the column is closed by a CHECK. |
| RIDDOR | `hs_incidents.riddor_reportable` + a staff task rule | **MIGRATE** | Replaced by the `riddor_reviews` decision-support workflow with human confirmation. The boolean stays, derived from the confirmed decision, so existing readers keep working. |
| Equipment | `hs_equipment` + inspections | **REUSE** as "asset" | Incidents, RAMS and hazards link to it. |
| Training / tests | `training_records`, `hs_tests` | **REUSE** | Incident-to-training shows factual status from these. |
| Actions | `actions` (Phase 1 universal) | **EXTEND** | Adds action class, in-progress and awaiting-verification states, verifier, evidence required and effectiveness review. No separate incident-actions table. |
| KPIs | `lib/hs/kpis.ts` | **EXTEND** | The Safety Overview reads the new records. |
| Providers | — | Already **DEPRECATED** (105) | — |
| Admin H&S workspace | `/health-safety/[companyId]/*` | **REUSE** + link | Staff now also work in the portal's PROTECT workspace, through the Phase 1 organisation switch. |
| Portal PROTECT | `/protect/*` | **EXTEND** | New tabs: Hazards, Risk Assessments, RAMS, COSHH, Investigations and Analysis. Incidents and Actions are rebuilt in place. There is no second "Safety" section. |

**Nothing is REPLACED.**

## Design decisions

1. **Every record belongs to the client organisation.** A consultant acting in a client writes that client's `company_id`, because the Phase 1 active-organisation model makes this automatic. Attribution comes from `audit_events` (actor kind plus the actor's home organisation, added to the audit context) and from `hs_actor_labels()`.
2. **Capabilities are added** to the Phase 1 catalogue:
   - `hazard.report` and `hazard.manage`;
   - `incident.read`, `incident.sensitive.read`, `incident.approve` and `riddor.review`;
   - `templates.manage`.

   Risk assessments, RAMS and COSHH use `risk.read`, `risk.create` and `risk.approve`. Investigating uses `incident.investigate`.
3. **Workflow is enforced in the database.**
   - A BEFORE trigger checks every status transition against an allowed map and the caller's capability.
   - It stamps `approved_by` and `approved_at`.
   - It refuses self-approval by non-staff.
   - It makes approved content immutable.
   - The UI only calls these transitions; it cannot bypass them through PostgREST.
4. **Versioning:**
   - Each version is a row. Versions share a `reference` (RA-000012, RAMS-…, COSHH-…).
   - `hs_new_version()` copies the items, controls and links into a new draft. When that draft is approved, the previous version is marked `superseded`.
   - A unique partial index allows one open draft per reference.
   - `row_version` provides optimistic concurrency.
5. **Risk matrix:** the `risk_matrices` table has a platform default (5×5, bands 1–4 Low, 5–9 Medium, 10–16 High, 17–25 Very High). Items store likelihood and severity from 1 to 5. Initial and residual scores are generated columns, and bands are computed from the assessment's matrix.
6. **Relationships:** `hs_links` is one typed link table, with an integrity trigger requiring both ends to be in the same organisation. It covers RAMS↔RA/hazard/equipment/COSHH/person/document, incident↔RA/RAMS/COSHH/equipment/person, and hazard↔incident/asset. This is the foundation for the Risk Graph, and links are copied forward on new versions.
7. **Templates:** `hs_templates` is either platform, private (owner organisation) or portfolio (visible to clients of the owning consultancy through an active `consultancy_client` relationship). Instantiating or cloning stamps `template_id`/`template_version` or `copied_from_id`. A template update never rewrites records; instead "template update available" is computed.
8. **Incidents:**
   - Numbers use organisation-scoped `record_sequences` (INC-2026-000001). The UUID stays the key.
   - Injury, contact and medical details go in `incident_person_sensitive`, which needs `incident.sensitive.read`.
   - An employee sees only incidents they reported, while `incident.read` sees all.
   - Closure is blocked while corrective actions are open, unless someone with `incident.approve` records an override reason.
9. **RIDDOR:** decision-support fields hold prompts only. Deciding needs `riddor.review` and a rationale. There is no automatic submission and no automatic legal conclusion.
10. **Root cause:** investigations cannot complete without at least one human-confirmed root cause.
11. **No predictive features.** Reporting is counts and trends only.

## Migrations

| File | Contents |
|---|---|
| 122 | Foundation: capabilities, staff active organisation, record numbering, `hs_links`, evidence extension + storage policy, templates, attribution |
| 123 | Hazards, risk matrices, assessment types, risk assessments / items / controls, workflow, versioning, clone/template RPCs |
| 124 | RAMS (method statements, steps, acknowledgements), COSHH (substances, SDS versions, assessments) |
| 125 | Incidents extension, people / sensitive, investigations, timeline, causes, 5 Whys, RIDDOR reviews, escalation rules, closure guard, **action verification and effectiveness** (moved here from 126 during build) |
| 126 | Action party guard (who may change which action columns), safety search extension |
| 126a | Full unique indexes for keyed upserts (fixes a pre-existing platform defect, see handover I) |
| 127–129 | UI helpers (`my_capabilities`, `org_directory`), overview/analysis RPCs, trigram search indexes |

As built: see `docs/CORE_OS_360_PHASE2_HANDOVER.md`.

## Test strategy

- SQL-shape tests pinning each migration.
- Unit tests for the matrix, workflow and template logic.
- A live rolled-back probe using the spec's fixtures: Laws Safety / Steve, ABC (Main Plant, Warehouse, Production, Engineering, three hazards), XYZ (two hazards). It covers the full lifecycle, attacks, versioning, the concurrency case, RIDDOR permissions and storage paths.
- A volume probe with 10k hazards, 20k items, 5k incidents, 50k actions and 10k evidence rows.
- The full suites, the CI guards and both builds.
