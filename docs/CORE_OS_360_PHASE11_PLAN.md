# Core-OS 360 Phase 11: Evidence Engine & Evidence-Backed Compliance — Plan

No detailed operator brief exists in the repo for this phase (the same
situation Phases 8-10 were in) — scope is derived from the phase's own
name, grounded in what the codebase already has.

## What already exists (checked, not assumed)

- **`hs_files`** (095) already accepts `entity_type = 'register_completion'`
  (`hs_scope_for_entity()`'s own live CASE list) — a completion CAN
  already carry evidence. Nothing checks whether one actually DOES.
- **`requirement_evidence_links`/`standard_evidence_links`** (Phase 5,
  Groups 3/8) already link ISO clauses, legal obligations, objectives
  and audit findings to evidence, and the ISO readiness dashboard
  already reports "counts only" of evidence-linked clauses. This phase
  does not touch that system — it closes a DIFFERENT, checked gap: the
  H&S register's own `hs_register_completions` has no equivalent
  "does this have evidence" report at all.
- **No centralised evidence view exists anywhere** — a scan of every
  admin page reading `hs_files` found five, each showing evidence
  inline on ONE record's own page (the register, one audit, one
  activity, equipment, documents). Nothing lists every piece of
  evidence a client holds in one place.

## Scope for this phase

1. **Group 1 (no migration): the pure computation.**
   `lib/evidenceEngine/analyze.ts` — given a company's `hs_register_
   completions` and `hs_files` (entity_type = 'register_completion')
   rows already fetched for a window, computes which completions have
   NO evidence file attached, by outcome and by the register item's
   own category. Deterministic, no AI — "is there a file", never a
   judgement about whether the file is any good.
2. **Group 2 (no migration): UI.** An admin/portal Evidence tab showing
   (a) an Evidence Library — every `hs_files` row for the client,
   newest first, filterable by entity type — and (b) the evidence-gap
   report from Group 1.
3. **Group 3: regression, adversarial QA, handover.**

## What this phase deliberately does NOT do

- **No AI judgement of evidence quality.** "Has a file" is the entire
  test — never an assessment of whether the file is legible, current,
  or actually proves what it claims to.
- **Does not touch `requirement_evidence_links`/ISO readiness.**
  Different system, already reports its own coverage; duplicating that
  logic here would be a second source of the same kind of fact.
- **No enforcement.** A completion with no evidence is reported, never
  blocked — `hs_register_completions` remains insert-only with no new
  guard; this phase is visibility, not a new database constraint.
