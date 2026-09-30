# Core-OS 360 Phase 14: Worker QR System — Engineering Handover and QA Report

**Date:** 2026-09-30. **Branches:** every group's own branch, merged into
`main` immediately after that group's own tests/guards/builds went green
(PR #267 for Group 1, PR #268 for Group 2, this document's own PR for
Group 3), per the operator's standing "regular merges so you don't lose
anything" instruction — this phase is fully merged and deployed as of
this document.
**Database:** migrations 179 (`worker_qr_tokens`, `site_checkins`,
`worker_qr_status()` — applied and live-probed in Group 1) and 180
(extends `workforce_employee_sync()` to revoke a leaver's badge —
Group 3's own finding, applied and live-probed, mutation-tested).
**No detailed operator brief exists in the repo for this phase** (the
same situation Phases 8-13 were in) — scope was derived from the
phase's own name plus a careful audit of what the codebase already had:
`docs/CORE_OS_360_PHASE14_PLAN.md`, written before Group 1 began.

Scope delivered: a durable, revocable QR badge per worker, a
service-role-only status function that shows a COARSE Safe to Deploy
status to anyone who scans it (never the detailed reasons/requirements),
and an optional site check-in/out so "who is currently on site" is a
real, live fact. Delivered in **3 independently-verified groups**
(schema + pure computation → portal UI + public scan/check-in →
this final regression/adversarial-QA/handover pass).

**Phase 15 is NOT to begin** until this branch is merged and deployed,
per the operator's standing instruction. (It already is — see the
branch note above — so Phase 15 is clear to begin once this document
and the CLAUDE.md update are committed.)

---

## A. Requirements traceability

Derived scope (`docs/CORE_OS_360_PHASE14_PLAN.md`), mapped to what
actually built it.

| Planned item | Delivered as | Group |
|---|---|---|
| Durable per-worker badge token | `worker_qr_tokens` (SHA-256 hash only, service role only, one active per person) | Group 1 |
| Public-safe status read | `worker_qr_status(p_token_hash)` — SECURITY DEFINER, service_role-only grant, status only | Group 1 |
| Attendance log | `site_checkins` (staff ALL, client SELECT, no client write policy) | Group 1 |
| Badge generate/revoke UI | `POST`/`DELETE /api/workforce/people/[id]/badge` + `WorkerBadgePanel.tsx` | Group 2 |
| On-site roster | `/lead/workforce/onsite` | Group 2 |
| Public scan + check-in/out | `/w/[token]` + `/api/w/[token]/{,checkin,checkout}` | Group 2 |
| Regression, adversarial QA, handover | This document | Group 3 |

Scope decisions made and held throughout, recorded in the plan doc
before Group 1 began: no reasons/requirements exposed publicly; no
manual check-in/out control in the portal (the scan is the only write
path); no manual site picker at check-in (always the worker's own
`people.site_id`); no badge-printing/PDF layout; portal-only, no admin
UI (matching the rest of the workforce subsystem's own shape).

---

## B. Adversarial review — one real defect found and fixed

A careful review of the token security model, the RLS on both new
tables, the capability-gating on the two mutation routes, and every
cross-tenant path a public or authenticated caller could reach.

### B.1 [Medium] A leaver's badge was never revoked, and stayed scannable indefinitely

Phase 3's own leaver trigger (`workforce_employee_sync()`, migration
137) already ends role assignments and revokes exceptions/
authorisations the instant `employee_records.status` reaches
`'terminated'` — but `worker_qr_tokens` (179) postdates that migration
by many phases and was never added to it. Reproduced live before
fixing: minting a badge, then terminating the person's
`employee_records` row, left the badge's `revoked_at` `NULL` — a former
employee's physical badge remained scannable for ever, still showing
their name, job title and employer to whoever held it, however long
ago they left.

