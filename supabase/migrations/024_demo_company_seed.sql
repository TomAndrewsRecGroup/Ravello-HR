-- ══════════════════════════════════════════════════════════════
--  Migration 024: Demo Company Seed Data
--
--  Creates "The People System" as a demo company with realistic
--  fake data. Links all tps_admin users to this company so they
--  can browse the client portal with a fully operational demo.
--
--  Idempotent: uses ON CONFLICT DO NOTHING throughout.
-- ══════════════════════════════════════════════════════════════

-- ── 1. Create the demo company ──────────────────────────────
INSERT INTO companies (id, name, slug, sector, size_band, contact_email, active, feature_flags)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'The People System',
  'the-people-system',
  'Technology',
  '20-50',
  'hello@thepeoplesystem.com',
  true,
  '{"hiring": true, "documents": true, "reports": true, "support": true, "metrics": true, "compliance": true, "lead": true, "protect": true, "learning": true, "benchmarks": true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  feature_flags = EXCLUDED.feature_flags,
  active = true;

-- ── 2. Link all tps_admin users to this company ────────────
UPDATE profiles
SET company_id = '00000000-0000-0000-0000-000000000001',
    onboarding_completed = true
WHERE role IN ('tps_admin', 'tps_client')
  AND (company_id IS NULL OR company_id = '00000000-0000-0000-0000-000000000001');

