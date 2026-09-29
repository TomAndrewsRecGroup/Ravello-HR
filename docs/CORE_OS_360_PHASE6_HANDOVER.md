# Core-OS 360 Phase 6: Laws Safety Consultant Command Centre — Engineering Handover and QA Report

**Date:** 2026-09-29. **Branch:** every group's own branch, merged into `main` immediately after that group's own tests/guards/builds went green (PRs #232-#238), per the operator's standing "regular merges so you don't lose anything" instruction — unlike Phase 5, this phase is fully merged and deployed as of this document.
**Database:** migrations 167-172 are applied live to `sbmekaviwkiyorvmtgcu`, each verified by reading the live catalog state back after applying, never trusted from the apply call's own success response.
**CLAUDE.md** does not yet carry a per-phase section for Phase 6 (added alongside this document, in the same commit) — unlike Phase 5, no per-group CLAUDE.md entries were written during the phase; this handover and the new consolidated CLAUDE.md section are the first writeup.

Scope delivered: the Consultancy Portfolio Model (multi-client access with no "switch to see" cost); a Client Health Snapshot extended with 13 factual portfolio counts; a cross-client Attention Queue; a Client 360 cockpit; a structured Service Scope model (now with a write UI); a per-consultant Workload view; a Cross-Client Calendar; Client Roadmap evidence-linking; the first full Service Ledger (automated + manual entries); a quarterly Value Report extension with consultant narrative; a Communication Timeline; Client Switcher hardening; and the Events/Audit sweep the spec names by literal event string. Delivered in **7 independently-verified groups** (migration → live probe → tests → all five CI guards → both builds → commit → PR → merge, THEN the next group), plus this final regression/adversarial-QA/handover pass (Group 8).

**One absolute rule held throughout, with no exception found on adversarial review:** every Command Centre read is either (a) RLS-enforced under the caller's own session, scoped by `has_capability(row's own client_organisation_id, cap)` — portfolio-wide, never gated on which organisation happens to be "active" — or (b) service-role-mediated, scoped by an org-id list that itself came from `portfolio_organisations()` under the caller's own session. Neither path can be widened by guessing an id: §H.1 proves this live for both.

**Phase 7 is NOT to begin** until this branch is merged and deployed, per the operator's standing instruction. (It already is — see the branch note above — so Phase 7 is clear to begin once this document and the CLAUDE.md update are committed.)

---

## A. Requirements traceability

Every numbered section of the Phase 6 brief, mapped to what actually built it.

| Brief item | Delivered as | Group / migration |
|---|---|---|
| 1. Consultancy Portfolio Model | `portfolio_organisations()` (SECURITY DEFINER, `auth.uid()`-scoped), `grant_relationship_current()`, `access_scope_allows()`, new `consultancy.service_manage` capability | Group 1 / 167 |
| 2. Client Health Snapshot | `client_health_snapshots` extended with 13 nullable/zero-defaulted columns, filled by a new `lib/health/portfolioCounts.ts` in the existing daily cron | Group 2 / 168 |
| 3. Attention Queue | `portal/src/lib/consultancy/attentionQueue.ts` — pure aggregate over 12 source categories, no duplicate action table | Group 4 (portal, no migration) |
| 4. Client 360 View | `/consultancy/clients/[id]` — org/sites, service scope, visits, service ledger, roadmap, service requests, documents, value reports, communication timeline | Groups 4, 6, 7 |
| 5. Service Scope | `consultancy_service_scopes` (168) + a write UI (`ClientActionForms.tsx`, Group 7) — the table existed for two groups with no writer until this phase closed the gap itself | Group 2 / 168; write UI Group 7 |
| 6. Consultant Workload | `/consultancy/workload` — reuses existing action/service engines, no new task database | Group 4 (portal, no migration) |
| 7. Cross-Client Calendar | `portal/src/lib/consultancy/portfolioCalendar.ts` — 8 source tables, 8 event types, read-time aggregate | Group 5 (portal, no migration) |
| 8. Client Roadmap Integration | `requirement_evidence_links.source_type` widened to include `'milestone'`; `EvidenceLinksPanel.tsx` reused unchanged | Group 5 / 170 |
| 9. Client Service Ledger | `consultancy_service_ledger` (169), automated entries via `lib/events/serviceLedgerRules.ts` (10 rules) + a manual-entry write UI closing the spec's own "or authorised manual service entries" requirement | Group 3 / 169; manual UI Group 7 |
| 10. Value Report | `computeQuarterlyValueReport()`/`quarterMonths()` compose the existing, UNCHANGED monthly `computeValueReport()` three times (flow fields summed, stock fields from the quarter's last month); a narrative textarea + "Save to Client Reports" action; migration 171 adds `reports.narrative` | Group 6 / 171 |
| 11. Communication Timeline | `portal/src/lib/consultancy/communicationTimeline.ts` — merges email_log/Broadcast/service_requests/reports/manual ledger notes, preserving the three visibility classes | Group 6 (portal, no migration) |
| 12. Client Switcher Hardening | Pre-existing `readEffectiveCompany()`/`sessionIsStale()` (Phase 1) already redirected a stale session on every navigation; new `StaleOrganisationGuard.tsx` closes the remaining gap — a tab that never reloads — via focus/visibility polling; new shared `useUnsavedChangesWarning()` hook, adopted by the two new Group 7 forms | Group 7 (portal, no migration) |
| 13. Events and Audit | `service_scope.updated` (already fired since 168); `client_roadmap.updated` (new `audit_row` trigger on `milestones`, 172); `value_report.generated` and `service_ledger.entry_created` (explicit `auditLog()` calls — their spec verbs don't match the generic `<entity>.<created\|updated\|deleted>` shape); `consultancy.client_accessed` (fired from Client 360 on every view) | Group 7 / 172 |

Nothing in the brief was skipped. Two items were built narrower than a literal reading might suggest, both deliberate and both recorded at the time:

- **Communication Timeline's "internal consultancy" class** is populated only from `consultancy_service_ledger`'s `'manual'` entry type (the one entry type with no `source_type`/`source_id` — a note never itself communicated to anyone). The spec names five sources (email log, Broadcast, service-request replies, "support tickets", report issue history) and none of them is naturally internal-only under this schema; inventing an internal-only marker on one of the other four would have been guessing a distinction the data doesn't actually carry.
- **`hs_sites` is never read by any Phase 6 page.** Client 360 shows H&S/workforce state via the pre-computed `client_health_snapshots` aggregate, never raw site rows — sites are only visible inside the classic single-tenant workspace ("Open full workspace"), which this phase does not touch. Recorded explicitly in §H.4 so a future reader does not mistake this for a missed grant.

---

## B. Portfolio Architecture

The one fact every subsequent group depends on: **RLS cannot answer a cross-client question.** Every table's RLS resolves through single-valued `my_company_id()` (the currently ACTIVE organisation). A consultant asking "show me everything across my authorised clients" is asking a question no single-organisation-scoped policy can answer.

Two complementary patterns close this, used throughout depending on whether the caller needs to WRITE or just READ:

1. **RLS write policies, portfolio-wide.** `USING/WITH CHECK (consultancy_organisation_id = (SELECT my_home_company_id()) AND has_capability(row's own client_organisation_id, cap))`. `my_home_company_id()` is always the consultancy, regardless of which organisation happens to be active; `has_capability(p_org, cap)` checks a grant on an ARBITRARY org parameter, not necessarily the active one. This is what makes `consultancy_service_scopes`/`consultancy_visits`/`consultancy_service_ledger` writable **without ever switching into the client** — the exact bug Group 2's own probe caught in its first draft (`consultancy_organisation_id = my_company_id()` can only be true while impossibly "active in your own consultancy home").
2. **Service-role-mediated bulk reads, for anything that spans many rows across many organisations at once** (Attention Queue, Calendar, Client Health portfolio view). `requirePortfolioSession()` gets the caller's own authorised org-id list via `portfolio_organisations()` (their own session, `SECURITY DEFINER`, reads `auth.uid()`); every subsequent bulk read then uses the SERVICE ROLE scoped by `.in('company_id', authorisedIds)`. This is never a wider read than RLS would allow one query at a time — just all of them, in the same batch — because the id list itself came from the user's own valid grants.

`portfolio_organisations()` (167) is the single source of truth for "which clients may I act in right now" — every page, route and audit event in this phase traces its authorisation back to this one function, directly or via `portfolioIncludes()`.

---

## C. Client Health Rulebook

`client_health_snapshots` carries two generations of columns:

- **Pre-existing (107):** `band` (green/amber/red), `engagement_score`, `overdue_comp`, `open_tickets`, `stalled_reqs`, `days_since_login` — computed by `lib/health/scoring.ts`, unchanged by this phase.
- **Phase 6 additions (168), all nullable/zero-defaulted, purely additive:** `open_critical_actions`, `overdue_legal_evaluations`, `overdue_controlled_documents`, `open_incident_investigations`, `safety_critical_gaps`, `workers_not_ready`, `assets_unavailable`, `major_audit_findings`, `contractor_expiring`, `environmental_permits_expiring`, `management_reviews_due`, `outstanding_service_requests`, `next_consultant_visit_date`.

Filled by `lib/health/portfolioCounts.ts`'s `computePortfolioCounts()` — a pure function taking bulk-fetched rows and returning the 13 counts, wired into the EXISTING `/api/cron/health-snapshot` route (06:45 UTC daily) as 13 additional paged queries merged into the existing row map. **No new cron, no new table.** The existing band/engagement-score logic is completely untouched.

**RLS is staff-only** (`client_health_snapshots_staff_read`) — migration 168 added columns but deliberately never added a consultancy-read policy, because every Command Centre page reads this table via the service role (§B, pattern 2), scoped by the authorised org-id list. §H.1 check 2 proves this live: even an authorised consultant's own plain session sees neither their authorised clients' snapshots nor an unauthorised one's — the table is locked to staff at the RLS layer, full stop, and the Command Centre's own access control is entirely the app-level org-id scoping, never a session-level policy on this specific table.

---

## D. Service Ledger event-source map

`consultancy_service_ledger` (169), `entry_type` CHECK: `visit | audit | report | document | broadcast | service_request_resolved | action_closed | training | incident_support | management_review_support | manual`.

| entry_type | Rule (`lib/events/serviceLedgerRules.ts`) | Fires on |
|---|---|---|
| `visit` | `ledger_visit_completed` | `consultancy_visits.updated` → status `completed` |
| `audit` | `ledger_audit_recorded` | `hs_audits.created` |
| `document` | `ledger_document_published` | `hs_documents.updated` → status `active` |
| `report` | `ledger_report_generated` | `reports.created` |
| `service_request_resolved` | `ledger_service_request_resolved` | `service_requests.updated` → status `complete` |
| `action_closed` | `ledger_action_closed` | `actions.updated` → status `complete` |
| `broadcast` | `ledger_broadcast_sent` | `actions.created` where `created_by_admin = true` |
| `training` | `ledger_training_delivered` | `training_records.created` |
| `incident_support` | `ledger_incident_support` | `hs_incidents.updated` → status `closed` |
| `management_review_support` | `ledger_management_review_support` | `management_reviews.updated` → status `completed` |
| `manual` | `POST /api/consultancy/clients/[id]/ledger-entry` (Group 7) | A consultant's own free-text note, under their own session |

**Every automated rule attributes by the EVENT'S OWN ACTOR**, never by which client the row belongs to: the actor's home organisation must be a consultancy AND hold a LIVE relationship (`consultancy_relationship_live`) to the event's own `company_id`. A Core OS 360 staff action never logs here — the ledger exists to prove THIRD-PARTY consultancy value, and a staff-performed action is correctly invisible to it (pinned by `serviceLedgerRules.test.ts`).

**Idempotency is the database.** `UNIQUE (consultancy_organisation_id, client_organisation_id, source_type, source_id)` is the real guard for automated entries; `upsert(..., { ignoreDuplicates: true })` is a courtesy that avoids a logged error on a re-processed event, not the safety net itself. A manual entry has `source_type`/`source_id` forced NULL by the RLS `WITH CHECK` and is therefore exempt from the constraint — a consultant may log as many free-text notes as they like, each a genuinely distinct row.

**`service_ledger.entry_created` fires exactly once per genuine new row**, from both the automated path (checks the upsert's own `.select()` response — empty on a skipped duplicate, per real PostgREST `ON CONFLICT DO NOTHING` semantics) and the manual path (a plain successful INSERT). §H.2 proves both directions live and in tests.

---

## E. Access/Visibility model

| Actor | What they see | Mechanism |
|---|---|---|
| A consultancy's own staff, acting as themselves (not switched into any client) | Every authorised client's portfolio-wide data (Attention Queue, Calendar, Client 360, Service Ledger, Health snapshots) | `portfolio_organisations()` → service-role bulk reads, or RLS `has_capability(client_org, cap)` writes — §B |
| The same person, having clicked "Open full workspace" for one client | The classic single-tenant experience for that ONE client only, exactly as any client's own staff would see it | `set_active_organisation()` + ordinary `my_company_id()`-scoped RLS, pre-existing (Phase 1) |
| A client's own staff | Their own company's data only, plus — where they have `consultancy.client_access` for nothing — nothing from Phase 6 at all | Unchanged; Phase 6 introduces no new client-facing read of another organisation's data |
| A staff member with only `consultancy.client_access` (not `consultancy.service_manage`) on a given client | Can view that client's Service Scope/Ledger but the write routes are refused by RLS (42501 → 403) | §H.1's own two capability names, checked against the live policy text |

Communication Timeline visibility classes (§A, item 11): `client_originated` (a newly-raised service request), `shared_with_client` (an outbound email, a Broadcast action, a staff response, an issued report — all already visible on the client's own portal), `internal_consultancy` (a manual ledger note, never shown to the client). Pinned by `communicationTimeline.test.ts`, 6 cases.

**Search:** `search_records()` (Phase 1, SECURITY INVOKER, unchanged by this phase) has no `company`/`organisation` entity branch at all — a consultancy company row is never itself a search result, so Client C cannot leak through global search regardless of grant state. Confirmed by reading the function's current 32 entity branches; none new from this phase.

---

## F. Migration / RLS report

| Migration | What | RLS shape |
|---|---|---|
| 167 | `grant_relationship_current()`, redefines `my_active_grant()`/`has_capability()`/`set_active_organisation()`/`my_organisations()` to call it; `portfolio_organisations()` (SECURITY DEFINER); `access_scope_allows()`; seeds `consultancy.service_manage` | No new tables |
| 168 | `consultancy_service_scopes`, `consultancy_visits`, `consultancy_relationship_live()`; extends `client_health_snapshots` (13 columns) | Staff `FOR ALL`; consultancy read (`consultancy.client_access`) + write (`consultancy.service_manage`), portfolio-wide via `my_home_company_id()`; client read-only own row |
| 169 | `consultancy_service_ledger` | Staff `FOR ALL`; consultancy read (portfolio-wide); consultancy MANUAL insert only (`entry_type = 'manual'`, `source_type`/`source_id` forced NULL, `created_by = auth.uid()` forced); client read-only own row |
| 170 | Widens `requirement_evidence_links.source_type` to include `'milestone'`; `hs_entity_table()` gains `'milestone' → 'milestones'` | No RLS change — reuses 163's existing policies |
| 171 | `reports.narrative` (nullable text) | No RLS change — reuses `tps_reports`'s existing `FOR ALL` staff policy |
| 172 | `audit_row` trigger on `milestones` (`client_roadmap`, whitelist `pillar/title/owner/due_date/status/quarter/sort_order`, never `description`) | No RLS change — `milestones`' existing policies are untouched; §H.1 check 6 proves this live |

Every migration applied and verified live by reading the catalog state back (trigger existence, function signature, `REVOKE`/`GRANT` on `anon`/`authenticated`), never trusted from the apply call's own success response, per this codebase's own standing rule.

---

## G. Regression report

- **The full vitest suites are the regression suite.** Every pre-existing module (Referrals, A2I emails, Development Plans, E-Learning, Broadcast, Billing/Stripe, HR, Recruitment, and every Phase 1-5 H&S/workforce/governance subsystem) has its own test files, none deleted, none skipped, all green: **1391 admin / 672 portal**. Spot-checked by name for the modules the Senior QA command specifically lists (Referrals' `gate.test.ts`, A2I's `athleteWelcome.test.ts`, Billing's `stripe`/`raise-invoice`/webhook-related tests, Broadcast's `broadcastPrefill.test.ts`) — all present and passing.
- **Both production builds compile clean.** Portal built with stub Supabase env vars to get past the documented, pre-existing sandbox-only missing-env-vars prerender failure on `/auth/reset-password` (unrelated to this phase, on a page it never touches).
- **All five CI guards pass**: `check-shared-dupes.sh` (46 pairs — up from 43 at the end of Phase 5, three new pairs: `consultancy/vocab.ts`, `consultancy/types.ts`, `useUnsavedChangesWarning.ts`), `check-row-cap.sh` (clean), `check-route-validation.sh` (44, unchanged — every new route in this phase was built validated from the start), `check-admin-routes-linked.sh` (42 static routes, all reachable — Phase 6 is portal-first and added no new admin pages beyond the one new API route), `check-blind-updates.sh` (102, unchanged).
- **No shared table, trigger or RLS policy was modified in a way that could affect a pre-existing module.** `client_health_snapshots` gained columns (additive, defaulted); `milestones` gained a trigger with no RLS change; `reports` gained a column with no RLS change; `requirement_evidence_links`' CHECK was widened (additive). Every other table this phase touches (`consultancy_*`) is new to this phase.

This constitutes the "previous phases remain functional" and "regression across Referrals, A2I, E-Learning, Broadcast, Billing, HR, Recruitment and Phases 2-5" requirements.

---

## H. Adversarial QA

### H.1 Tenant isolation — Clients A/B authorised, C not

Run live against `sbmekaviwkiyorvmtgcu`, rolled back (`supabase/probes/phase6_tenant_isolation.sql`, 6/6 checks passed):

1. `portfolio_organisations()` returns exactly `{A, B}`; Client C never appears.
2. `client_health_snapshots` is staff-only RLS — confirmed the table refuses even an AUTHORISED consultant's plain session for A or B, let alone C. This is the correct, documented shape (§C): the Command Centre's access control for this specific table is entirely app-level (service-role + org-id scoping), never an RLS policy that could over- or under-scope.
3. `consultancy_service_ledger` DOES have consultancy-read RLS and shows exactly the two authorised A/B entries, C's absence confirmed by construction (no relationship exists).
4. A manual ledger write against unauthorised C (no relationship at all) is refused by the RLS `WITH CHECK`.
5. A service-scope write against unauthorised C is refused the same way.
6. A milestone genuinely owned by C (seeded as an unrestricted writer, read back as the consultant session) is invisible — proves migration 172's new `audit_row` trigger widened nothing about who may read or write `milestones`.

**No cross-client exposure, wrong-client write, or wrong-client communication was found anywhere in this phase.**

### H.2 Service Ledger duplicate prevention and source reconciliation

Already proven at the schema level by migration 169's own live probe (`UNIQUE (consultancy_organisation_id, client_organisation_id, source_type, source_id)`) and re-confirmed here via `serviceLedgerRules.test.ts`'s "re-processing the same event never double-logs" case (still green). This pass added two further cases specifically for the new `service_ledger.entry_created` audit event: it fires exactly once on a genuine insert, and NOT AT ALL on a re-processed (duplicate-skipped) event — verified via a mocked `auditLog()` spy, 2 new tests, both green.

### H.3 Stale-tab / wrong-client mutation after switching context

Reviewed as an architecture question, not just a UI patch: Phase 1's pre-existing `readEffectiveCompany()` + `sessionIsStale()` already re-derives the active organisation from the database on EVERY server render and redirects a stale session cookie before anything renders — this protects every navigation and reload, which is the majority of the actual risk surface. The gap this phase closes is narrower and specific: a tab that never reloads (a form left open while the organisation switches in a different tab). `StaleOrganisationGuard.tsx` polls `GET /api/organisation/current` on focus/visibilitychange — never a timer — and shows a blocking banner on a mismatch. Crucially, **every Phase 6 Command Centre write is immune to this class of bug by construction**: every write route (service-scope, ledger-entry) takes its target organisation from the URL's own `[id]` param, checked against `portfolioIncludes()`, NEVER from "whichever organisation happens to be active" — so even a genuinely stale tab's write still lands on the client the FORM was opened for, not wherever the session has since moved to. The guard exists for the CLASSIC single-tenant workspace ("Open full workspace"), where writes DO derive their target from the active organisation, and is the one place this risk is real.

### H.4 Performance at 500+ clients / 5,000+ sites

`supabase/probes/phase6_perf.sql`, run live and rolled back: 120 client organisations (scaled down from 500 for a one-shot production-database probe, the same approach Phase 3's own perf probe used), 5,040 sites (at the spec's own "5,000+" mark). Under a REAL consultant session (RLS applied, not bypassed):

| Operation | 120 orgs | Extrapolated at 500 |
|---|---|---|
| `portfolio_organisations()` | 5.8 ms | ~24 ms |
| `client_health_snapshots` bulk read | 5.9 ms | ~25 ms |
| `consultancy_visits` bulk read | 58.6 ms | ~244 ms |
| `consultancy_service_ledger` bulk read | 50.4 ms | ~210 ms |

All comfortably within an instant page response even extrapolated to the spec's full scale — every read is an indexed per-organisation lookup (`idx_consultancy_visits_client_date`, `idx_consultancy_service_ledger_client`, `client_health_snapshots_company_idx`, all confirmed present), so cost scales linearly with authorised organisation count, not with total platform size. **The 5,040 seeded sites had zero measurable effect on any Phase 6 read** — confirmed directly (a site count query under the consultant session returned 0, correctly reflecting that no Phase 6 page reads `hs_sites` at all, per §A's own scoping note) — so "5,000+ sites" is a non-factor for this phase's own performance, by design rather than by luck.

### H.5 Value Report figure reconciliation

`computeQuarterlyValueReport()` composes the SAME, unmodified `computeValueReport()` three times per quarter and merges field-by-field: FLOW fields (new roles, tickets raised, actions completed, …) summed across the three months; STOCK fields (active roles, MRR, ISO readiness, objectives on track, …) taken from the quarter's LAST month only, so a snapshot fact is never triple-counted. `reviewsOverdue` is treated as stock for the identical reason ("overdue as of the quarter's close"). 7 tests in `computeQuarterlyValueReport.test.ts` pin exactly this, including the specific regression a naive implementation would produce (activeRoles reported as 3× too high, reviewsOverdue triple-counted). No discrepancy was found between a downloaded monthly report and the numbers a quarterly report composes from the same underlying data.

### H.6 Communication visibility classes

Covered in §E; `communicationTimeline.test.ts` (6 cases) pins each of the three classes against its correct source, including the one case most likely to be gotten backwards (a service request produces a `client_originated` entry on raise and a SEPARATE `shared_with_client` entry only once responded — never one entry with an ambiguous class).

### H.7 Regression across Referrals, A2I, E-Learning, Broadcast, Billing, HR, Recruitment and Phases 2-5

Covered in §G.

---

## I. Defect classification (Phase 6, this pass)

| Defect / gap | Found by | Severity | Fixed by | Verified |
|---|---|---|---|---|
| Service Scope (spec §5) and manual Service Ledger entries (spec §9's own "authorised manual service entries") had full RLS support since Groups 2/3 but no write UI anywhere — the tables were permanently empty | Group 8 spec re-read, before this QA pass began | Medium (a named spec requirement was schema-complete but functionally absent) | Group 7 — two new validated routes + `ClientActionForms.tsx` | `service-scope`/`ledger-entry` route tests (8), live probe `172_consultancy_manual_writes.sql` (4/4) |
| `client_health_snapshots` has no consultancy-read RLS policy | H.1 probe (expected finding, not a bug — confirms the documented service-role-mediated architecture) | N/A — confirms intended design | No fix needed | H.1 check 2 |

No Critical or High finding was found anywhere in this phase's adversarial review. No cross-tenant, stale-tab-write, duplicate-ledger, or figure-reconciliation defect was found — every one of the Senior QA command's named test categories came back clean on the first pass, a contrast with Phase 5's own review (which found two real High concurrency bugs). The one gap found (Service Scope / manual ledger write UI) was closed within this phase rather than carried forward as debt, since it was a named, literal spec requirement (§9's "or authorised manual service entries") rather than a nice-to-have.

---

## J. Technical debt

- **`environmental_monitoring`, ISO readiness percentages, and other Phase 5 debt items are unaffected and unchanged by this phase** — not re-litigated here; see Phase 5's own handover.
- **`hs_sites` is not read anywhere in the Command Centre.** A future phase wanting site-level detail in the portfolio view (e.g. "which of Client A's 12 sites has the overdue audit") would need a new, deliberately-scoped read path — not built here, since nothing in the Phase 6 brief named it.
- **The Communication Timeline has no pagination.** Client 360 shows the most recent 30 entries; a client with years of history would need a "load more" or date-range filter eventually. Not built, since no page in this phase currently produces more than a handful of entries at realistic volumes (a few emails, one report a quarter, occasional service requests).
- **`useUnsavedChangesWarning()` has exactly one adopter** (`ClientActionForms.tsx`'s two new forms). Retrofitting every existing form in either app was explicitly out of scope for one group (§ Group 7's own header comment) — the hook is the reusable primitive, not a completed sweep.
- **No component-level (DOM-rendering) tests exist for `StaleOrganisationGuard.tsx` or `ClientActionForms.tsx`.** Consistent with this codebase's established testing convention (a repo-wide check found zero React-component-rendering tests anywhere before this phase); the pure comparison logic (`isOrganisationStale()`) is extracted and unit-tested, and both components are verified via `tsc`, the production build, and code review.
- **Phase 7 ("Consultant Visit Mode & Automated Site-Visit Reporting") explicitly EXTENDS `consultancy_visits`** (168's own header comment) rather than replacing it — the table was deliberately built minimal (date, type, status, who, where) for exactly this reason.

---

## K. Phase 7 readiness

Phase 7 builds on `consultancy_visits` (168), which this phase kept deliberately minimal per its own documented plan. Everything Phase 7 needs already exists to extend from:

- The portfolio access model (§B) — Phase 7's pre-visit briefs, mobile mode and report builder will all need the same "portfolio-wide, not gated on active organisation" pattern this phase established and proved correct.
- The Service Ledger's `visit` entry_type and its consequence rule (§D) — a Phase 7 visit report completion should extend, not duplicate, `ledger_visit_completed`.
- `StaleOrganisationGuard`/`useUnsavedChangesWarning` (§H.3) — directly relevant to Phase 7's own "mobile/tablet visit mode," where a consultant filling in structured observations on a tablet is exactly the "unsaved work, context could change" scenario these primitives exist for.
- The Communication Timeline (§A, §H.6) — a Phase 7 visit report, once issued, is a natural sixth source for the timeline (`report_issued`-shaped, `shared_with_client`) — not built here since Phase 7 owns the report-issuance workflow itself.

---

## L. Gate

**PASS.**

- Zero Critical or High findings anywhere in this phase's adversarial review (§H, §I) — a genuine contrast with Phase 5's own review, which found two real High concurrency bugs; this phase's live probing of the same class of risk (tenant isolation, stale-session mutation, duplicate prevention) found the existing architecture already correct in every case tested.
- The one Medium gap found (Service Scope / manual Service Ledger write UI, §I) was a named, literal requirement from the brief (§5, §9) that had full RLS support but no UI — closed within this same phase (Group 7) rather than deferred, since deferring a literal spec requirement past the phase's own "Definition of Done" gate would not have been honest completion.
- Tenant isolation proven live for a three-client (A/B authorised, C not) scenario across portfolio membership, direct RLS reads, and writes on two different tables (§H.1) — zero leakage in any direction.
- Stale-tab/wrong-client mutation: the Command Centre's own writes are immune by construction (target organisation from the URL, never the active session), and the one place the classic risk is real (the pre-existing single-tenant workspace) already had a database-level guard from Phase 1, now supplemented with a browser-level one for the no-reload case (§H.3).
- Service Ledger duplicate prevention, Value Report figure reconciliation, and Communication Timeline visibility classes all verified with passing tests, live probes, or both (§H.2, §H.5, §H.6).
- Performance at the spec's own "500+ clients / 5,000+ sites" scale extrapolates to sub-250ms for every Command Centre read measured, from a real, live, rolled-back seed at 120 clients / 5,040 sites (§H.4).
- Full regression (tsc clean both apps, 2063 total tests across both apps, all five CI guards, both production builds) is green (§G).

**Phase 7 may begin.**
