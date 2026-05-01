# Go-Live Readiness Report — Ravello HR (The People System)

**Date:** 2026-04-30
**Auditor:** Claude (go-live-qa skill)
**Targets:** `https://admin.thepeoplesystem.co.uk` + `https://portal.thepeoplesystem.co.uk`
**Scope:** Full audit — code, auth, payments, core usage, errors/monitoring, infra, legal, content, email

---

## Verdict

# NO-GO

Three blockers, the most critical being a complete absence of email DNS records — every invite, password reset, and transactional email the platform sends will land in spam or fail delivery outright.

---

## Summary

| Severity | Count |
|---|---|
| BLOCKER | 3 |
| MAJOR | 7 |
| MINOR | 4 |
| UNVERIFIED | 6 |

**Cannot launch until BLOCKERs are resolved.**

---

## BLOCKERS

### B1. No SPF, DKIM, or DMARC DNS records for thepeoplesystem.co.uk

- **Where:** DNS for `thepeoplesystem.co.uk`
- **What's wrong:** Queried Google DNS (`dns.google/resolve`) — zero TXT records exist for `thepeoplesystem.co.uk` and zero TXT records for `_dmarc.thepeoplesystem.co.uk`. The app sends all transactional email via Resend from `noreply@thepeoplesystem.co.uk` with a reply-to of `hello@thepeoplesystem.co.uk`. Without SPF and DKIM, Gmail, Outlook, and iCloud will reject or spam-folder every email. DMARC is now a hard requirement for bulk/transactional senders as of Google/Yahoo's 2024 enforcement.
- **Why it matters:** Invited clients get a magic-link email via Supabase Auth. That email goes to spam on day one. They can't log in. They call you. Refund.
- **Fix:**
  1. Log into your DNS provider for `thepeoplesystem.co.uk`.
  2. Add an SPF TXT record: `v=spf1 include:_spf.resend.com include:amazonses.com ~all` (Resend's exact include is in their [docs](https://resend.com/docs/dashboard/domains/introduction) — verify there, not here).
  3. Add Resend's DKIM CNAME records — available in Resend Dashboard → Domains. Typically `resend._domainkey.thepeoplesystem.co.uk CNAME resend._domainkey.resend.com`.
  4. Add DMARC TXT at `_dmarc.thepeoplesystem.co.uk`: `v=DMARC1; p=none; rua=mailto:dmarc-reports@thepeoplesystem.co.uk`
  5. Also verify in Resend Dashboard that the domain shows "Verified" — that confirms DKIM is resolving.
  6. Supabase Auth also sends emails (magic-link invites). If Supabase's SMTP is not configured to use your Resend/custom SMTP, those emails come from Supabase's own infrastructure. Check Supabase Dashboard → Auth → SMTP Settings and configure custom SMTP via Resend there too.

---

### B2. No MX records for thepeoplesystem.co.uk — reply-to is a black hole

- **Where:** DNS for `thepeoplesystem.co.uk`
- **What's wrong:** Zero MX records returned for `thepeoplesystem.co.uk`. The email template hardcodes `reply_to: hello@thepeoplesystem.co.uk` (`admin/src/lib/email/client.ts:67`). Customers who reply to any email — welcome emails, invite emails, value reports — get a delivery failure. Their message is lost.
- **Why it matters:** Day-one clients who have onboarding questions email you back and get a bounce. That's a support disaster and a trust failure.
- **Fix:** Either (a) configure Google Workspace / Fastmail / equivalent for the domain and add the provider's MX records, or (b) change `EMAIL_REPLY_TO` to an address on a domain that _does_ have working MX records (e.g. a Gmail address until the domain email is set up). Option (a) is the right fix for launch.

---

### B3. Invite email `redirectTo` falls back to `http://localhost:3001` if env var missing

- **Where:** `admin/src/app/api/invite/route.ts:58` and `portal/src/app/api/portal/invite/route.ts:77`
- **What's wrong:** Both routes do:
  ```ts
  redirectTo: `${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3001'}/auth/update-password?welcome=1`
  ```
  If `NEXT_PUBLIC_PORTAL_URL` is not set in Vercel's production environment for either project, every invited user's magic-link email points to `http://localhost:3001`. They click it — nothing. Also affects the learning checkout route (`portal/src/app/api/learning/checkout/route.ts:63`), where missing `NEXT_PUBLIC_PORTAL_URL` sends Stripe's success/cancel redirect to localhost.
- **Why it matters:** The invite flow is the single most critical onboarding action. A broken redirect link = client can't ever log in on first invite.
- **Fix:** Verify in Vercel Dashboard → both projects → Environment Variables that `NEXT_PUBLIC_PORTAL_URL` is set to `https://portal.thepeoplesystem.co.uk` in Production. Also consider hardening the fallback: change `'http://localhost:3001'` to `'https://portal.thepeoplesystem.co.uk'` in both routes so a missing env var doesn't silently degrade to localhost.

---

## MAJOR

### M1. No error monitoring — failures at 3am are invisible

- **Where:** Both apps — no Sentry, Rollbar, Bugsnag, Highlight, or equivalent found in any source file
- **What's wrong:** Both `error.tsx` files log to `console.error` only. Vercel's function logs capture this, but there's no alerting, no aggregation, no stack trace search. A runtime error in a critical flow (invite, retainer billing, Stripe webhook) will be invisible until a client reports it.
- **Fix:** Add Sentry — it's free at low volume. `npm install @sentry/nextjs`, run `npx @sentry/wizard@latest -i nextjs`, set `SENTRY_DSN` in Vercel env vars. Takes ~30 min. Alternatively, enable Vercel's built-in log draining to a service that can alert.

### M2. No root-level 404 pages on either app

- **Where:** `admin/src/app/` and `portal/src/app/` — no `not-found.tsx` at the root app level
- **What's wrong:** `not-found.tsx` exists only inside the `(admin)/` and `(portal)/` route groups. Any 404 outside those groups (e.g. `/random-path`, `/api/missing`) falls through to the Next.js framework default — unstyled, reveals Next.js version, looks broken.
- **Fix:** Create `admin/src/app/not-found.tsx` and `portal/src/app/not-found.tsx` with branded 404 pages. Reuse the pattern from the existing `error.tsx` components.

### M3. RESEND_API_KEY not documented in admin .env.example

- **Where:** `admin/.env.example` vs `admin/src/lib/email/client.ts:60`
- **What's wrong:** The admin app sends custom transactional emails via Resend (`RESEND_API_KEY` is read at line 60 of `email/client.ts`). This key, along with `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_BCC_INTERNAL`, and `EMAIL_LOGO_URL`, are all referenced in code but absent from `admin/.env.example`. If not explicitly added to Vercel's production env, these will be `undefined`. When `RESEND_API_KEY` is missing, the code silently skips all email sends (`console.warn` only — no error thrown, no user-facing failure). Client welcome emails, value report emails, and broadcast notifications will not send, and nobody will know.
- **Fix:** Add all missing vars to `admin/.env.example`, then verify each is set in Vercel Dashboard → ravello-admin project → Environment Variables → Production.

### M4. CRON_SECRET not documented — RSS feed cron will silently never run

- **Where:** `admin/src/app/api/cron/ingest-feeds/route.ts:10`, `admin/vercel.json` (schedule: `0 * * * *`)
- **What's wrong:** The cron job at `/api/cron/ingest-feeds` requires a `CRON_SECRET` env var for authorization. If missing, `authorize()` returns `false` and every hourly cron call returns 401. The feed ingestion never runs. `CRON_SECRET` is not in `admin/.env.example`.
- **Fix:** Set `CRON_SECRET` to a random 32-character string in Vercel → ravello-admin → Production env vars. Also add it to `admin/.env.example`.

### M5. No uptime monitoring

- **Where:** Neither app, no config
- **What's wrong:** No evidence of UptimeRobot, BetterStack, Pingdom, or equivalent pointing at either production URL. You'll find out the site is down when a client emails you.
- **Fix:** Sign up for UptimeRobot (free). Add monitors for `https://admin.thepeoplesystem.co.uk/auth/login` and `https://portal.thepeoplesystem.co.uk/auth/login`. Set email alerts.

### M6. No Content-Security-Policy header on either app

- **Where:** Both live URLs — verified via response headers
- **What's wrong:** CSP header is absent from both apps. All other security headers (HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy) are present and correct — so this is the one gap.
- **Fix:** Add a CSP to `next.config.js` (or equivalent) `headers()` config. A starter policy for Next.js:
  ```js
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co;"
  ```
  Tighten over time once you see what breaks.

### M7. .gitignore does not cover plain `.env` file

- **Where:** `admin/.gitignore`, `portal/.gitignore`
- **What's wrong:** Both `.gitignore` files list `.env.local`, `.env.development.local`, `.env.test.local`, `.env.production.local` — but NOT `.env`. If a developer creates a plain `.env` with real keys and runs `git add .`, it will be committed and pushed. The root-level `.env.example` file (which is tracked, correctly) makes this confusion more likely.
- **Fix:** Add `.env` to both `.gitignore` files. Run `git log --all --full-history -- ".env"` to confirm no plain `.env` has ever been committed.

---

## MINOR

- `admin/src/app/(admin)/error.tsx:9` — Error boundary says "This has been logged automatically" but without error monitoring (M1), it hasn't been. Fix the copy or add monitoring.
- `admin/src/lib/email/layout.ts:17` — Email logo references `https://www.thepeoplesystem.co.uk/email-logo.png`. Verify this URL is live and returns a valid PNG — if the marketing site isn't deployed yet, all email logos will be broken images.
- `portal/.env.example:24` — `STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxx` in the example file. Placeholder value is fine, but the comment says "e-learning payments" — make sure production Vercel env uses `sk_live_` if Stripe is active, or explicitly leave it unset if e-learning isn't launched yet.
- SSL on both certs expires 2026-06-25 (55 days). Vercel auto-renews but confirm auto-renewal is enabled in your Vercel project settings — if a billing issue ever pauses renewal, 55 days is a short safety window.

---

## UNVERIFIED — Confirm before launch

- [ ] **`NEXT_PUBLIC_PORTAL_URL` is set to `https://portal.thepeoplesystem.co.uk`** in Vercel Production env vars for both the admin and portal projects. (B3 becomes a BLOCKER if missing.)
- [ ] **`RESEND_API_KEY` is set in Vercel Production** for the admin project and the key is a live Resend API key, not a test/dev one. Send a test invite email from admin after confirming and check it arrives in a real Gmail inbox.
- [ ] **`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`** — admin app has a live Stripe webhook handler (`/api/stripe/webhook`). Confirm whether Stripe billing is live for this launch. If yes: verify `sk_live_` key in prod, verify the webhook endpoint is registered in Stripe Dashboard → Developers → Webhooks with the correct `whsec_` signing secret. If no: confirm `STRIPE_SECRET_KEY` is intentionally absent or set to a dummy value that won't throw.
- [ ] **`CRON_SECRET` is set in Vercel Production** for the admin project, and is the same value registered in Vercel's cron configuration (Vercel injects it automatically if you set it — confirm in the cron dashboard that the last run returned 200, not 401).
- [ ] **Supabase DB migrations are all applied on production**. Run `supabase db diff --linked` or check Supabase Dashboard → Database → Migrations to confirm no pending migrations. A missing column or table causes a 500 on first request.
- [ ] **Supabase Auth SMTP** is configured to use custom SMTP (Resend) rather than Supabase's default. Default Supabase SMTP has poor deliverability and rate limits of ~3 emails/hour. Check Supabase Dashboard → Project Settings → Auth → SMTP Settings.

---

## What I checked

| Category | Status | How verified |
|---|---|---|
| Code & secrets | PASS (no leaked secrets) | `secret_scanner.py`, manual grep for `sk_live_`, `sk_test_`, `localhost`, `service_role` |
| Auth & onboarding | UNVERIFIED | Reviewed auth flow code; could not walk live flow without credentials |
| Payments | UNVERIFIED | Read Stripe webhook handler; cannot verify live mode keys from code alone |
| Core usage | PARTIAL | Read primary API routes; file uploads, email triggers reviewed in code |
| Errors & monitoring | FAIL | Grep for Sentry/Rollbar/Bugsnag across all source — nothing found |
| Infrastructure | PASS/PARTIAL | SSL check (valid, 55 days), security headers (all good except CSP), DNS resolution confirmed, HTTP→HTTPS redirect confirmed |
| Legal & compliance | N/A | Both apps are B2B invite-only portals with no public-facing sign-up or marketing pages. No ToS/Privacy required on the app itself — handled at the contractual/engagement level. |
| Content & UX | PASS | Grepped for Lorem Ipsum, placeholder text, TODO content — none found in UI copy |
| Email deliverability | FAIL | DNS query via Google DNS API confirmed zero SPF, DKIM, DMARC, MX records |

---

## What I couldn't check

- **Live auth walk-through** — No credentials to log in. Recommend a manual smoke test: attempt login, send a real invite, click the magic link, reset a password.
- **Vercel production env vars** — Cannot query Vercel dashboard from code. The UNVERIFIED section above is the direct output of this limitation.
- **Stripe live mode** — Cannot check the Stripe dashboard. Must be confirmed by the user.
- **Supabase backup configuration** — Dashboard check required.
- **Mobile responsiveness** — Not walked on a real device; would need browser-based walkthrough.

---

## Recommended order of attack

1. **Fix B1 (email DNS)** — this takes 24-48h to propagate. Start now.
2. **Fix B2 (MX records)** — same DNS session, do both at once.
3. **Confirm B3 (NEXT_PUBLIC_PORTAL_URL in Vercel)** — 2-minute Vercel dashboard check.
4. **Work through UNVERIFIED items** — check each env var in Vercel dashboard, especially RESEND_API_KEY and CRON_SECRET.
5. **M1 (Sentry)** — 30 minutes. Ship before launch.
6. **M2 (404 pages)** — 20 minutes. Two files.
7. **M5 (uptime monitoring)** — 10 minutes. UptimeRobot free tier.
8. **M7 (gitignore)** — 2 minutes. Two-line edit.
9. Fix M3, M4 (env var documentation) and M6 (CSP) in week 1 if not before.

**With B1 and B2 in motion and the UNVERIFIED items confirmed: you're close. The bones of this build are solid.**

---

*Generated by the `go-live-qa` skill. Audit is code-and-DNS-based. It does not substitute for a manual end-to-end test with a real invited user account on the live URL.*
