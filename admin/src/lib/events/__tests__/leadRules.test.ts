import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, eventRow, type FakeDb } from './fakeSupabase';

// LEAD / HR consequences, driven through the real consumer with the
// real leadRules against the stateful fake:
//   a leave request → the client's editors in-app, the employee a receipt;
//   a decision → the employee an email, a refusal carrying the reason;
//   a hire → ONE employee record (idempotent by candidate), the role filled;
//   a new employee → onboarding from the default template, dated offsets;
//   onboarding complete / probation due → ONE probation review;
//   an employee leaving → pending leave after the date and open
//   acknowledgements closed;
//   documents → staff / the client told.

const sent: { to: string; subject: string; html: string }[] = [];
vi.mock('@/lib/email', async () => {
  const n = await import('@/lib/email/templates/notification');
  const sr = await import('@/lib/email/templates/serviceRequestReceived');
  const h = await import('@/lib/email/templates/hsCheckFailed');
  const l = await import('@/lib/email/templates/leave');
  return {
    ...n, ...sr, ...h, ...l,
    sendEmail: async (m: { to: string; subject: string; html: string }) => { sent.push(m); return { id: 'r', delivered: true }; },
    lastEmailError: () => null,
  };
});
vi.mock('@/lib/jev/transport', async () => {
  const real = await vi.importActual<typeof import('@/lib/jev/transport')>('@/lib/jev/transport');
  return { ...real, sendToJev: async () => ({ status: 200, payload: null, error: null, durationMs: 1 }) };
});

const { processEvents } = await import('../process');
const { RULES } = await import('../rules');

let db: FakeDb;
let nextEventId = 100;
beforeEach(() => {
  sent.length = 0;
  delete process.env.JEV_API_KEY;
  db = fakeSupabase({
    profiles: [
      { id: 'staff-1', email: 'tom@example.com', role: 'tps_admin' },
      { id: 'demo', email: 'demo@example.com', role: 'tps_client' },
      { id: 'ca', email: 'ca@client.com', role: 'client_admin', company_id: 'co-1' },
      { id: 'ce', email: 'ce@client.com', role: 'client_editor', company_id: 'co-1' },
      { id: 'cu', email: 'cu@client.com', role: 'client_user', company_id: 'co-1' },
    ],
    companies: [{ id: 'co-1', name: 'Sample Co', account_owner_id: null, feature_flags: {} }],
    notification_preferences: [{ user_id: 'staff-1', email_mode: 'immediate', muted_types: [], weekly_summary: true }],
    employee_records: [{ id: 'emp-1', company_id: 'co-1', full_name: 'Ada Lovelace', email: 'ada@x.com', department: 'Eng', job_title: 'Engineer', start_date: '2026-10-05', probation_end: '2027-01-05', status: 'active', source_candidate_id: null }],
    absence_records: [{ id: 'abs-1', company_id: 'co-1', employee_id: 'emp-1', employee_name: 'Ada Lovelace', employee_email: 'ada@x.com', absence_type: 'holiday', start_date: '2026-10-10', end_date: '2026-10-12', days: 3, status: 'pending' }],
    employee_notes: [], candidates: [], offers: [], requisitions: [],
    onboarding_templates: [], onboarding_instances: [], onboarding_task_progress: [],
    performance_reviews: [], policy_acknowledgements: [],
    platform_events: [], notifications: [], email_log: [], actions: [], jev_decisions: [],
  });
});
afterEach(() => { delete process.env.JEV_API_KEY; });

function push(over: Parameters<typeof eventRow>[0]) {
  db.tables.platform_events.push(eventRow({ id: nextEventId++, ...over }));
}
const run = () => processEvents(db.client, { rules: RULES });
const notes = (type: string) => db.tables.notifications.filter(n => n.type === type);

