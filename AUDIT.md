# The People Office — Site Audit
_Generated during Phase 1A. Read alongside SPRINT_CONTEXT.md._

---

## Current Site Structure

### Pages

| Route | File | Current Purpose | Status |
|---|---|---|---|
| `/` | `src/app/page.tsx` | Homepage — Ravello HR brand, three systems | **Rewrite** |
| `/smart-hiring-system` | `src/app/smart-hiring-system/page.tsx` | Smart Hiring System™ funnel | **Rewrite → HIRE funnel** (Phase 1B) |
| `/policysafe` | `src/app/policysafe/page.tsx` | PolicySafe™ compliance funnel | **Rewrite → PROTECT funnel** (Phase 1B) |
| `/dealready-people` | `src/app/dealready-people/page.tsx` | DealReady People™ M&A funnel | **Rewrite → specialist product** (Phase 1B) |
| `/about` | `src/app/about/page.tsx` | About Lucinda Reader / Ravello HR | **Rewrite → Lucy + Tom / The People Office** (Phase 1C) |
| `/book` | `src/app/book/page.tsx` | Booking page — "HR Hotline" | **Update copy** (Phase 1D) |
| `/playbook` | `src/app/playbook/page.tsx` | Content hub — guides and frameworks | **Update branding + copy** (Phase 1D) |
| `/why-ravello` | `src/app/why-ravello/page.tsx` | Comparison page — why not agency/in-house | **Repurpose → Why The People Office** (Phase 1D) |
| `/tools/hiring-score` | `src/app/tools/hiring-score/page.tsx` | Smart Hiring Score diagnostic | **Retain — lead gen tool** (Phase 1D) |
| `/tools/hr-risk-score` | `src/app/tools/hr-risk-score/page.tsx` | HR Risk Score diagnostic | **Retain** (Phase 1D) |
| `/tools/policy-healthcheck` | `src/app/tools/policy-healthcheck/page.tsx` | Policy Healthcheck diagnostic | **Retain** (Phase 1D) |
| `/tools/due-diligence-checklist` | `src/app/tools/due-diligence-checklist/page.tsx` | DD Checklist tool | **Retain** (Phase 1D) |

### Pages to Create

| Route | Purpose | Phase |
|---|---|---|
| `/hire` | HIRE services page (packages: Hire Foundations, Optimiser, Embedded, Build) | Phase 1C |
| `/lead` | LEAD services page (packages: Lead Foundations, Optimiser, Partner, Build) | Phase 1C |
| `/protect` | PROTECT services page (packages: Protect Essentials, Core, Partner, Enterprise, Transaction) | Phase 1C |
| `/friction-lens` | Friction Lens landing page — explain dimensions, scoring, competitive positioning | Phase 1D |

### Pages to Remove / Repurpose

| Route | Decision |
|---|---|
| `/why-ravello` | Repurpose as `/why-the-people-office` or rewrite in-place (Phase 1D) |

---

## Homepage Components Audit

### `src/components/home/Hero.tsx`
**Current:** Ravello HR brand, heading "Your people problems cost more than you think", Smart Hiring System™ score card visual on right.
**Change needed:**
- Main heading → "We hire your people. We lead your function. We protect your business."
- Sub-heading → "One partner. Total control of your people function."
- Tagline → show "Hire. Lead. Protect." visibly
- Stats → update to reflect Lucy (18+ years HR) + Tom (10+ years talent)
- Hero card → update to Friction Lens preview (change labels to 5 Friction Lens dimensions)
- CTA primary → keep "Book a Free Call" → `/book`
- CTA secondary → update to "How it works" or "See Friction Lens" → `/friction-lens` (once created)

### `src/components/home/TrustBar.tsx`
**Current:** Ravello HR trust signals (senior HR, 48h embed, confidential, fixed-scope, 0 tribunal).
**Change needed:** Update signals to The People Office positioning (two founders, combined capability).

### `src/components/home/CostOfProblem.tsx`
**Current:** Five pain points around hiring, leadership, documents, growth gaps, lack of systems.
**Change needed:** Update pain points to align with HIRE / LEAD / PROTECT framing and TPO language.

### `src/components/home/FunnelCards.tsx`
**Current:** Three cards — Hiring / Compliance / M&A. CTAs to Smart Hiring System, PolicySafe, DealReady People.
**Change needed:** Replace with HIRE / LEAD / PROTECT pillars. Update all copy and CTA destinations.

### `src/components/home/ToolsHub.tsx`
**Current:** Four free tools — Hiring Score, HR Risk Score, Policy Healthcheck, DD Checklist.
**Change needed:** Minor copy update — position tools as "diagnostic tools" for each pillar. Phase 1D.

### `src/components/home/ProofSection.tsx`
**Current:** Stats — 40–60% agency spend reduction, 8 weeks time-to-hire reduction, 0 tribunal outcomes, 100s employees impacted.
**Change needed:** Add combined founder stats. Update framing slightly. Phase 1D.

### `src/components/home/FounderSection.tsx`
**Current:** Quote by "Ravello HR", credentials block for one founder (CIPD, TUPE, M&A, 10+ years).
**Change needed:** Update to reflect Lucy AND Tom. New quote. New credentials reflecting both.

### `src/components/home/PlaybookTeaser.tsx`
**Current:** Three resources — Hiring Drift Framework, Policy Audit in 20 Minutes, M&A People DD.
**Change needed:** Minor branding update. Phase 1D.

### `src/components/home/HotlineSection.tsx`
**Current:** "Ready to talk about what is holding you back?" CTA to book + hiring score.
**Change needed:** Update copy for The People Office positioning. Update secondary CTA.

---

## Component-Level Audit

### `src/components/Nav.tsx`
**Current:** Solutions dropdown (Smart Hiring, PolicySafe, DealReady), Free Tools dropdown, Playbook, Why Ravello, About, Client Portal, Book Free Call.
**Change needed:** Update Solutions dropdown to HIRE / LEAD / PROTECT / Friction Lens. Rename "Why Ravello" → "Why TPO". Phase 1D.

### `src/components/Footer.tsx`
**Not yet read — audit in Phase 1D.**

---

## Phase 1A Scope (this session)

Done:
- [x] Full audit of site structure, pages, and components
- [x] SPRINT_CONTEXT.md created
- [x] AUDIT.md created (this file)
- [ ] Homepage rewrite — Hero, FunnelCards, TrustBar, CostOfProblem, FounderSection, HotlineSection

Not in scope for Phase 1A (deferred):
- Conversion funnel rewrites → Phase 1B
- Services pages (HIRE, LEAD, PROTECT) → Phase 1C
- About/Team page → Phase 1C
- Friction Lens page → Phase 1D
- Navigation, contact, meta tags → Phase 1D
- Tool pages → retain as-is until Phase 1D
