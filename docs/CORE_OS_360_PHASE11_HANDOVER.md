# Core-OS 360 Phase 11: Evidence Engine & Evidence-Backed Compliance — Engineering Handover and QA Report

**Date:** 2026-09-29. **Branch:** every group's own branch, merged into `main` immediately after that group's own tests/guards/builds went green (PRs #258-#259 for Groups 1-2, this document's own PR for Group 3), per the operator's standing "regular merges so you don't lose anything" instruction — this phase is fully merged and deployed as of this document.
**Database:** no migration — this phase is entirely TypeScript over the existing `hs_files`/`hs_register_completions`/`compliance_items` schema (095).
**No detailed operator brief exists in the repo for this phase** (the same situation Phases 8-10 were in) — scope was derived from the phase's own name plus what the codebase already had: `docs/CORE_OS_360_PHASE11_PLAN.md`, written before Group 1 began.

Scope delivered: `lib/evidenceEngine/analyze.ts` — closing a real, checked gap (`hs_files` has always accepted `entity_type = 'register_completion'`, but nothing ever reported whether a completion actually has one attached) — plus an admin/portal Evidence tab combining an Evidence Library with the coverage gap report. Delivered in **2 independently-verified groups** (foundation → UI, each with tests → all five CI guards → both builds → commit → PR → merge, THEN the next group), plus this final regression/adversarial-QA/handover pass (Group 3).

**Phase 12 is NOT to begin** until this branch is merged and deployed, per the operator's standing instruction. (It already is — see the branch note above — so Phase 12 is clear to begin once this document and the CLAUDE.md update are committed.)

---

## A. Requirements traceability

Derived scope (`docs/CORE_OS_360_PHASE11_PLAN.md`), mapped to what actually built it.

| Planned item | Delivered as | Group |
|---|---|---|
| Pure evidence-coverage computation | `lib/evidenceEngine/analyze.ts` — `analyzeEvidenceCoverage()`, gaps by register-item category, "has a file" only, never a quality judgement | Group 1 |
| Admin UI | `/health-safety/<companyId>/evidence` — a 28th `HsCompanyTabs.tsx` tab, Evidence Library + gap report | Group 2 |
| Portal UI | Read-only `/protect/evidence`, gated by `protect` alone | Group 2 |
| Regression, adversarial QA, handover | This document | Group 3 |

Scope decisions made and held throughout, all recorded in the plan doc before Group 1 began:

- **No AI judgement of evidence quality.** "Has a file" is the entire test.
- **Deliberately separate from `requirement_evidence_links`/ISO readiness** (Phase 5) — a different system, already reporting its own coverage; this phase closes a different gap (the register's own completions) rather than duplicating that logic.
- **No enforcement.** `hs_register_completions` gained no new guard; this phase is visibility only.

---

## B. What already existed, and the real gap this phase closes

Checked before writing a line of code: `hs_scope_for_entity()`'s live CASE list already includes `'register_completion' → 'register'`, meaning a completion has been ABLE to carry an evidence file since migration 095 shipped. No admin or portal page has ever reported whether one actually does — a scan of every page reading `hs_files` (five of them: register, one audit's own detail page, activities, equipment, documents) found each shows evidence inline on ONE record's own page; none aggregates across records, and none asks "which completions have NOTHING attached."

---

## C. Adversarial review — no new defect found

A genuinely thorough pass was made across several angles, each checked against the actual code and the actual RLS policy text rather than assumed:

- **Sensitive-evidence leakage into the Evidence Library.** The library query has NO `entity_type` filter — it relies entirely on `hs_files_client_read`'s RLS predicate (`hs_evidence_readable(company_id, entity_type, evidence_type, recorded_by)`) to filter rows per the viewer's own session. Traced through `hs_evidence_readable()`'s actual live body (157): sensitive incident evidence (`witness_statement`/`medical`) is gated behind `incident.sensitive.read` regardless of which columns a query selects — Postgres RLS evaluates against the FULL underlying row, not the projected SELECT list, so omitting `evidence_type`/`recorded_by` from the query's own column list changes nothing about what RLS filters. Confirmed safe by construction, not merely assumed.
- **`register_completion`'s own read gate.** `hs_evidence_readable()`'s CASE has no explicit branch for `register_completion` — it falls through to `ELSE true`, meaning any signed-in company member can read it (subject to the already-enforced `company_id = my_company_id()` check). This is pre-existing, deliberate-by-omission behaviour this phase inherits rather than introduces — the H&S register is client-facing content generally, and no prior phase ever restricted evidence attached to a completion more tightly than the register entry itself.
- **Historical vs. current-state gaps.** The gap report lists EVERY completion in the most recent 500 (newest-first), including old, already-superseded ones — a completion from years ago with no evidence stays listed even if a LATER completion of the same item does have one. This mirrors an audit-trail reading ("every gap that was ever recorded") rather than a "current outstanding state" reading (which would need to filter to only the newest completion per item, the same "only the newest completion is authoritative" principle `hs_completion_roll()` already applies elsewhere). The UI copy ("Register completions with no evidence attached") makes no "current" claim, so this is a legitimate, disclosed design reading rather than a defect — recorded here explicitly rather than silently decided.
- **The Evidence Library's plain `.limit(200)`, no truncation notice.** Checked against this codebase's own precedent for "recent activity" browsing lists specifically (as opposed to an exhaustive export, which is what `readAllPages()`'s own truncation discipline exists for): `/automation`'s own `recentEvents` query is `.limit(40)` with no truncation warning either, an already-established pattern for a "most recent N" view. A silent cap here matches that precedent rather than violating the `paged.ts` rule, which targets a DIFFERENT failure mode (an export presented as complete when it silently was not).
- **The signed-URL-on-click flow.** `createSignedUrl()` is gated by the `hs-evidence` bucket's own storage policies, which mirror `hs_files` row-readability by design (the platform's standing "evidence inherits the record's permissions" architecture, established well before this phase). A viewer can only ever request a signed URL for a `storage_path` that came from a row their OWN RLS-filtered read of `hs_files` already returned — no new attack surface, the same relationship every other evidence-viewing page in this codebase already relies on.

No Critical, High or Medium defect was found in this phase's own code. This is a genuine, not a formulaic, result — the previous three phases (8, 9, 10) each surfaced one real Medium-severity issue on their own adversarial passes; this one did not, and reporting a clean pass honestly here matters more than manufacturing a finding to match a pattern.

---

## D. Regression report

- **The full vitest suites are the regression suite.** Every pre-existing module (Referrals, A2I emails, Development Plans, E-Learning, Broadcast, Billing/Stripe, HR, Recruitment, every Phase 1-10 H&S/workforce/governance/consultancy/risk-graph/operational-intelligence subsystem) has its own test files, none deleted, none skipped, all green throughout the phase: **1492 admin / 710 portal** as of this document (up from 1485/707 at the end of Phase 10).
- **Both production builds compile clean.** Portal built with stub Supabase env vars to get past the documented, pre-existing sandbox-only missing-env-vars prerender failure (unrelated to this phase).
- **All five CI guards pass**: `check-shared-dupes.sh` (52 pairs — up from 50; `evidenceEngine/analyze.ts` and `EvidenceEngineClient.tsx` are the two new pairs), `check-row-cap.sh` (clean), `check-route-validation.sh` (44, unchanged), `check-admin-routes-linked.sh` (42 static routes, all reachable — the new admin route nests under the already-linked `/health-safety` prefix), `check-blind-updates.sh` (102, unchanged — this phase writes nothing, entirely read-only).
- **No shared table, trigger or RLS policy was modified anywhere in this phase.** Every read is through EXISTING policies (`hs_files_client_read`, `hs_completions_client_read`) that predate this phase by multiple phases.

This constitutes the "previous phases remain functional" regression requirement.

---

## E. Design decisions, documented rather than silently made

- **The gap report is an audit trail of every completion ever recorded lacking evidence, not a "current outstanding state" view.** See §C — a deliberate reading, disclosed here explicitly.
- **A plain `.limit(200)`/`.limit(500)` cap, no truncation notice**, matching this codebase's own established "recent activity browsing list" precedent (`/automation`), distinct from the `readAllPages()` discipline that exists for exhaustive exports.
- **No custom date-range or entity-type filter on the Evidence Library** — a first-pass browsing view; a future phase could add filters if the unfiltered list proves too broad in practice.

---

## F. Technical debt

- **No filtering by register-item category, outcome, or date range on the Evidence Library or gap report** — both are flat, newest-first lists. Real, bounded scope for a later pass if a client's volume grows large enough to need it.
- **No cross-reference to `requirement_evidence_links`.** A register item that ALSO happens to serve as ISO/legal evidence (via the separate Phase 5 system) is not cross-linked from this page — deliberately, per the "different system, don't duplicate" scope decision, but a future phase could consider a single combined view if that proves valuable.
- **The "current outstanding state" reading (only the newest completion per register item) was considered and NOT built** — see §C. A future phase could add this as an alternative view without removing the audit-trail one.

---

## G. Gate

**PASS.**

- No Critical, High or Medium defect was found in this phase's adversarial review (§C) — a genuinely thorough pass across sensitive-data leakage, the register-completion read gate, historical-vs-current framing, the truncation-notice question, and the signed-URL flow, each checked against actual code and live policy text rather than assumed.
- Every scope and design decision that might otherwise look like an oversight (the audit-trail reading of the gap report, the un-noticed browsing-list cap, no cross-reference to the separate ISO/legal evidence system) is explicitly documented rather than silently made (§C, §E, §F).
- Full regression (tsc clean both apps, 2202 total tests across both apps, all five CI guards, both production builds) is green (§D).

**Phase 12 may begin.**
