# Core-OS 360 Phase 13: Board Assurance & Executive Reporting — Plan

No detailed operator brief exists in the repo for this phase — the same
situation Phases 8-12 were in. Scope is derived from the phase's own name plus
a careful audit of what the codebase already has, checked before writing a
line of code rather than assumed.

## What already exists, and the real gap this phase closes

Three things already look adjacent to "board assurance" and were read in full
before deciding what was missing:

1. **The Value Report** (`lib/valueReport/`, Phase 5 Group 8 + Phase 6's
   quarterly variant) — a commercial/relationship document ("the value we
   delivered this month/quarter": roles filled, tickets resolved, documents
   uploaded). Client-facing, but framed as a sales/account artefact, not a
   governance one.
2. **Management Review** (`management_reviews`/`management_review_decisions`/
   `management_review_data_pack`, Phase 5 Group 6) — the ISO 45001/14001
   clause 9.3 ritual: a staff-facilitated meeting, a computed data pack
   (STAFF-ONLY), and DECISIONS the client sees only once the review is
   `completed`. This already has genuine board-relevant content, but it is a
   working document for one meeting, not a periodic report meant for
   distribution and sign-off.
3. **`computePortfolioCounts()`** (`lib/health/portfolioCounts.ts`, Phase 6) —
   a pure, no-AI function computing exactly the kind of assurance facts a
   board would want (open critical actions, overdue legal reviews, workers
   not ready, assets unavailable, major audit findings, contractor insurance
   expiring, …), already wired into the daily `client_health_snapshots`
   cron — but that table is explicitly **staff-only**, "an internal BD/
   account-management signal, never shown to a client" (107's own migration
   comment). The client's own board has never seen this.
4. **The Compliance Digital Twin** (Phase 12) — a live, read-time RAG
   snapshot across five EHS pillars, admin + portal, no history.

**The gap**: nothing assembles the client's OWN board-relevant facts into a
single, periodic, DISTRIBUTABLE, SIGN-OFF-ABLE document. This phase builds
exactly that — reusing all four of the above, never recomputing a fact any of
them already produce.

## What this phase builds

- **`board_assurance_reports`**: one row per company per (year, quarter) —
  the same quarterly cadence the existing Value Report already established.
  `report_data` is an immutable JSONB snapshot, generated once and never
  recomputed after the fact — the exact `management_review_data_pack`
  precedent ("a stored snapshot, never recomputed... generating a new pack
  inserts a fresh row rather than overwriting the old one").
- **`lib/boardAssurance/computeReport.ts`**: pure assembly of an ALREADY-
  COMPUTED Digital Twin snapshot (Phase 12), portfolio counts for this one
  company (Phase 6's `computePortfolioCounts`, called with a single-element
  company list), and the latest COMPLETED management review's own decisions
  — no new raw fact computed anywhere in this file.
- **Trend, without a new snapshot-history table.** The quarterly cadence is
  coarse enough that the sequence of PAST STORED REPORTS already is the
  trend history — comparing this quarter's computed overall band against the
  immediately PRIOR stored report's own `report_data.overallBand` needs no
  new daily/weekly snapshot table, avoiding a near-duplicate of
  `client_health_snapshots`.
- **`board_assurance_acknowledgements`**: insert-only — a board member
  (a `client_admin`) reads an ISSUED report and acknowledges it. One row per
  person per report; a correction is a new row, the register's own
  discipline.
- **Draft → issued is a staff action**, notifying the client admins
  (email + in-app) via a new consequence rule — the same `notify()`/
  `sendKeyedEmail` claim-before-send discipline every prior phase's own
  notification path already uses. A draft is staff working data; the client
  never sees anything until it is issued.
- **Capabilities reused, not invented**: `risk.read` (client SELECT on
  issued reports) / `risk.create` (client INSERT on acknowledgements) — the
  same broadest existing "can see/add to the register" pair Phase 5's
  Groups 3-8 already reused repeatedly for exactly this reason.

## What this phase deliberately does NOT do

- **No new Digital Twin snapshot-history table.** See "Trend" above — a
  documented, deliberate scope decision, not an oversight.
- **No PDF template rebuilt from scratch.** `buildBoardAssuranceReportPdf.ts`
  takes jsPDF/autotable as parameters, the exact `buildReportPdf.ts`
  pattern — one more caller of an existing pattern, not a new one.
- **No external "board member" contact model.** Distribution and
  acknowledgement are to the client's own existing `client_admin` users —
  the people who already act as the client's decision-makers in this
  platform. A genuinely external board member with no portal login at all
  (needing a no-login token link, the `policy_ack_tokens`/`hs_test_tokens`
  shape) is real future scope, explicitly deferred, not silently assumed
  away.
- **No "are we safe and compliant today" real-time assurance query** — that
  is Phase 18's own name and job, a different, narrower, live-query feature;
  this phase's report is a periodic, generated, STORED document.
- **No AI-generated narrative or summary anywhere.** Every fact is a plain
  count or an already-computed band; no model is invoked in this phase.

## Delivery groups

1. **Group 1 — schema + pure computation.** Migration (both tables, RLS, the
   outbox trigger, the two reused capabilities' policies), a live rolled-back
   probe, `lib/boardAssurance/computeReport.ts` + unit tests, the SQL-shape
   test, `boardAssuranceRules.ts` (issued → notify client admins).
2. **Group 2 — UI.** Admin: a cross-client "Board Assurance" page to
   generate/view/issue a report and print it as a PDF. Portal: read-only
   `/protect/board-assurance`, listing issued reports with an Acknowledge
   action for `client_admin`.
3. **Group 3 — regression, adversarial QA, handover.**

**Phase 14 is not to begin** until this phase is merged and deployed, per the
operator's standing instruction.
