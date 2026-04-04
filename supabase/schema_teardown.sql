-- ══════════════════════════════════════════════════════════════════════════════
--  THE PEOPLE SYSTEM — FULL TEARDOWN
--  Run this BEFORE schema_fresh_install.sql to start clean.
--  WARNING: This permanently deletes ALL data. No undo.
-- ══════════════════════════════════════════════════════════════════════════════

-- ═══ DROP VIEWS ═════════════════════════════════════════════════════════════
DROP VIEW IF EXISTS bd_leads_view CASCADE;

-- ═══ DROP TABLES (reverse dependency order) ═════════════════════════════════

-- Integration tables (no dependents)
DROP TABLE IF EXISTS company_friction_items CASCADE;
DROP TABLE IF EXISTS company_assessments CASCADE;
DROP TABLE IF EXISTS ivylens_tickets CASCADE;
DROP TABLE IF EXISTS sync_state CASCADE;
DROP TABLE IF EXISTS partner_api_keys CASCADE;

-- GDPR
DROP TABLE IF EXISTS data_access_requests CASCADE;

-- Admin operations
DROP TABLE IF EXISTS internal_tasks CASCADE;
DROP TABLE IF EXISTS activity_log CASCADE;
DROP TABLE IF EXISTS client_notes CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;

-- Policy acknowledgements
DROP TABLE IF EXISTS policy_acknowledgements CASCADE;

-- Offboarding
DROP TABLE IF EXISTS offboarding_task_progress CASCADE;
DROP TABLE IF EXISTS offboarding_instances CASCADE;
DROP TABLE IF EXISTS offboarding_template_tasks CASCADE;
DROP TABLE IF EXISTS offboarding_templates CASCADE;

-- Onboarding
DROP TABLE IF EXISTS onboarding_task_progress CASCADE;
DROP TABLE IF EXISTS onboarding_instances CASCADE;
DROP TABLE IF EXISTS onboarding_template_tasks CASCADE;
DROP TABLE IF EXISTS onboarding_templates CASCADE;

-- Calendar + leave
DROP TABLE IF EXISTS company_calendar_events CASCADE;
DROP TABLE IF EXISTS leave_records CASCADE;

-- PROTECT
DROP TABLE IF EXISTS hr_metrics CASCADE;
DROP TABLE IF EXISTS absence_records CASCADE;
DROP TABLE IF EXISTS employee_documents CASCADE;

-- Employee records (after leave_records, onboarding, offboarding, policy_acks)
DROP TABLE IF EXISTS employee_records CASCADE;

-- Learning
DROP TABLE IF EXISTS learning_purchases CASCADE;
DROP TABLE IF EXISTS learning_content CASCADE;

-- LEAD
DROP TABLE IF EXISTS skills_matrix CASCADE;
DROP TABLE IF EXISTS performance_reviews CASCADE;
DROP TABLE IF EXISTS training_needs CASCADE;

-- Salary benchmarks + JD templates
DROP TABLE IF EXISTS salary_benchmarks CASCADE;
DROP TABLE IF EXISTS jd_templates CASCADE;

-- Interviews + offers (depend on candidates + requisitions)
DROP TABLE IF EXISTS interview_schedules CASCADE;
DROP TABLE IF EXISTS offers CASCADE;

-- BD intelligence
DROP TABLE IF EXISTS bd_scanned_roles CASCADE;
DROP TABLE IF EXISTS bd_companies CASCADE;

-- Service requests + milestones + actions + services
DROP TABLE IF EXISTS service_requests CASCADE;
DROP TABLE IF EXISTS milestones CASCADE;
DROP TABLE IF EXISTS actions CASCADE;
DROP TABLE IF EXISTS client_services CASCADE;

-- Reports + compliance
DROP TABLE IF EXISTS reports CASCADE;
DROP TABLE IF EXISTS compliance_items CASCADE;

-- Tickets
DROP TABLE IF EXISTS ticket_messages CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;

-- Documents
DROP TABLE IF EXISTS documents CASCADE;

-- Candidates (depends on requisitions)
DROP TABLE IF EXISTS candidates CASCADE;

-- Requisitions (depends on companies + profiles)
DROP TABLE IF EXISTS requisitions CASCADE;

-- Profiles (depends on companies via company_id)
DROP TABLE IF EXISTS profiles CASCADE;

-- Companies (must be last core table)
DROP TABLE IF EXISTS companies CASCADE;

-- ═══ DROP FUNCTIONS ═════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_employee_records_updated_at() CASCADE;
DROP FUNCTION IF EXISTS my_company_id() CASCADE;
DROP FUNCTION IF EXISTS is_tps_staff() CASCADE;
DROP FUNCTION IF EXISTS bd_companies_updated_at() CASCADE;

-- ═══ DROP ENUMS ═════════════════════════════════════════════════════════════
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS hiring_stage CASCADE;
DROP TYPE IF EXISTS ticket_status CASCADE;
DROP TYPE IF EXISTS ticket_priority CASCADE;
DROP TYPE IF EXISTS doc_category CASCADE;
DROP TYPE IF EXISTS compliance_status CASCADE;
DROP TYPE IF EXISTS candidate_client_status CASCADE;
DROP TYPE IF EXISTS employment_status CASCADE;
DROP TYPE IF EXISTS leave_type CASCADE;
DROP TYPE IF EXISTS leave_status CASCADE;
DROP TYPE IF EXISTS leave_year_type CASCADE;
DROP TYPE IF EXISTS calendar_event_type CASCADE;

-- ══════════════════════════════════════════════════════════════════════════════
--  TEARDOWN COMPLETE
--  Now run schema_fresh_install.sql to recreate everything.
-- ══════════════════════════════════════════════════════════════════════════════