describe('leave', () => {
  const requested = () => push({ entity_type: 'absence_records', event_type: 'created', entity_id: 'abs-1', actor_kind: 'system',
    payload: { new: { status: 'pending', employee_id: 'emp-1', employee_name: 'Ada Lovelace', absence_type: 'holiday', start_date: '2026-10-10', end_date: '2026-10-12', days: 3 }, old: {}, changed: [] } });

  it('a request tells the editors and admins in-app (not staff, not viewers) and emails the employee a receipt, once', async () => {
    requested();
    const t = await run();
    expect(t.failed).toBe(0);
    expect(notes('leave_requested').map(n => n.user_id).sort()).toEqual(['ca', 'ce']);
    expect(notes('leave_requested')[0]).toMatchObject({ link: '/lead/absence', title: 'Ada Lovelace requested annual leave: 2026-10-10 to 2026-10-12', body: '3 days · awaiting your decision' });
    // urgent: the manager's in-app note is emailed at once too (clients default immediate)
    expect(sent.map(s => s.to).sort()).toEqual(['ada@x.com', 'ca@client.com', 'ce@client.com']);
    const receipt = sent.find(s => s.to === 'ada@x.com')!;
    expect(receipt.subject).toBe('Leave request received: 2026-10-10');
    expect(receipt.html).toContain('Sample Co');
    const log = db.tables.email_log.find(r => r.target_type === 'employee')!;
    expect(log).toMatchObject({ target_id: 'emp-1', error_message: null });

    // the same event claimed again produces nothing new
    db.tables.platform_events[0].processed_at = null; db.tables.platform_events[0].claimed_at = null;
    await run();
    expect(sent).toHaveLength(3);
    expect(notes('leave_requested')).toHaveLength(2);
  });

  it('a non-pending insert (a back-filled approved absence) tells nobody', async () => {
    push({ entity_type: 'absence_records', event_type: 'created', entity_id: 'abs-1', payload: { new: { status: 'approved', employee_name: 'Ada' }, old: {}, changed: [] } });
    await run();
    expect(db.tables.notifications).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  const decided = (status: string) => push({ entity_type: 'absence_records', event_type: 'updated', entity_id: 'abs-1', actor_kind: 'client',
    payload: { new: { status }, old: { status: 'pending' }, changed: ['status'] } });

  it('a refusal emails the employee WITH the manager\'s reason from employee_notes', async () => {
    db.tables.employee_notes.push({ id: 'n1', note_type: 'leave_denied', related_id: 'abs-1', body: 'Team is at capacity that week', created_at: '2026-09-25T10:00:00Z' });
    db.tables.employee_notes.push({ id: 'n0', note_type: 'leave_denied', related_id: 'abs-1', body: 'older reason', created_at: '2026-09-24T10:00:00Z' });
    db.tables.absence_records[0].status = 'rejected';
    decided('rejected');
    await run();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'ada@x.com', subject: 'Leave declined: 2026-10-10' });
    expect(sent[0].html).toContain('Team is at capacity that week');
    expect(sent[0].html).not.toContain('older reason');
  });

  it('an approval emails the employee without a reason block', async () => {
    db.tables.employee_notes.push({ id: 'n1', note_type: 'leave_denied', related_id: 'abs-1', body: 'should not appear', created_at: '2026-09-25T10:00:00Z' });
    db.tables.absence_records[0].status = 'approved';
    decided('approved');
    await run();
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('Leave approved: 2026-10-10');
    expect(sent[0].html).not.toContain('should not appear');
    expect(sent[0].html).not.toContain('Reason given');
  });

  it('a status change to cancelled, or a change to another column, emails nobody', async () => {
    decided('cancelled');
    push({ entity_type: 'absence_records', event_type: 'updated', entity_id: 'abs-1', payload: { new: { status: 'approved', days: 4 }, old: { days: 3 }, changed: ['days'] } });
    await run();
    expect(sent).toHaveLength(0);
  });
});

