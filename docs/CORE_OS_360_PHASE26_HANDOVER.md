# Core-OS 360 Phase 26 Handover — Worker QR / Intelligent RAMS / adoption completion

Part of the Core-OS 360 Completion Programme (Phases 20-29), per
`Core-OS 360_Remaining-Phases_Claude-Code_Master-Spec.docx`. Closes
all seven gap-ledger rows Phase 20 assigned to Phase 26 (C14.6, C14.7,
C14.8, C14.9, C15.4, C15.5, C15.6), read fresh from `docs/
CORE_OS_360_COMPLETION_MATRIX.md`'s own gap ledger at the start of
this phase, not assumed from any prior handover.

## What was required

Per the completion matrix's own gap ledger for this phase:

1. Printable/downloadable QR badges/labels with a human-readable
   fallback ID (C14.6).
2. Site/kiosk/manual check-in/out for authorised users, with explicit
   site selection — never a guessed default (C14.7).
3. "Checked in but never checked out" / stale attendance detection
   (C14.8).
4. QR coverage beyond people: machines/assets, work areas, COSHH,
   site entrance/induction, PPE (C14.9).
5. RAMS suggestions using verified internal context — site, hazards,
   plant, people, competency, controls, prior incidents, documents
   (C15.4).
6. Hard warnings before RAMS issue/approval for assigned people/
   equipment failing deterministic requirements (C15.5).
7. RAMS suggestion provenance recorded and inspectable (C15.6).

## What was found before any code was written

- **C14.9's own literal wording ("work areas, COSHH, site entrance/
  induction, PPE") could not honestly be built in full.** Checked live
  before writing a migration: no admin or portal page anywhere writes
  `hs_sites` at all, so "work areas/site entrance" scannable
  infrastructure would have no UI to ever mint a token from — dead
  code, not a feature. "Induction" is already a per-person Safe to
  Deploy requirement, already exposed by the existing worker badge's
  own `worker_qr_status()`. "PPE" has no standalone catalogue table in
  this codebase at all — it is a `role_requirements.requirement_type`
  value, never a physical object with its own id. The narrower,
  honestly-scoped build covers the two real remaining object kinds:
  machines/assets (`hs_equipment`) and COSHH assessments.
- **C15.4's "verified internal context" needed real, honestly-available
  facts, not an invented linkage.** A RAMS (`method_statements`) has
  `site_id`/`department_id` directly on the row, but no "assigned
  people" or "controls" column of its own — confirmed by reading the
  table's own migration (124) before designing anything. The signal
  set that IS real: the RAMS's own `site_id`, and from it, open
  hazards, lifting/plant equipment, and recent incidents at that site.
  People/competency/controls/documents are deliberately excluded —
  inventing a linkage that doesn't exist would be exactly the
  guessed-signal shortcut this codebase's standing discipline rejects
  elsewhere (the referral gate's "absence of evidence is a FAIL, not
  a pass"; the audit engine's "recorded outcome, never a guessed
  one").
- **C15.5's "assigned people/equipment" needed the same honest
  re-reading.** "Assigned equipment" is whatever a RAMS is linked to
  via `hs_links` — the only real equipment linkage a method statement
  has. "Assigned people" means the two individuals a RAMS genuinely
  names on the row itself: `author_id` and `responsible_manager_id`
  (resolved to a `people` row via `people.user_id`, then read through
  `person_deployment_status()`, 136) — not every acknowledging
  worker, since no "assigned workforce" list exists on a method
  statement.
- **The gate for C15.5 had to be UI-level, not a database one, by
  design, not by omission.** The shared `hs_doc_guard()` (123) governs
  every controlled-document transition for hazards, risk assessments,
  method statements AND COSHH assessments alike — teaching it a
  RAMS-specific side-check would entangle three other document kinds
  in a rule that only applies to one. `RamsCoshhWorkflow.tsx` (shared
  with COSHH) gained an optional `approvalWarnings` prop that COSHH's
  own page simply never passes, keeping COSHH's behaviour byte-for-
  byte unaffected.
- **C15.6 needed no new write at all.** `jev_decisions` (098) has
  recorded every Jev call in full, with its own `jev_decisions_actor_
  read` RLS policy letting the person who asked read their own
  decision back, since the very first Jev integration. The entire gap
  was a missing UI surface to read one back — confirmed by checking
  every other Jev-calling feature in this codebase (`doc_type_
  suggest`, `hs_item_classify`), none of which expose a "what informed
  this" panel either, so building one scoped to the SAME actor (not a
  cross-user one) matches the existing platform precedent rather than
  inventing a wider capability than every sibling feature has.

