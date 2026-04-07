-- ======================================================================
--  Migration 026: Performance indexes
--
--  Adds composite indexes for the most common query patterns identified
--  in the performance audit. These cover:
--  - Every page that filters by company_id + status/stage
--  - Dashboard count queries
--  - Engagement/analytics aggregation queries
--  - Compliance overdue checks (company_id + due_date)
--
--  All indexes use IF NOT EXISTS for idempotency.
-- ======================================================================

-- ── Requisitions ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_requisitions_company_stage
  ON requisitions (company_id, stage);

CREATE INDEX IF NOT EXISTS idx_requisitions_company_created
  ON requisitions (company_id, created_at DESC);

-- ── Candidates ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_candidates_requisition_approved
  ON candidates (requisition_id, approved_for_client)
  WHERE approved_for_client = true;

CREATE INDEX IF NOT EXISTS idx_candidates_company_status
  ON candidates (company_id, client_status);

-- ── Tickets ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tickets_company_status
  ON tickets (company_id, status);

CREATE INDEX IF NOT EXISTS idx_tickets_status_created
  ON tickets (status, created_at DESC)
  WHERE status NOT IN ('closed', 'resolved');

-- ── Compliance items ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_compliance_company_status
  ON compliance_items (company_id, status);

CREATE INDEX IF NOT EXISTS idx_compliance_company_duedate
  ON compliance_items (company_id, due_date)
  WHERE status != 'complete';

CREATE INDEX IF NOT EXISTS idx_compliance_overdue
  ON compliance_items (status, due_date)
  WHERE status = 'overdue';

-- ── Actions ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_actions_company_status
  ON actions (company_id, status);

CREATE INDEX IF NOT EXISTS idx_actions_active
  ON actions (company_id, created_at DESC)
  WHERE status = 'active';

-- ── Documents ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_documents_company_created
  ON documents (company_id, created_at DESC);

-- ── Employee documents ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_empdocs_company_status
  ON employee_documents (company_id, status);

CREATE INDEX IF NOT EXISTS idx_empdocs_company_expiry
  ON employee_documents (company_id, expiry_date)
  WHERE status = 'active';

-- ── Absence records ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_absence_company_status
  ON absence_records (company_id, status);

CREATE INDEX IF NOT EXISTS idx_absence_pending
  ON absence_records (company_id, start_date)
  WHERE status = 'pending';

-- ── Training needs ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_training_company_status
  ON training_needs (company_id, status);

-- ── Performance reviews ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reviews_company_status
  ON performance_reviews (company_id, status);

-- ── Service requests ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_servicereqs_company_status
  ON service_requests (company_id, status);

CREATE INDEX IF NOT EXISTS idx_servicereqs_open
  ON service_requests (status, created_at DESC)
  WHERE status IN ('open', 'in_progress');

-- ── Milestones ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_milestones_company_duedate
  ON milestones (company_id, due_date);

-- ── Client services ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clientservices_company_status
  ON client_services (company_id, status);

-- ── Profiles ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_company_role
  ON profiles (company_id, role);

-- ── Ticket messages ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ticketmsgs_ticket_created
  ON ticket_messages (ticket_id, created_at);

-- ── Client notes (for engagement page) ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clientnotes_company_created
  ON client_notes (company_id, created_at DESC);

-- ── Employee records ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_employees_company_name
  ON employee_records (company_id, full_name);

-- ── Leave records ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leave_company_date
  ON leave_records (company_id, start_date DESC);

-- ── Interview schedules ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_interviews_req_scheduled
  ON interview_schedules (requisition_id, scheduled_at);

-- ── Company assessments ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_assessments_company_created
  ON company_assessments (company_id, created_at DESC);
