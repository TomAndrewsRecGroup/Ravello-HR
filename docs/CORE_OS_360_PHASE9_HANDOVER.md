# Core-OS 360 Phase 9: "What Changed?" Daily Operational Intelligence — Engineering Handover and QA Report

**Date:** 2026-09-29. **Branch:** every group's own branch, merged into `main` immediately after that group's own tests/guards/builds went green (PRs #252-#253 for Groups 1-2, this document's own PR for Group 3), per the operator's standing "regular merges so you don't lose anything" instruction — this phase is fully merged and deployed as of this document.
**Database:** no migration — this phase is entirely TypeScript over the existing `platform_events` (096) schema.
**No detailed operator brief exists in the repo for this phase** (the same situation Phase 8 was in) — scope was derived from the phase's own name plus what the codebase already had: `docs/CORE_OS_360_PHASE9_PLAN.md`, written before Group 1 began.

Scope delivered: `lib/whatChanged/compute.ts` — the first thing anywhere to render `platform_events` (the automation outbox that has recorded every create/update/delete across 51+ tables since 2026-09-25) as a human-readable daily narrative — and a "What Changed" tab on the admin per-client detail page with a date picker. Delivered in **2 independently-verified groups** (foundation → UI, each with tests → all five CI guards → both builds → commit → PR → merge, THEN the next group), plus this final regression/adversarial-QA/handover pass (Group 3).

**One absolute rule held throughout, with no exception found on adversarial review except the one described in §C:** every count is computed at READ TIME from real `platform_events` rows already scoped by the caller's SQL query — no stored aggregate, no AI, no significance judgement. `computeWhatChanged()` is pure: given the same input, it always returns the same output, with no clock, no network, no side effect.

**Phase 10 is NOT to begin** until this branch is merged and deployed, per the operator's standing instruction. (It already is — see the branch note above — so Phase 10 is clear to begin once this document and the CLAUDE.md update are committed.)

---

## A. Requirements traceability

Derived scope (`docs/CORE_OS_360_PHASE9_PLAN.md`), mapped to what actually built it.

| Planned item | Delivered as | Group |
|---|---|---|
| Pure "what changed" computation | `lib/whatChanged/compute.ts` — `computeWhatChanged()`, categorised by entity type and verb | Group 1 |
| Admin UI | A "What Changed" tab on `ClientDetailTabs.tsx`, `WhatChangedTab.tsx`, date picker defaulting to yesterday | Group 2 |
| Regression, adversarial QA, handover | This document, plus the `'reminder'` event-type fix | Group 3 |

Scope decisions made and held throughout, all recorded in the plan doc before Group 1 began and unchanged since:

- **Staff-only, not client-facing.** `platform_events` RLS is staff-only SELECT (`platform_events_staff_read`); a portal version needs a service-role-mediated read, real disclosed future work (§H).
- **No emailed daily digest.** An on-demand page answers "what changed" without a third, genuinely different scheduled-email mechanism alongside the existing digest/weekly-summary crons.
- **No Jev narrative layer.** The deterministic count table is a complete, honest answer on its own.
- **A curated label map for ~20 entity types, with a generic (still-plural) fallback for the rest** — never crashes on an unlisted table.

---

## B. What `platform_events` actually contains — verified, not assumed

`platform_events` (096) is written by three distinct mechanisms, and this phase's adversarial review (§C) specifically checked all three rather than trusting the two obvious ones:

1. **Trigger-written rows** (`platform_event_row()`, one trigger per `TRIGGERED_ENTITIES` table) — `event_type` is always `'created'` or `'updated'` (never `'deleted'` in practice on most tables, since most H&S/HR rows are soft-deleted or immutable, though the CHECK-less `event_type` column does not enforce this).
2. **`emitEvent()`-written rows** (for entities with no row of their own — the Manatal move-stage and policy-ack-resend cases) — TypeScript-typed to `'created' | 'updated' | 'deleted'` only.
3. **`lib/reminders/run.ts`-written rows** — a FOURTH real value, `event_type = 'reminder'`, upserted directly into `platform_events` for every due-date bucket a reminder rule fires (`due_30`/`due_7`/`due_0`/`overdue`/…). This is the one Group 1 missed and Group 3 found and fixed (§C).

No fourth writer exists beyond these three — verified by grepping every `platform_events` insert/upsert site in the admin app (`emit.ts`, the trigger functions defined in migrations, and `reminders/run.ts`) rather than assuming the two obvious paths were exhaustive.

---

## C. The one defect found and fixed

**`computeWhatChanged()`'s created/updated/deleted branching silently missed `event_type = 'reminder'` rows.** The first version incremented `cat.total` unconditionally for every row but only ever incremented `created`/`updated`/`deleted` for those three specific string values — a `'reminder'` row inflated the displayed total while contributing to NONE of the three breakdown columns, so a day with reminder activity showed a total that did not match the sum of its own table row, and the reminders themselves were invisible to the one summary that exists to show "what changed."

- **Found by**: re-reading every real writer of `platform_events` (§B) rather than trusting the two the module's own type signature implied were exhaustive — the same "verify the actual writers, don't assume the type is complete" discipline this codebase's other Group-N QA passes have applied before (Phase 8's coverage-type mismatch was found the same way, by re-checking documented intent against implementation; this one was found by re-checking the SCHEMA'S real vocabulary against the TypeScript type that claimed to model it).
- **Fixed**: `PlatformEventRow['event_type']` widened to include `'reminder'`; `ChangeCategory` gained a `reminders` field; the UI table gained a "Reminders" column.
- **Proven**: a new test asserts `created + updated + deleted + reminders === total` for a fixture mixing reminder and created rows — the exact property the bug violated. Mutation-tested live in this session: the fix (the `else if (e.event_type === 'reminder') cat.reminders++;` branch) was reverted, the new test watched to fail, then restored.
- **Severity**: Medium. Not a security or data-integrity issue — `platform_events` itself was never wrong, only this phase's own new reading of it — but a genuinely misleading UI output (a total that doesn't reconcile with its own breakdown, and reminder activity invisible on the one page built to show activity) for anyone actually using the feature on a day reminders fired.

