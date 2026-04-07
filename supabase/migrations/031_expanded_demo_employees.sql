-- ======================================================================
--  Migration 031: Expand demo data — 27 employees, org chart, onboarding
--
--  Adds 15 more employees (total 27), onboarding template with tasks,
--  and org chart structure via line_manager relationships.
--  Company: The People System (00000000-0000-0000-0000-000000000001)
-- ======================================================================

-- == 1. ADDITIONAL EMPLOYEES (15 more, total 27) ==========================
INSERT INTO employee_records (id, company_id, full_name, email, job_title, department, employment_type, status, start_date, salary, salary_currency, gender, line_manager, annual_leave_allowance, sick_day_allowance, leave_year_type) VALUES
  -- Engineering (under James Hartley → CTO)
  ('e0000013-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Sophie Turner',     'sophie@thepeoplesystem.com',    'QA Engineer',              'Engineering',  'full_time',  'active', '2023-09-04', 42000, 'GBP', 'Female', 'James Hartley',   25, 10, 'fixed'),
  ('e0000014-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Liam O''Brien',     'liam@thepeoplesystem.com',     'DevOps Engineer',          'Engineering',  'full_time',  'active', '2023-11-13', 58000, 'GBP', 'Male',   'James Hartley',   25, 10, 'fixed'),
  ('e0000015-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Zara Khan',         'zara@thepeoplesystem.com',     'Frontend Developer',       'Engineering',  'full_time',  'active', '2024-02-05', 48000, 'GBP', 'Female', 'Emily Chen',      25, 10, 'fixed'),
  ('e0000016-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Ben Whitaker',      'ben@thepeoplesystem.com',      'Engineering Intern',       'Engineering',  'full_time',  'active', '2025-06-01', 24000, 'GBP', 'Male',   'Emily Chen',      25, 10, 'fixed'),

  -- Product (under Priya Sharma → Head of Product)
  ('e0000017-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Natasha Ivanova',   'natasha@thepeoplesystem.com',  'Product Manager',          'Product',      'full_time',  'active', '2023-04-17', 55000, 'GBP', 'Female', 'Priya Sharma',    25, 10, 'fixed'),
  ('e0000018-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Jack Morrison',     'jack@thepeoplesystem.com',     'UI Designer',              'Product',      'full_time',  'active', '2024-03-11', 44000, 'GBP', 'Male',   'Aisha Patel',     25, 10, 'fixed'),

  -- Sales (under Tom Andrews → Head of Sales)
  ('e0000019-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Grace Taylor',      'grace@thepeoplesystem.com',    'Business Development Rep', 'Sales',        'full_time',  'active', '2023-08-21', 35000, 'GBP', 'Female', 'Tom Andrews',     25, 10, 'fixed'),
  ('e0000020-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Ravi Mehta',        'ravi@thepeoplesystem.com',     'Account Manager',          'Sales',        'full_time',  'active', '2024-01-08', 42000, 'GBP', 'Male',   'Oliver Bennett',  25, 10, 'fixed'),
  ('e0000021-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Isla Campbell',     'isla@thepeoplesystem.com',     'Sales Coordinator',        'Sales',        'part_time',  'active', '2024-06-03', 26000, 'GBP', 'Female', 'Tom Andrews',     25, 10, 'fixed'),

  -- Marketing (under Chloe Williams → Marketing Manager)
  ('e0000022-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Ethan Clarke',      'ethan@thepeoplesystem.com',    'Content Writer',           'Marketing',    'full_time',  'active', '2024-04-22', 32000, 'GBP', 'Male',   'Chloe Williams',  25, 10, 'fixed'),
  ('e0000023-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Maya Rodriguez',    'maya@thepeoplesystem.com',     'Digital Marketing Exec',   'Marketing',    'full_time',  'active', '2024-07-15', 34000, 'GBP', 'Female', 'Chloe Williams',  25, 10, 'fixed'),

  -- Operations (under Daniel Okonkwo → Customer Success)
  ('e0000024-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Finn Jackson',      'finn@thepeoplesystem.com',     'Support Specialist',       'Operations',   'full_time',  'active', '2024-05-13', 30000, 'GBP', 'Male',   'Daniel Okonkwo',  25, 10, 'fixed'),
  ('e0000025-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Hannah Lee',        'hannah@thepeoplesystem.com',   'Operations Assistant',     'Operations',   'part_time',  'active', '2025-01-06', 25000, 'GBP', 'Female', 'Daniel Okonkwo',  25, 10, 'fixed'),

  -- People / Finance
  ('e0000026-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Adam Wright',       'adam@thepeoplesystem.com',     'Finance Manager',          'Finance',      'full_time',  'active', '2022-10-03', 55000, 'GBP', 'Male',   'Sarah Mitchell',  25, 10, 'fixed'),
  ('e0000027-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Rebecca Stone',     'rebecca@thepeoplesystem.com',  'Payroll Administrator',    'Finance',      'part_time',  'active', '2024-09-02', 28000, 'GBP', 'Female', 'Adam Wright',     25, 10, 'fixed')