This is exactly the class of defect this codebase's own history
already treats seriously for adjacent systems — "Offboarding no longer
terminates on day one... pending leave AFTER the end date and open
policy acknowledgements are cancelled" (the LEAD-in-sync work) is the
same "don't leave a leaver's records dangling for a human to remember"
principle, applied here to a physical, out-in-the-world artefact
instead of a database row.

**Fixed** (migration 180): extends the SAME `workforce_employee_sync()`
"leaving" branch — never a second trigger reacting to the same event —
with one more `UPDATE worker_qr_tokens SET revoked_at = now(), revoked_by
= NULL WHERE person_id = NEW.person_id AND company_id = NEW.company_id
AND revoked_at IS NULL`. The live function body was read with
`pg_get_functiondef()` immediately before writing the migration (this
codebase's own standing rule for extending a shared function), and
reproduced verbatim plus the one new line.

**Mutation-tested live, not just unit-tested**: the fix was reverted to
the pre-180 function body in a live (non-transactional) statement,
the probe re-run and confirmed the badge stayed active after
termination (the original bug reproduced), then the fixed body was
restored and the probe re-run again, confirmed passing. A SQL-shape
test (`workerQrSql.test.ts`) pins the new `UPDATE worker_qr_tokens`
line inside the exact same "leaving" `IF` block the three pre-existing
UPDATEs already live in, and that no second `CREATE TRIGGER` was added.

### B.2 Checked and found clean

- **The raw token can never be read back once minted** — `worker_qr_
  tokens` has no session policy at all (service role only), and
  `mintWorkerQrToken()`/`hasActiveWorkerQrToken()` never select
  `token_hash` back to a caller; only the mint RESPONSE, at the moment
  of minting, ever carries the raw value.
- **Cross-organisation site check-in** is refused by `site_checkins_
  fill()`'s own trigger check, and (defence in depth) the check-in
  route only ever uses the person's OWN `people.site_id`, never a
  caller-supplied one — there is no site parameter anywhere in the
  public check-in route for a caller to submit a mismatched value with.
- **The badge-management routes' capability check** (`has_capability(
  person's own organisation, 'workforce.manage')`, evaluated under the
  CALLER's own session, never the service role) correctly refuses a
  session whose grant does not cover the PERSON's organisation, staff
  included via `is_tps_staff()`'s existing short-circuit — proven by
  the route's own `route.test.ts` (403 case).
- **A double-click "Regenerate" race** (two concurrent mint calls for
  the same person) is safe by construction — the DB's own partial
  unique index (`worker_qr_tokens_one_active_per_person`) lets only one
  insert succeed; the losing request surfaces a raw Postgres
  constraint-violation string as a 500. This is a real, if very minor,
  UX rough edge (no security or data consequence — the surviving badge
  is still valid, the user simply clicks Regenerate again) — flagged
  as low-severity technical debt (§D) rather than fixed here, since a
  friendlier 409 message is a genuinely separate, low-value change
  from the actual defect this pass exists to find.
- **A worker manipulating their own displayed check-in site** (by
  editing their own `people.site_id` before scanning their own badge,
  if they hold `people.write` on their own row) is out of scope by the
  feature's own documented posture: `site_checkins`' header comment
  already states "attendance, not compliance... this system reports
  facts, it does not gate access" — gaming a self-reported attendance
  log has no safety or access consequence, the same class of
  limitation every open access-log system carries.
- **No information leak via the profile page's parallel badge-status
  fetch.** `hasActiveWorkerQrToken()` runs concurrently with
  `loadProfile()`'s own `person_visible()` check (both inside the same
  `Promise.all`), but its boolean result is discarded before the
  response is built whenever `data.cannotSee` is true — the page
  returns the `CannotSee` component, never `WorkerBadgePanel`, so an
  unauthorised viewer never sees the result of a query that still ran
  server-side. Consistent with how every other parallel read on that
  page already behaves.
