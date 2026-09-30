# Core-OS 360 Phase 24 Handover — Consultant Command Centre / Ledger completion

Part of the Core-OS 360 Completion Programme (Phases 20-29), per
`Core-OS 360_Remaining-Phases_Claude-Code_Master-Spec.docx`. Closes
four of the five gap-ledger rows Phase 20 assigned to Phase 24
(C1.9, C6.13, C6.14, C6.15 fully; C1.12 partially — the
`consultancy_visit_reports` slice, per the reasoning below), read
fresh from `docs/CORE_OS_360_COMPLETION_MATRIX.md`'s own gap ledger
at the start of this phase, not assumed from any prior handover.

## What was required

Per the completion matrix's own gap ledger for this phase:

1. Optimistic locking on shared records (C1.12, shared with Phase 28
   — only the Phase-24-relevant slice is this phase's to close).
2. A portal UI for consultancy owners to grant access — Phase 1's own
   handover left `grant_organisation_access()`/
   `revoke_organisation_access()` (117) as "RPC ready, no UI" (C1.9).
3. Site-level drilldown so a portfolio issue resolves to the
   responsible client/site/record (C6.13).
4. Communication Timeline pagination/filtering (C6.14).
5. Visit reports as a Communication Timeline source (C6.15).

## What was found before any code was written

Read `consultancy_visit_reports`' live triggers, the RPCs in
migration 117, `loadAttentionQueue.ts`, and `communicationTimeline.ts`
in full before writing a line of Phase 24 code. Three findings
directly changed the plan:

- **C1.12's Phase-24 slice is ONE table, not three.** The gap-ledger
  row names "shared records" generically; checking live found
  `consultancy_service_scopes` has no UPDATE writer anywhere (its one
  write route is insert-only) and `consultancy_visits`' status
  transitions already refuse a race via `consultancy_visits_lifecycle_
  guard()` (185, Phase 22) — a double-click's second call finds
  `OLD.status` no longer matching an allowed source state. Only
  `consultancy_visit_reports`' free-text draft save
  (`ReportBuilderClient.tsx`'s `saveDraft()`) had no protection of any
  kind.
- **C1.9 needed no new migration.** `grant_organisation_access()`/
  `revoke_organisation_access()` have existed, fully guarded (self-grant
  refusal, role-grantability, live-relationship checks), since the very
  first Core-OS 360 migration — this phase only needed to give them
  their first caller.
- **C6.15's own visit report source was genuinely missing**, not just
  unverified: `communicationTimeline.ts` had no `VisitReportRow` input
  of any kind. Built first (Group 5, ordered ahead of Group 4 in the
  work itself) so Group 4's filtering/pagination automatically covers
  the new source too, rather than needing a second pass.

## What was built, group by group

### Group 1 (migration 190): row_version optimistic lock (the Phase-24 slice of C1.12)

`consultancy_visit_report_fill()`/`_touch()` (176) extended in place —
the same pattern this codebase already uses throughout (123's hazard/
RA guards, 124's RAMS/COSHH guards, 125's incident guard): `row_version`
forced to 1 on INSERT and to `OLD.row_version + 1` on every UPDATE
**regardless of what the caller sent**, so a client's conditional
`.eq('row_version', ...)` update is an honest lock check, never a
value a caller could game. `ReportBuilderClient.tsx`'s `saveDraft()`
now conditions on it; a lost race (0 rows, no error) surfaces as
"Someone else changed this draft since you opened it." — the exact
`RamsHeaderEditor.tsx` precedent.

Live probe (`supabase/probes/190_visit_report_optimistic_locking.sql`,
rolled back, two real live companies with a fabricated, rolled-back
`consultancy_client` relationship — no live `organisation_relationships`
rows exist at rest, confirmed before writing the probe): 6 checks —
row_version starts at 1; a normal save increments it; a stale-tab save
using the original row_version is a silent 0-row no-op; the content is
proven unchanged; the trigger ignores a caller-sent `row_version = 999`
cheat and still advances to exactly `OLD + 1`; `visit_id` stays
immutable. All 6 passed.

### Group 2: portal UI for consultancy owners to grant access (C1.9)

`/consultancy/access` (new portal page, linked from the Command Centre
home): gated by `requirePortfolioSession()` plus a live
`has_capability(home, 'consultancy.manage_access')` RPC check — a
portfolio user without that capability sees a plain "you do not
manage access grants" state, never a redirect. Reads run under RLS,
not the service role: colleagues (`profiles`, `company_id = home`),
live `consultancy_client` relationships, roles marked
`consultancy_grantable`, and the caller's own visible grants
(`user_organisation_access`'s existing "a consultancy manager sees the
grants of their own people" policy, unchanged). Names for pickers AND
for any grant referencing an id outside the "currently offerable"
sets (a stale grant against a lapsed relationship) are resolved by
by-id-list queries, the established "fetch by id list, never a
chained embed" discipline.

`AccessGrantClient.tsx` calls the two RPCs by name
(`grant_organisation_access`/`revoke_organisation_access`) and surfaces
every refusal verbatim via toast — no client-side pre-validation of
who may grant what, since the RPCs are their own complete security
boundary. `ACCESS_SCOPES`/`ACCESS_SCOPE_LABELS` added to `vocab.ts`
(shared-dupe pair), pinned against migration 117's own
`access_scope` CHECK by a new SQL-shape test
(`accessGrantSql.test.ts`, 8 cases) that also pins both RPCs' exact
parameter names/order (what the client component calls by name),
their SECURITY DEFINER + `authenticated`-only grants, the self-grant
refusal, the `consultancy_grantable` check, the live-relationship
date-range check, and the colleague-scoped read policy text.

### Group 3: site-level Command Centre drilldown (C6.13)

`/consultancy/clients/[id]/sites/[siteId]` — never re-derives the
Attention Queue, calls the SAME `loadAttentionQueue()` the
`/consultancy/attention-queue` page already uses and filters
client-side to the one client/site pair, so the two views can never
disagree about what counts as an open issue. The Attention Queue's own
Site column is now a link to this page wherever an item carries a
`siteId` (unchanged, plain text, when it doesn't — the contractor
category has no site of its own by design, 150's own table has no
`site_id` column).

### Groups 4-5: Communication Timeline pagination/filtering + visit-report source (C6.14, C6.15)

`communicationTimeline.ts` gains a `visit_report_issued`
`CommunicationKind` and a `VisitReportIssuedRow { id, version,
issued_at }` input — always `visibility: 'shared_with_client'`, dated
by `issued_at` never `created_at` (a draft can sit unpublished for
days; only the issue itself is a communication event). The file needs
no status check of its own: only `status = 'issued'` rows are ever
passed in by the caller. Client 360's new query matches every other
source query on the page (capped, ordered, company-scoped).

Client 360's rendering changed from a hard `.slice(0, 30)` with no way
to see more or narrow it down, to `searchParams`-based kind/visibility
filters (`FilterForm`, `components/safety/FilterForm.tsx` — an
existing, generic, reusable plain-GET-form component, reused
unchanged) and Prev/Next pagination copying the admin Candidates-table
idiom verbatim (`hiring/[id]/page.tsx`, 2026-09-04: a disabled Prev/
Next is a `<span>`, never a `<Link>` with `pointerEvents: none`).
Filtering and pagination both run server-side over the already-bounded,
already-merged timeline array — no second query, since every source
query on the page is already capped at 10-20 rows.

## Adversarial review performed in this pass

A dedicated review pass across all five groups, checking for defects
the groups' own verification might have missed:

- **`ReportBuilderClient.tsx`'s row_version propagation after save**:
  confirmed the parent server page re-fetches the report row (and its
  fresh `row_version`) via `router.refresh()`, so a second save after
  the first always conditions on the CURRENT version, never a stale
  one cached in client state.
- **`/consultancy/access`'s self-grant exclusion**: the colleagues
  picker deliberately does NOT filter out the caller's own id — a
  self-grant attempt is refused by the RPC itself
  (`p_user = auth.uid() AND NOT is_tps_staff()`), matching the page's
  own documented design ("the database decides, not the page").
  Verified this is the RPC's own existing, already-tested behaviour,
  not a new gap.
- **Site drilldown cross-tenant scoping**: `hs_sites` is queried with
  both `.eq('id', siteId)` AND `.eq('company_id', id)` together, so a
  site id belonging to a different (even an authorised) client 404s
  rather than silently resolving to the wrong client's site.
- **Communication Timeline pagination beyond the last real page**: a
  manually-crafted `?page=999` URL produces an empty `timeline` slice
  with no error — the SAME behaviour the established admin Candidates-
  table pagination idiom already has (neither clamps the page number
  to the real total; PostgREST-backed or in-memory, an out-of-range
  page returns zero rows, not an error). Confirmed this matches
  existing codebase convention rather than being a new defect to fix.
- **`FilterForm`'s implicit GET-form action**: confirmed (by reading
  its own usage in `lead/workforce/catalogue/page.tsx`, an already-
  shipped, already-tested caller) that a `<form method="get">` with no
  `action` attribute submits to the current page path with the form's
  own fields as the new query string, correctly dropping any filters
  not present in the form (i.e. `page`, resetting to page 1 on every
  filter change) — not a new assumption, a verified existing pattern.
- **`communicationTimeline.ts`'s own header comment**: found one stale
  cross-reference ("one of the four kinds above") left over from
  before this phase added a fifth `shared_with_client`-producing kind;
  corrected to avoid asserting a count that was no longer accurate —
  a comment-only fix, no behaviour change.

No Critical, High or Medium defect was found in this pass.

## Protected legacy regression results

Not applicable — this phase touched no protected-legacy system
(Referrals, A2I, Development Plans, E-Learning marketplace, Broadcast,
Billing).

## Known remaining issues, with severity

- **C1.12 is only PARTIALLY closed by this phase, by design.** The
  general optimistic-locking hardening the gap-ledger row's own
  one-line description implies (beyond the three consultancy tables
  checked here) remains assigned to Phase 28, per the matrix's own
  existing `24/28` split. Not a defect — the Phase-24 slice (the one
  genuinely unprotected concurrent-edit path reachable through this
  phase's own subsystem) is fully closed.

## Full regression

tsc clean both apps at every group boundary. Final counts: admin
vitest **1724** (up from 1709 at the start of this phase — +7
`visitReportOptimisticLockingSql.test.ts` (Group 1), +8
`accessGrantSql.test.ts` (Group 2), no new admin tests for Groups 3-5,
which touched portal only); portal vitest **809** (up from 804 — +1
new `communicationTimeline.test.ts` case for the visit-report kind
(Group 5); Groups 2-3's new pages/components have no component-level
test, this codebase's established convention, but are covered
automatically by the `portalPagesLinked.test.ts`/
`clientServerBoundary.test.ts` sweeps picking up the new routes).
All six CI guards pass at every group boundary (66 shared-dupe pairs,
unchanged — this phase touched no shared-dupe file beyond `vocab.ts`,
already a registered pair; row-cap clean; 44 unvalidated routes,
unchanged; 43 static admin routes, all reachable — this phase added
no new admin route; 102 blind-update chains, unchanged — the one new
counted UPDATE this phase added, `ReportBuilderClient.tsx`'s
`saveDraft()`, was built with `COUNT_EXACT`/`judgeWrite()` from the
start; every paged query's `.order()` present). Both production builds
compile at every group boundary (portal's one prerender failure is the
long-documented, sandbox-only missing-`NEXT_PUBLIC_SUPABASE_*`-env-var
limitation, unrelated to this phase and present since Phase 5).

One migration (190) applied and live-probed in a rolled-back
transaction: 6/6 checks passed.

## Gate status

**PASS.** Four of five gap-ledger rows assigned to this phase are
fully closed with live database evidence (C1.9, C6.13, C6.14, C6.15);
the fifth (C1.12) is closed for its genuine Phase-24 slice, with the
remainder correctly left to Phase 28 per the matrix's own existing
split, not silently dropped. A dedicated adversarial review pass found
no Critical, High or Medium defect; the one correction made (a stale
comment cross-reference in `communicationTimeline.ts`) is
documentation-only.

**Phase 25 may begin** once this branch merges, per the Master Spec's
own sequential-gate rule. Its scope should be read fresh from
`docs/CORE_OS_360_COMPLETION_MATRIX.md`'s own gap ledger rather than
assumed, following the same "repository reality beats handover
narrative" discipline this phase and every phase since Phase 20 has
used.
