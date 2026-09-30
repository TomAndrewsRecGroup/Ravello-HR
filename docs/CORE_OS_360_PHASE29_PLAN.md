# Core-OS 360 Completion Programme — Phase 29 plan
# Security, Regression & Production Certification (the final gate)

No detailed operator brief exists for this phase either — the same
situation every phase since 8 has been in. Scope read fresh from
`docs/CORE_OS_360_COMPLETION_MATRIX.md`'s own gap ledger: exactly two
rows are assigned here — **C19.9** ("no automated guard yet for
`readAllPages()` never wrapped at all — the worse variant of C19.5")
and **PL.1** ("real automated preservation tests for A2I signup,
Development Plans, E-Learning checkout/webhook, Billing/Invoicing" —
see `docs/PROTECTED_LEGACY_REGRESSION_SCRIPTS.md`). The matrix's own
words: "Every row in this ledger must close... before Phase 29's final
gate" — this is the last phase of the Completion Programme.

## C19.9: the guard, and why it is a ratchet

`check-row-cap.sh` catches a `.limit(N>1000)` (an author-specified
ceiling PostgREST will never honour). `check-paged-order.sh` catches a
`readAllPages()` callback's `.range(from, to)` with no preceding
`.order(...)`. Neither catches a `.select(...)` chain with **no bound
at all** — no `.range()`, no `.limit()`, no `.single()`/
`.maybeSingle()` — relying entirely on PostgREST's own default Max Rows
(1,000), which truncates silently. This is the exact shape of the
defect Phase 19's own investigation found twice (`lib/complianceTwin/
loadSnapshot.ts`'s `hs_links` reads, and the ORIGINAL Phase 8 admin
risk-graph page's own `hs_links` reads before they were fixed).

`scripts/lib/scan-unbounded-reads.mjs` walks every `.from(` chain (the
`scan-blind-updates.mjs` precedent: a real method-chain walker with
balanced-paren skipping, not a line grep, so a `<select>` DOM ref or an
unrelated `.select()` setter is never misread as Supabase) and flags
one with `select` in the chain but none of `range`/`limit`/`single`/
`maybeSingle`, and whose `select()` argument is not a head-only count
(`{ count: 'exact', head: true }` returns zero rows, so it cannot
truncate data that is never returned).

**Run against the live codebase: 302 matches.** Verified by hand-
reading a sample (`admin/.../dev-plans/[id]/page.tsx`): every hit found
was a REAL, legitimate Supabase read, most against genuinely small
reference tables today (companies, templates) — not 302 live bugs, but
302 instances of the SAME unguarded shape that has already bitten this
codebase twice. Fixing all 302 in this phase would be a large,
higher-risk undertaking with no per-table risk analysis this guard can
do — out of this phase's own proportionate scope. Per this codebase's
own established discipline for exactly this situation
(`check-blind-updates.sh`, `check-route-validation.sh`): a **ratchet**.
`BASELINE=302`; a PR may never raise the count, and CI celebrates a
lowered baseline the moment anyone fixes one. Mutation-tested: a
throwaway unbounded chain added to a scratch file was confirmed to
fail the guard before the file was removed.

## PL.1: the four protected legacy systems

`docs/PROTECTED_LEGACY_REGRESSION_SCRIPTS.md` already documents the
manual procedure for each; this phase replaces each with a real,
route-level automated test using the SAME fake-Supabase-client pattern
this codebase already uses for every other route test (e.g. Phase 20's
own `api/cron/referral-scan/__tests__/route.test.ts`, `api/broadcast/
__tests__/route.test.ts`). Each system's current route/table shape is
read fresh before writing its test — never assumed from the manual
script's own prose, which may have drifted since it was written.

1. **A2I public signup** — `portal/src/app/api/r/athlete/[slug]/
   route.ts`. Welcome email uses the A2I dark navy/gold shell
   (`wrapEmailGold`), never the purple TPS one; duplicate-submission
   throttling; the admin resend route sends the same shell.
2. **Development Plans** (athlete + employee) — round-trips content
   exactly; the two use cases don't cross-contaminate; a client cannot
   read another organisation's plan.
3. **E-Learning** — `portal/src/app/api/learning/checkout/route.ts` +
   `.../webhook/route.ts`. Checkout session creation; webhook signature
   verification; access window open/close respecting
   `LEARNING_ACCESS_DAYS`; idempotent replay (no duplicate access
   grant).
4. **Billing/Invoicing** — `admin/src/app/api/admin/clients/[id]/
   retainer/route.ts`, `.../raise-invoice/route.ts`,
   `.../api/stripe/webhook/route.ts`. Retainer setup; invoice raise;
   webhook-driven state updates (`invoice.paid`, `customer.
   subscription.*`); `raise-invoice`'s own `requireStaff()` refusal.

No product code is expected to change for PL.1 — these are PRESERVATION
tests, proving what already works keeps working, the Completion
Programme's own standing distinction between building something new and
closing a debt-ledger row. A genuine defect found while writing a test
is fixed in place and reported, the same as every phase before this one.

## Groups

1. C19.9 — the guard (this doc's own first half), done alongside this
   plan.
2. PL.1 slice 1 — A2I public signup.
3. PL.1 slice 2 — Development Plans.
4. PL.1 slice 3 — E-Learning.
5. PL.1 slice 4 — Billing/Invoicing.
6. Full regression, adversarial QA across both C19.9 and all four PL.1
   slices, the Phase 29 handover, the completion matrix's OWN final
   gate (every row across Phases 1-29 either closed or explicitly
   reclassified `ACCEPTED-NONREQUIREMENT`), CLAUDE.md, PR, merge.
