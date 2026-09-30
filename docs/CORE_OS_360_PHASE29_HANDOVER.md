# Core-OS 360 Phase 29 Handover — Security, Regression & Production Certification (the final gate)

Part of the Core-OS 360 Completion Programme (Phases 20-29), per
`Core-OS 360_Remaining-Phases_Claude-Code_Master-Spec.docx`. Closes the
two gap-ledger rows the completion matrix assigned to this phase — **C19.9**
and **PL.1** — read fresh from `docs/CORE_OS_360_COMPLETION_MATRIX.md`'s own
gap ledger at the start of this phase, not assumed from any prior summary.
Full survey and design reasoning: `docs/CORE_OS_360_PHASE29_PLAN.md`.

The matrix's own words describe why this phase matters more than its two-row
scope suggests: **"Every row in this ledger must close... before Phase 29's
final gate."** This is not one more phase among many — it is the Completion
Programme's own closing gate. Its job is twofold: close its own two rows, and
verify every other phase's own closure claim still holds under one final,
skeptical pass.

## What was required

Per the completion matrix's own gap ledger for this phase:

1. **C19.9** — "No automated guard yet for `readAllPages()` never wrapped at
   all — the worse variant of C19.5" (Phase 19's own handover, and the
   `check-paged-order.sh` guard's own documented blind spot).
2. **PL.1** — "Real automated preservation tests for A2I signup, Development
   Plans, E-Learning checkout/webhook, Billing/Invoicing" — the four
   Protected Legacy systems Phase 20's own audit found with `NONE` or
   `UNIT-ONLY` test coverage, each carrying only a manual regression script
   (`docs/PROTECTED_LEGACY_REGRESSION_SCRIPTS.md`) as its interim baseline.

## Group 1: C19.9 — the seventh CI guard

`check-row-cap.sh` catches an author-specified `.limit(N>1000)`.
`check-paged-order.sh` catches a paged-query-builder's `.range(from, to)`
with no preceding `.order(...)`. Neither catches the WORSE shape this
codebase has hit twice before (`lib/complianceTwin/loadSnapshot.ts`'s
`hs_links` reads, and the original Phase 8 admin risk-graph page's `hs_links`
reads): a `.select(...)` chain with **no bound of any kind**, relying
entirely on PostgREST's own default Max Rows (1,000), which truncates
silently with no error.

- **`scripts/lib/scan-unbounded-reads.mjs`** is a real method-chain walker —
  the `scan-blind-updates.mjs` precedent (balanced-paren skipping, so a
  `<select>` DOM ref or an unrelated `.select()` state setter is never
  misread as Supabase) — that walks every `.from(...)` chain and flags one
  carrying `select` but none of `range`/`limit`/`single`/`maybeSingle`, and
  whose `select()` argument is not a head-only count (`{ count: 'exact',
  head: true }` returns zero rows regardless of match count, so it cannot
  truncate anything).
- **302 pre-existing matches** on the live codebase, hand-sampled and
  confirmed to be real, legitimate reads — mostly against genuinely small
  reference tables today, not 302 live bugs, but 302 instances of the same
  unguarded shape that has already bitten this codebase twice. Fixing all
  302 without per-table risk analysis was judged disproportionate to this
  phase's own scope, so — per this codebase's own established discipline for
  exactly this situation (`check-blind-updates.sh`, `check-route-validation
  .sh`) — a **ratchet**: `BASELINE=302` in `scripts/check-unbounded-reads.sh`,
  a PR may never raise the count, and the guard celebrates the moment anyone
  lowers it.
- **Mutation-tested**: a throwaway unbounded chain added to a scratch file
  was confirmed to fail the guard before being removed.
- Wired into `.github/workflows/ci.yml`'s `shared-dupes` job alongside the
  other six guards.

## Groups 2-5: PL.1 — the four Protected Legacy systems

