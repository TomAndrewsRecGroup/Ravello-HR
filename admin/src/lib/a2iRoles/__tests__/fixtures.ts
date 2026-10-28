// Two real live jobs, read from Manatal Open API v3 /jobs/ on
// 2026-10-28. Fields are verbatim; the descriptions are cut after the
// opening paragraphs (the parts the email summary reads).

export const JOB_AUTOMATION_ENGINEER = {
  id: 4467043,
  external_id: null,
  organization: 4247425,
  position_name: 'Automation Engineer',
  description: '<p><strong>Automation Engineer</strong></p>\n<p><strong>Macclesfield</strong><br/><strong>Excellent Salary + Bonus + Benefits</strong><br/><strong>Permanent | 37.5 hours per week</strong></p>\n<p></p>\n<p>Are you an Automation Engineer, Controls Engineer or EC&amp;I Engineer with strong PLC and industrial control systems experience?</p>\n<p></p>\n<p>We’re recruiting for an Automation Engineer to join a large-scale heavy process manufacturing site near Macclesfield.</p>\n<p></p>\n<p>This is a hands-on technical role responsible for the reliability, integrity and continuous improvement of plant automation and control systems.</p>',
  headcount: 1,
  salary_min: '40000.00',
  salary_max: '45000.00',
  currency: 'GBP',
  address: '',
  contract_details: 'full_time',
  is_published: true,
  is_remote: false,
  status: 'active',
  created_at: '2026-10-06T14:17:55.243230Z',
  career_page_url: 'https://www.careers-page.com/andrews-recruitment-group/job/5W858WW3',
  industry: { id: 7696959, name: 'Building Materials' },
  frequency: 'year',
  city: 'Macclesfield',
  state: '',
  country: 'United Kingdom',
  open_at: '2026-10-06T14:17:55.225453Z',
  close_at: null,
  is_salary_visible: false,
};

export const JOB_AI_ENGINEERS = {
  id: 4337074,
  external_id: '7ae62d7d-491f-49e5-a250-b1816b6c9b03',
  organization: 8136723,
  position_name: 'AI & Software Engineers – Remote Opportunities',
  description: '<p>AI &amp; Software Engineers – Remote Opportunities</p><p>Full-Time &amp; Flexible Contract Options | Remote</p><p>$60 - $120 per hour</p><p>We are recruiting for multiple opportunities with a fast-growing AI technology business working on advanced AI systems and software engineering projects.</p><p>There are currently two routes available:</p><p>AI/ML Engineer – Full-Time</p>',
  headcount: 100,
  salary_min: '60.00',
  salary_max: '120.00',
  currency: 'USD',
  address: 'London, UK',
  contract_details: 'contractor',
  is_published: true,
  is_remote: true,
  status: 'active',
  created_at: '2026-09-01T10:21:04.872486Z',
  industry: { id: 7673654, name: 'Engineering - Others' },
  frequency: 'hour',
  city: 'London',
  state: '',
  country: 'United Kingdom',
  open_at: '2026-09-01T10:21:04.848245Z',
  close_at: null,
  is_salary_visible: false,
};

/** Thursday 29 Oct 2026, 15:05 UTC = 15:05 GMT (the clocks went back on the 25th). */
export const THURSDAY_3PM = new Date('2026-10-29T15:05:00Z');