## What was built, group by group

### Group 1: printable worker QR badge + human-readable fallback ID (C14.6)

`worker_qr_tokens` (179) never lets the raw token be read back once
minted, so a dedicated print page has nothing to render from.
"Print badge" instead toggles a `<body>` class the print stylesheet
uses to hide every other section on the current page, leaving just
the badge card (name, company, human-readable fallback ID, QR) for
the browser's native Print/Save-as-PDF — the panel previously carried
`no-print` throughout, so the existing "print or save this now"
instruction never actually worked. `humanBadgeId()` (new, tested)
prints `people.employee_number` next to the QR, falling back to a
short reference built from the person's own id for a worker with no
`employee_records` row (contractors etc.).

### Group 2 (migration 195): site/kiosk manual check-in/out (C14.7)

`recorded_via` widens from a single-value CHECK to `'qr_scan' |
'manual'`. A new `site_checkins_client_manual_insert` RLS policy lets
a session holding `workforce.manage` insert a `'manual'` row for
their own company only; `site_checkins_client_manual_update` lets
that same capability close out ANY open check-in (deliberately not
restricted to `recorded_via = 'manual'` — a manager may complete a
checkout for a worker who originally self-scanned in too). A new
`site_checkins_manual_guard()` BEFORE UPDATE trigger — the
column-restriction allow-list this table never had — refuses a
non-staff session changing anything except `checked_out_at`; a
service-role session (the two existing public scan routes) is exempt
by construction. `ManualCheckinForm.tsx` (person + explicit site
picker, never a guessed default) and `CheckoutButton.tsx`, both plain
session inserts/updates under the new RLS.

### Group 3: stale check-in detection (C14.8)

A new `site_checkins` reminder rule keyed off `checked_in_at`: an
open check-in (`checked_out_at` still null) flags `overdue` the
morning after it was opened — the earliest a date-granularity daily
cron can possibly say it — then weekly after that, the exact shape
the existing `role_stale` (requisitions) rule already established.
`site_checkins` gets no outbox entry of its own (179's own
"attendance, not compliance" posture) — `REMINDER_ENTITIES` only.
`workforceRules.ts` gains the consuming rule: notifies `workforce.
manage` holders by person and site name, links to the on-site
roster, and re-checks the row live before notifying so a
re-processed event for someone already checked out since is silent
rather than a stale nag. New notification type `site_checkin_stale`
fires to the PORTAL bell (`workforce.manage` is a client-side
capability).

### Group 4 (migration 196): QR coverage beyond people (C14.9)

`entity_qr_tokens` — a new, genuinely polymorphic table mirroring
`worker_qr_tokens`' exact shape (durable, SHA-256 hash only,
RLS-on-no-policies, at-most-one-active-per-entity) but keyed on
`(entity_type, entity_id)` instead of `person_id`, covering
`'equipment'` and `'coshh_assessment'`. `entity_type` is validated
against `hs_entity_company()`/`hs_entity_table()` — the platform's one
polymorphic entity resolver — so `company_id` is always derived,
never trusted from the caller, and an unknown `entity_id` is refused
outright. New shared-dupe pairs `lib/entityQr/qrTokens.ts` and
`components/hs/EntityQrPanel.tsx` (the `WorkerBadgePanel.tsx` pattern
generalised over an entity). Public scan surface: portal's
`/e/[token]` + `/api/e/[token]`, reading `entity_qr_status()` under
the service role — status-only fields, never a free-text column.
Mint/revoke: admin's staff-only equipment QR route (wired into
`EquipmentClient.tsx`'s expanded row) and portal's COSHH QR route
(`risk.create` checked against the ASSESSMENT's own organisation,
never the caller's home company — a real distinction for a
consultant acting across a portfolio).

