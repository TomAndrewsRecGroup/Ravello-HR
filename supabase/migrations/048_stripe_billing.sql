-- ════════════════════════════════════════════════════════════════════════
-- Migration 048: Stripe billing columns on companies
-- ────────────────────────────────────────────────────────────────────────
-- Phase 6 (D) of the UX/onboarding plan adds Stripe-backed monthly
-- retainer billing. Each company gets its own custom-priced subscription:
--
--   Stripe Product (shared)         "The People System Monthly Retainer"
--     ↓
--   Stripe Price  (per-company)     custom unit_amount, recurring monthly
--     ↓
--   Stripe Subscription (per-company)
--     ↓
--   Stripe Customer  (per-company, one per row)
--
-- When admin changes a client's £ amount we create a new Price, swap the
-- subscription to it (with proration), and archive the old Price. Stripe
-- keeps historical Price objects for invoice references.
--
-- This migration only adds the schema. No Stripe API calls happen here —
-- those run from the admin app when admin creates/edits a client.
--
-- Idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════
-- 1. Stripe identity + price columns on companies
-- ════════════════════════════════════════════════════════════════
-- All nullable: existing companies don't have a subscription yet, and
-- admin can choose to skip Stripe (e.g. for free trials or pre-billing
-- engagements) by leaving the retainer at zero.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id        TEXT,
  ADD COLUMN IF NOT EXISTS monthly_retainer_pence INTEGER,
  ADD COLUMN IF NOT EXISTS subscription_status    TEXT,
  ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_currency       TEXT NOT NULL DEFAULT 'gbp';

-- Validate the status field against known Stripe subscription states.
-- Allow NULL for companies without a subscription yet.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'companies_subscription_status_check'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_subscription_status_check
      CHECK (subscription_status IS NULL OR subscription_status IN (
        'active', 'past_due', 'canceled', 'incomplete',
        'incomplete_expired', 'trialing', 'unpaid', 'paused'
      ));
  END IF;
END $$;

-- Quick lookups by Stripe IDs (webhook handlers fetch by these).
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_stripe_customer
  ON companies (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_stripe_subscription
  ON companies (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;


-- ════════════════════════════════════════════════════════════════
-- 2. stripe_events — idempotency log for incoming webhooks
-- ════════════════════════════════════════════════════════════════
-- Stripe occasionally retries webhook deliveries (network blips, our
-- 5xx). We log the event id on first successful handle so a retry is
-- a no-op rather than a double-update.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS stripe_events (
  id            TEXT PRIMARY KEY,                 -- Stripe event id (evt_*)
  type          TEXT NOT NULL,                    -- e.g. invoice.paid
  payload       JSONB,                            -- full event for audit
  handled_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id    UUID REFERENCES companies(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_company  ON stripe_events (company_id);
CREATE INDEX IF NOT EXISTS idx_stripe_events_handled  ON stripe_events (handled_at DESC);


-- ════════════════════════════════════════════════════════════════
-- 3. RLS on stripe_events — staff-only
-- ════════════════════════════════════════════════════════════════
-- Webhook events are an internal billing audit trail. Clients should
-- never see raw Stripe event payloads (they may include other clients'
-- card metadata). Admin staff have full access.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stripe_events_staff_all" ON stripe_events;
CREATE POLICY "stripe_events_staff_all" ON stripe_events FOR ALL
  TO authenticated
  USING ((SELECT is_tps_staff()))
  WITH CHECK ((SELECT is_tps_staff()));


-- ════════════════════════════════════════════════════════════════
-- 4. Verification (read-only)
-- ════════════════════════════════════════════════════════════════

SELECT
  EXISTS(SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='companies'
            AND column_name='stripe_customer_id')                  AS stripe_columns_added,
  EXISTS(SELECT 1 FROM pg_class
          WHERE relname='stripe_events' AND relkind='r')          AS stripe_events_table_exists,
  (SELECT COUNT(*) FROM companies WHERE stripe_customer_id IS NULL) AS companies_without_subscription;