ON CONFLICT (id) DO NOTHING;


-- == 2. ONBOARDING TEMPLATE (Standard New Starter) ========================
INSERT INTO onboarding_templates (id, company_id, name, description, is_default)
VALUES (
  'ot000001-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Standard New Starter',
  'Default onboarding checklist for all new employees joining The People System. Covers IT setup, compliance, introductions, and first-week orientation.',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Onboarding tasks (18 tasks across 5 categories)
INSERT INTO onboarding_template_tasks (id, template_id, title, description, category, due_day_offset, assigned_to, sort_order) VALUES
  -- Pre-start (before day 1)
  ('ott00001-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', 'Send welcome email',                   'Send welcome pack with start date, dress code, parking info, and first-day agenda', 'general',    -5, 'HR Coordinator',     1),
  ('ott00002-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', 'Prepare workstation',                  'Set up desk, chair, monitor, peripherals. Order any special equipment needed',      'it_setup',   -3, 'IT / Office Manager', 2),
  ('ott00003-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', 'Create email & system accounts',       'Google Workspace, Slack, GitHub, Jira, Notion — based on department',               'it_setup',   -2, 'IT / Office Manager', 3),
  ('ott00004-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', 'Add to payroll system',                'Set up in payroll with salary, bank details, tax code',                             'documents',  -2, 'Finance Manager',     4),

  -- Day 1
  ('ott00005-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', 'Office tour & introductions',          'Show key areas: kitchen, meeting rooms, fire exits. Introduce to immediate team',   'intro',       0, 'Line Manager',        5),
  ('ott00006-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', 'Issue laptop & access badge',          'Hand over company laptop, set up fingerprint/password, issue access badge',         'it_setup',    0, 'IT / Office Manager', 6),
  ('ott00007-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', 'Sign employment contract',             'Review and sign contract, NDA, and IP assignment',                                  'documents',   0, 'HR Coordinator',      7),
  ('ott00008-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', 'Health & safety briefing',             'Fire evacuation procedures, first aiders, incident reporting',                      'training',    0, 'HR Coordinator',      8),

  -- Week 1
  ('ott00009-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', 'Complete right-to-work check',         'Verify passport/visa and file copies. Must be done within 3 days of start',         'documents',   1, 'HR Coordinator',      9),
  ('ott00010-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', 'Company policies walkthrough',         'Review employee handbook: leave, expenses, code of conduct, remote work policy',    'training',    2, 'HR Coordinator',     10),
  ('ott00011-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', 'Meet with CEO / leadership',           'Informal 20-min chat with Sarah to learn about company vision and values',          'intro',       3, 'CEO',                11),
  ('ott00012-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', 'Data protection & GDPR training',      'Complete online GDPR awareness module and sign data handling agreement',             'training',    3, 'HR Coordinator',     12),
  ('ott00013-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', 'Set up benefits & pension',            'Enrol in pension scheme, choose benefits options if applicable',                     'documents',   5, 'Finance Manager',    13),

  -- Month 1
  ('ott00014-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', '1-to-1 check-in with line manager',    'First formal 1-to-1: how are things going? Any blockers or questions?',             'general',    14, 'Line Manager',       14),
  ('ott00015-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', 'Complete role-specific training',       'Department-specific tools and processes training (managed by line manager)',          'training',   21, 'Line Manager',       15),
  ('ott00016-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', 'Set 90-day objectives',                'Agree SMART objectives for probation period with line manager',                      'general',    21, 'Line Manager',       16),

  -- Month 3
  ('ott00017-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', 'Probation mid-point review',           'Formal probation review: progress against objectives, feedback, any concerns',       'general',    45, 'Line Manager',       17),
  ('ott00018-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', 'Probation sign-off',                   'Final probation review and confirmation of permanent employment',                    'general',    90, 'HR Coordinator',     18)
ON CONFLICT (id) DO NOTHING;


-- == 3. ONBOARDING INSTANCE (for newest employees) ========================
-- Give the 3 most recent joiners active onboarding instances
INSERT INTO onboarding_instances (id, company_id, employee_id, template_id, status) VALUES
  ('oi000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'e0000016-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', 'in_progress'),
  ('oi000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'e0000025-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', 'in_progress'),
  ('oi000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'e0000027-0000-0000-0000-000000000001', 'ot000001-0000-0000-0000-000000000001', 'in_progress')
ON CONFLICT (id) DO NOTHING;

-- Create task progress for Ben Whitaker's onboarding (partially complete)
INSERT INTO onboarding_task_progress (id, instance_id, task_title, task_description, category, status, sort_order) VALUES
  ('otp00001-0000-0000-0000-000000000001', 'oi000001-0000-0000-0000-000000000001', 'Send welcome email',              'Send welcome pack with start date details',          'general',   'completed',    1),
  ('otp00002-0000-0000-0000-000000000001', 'oi000001-0000-0000-0000-000000000001', 'Prepare workstation',             'Set up desk, chair, monitor',                        'it_setup',  'completed',    2),
  ('otp00003-0000-0000-0000-000000000001', 'oi000001-0000-0000-0000-000000000001', 'Create email & system accounts',  'Google Workspace, Slack, GitHub',                    'it_setup',  'completed',    3),
  ('otp00004-0000-0000-0000-000000000001', 'oi000001-0000-0000-0000-000000000001', 'Add to payroll system',           'Set up in payroll',                                  'documents', 'completed',    4),
  ('otp00005-0000-0000-0000-000000000001', 'oi000001-0000-0000-0000-000000000001', 'Office tour & introductions',     'Show key areas, introduce to team',                  'intro',     'completed',    5),
  ('otp00006-0000-0000-0000-000000000001', 'oi000001-0000-0000-0000-000000000001', 'Issue laptop & access badge',     'Hand over company laptop',                           'it_setup',  'completed',    6),
  ('otp00007-0000-0000-0000-000000000001', 'oi000001-0000-0000-0000-000000000001', 'Sign employment contract',        'Review and sign contract, NDA',                      'documents', 'completed',    7),
  ('otp00008-0000-0000-0000-000000000001', 'oi000001-0000-0000-0000-000000000001', 'Health & safety briefing',        'Fire evacuation, first aiders',                      'training',  'in_progress',  8),
  ('otp00009-0000-0000-0000-000000000001', 'oi000001-0000-0000-0000-000000000001', 'Complete right-to-work check',    'Verify passport/visa',                               'documents', 'pending',      9),
  ('otp00010-0000-0000-0000-000000000001', 'oi000001-0000-0000-0000-000000000001', 'Company policies walkthrough',    'Review employee handbook',                           'training',  'pending',     10),
  ('otp00011-0000-0000-0000-000000000001', 'oi000001-0000-0000-0000-000000000001', 'Meet with CEO / leadership',      'Informal chat with Sarah',                           'intro',     'pending',     11),
  ('otp00012-0000-0000-0000-000000000001', 'oi000001-0000-0000-0000-000000000001', 'Data protection & GDPR training', 'Complete GDPR module',                               'training',  'pending',     12)
ON CONFLICT (id) DO NOTHING;