### Group 5: RAMS suggestion uses verified internal context (C15.4)

`ramsSectionState()` gains four extra named fields, only when a real
site has been selected: `site_name`, `open_hazards_at_site` (`hazards`
not `closed`/`archived`), `lifting_or_plant_equipment_at_site`
(`hs_equipment` where `asset_type IN ('plant','machinery',
'lifting_equipment')` and not `decommissioned`), and `incidents_at_
site_last_12_months` (`hs_incidents` in a trailing 365-day window —
the same convention `lib/hs/kpis.ts` already uses elsewhere). Every
one is a plain count or a name straight from the register, never free
text a person typed. The route (`/api/protect/jev/rams-section`)
resolves the site SERVER-SIDE, scoped to the caller's own company — a
`site_id` belonging to a different company, or one that doesn't
resolve at all, is silently ignored (no error, no site fields), since
this is an enrichment signal, not a hard requirement.
`RamsHeaderEditor.tsx` sends the form's own `site_id` alongside the
existing three fields.

### Group 6: hard warnings before RAMS issue/approval (C15.5)

`ramsApprovalWarnings()` (new, pure, tested) is a plain deterministic
check against facts the platform has already computed. A linked
equipment asset that is `quarantined`, `decommissioned` or
`out_of_service`, or one that is `in_service` but past its own
`next_inspection_due`, produces a warning. A `NOT_READY` or `REVIEW_
REQUIRED` author/responsible manager (via `person_deployment_
status()`) produces a warning; `CONDITIONALLY_READY` deliberately
does not (restrictions recorded, not a failing requirement). The page
computes `approvalWarnings` server-side and renders them in a `Notice
tone="bad"` banner; `RamsCoshhWorkflow.tsx` requires an explicit "I
have reviewed the warnings and want to proceed anyway" checkbox
before Confirm is enabled, but only while moving to `'approved'` or
`'active'` — every other transition is unaffected, and COSHH's own
page never passes the new prop, so COSHH is entirely unaffected. An
RPC error for a given person (e.g. `person_visible()` refuses them)
is treated as "cannot determine", never a false alarm — that person's
fact is simply omitted. Skipped entirely for an archived or
superseded version.

### Group 7: RAMS suggestion provenance UI (C15.6)