describe('hired → employee', () => {
  beforeEach(() => {
    db.tables.candidates.push({ id: 'cand-1', company_id: 'co-1', full_name: 'Grace Hopper', email: 'grace@x.com', requisition_id: 'req-1', client_status: 'hired' });
    db.tables.requisitions.push({ id: 'req-1', company_id: 'co-1', title: 'Compiler Engineer', department: 'R&D', stage: 'offer' });
    db.tables.offers.push({ id: 'off-1', candidate_id: 'cand-1', requisition_id: 'req-1', start_date: '2026-11-02', base_salary: 5_200_000, contract_type: 'permanent', status: 'written_accepted', created_at: '2026-09-20T00:00:00Z' });
  });
  const hired = () => push({ entity_type: 'candidates', event_type: 'updated', entity_id: 'cand-1', actor_kind: 'client',
    payload: { new: { client_status: 'hired', full_name: 'Grace Hopper', requisition_id: 'req-1' }, old: { client_status: 'approved' }, changed: ['client_status'] } });
  const accepted = () => push({ entity_type: 'offers', event_type: 'updated', entity_id: 'off-1',
    payload: { new: { status: 'written_accepted', candidate_id: 'cand-1', requisition_id: 'req-1' }, old: { status: 'sent' }, changed: ['status'] } });

  it('creates ONE employee from the offer and the role, fills the requisition, and a second hire event creates nothing', async () => {
    hired();
    const t = await run();
    expect(t.failed).toBe(0);
    expect(db.tables.employee_records).toHaveLength(2);
    const emp = db.tables.employee_records[1];
    expect(emp).toMatchObject({ company_id: 'co-1', full_name: 'Grace Hopper', email: 'grace@x.com', job_title: 'Compiler Engineer', department: 'R&D', start_date: '2026-11-02', employment_type: 'full_time', salary: 52000, status: 'active', source_candidate_id: 'cand-1' });
    expect(db.tables.requisitions[0].stage).toBe('filled');

    hired(); accepted();
    await run();
    expect(db.tables.employee_records).toHaveLength(2);
  });

  it('the accepted offer alone is enough, and a Mark-as-Hired row stamped with the candidate stops the consumer creating a second', async () => {
    db.tables.employee_records.push({ id: 'emp-2', company_id: 'co-1', full_name: 'Grace Hopper', start_date: '2026-11-02', status: 'active', source_candidate_id: 'cand-1' });
    accepted();
    await run();
    expect(db.tables.employee_records).toHaveLength(2);
    expect(db.tables.requisitions[0].stage).toBe('offer');   // nothing ran; the portal form owns that record
  });

  it('a candidate with no offer starts today with the role title', async () => {
    db.tables.offers.length = 0;
    hired();
    await run();
    expect(db.tables.employee_records[1]).toMatchObject({ job_title: 'Compiler Engineer', salary: null, employment_type: 'full_time', start_date: new Date().toISOString().slice(0, 10) });
  });
});

describe('a new employee', () => {
  const created = (over: Record<string, unknown> = {}) => push({ entity_type: 'employee_records', event_type: 'created', entity_id: 'emp-1', actor_kind: 'client',
    payload: { new: { status: 'active', full_name: 'Ada Lovelace', start_date: '2026-10-05', job_title: 'Engineer', source_candidate_id: null, ...over }, old: {}, changed: [] } });

  it('starts onboarding from the DEFAULT template with due dates from offsets and the template\'s assignee, once', async () => {
    db.tables.onboarding_templates.push(
      { id: 't-old', company_id: 'co-1', is_default: false, created_at: '2026-01-01', onboarding_template_tasks: [{ title: 'Wrong template', due_day_offset: 0, sort_order: 0 }] },
      { id: 't-def', company_id: 'co-1', is_default: true, created_at: '2026-02-01', onboarding_template_tasks: [
        { title: 'Order laptop', category: 'it_access', due_day_offset: -2, assigned_to: ' IT desk ', sort_order: 2 },
        { title: 'Welcome meeting', category: 'general', due_day_offset: 0, assigned_to: '', sort_order: 1 },
        { title: 'Probation objectives', category: 'hr', due_day_offset: 14, sort_order: 3 },
      ] },
      { id: 't-other', company_id: 'co-2', is_default: true, created_at: '2026-01-01', onboarding_template_tasks: [{ title: 'Another client', due_day_offset: 0, sort_order: 0 }] },
    );
    created();
    const t = await run();
    expect(t.failed).toBe(0);
    expect(db.tables.onboarding_instances).toHaveLength(1);
    expect(db.tables.onboarding_instances[0]).toMatchObject({ company_id: 'co-1', employee_id: 'emp-1', template_id: 't-def', status: 'in_progress' });
    const tasks = db.tables.onboarding_task_progress;
    expect(tasks.map(r => [r.task_title, r.due_date, r.assigned_to, r.sort_order, r.status])).toEqual([
      ['Welcome meeting',      '2026-10-05', null,      0, 'pending'],
      ['Order laptop',         '2026-10-03', 'IT desk', 1, 'pending'],
      ['Probation objectives', '2026-10-19', null,      2, 'pending'],
    ]);
    expect(notes('onboarding_started').map(n => n.user_id)).toEqual(['ca']);
    expect(notes('onboarding_started')[0]).toMatchObject({ title: 'Onboarding started for Ada Lovelace', body: '3 tasks from your default template, due from 2026-10-05.', link: '/lead/onboarding' });
    expect(notes('role_filled')).toHaveLength(0);   // not from a candidate

    created();
    await run();
    expect(db.tables.onboarding_instances).toHaveLength(1);
    expect(tasks).toHaveLength(3);
  });

  it('with no default template starts nothing and says nothing; a candidate-sourced record still tells staff the role is filled', async () => {
    created({ source_candidate_id: 'cand-1' });
    await run();
    expect(db.tables.onboarding_instances).toHaveLength(0);
    expect(notes('onboarding_started')).toHaveLength(0);
    expect(notes('role_filled').map(n => n.user_id)).toEqual(['staff-1']);
    expect(notes('role_filled')[0]).toMatchObject({ title: 'Ada Lovelace is now an employee: Engineer', link: '/clients/co-1' });
  });
});

