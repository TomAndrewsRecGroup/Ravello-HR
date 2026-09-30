# Core-OS 360 Phase 17: Regulatory Intelligence → Action (Tavily)

No detailed operator brief exists in the repo for this phase (the same
situation Phases 8-16 were in). Scope derived from the phase's own
name plus the ONE piece of infrastructure this codebase already, and
explicitly, reserved for it.

## What already exists, reserved for exactly this

- **Tavily was named as "the external search provider for later
  phases" since Phase 1** ("internal search stays in Postgres").
- **Migration 159 (Legal Register, Phase 5) built `legal_requirement_
  research_notes` as "an inert foundation for a LATER Tavily-based
  external legal research feature — no live API call anywhere in this
  migration or the TypeScript it ships with."** Its own header comment
  says explicitly: "A LATER group wires the real call and populates
  it; nothing here automates a legal conclusion or a compliance-status
  change from anything in this table." Columns already exist for
  exactly the workflow this phase completes: `source` (`tavily` |
  `manual`), `query_used`, `raw_result_summary`, `reviewed_by`,
  `reviewed_at`, `action_taken`. `LEGAL_RESEARCH_SOURCES` vocab already
  exists in both apps' `hs/vocab.ts`. RLS is already staff-only, no
  client access at all — appropriate, since this is external, unverified
  raw search data about a piece of legislation, not a client-facing fact.
- **A live SQL-shape test (`legalRegisterSql.test.ts`) already pins
  that migration 159's OWN file contains no Tavily key reference and
  no `fetch(`/URL** — this phase adds a genuinely new TypeScript file
  that DOES call Tavily; that test is unaffected, since it only checks
  migration 159's SQL text, not the wider codebase.
- **The action side is already built too, twice over**: `actions.
  source_type` already allows `'legal_requirement'` (migration 159's
  own rule 5 — "never build a second action table"), and Broadcast
  already has a `/broadcast?legal=<legal_requirements id>` prefill path
  (Group 8 of Phase 5) that pre-selects every client whose register
  holds that requirement as `applicable`.

**The gap this phase closes**: nobody has ever wired the real Tavily
API call, and there is no UI for staff to trigger a search, read what
came back, and decide what — if anything — to do about it.

## The one absolute rule, inherited directly from 159's own header

**Tavily never decides anything.** It is a search API returning text
snippets from the web — it has no more authority here than a Google
search a paralegal might run by hand. Nothing it returns is ever
written to `organisation_legal_obligations.applicability_status` or
`compliance_evaluations.status`, is never summarised by an LLM into a
verdict, and never triggers an action or a broadcast on its own. A
human reads the raw result, and ONLY a human decides whether it is
worth recording an `action_taken` note, raising a real `actions` row,
or broadcasting to affected clients — using mechanisms that already
exist, never new ones invented for this phase.

## Scope, and what is deliberately left out

- **On-demand, staff-triggered, never a scheduled cron.** Each Tavily
  call has a real cost and quota; running one automatically for every
  one of an unbounded number of legal requirements on a schedule is a
  spend decision nobody has made. Staff picks a requirement and clicks
  "Search" when they actually want to check for updates — the exact
  caution this codebase already applies to IvyLens (`dry_run` defaults
  true; "run dry for the first 100-200... before turning it off").
- **No AI summarisation of Tavily's results.** `raw_result_summary` is
  the search API's own returned snippets/titles, verbatim (trimmed to
  fit the column), never an LLM-generated paraphrase — there is no
  Jev involvement anywhere in this phase at all, since Jev cannot
  produce free text and a legal summary is exactly the kind of
  authored content this platform never lets a model write.
- **Closing the loop reuses existing mechanisms only**: a reviewed note
  with something worth acting on either (a) gets a plain `action_taken`
  text note recorded on the SAME row (already a column), (b) raises a
  real `actions` row via the EXISTING `source_type = 'legal_requirement'`
  value, or (c) links out to the EXISTING `/broadcast?legal=<id>` flow.
  No new action table, no new distribution mechanism.

## Delivery

3 groups, the established discipline.

- **Group 1**: `lib/tavily/client.ts` (the real API call, resilient
  HTTP per the `lib/http/resilient.ts`/`ivylens.ts` precedent, never
  exposed client-side), a staff-only route that runs a search for one
  legal requirement and inserts the resulting note.
- **Group 2**: admin UI on the Legal Register catalogue page — a
  research panel per requirement (run a search, see past notes, mark a
  note reviewed with an action-taken note, raise a real action or jump
  to Broadcast for a genuinely actionable finding).
- **Group 3**: regression, adversarial QA (confirm the API key never
  reaches the client, confirm nothing here writes an applicability/
  compliance verdict, confirm rate limiting), handover, merge.

**Phase 18 is NOT to begin** until this phase is fully merged and
deployed, per the operator's standing instruction.
