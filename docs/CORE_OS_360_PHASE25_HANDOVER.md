# Core-OS 360 Phase 25 Handover — Operational Intelligence / Regulatory / Broadcast completion

Part of the Core-OS 360 Completion Programme (Phases 20-29), per
`Core-OS 360_Remaining-Phases_Claude-Code_Master-Spec.docx`. Closes
all seven gap-ledger rows Phase 20 assigned to Phase 25 (C1.11, C9.4,
C9.5, C10.4, C17.5, C17.6, C17.7), read fresh from `docs/
CORE_OS_360_COMPLETION_MATRIX.md`'s own gap ledger at the start of
this phase, not assumed from any prior handover.

## What was required

Per the completion matrix's own gap ledger for this phase:

1. Broadcast idempotency — a double-click or a timed-out retry must
   not send the same broadcast twice (C1.11).
2. Client-facing "What Changed?" — the Phase 9 staff-only daily
   operational summary needed a client-appropriate equivalent (C9.4).
3. A scheduled "What Changed?" digest, opt-in, with dedup (C9.5).
4. A user-configurable incident-pattern analysis window, bounded, with
   the existing fairness guarantee preserved (C10.4).
5. A manual-entry UI for Legal Register research notes, alongside
   Tavily's own notes, with matching provenance (C17.5).
6. Concurrent review/update handling on those research notes — no
   silent overwrite (C17.6).
7. The full regulatory-change flow traced end to end: research →
   human-reviewed change → Broadcast → actions → completion tracking
   (C17.7).

## What was found before any code was written

- **C1.11 had no precedent to copy directly.** The closest shapes in
  this codebase (`sendKeyedEmail`'s `email_log.dedupe_key` claim, the
  visit-report-issue route's claim-first/compensate-on-failure
  restructure from Phase 7 Group 8) both claim against an EXISTING
  row tied to a DIFFERENT primary action. Broadcast has no natural row
  to claim against before it does its own work — a fresh idempotency
  table (`broadcast_sends`), keyed by a CLIENT-GENERATED key the
  browser can safely retry with, was the right shape, not a repurposed
  existing table.
- **C17.6 needed a genuinely new rule none of the prior `row_version`
  precedents (123's hazard/RA guards, 124's RAMS/COSHH guards, 125's
  incident guard, 176's visit-report guard, 190's Phase-24 extension
  of it) had needed**: those tables all allow CONTENT to keep changing
  indefinitely (a draft is edited, a hazard assessment is revised).
  `legal_requirement_research_notes` is different — once a search
  result is recorded, the RESULT itself (`raw_result_summary`,
  `query_used`, `source`) must never change; only the human REVIEW of
  it (`reviewed_by`/`reviewed_at`/`action_taken`) may. This is closer
  to the register's "a correction is a new row" discipline than to
  optimistic locking on a mutable draft — but the Legal Register
  catalogue's existing UI already has one row per search and no
  "supersede" concept, so the right fix was narrower: keep `row_version`
  for locking the REVIEW fields specifically, and make the content
  columns immutable by trigger rather than inventing a new
  versioning scheme for a table that never needed one before.
- **C9.4's obvious approach (grant clients a read policy on
  `platform_events`) was rejected before writing any SQL.** That table
  carries every entity type's outbox payload, including staff-internal
  ones (e.g. `referral_scan_runs`, `bd_companies`) a client must never
  see. The established "service-role-mediated scoped read" pattern
  (Board Assurance, Digital Twin) was the right fit instead — no RLS
  change, no migration, a curated allowlist deciding what a client may
  see.
- **C17.7's vocabulary was ALREADY anticipated but never wired up.**
  `actions.source_type`'s CHECK already listed `'regulatory_broadcast'`
  and `'broadcast'` (from an earlier phase's own forward-looking CHECK
  design) with no writer ever setting either value. Before choosing
  which one to use, `legalRegisterRules.ts` was checked for a
  colliding existing use of `'legal_requirement'` — confirmed it
  already writes that value with a DIFFERENT id-space meaning (a
  direct requirement-to-action link, not a broadcast-to-action one),
  so reusing it here would have silently merged two unrelated
  `source_id` spaces. `'regulatory_broadcast'` was the correct, unused
  choice.

## What was built, group by group

### Group 1 (migration 191): Broadcast idempotency (C1.11)

