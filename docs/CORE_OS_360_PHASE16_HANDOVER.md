# Core-OS 360 Phase 16: Cross-Client Lessons Learned Network — Engineering Handover and QA Report

**Date:** 2026-09-30. **Branches:** every group's own branch, merged into
`main` immediately after that group's own tests/guards/builds went green
(PR #273 for Group 1, PR #274 for Group 2, this document's own PR for
Group 3), per the operator's standing "regular merges so you don't lose
anything" instruction — this phase is fully merged and deployed as of
this document.
**Database:** migration 181 (`lessons_learned`, `lesson_learned_distributions`,
`lesson_learned_reads`).
**No detailed operator brief exists in the repo for this phase** (the
same situation Phases 8-15 were in) — scope was derived from the
phase's own name plus a careful audit of what the codebase already had
(per-client incident/finding tables, the staff-authored reference-data
precedents) and, critically, what would and would not be safe to build
given the platform's multi-tenant guarantees: `docs/
CORE_OS_360_PHASE16_PLAN.md`, written before Group 1 began.

Scope delivered: a staff member drafts a deliberately anonymised
"lesson learned" (optionally traced, staff-only, back to a real
incident/audit finding/inspection), publishes it, and distributes it to
a chosen set of clients — pre-selected, never automatically, by a
plain sector match. Distributed clients read it in the portal and can
mark it read. Delivered in **3 independently-verified groups** (schema
+ pure computation → authoring/distribution UI + notify → this final
regression/adversarial-QA/handover pass).

**Phase 17 is NOT to begin** until this branch is merged and deployed,
per the operator's standing instruction. (It already is — see the
branch note above — so Phase 17 is clear to begin once this document
and the CLAUDE.md update are committed.)

---

## A. Requirements traceability

Derived scope (`docs/CORE_OS_360_PHASE16_PLAN.md`), mapped to what
actually built it.

| Planned item | Delivered as | Group |
|---|---|---|
| The absolute rule shaping everything else | No client-identifying detail of the source client ever reaches another client — `source_type`/`source_id` is staff-only, never in any client-facing read | Group 1 (research) |
| Schema: content, distribution, read receipts | `lessons_learned` / `lesson_learned_distributions` / `lesson_learned_reads` (migration 181) | Group 1 |
| Deterministic distribution suggestion | `lib/lessonsLearned/suggestDistribution.ts` (plain sector match, no AI) | Group 1 |
| Admin authoring + publish UI | `/health-safety/lessons-learned`, `LessonsLearnedClient.tsx` | Group 2 |
| The one place a lesson is ever told to a client | `POST /api/admin/lessons-learned/[id]/publish` | Group 2 |
| Portal read + mark-as-read | `/protect/lessons-learned`, `MarkLessonRead.tsx` | Group 2 |
| Regression, adversarial QA, handover | This document | Group 3 |

The plan doc's own central design decision, made before any code was
written: this is a STAFF-WIDE network (Core OS 360's own internal
staff, who already see every client), not a portfolio-scoped variant
for a third-party consultancy's own limited client subset (Phase 6's
model) — a documented, deliberate scope choice, not an oversight.

---

## B. Adversarial review — one real defect found and fixed

### B.1 [Medium] The duplicate-distribution check matched the error's own message text, not Postgres's error code

Group 2's first draft of `POST /api/admin/lessons-learned/[id]/publish`
recognised an "already distributed to this company" outcome with
`error.message.includes('duplicate key')` — a string match on
Postgres's own, unversioned wording. Every other place in this
codebase that needs to tell a unique-violation apart from a real
failure checks the CODE instead
(`reportIncident.ts`, `qrTokens.ts`, `feed-sources/route.ts`,
`board-assurance/generate/route.ts`, the Stripe and learning
webhooks — all check `error.code === '23505'`). A future Postgres/
PostgREST version — or simply a different constraint name embedded in
the same message — could silently stop matching, at which point every
"add more recipients to an already-published lesson" call would 500
instead of silently skipping the company already holding a
distribution, and the real, reported error would be a false "Could not
share with one client" for a client the lesson was already correctly
shared with.

**Found by the same discipline this codebase applies everywhere else**:
checking the actual, established pattern for this exact class of
problem rather than trusting a plausible-looking string match written
without cross-checking it. **Fixed**: `error.code !== '23505'`,
matching the codebase-wide precedent exactly. A second, related
finding while writing the fix's own test: the route also passed
`{ count: 'exact' }` to the `INSERT` (following the UPDATE/DELETE
convention this codebase uses everywhere for a counted write) — but an
INSERT's own success/error already tells the whole story (a clean
insert IS a new distribution; a duplicate always surfaces as an error,
never a silent zero-row success the way an UPDATE/DELETE legitimately
can), so the count option served no purpose and was removed as part of
the same fix — the first use of `{ count: 'exact' }` on an INSERT
anywhere in this app, and, on reflection, an unnecessary one.

**Mutation-tested**: a new route test file (`publish/route.test.ts`, 6
cases, using a small hand-rolled fake rather than the shared
`events/__tests__/fakeSupabase` — that fixture's `uniqueKeys`
mechanism only supports a single-column key, and
`lesson_learned_distributions`' real constraint is the COMPOSITE
`UNIQUE (lesson_id, company_id)`, the same reason
`pipelineIdempotency.test.ts` already uses its own narrow fake for an
identical need) pins: a first publish distributes and notifies every
requested company; adding a recipient to an already-published lesson
neither re-publishes nor re-notifies the existing recipient; a
duplicate distribution is skipped even when its error carries a
DIFFERENT message text than the route's original string-match guess
(the case that actually reproduces this defect); an archived lesson is
refused outright; a nonexistent lesson 404s; a malformed company id is
rejected by validation before any write. The fix was reverted to the
original string-match check, 2 of 6 tests failed (the duplicate-
recognition case and the add-more-recipients case), then restored and
re-verified green.

### B.2 Checked and found clean

- **Cross-tenant isolation** — re-verified by re-reading, not re-run,
  since nothing in Group 3 touched RLS, a trigger or a policy: Group
  1's own live probe (17/17) already proves a client can never read
  `lessons_learned` directly (even a published lesson distributed to
  them), sees only their own company's distribution/read rows, and is
  refused marking a lesson as read that was never actually shared with
  them.
- **The publish route's abort-vs-skip distinction was checked against
  its own comment and corrected where the two disagreed.** The
  original comment claimed a non-duplicate error is "reported
  per-company rather than aborting the whole batch" — the actual code
  RETURNS on the first such error, ending the request entirely. Since
  the UI only ever offers real, live company ids, a genuine
  foreign-key violation here is an anomaly worth failing loudly on,
  not a per-company condition to swallow past — the code's behaviour
  was judged correct and the comment was reworded to match it, rather
  than changing behaviour to match a comment that was simply wrong.
- **Race safety on a double "Publish" click** — reasoned through, not
  merely assumed: two concurrent requests both read `status = 'draft'`
  before either writes, both harmlessly set it to `'published'` (the
  DB trigger's own `published_at IS NULL` guard means only the first
  actually stamps a timestamp), then both attempt the same distribution
  inserts — the table's UNIQUE constraint is the real guard, so the
  loser's insert fails with 23505 and is silently skipped, and
  `notify()` is only ever reached by the winner. No double-send is
  possible, and no code change was needed to prove it.
- **No client-identifying detail ever reaches another client** —
  re-confirmed by reading every client-facing read (the portal page's
  own `.select()` list, `MarkLessonRead.tsx`'s insert payload) and
  confirming `source_type`/`source_id` appear in neither.
- **The distribution-suggestion "add, never replace" behaviour** was
  checked against its own documented intent (picking a second reference
  company should let staff build up a broader list from multiple
  comparison points, not discard the first choice) and found to behave
  exactly as designed — a UX decision, not a defect.

---

## C. Regression

- **`tsc --noEmit` clean on both apps**, throughout every group and
  after the B.1 fix.
- **Full `vitest run` green: 1593 admin / 753 portal** as of this
  document (up from 1587/753 at the end of Group 2 — portal unchanged,
  since this group's finding and fix are admin-only; +6 admin for the
  new `publish/route.test.ts`).
- **Both production builds compile clean**, including
  `/health-safety/lessons-learned`, `/api/admin/lessons-learned/[id]/publish`
  and `/protect/lessons-learned`.
- **All five CI guards pass**: `check-shared-dupes.sh` (57 pairs,
  unchanged — this group touched no shared-dupe file),
  `check-row-cap.sh` (clean), `check-route-validation.sh` (44,
  unchanged — the publish route validates with `parseBody`),
  `check-admin-routes-linked.sh` (43 static admin routes, all
  reachable), `check-blind-updates.sh` (102, unchanged — this group's
  fix REMOVED a `{ count: 'exact' }` from an INSERT rather than adding
  an unguarded UPDATE).
- **No shared table, trigger, or RLS policy was touched anywhere in
  this phase's Group 3** — the fix is entirely TypeScript, over
  Group 1's already-probed, unchanged schema.

This constitutes the "previous phases remain functional" regression
requirement.

---

## D. Design decisions, documented rather than silently made

- **Staff-wide, not portfolio-scoped** (see §A) — the broader,
  simpler posture, deliberately chosen over Phase 6's third-party-
  consultancy access model.
- **No AI anywhere in this phase.** Distribution targeting is a plain,
  deterministic sector match; a lesson's summary and recommended
  action are entirely staff-written free text — Jev cannot generate
  free text at all (the same architectural constraint Phase 15
  discovered and designed around), and even if it could, generating
  anonymised prose from a specific incident record risks leaking
  exactly the detail this feature exists to strip out.
- **The distribution picker's suggestion ADDS to the selection, never
  replaces it** — picking a second reference company builds up a
  broader list rather than discarding the first comparison (§B.2).
- **`lessons_learned` has no `company_id` at all** — the
  `legal_requirements` (159) shape, not a per-company table with a
  staff-only flag. A client never has ANY RLS path to it; the portal's
  read is entirely mediated by the service role, scoped to exactly the
  distribution ids the caller's own session already proved.
- **The publish route aborts on a genuine per-company anomaly rather
  than silently skipping it** (§B.2) — a documented choice, not an
  inconsistency, once the comment was corrected to match it.

---

## E. Technical debt

- **No "un-distribute" action.** Once a company is shown a lesson,
  there is no way to revoke that (short of archiving the whole lesson,
  which stops further distribution but does not retract what a
  company has already been shown). This was never asked for and is
  consistent with the platform's general posture that a notification,
  once sent, is a historical fact — but is worth naming if a future
  request needs it.
- **No portfolio-scoped variant for third-party consultancies** (§A,
  §D) — a real, deliberately deferred extension, not a gap that was
  missed.
- **The admin editor's "drawn from" source id is a plain paste, not a
  record picker** — matching the `standard_evidence_links`/
  `requirement_evidence_links` precedent exactly, and an accepted
  scope limit for the same reason those features accepted it.

---

## F. Gate

**PASS WITH MINOR ISSUES.**

- One real Medium-severity defect (§B.1) was found during Group 3's
  adversarial review — a fragile string-match standing in for the
  codebase's own established error-code check, which would have
  produced a false failure on the routine "add more recipients to an
  already-published lesson" path the moment Postgres's own wording
  ever changed. Reproduced with a failing test (a duplicate whose
  error message did not match the original guess), fixed, and
  mutation-tested (the fix reverted, two tests confirmed to fail, the
  fix restored and re-verified green). A second, related cleanup (an
  unnecessary `{ count: 'exact' }` on the INSERT) was folded into the
  same fix.
- Cross-tenant isolation, race safety on a concurrent publish, the
  abort-vs-skip error-handling distinction, and the "no client-
  identifying detail leaks" absolute rule were each checked against
  the actual code or the actual live probe and found clean (§B.2).
- Every scope and design decision that might otherwise look like an
  oversight (staff-wide vs. portfolio-scoped, no AI anywhere, the
  additive suggestion behaviour, no un-distribute action) is
  explicitly documented rather than silently made (§A, §D, §E).
- Full regression (tsc clean both apps, 2346 total tests across both
  apps, all five CI guards, both production builds) is green (§C).

**Phase 17 may begin.**