describe('probation review', () => {
  const onboardingDone = () => push({ entity_type: 'onboarding_instances', event_type: 'updated', entity_id: 'inst-1', actor_kind: 'client',
    payload: { new: { status: 'completed', employee_id: 'emp-1' }, old: { status: 'in_progress' }, changed: ['status'] } });
  const probationSoon = () => push({ entity_type: 'employee_records', event_type: 'reminder', entity_id: 'emp-1',
    payload: { bucket: 'due_30', due_date: '2027-01-05', row: { full_name: 'Ada Lovelace', probation_end: '2027-01-05' } } });

  it('is created ONCE, a week before probation ends, from either trigger', async () => {
    onboardingDone();
    const t = await run();
    expect(t.failed).toBe(0);
    expect(db.tables.performance_reviews).toHaveLength(1);
    expect(db.tables.performance_reviews[0]).toMatchObject({ company_id: 'co-1', employee_id: 'emp-1', employee_name: 'Ada Lovelace', review_type: 'probation', status: 'pending', due_date: '2026-12-29', source_ref: 'probation:emp-1' });
    expect(notes('probation_review_scheduled').map(n => n.user_id)).toEqual(['ca']);
    expect(notes('probation_review_scheduled')[0]).toMatchObject({ title: 'Probation review scheduled for Ada Lovelace', link: '/lead/reviews' });

    probationSoon(); onboardingDone();
    await run();
    expect(db.tables.performance_reviews).toHaveLength(1);
    expect(notes('probation_review_scheduled')).toHaveLength(1);
  });

  it('is not created for an employee with no probation end, or who has left', async () => {
    db.tables.employee_records[0].probation_end = null;
    probationSoon();
    await run();
    expect(db.tables.performance_reviews).toHaveLength(0);
    db.tables.employee_records[0].probation_end = '2027-01-05';
    db.tables.employee_records[0].status = 'terminated';
    onboardingDone();
    await run();
    expect(db.tables.performance_reviews).toHaveLength(0);
  });
});