`broadcast_sends` — a client-generated key (a UUID minted in
`BroadcastClient.tsx` when the send is first attempted, carried
through any retry) as the table's PRIMARY KEY. `POST /api/broadcast`
now:

1. Inserts the key FIRST, before any action-creation or email-sending
   work — a duplicate-key error means "already sent, do nothing" and
   the route returns `{ created: 0, duplicate: true }`.
2. Does the real work (one `actions` row per company, emails) only
   after the claim succeeds.
3. On ANY failure during that work, deletes the claimed row so a
   genuine retry (not a duplicate) can still proceed.

Staff-only RLS, no write guard (no client-writable policy exists to
guard), no `audit_row()` trigger (an internal idempotency artefact,
not a record of a business fact worth auditing on its own — the send
itself is already audited via the `actions` rows it creates).

`broadcastIdempotencySql.test.ts` pins the table shape; `route.test.ts`
gained 5 new cases: a first send claims and proceeds; a duplicate key
short-circuits with zero new actions/emails; a claimed-then-failed
send releases the claim; a released claim allows a genuine retry to
succeed; the claim always precedes any action-creation call in the
mock's own call order.

### Group 2 (migration 192): Legal Register research notes — row_version + manual entry (C17.5, C17.6)

`row_version` added to `legal_requirement_research_notes`, with
fill/touch triggers forcing the counter to 1 on INSERT and
`OLD.row_version + 1` on every UPDATE regardless of caller input — the
established pattern. The NEW rule this table needed beyond that
precedent: content columns (`raw_result_summary`, `query_used`,
`source`) are refused on any UPDATE that changes them — only
`reviewed_by`/`reviewed_at`/`action_taken` may move. "Mark reviewed"
in `LegalRequirementsCatalogueClient.tsx` is now a conditional
`.eq('row_version', ...)` update; a lost race (0 rows, no error)
surfaces the same "someone else reviewed this since you opened it"
message the `RamsHeaderEditor.tsx`/`ReportBuilderClient.tsx` precedents
already use.

The manual-entry form inserts a note with `source: 'manual'`,
rendered in the same list as Tavily's `source: 'tavily'` notes with
the identical provenance badge styling — no separate UI section, no
separate vocabulary.

`legalResearchNotesRowVersionSql.test.ts` pins: `row_version` starts
at 1; the fill/touch triggers force it regardless of caller input; an
UPDATE attempting to change `raw_result_summary`/`query_used`/`source`
is refused; an UPDATE touching only the review fields succeeds and
still advances `row_version`.

### Group 3: configurable incident-pattern analysis window (C10.4)

`incidentPatternWindows()` (pre-existing, Phase 10) was already fully
generic over its `days` parameter — only the UI/route layer
artificially restricted it to the 30/90/365 preset buttons. The fix
was narrow: a new `clampWindowDays(requested)` (shared-dupe pair,
`MIN_WINDOW_DAYS`/`MAX_WINDOW_DAYS`) bounds a user-supplied `?days=`
to a safe range SERVER-SIDE before it ever reaches the
window-fairness computation — so the equal-length comparison
guarantee `incidentPatternWindows()` already provides is preserved
regardless of what a caller requests, never weakened by letting an
out-of-range value through. Both apps' `IncidentPatternsView.tsx`
gained a custom-window input alongside the existing presets; both
`page.tsx` files (`/health-safety/<companyId>/incident-patterns`,
`/protect/incident-patterns`) switched from the hardcoded preset set
to `clampWindowDays()`.

`analyze.test.ts` gained a `clampWindowDays` describe block (6 cases):
below minimum clamps up, above maximum clamps down, a value inside
the range passes through unchanged, the boundary values themselves
are accepted exactly, a non-numeric/NaN input falls back to the
default window.

### Group 4: client-facing What Changed? (C9.4)

`/protect/what-changed` reuses `computeWhatChanged()` (Phase 9,
promoted to a shared-dupe pair in this group) via a
service-role-mediated read of `platform_events`, scoped by a LIVE
`effectiveCompanyId()` lookup under the caller's own session (never
the cached-cookie company, matching every other `/protect/*` page's
existing discipline).

The genuinely new piece: `lib/whatChanged/clientScope.ts` (new
shared-dupe pair) curates exactly which entity types are
client-appropriate — an explicit allowlist, not a blocklist, pinned
by a test (`clientScope.test.ts`) against the REAL `TRIGGERED_ENTITIES`
array so a newly-added entity type can neither silently disappear from
the client view (an allowlist that never gets updated) nor silently
leak an internal type into it (a blocklist that forgets to list a new
one). `TRIGGERED_ENTITIES` staff-internal entries (referral scan runs,
BD companies, and similar) are explicitly excluded with documented
reasoning per exclusion.