- **Rate limiting** on all three `/api/w/[token]/*` routes mirrors
  `/api/test/[token]`'s own IP-keyed limiter shape exactly (60 GET / 20
  POST per 5 minutes) — no gap relative to the precedent it copies.
- **No sensitive column anywhere in a public response.** `worker_qr_
  status()`'s JSON is `full_name`, `job_title`, `company_name`,
  `site_name`, `status` only — never occupational health, salary, NI,
  DOB, address, or the engine's own `reasons[]`/`requirements[]` arrays;
  pinned by `workerQrSql.test.ts`.

---

## C. Regression

- **`tsc --noEmit` clean on both apps**, throughout every group and
  after the B.1 fix.
- **Full `vitest run` green: 1563 admin / 737 portal** as of this
  document (up from 1561/737 at the end of Group 2 — +2 admin for the
  new leaver-revoke SQL-shape test cases; portal unchanged, since this
  group's fix is entirely SQL/admin-test-side).
- **Both production builds compile clean**, including all new routes
  from both groups. Portal built with stub Supabase env vars to get
  past the documented, pre-existing sandbox-only missing-env-vars
  prerender failure (unrelated to this phase).
- **All five CI guards pass**: `check-shared-dupes.sh` (56 pairs,
  unchanged), `check-row-cap.sh` (clean), `check-route-validation.sh`
  (44, unchanged — none of this phase's routes read a request body at
  all), `check-admin-routes-linked.sh` (42 static admin routes, all
  reachable — this phase touched no admin route), `check-blind-
  updates.sh` (102, unchanged — every new `.update()` call site, in
  both groups, was built with `{ count: 'exact' }` from the start).
- **No shared table, trigger, or RLS policy outside migrations 179/180
  themselves was modified anywhere in this phase.**

This constitutes the "previous phases remain functional" regression
requirement.

---

## D. Technical debt

- **The mint-race raw Postgres error message** (§B.2) — a friendlier
  409 on a double-click "Regenerate" race is a real, low-value
  improvement, not built here; flagged rather than fixed to keep this
  pass's scope to the genuine defect it found.
- **No manual site picker at check-in** — always the worker's own
  assigned site; a scan-station-specific site override is a real next
  step for a client with a fixed kiosk per site entrance.
- **No badge-printing/PDF layout** — the QR is shown once, on-screen,
  after minting; a formatted, printable ID-card export is genuinely new
  scope, not built here.
- **No "checked in but never checked out" reminder** — a long-open
  check-in (a badge scanned in but never scanned out, perhaps because
  the badge was lost) is not flagged anywhere. A future phase could add
  this via the existing `REMINDER_ENTITIES` mechanism, following the
  exact precedent every other dated-entity reminder in this codebase
  already uses.
- **No manual portal check-in/out control** — deliberately, per the
  plan doc's own scope decision (§A): the scan is the only write path.

---

## E. Gate

**PASS WITH MINOR ISSUES.**

- One real Medium-severity defect (§B.1) was found during Group 3's
  adversarial review, reproduced live before being fixed, and
  mutation-tested against the LIVE database function (reverted,
  re-probed and confirmed failing, restored and re-probed passing) —
  not merely a unit test against a mock.
- A wide range of other candidate issues — token read-back, cross-
  organisation check-in, capability-gating on the management routes, a
  double-click mint race, self-reported check-in gaming, a parallel-
  fetch information leak, rate limiting, and sensitive-column exposure
  in the public response — were each checked against the actual code
  or the actual live database and found clean, or (the one genuinely
  low-severity item) documented as debt rather than fixed (§B.2, §D).
- Every scope decision that might otherwise look like an oversight (no
  reasons/requirements exposed publicly, no manual check-in control, no
  site picker, portal-only with no admin UI) is explicitly documented
  rather than silently made (§A).
- Full regression (tsc clean both apps, 2300 total tests across both
  apps, all five CI guards, both production builds) is green (§C).

**Phase 15 may begin.**
