-- ======================================================================
--  Migration 024: Demo Company Seed Data — The People System
--
--  Creates a fully populated demo company with 12 months of realistic
--  UK HR data across all modules: HIRE, LEAD, PROTECT, compliance,
--  support, documents, roadmap, calendar, benchmarks, and metrics.
--
--  Idempotent: every INSERT uses ON CONFLICT (id) DO NOTHING.
--  Company ID: 00000000-0000-0000-0000-000000000001
-- ======================================================================

-- Temporarily relax NOT NULL constraints on FK audit columns so seed
-- data can be inserted without real auth.users references.
ALTER TABLE requisitions      ALTER COLUMN submitted_by DROP NOT NULL;
ALTER TABLE tickets           ALTER COLUMN submitted_by DROP NOT NULL;
ALTER TABLE documents         ALTER COLUMN uploaded_by  DROP NOT NULL;
ALTER TABLE service_requests  ALTER COLUMN submitted_by DROP NOT NULL;


-- == 1. COMPANY ========================================================
INSERT INTO companies (id, name, slug, sector, size_band, contact_email, active, feature_flags, open_days, open_hours, timezone, currency)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'The People System',
  'the-people-system',
  'Technology',
  '20-50',
  'hello@thepeoplesystem.com',
  true,
  '{"hiring":true,"documents":true,"reports":true,"support":true,"metrics":true,"compliance":true,"lead":true,"protect":true,"learning":true,"benchmarks":true}'::jsonb,
  '["mon","tue","wed","thu","fri"]'::jsonb,
  '{"start":"09:00","end":"17:30"}'::jsonb,
  'Europe/London',
  'GBP'
)
ON CONFLICT (id) DO UPDATE SET
  feature_flags = EXCLUDED.feature_flags,
  open_days     = EXCLUDED.open_days,
  open_hours    = EXCLUDED.open_hours,
  timezone      = EXCLUDED.timezone,
  currency      = EXCLUDED.currency,
  active        = true;


-- == 2. LINK TPS ADMIN USERS ==========================================
UPDATE profiles
SET company_id = '00000000-0000-0000-0000-000000000001',
    onboarding_completed = true
WHERE role IN ('tps_admin', 'tps_client')
  AND (company_id IS NULL OR company_id = '00000000-0000-0000-0000-000000000001');