describe('leaving', () => {
  it('offboarding started tells the admins and staff', async () => {
    push({ entity_type: 'offboarding_instances', event_type: 'created', entity_id: 'off-1', actor_kind: 'client',
      payload: { new: { employee_id: 'emp-1', last_working_day: '2026-10-15', reason: 'end_of_contract', status: 'in_progress' }, old: {}, changed: [] } });
    await run();
    expect(notes('offboarding_started').map(n => n.user_id).sort()).toEqual(['ca', 'staff-1']);
    const n = notes('offboarding_started').find(n => n.user_id === 'ca')!;
    expect(n).toMatchObject({ title: 'Offboarding started for Ada Lovelace', body: 'Last working day 2026-10-15 · end of contract', link: '/lead/offboarding' });
    expect(notes('offboarding_started').find(n => n.user_id === 'staff-1')!.link).toBe('/clients/co-1');
  });

  it('terminated cancels pending leave AFTER the end date and open acknowledgements, and tells the admins what it closed', async () => {
    db.tables.absence_records.push(
      { id: 'abs-2', employee_id: 'emp-1', status: 'pending',  start_date: '2026-10-20' },   // after: cancelled
      { id: 'abs-3', employee_id: 'emp-1', status: 'approved', start_date: '2026-10-20' },   // approved: untouched
      { id: 'abs-4', employee_id: 'emp-9', status: 'pending',  start_date: '2026-10-20' },   // someone else
    );
    // abs-1 (pending, 2026-10-10) is BEFORE the end date: stays pending
    db.tables.policy_acknowledgements.push(
      { id: 'p1', employee_id: 'emp-1', status: 'pending' },
      { id: 'p2', employee_id: 'emp-1', status: 'overdue' },
      { id: 'p3', employee_id: 'emp-1', status: 'acknowledged' },
      { id: 'p4', employee_id: 'emp-9', status: 'pending' },
    );
    push({ entity_type: 'employee_records', event_type: 'updated', entity_id: 'emp-1', actor_kind: 'system',
      payload: { new: { status: 'terminated', end_date: '2026-10-15', full_name: 'Ada Lovelace' }, old: { status: 'active' }, changed: ['status'] } });
    const t = await run();
    expect(t.failed).toBe(0);
    const st = (id: string) => db.tables.absence_records.find(r => r.id === id)!.status;
    expect([st('abs-1'), st('abs-2'), st('abs-3'), st('abs-4')]).toEqual(['pending', 'cancelled', 'approved', 'pending']);
    const ps = (id: string) => db.tables.policy_acknowledgements.find(r => r.id === id)!.status;
    expect([ps('p1'), ps('p2'), ps('p3'), ps('p4')]).toEqual(['cancelled', 'cancelled', 'acknowledged', 'pending']);
    expect(notes('employee_left').map(n => n.user_id)).toEqual(['ca']);
    expect(notes('employee_left')[0]).toMatchObject({ title: 'Ada Lovelace has left', body: '1 pending leave request cancelled · 2 policy acknowledgements closed', link: '/lead/employee-records' });
  });

  it('a status change that is not to terminated closes nothing', async () => {
    db.tables.policy_acknowledgements.push({ id: 'p1', employee_id: 'emp-1', status: 'pending' });
    push({ entity_type: 'employee_records', event_type: 'updated', entity_id: 'emp-1',
      payload: { new: { status: 'on_leave' }, old: { status: 'active' }, changed: ['status'] } });
    await run();
    expect(db.tables.policy_acknowledgements[0].status).toBe('pending');
    expect(notes('employee_left')).toHaveLength(0);
  });
});

describe('documents', () => {
  it('a client upload tells staff; a staff upload tells the client admins; an approval tells the client admins', async () => {
    push({ entity_type: 'documents', event_type: 'created', entity_id: 'd1', actor_kind: 'client', payload: { new: { name: 'Handbook v3', category: 'handbook' }, old: {}, changed: [] } });
    push({ entity_type: 'documents', event_type: 'created', entity_id: 'd2', actor_kind: 'staff',  payload: { new: { name: 'Contract template', category: 'contract' }, old: {}, changed: [] } });
    push({ entity_type: 'documents', event_type: 'updated', entity_id: 'd1', actor_kind: 'staff',  payload: { new: { name: 'Handbook v3', approved_at: '2026-09-25T09:00:00Z' }, old: { approved_at: null }, changed: ['approved_at'] } });
    push({ entity_type: 'documents', event_type: 'updated', entity_id: 'd2', actor_kind: 'staff',  payload: { new: { name: 'Contract template', review_due_at: '2027-01-01' }, old: { review_due_at: null }, changed: ['review_due_at'] } });
    const t = await run();
    expect(t.failed).toBe(0);
    expect(notes('document_uploaded').map(n => [n.user_id, n.title, n.link])).toEqual([['staff-1', 'Sample Co uploaded: Handbook v3', '/clients/co-1']]);
    expect(notes('document_shared').map(n => [n.user_id, n.title, n.link])).toEqual([['ca', 'New document from Core OS 360: Contract template', '/lead/documents']]);
    expect(notes('document_approved').map(n => [n.user_id, n.title])).toEqual([['ca', 'Approved: Handbook v3']]);
    expect(db.tables.notifications).toHaveLength(3);
  });
});