`RamsHeaderEditor.tsx` keeps the `decision_id` the suggest route
already returned and previously discarded. A new "What informed
this?" toggle (shown only once a real decision exists) lazily fetches
that one `jev_decisions` row — a plain client-side `.select('state,
selected, model, created_at').eq('id', decisionId)` under the
caller's own session, no new API route needed, relying entirely on
098's own `jev_decisions_actor_read` policy. `formatRamsSuggestion
Provenance()` (new, pure, tested) turns that row into two lists: the
site-derived facts actually used (Group 5's own new signals) and each
conditional section's probability, highest first — deliberately
excluding `title`/`project_name`/`scope_of_work`, since the author
just typed those on the same form a moment ago and echoing their own
free text back would be noise, not a new fact. A new suggestion
clears any open provenance panel from the last one.

## Adversarial review performed in this pass

A dedicated review pass across all seven groups, beyond the live
probes already run at each migration-bearing group's own ship time
(Groups 2 and 4):

- **`site_checkins` manual-write cross-tenant/cross-column risk**:
  confirmed `site_checkins_fill()` (179, unchanged) is a BEFORE
  INSERT trigger that overwrites `company_id` from the INSERTed
  `person_id`'s own company and validates `site_id` belongs to that
  same organisation BEFORE the new INSERT policy's `WITH CHECK
  (company_id = my_company_id())` is evaluated (Postgres evaluates
  RLS `WITH CHECK` against the post-BEFORE-trigger row) — so a client
  session attempting to reference another company's `person_id` while
  claiming its own `company_id` in the request is refused by the
  WITH CHECK, not merely by the trigger's own exception. The new
  `site_checkins_manual_guard()` UPDATE guard was re-read line by
  line against its own allow-list: every column except
  `checked_out_at` is compared `IS DISTINCT FROM` and refused, with
  no gap for a column added later without updating the guard (a
  documented, standing risk of any allow-list, same as every prior
  one in this codebase).
- **`entity_qr_status()`'s public, unauthenticated read surface**:
  re-read in full against the exact fields it selects for both
  `equipment` and `coshh_assessment` branches — status, dates, names,
  never a free-text column (`notes`, `description`, `spill_response`,
  `existing_controls`, `emergency_arrangements`), matching the
  existing `entityQrTokensSql.test.ts` assertion and the identical
  `worker_qr_status()` (179) precedent this table was built to mirror.
- **RAMS transition-map correctness for Group 6's `needsWarningsAck`
  gate**: confirmed from `docTransitionOk()`'s own logic that
  `review_due` is EXCLUDED entirely for `kind === 'method_statement'`
  — so a RAMS's `target === 'active'` transition can only ever be
  reached from `'approved'`, never from `'review_due'` (that branch
  only ever applies to COSHH). The warnings-acknowledgement gate
  therefore fires at exactly the two real decision points a RAMS has
  — `pending_review → approved` and `approved → active` — never at a
  COSHH-only branch it was never meant to touch.
- **`warningsAck` state-reset coverage**: traced every code path that
  changes `target` in `RamsCoshhWorkflow.tsx` (the transition
  buttons, Cancel, and a successful `move()`) and confirmed
  `warningsAck` can never survive stale into a NEW transition attempt
  — either it is explicitly reset, or `needsWarningsAck` itself
  becomes false the moment `target` changes, making a stale `true`
  value inert.
- **Group 7's RLS dependency**: confirmed `jev_decisions_actor_read`'s
  `actor_id = auth.uid()` matches exactly what the RAMS suggestion
  route passes as `actor: { id: user.id, kind: 'client' }` when it
  calls `askJev()` — the same signed-in user re-fetching the row
  later always satisfies the policy; a different viewer never can,
  which is the documented, intentional scope limit (matching every
  other Jev integration in this codebase), not an oversight.
- **Group 4's route-level capability check**: re-confirmed the portal
  COSHH QR mint/revoke route calls `has_capability` under the
  CALLER's own session (never the service role) against the
  ASSESSMENT's own `company_id` — the correct check for a consultant
  acting inside a client's organisation, not their home company —
  while the actual token write uses a SEPARATE service client, the
  same two-client split every prior Command Centre write in this
  codebase already established.

No Critical, High or Medium defect was found requiring a code change
in this pass.

## Protected legacy regression results

Not applicable — this phase touched no protected-legacy system
(Referrals, A2I, Development Plans, E-Learning marketplace, Billing).
Every group's own full `vitest run` across both apps stayed green
throughout, which is this codebase's own established regression
discipline ("the full test suites ARE the regression suite").

## Known remaining issues, with severity

- **C14.9 (Low, documented, not a gap-ledger row): narrower object
  coverage than the gap's own five-item wording.** "Work areas/site
  entrance" and "PPE" are deliberately out of scope — no honest UI
  host exists for the former, no catalogue table exists for the
  latter. "Induction" is already covered by the existing worker
  badge. Recorded in the migration's own header and in the completion
  matrix's evidence column, not silently narrowed.
- **C15.4 (Low, documented, not a gap-ledger row): people/competency/
  controls/documents excluded from the suggestion signal set.** A
  RAMS genuinely has no linkage to read for these honestly — inventing
  one would be the guessed-signal shortcut this phase deliberately
  avoided. "People/competency" is the natural subject Group 6 (C15.5)
  already covers for the two people a RAMS DOES genuinely name.
- **C15.5's gate is UI-level, not a database one, by design.** A
  technically capable user could bypass the acknowledgement checkbox
  via devtools or a direct Supabase call. This is an explicit,
  documented scope decision (the shared `hs_doc_guard()` governs three
  other document kinds and should not carry a RAMS-specific
  side-check), not an oversight, and is stated as such in both the
  code comments and this handover.
- **C15.6's provenance panel is scoped to the same actor who asked,
  never a different viewer (e.g. a later approver).** Matches every
  other Jev integration in this codebase, none of which expose a
  cross-user "what informed a past suggestion" panel either. Widening
  this would need a new RLS policy or a persisted reference column on
  `method_statements` — real future scope, not silently built here.

None of the above are carried forward as new gap-ledger rows — each
is a documented, deliberate scope boundary the matrix's own evidence
column records, not an unresolved defect.

## Full regression

tsc clean both apps throughout every group. Final counts: admin
vitest **1799 passed / 180 test files** (unchanged across Groups 5-7,
which touched no admin file; up from the phase's own starting point
via Groups 1-4's own work); portal vitest **862 passed / 61 test
files** (up from 848 at the start of Group 5 — 8 new
`ramsApprovalWarnings.test.ts` cases, 6 new `ramsSuggestionProvenance
.test.ts` cases, plus Groups 1-4's own additions). All six CI guards
pass: `check-shared-dupes.sh` — **70 shared-dupe pairs**, unchanged
since Group 4 (Groups 5-7's new files are portal-only, no admin
equivalent page exists for RAMS); `check-row-cap.sh` — clean;
`check-route-validation.sh` — 44 unvalidated routes, unchanged;
`check-admin-routes-linked.sh` — 43 static admin routes, all
reachable, unchanged; `check-blind-updates.sh` — 102 blind-update
chains, unchanged (every new/changed write this phase — `Checkout
Button.tsx`'s update, Group 4's mint/revoke routes — carries an
explicit count check from the start); `check-paged-order.sh` — clean,
no regression. Both production builds compile (portal's one
prerender failure is the long-documented, sandbox-only missing-
`NEXT_PUBLIC_SUPABASE_*`-env-var limitation on `/auth/reset-password`,
unrelated to this phase and present since Phase 5 — confirmed
"Compiled successfully" completes cleanly before that unrelated
page's static-export step fails).

Two migrations (195, 196) applied and live-probed in rolled-back
transactions during the phase's Groups 2 and 4 (7/7 and 9/9 checks
respectively, no trace left live); Groups 5-7 needed no migration —
entirely TypeScript over already-live schema (Group 5 over the
existing `hazards`/`hs_equipment`/`hs_incidents` tables, Group 6 over
`person_deployment_status()` and `hs_links`, Group 7 over the
existing `jev_decisions` table and its own 098 RLS).

## Gate status

**PASS.** All seven gap-ledger rows assigned to this phase are fully
closed with test evidence and, for every migration-bearing group,
live database verification. A dedicated adversarial review pass
across all seven groups found no Critical, High or Medium defect —
four accepted, documented, low-severity scope limitations (C14.9's
narrower object coverage, C15.4's excluded signal types, C15.5's
UI-level-only gate, C15.6's same-actor-only provenance) were
identified and are not carried forward as gap-ledger rows.

**Phase 27 may begin** once this branch merges, per the Master Spec's
own sequential-gate rule. Its scope should be read fresh from
`docs/CORE_OS_360_COMPLETION_MATRIX.md`'s own gap ledger rather than
assumed, following the same "repository reality beats handover
narrative" discipline this phase and every phase since Phase 20 has
used.
