# Core-OS 360 Phase 14: Worker QR System — Plan

No detailed operator brief exists in the repo for this phase (the same
situation Phases 8-13 were in). Scope derived from the phase's own name
plus a careful audit of what the codebase already has.

## What already exists, and the gap this phase closes

Phase 3 built the whole Safe to Deploy engine (`person_deployment_status()`,
`workforce_readiness()`) and a rich per-person profile
(`/lead/workforce/people/[id]`) — but reaching either needs a platform
login and a search. On an actual site, the person who needs "is this
worker cleared to be here right now" is often a security guard, a site
manager doing a walk-round, or another contractor's supervisor — someone
who may have no Core OS 360 login at all, standing in front of a worker
whose badge they can scan. Nothing in the platform serves that moment.

This phase adds exactly that: a durable, revocable QR code per worker
that opens a no-login page showing a COARSE Safe to Deploy status (never
the detailed reasons — see below), plus an optional site check-in/out so
"who is currently on site" becomes a real, live fact — directly useful for
Phase 4's Emergency Planning (a muster-point roster) without building a
second attendance system.

## Explicit scope decisions

- **The public page shows STATUS ONLY, never reasons or requirements.**
  `person_deployment_status()`'s `reasons[]`/`requirements[]` describe
  WHICH mandatory item is missing (e.g. "induction expired", "PPE training
  not recorded") — precise enough to be an HR/compliance detail nobody
  intended to be readable by anyone who photographs or shares a badge. A
  new SECURITY DEFINER wrapper (`worker_qr_status()`) returns only the
  four-value `status` string (`READY | CONDITIONALLY_READY | NOT_READY |
  REVIEW_REQUIRED`) plus the person's name, job title, employer and
  primary site — nothing else, and never occupational health, salary, NI,
  DOB, address, or any `employee_records`-sensitive column (131's own
  `EMPLOYEE_SAFE_COLUMNS` precedent, applied here at the design stage
  rather than after a live leak, since `people` has no such column list
  of its own to lean on).
- **Never `person_deployment_status()`/`person_visible()` for this route.**
  Both require a real, visible-to-the-caller session (`is_tps_staff()` OR
  the person's own `auth.uid()` OR a company/capability/manager match) —
  an anonymous badge scan has none of that. Authorisation here is the
  TOKEN itself: possession of a valid, unrevoked `worker_qr_tokens` row
  naming this person is the proof, the exact model `hs_test_tokens`/
  `policy_ack_tokens` already established for a different no-login
  artefact.
- **The token is DURABLE, not single-use — the one deliberate departure
  from every other token table in this codebase.** `profile_access_
  tokens`/`policy_ack_tokens`/`hs_test_tokens` are all burned on
  redemption; a badge must be re-scannable indefinitely. What stays the
  same: SHA-256 hash only stored, RLS on with NO session policies at all
  (service role only), and a lost/compromised badge is REVOKED (never
  deleted, so the Safety Timeline / audit trail still shows it existed)
  and a fresh one minted — at most one ACTIVE token per person, enforced
  by a partial unique index, not just app logic.
- **Check-in is attendance, not compliance.** `site_checkins` records
  presence only (`checked_in_at`/`checked_out_at`); it never feeds, and
  is never fed by, the Safe to Deploy engine. A NOT_READY worker can still
  be checked in — this system reports facts, it does not gate access (the
  existing `contractor_worker_access()` gate, Phase 4, is the one place
  that already DOES gate access, for contractors specifically; this phase
  does not touch it).
- **No AI, no prediction, no risk score anywhere in this phase.**
- **Portal-only, no admin UI**, the same call Phase 3's own workforce
  pages and Phase 8's hazards/risk-assessments made — workforce/people
  management lives in the portal; staff already have blanket RLS access
  for support/lookup, consistent with the whole workforce subsystem's own
  established shape.
- **No badge PRINTING/PDF layout in this phase** — the QR value (a plain
  URL, `<site>/w/<token>`) and its on-screen rendering is in scope; a
  formatted, printable ID-card PDF is a real next step, flagged as debt,
  not built here (the same "flagged, not built — genuinely new scope"
  discipline this codebase applies elsewhere rather than inventing scope
  to look complete).

## Delivered in 3 groups

1. **Schema + pure computation**: `worker_qr_tokens`, `site_checkins`
   (migration), `worker_qr_status()` SECURITY DEFINER wrapper (service-role
   only, never anon/authenticated), token mint/verify/revoke helpers
   mirroring `policy_ack_tokens`/`hs_test_tokens`'s shape, a pure roster
   helper for "who is currently checked in."
2. **UI**: portal workforce page(s) to generate/view/revoke a badge and see
   the live on-site roster; the public `/w/[token]` scan page (status +
   check-in/out action), added to `PUBLIC_ROUTES` alongside `/test/`,
   `/policy/`, `/leave/` (both the page and its own API preflight calls).
3. **Regression, adversarial QA, handover.**
