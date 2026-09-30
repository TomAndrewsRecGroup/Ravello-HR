# Core-OS 360 Phase 18: Core 360 Assurance — "Are we safe and compliant today?"

No detailed operator brief exists in the repo for this phase (the same
situation Phases 8-17 were in). Scope derived from the phase's own
name plus a careful audit of what already answers ADJACENT questions,
to find the genuine, non-duplicative gap.

## What already exists, and why it is not quite this

- **The Compliance Digital Twin** (Phase 12) already assembles FIVE
  read-only modules into one snapshot with a per-area RAG band — but
  its five areas (safety, governance, risk graph, incident patterns,
  evidence coverage) are all somewhat BACKWARD-LOOKING or slow-moving
  measures (audit scores, evidence coverage %, objective on-track %).
  Nothing in it answers the literal, present-tense question this
  phase's name asks: is anyone not currently Safe to Deploy RIGHT NOW,
  is an asset quarantined RIGHT NOW, is a permit or isolation open
  RIGHT NOW.
- **`lib/health/portfolioCounts.ts` (Phase 6) already computes exactly
  those "right now" operational facts** — `workers_not_ready`,
  `assets_unavailable` (quarantined/out of service),
  `safety_critical_gaps`, `open_critical_actions`,
  `open_incident_investigations`, `major_audit_findings`,
  `overdue_legal_evaluations`, `overdue_controlled_documents` — but it
  was built for and is used by ONE thing: the staff-only, cross-
  portfolio `client_health_snapshots` daily cron, an internal BD/
  account-management signal never shown to a client (107's and Phase
  6's own explicit words). It is, itself, a genuinely pure function
  ("no Supabase client") — nothing about its OWN logic is staff-only;
  only its one existing caller and the table it writes to are.

**The gap this phase closes**: nobody has ever put those two together
into a single, TODAY-dated view a client (and staff, about that
client) can actually read: what needs attention right now, alongside
the Digital Twin's own slower-moving picture, presented as FACTS —
counts and plain sentences — never a certification.

## The one absolute rule, inherited from every prior phase that touched this ground

**Never assert "safe" or "compliant" as a verdict.** The exact same
discipline `PUWER_ASSESSMENT_OUTCOME_LABELS`/the Digital Twin/the
governance KPI module already apply: "no items are currently flagged"
is a fact; "you are compliant" is a legal conclusion this platform
never makes. The headline this phase shows is a count, or the absence
of one — never the word "safe" or "compliant" used as an assertion
about the client's own state.

## Scope, and what is deliberately left out

- **Composition, not duplication.** `lib/assurance/today.ts` takes an
  ALREADY-COMPUTED `PortfolioCounts` (for the one client in question)
  and an ALREADY-COMPUTED `ComplianceTwinSnapshot`, and combines them —
  it computes no new raw fact of its own, the identical posture
  `complianceTwin/assemble.ts` itself already takes one layer down.
- **`portfolioCounts.ts` becomes a shared-dupe pair.** It is genuinely
  pure (no Supabase client, confirmed in its own header before relying
  on that) — the same reasoning that made `hs/kpis.ts`/
  `governance/kpis.ts` shared-dupe pairs the moment Phase 12's portal
  page needed them too.
- **A single company's counts, computed fresh, under that company's
  own session (portal) or staff's own session (admin) — never a read
  of the staff-only, cross-portfolio `client_health_snapshots` table.**
  That table stays exactly what Phase 6 built it to be: an internal
  signal, never client-facing. This phase computes the SAME shape of
  fact, for ONE company, on demand, from the live tables directly —
  a different data path serving a different (client-facing) purpose.

## Delivery

3 groups, the established discipline.

- **Group 1**: `lib/assurance/today.ts` (pure combination + banding),
  `portfolioCounts.ts` promoted to a shared-dupe pair.
- **Group 2**: admin tab (`/health-safety/<companyId>/assurance`) and
  portal page (`/protect/assurance`), both reusing the EXISTING
  `ComplianceTwinView`-style presentational pattern for the twin half
  and a new, small "today's flags" list above it.
- **Group 3**: regression, adversarial QA (never a verdict word
  anywhere, counts genuinely scoped to one company, no cross-tenant
  leak in the newly-shared `portfolioCounts.ts`), handover, merge.

**Phase 19 is NOT to begin** until this phase is fully merged and
deployed, per the operator's standing instruction.
