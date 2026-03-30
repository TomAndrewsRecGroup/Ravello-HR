-- ══════════════════════════════════════════════════════════════
--  Migration 014: Sync State + IvyLens Tickets
--  Tracks ticket poll timestamps and IvyLens ticket IDs
-- ══════════════════════════════════════════════════════════════

-- ── Sync State (key-value store for poll timestamps) ─────────
CREATE TABLE IF NOT EXISTS sync_state (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tps_sync_state" ON sync_state
  FOR ALL USING (is_tps_staff());

-- Allow authenticated users to read/write their own poll state
CREATE POLICY "auth_sync_state" ON sync_state
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ── IvyLens Ticket ID mapping ────────────────────────────────
-- Maps local ticket references to IvyLens ticket IDs
CREATE TABLE IF NOT EXISTS ivylens_tickets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ivylens_ticket_id TEXT NOT NULL,
  category          TEXT NOT NULL,
  subject           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open',
  priority          TEXT NOT NULL DEFAULT 'normal',
  reference_id      TEXT,
  created_by        UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ivylens_tickets_company ON ivylens_tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_ivylens_tickets_status  ON ivylens_tickets(status);

ALTER TABLE ivylens_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_ivylens_tickets" ON ivylens_tickets
  FOR ALL USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "tps_ivylens_tickets" ON ivylens_tickets
  FOR ALL USING (is_tps_staff());
