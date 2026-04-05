-- ═══════════════════════════════════════════════════════════
-- ACCOUNT OWNER, INTERNAL TASKS
-- ═══════════════════════════════════════════════════════════

-- ─── Account owner on companies ──────────────────────────
ALTER TABLE companies ADD COLUMN IF NOT EXISTS account_owner_id UUID REFERENCES profiles(id);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT 'not_started';
-- onboarding_status: not_started, in_progress, completed

-- ─── Internal Tasks (TPS staff to-do board) ──────────────
CREATE TABLE IF NOT EXISTS internal_tasks (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    UUID REFERENCES companies(id) ON DELETE CASCADE,  -- nullable = general task
  assigned_to   UUID REFERENCES profiles(id),
  created_by    UUID NOT NULL REFERENCES profiles(id),
  title         TEXT NOT NULL,
  description   TEXT,
  priority      TEXT DEFAULT 'normal',   -- low, normal, high, urgent
  status        TEXT DEFAULT 'todo',     -- todo, in_progress, done
  due_date      DATE,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_tasks_assigned ON internal_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_internal_tasks_status ON internal_tasks(status);
CREATE INDEX IF NOT EXISTS idx_internal_tasks_company ON internal_tasks(company_id);

-- ─── RLS ─────────────────────────────────────────────────
ALTER TABLE internal_tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY internal_tasks_all ON internal_tasks FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_client'))
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
