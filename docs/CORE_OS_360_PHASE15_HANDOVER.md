# Core-OS 360 Phase 15: Intelligent RAMS — Engineering Handover and QA Report

**Date:** 2026-09-30. **Branches:** every group's own branch, merged into
`main` immediately after that group's own tests/guards/builds went green
(PR #270 for Group 1, PR #271 for Group 2, this document's own PR for
Group 3), per the operator's standing "regular merges so you don't lose
anything" instruction — this phase is fully merged and deployed as of
this document.
**Database:** no migration — this phase is entirely TypeScript, adding
one `DecisionKind` and a suggestion route/UI over the EXISTING
`method_statements.sections` field.
**No detailed operator brief exists in the repo for this phase** (the
same situation Phases 8-14 were in) — scope was derived from the
phase's own name plus a careful audit of what the codebase already had
(RAMS's existing workflow, migration 124) and, critically, of what Jev
can actually do: `docs/CORE_OS_360_PHASE15_PLAN.md`, written before
Group 1 began.

Scope delivered: given a draft RAMS's title/project_name/scope_of_work,
Jev flags which of six CONDITIONAL method-statement sections
(lifting_arrangements, isolations, environmental_controls,
exclusion_zones, waste_disposal, permits_required) likely need real
content for this specific job — never what that content should say, and
never touching the other 14 universal sections. Delivered in **3
independently-verified groups** (pure computation + route → editor UI
→ this final regression/adversarial-QA/handover pass).

**Phase 16 is NOT to begin** until this branch is merged and deployed,
per the operator's standing instruction. (It already is — see the
branch note above — so Phase 16 is clear to begin once this document
and the CLAUDE.md update are committed.)

---

## A. Requirements traceability

Derived scope (`docs/CORE_OS_360_PHASE15_PLAN.md`), mapped to what
actually built it.

| Planned item | Delivered as | Group |
|---|---|---|
| The architectural constraint that shaped everything else | `lib/jev/types.ts`'s own header comment, verified before designing anything: Jev answers noul/choice/score only, never free text | Group 1 (research) |
| Conditional-section vocabulary + noul questions | `lib/hs/ramsSectionQuestions.ts`, reusing `RAMS_SECTION_KEYS`/`RAMS_SECTION_LABELS` verbatim | Group 1 |
| `rams_section_suggest` decision kind | Added to `DecisionKind` (shared-dupe `lib/jev/types.ts`), never `AUTO_ACT_KINDS` | Group 1 |
| Suggestion route | `POST /api/protect/jev/rams-section` | Group 1 |
| Editor integration | `RamsHeaderEditor.tsx`'s "Suggest sections to check" button, reusing the existing shown/remaining reveal mechanism | Group 2 |
| Regression, adversarial QA, handover | This document | Group 3 |

The plan doc's own central finding, made before any code was written:
a design that has Jev "write the method statement" does not fit this
platform's AI architecture at all, and was explicitly rejected in
favour of the narrower, genuinely-Jev-shaped nudge actually built.

---

## B. Adversarial review — one real defect found and fixed

### B.1 [Medium] The suggestion route's own validation ceiling was narrower than the database's

`method_statements.scope_of_work` has always allowed up to 8000
characters (`CHECK (length(scope_of_work) <= 8000)`, migration 124).
Group 1's route validated it with `longText(4000)` — a ceiling invented
for this route alone, with no relationship to the actual field it
reads from. Any RAMS whose author had typed a genuinely long scope of
work (4001–8000 characters, a real, valid, DB-accepted value) would
have the "Suggest sections to check" button fail outright with a 400
validation error the moment Group 2's UI called it — a real,
reproducible feature failure for a real subset of legitimate RAMS
records, not a hypothetical edge case.