-- == 3. EMPLOYEE RECORDS (12 employees) ================================
INSERT INTO employee_records (id, company_id, full_name, email, job_title, department, employment_type, status, start_date, salary, salary_currency, gender, line_manager, annual_leave_allowance, sick_day_allowance, leave_year_type) VALUES
  ('e0000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Sarah Mitchell',  'sarah@thepeoplesystem.com',  'CEO',                   'Leadership',  'full_time', 'active', '2020-01-10', 95000, 'GBP', 'Female', NULL,              25, 10, 'fixed'),
  ('e0000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'James Hartley',   'james@thepeoplesystem.com',  'CTO',                   'Engineering', 'full_time', 'active', '2020-03-01', 88000, 'GBP', 'Male',   'Sarah Mitchell',  25, 10, 'fixed'),
  ('e0000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Priya Sharma',    'priya@thepeoplesystem.com',  'Head of Product',       'Product',     'full_time', 'active', '2021-06-14', 75000, 'GBP', 'Female', 'Sarah Mitchell',  25, 10, 'fixed'),
  ('e0000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Tom Andrews',     'tom@thepeoplesystem.com',    'Head of Sales',         'Sales',       'full_time', 'active', '2020-01-10', 72000, 'GBP', 'Male',   'Sarah Mitchell',  25, 10, 'fixed'),
  ('e0000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Emily Chen',      'emily@thepeoplesystem.com',  'Senior Engineer',       'Engineering', 'full_time', 'active', '2021-09-01', 65000, 'GBP', 'Female', 'James Hartley',   25, 10, 'fixed'),
  ('e0000006-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Marcus Johnson',  'marcus@thepeoplesystem.com', 'Full Stack Developer',  'Engineering', 'full_time', 'active', '2022-01-17', 55000, 'GBP', 'Male',   'James Hartley',   25, 10, 'fixed'),
  ('e0000007-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Aisha Patel',     'aisha@thepeoplesystem.com',  'UX Designer',           'Product',     'full_time', 'active', '2022-04-04', 52000, 'GBP', 'Female', 'Priya Sharma',    25, 10, 'fixed'),
  ('e0000008-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Oliver Bennett',  'oliver@thepeoplesystem.com', 'Account Executive',     'Sales',       'full_time', 'active', '2022-07-11', 45000, 'GBP', 'Male',   'Tom Andrews',     25, 10, 'fixed'),
  ('e0000009-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Chloe Williams',  'chloe@thepeoplesystem.com',  'Marketing Manager',     'Marketing',   'full_time', 'active', '2023-01-09', 48000, 'GBP', 'Female', 'Sarah Mitchell',  25, 10, 'fixed'),
  ('e0000010-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Daniel Okonkwo',  'daniel@thepeoplesystem.com', 'Customer Success',      'Operations',  'full_time', 'active', '2023-03-20', 38000, 'GBP', 'Male',   'Tom Andrews',     25, 10, 'fixed'),
  ('e0000011-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Lucy Foster',     'lucy@thepeoplesystem.com',   'HR Coordinator',        'People',      'part_time', 'active', '2023-06-01', 28000, 'GBP', 'Female', 'Sarah Mitchell',  25, 10, 'fixed'),
  ('e0000012-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Ryan Cooper',     'ryan@thepeoplesystem.com',   'Junior Developer',      'Engineering', 'full_time', 'active', '2024-01-15', 32000, 'GBP', 'Male',   'James Hartley',   25, 10, 'fixed')
ON CONFLICT (id) DO NOTHING;


-- == 4. REQUISITIONS (6 roles) =========================================
INSERT INTO requisitions (id, company_id, title, department, seniority, salary_range, salary_min, salary_max, location, employment_type, description, stage, working_model, friction_level, created_at) VALUES
  ('a1000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Backend Engineer',       'Engineering', 'Mid',    '50000-65000', 50000, 65000, 'London / Hybrid',  'full-time', 'Build scalable APIs and microservices for our HR platform. Experience with Node.js, PostgreSQL and cloud infrastructure required.', 'sourcing',      'hybrid',  'Medium',   NOW() - INTERVAL '18 days'),
  ('a1000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Product Designer',       'Product',     'Mid',    '45000-58000', 45000, 58000, 'Remote UK',        'full-time', 'Design intuitive experiences for our client portal. Strong Figma skills and SaaS experience essential.',                             'interviewing',  'remote',  'Low',      NOW() - INTERVAL '32 days'),
  ('a1000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Sales Development Rep',  'Sales',       'Junior', '28000-35000', 28000, 35000, 'Manchester',       'full-time', 'Generate qualified leads for our SME HR services. Outbound focus with SaaS experience preferred.',                                   'screening',     'office',  'High',     NOW() - INTERVAL '45 days'),
  ('a1000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'DevOps Engineer',        'Engineering', 'Senior', '70000-85000', 70000, 85000, 'Remote UK',        'full-time', 'Own our CI/CD, infrastructure, and platform reliability. AWS, Terraform, Kubernetes experience required.',                           'submitted',     'remote',  'Critical', NOW() - INTERVAL '7 days'),
  ('a1000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Marketing Coordinator',  'Marketing',   'Junior', '25000-32000', 25000, 32000, 'London',           'full-time', 'Support marketing campaigns, social media, and content creation for our HR tech brand.',                                             'filled',        'hybrid',  'Low',      NOW() - INTERVAL '90 days'),
  ('a1000006-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Data Analyst',           'Product',     'Mid',    '40000-52000', 40000, 52000, 'London / Hybrid',  'full-time', 'Analyse HR data trends and build dashboards for client insights. SQL and Python experience required.',                               'cancelled',     'hybrid',  'Medium',   NOW() - INTERVAL '60 days')
ON CONFLICT (id) DO NOTHING;


-- == 5. CANDIDATES (8) =================================================
INSERT INTO candidates (id, requisition_id, company_id, full_name, email, summary, approved_for_client, client_status, created_at) VALUES
  ('c0000001-0000-0000-0000-000000000001', 'a1000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Alex Rivera',    'alex.r@email.com',    'Strong Node.js background, 4 years at fintech startup. Good PostgreSQL knowledge.',                true,  'pending',  NOW() - INTERVAL '10 days'),
  ('c0000002-0000-0000-0000-000000000001', 'a1000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Nina Kowalski',  'nina.k@email.com',    'Full stack experience with TypeScript and Go. Ex-Monzo, keen on HR tech.',                         true,  'approved', NOW() - INTERVAL '8 days'),
  ('c0000003-0000-0000-0000-000000000001', 'a1000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Sam Turner',     'sam.t@email.com',     'Figma expert with portfolio including 3 SaaS redesigns. 5 years UX experience.',                   true,  'pending',  NOW() - INTERVAL '5 days'),
  ('c0000004-0000-0000-0000-000000000001', 'a1000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Maya Brooks',    'maya.b@email.com',    'Product designer with strong research skills. Previously at a Series B startup.',                  true,  'approved', NOW() - INTERVAL '12 days'),
  ('c0000005-0000-0000-0000-000000000001', 'a1000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Jordan Lee',     'jordan.l@email.com',  '2 years SDR at HubSpot partner agency. High activity metrics and strong CRM skills.',              true,  'pending',  NOW() - INTERVAL '3 days'),
  ('c0000006-0000-0000-0000-000000000001', 'a1000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Rachel Adams',   'rachel.a@email.com',  'Career changer from recruitment. Highly motivated but lacks direct SaaS sales experience.',        true,  'rejected', NOW() - INTERVAL '15 days'),
  ('c0000007-0000-0000-0000-000000000001', 'a1000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Chris Taylor',   'chris.t@email.com',   'Strong marketing background with B2B SaaS. Excellent content writing and analytics.',              true,  'hired',    NOW() - INTERVAL '60 days'),
  ('c0000008-0000-0000-0000-000000000001', 'a1000006-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Jamie Wilson',   'jamie.w@email.com',   'Data analyst with 3 years experience in HR analytics. Strong SQL and Tableau skills.',             true,  'pending',  NOW() - INTERVAL '50 days')
ON CONFLICT (id) DO NOTHING;


-- == 6. DOCUMENTS (8) ==================================================
INSERT INTO documents (id, company_id, name, category, file_url, file_size, version, created_at) VALUES
  ('d0000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Employee Handbook 2025',        'handbook',  'https://storage.example.com/tps/employee-handbook-2025.pdf',     2048000, 3, NOW() - INTERVAL '60 days'),
  ('d0000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Remote Working Policy',         'policy',    'https://storage.example.com/tps/remote-working-policy.pdf',     512000,  2, NOW() - INTERVAL '45 days'),
  ('d0000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Equal Opportunities Policy',    'policy',    'https://storage.example.com/tps/equal-opportunities.pdf',       384000,  1, NOW() - INTERVAL '120 days'),
  ('d0000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Anti-Bribery Policy',           'policy',    'https://storage.example.com/tps/anti-bribery.pdf',              256000,  1, NOW() - INTERVAL '100 days'),
  ('d0000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Q1 2025 Board Report',          'report',    'https://storage.example.com/tps/q1-board-report-2025.pdf',      1024000, 1, NOW() - INTERVAL '15 days'),
  ('d0000006-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Employment Contract Template',  'contract',  'https://storage.example.com/tps/contract-template.pdf',         320000,  4, NOW() - INTERVAL '180 days'),
  ('d0000007-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Grievance Procedure',           'policy',    'https://storage.example.com/tps/grievance-procedure.pdf',       290000,  2, NOW() - INTERVAL '90 days'),
  ('d0000008-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Data Protection Policy',        'policy',    'https://storage.example.com/tps/data-protection-policy.pdf',    410000,  1, NOW() - INTERVAL '75 days')
ON CONFLICT (id) DO NOTHING;


-- == 7. COMPLIANCE ITEMS (8) ===========================================
INSERT INTO compliance_items (id, company_id, title, category, status, due_date, notes, created_at) VALUES
  ('c1000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Health & Safety Risk Assessment',    'health_safety',   'complete', '2025-03-01', 'Annual review completed by external assessor. No major findings.',                  NOW() - INTERVAL '120 days'),
  ('c1000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'GDPR Data Audit',                    'data_protection', 'pending',  '2025-06-30', 'Annual data mapping and retention review. Third-party processor list needs updating.',NOW() - INTERVAL '30 days'),
  ('c1000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Fire Safety Certificate',             'health_safety',   'overdue',  '2025-03-15', 'Certificate expired. Renewal inspection booked for next week.',                      NOW() - INTERVAL '150 days'),
  ('c1000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Right to Work Checks Q2',             'employment',      'pending',  '2025-07-01', 'Verify documentation for any Q2 new starters before day one.',                       NOW() - INTERVAL '14 days'),
  ('c1000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Employer Liability Insurance',        'insurance',       'complete', '2026-01-15', 'Renewed with Hiscox. Policy ref: HL-2025-4421. Premium GBP 1,850.',                 NOW() - INTERVAL '200 days'),
  ('c1000006-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'DBS Checks - Annual Review',          'employment',      'in_review','2025-05-31', 'Annual review of DBS status for 3 employees with regulated access.',                NOW() - INTERVAL '60 days'),
  ('c1000007-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'First Aid Training Renewal',          'health_safety',   'pending',  '2025-08-01', 'Lucy Foster and Daniel Okonkwo due for first aid refresher training.',               NOW() - INTERVAL '20 days'),
  ('c1000008-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Pensions Auto-Enrolment Review',      'financial',       'complete', '2025-04-01', 'Annual review completed. All eligible employees enrolled. Provider: Nest.',         NOW() - INTERVAL '90 days')
ON CONFLICT (id) DO NOTHING;


-- == 8. ACTIONS (10) ===================================================
INSERT INTO actions (id, company_id, action_type, title, priority, status, due_date, created_at, completed_at) VALUES
  ('a0000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'compliance',  'Complete GDPR data mapping exercise',             'high',   'active',    '2025-06-15', NOW() - INTERVAL '7 days',  NULL),
  ('a0000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'hiring',      'Review and approve Backend Engineer candidates',  'urgent', 'active',    '2025-04-20', NOW() - INTERVAL '3 days',  NULL),
  ('a0000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'policy',      'Update remote working policy for 2025',           'normal', 'active',    '2025-05-31', NOW() - INTERVAL '14 days', NULL),
  ('a0000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'onboarding',  'Prepare onboarding pack for Q2 starters',         'normal', 'complete',  '2025-04-01', NOW() - INTERVAL '30 days', NOW() - INTERVAL '5 days'),
  ('a0000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'compliance',  'Book fire safety inspection',                     'urgent', 'active',    '2025-04-10', NOW() - INTERVAL '5 days',  NULL),
  ('a0000006-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'reporting',   'Submit Q1 gender pay gap data',                   'high',   'complete',  '2025-04-05', NOW() - INTERVAL '21 days', NOW() - INTERVAL '2 days'),
  ('a0000007-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'policy',      'Review employee handbook for annual update',       'normal', 'active',    '2025-06-30', NOW() - INTERVAL '10 days', NULL),
  ('a0000008-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'compliance',  'Renew DBS checks for 3 employees',                'normal', 'active',    '2025-05-31', NOW() - INTERVAL '8 days',  NULL),
  ('a0000009-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'culture',     'Plan Q3 team building event',                     'low',    'active',    '2025-07-15', NOW() - INTERVAL '4 days',  NULL),
  ('a0000010-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'hiring',      'Update job descriptions for Engineering team',    'normal', 'complete',  '2025-03-31', NOW() - INTERVAL '25 days', NOW() - INTERVAL '8 days')
ON CONFLICT (id) DO NOTHING;


-- == 9. TICKETS (6) ====================================================
INSERT INTO tickets (id, company_id, subject, description, status, priority, created_at) VALUES
  ('b1000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Need advice on flexible working request',      'An employee has submitted a formal request for compressed hours (4-day week). Need guidance on how to assess this fairly under the Flexible Working Regulations 2023.',  'open',        'normal', NOW() - INTERVAL '2 days'),
  ('b1000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Maternity leave policy clarification',         'Team member expecting in August. Want to confirm our enhanced maternity pay entitlement and the process for keeping-in-touch (KIT) days.',                                'in_progress', 'high',   NOW() - INTERVAL '5 days'),
  ('b1000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Exit interview template request',              'We have a resignation coming up. Can you provide a structured exit interview template we can use?',                                                                       'resolved',    'low',    NOW() - INTERVAL '20 days'),
  ('b1000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Performance improvement plan guidance',        'Need to place an underperforming team member on a PIP. Looking for guidance on the correct process and template.',                                                         'open',        'high',   NOW() - INTERVAL '1 day'),
  ('b1000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Employee disciplinary process question',       'We have a conduct issue that may require formal disciplinary proceedings. Need urgent advice on the correct ACAS-compliant process.',                                       'in_progress', 'urgent', NOW() - INTERVAL '3 days'),
  ('b1000006-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Holiday carry-over policy query',              'Several employees have unused holiday from last year. What are our obligations under the Working Time Regulations for carry-over?',                                        'resolved',    'normal', NOW() - INTERVAL '15 days')
ON CONFLICT (id) DO NOTHING;


-- == 10. SERVICE REQUESTS (4) ==========================================
INSERT INTO service_requests (id, company_id, request_type, subject, details, urgency, status, response_notes, responded_at, created_at) VALUES
  ('5a000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'salary_benchmark',  'Salary Benchmark: Senior Engineer',              '{"role_title":"Senior Engineer","location":"London","seniority":"Senior","notes":"Comparing against market for retention purposes"}'::jsonb,              'Normal', 'new',         NULL, NULL, NOW() - INTERVAL '4 days'),
  ('5a000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'policy_update',     'Policy Update: Hybrid Working',                  '{"policy_name":"Hybrid Working Policy","change_needed":"Update to reflect new 3-day office requirement from Q3"}'::jsonb,                                'High',   'in_progress', NULL, NULL, NOW() - INTERVAL '10 days'),
  ('5a000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'manager_support',   'Manager Support: Underperformance Conversation', '{"employee_department":"Engineering","situation":"Manager needs coaching on having a difficult conversation about performance"}'::jsonb,                 'Normal', 'new',         NULL, NULL, NOW() - INTERVAL '2 days'),
  ('5a000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'hr_audit',          'HR Audit Request',                               '{"scope":"Full HR compliance audit","areas":["contracts","policies","GDPR","right-to-work"],"preferred_date":"2025-06-01"}'::jsonb,                      'Normal', 'responded',   'Audit scheduled for 2 June 2025. Checklist sent via email. Please ensure all employee files are up to date before the audit date.', NOW() - INTERVAL '1 day', NOW() - INTERVAL '8 days')
ON CONFLICT (id) DO NOTHING;


-- == 11. MILESTONES (8) ================================================
INSERT INTO milestones (id, company_id, pillar, title, status, quarter, due_date, created_at) VALUES
  ('a2000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'hiring',     'Launch employer brand on LinkedIn',         'complete',    'Q1 2025', '2025-03-31', NOW() - INTERVAL '120 days'),
  ('a2000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'compliance', 'Complete annual GDPR audit',                'in_progress', 'Q2 2025', '2025-06-30', NOW() - INTERVAL '60 days'),
  ('a2000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'hiring',     'Implement structured interviews',           'in_progress', 'Q2 2025', '2025-06-30', NOW() - INTERVAL '45 days'),
  ('a2000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'culture',    'Roll out engagement surveys',               'not_started', 'Q3 2025', '2025-09-30', NOW() - INTERVAL '10 days'),
  ('a2000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'wellbeing',  'Introduce mental health first aiders',      'not_started', 'Q3 2025', '2025-09-30', NOW() - INTERVAL '10 days'),
  ('a2000006-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'reward',     'Review benefits package',                   'not_started', 'Q4 2025', '2025-12-31', NOW() - INTERVAL '5 days'),
  ('a2000007-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'learning',   'Build internal L&D programme',              'not_started', 'Q4 2025', '2025-12-31', NOW() - INTERVAL '5 days'),
  ('a2000008-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'reward',     'Annual salary review cycle',                'not_started', 'Q1 2026', '2026-03-31', NOW() - INTERVAL '3 days')
ON CONFLICT (id) DO NOTHING;


-- == 12. TRAINING NEEDS (8) ============================================
INSERT INTO training_needs (id, company_id, employee_name, department, skill_gap, priority, status, notes, target_date, created_at) VALUES
  ('b2000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Emily Chen',      'Engineering', 'Leadership Development',             'high',     'open',       'Ready to step up to tech lead. Needs formal leadership training programme.',    '2025-09-01', NOW() - INTERVAL '30 days'),
  ('b2000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'All Staff',       'All',         'GDPR Refresher Training',            'high',     'open',       'Annual GDPR refresher required for all staff. Online module available.',         '2025-06-30', NOW() - INTERVAL '20 days'),
  ('b2000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Lucy Foster',     'People',      'First Aid at Work',                  'medium',   'resolved',   'Completed 3-day First Aid at Work course with St John Ambulance.',              '2025-03-15', NOW() - INTERVAL '90 days'),
  ('b2000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Marcus Johnson',  'Engineering', 'React Advanced Patterns',            'medium',   'open',       'Needs deeper understanding of React Server Components and performance.',        '2025-07-01', NOW() - INTERVAL '15 days'),
  ('b2000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Chloe Williams',  'Marketing',   'Public Speaking & Presentation',     'low',      'open',       'Wants to improve conference presentation skills for upcoming events.',           '2025-09-01', NOW() - INTERVAL '10 days'),
  ('b2000006-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Aisha Patel',     'Product',     'Project Management (Prince2)',       'medium',   'resolved',   'Completed Prince2 Foundation online. Certificate received.',                    '2025-02-28', NOW() - INTERVAL '100 days'),
  ('b2000007-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Oliver Bennett',  'Sales',       'Sales Methodology (MEDDIC)',         'high',     'open',       'Needs structured sales methodology training. MEDDIC course recommended.',       '2025-06-30', NOW() - INTERVAL '25 days'),
  ('b2000008-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'All Staff',       'All',         'Cyber Security Awareness',           'critical', 'open',       'Mandatory annual cyber security training. Phishing simulation to follow.',      '2025-05-31', NOW() - INTERVAL '14 days')
ON CONFLICT (id) DO NOTHING;


-- == 13. PERFORMANCE REVIEWS (6) =======================================
INSERT INTO performance_reviews (id, company_id, employee_name, employee_email, department, review_period, review_type, status, overall_rating, reviewer_name, due_date, completed_at, notes, created_at) VALUES
  ('b3000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Sarah Mitchell',  'sarah@thepeoplesystem.com',  'Leadership',  'Q1 2025', 'annual',    'completed',   'Exceeds',      'Board',           '2025-03-31', NOW() - INTERVAL '15 days', 'Outstanding leadership through rapid growth phase. Successfully scaled team from 8 to 12.', NOW() - INTERVAL '60 days'),
  ('b3000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'James Hartley',   'james@thepeoplesystem.com',  'Engineering', 'Q1 2025', 'annual',    'completed',   'Exceeds',      'Sarah Mitchell',  '2025-03-31', NOW() - INTERVAL '12 days', 'Strong technical leadership. Delivered platform migration on time and under budget.',       NOW() - INTERVAL '60 days'),
  ('b3000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Emily Chen',      'emily@thepeoplesystem.com',  'Engineering', 'Q1 2025', 'annual',    'completed',   'Exceeds',      'James Hartley',   '2025-03-31', NOW() - INTERVAL '10 days', 'Exceptional contribution to core platform. Ready for tech lead promotion discussion.',      NOW() - INTERVAL '60 days'),
  ('b3000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Marcus Johnson',  'marcus@thepeoplesystem.com', 'Engineering', 'Q2 2024', 'probation', 'completed',   'Meets',        'James Hartley',   '2024-07-17', '2024-07-10'::timestamptz,  'Passed probation successfully. Good progress on React skills, needs more backend exposure.', NOW() - INTERVAL '300 days'),
  ('b3000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Ryan Cooper',     'ryan@thepeoplesystem.com',   'Engineering', 'Q1 2025', 'probation', 'in_progress', NULL,           'James Hartley',   '2025-04-15', NULL,                       'Probation review in progress. Showing good learning trajectory.',                           NOW() - INTERVAL '30 days'),
  ('b3000006-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Aisha Patel',     'aisha@thepeoplesystem.com',  'Product',     'Q2 2025', 'annual',    'pending',     NULL,           'Priya Sharma',    '2025-06-30', NULL,                       NULL,                                                                                        NOW() - INTERVAL '5 days')
ON CONFLICT (id) DO NOTHING;


-- == 14. SKILLS MATRIX (15 entries) ====================================
INSERT INTO skills_matrix (id, company_id, employee_name, department, role_title, skill_name, skill_category, current_level, target_level, last_assessed, created_at) VALUES
  ('b4000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Emily Chen',      'Engineering', 'Senior Engineer',       'TypeScript',   'Technical',    5, 5, '2025-03-15', NOW() - INTERVAL '30 days'),
  ('b4000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Marcus Johnson',  'Engineering', 'Full Stack Developer',  'TypeScript',   'Technical',    4, 5, '2025-03-15', NOW() - INTERVAL '30 days'),
  ('b4000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Ryan Cooper',     'Engineering', 'Junior Developer',      'TypeScript',   'Technical',    2, 4, '2025-03-15', NOW() - INTERVAL '30 days'),
  ('b4000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Emily Chen',      'Engineering', 'Senior Engineer',       'React',        'Technical',    5, 5, '2025-03-15', NOW() - INTERVAL '30 days'),
  ('b4000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Marcus Johnson',  'Engineering', 'Full Stack Developer',  'React',        'Technical',    4, 5, '2025-03-15', NOW() - INTERVAL '30 days'),
  ('b4000006-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'James Hartley',   'Engineering', 'CTO',                   'Python',       'Technical',    4, 4, '2025-03-15', NOW() - INTERVAL '30 days'),
  ('b4000007-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Aisha Patel',     'Product',     'UX Designer',           'Figma',        'Technical',    5, 5, '2025-03-15', NOW() - INTERVAL '30 days'),
  ('b4000008-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Priya Sharma',    'Product',     'Head of Product',       'Figma',        'Technical',    3, 4, '2025-03-15', NOW() - INTERVAL '30 days'),
  ('b4000009-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Sarah Mitchell',  'Leadership',  'CEO',                   'Leadership',   'Leadership',   5, 5, '2025-03-15', NOW() - INTERVAL '30 days'),
  ('b4000010-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'James Hartley',   'Engineering', 'CTO',                   'Leadership',   'Leadership',   4, 5, '2025-03-15', NOW() - INTERVAL '30 days'),
  ('b4000011-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Tom Andrews',     'Sales',       'Head of Sales',         'Sales',        'Commercial',   5, 5, '2025-03-15', NOW() - INTERVAL '30 days'),
  ('b4000012-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Oliver Bennett',  'Sales',       'Account Executive',     'Sales',        'Commercial',   3, 4, '2025-03-15', NOW() - INTERVAL '30 days'),
  ('b4000013-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Chloe Williams',  'Marketing',   'Marketing Manager',     'Marketing',    'Commercial',   4, 5, '2025-03-15', NOW() - INTERVAL '30 days'),
  ('b4000014-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Lucy Foster',     'People',      'HR Coordinator',        'HR',           'Professional', 3, 4, '2025-03-15', NOW() - INTERVAL '30 days'),
  ('b4000015-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Ryan Cooper',     'Engineering', 'Junior Developer',      'React',        'Technical',    2, 4, '2025-03-15', NOW() - INTERVAL '30 days')
ON CONFLICT (id) DO NOTHING;


-- == 15. ABSENCE RECORDS (15) ==========================================
INSERT INTO absence_records (id, company_id, employee_name, employee_email, department, absence_type, start_date, end_date, days, status, notes, approved_by, created_at) VALUES
  ('ab000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Emily Chen',      'emily@thepeoplesystem.com',  'Engineering', 'holiday',       '2025-01-02', '2025-01-03', 2.0,  'approved', 'New Year extension',                   'James Hartley',  NOW() - INTERVAL '120 days'),
  ('ab000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Marcus Johnson',  'marcus@thepeoplesystem.com', 'Engineering', 'sick',          '2025-01-20', '2025-01-22', 3.0,  'approved', 'Flu. Self-certified.',                  'James Hartley',  NOW() - INTERVAL '100 days'),
  ('ab000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Oliver Bennett',  'oliver@thepeoplesystem.com', 'Sales',       'holiday',       '2025-02-17', '2025-02-21', 5.0,  'approved', 'Half-term family holiday',              'Tom Andrews',    NOW() - INTERVAL '80 days'),
  ('ab000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Chloe Williams',  'chloe@thepeoplesystem.com',  'Marketing',   'sick',          '2025-02-24', '2025-02-24', 1.0,  'approved', 'Migraine. Self-certified.',             'Sarah Mitchell', NOW() - INTERVAL '75 days'),
  ('ab000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Sarah Mitchell',  'sarah@thepeoplesystem.com',  'Leadership',  'holiday',       '2025-03-10', '2025-03-14', 5.0,  'approved', 'Spring break',                          NULL,             NOW() - INTERVAL '60 days'),
  ('ab000006-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Ryan Cooper',     'ryan@thepeoplesystem.com',   'Engineering', 'sick',          '2025-03-17', '2025-03-18', 2.0,  'approved', 'Back pain. Self-certified.',            'James Hartley',  NOW() - INTERVAL '55 days'),
  ('ab000007-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Tom Andrews',     'tom@thepeoplesystem.com',    'Sales',       'holiday',       '2025-04-14', '2025-04-17', 4.0,  'approved', 'Easter break extension',                'Sarah Mitchell', NOW() - INTERVAL '30 days'),
  ('ab000008-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Aisha Patel',     'aisha@thepeoplesystem.com',  'Product',     'holiday',       '2025-04-22', '2025-04-25', 4.0,  'approved', 'Visiting family',                       'Priya Sharma',   NOW() - INTERVAL '25 days'),
  ('ab000009-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Daniel Okonkwo',  'daniel@thepeoplesystem.com', 'Operations',  'compassionate','2025-03-03', '2025-03-05', 3.0,  'approved', 'Family bereavement',                    'Tom Andrews',    NOW() - INTERVAL '65 days'),
  ('ab000010-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Lucy Foster',     'lucy@thepeoplesystem.com',   'People',      'holiday',       '2025-05-26', '2025-05-30', 5.0,  'pending',  'Summer holiday request',                NULL,             NOW() - INTERVAL '5 days'),
  ('ab000011-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Priya Sharma',    'priya@thepeoplesystem.com',  'Product',     'holiday',       '2025-06-16', '2025-06-20', 5.0,  'pending',  'Annual leave - family trip',            NULL,             NOW() - INTERVAL '3 days'),
  ('ab000012-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'James Hartley',   'james@thepeoplesystem.com',  'Engineering', 'holiday',       '2025-07-21', '2025-08-01', 10.0, 'pending',  'Summer holiday - two weeks',            NULL,             NOW() - INTERVAL '2 days'),
  ('ab000013-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Emily Chen',      'emily@thepeoplesystem.com',  'Engineering', 'sick',          '2025-04-01', '2025-04-02', 2.0,  'approved', 'Stomach bug. Self-certified.',          'James Hartley',  NOW() - INTERVAL '10 days'),
  ('ab000014-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Marcus Johnson',  'marcus@thepeoplesystem.com', 'Engineering', 'holiday',       '2025-08-11', '2025-08-15', 5.0,  'pending',  'Summer holiday',                        NULL,             NOW() - INTERVAL '1 day'),
  ('ab000015-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Chloe Williams',  'chloe@thepeoplesystem.com',  'Marketing',   'holiday',       '2025-12-22', '2025-12-24', 3.0,  'pending',  'Christmas extension (before shutdown)',  NULL,             NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;


-- == 16. EMPLOYEE DOCUMENTS (12) =======================================
INSERT INTO employee_documents (id, company_id, employee_name, employee_email, department, doc_type, title, file_url, expiry_date, status, notes, created_at) VALUES
  ('ed000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Emily Chen',      'emily@thepeoplesystem.com',  'Engineering', 'dbs_check',     'DBS Certificate - Emily Chen',          'https://storage.example.com/tps/emp-docs/emily-dbs.pdf',     '2026-09-01', 'active',           'Enhanced DBS. Certificate number: 001234567890.',      NOW() - INTERVAL '180 days'),
  ('ed000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Ryan Cooper',     'ryan@thepeoplesystem.com',   'Engineering', 'right_to_work', 'Passport Copy - Ryan Cooper',           'https://storage.example.com/tps/emp-docs/ryan-passport.pdf', '2030-06-15', 'active',           'British passport. Verified on start date.',             NOW() - INTERVAL '100 days'),
  ('ed000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Marcus Johnson',  'marcus@thepeoplesystem.com', 'Engineering', 'contract',      'Employment Contract - Marcus Johnson',   'https://storage.example.com/tps/emp-docs/marcus-contract.pdf', NULL,       'active',           'Signed contract. Full-time permanent.',                 NOW() - INTERVAL '400 days'),
  ('ed000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Aisha Patel',     'aisha@thepeoplesystem.com',  'Product',     'dbs_check',     'DBS Certificate - Aisha Patel',         'https://storage.example.com/tps/emp-docs/aisha-dbs.pdf',     '2025-04-15', 'expiring_soon',    'Enhanced DBS expiring soon. Renewal application submitted.', NOW() - INTERVAL '350 days'),
  ('ed000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Oliver Bennett',  'oliver@thepeoplesystem.com', 'Sales',       'right_to_work', 'Passport Copy - Oliver Bennett',        'https://storage.example.com/tps/emp-docs/oliver-passport.pdf','2028-11-20', 'active',           'British passport. Verified on start date.',             NOW() - INTERVAL '300 days'),
  ('ed000006-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Daniel Okonkwo',  'daniel@thepeoplesystem.com', 'Operations',  'visa',          'Visa Document - Daniel Okonkwo',        'https://storage.example.com/tps/emp-docs/daniel-visa.pdf',   '2025-03-01', 'expired',          'Skilled Worker visa expired. Renewal in progress with solicitor.', NOW() - INTERVAL '400 days'),
  ('ed000007-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Lucy Foster',     'lucy@thepeoplesystem.com',   'People',      'other',         'First Aid Certificate - Lucy Foster',    'https://storage.example.com/tps/emp-docs/lucy-firstaid.pdf', '2028-03-15', 'active',           'First Aid at Work - 3 year certificate from St John Ambulance.', NOW() - INTERVAL '45 days'),
  ('ed000008-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Sarah Mitchell',  'sarah@thepeoplesystem.com',  'Leadership',  'contract',      'Director Service Agreement - Sarah',     'https://storage.example.com/tps/emp-docs/sarah-contract.pdf', NULL,        'active',           'Director service agreement. Signed 2020.',              NOW() - INTERVAL '500 days'),
  ('ed000009-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'James Hartley',   'james@thepeoplesystem.com',  'Engineering', 'dbs_check',     'DBS Certificate - James Hartley',       'https://storage.example.com/tps/emp-docs/james-dbs.pdf',     '2025-12-01', 'active',           'Enhanced DBS. Certificate number: 001234567891.',      NOW() - INTERVAL '200 days'),
  ('ed000010-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Tom Andrews',     'tom@thepeoplesystem.com',    'Sales',       'nda',           'NDA - Tom Andrews',                     'https://storage.example.com/tps/emp-docs/tom-nda.pdf',       NULL,         'active',           'Non-disclosure agreement. Signed on start date.',      NOW() - INTERVAL '500 days'),
  ('ed000011-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Priya Sharma',    'priya@thepeoplesystem.com',  'Product',     'right_to_work', 'Passport Copy - Priya Sharma',          'https://storage.example.com/tps/emp-docs/priya-passport.pdf','2027-08-10', 'active',           'British passport. Verified on start date.',             NOW() - INTERVAL '300 days'),
  ('ed000012-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Chloe Williams',  'chloe@thepeoplesystem.com',  'Marketing',   'contract',      'Employment Contract - Chloe Williams',  'https://storage.example.com/tps/emp-docs/chloe-contract.pdf', NULL,        'active',           'Signed contract. Full-time permanent.',                 NOW() - INTERVAL '250 days')
ON CONFLICT (id) DO NOTHING;


-- == 17. LEAVE RECORDS (12) ============================================
INSERT INTO leave_records (id, employee_id, company_id, leave_type, start_date, end_date, days_count, status, notes, created_at) VALUES
  ('1a000001-0000-0000-0000-000000000001', 'e0000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'annual_leave', '2025-01-02', '2025-01-03', 2.0, 'approved', 'New Year extension',                   NOW() - INTERVAL '120 days'),
  ('1a000002-0000-0000-0000-000000000001', 'e0000006-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'sick_day',     '2025-01-20', '2025-01-22', 3.0, 'approved', 'Flu. Self-certified.',                  NOW() - INTERVAL '100 days'),
  ('1a000003-0000-0000-0000-000000000001', 'e0000008-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'annual_leave', '2025-02-17', '2025-02-21', 5.0, 'approved', 'Half-term family holiday',              NOW() - INTERVAL '80 days'),
  ('1a000004-0000-0000-0000-000000000001', 'e0000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'annual_leave', '2025-03-10', '2025-03-14', 5.0, 'approved', 'Spring break',                          NOW() - INTERVAL '60 days'),
  ('1a000005-0000-0000-0000-000000000001', 'e0000012-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'sick_day',     '2025-03-17', '2025-03-18', 2.0, 'approved', 'Back pain. Self-certified.',            NOW() - INTERVAL '55 days'),
  ('1a000006-0000-0000-0000-000000000001', 'e0000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'annual_leave', '2025-04-14', '2025-04-17', 4.0, 'approved', 'Easter break extension',                NOW() - INTERVAL '30 days'),
  ('1a000007-0000-0000-0000-000000000001', 'e0000007-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'annual_leave', '2025-04-22', '2025-04-25', 4.0, 'approved', 'Visiting family',                       NOW() - INTERVAL '25 days'),
  ('1a000008-0000-0000-0000-000000000001', 'e0000011-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'annual_leave', '2025-05-26', '2025-05-30', 5.0, 'pending',  'Summer half-term holiday',              NOW() - INTERVAL '5 days'),
  ('1a000009-0000-0000-0000-000000000001', 'e0000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'annual_leave', '2025-06-16', '2025-06-20', 5.0, 'pending',  'Annual leave - family trip',            NOW() - INTERVAL '3 days'),
  ('1a000010-0000-0000-0000-000000000001', 'e0000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'annual_leave', '2025-07-21', '2025-08-01', 10.0,'pending',  'Summer holiday - two weeks',            NOW() - INTERVAL '2 days'),
  ('1a000011-0000-0000-0000-000000000001', 'e0000006-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'annual_leave', '2025-08-11', '2025-08-15', 5.0, 'pending',  'Summer holiday',                        NOW() - INTERVAL '1 day'),
  ('1a000012-0000-0000-0000-000000000001', 'e0000009-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'annual_leave', '2025-12-22', '2025-12-24', 3.0, 'pending',  'Christmas extension before shutdown',   NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;


-- == 18. COMPANY CALENDAR EVENTS (8) ===================================
INSERT INTO company_calendar_events (id, company_id, title, event_type, start_date, end_date, all_day, recurring_yearly, notes, created_at) VALUES
  ('ce000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Christmas Shutdown',           'closed_day',     '2025-12-23', '2026-01-01', true,  true,  'Annual office closure over Christmas and New Year.',          NOW() - INTERVAL '200 days'),
  ('ce000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Easter Closure',               'closed_day',     '2025-04-18', '2025-04-21', true,  true,  'Office closed Good Friday through Easter Monday.',            NOW() - INTERVAL '200 days'),
  ('ce000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Early May Bank Holiday',       'bank_holiday',   '2025-05-05', '2025-05-05', true,  false, 'UK public holiday.',                                          NOW() - INTERVAL '200 days'),
  ('ce000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Spring Bank Holiday',          'bank_holiday',   '2025-05-26', '2025-05-26', true,  false, 'UK public holiday.',                                          NOW() - INTERVAL '200 days'),
  ('ce000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Summer Bank Holiday',          'bank_holiday',   '2025-08-25', '2025-08-25', true,  false, 'UK public holiday.',                                          NOW() - INTERVAL '200 days'),
  ('ce000006-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Summer Team Day',              'company_event',  '2025-07-18', '2025-07-18', true,  false, 'Annual summer team day. Activities and dinner in central London.', NOW() - INTERVAL '30 days'),
  ('ce000007-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Q4 Planning Day',              'company_event',  '2025-10-10', '2025-10-10', true,  false, 'Full company offsite for Q4 planning and strategy.',           NOW() - INTERVAL '20 days'),
  ('ce000008-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Company Anniversary',          'company_event',  '2026-01-10', '2026-01-10', true,  true,  'The People System founded 10 January 2020. 6th anniversary.', NOW() - INTERVAL '200 days')
ON CONFLICT (id) DO NOTHING;


-- == 19. HR METRICS (4 monthly snapshots) ==============================
INSERT INTO hr_metrics (id, company_id, period, headcount, turnover_rate, absence_rate, gender_m_pct, gender_f_pct, avg_tenure_months, notes, created_at) VALUES
  ('4a000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2025-01', 12, 0.00, 2.80, 50.00, 50.00, 28, 'Stable month. No leavers or joiners.',                            NOW() - INTERVAL '90 days'),
  ('4a000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2025-02', 12, 0.00, 1.40, 50.00, 50.00, 29, 'Low absence month. Engagement survey planned for Q3.',            NOW() - INTERVAL '60 days'),
  ('4a000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2025-03', 12, 0.00, 3.20, 50.00, 50.00, 30, 'Slightly higher absence due to seasonal illness.',                NOW() - INTERVAL '30 days'),
  ('4a000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2025-04', 12, 0.00, 2.10, 50.00, 50.00, 31, 'Stable headcount. 4 active requisitions open. Backend Engineer and Product Designer in late stages.', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;


-- == 20. CLIENT SERVICES (3) ===========================================
INSERT INTO client_services (id, company_id, service_name, service_tier, start_date, monthly_fee, status, notes, created_at) VALUES
  ('c5000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'People Management Retainer', 'premium',  '2024-01-01', 250000, 'active', 'Full HR outsource retainer covering all people management needs.',    NOW() - INTERVAL '365 days'),
  ('c5000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Recruitment Support',        'standard', '2024-06-01', 50000,  'active', 'Ongoing recruitment support for all open roles. Includes sourcing.',  NOW() - INTERVAL '300 days'),
  ('c5000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Compliance Monitoring',      'standard', '2024-06-01', 35000,  'active', 'Monthly compliance monitoring and quarterly audit reviews.',          NOW() - INTERVAL '300 days')
ON CONFLICT (id) DO NOTHING;


-- == 21. SALARY BENCHMARKS (6) =========================================
INSERT INTO salary_benchmarks (id, role_type, location, seniority, working_model, salary_p25, salary_p50, salary_p75, salary_p90, currency, source, effective_date, notes, created_at) VALUES
  ('5b000001-0000-0000-0000-000000000001', 'Software Engineer',       'London',     'Mid',    'hybrid', 48000, 55000, 65000, 75000, 'GBP', 'Reed Technology Salary Guide 2025',     '2025-01-01', 'General software engineer benchmarks for London hybrid roles.',  NOW() - INTERVAL '90 days'),
  ('5b000002-0000-0000-0000-000000000001', 'Product Designer',        'Remote UK',  'Mid',    'remote', 42000, 50000, 58000, 68000, 'GBP', 'Hired UK Design Salary Report 2025',    '2025-01-01', 'Product/UX designer benchmarks for remote UK positions.',        NOW() - INTERVAL '90 days'),
  ('5b000003-0000-0000-0000-000000000001', 'Sales Development Rep',   'Manchester', 'Junior', 'office', 25000, 30000, 35000, 40000, 'GBP', 'Robert Walters Salary Survey 2025',     '2025-01-01', 'SDR role benchmarks for Manchester office-based.',               NOW() - INTERVAL '90 days'),
  ('5b000004-0000-0000-0000-000000000001', 'DevOps Engineer',         'Remote UK',  'Senior', 'remote', 65000, 75000, 85000, 95000, 'GBP', 'Stack Overflow Developer Survey 2024',  '2024-06-01', 'Senior DevOps benchmarks. Market is competitive for this role.', NOW() - INTERVAL '90 days'),
  ('5b000005-0000-0000-0000-000000000001', 'Marketing Coordinator',   'London',     'Junior', 'hybrid', 24000, 28000, 32000, 36000, 'GBP', 'Reed Marketing Salary Guide 2025',      '2025-01-01', 'Entry-level marketing coordinator in London.',                   NOW() - INTERVAL '90 days'),
  ('5b000006-0000-0000-0000-000000000001', 'Data Analyst',            'London',     'Mid',    'hybrid', 38000, 45000, 52000, 60000, 'GBP', 'Hays Technology Salary Guide 2025',     '2025-01-01', 'Data analyst benchmarks for London hybrid positions.',           NOW() - INTERVAL '90 days')
ON CONFLICT (id) DO NOTHING;


-- == RESTORE NOT NULL CONSTRAINTS ======================================
-- Restore the NOT NULL constraints we temporarily dropped for seeding.
ALTER TABLE requisitions      ALTER COLUMN submitted_by SET NOT NULL;
ALTER TABLE tickets           ALTER COLUMN submitted_by SET NOT NULL;
ALTER TABLE documents         ALTER COLUMN uploaded_by  SET NOT NULL;
ALTER TABLE service_requests  ALTER COLUMN submitted_by SET NOT NULL;

-- ======================================================================
--  END OF SEED DATA
-- ======================================================================