No other defect was found in this phase's adversarial review.

---

## D. UI/UX decisions, documented rather than silently made

- **Defaults to yesterday, not today** — today is still in progress; "what changed" reads more naturally as a completed day's retrospective, the same reasoning the H&S weekly digest reports a week that has just ended.
- **UTC calendar-day boundaries throughout**, both in `yesterday()`/`shiftDay()` (browser-side) and in the query range passed to the database (`occurred_at` is `timestamptz`, compared against UTC ISO boundaries) — internally consistent, matching the `today = new Date().toISOString().slice(0, 10)` pattern already used pervasively elsewhere in this codebase (e.g. `HealthSafetyKpisPage`). A staff member outside UTC may find the "yesterday" boundary falls a few hours off their own intuitive midnight — a minor, accepted UX nuance, not a correctness defect, and consistent with how every other date-boundary computation in this codebase already behaves.
- **`readAllPages()` called from a browser component for the first time in this codebase.** It is a plain callback-driven page walker with no dependency on which Supabase client it is handed; a single client/company/day slice could plausibly exceed 1,000 rows on an unusually active day, and the standing `paged.ts` rule (surface `truncated`, never silently present a partial read as complete) is honoured in the UI.

---

## E. Regression report

- **The full vitest suites are the regression suite.** Every pre-existing module (Referrals, A2I emails, Development Plans, E-Learning, Broadcast, Billing/Stripe, HR, Recruitment, every Phase 1-8 H&S/workforce/governance/consultancy/risk-graph subsystem) has its own test files, none deleted, none skipped, all green throughout the phase: **1470 admin / 705 portal** as of this document (up from 1461/705 at the end of Phase 8 — this phase touched admin only).
- **Both production builds compile clean.** Portal built with stub Supabase env vars to get past the documented, pre-existing sandbox-only missing-env-vars prerender failure (unrelated to this phase, on a page it never touches, and this phase made no portal changes at all).
- **All five CI guards pass**: `check-shared-dupes.sh` (48 pairs, unchanged — this phase added no shared-dupe file, since it is admin-only), `check-row-cap.sh` (clean), `check-route-validation.sh` (44, unchanged — no new API route), `check-admin-routes-linked.sh` (42 static routes, all reachable — the new tab lives inside the existing `/clients/[id]` dynamic route, no new static page), `check-blind-updates.sh` (102, unchanged — this phase writes nothing to the database at all, purely read-only).
- **No shared table, trigger or RLS policy was modified anywhere in this phase.** `platform_events` is read exactly as its existing `platform_events_staff_read` policy already allowed; nothing about who may read or write it changed.

This constitutes the "previous phases remain functional" regression requirement.

---

## F. Adversarial QA

### F.1 The `event_type` vocabulary