Each slice read its own route/table shape fresh before writing a test — per
this codebase's own "repository reality beats handover narrative" rule — and
each used the SAME fake-Supabase-client route-test pattern this codebase
already established for every other route test. **A genuine defect found
while writing a test is fixed in place, the same as every phase before this
one** — this phase found and fixed one.

### Group 2 — A2I public signup

`portal/src/app/api/r/athlete/[slug]/route.ts`, 11 test cases.

- **A real, previously unfixed duplication defect, found and fixed.** The
  route had no idempotency check at all: a repeated public submission with
  the same company + email inserted a SECOND athlete row and sent a SECOND
  welcome email. This codebase's own referral pipeline already paid for
  exactly this class of bug once (CLAUDE.md's own "referral cron re-emailed
  21 people every hour" entry) — the manual regression script's own
  expectation (no duplicate email on resubmission) turned out not to be
  implemented. Fixed with an app-level check (`.eq('company_id',
  ...).ilike('email', email).limit(1)`) immediately before the insert — a
  DB-level UNIQUE constraint was considered and rejected: `athletes` has
  multiple other writers (admin's manual add, the portal's own authenticated
  athletes route) that a hard constraint would need a wider audit of than
  this route alone; checked live first and confirmed no existing duplicate
  rows, so the narrower, app-level fix is safe today regardless.
- The welcome email's A2I navy/gold shell is exercised for real
  (`buildAthleteWelcomeEmail` left unmocked; only `sendEmail` is mocked) —
  the exact shell/palette/footer markers, never the purple TPS ones.
- Covers: 404 on an unknown or disabled slug; validation refuses (name,
  email shape) before any write; the honeypot silently no-ops; a genuinely
  different athlete, or the same email at a DIFFERENT company, still sends
  normally; the anonymous caller never sees the created row back.

### Group 3 — Development Plans (athlete + employee)

No dedicated API route exists — `PlanEditor.tsx` (admin) writes directly
under RLS from a client component — so this slice pins the content model
and the live RLS shape rather than driving a request.

- **`devPlan.test.ts`** (10 cases, mirrored byte-identical in both apps —
  `lib/devPlan.ts` was already duplicated verbatim per its own header
  comment but had never been registered in `check-shared-dupes.sh`; fixed
  as part of this slice). Proves the shared content model round-trips
  exactly through `JSON.stringify`/`JSON.parse` — the same semantics the
  JSONB `content`/`strengths` columns apply, so a field surviving this
  round-trip survives storage unchanged — plus `radarGeometry()`'s
  clamping and degenerate (fewer than 3 strengths) cases.
- **`devPlansSql.test.ts`** (10 cases, admin) pins the LIVE RLS shape:
  migration 117 superseded 066's `dev_plans_client_select`/`dev_plan_
  milestones_client_select` policies with a `my_company_id()`-scoped
  version — resolved the same "latest definition wins" way this codebase's
  multi-migration SQL-shape tests already require (`hsSqlShape.test.ts`,
  `platformEventsSql.test.ts`). **Mutation-tested**: dropping migration 117
  from the pinned file list reproduces the superseded (profiles-subquery)
  shape and fails 3 of 10 assertions, confirming the test would actually
  catch a regression to the old policy.
- Pins that the "athlete" and "employee" use cases the manual script names
  share ONE nullable `athlete_id` column with **no second identity** for
  content to leak into — there is no `employee_id` column anywhere in this
  schema at all, so the two use cases are distinguished purely by that one
  column's presence/absence.
- Pins `content`/`strengths`/`training_items`/`roles_items` as JSONB with
  an empty (never NULL) default.

### Group 4 — E-Learning checkout/webhook

`portal/src/app/api/learning/{checkout,webhook}/route.ts`, 23 test cases.

- **checkout** (10 cases): creates a Stripe Checkout session for published,
  priced content; carries content/company/user id metadata on both the
  session and the payment intent; records a PENDING purchase before
  returning the url; derives company id from the caller's ACTIVE
  organisation, never a client-supplied one; refuses unauthenticated,
  no-active-org, missing/unpublished content, free content, a malformed
  contentId, and a Stripe-side failure — none of which write a row or reach
  Stripe when refused earlier.
- **webhook** (13 cases): **signature verification exercised for real** —
  node's own `crypto`, not mocked. Missing header, wrong signature, a stale
  timestamp outside the 5-minute replay window, and an unconfigured secret
  are each refused; a genuinely valid signature is accepted.
  **Mutation-tested**: signing the test's own requests with the WRONG secret
  was reintroduced and correctly failed 9 of 13 cases before being reverted
  — confirming the route's real HMAC check is exercised, not bypassed by a
  mock. Idempotent replay via the `stripe_events` unique-key collision
  grants no second access. `checkout.session.completed` activates the
  matching purchase and sets `access_expires_at` from `LEARNING_ACCESS_DAYS`
  (default 7, and 14 tested explicitly), and is a safe no-op when no row or
  metadata matches. `charge.refunded` marks the matching purchase refunded.

### Group 5 — Billing/Invoicing

`admin/src/app/api/{admin/clients/[id]/retainer,admin/clients/[id]/
raise-invoice,stripe/webhook}/route.ts`, 49 test cases.

- **retainer** (12 cases): first-time setup creates a customer/price/
  subscription and persists the ids; reuses an existing Stripe customer
  rather than creating a second one; refuses a zero retainer on first-time
  setup; emails the client ONLY on first-time setup, never on a retainer
  change. A retainer change on an existing subscription creates a new
  Price and swaps the subscription onto it without creating a second
  customer/subscription; is a no-op in Stripe when the amount hasn't
  actually changed; a zero/null amount updates the local value only,
  never touching Stripe. Refuses non-staff, a malformed client id, an
  unknown client, Stripe-not-configured, and a genuine Stripe failure —
  the last writing NOTHING locally rather than leaving a half-applied
  state.
- **raise-invoice** (21 cases): its own explicit `requireStaff()` check is
  pinned directly — the route's own header comment names why: "the one
  admin API with none [staff check]... until the role-cookie fix." Every
  validation rule (package, description length, amount bounds, payment
  terms, invoice date, recipient) refuses BEFORE Stripe is ever reached.
  `created_by` is taken from the STAFF SESSION, never a client-supplied
  value. Creates a Stripe customer on demand for a client with none yet.
  Refuses a recipient from a different company or with no email. Records
  nothing locally when Stripe itself refuses the invoice.
- **stripe/webhook** (16 cases): signature verification exercised for REAL
  using the Stripe SDK's own `webhooks.generateTestHeaderString()` against
  `webhooks.constructEvent()` — the same construction Stripe itself
  recommends, never a mocked verifier. Idempotent replay via the same
  `stripe_events` unique-key mechanism. `customer.subscription.{updated,
  deleted}` and `invoice.{paid,payment_failed,voided,marked_uncollectible}`
  each sync the right company/invoice column. `invoice.paid`'s "only flip
  if not already active" optimisation is proven by an actual write-COUNT
  assertion, not merely an unchanged end value — a naive "the status still
  says active" check cannot tell a genuine skip from a no-op rewrite to the
  same value. **Mutation-tested**: removing the route's own `.neq
  ('subscription_status','active')` guard was reintroduced and correctly
  failed the discriminating test before being reverted.

## Group 6: adversarial QA, full regression, the final gate

A dedicated adversarial pass re-read the plan doc's own PL.1 scope against
what Groups 2-5 actually shipped and found **one real gap**: the plan's own
A2I slice named three things — the welcome email's A2I shell, duplicate-
submission throttling, and **"the admin resend route sends the same
shell"** — and Group 2 covered only the first two, via the PUBLIC signup
route. The admin staff resend route (`POST /api/admin/athletes/[id]/
welcome-email`) had zero test coverage, the exact named item left
uncovered.

- **Fixed**: `admin/.../welcome-email/__tests__/route.test.ts`, 8 cases.
  Proves the route sends the SAME A2I navy/gold shell the public route
  sends (`athleteWelcomeEmail` left unmocked, the same discipline as
  Group 2's sibling test); stamps `welcome_email_sent_at`/`_by` from the
  staff session; explicitly ALLOWS a re-send (the route's own documented
  "doesn't refuse on a previous send" behaviour) with an updated timestamp;
  refuses non-staff, a malformed id, an unknown athlete, an athlete with no
  email on file; and updates nothing when the send itself fails.

**Everything else checked and found clean**:

- **C19.9's guard classification** — hand-sampled a cross-section of the
  302 flagged matches (not just the one example cited when the ratchet was
  set) and confirmed each was a genuine unbounded read against a real
  table, never a false positive from the walker misreading an unrelated
  `.select()`/`.from()` call.
- **Every mutation test in Groups 2-5 was independently re-run** in this
  pass, not merely trusted from its own group's own report: the E-Learning
  webhook's wrong-secret mutation, the retainer webhook's missing-`.neq()`
  mutation, and the Development Plans SQL-shape test's missing-migration-
  117 mutation were each re-broken and re-confirmed to fail, then restored
  and re-verified green.
- **No preservation test silently weakened a real check to make it pass.**
  Every fake Supabase client in Groups 2-5 was checked for the exact class
  of bug this session's own Billing Group 5 work caught mid-flight (a
  `.eq()`/`.neq()` chain-order mismatch that let an assertion pass for the
  wrong reason) — confirmed none of the other fakes share that shape.
- **Every fix this phase made was the minimum needed.** The A2I dedup fix
  is app-level, scoped to the one risky route, not a broad schema change;
  the `check-shared-dupes.sh` registration for `devPlan.ts` is additive,
  touching no other pair.

### Full regression

`tsc --noEmit` clean on both apps at every group boundary, not only at the
end. Full `vitest run`, verified clean at the end of this phase: **admin
187 files / 1898 tests**, **portal 69 files / 956 tests**, both fully
green — every test this phase added is new coverage, and no pre-existing
test was touched or weakened to get there. All seven CI guards pass with
no regressions (`check-shared-dupes.sh`: 73 pairs, up from 72 —
`devPlan.ts` newly registered; `check-row-cap.sh`:
clean; `check-route-validation.sh`: 44, unchanged; `check-admin-routes-
linked.sh`: 43 static routes, all reachable; `check-blind-updates.sh`: 101,
unchanged — every new/changed write in this phase carries an explicit
count/condition check from the start; `check-paged-order.sh`: clean;
`check-unbounded-reads.sh`: 302, the new guard's own baseline, unchanged).
Both production builds compile clean (admin and portal both exit 0).

## Completion Programme gate: PASSED

Every row in the Consolidated Gap Ledger (`docs/
CORE_OS_360_COMPLETION_MATRIX.md`) assigned to Phases 21 through 29 is now
`IMPLEMENTED`. The three rows that remain open anywhere in the matrix —
**C2.7** (live notifications proven after deployment), **C2.8** and
**C4.14** (mobile/tablet field verification) — are explicitly
`DEFERRED-BUT-REQUIRED` with **no further phase assignment**, recorded as
permanent, environment-limited exceptions at the phase that found them
(Phase 22): each needs a real post-deployment environment or real
device/browser hardware neither this sandbox nor any later phase in it can
supply. This is the documented exception the matrix's own closing rule
anticipates ("or be explicitly reclassified... before Phase 29's final
gate") — not silently discovered debt at this gate, but a limitation
already disclosed when it was found.

**The Core-OS 360 Completion Programme (Phases 20-29) is complete.**
