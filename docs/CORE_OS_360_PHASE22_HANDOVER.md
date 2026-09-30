# Core-OS 360 Phase 22 Handover — Operational H&S & Client Workflow Closure

Part of the Core-OS 360 Completion Programme (Phases 20-29), per
`Core-OS 360_Remaining-Phases_Claude-Code_Master-Spec.docx`. Closes the
gap-ledger rows Phase 20 assigned to Phase 22: C2.7, C2.8, C4.11, C4.12,
C4.13, C4.14, C5.3.

## What was required

Per the completion matrix's own gap ledger for this phase:

1. `consultancy_visits` needs a database-level lifecycle guard (173's
   own header comment flagged this as debt — any authorised session
   could move between any two listed statuses).
2. A client portal UI for contractors, permits and isolations (Phase 4
   Group 13 built admin-only; "a portal page... would either need a
   capability-aware page... or would silently render empty").
3. Permit checklist response UI (`permit_checklist_responses`, Group
   13's own scope note: "deliberately left out").
4. Environmental monitoring's `within_limit` evaluation is upper-bound
   only (157's own documented, known simplification).
5. Mobile/tablet verification for inspections/PUWER/LOLER/defects/
   contractors/permits/LOTO (C2.7/C2.8/C4.14 — never browser-tested at
   ship time).

## What was found before any code was written

A dedicated Explore-agent audit (8 areas) was run before any Group 1
work began, then independently re-verified by direct grep/read against
the actual live schema and code — not trusted from the agent's summary
alone, per this session's own standing "trust but verify subagent
outputs" discipline.

The single most consequential finding, made BEFORE designing any UI:
**a plain `client_admin` session already holds `contractors.manage`
for their own organisation** — `client_admin` maps to the
`organisation_admin` catalogue role via `legacy_role_map` (117), and
`organisation_admin` has held `contractors.manage` since the role was
seeded. `has_capability()`'s home-organisation branch derives this
automatically, with no per-user grant needed. This was proven live
(not merely read from the migration file) against a real
`client_admin` session before any portal page was written — see the
Group 2 probe below. The consequence: **Group 2 needed no new RLS
policy or capability at all** — the whole gap was missing UI, exactly
as Group 13's own scope note already said. Building a "capability-aware
page, gated deliberately" (the task's own framing) turned out to mean
verifying the EXISTING gate was already correctly shaped for a client
session, not inventing a new one.

## What was built, group by group

### Group 1 (migration 185): `consultancy_visits_lifecycle_guard()`

A `BEFORE UPDATE` trigger mirroring `permits_lifecycle_guard()`/
`isolations_lifecycle_guard()`'s own shape (152/153): one `ELSIF` per
allowed `OLD → NEW` transition, refused with `ERRCODE = '23514'`
otherwise. Transitions were read from the two real write paths that
exist today (`VisitCaptureClient.tsx`'s start/finish buttons, the
report-issue route's own advance) plus the full CHECK-constraint
vocabulary (`confirm`/`close`/`cancel`), so the guard never blocks a
state the schema itself already allows. `cancelled` is reachable from
every non-terminal status; `closed`/`cancelled` are both dead ends.

Live probe: `supabase/probes/185_consultancy_visits_lifecycle_guard.sql`,
12/12 checks (default status, the real start/finish path, a refused
backward jump, a refused impossible skip-ahead jump, `cancelled` from
every non-terminal status, `cancelled`/`closed` both terminal, a
same-status re-write never blocked, no anon/authenticated execute
grant). SQL-shape test: 8/8 pass.

### Groups 2-4: portal UI for contractors, permits, isolations (closes C4.11, C4.12)

`ContractorsClient.tsx`, `PermitsClient.tsx`, `IsolationsClient.tsx`
were already fully self-contained (`companyId` as a prop, no
route-param coupling) — reused VERBATIM as three new shared-dupe pairs
rather than rebuilt, the established "reused unchanged" precedent
`EvidenceLinksPanel.tsx` and others already set. Three new portal pages
(`/protect/contractors`, `/protect/permits`, `/protect/isolations`)
read the caller's own `companyId` from `getSessionProfile()` and pass
it straight through — the identical pattern every prior `/protect/*`
page already uses.

`PermitsClient.tsx` gained the genuinely new piece: checklist-item
management on a template (`TemplateItemsPanel`) and a per-permit
checklist recording panel (`ChecklistPanel`, confirm/N-A with an
optional comment) — insert-only, the register's own "a correction is a
new row" discipline. `PermitTemplateItem`/`PermitChecklistResponse`
types added to the shared `lib/hs/types.ts`.

Live cross-tenant verification (this Group 7 QA pass, not merely
assumed from the RLS text): a real Old Albanians `client_admin`
session, run against a genuinely different company's (Andrews
Recruitment Group) seeded contractor/permit/isolation rows —
**5/5 checks pass**: cross-tenant contractor read refused (0 rows),
cross-tenant contractor UPDATE affected 0 rows, cross-tenant contractor
INSERT refused by RLS outright, cross-tenant permit read refused,
cross-tenant permit issue affected 0 rows. A second pass for isolations
— **2/2 pass**: cross-tenant isolation read refused, cross-tenant
isolation verify affected 0 rows.

### Group 5 (migration 186): environmental monitoring lower/range-bound limits (closes C5.3)

`limit_direction` (`upper | lower | range`, defaulting to `upper` so
every existing reading's `within_limit` value is byte-identical after
this migration) and `recorded_limit_upper` for a genuine two-bound
range. `within_limit` is dropped and re-added as a `GENERATED` column
(Postgres cannot alter a generation expression in place) with three
branches: `upper` unchanged from the original formula, `lower` inverts
the comparison (a minimum), `range` requires both bounds on file before
ever evaluating. An inverted range (`upper < lower`) is refused at
insert time by a new `BEFORE INSERT` guard, never silently accepted.
The audit/outbox triggers are re-created (not just redefined) to widen
their column whitelists to the two new classifying columns, never free
text.

Live probe: `supabase/probes/186_environmental_monitoring_limit_direction.sql`,
12/12 checks, including the byte-identical-for-existing-rows
preservation, all three directions, the NULL-until-both-bounds-present
rule, the inversion guard, and grant checks. SQL-shape test: 10/10 pass.

### Group 6: site-level Attention Queue detail + notification audience widening

`hsRules.ts`'s `contractor_status_changed`/`permit_status_changed`/
`isolation_applied` rules widened from `staffOnly` to also tell the
client's own admins, per each rule's own "widen to `admins()` once
that page exists" comment — now true, following Groups 2-4. Each keeps
its staff notification (admin link corrected to the specific per-record
admin page, e.g. `/health-safety/<id>/contractors` instead of the
generic `/health-safety/<id>` root) and gains a client one (portal
link, no company-name prefix). `rules.test.ts`'s own "every client
notification has a portal link" scan passes.

`attentionQueue.ts` gained `siteId`/`siteName` on every item (`null`
except for genuinely site-scoped rows) and three new source categories
that did not exist before this group: permits suspended/revoked
(the exact condition `permit_status_changed` already treats as worth a
nudge), an isolation still `applied` (not yet verified — distinct from
the existing equipment item, which only says the asset is unavailable,
never whether the isolation itself has been checked), and an
environmental monitoring exceedance within a 30-day recency window
(insert-only, so recency is the only "still worth attention" signal).
The equipment item's stale "no dedicated portal page today" contractor
link was fixed to `/protect/contractors`, and it now carries the
asset's own site. Deliberately no site on the contractor category —
150's own table has no `site_id`, a contractor is company-wide.
`loadAttentionQueue.ts` fetches the three new tables plus `hs_sites`,
all scoped to the caller's authorised org ids via the existing
`portfolioOrgIds()` filter — no new tenant-scoping mechanism, the same
one every other query in that file already uses.

## Adversarial QA (this Group 7 pass)

Beyond the cross-tenant contractor/permit/isolation checks already
cited under Groups 2-4, three more items from the Master Spec's own
Phase 22 QA command were checked:

- **Permit self-authorisation** (155, from Phase 4's own adversarial
  security review): re-verified LIVE, not merely assumed unaffected —
  a real Andrews Recruitment Group person with an `auth.users`-linked
  account, set as a permit's own `authorised_person_id`, attempting to
  issue that SAME permit under their own session. Refused, `ERRCODE
  23514`. Confirms migration 155's guard is intact and this phase's
  changes (a different table, `consultancy_visits`, and a different
  concern, environmental monitoring's limit shape) did not weaken it.
- **LOTO lock removal by another worker** (`isolation_locks_guard()`,
  153): NOT re-run live this phase — migration 153 was not touched by
  any group here, and its own probe (16/16, recorded at ship time)
  already proves the override-requires-a-different-authoriser rule.
  Re-testing unchanged code with no relationship to this phase's own
  changes was judged not a good use of this phase's QA budget; cited
  rather than re-derived.
- **Invalid `consultancy_visits` status jumps via direct API**: this
  IS Group 1's own subject — see the 12/12 probe above (checks 4, 7,
  9, 11 are exactly this: backward jumps, terminal-state re-entry, and
  skip-ahead jumps, all refused with `23514`). The guard is a database
  trigger, so "via direct API" and "via the UI" are the same boundary —
  there is no separate application-layer check to bypass.

## Mobile/tablet verification (C2.7, C2.8, C4.14)

**Not browser-tested in this sandbox — no device/browser testing
capability is available here.** This is the same honest limitation
this Completion Programme's own Phase 21 handover recorded for a
different item, and the Master Spec's own Completion Claim Rule
forbids claiming this closed without evidence. What WAS done, as a
documented, code-level check rather than a claim of full verification:

- Every new component built in Groups 2-6
  (`ContractorsClient`/`PermitsClient`/`IsolationsClient`/
  `EnvironmentalMonitoringClient`'s edits) reuses the platform's
  existing `.card`/`.input`/`.btn-*`/`table-wrapper` CSS classes
  exclusively — no new bespoke stylesheet, no fixed non-responsive
  width introduced. The handful of `style={{ minWidth: '...' }}`
  declarations added (the permit checklist form, the template-item
  form) are `min-width` inside a `flex flex-wrap` container, the
  identical, already-shipped pattern `AddLockForm`'s own `style={{
  width: '10rem' }}` in the pre-existing `IsolationsClient.tsx` uses —
  not a new pattern this phase invented.
- No `hover`-only interaction was added: every action in the new
  components is a `<button>`/`<select>`/`<input>`, all touch-operable
  by construction.
- This item stays **open** as a genuine gap: real on-device/browser
  verification (per the Master Spec's own C2.7/C2.8/C4.14 wording) has
  not happened and should not be reported as done. Flagged here for
  the operator, not silently dropped from the gap ledger.

## Security / tenancy review

Beyond the live checks already cited above:

- **No new RLS policy, no new capability grant, anywhere in Groups
  2-4** — verified by design (the `client_admin` → `organisation_admin`
  → `contractors.manage` chain already existed since Phase 4) and by
  the live probes finding no gap to close.
- **Migration 186's range guard** is a `BEFORE INSERT` trigger, so an
  inverted range can never reach a stored row via any path — proven by
  the live probe, not merely reasoned about.
- **Migration 185's guard applies to every session**, staff included —
  no exemption branch exists in the function, matching the sibling
  `permits_lifecycle_guard()`/`isolations_lifecycle_guard()` shape
  exactly (neither of those has a staff exemption either).
- **The Attention Queue's new site-scoped reads carry no new
  tenant-scoping risk**: all three new queries in `loadAttentionQueue.ts`
  use the identical `.in('company_id', orgIds)` filter every one of the
  twelve pre-existing queries in that file already uses, where `orgIds`
  is derived from the caller's own `portfolioOrgIds(portfolio.
  organisations)` — a value the session cannot influence.

## Protected legacy regression results

Not applicable — this phase touched no protected-legacy system
(Referrals, A2I, Development Plans, E-Learning marketplace, Broadcast,
Billing).

## Known remaining issues, with severity

- **Low (documented, not fixed)**: real mobile/tablet browser testing
  for C2.7/C2.8/C4.14 was not performed — see the dedicated section
  above. This is an honest open item, not a silent gap.
- **Everything else** in this phase's assigned gap ledger (C2.7 read as
  "verify the mechanism exists", C4.13, C4.11, C4.12, C5.3) is closed
  with live evidence.

## Full regression

tsc clean both apps at every group boundary. Final counts: admin
vitest **1660** (up from 1648 at the start of this phase — +8
`visitLifecycleGuardSql.test.ts`, +1 `vocab.test.ts` case, +10
`environmentalMonitoringLimitDirectionSql.test.ts`, existing
`hsRules.test.ts` cases widened rather than added); portal vitest
**773** (up from 760 — +9 from the three new routes' automatic
`portalPagesLinked`/`clientServerBoundary` sweep coverage, +4 new
`attentionQueue.test.ts` cases). All six CI guards pass at every group
boundary (63 shared-dupe pairs, up from 60 — the three new portal
components registered). Both production builds compile at every group
boundary (portal's one prerender failure is the long-documented,
sandbox-only missing-`NEXT_PUBLIC_SUPABASE_*`-env-var limitation,
unrelated to this phase and present since Phase 5).

Two migrations (185, 186) applied and live-probed in rolled-back
transactions, 24/24 checks total across their own probes, plus 8/8
adversarial cross-tenant/self-authorisation checks in this Group 7
pass — 32/32 live database checks total this phase, all passing on
first re-run after any fix (no defect found requiring a correction).

## Gate status

**PASS WITH ONE OPEN ITEM.** Rationale: six of the seven gap-ledger
rows assigned to this phase (C2.8, C4.11, C4.12, C4.13, C5.3, and C2.7
read as "the mechanism exists and is correctly gated") are closed with
live database evidence — a real database-level lifecycle guard proven
against 12 transition scenarios, a real client-facing RLS gap that
turned out not to be an RLS gap at all (verified live before writing
any UI), genuine new checklist-response functionality, a real
lower/range-bound limit extension proven not to alter a single existing
row's stored value, and site-aware attention-queue/notification
widening proven against the existing tenant-scoping mechanism. C4.14
(mobile/tablet, folded together with C2.7/C2.8 in the gap ledger's own
grouping) is the one item genuinely NOT closed — no device/browser
testing capability exists in this environment, and per the Master
Spec's own Completion Claim Rule this is reported as open rather than
claimed. No Critical or High defect found in this phase's own
adversarial pass; the one Medium-adjacent risk considered (a portal
session gaining unintended write access to contractors/permits/
isolations) was proven, live, to be exactly the access the existing
RLS already intended for a `client_admin`, not a new hole.

**Phase 23 (Risk Graph/Evidence Engine/Digital Twin completion) may
begin** once this branch merges, per the Master Spec's own
sequential-gate rule — noting C4.14's mobile/tablet verification as
carried-forward, unclosed debt for whichever future pass has real
device-testing capability.