Covered in full in §B and §C. One real, Medium-severity defect found and fixed.

### F.2 Tenant scoping

`WhatChangedTab.tsx`'s query is `.eq('company_id', companyId)` — a `platform_events` row with `company_id = NULL` (the cross-client, company-less shape `referral_scan_runs` events use, per Phase 7's own CLAUDE.md note) correctly never matches any client's own "what changed" view; verified by reading the query rather than assumed. `platform_events_staff_read` RLS (`is_tps_staff()`, no company restriction) means only staff ever reach this tab at all — the admin app's own role-based routing (`ADMIN_APP_ROLES = [STAFF_ROLE]`) already refuses a non-staff session before this page renders.

### F.3 Date-boundary correctness

Reviewed live by tracing `yesterday()` → `shiftDay()` → the query's `dayStart`/`dayEnd` construction: all three use `Date.prototype.toISOString()`/`setUTCDate()`, never a locale-dependent method, so the browser's own timezone never leaks into which day's rows are queried. The "Next day" button is disabled once the picker reaches today (`isToday`), so the UI cannot request an in-progress day expecting a complete one.

### F.4 Race conditions on rapid date navigation

`WhatChangedTab.tsx`'s `useEffect` carries a `cancelled` flag, set on cleanup — a rapid sequence of prev/next clicks cannot let a slower, earlier response overwrite a faster, later one. Verified by reading the effect's own structure; this is the standard React data-fetching race guard, applied correctly on the first attempt (no defect found here).

### F.5 Regression across Referrals, A2I, E-Learning, Broadcast, Billing, HR, Recruitment and Phases 2-8

Covered in §E.

---

## G. Defect classification (Phase 9, this pass)

| Defect / gap | Found by | Severity | Fixed by | Verified |
|---|---|---|---|---|
| `computeWhatChanged()` silently dropped `event_type = 'reminder'` rows from every breakdown column while still counting them in `total` | Group 3 adversarial review of every real `platform_events` writer | Medium (a misleading total that doesn't reconcile with its own breakdown, on a page whose whole purpose is showing activity accurately) | Widened the `event_type` union, added a `reminders` field to `ChangeCategory` and a matching UI column | New test asserting `created + updated + deleted + reminders === total`; mutation-tested live (reverted, watched fail, restored) |

No other Critical, High or Medium finding was found anywhere in this phase's adversarial review.

---

## H. Technical debt

- **No client-facing (portal) version.** Disclosed from the plan doc onward, not a late discovery. A future phase wanting this would need a service-role-mediated read (the pattern the portal Legal Register page already establishes for a staff-only source table) and its own RLS-equivalent reasoning about what a client should be allowed to see about their own account's activity.
- **No emailed digest.** An on-demand page only; a scheduled "yesterday's changes" email is real, separate future work if the operator wants push delivery rather than pull.
- **No Jev narrative.** The deterministic count table stands alone; a one-paragraph plain-English summary on top ("busier than usual — mostly new risk assessments") would be a genuine enhancement for a later pass, following the same confidence-gated, never-auto-acting pattern every other Jev integration in this codebase already uses.
- **The label map covers ~20 of 51+ possible entity types**, with an honest (still-plural, never mis-singularised) fallback for the rest — disclosed, bounded scope, not silently incomplete.
- **UTC day boundaries, not the viewing staff member's own timezone.** A minor, accepted nuance (§D), not fixed here — would need a per-user timezone preference to address properly, out of scope for this phase's own name.

---

## I. Gate

**PASS WITH MINOR ISSUES.**

- One real, Medium-severity defect (§C, §F.1, §G) was found by this phase's own adversarial review — a genuine gap between the schema's real event-type vocabulary and the TypeScript type that claimed to model it completely. Fixed within this same group and mutation-tested live (reverted to prove the test actually catches it, then restored), rather than carried forward as a known issue.
- Every real writer of `platform_events` was independently verified (§B) rather than trusting the module's own type signature — the discipline that actually found the defect.
- Tenant scoping, date-boundary correctness, and the rapid-navigation race guard were all reviewed on their own terms and found correct on the first attempt (§F.2-F.4).
- Every scope decision that might otherwise look like an oversight (staff-only, no email digest, no Jev, the bounded label map, UTC boundaries) is explicitly documented rather than silently made (§A, §D, §H).
- Full regression (tsc clean both apps, 2175 total tests across both apps, all five CI guards, both production builds) is green (§E).

**Phase 10 may begin.**
