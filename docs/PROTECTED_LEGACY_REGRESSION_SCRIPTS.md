# Protected Legacy — Manual Regression Scripts

Phase 20 deliverable. Per the Completion Programme's DoD: "All protected legacy
workflows have baseline tests **or documented reproducible manual scripts where
automation is genuinely impossible**." Two of the six protected systems now have
real route-level automated preservation tests added in this phase (see
`docs/CORE_OS_360_PHASE20_HANDOVER.md` §Preservation tests: the Referrals cron
entry point and the Broadcast send route). The four below did not get automated
coverage built in this phase — **honestly, not because automation is impossible**
(the fake-Supabase-client pattern already used across this codebase would work for
all four with enough time), but because it was not completed within Phase 20's own
scope. These manual scripts are the interim baseline; building real automated
tests for these four is carried forward explicitly, not silently dropped — see the
Consolidated Gap Ledger addition at the bottom of this file.

Run each script against a staging/local environment with test Supabase/Stripe/
Resend keys before any Phase 21+ change lands that could plausibly touch the
subsystem, and again before merging that change, to prove nothing regressed.

---

## 1. Athletes to Industry (A2I) — public signup → welcome email

**Entry point**: `portal/src/app/api/r/athlete/[slug]/route.ts` (live,
unauthenticated, rate-limited public route).

1. Find (or create in admin) an active partner with a real `slug` on
   `athlete_partners` (or equivalent — check `AthletesClient.tsx`'s partner
   picker for the current field names).
2. As an anonymous browser session (no cookies), open
   `/r/athlete/<slug>` on the portal and submit the signup form with a real,
   deliverable test email address.
3. Verify: a new row appears in the athletes table scoped to that partner; a
   welcome email arrives at the test address, using the **A2I dark navy/gold
   shell** (`wrapEmailGold`/`ctaButtonGold`), not the purple TPS shell; the
   copy reads "Andrews Recruitment Group's Athletes To Industry programme"
   (never "The People System's").
4. Resubmit the same slug+email a second time within the rate-limit window and
   confirm the route refuses/throttles rather than sending a duplicate welcome.
5. From the admin side, manually add an athlete (not via the public link) and
   confirm the resend-welcome-email route (`/api/admin/athletes/[id]/
   welcome-email`) sends the same-shelled email.

---

## 2. Development Plans (athlete + employee)

**Entry points**: admin's dev-plan create/edit UI for both use cases (search
`devPlan` across both apps for the current route names — this file intentionally
does not hardcode a path that may have moved since this script was last run).

1. Create a development plan for an existing **athlete** record: add at least
   one section/goal, save, and reopen it — confirm the saved content round-trips
   exactly (no silent truncation or section loss).
2. Create a development plan for an existing **employee** record via the same
   flow and confirm it is stored/retrieved independently of the athlete one (no
   cross-contamination between the two use cases sharing the same table).
3. If a client-facing view of a plan exists, confirm a client user can read
   their own organisation's employee plan and CANNOT read another
   organisation's, by attempting the direct URL for a plan belonging to a
   different company while signed in as the first company's client_admin.

---

## 3. E-Learning marketplace — checkout → webhook → access

**Entry points**: `portal/src/app/api/learning/checkout/route.ts`,
`portal/src/app/api/learning/webhook/route.ts`.

1. As a signed-in portal user, start a checkout for a real learning-content
   item using Stripe's test-mode card (`4242 4242 4242 4242`, any future
   expiry/CVC).
2. Complete the Stripe Checkout flow and confirm the redirect back to the
   portal lands on a success state.
3. Using the Stripe CLI (`stripe listen --forward-to
   localhost:<port>/api/learning/webhook`) or the Stripe Dashboard's test
   webhook replay, confirm the `checkout.session.completed` event is received,
   the webhook signature verifies, and the purchaser's access window opens
   (respecting `LEARNING_ACCESS_DAYS`, default 7 days).
4. Confirm the purchased content is now reachable by the purchaser and
   **not** reachable before the purchase completes or after
   `LEARNING_ACCESS_DAYS` has elapsed (simulate by temporarily backdating the
   access-window row, never by waiting a week).
5. Replay the same `checkout.session.completed` event a second time (Stripe
   itself retries on a timeout) and confirm the webhook is idempotent — no
   duplicate access grant, no duplicate charge record.

---

## 4. Billing/Invoicing — retainer, one-off invoice, webhook

**Entry points**: `admin/src/app/api/admin/clients/[id]/retainer/route.ts`,
`admin/src/app/api/admin/clients/[id]/raise-invoice/route.ts`,
`admin/src/app/api/stripe/webhook/route.ts`.

1. As staff, set up a retainer for a test client company (creates/updates the
   Stripe customer, price, and subscription per `admin/src/lib/stripe.ts`).
2. Confirm the retainer appears correctly on the client's billing view and
   that the portal's own client billing surface reflects it.
3. Raise a one-off invoice for the same client and confirm it appears in
   Stripe's dashboard (test mode) and in the client's invoice history.
4. Using the Stripe CLI/Dashboard, replay an `invoice.paid` webhook event for
   the raised invoice and confirm the invoice's payment state updates
   correctly in the app (not just in Stripe).
5. Replay a `customer.subscription.updated`/`.deleted` event and confirm
   retainer status tracks it.
6. Confirm `raise-invoice`'s own `requireStaff()` check refuses a
   non-staff session directly against the route (curl with a client session
   cookie), since this route's own CLAUDE.md history notes it once relied on
   the admin middleware alone rather than checking itself.

---

## Consolidated Gap Ledger addition

These four manual scripts are NOT a substitute for automated coverage — they are
the DoD's own permitted fallback for what Phase 20 did not finish building.
Real automated preservation tests for A2I's public signup route, Development
Plans (both use cases), E-Learning checkout/webhook, and Billing/Invoicing are
carried forward as an explicit item in the gap ledger (see
`docs/CORE_OS_360_COMPLETION_MATRIX.md`), assigned to **Phase 29** (Security,
Regression & Production Certification) as the last gate before which every
protected legacy workflow must have real automated regression coverage — not
because it is acceptable to wait that long, but because Phase 29 is the
programme's own final backstop and this is tracked debt, not a silent gap.