-- ── 3. Employee Records ─────────────────────────────────────
INSERT INTO employee_records (id, company_id, full_name, email, job_title, department, employment_type, status, start_date, annual_salary, reporting_manager, gender) VALUES
  ('e0000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Sarah Mitchell',    'sarah@thepeoplesystem.com',    'CEO',                    'Leadership',   'full-time', 'active', '2020-01-10', 95000,  NULL,              'female'),
  ('e0000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'James Hartley',     'james@thepeoplesystem.com',    'CTO',                    'Engineering',  'full-time', 'active', '2020-03-01', 88000,  'Sarah Mitchell',  'male'),
  ('e0000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Priya Sharma',      'priya@thepeoplesystem.com',    'Head of Product',        'Product',      'full-time', 'active', '2021-06-14', 75000,  'Sarah Mitchell',  'female'),
  ('e0000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Tom Andrews',       'tom@thepeoplesystem.com',      'Head of Sales',          'Sales',        'full-time', 'active', '2020-01-10', 72000,  'Sarah Mitchell',  'male'),
  ('e0000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Emily Chen',        'emily@thepeoplesystem.com',    'Senior Engineer',        'Engineering',  'full-time', 'active', '2021-09-01', 65000,  'James Hartley',   'female'),
  ('e0000006-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Marcus Johnson',    'marcus@thepeoplesystem.com',   'Full Stack Developer',   'Engineering',  'full-time', 'active', '2022-01-17', 55000,  'James Hartley',   'male'),
  ('e0000007-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Aisha Patel',       'aisha@thepeoplesystem.com',    'UX Designer',            'Product',      'full-time', 'active', '2022-04-04', 52000,  'Priya Sharma',    'female'),
  ('e0000008-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Oliver Bennett',    'oliver@thepeoplesystem.com',   'Account Executive',      'Sales',        'full-time', 'active', '2022-07-11', 45000,  'Tom Andrews',     'male'),
  ('e0000009-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Chloe Williams',    'chloe@thepeoplesystem.com',    'Marketing Manager',      'Marketing',    'full-time', 'active', '2023-01-09', 48000,  'Sarah Mitchell',  'female'),
  ('e0000010-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Daniel Okonkwo',    'daniel@thepeoplesystem.com',   'Customer Success',       'Operations',   'full-time', 'active', '2023-03-20', 38000,  'Tom Andrews',     'male'),
  ('e0000011-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Lucy Foster',       'lucy@thepeoplesystem.com',     'HR Coordinator',         'People',       'part-time', 'active', '2023-06-01', 28000,  'Sarah Mitchell',  'female'),
  ('e0000012-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Ryan Cooper',       'ryan@thepeoplesystem.com',     'Junior Developer',       'Engineering',  'full-time', 'active', '2024-01-15', 32000,  'James Hartley',   'male')
ON CONFLICT (id) DO NOTHING;

-- ── 4. Requisitions (open roles) ────────────────────────────
INSERT INTO requisitions (id, company_id, title, department, seniority, salary_range, location, employment_type, description, stage, working_model, friction_level, created_at) VALUES
  ('r0000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Backend Engineer',       'Engineering', 'Mid',    '50000-65000', 'London / Hybrid', 'full-time', 'Build scalable APIs and microservices for our HR platform.', 'sourcing',     'hybrid', 'Medium',   NOW() - INTERVAL '18 days'),
  ('r0000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Product Designer',       'Product',     'Mid',    '45000-58000', 'Remote UK',       'full-time', 'Design intuitive experiences for our client portal.',        'interviewing', 'remote', 'Low',      NOW() - INTERVAL '32 days'),
  ('r0000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Sales Development Rep',  'Sales',       'Junior', '28000-35000', 'Manchester',      'full-time', 'Generate qualified leads for our SME HR services.',           'screening',    'office', 'High',     NOW() - INTERVAL '45 days'),
  ('r0000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'DevOps Engineer',        'Engineering', 'Senior', '70000-85000', 'Remote UK',       'full-time', 'Own our CI/CD, infrastructure, and platform reliability.',    'submitted',    'remote', 'Critical', NOW() - INTERVAL '7 days')
ON CONFLICT (id) DO NOTHING;

-- ── 5. Candidates ───────────────────────────────────────────
INSERT INTO candidates (id, requisition_id, company_id, full_name, email, summary, approved_for_client, client_status, created_at) VALUES
  ('c0000001-0000-0000-0000-000000000001', 'r0000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Alex Rivera',     'alex.r@email.com',    'Strong Node.js background, 4 years at fintech startup.',       true, 'pending',  NOW() - INTERVAL '10 days'),
  ('c0000002-0000-0000-0000-000000000001', 'r0000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Nina Kowalski',   'nina.k@email.com',    'Full stack experience, keen on HR tech. Ex-Monzo.',           true, 'approved', NOW() - INTERVAL '8 days'),
  ('c0000003-0000-0000-0000-000000000001', 'r0000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Sam Turner',      'sam.t@email.com',     'Figma expert, portfolio includes 3 SaaS redesigns.',          true, 'pending',  NOW() - INTERVAL '5 days'),
  ('c0000004-0000-0000-0000-000000000001', 'r0000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Jordan Lee',      'jordan.l@email.com',  '2 years SDR at HubSpot partner. High activity metrics.',      true, 'pending',  NOW() - INTERVAL '3 days'),
  ('c0000005-0000-0000-0000-000000000001', 'r0000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Rachel Adams',    'rachel.a@email.com',  'Career changer from recruitment. Highly motivated.',          true, 'rejected', NOW() - INTERVAL '12 days')
ON CONFLICT (id) DO NOTHING;

-- ── 6. Documents ────────────────────────────────────────────
INSERT INTO documents (id, company_id, name, category, file_url, file_size, version, created_at) VALUES
  ('d0000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Employee Handbook 2025',       'handbook',   'https://example.com/handbook.pdf',   2048000, 3, NOW() - INTERVAL '60 days'),
  ('d0000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Remote Working Policy',        'policy',     'https://example.com/remote.pdf',     512000,  2, NOW() - INTERVAL '30 days'),
  ('d0000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Equal Opportunities Policy',   'policy',     'https://example.com/equality.pdf',   384000,  1, NOW() - INTERVAL '90 days'),
  ('d0000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Q1 2025 Board Report',         'report',     'https://example.com/q1-report.pdf',  1024000, 1, NOW() - INTERVAL '15 days'),
  ('d0000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Employment Contract Template', 'contract',   'https://example.com/contract.pdf',   256000,  4, NOW() - INTERVAL '120 days')
ON CONFLICT (id) DO NOTHING;

-- ── 7. Compliance Items ─────────────────────────────────────
INSERT INTO compliance_items (id, company_id, title, category, status, due_date, notes, created_at) VALUES
  ('ci000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Health & Safety Risk Assessment',    'health_safety',  'complete',  '2025-03-01', 'Annual review completed by external assessor.',              NOW() - INTERVAL '90 days'),
  ('ci000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'GDPR Data Audit',                   'data_protection','pending',   '2025-06-30', 'Annual data mapping and retention review.',                  NOW() - INTERVAL '30 days'),
  ('ci000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Fire Safety Certificate Renewal',    'health_safety',  'overdue',   '2025-03-15', 'Certificate expired — renewal booked for next week.',        NOW() - INTERVAL '120 days'),
  ('ci000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Right to Work Checks — Q2 Starters', 'employment',     'pending',   '2025-07-01', 'Check documentation for 3 new hires starting in Q2.',       NOW() - INTERVAL '14 days'),
  ('ci000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Employer Liability Insurance',       'insurance',      'complete',  '2026-01-15', 'Renewed with Hiscox. Policy ref: HL-2025-4421.',             NOW() - INTERVAL '180 days')
ON CONFLICT (id) DO NOTHING;

-- ── 8. Actions ──────────────────────────────────────────────
INSERT INTO actions (id, company_id, action_type, title, priority, status, created_at) VALUES
  ('a0000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'compliance',  'Complete GDPR data mapping exercise',            'high',    'active',    NOW() - INTERVAL '7 days'),
  ('a0000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'hiring',      'Review and approve Backend Engineer candidates', 'urgent',  'active',    NOW() - INTERVAL '3 days'),
  ('a0000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'policy',      'Update remote working policy for 2025',          'normal',  'active',    NOW() - INTERVAL '14 days'),
  ('a0000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'onboarding',  'Prepare onboarding pack for Q2 starters',        'normal',  'completed', NOW() - INTERVAL '21 days')
ON CONFLICT (id) DO NOTHING;

-- ── 9. Tickets ──────────────────────────────────────────────
INSERT INTO tickets (id, company_id, subject, description, status, priority, created_at) VALUES
  ('t0000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Need advice on flexible working request',  'Employee has requested compressed hours. Need guidance on how to assess and respond fairly.', 'open',        'normal', NOW() - INTERVAL '2 days'),
  ('t0000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Maternity leave policy clarification',     'Team member expecting in August. Want to confirm enhanced maternity pay entitlement.',         'in_progress', 'high',   NOW() - INTERVAL '5 days'),
  ('t0000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Exit interview template',                  'Can you provide a standard exit interview template we can use?',                               'resolved',    'low',    NOW() - INTERVAL '20 days')
ON CONFLICT (id) DO NOTHING;

-- ── 10. Service Requests ────────────────────────────────────
INSERT INTO service_requests (id, company_id, request_type, subject, details, urgency, status, created_at) VALUES
  ('sr000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'salary_benchmark', 'Salary Benchmark: Senior Engineer',     '{"role_title": "Senior Engineer", "location": "London", "seniority": "Senior"}'::jsonb, 'Normal', 'new',       NOW() - INTERVAL '4 days'),
  ('sr000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'policy_update',    'Policy Update: Hybrid Working Policy', '{"policy_name": "Hybrid Working Policy", "change_needed": "Update to reflect 3-day office requirement"}'::jsonb, 'High', 'in_progress', NOW() - INTERVAL '10 days')
ON CONFLICT (id) DO NOTHING;

-- ── 11. Milestones (Roadmap) ────────────────────────────────
INSERT INTO milestones (id, company_id, pillar, title, status, quarter, due_date, created_at) VALUES
  ('m0000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'hiring',     'Launch employer brand on LinkedIn',        'complete',    'Q1 2025', '2025-03-31', NOW() - INTERVAL '90 days'),
  ('m0000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'compliance', 'Complete annual GDPR audit',               'in_progress', 'Q2 2025', '2025-06-30', NOW() - INTERVAL '30 days'),
  ('m0000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'culture',    'Roll out quarterly engagement surveys',    'not_started', 'Q3 2025', '2025-09-30', NOW() - INTERVAL '10 days'),
  ('m0000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'hiring',     'Implement structured interview framework', 'in_progress', 'Q2 2025', '2025-06-30', NOW() - INTERVAL '45 days')
ON CONFLICT (id) DO NOTHING;
