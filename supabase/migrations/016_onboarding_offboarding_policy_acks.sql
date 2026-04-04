-- ═══════════════════════════════════════════════════════════
-- ONBOARDING, OFFBOARDING, POLICY ACKNOWLEDGEMENTS
-- ═══════════════════════════════════════════════════════════

-- ─── Onboarding Templates ────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_templates (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,              -- e.g. "Standard New Starter", "Senior Hire"
  description    TEXT,
  is_default     BOOLEAN DEFAULT false,      -- auto-assign to new hires
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS onboarding_template_tasks (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id    UUID NOT NULL REFERENCES onboarding_templates(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT DEFAULT 'general',     -- general, it_setup, documents, training, intro
  due_day_offset INT DEFAULT 0,              -- days after start date
  assigned_to    TEXT,                       -- role or person responsible
  sort_order     INT DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ─── Onboarding Instances (per employee) ─────────────────
CREATE TABLE IF NOT EXISTS onboarding_instances (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id    UUID NOT NULL REFERENCES employee_records(id) ON DELETE CASCADE,
  template_id    UUID REFERENCES onboarding_templates(id),
  status         TEXT DEFAULT 'in_progress', -- in_progress, completed, cancelled
  started_at     TIMESTAMPTZ DEFAULT now(),
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS onboarding_task_progress (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id    UUID NOT NULL REFERENCES onboarding_instances(id) ON DELETE CASCADE,
  task_title     TEXT NOT NULL,
  task_description TEXT,
  category       TEXT DEFAULT 'general',
  due_date       DATE,
  status         TEXT DEFAULT 'pending',     -- pending, in_progress, completed, skipped
  completed_at   TIMESTAMPTZ,
  completed_by   UUID REFERENCES profiles(id),
  notes          TEXT,
  sort_order     INT DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ─── Offboarding Templates ───────────────────────────────
CREATE TABLE IF NOT EXISTS offboarding_templates (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  is_default     BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offboarding_template_tasks (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id    UUID NOT NULL REFERENCES offboarding_templates(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT DEFAULT 'general',     -- general, it_access, asset_return, knowledge_transfer, exit_admin
  due_day_offset INT DEFAULT 0,              -- days before/after last day (negative = before)
  assigned_to    TEXT,
  sort_order     INT DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offboarding_instances (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id    UUID NOT NULL REFERENCES employee_records(id) ON DELETE CASCADE,
  template_id    UUID REFERENCES offboarding_templates(id),
  last_working_day DATE,
  reason         TEXT,                       -- resignation, redundancy, dismissal, end_of_contract, retirement, other
  exit_interview_notes TEXT,
  status         TEXT DEFAULT 'in_progress', -- in_progress, completed, cancelled
  started_at     TIMESTAMPTZ DEFAULT now(),
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offboarding_task_progress (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id    UUID NOT NULL REFERENCES offboarding_instances(id) ON DELETE CASCADE,
  task_title     TEXT NOT NULL,
  task_description TEXT,
  category       TEXT DEFAULT 'general',
  due_date       DATE,
  status         TEXT DEFAULT 'pending',     -- pending, in_progress, completed, skipped
  completed_at   TIMESTAMPTZ,
  completed_by   UUID REFERENCES profiles(id),
  notes          TEXT,
  sort_order     INT DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ─── Policy Acknowledgements ─────────────────────────────
CREATE TABLE IF NOT EXISTS policy_acknowledgements (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id    UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  employee_id    UUID NOT NULL REFERENCES employee_records(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ,
  status         TEXT DEFAULT 'pending',     -- pending, acknowledged, overdue
  sent_at        TIMESTAMPTZ DEFAULT now(),
  reminder_sent  BOOLEAN DEFAULT false,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(document_id, employee_id)           -- one ack per doc per employee
);

-- ─── Indexes ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_onboard_templates_company ON onboarding_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_onboard_instances_company ON onboarding_instances(company_id);
CREATE INDEX IF NOT EXISTS idx_onboard_instances_employee ON onboarding_instances(employee_id);
CREATE INDEX IF NOT EXISTS idx_onboard_progress_instance ON onboarding_task_progress(instance_id);
CREATE INDEX IF NOT EXISTS idx_offboard_templates_company ON offboarding_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_offboard_instances_company ON offboarding_instances(company_id);
CREATE INDEX IF NOT EXISTS idx_offboard_instances_employee ON offboarding_instances(employee_id);
CREATE INDEX IF NOT EXISTS idx_offboard_progress_instance ON offboarding_task_progress(instance_id);
CREATE INDEX IF NOT EXISTS idx_policy_acks_company ON policy_acknowledgements(company_id);
CREATE INDEX IF NOT EXISTS idx_policy_acks_document ON policy_acknowledgements(document_id);
CREATE INDEX IF NOT EXISTS idx_policy_acks_employee ON policy_acknowledgements(employee_id);

-- ─── RLS ─────────────────────────────────────────────────
ALTER TABLE onboarding_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_task_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE offboarding_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE offboarding_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE offboarding_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE offboarding_task_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_acknowledgements ENABLE ROW LEVEL SECURITY;

-- Shared policy macro: company users can read, client_admin + ravello staff can write
DO $$ BEGIN
  -- Onboarding templates
  CREATE POLICY onboard_tmpl_sel ON onboarding_templates FOR SELECT USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );
  CREATE POLICY onboard_tmpl_mod ON onboarding_templates FOR ALL USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );

  -- Onboarding template tasks
  CREATE POLICY onboard_tmpl_tasks_sel ON onboarding_template_tasks FOR SELECT USING (
    template_id IN (SELECT id FROM onboarding_templates WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );
  CREATE POLICY onboard_tmpl_tasks_mod ON onboarding_template_tasks FOR ALL USING (
    template_id IN (SELECT id FROM onboarding_templates WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin'))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );

  -- Onboarding instances
  CREATE POLICY onboard_inst_sel ON onboarding_instances FOR SELECT USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );
  CREATE POLICY onboard_inst_mod ON onboarding_instances FOR ALL USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );

  -- Onboarding task progress
  CREATE POLICY onboard_prog_sel ON onboarding_task_progress FOR SELECT USING (
    instance_id IN (SELECT id FROM onboarding_instances WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );
  CREATE POLICY onboard_prog_mod ON onboarding_task_progress FOR ALL USING (
    instance_id IN (SELECT id FROM onboarding_instances WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin'))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );

  -- Offboarding (same pattern)
  CREATE POLICY offboard_tmpl_sel ON offboarding_templates FOR SELECT USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );
  CREATE POLICY offboard_tmpl_mod ON offboarding_templates FOR ALL USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );
  CREATE POLICY offboard_tmpl_tasks_sel ON offboarding_template_tasks FOR SELECT USING (
    template_id IN (SELECT id FROM offboarding_templates WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );
  CREATE POLICY offboard_tmpl_tasks_mod ON offboarding_template_tasks FOR ALL USING (
    template_id IN (SELECT id FROM offboarding_templates WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin'))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );
  CREATE POLICY offboard_inst_sel ON offboarding_instances FOR SELECT USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );
  CREATE POLICY offboard_inst_mod ON offboarding_instances FOR ALL USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );
  CREATE POLICY offboard_prog_sel ON offboarding_task_progress FOR SELECT USING (
    instance_id IN (SELECT id FROM offboarding_instances WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );
  CREATE POLICY offboard_prog_mod ON offboarding_task_progress FOR ALL USING (
    instance_id IN (SELECT id FROM offboarding_instances WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin'))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );

  -- Policy acknowledgements
  CREATE POLICY policy_ack_sel ON policy_acknowledgements FOR SELECT USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );
  CREATE POLICY policy_ack_mod ON policy_acknowledgements FOR ALL USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