Found by the same discipline this codebase applies to every field a
route validates: check the ceiling against the COLUMN's own CHECK, not
against what feels like a reasonable round number. `title`'s
`shortText(200)` and `project_name`'s `optionalShortText(200)` were
both already correct (matching `method_statements.title`'s `BETWEEN 1
AND 200` and `project_name`'s `<= 200` exactly) — only `scope_of_work`
had drifted.

**Fixed**: raised to `longText(8000)`, matching the column's own limit
exactly. `ramsSectionState()`'s own `.slice(0, 4000)` clip — what
actually reaches Jev — is a SEPARATE, independent decision (Jev does
not need the full 8000 characters to make a judgement call) and was
left untouched; the fix is specifically about what the route is willing
to VALIDATE, not what it sends onward.

**Mutation-tested**: a new route test file (`rams-section/route.test.ts`,
7 cases — Group 1 shipped with none, matching `/api/lead/jev/doc-type`'s
own precedent of no dedicated route test, but this group's own finding
justified adding one) pins an 8000-character scope of work succeeding
and an 8001-character one refused. Reverting the fix to `longText(4000)`
was reintroduced and watched fail the 8000-character case (400 instead
of 200) before being restored and re-verified green.

### B.2 Checked and found clean

- **Untrusted text framing.** Every question's `instructions` string
  states the state is data to classify, never an instruction — pinned
  by both the pure-function test (Group 1) and the route test's own
  "never sends the raw scope of work as an instruction" case.
- **`askJev()`'s `gate`/`gated` mechanism does not apply to an
  all-`noul` question set at all** (`minConfidence()` skips `noul`
  answers entirely, so `confidence` is always `null` and `gated` is
  always `false`) — checked directly against `lib/jev/client.ts`'s own
  source before relying on anything else; the per-question probability
  threshold (`RAMS_SECTION_SUGGEST_GATE`, applied in
  `toRamsSectionSuggestions()`) is the only gate that does anything
  here, and it is exercised by both the pure-function tests and the
  route test's own "only the sections whose probability crosses the
  gate" case.
- **The editor UI never writes section content, and never auto-saves.**
  `suggestSections()` only calls `setShown`/`setSuggested` — both pure
  local component state; the existing `Save` button and its existing
  row-version-conditional `method_statements` update are byte-for-byte
  unchanged from before this phase.
- **A flagged-but-still-empty section's "worth checking" note clears
  itself automatically** the moment the author types anything (the
  note's own render condition already checks
  `!(sections[k] ?? '').trim()`) — no separate dismiss action needed,
  and no stale note can survive an edit.
- **Capability gating matches the existing `doc_type_suggest`
  precedent exactly** — any signed-in company user may call the
  suggestion route (it writes nothing and reads nothing beyond what
  the caller already typed), the same posture the employee-document
  suggestion route already established for the identical "assist, never
  write" shape.
- **Rate limiting** (`limiters.vendor`) matches every other Jev-calling
  route in this codebase.

---

## C. Regression

- **`tsc --noEmit` clean on both apps**, throughout every group and
  after the B.1 fix.
- **Full `vitest run` green: 1563 admin / 750 portal** as of this
  document (up from 1563/743 at the end of Group 2 — portal unchanged
  admin-side since this group's fix is portal-only; +7 portal for the
  new `rams-section/route.test.ts`).
- **Both production builds compile clean**, including
  `/api/protect/jev/rams-section` and the editor UI change. Portal
  built with stub Supabase env vars to get past the documented,
  pre-existing sandbox-only missing-env-vars prerender failure
  (unrelated to this phase).
- **All five CI guards pass**: `check-shared-dupes.sh` (56 pairs,
  unchanged — this phase touched only the shared-dupe `lib/jev/
  types.ts` mirror, kept byte-identical), `check-row-cap.sh` (clean),
  `check-route-validation.sh` (44, unchanged — the new route reads a
  body and validates it with `parseBody`, so it was never on the
  ratchet list to begin with), `check-admin-routes-linked.sh` (42
  static admin routes, all reachable — this phase touched no admin
  route), `check-blind-updates.sh` (102, unchanged — this phase adds
  no new `.update()` call site at all; the editor's existing Save
  button was untouched).
- **No shared table, trigger, or RLS policy was touched anywhere in
  this phase** — there is no migration.

This constitutes the "previous phases remain functional" regression
requirement.

---

## D. Design decisions, documented rather than silently made

- **Only 6 of the 20 section keys are ever asked about.** The other 14
  are universal to virtually every method statement regardless of the
  work described; asking Jev about them would be a near-constant "yes"
  that tells the author nothing. A deliberate, narrower scope than "ask
  about all 20", recorded in the plan doc before Group 1 began.
- **The suggestion gate (0.6) is deliberately lower than a
  classification decision's gate (0.8, `doc_type_suggest`)** — a false
  positive here costs a glance at an irrelevant section; a false
  positive on a CHOICE decision is a wrong answer outright. Different
  stakes, different threshold, both documented.
- **No "dismiss this suggestion" action, and no persisted outcome
  tracking** (unlike the H&S register's own `accepted`/`overridden`/
  `ignored` model). A suggestion here only ever reveals an EMPTY
  section for the author to look at — there is no accept/reject
  decision to record beyond "did the author end up typing something
  in it," which the existing save-time `cleanSections` logic (an empty
  section is simply never persisted) already answers implicitly.
  Building explicit outcome tracking for a suggestion this lightweight
  was judged genuinely new scope, not a gap in this phase.

---

## E. Technical debt

- **No outcome/telemetry tracking for this decision kind** — see §D.
  If this feature proves valuable and a future phase wants to measure
  how often a suggested section actually gets filled in vs. left
  empty, that is a real, separate piece of work building on the
  existing `jev_decisions` rows this feature already writes.
- **The "Suggest sections to check" button is not disabled when
  `scope_of_work` is empty** — clicking it with no scope of work typed
  yet sends a mostly-empty state to Jev, which will reasonably answer
  with low-confidence "false" for every conditional section (a safe,
  harmless degrade, not a defect) but is a wasted API call. A UX
  nicety, not fixed here.

---

## F. Gate

**PASS WITH MINOR ISSUES.**

- One real Medium-severity defect (§B.1) was found during Group 3's
  adversarial review — a validation ceiling narrower than the database
  column it validates for, causing a real feature failure for a real
  subset of legitimate RAMS records — reproduced with a failing test,
  fixed, and mutation-tested (the fix reverted, the test confirmed to
  fail, the fix restored and re-verified green).
- Untrusted-text framing, the `askJev()` gate mechanism's actual
  behaviour on an all-noul question set, the editor's read-only
  relationship to `method_statements`, and capability/rate-limiting
  posture were each checked against the actual source or the actual
  route behaviour and found clean (§B.2).
- Every scope and design decision that might otherwise look like an
  oversight (only 6 of 20 sections asked about, no dismiss/outcome
  tracking, the lower suggestion gate) is explicitly documented rather
  than silently made (§A, §D).
- Full regression (tsc clean both apps, 2313 total tests across both
  apps, all five CI guards, both production builds) is green (§C).

**Phase 16 may begin.**