### Group 5 (migration 193): scheduled digest with preferences + dedup (C9.5)

`notification_preferences.what_changed_digest` — `'off' | 'daily' |
'weekly'`, defaulting to `'off'` (explicit opt-in, matching the
established IvyLens `ai_assist`/referral `dry_run` caution precedent
for a brand-new automation feature; a stated `NotificationPrefsForm.tsx`
UI, shared-dupe pair, lets a `client_admin` turn it on).

`/api/cron/what-changed-digest` (new, 07:10 UTC daily — ahead of the
06:00 reminders sweep's downstream consumers but after enough of the
prior day's events have settled; weekly-mode recipients are processed
only when the cron runs on a Monday, merging both cadences into ONE
scheduled job rather than two separate crons, a deliberate deviation
from the `weeklySummary.ts` precedent's separate-schedule approach —
justified by how much of the query/render logic the two cadences
share). Sends via `sendKeyedEmail`'s existing claim-before-send
pattern (dedupe key includes recipient + date + mode), so a re-run of
the cron sends nothing twice, and a recipient with nothing to report
in their window gets no email at all (never an empty "nothing
changed" message).

`digest.test.ts` (7 cases, two separate fixture sets — one for a
Tuesday run proving daily aggregation, one for a Monday run proving
genuine weekly aggregation with an event dated inside the weekly
window but outside the daily one) and `route.test.ts` (3 cases) cover
the cron's control flow; `whatChangedDigestPreferenceSql.test.ts`
pins the migration.

### Group 6 (migration 194): full regulatory-change flow tracing (C17.7)

`broadcast_sends.source_type`/`source_id` (nullable, CHECK-restricted
to `'legal_requirement' | 'regulatory_update'`, must be set together)
trace a Broadcast send back to its origin — the Legal Register
catalogue's existing "Broadcast" link and `latest_updates`'
regulatory-classification flow both now pass this through.
`admin/src/app/(admin)/broadcast/page.tsx`'s prefill functions and the
`POST /api/broadcast` schema were both widened to carry it end to end.

Raised `actions` rows carry `source_type: 'regulatory_broadcast'` /
`source_id: <broadcast_sends key>` — a documented TWO-HOP trace
(action → send → origin, not action → origin directly), chosen
specifically to avoid the `'legal_requirement'` semantic collision
identified during reconnaissance (see above).

`lib/broadcast/rollup.ts`'s `groupBroadcastActions()` re-assembles the
per-company `actions` rows a single send produced back into one
bucket per send — keyed by `source_id` when present, falling back to
a title/description/timestamp heuristic for hand-typed broadcasts
that carry no `source_id` at all. Buckets from two DIFFERENT sends
that happen to share a title are proven to stay distinct (a
dedicated test case). `RecentBroadcasts.tsx` was rewritten to render
per-bucket rows instead of per-action rows, adding a Completion
column (`N of M actions complete`) and a "Regulatory" badge —
completing the acknowledgement/evidence/completion tracking loop the
Phase 20 matrix's PARTIAL status had flagged as missing.

`rollup.test.ts` (6 cases) and `broadcastRegulatoryOriginSql.test.ts`
(3 cases) cover the new grouping logic and the migration shape;
`route.test.ts` gained 4 more cases for the widened schema and the
new `actions` rows' `source_type`/`source_id`.

## Adversarial review performed in this pass

A dedicated review pass across all six groups:

- **Broadcast claim-revert race**: confirmed the claim INSERT and the
  compensating DELETE-on-failure both run against the SAME primary key
  the browser generated, so a genuine concurrent double-click from two
  tabs still only ever lets one claim through — the second's insert
  fails with the real unique-violation, never a race window where both
  could succeed.
- **Legal Register concurrent-review race**: confirmed a lost
  `row_version` race surfaces the stale-write message and does NOT
  silently proceed with a half-applied review — the conditional update
  either matches exactly one row or zero, never a partial write.
- **Server-side authority of the incident-pattern window clamp**:
  confirmed `clampWindowDays()` runs in the page/route layer, not only
  client-side validation — a hand-crafted `?days=99999` URL is clamped
  server-side before the window-fairness computation ever sees it,
  never trusted from the query string.
- **Cross-tenant leak surface on `/protect/what-changed`**: confirmed
  the service-role read is scoped by a LIVE session-derived company id
  (`effectiveCompanyId()`, re-checked on every render, never a cached
  cookie value) — the same discipline every other `/protect/*`
  service-role-mediated page already follows, not a new pattern
  introduced without that scoping.
- **Digest recipient/mode uniqueness**: confirmed the dedupe key
  includes both the recipient and the calendar date/week, so a
  recipient who is BOTH a daily and (hypothetically, were the schema
  to allow it) weekly subscriber could never receive two emails for
  the same underlying content — moot in practice since the preference
  is a single enum, but verified rather than assumed.
- **`broadcast_sends.source_id` validation**: found and accepted as a
  documented, low-severity scope limitation — the column is an
  unvalidated foreign-key-shaped uuid (no FK constraint, since it
  points at one of two different tables depending on `source_type`).
  This is staff-only internal tooling (the Broadcast page is
  `requireStaff()`-gated throughout), and matches the established
  "plain paste id" precedent already used elsewhere in this codebase
  (`standard_evidence_links`, `requirement_evidence_links`,
  `lessons_learned`'s "drawn from" field) — not a new pattern invented
  carelessly for this phase.

No Critical, High or Medium defect was found requiring a code change
in this pass.

## Protected legacy regression results

Not applicable — this phase touched no protected-legacy system
(Referrals, A2I, Development Plans, E-Learning marketplace, Billing).
Broadcast itself IS one of the four systems the matrix tracks
preservation coverage for (`PROTECTED_LEGACY_REGRESSION_SCRIPTS.md`'s
own "Broadcast" section, closed in Phase 20) — its existing
`broadcast/__tests__/route.test.ts` suite was extended in place
(Groups 1 and 6), never replaced, and every pre-existing case in that
file remained green throughout.

## Known remaining issues, with severity

None found in this phase requiring a new gap-ledger row. All seven
assigned rows close cleanly with no partial carry-forward (unlike
Phase 24's C1.12, which had a genuine, documented partial-closure
reason).

## Full regression

tsc clean both apps. Final counts: admin vitest **1775 passed / 177
test files** (up from 1724 at the start of this phase); portal vitest
**811 passed / 56 test files** (up from 809). All six CI guards pass:
`check-shared-dupes.sh` — **68 shared-dupe pairs** (up from 66:
`lib/whatChanged/clientScope.ts` and `lib/whatChanged/compute.ts`,
Group 4); `check-row-cap.sh` — clean; `check-route-validation.sh` — 44
unvalidated routes, unchanged; `check-admin-routes-linked.sh` — 43
static admin routes, all reachable, unchanged (this phase's one new
page, `/protect/what-changed`, is portal-only); `check-blind-updates.sh`
— 102 blind-update chains, unchanged (every new/changed write in this
phase — the Broadcast claim/revert, the Legal Register "Mark
reviewed" — is a conditional insert/update carrying an explicit count
check from the start); `check-paged-order.sh` — clean, no regression.
Both production builds compile (portal's one prerender failure is the
long-documented, sandbox-only missing-`NEXT_PUBLIC_SUPABASE_*`-env-var
limitation on `/auth/reset-password`, unrelated to this phase and
present since Phase 5 — confirmed "Compiled successfully" completes
cleanly before that unrelated page's static-export step fails).

Four migrations (191, 192, 193, 194) applied and live-probed in
rolled-back transactions throughout the phase's six implementation
groups; all live probe checks passed (no live probe reported a
failure at any point in this phase).

## Gate status

**PASS.** All seven gap-ledger rows assigned to this phase are fully
closed with test evidence and, for every migration-bearing group, live
database verification. A dedicated adversarial review pass across all
six groups found no Critical, High or Medium defect — one accepted,
documented, low-severity scope limitation (`broadcast_sends.source_id`
left unvalidated, staff-only internal tooling matching an established
codebase precedent) was identified and is not carried forward as a
gap-ledger row.

**Phase 26 may begin** once this branch merges, per the Master Spec's
own sequential-gate rule. Its scope should be read fresh from
`docs/CORE_OS_360_COMPLETION_MATRIX.md`'s own gap ledger rather than
assumed, following the same "repository reality beats handover
narrative" discipline this phase and every phase since Phase 20 has
used.
