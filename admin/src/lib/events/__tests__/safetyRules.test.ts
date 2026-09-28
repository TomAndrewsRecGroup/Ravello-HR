import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, eventRow, type FakeDb, type Row } from './fakeSupabase';

// Phase 2 safety consequences, through the real consumer and the real
// rules against the stateful fake. Audiences are CAPABILITY holders and
// the named people on a record; nothing carries an incident's
// description; RIDDOR produces prompts and a human task, never a
// decision; verification goes to the named verifier.

const sent: { to: string; subject: string }[] = [];
vi.mock('@/lib/email', async () => {
  const n = await import('@/lib/email/templates/notification');
  return { ...n, sendEmail: async (m: { to: string; subject: string }) => { sent.push(m); return { id: 'r', delivered: true }; }, lastEmailError: () => null };
});

const { processEvents } = await import('../process');
const { RULES } = await import('../rules');

let db: FakeDb;
beforeEach(() => {
  sent.length = 0;
  db = fakeSupabase({
    profiles: [
      { id: 'staff-1', email: 'tom@example.com', role: 'tps_admin' },
      { id: 'inv', email: 'inv@x.com', role: 'client_editor', company_id: 'co-1' },
      { id: 'appr', email: 'appr@x.com', role: 'client_admin', company_id: 'co-1' },
      { id: 'riddor', email: 'riddor@x.com', role: 'client_admin', company_id: 'co-1' },
      { id: 'hsem', email: 'hsem@x.com', role: 'client_user', company_id: 'home' },
      { id: 'emp', email: 'emp@x.com', role: 'client_user', company_id: 'co-1' },
      { id: 'other-co', email: 'o@y.com', role: 'client_admin', company_id: 'co-2' },
    ],
    companies: [{ id: 'co-1', name: 'Sample Co', account_owner_id: null, feature_flags: {} }],
    org_access: [
      { company_id: 'co-1', user_id: 'inv',    role_key: 'site_manager',  capabilities: ['incident.investigate', 'hazard.manage', 'incident.read', 'actions.assign'] },
      { company_id: 'co-1', user_id: 'appr',   role_key: 'organisation_admin', capabilities: ['incident.approve', 'risk.approve', 'incident.read', 'actions.assign'] },
      { company_id: 'co-1', user_id: 'riddor', role_key: 'organisation_owner', capabilities: ['riddor.review', 'incident.read'] },
      { company_id: 'co-1', user_id: 'hsem',   role_key: 'hse_manager',   capabilities: ['incident.approve', 'riddor.review'] },
      { company_id: 'co-2', user_id: 'other-co', role_key: 'hse_manager', capabilities: ['incident.investigate', 'riddor.review', 'incident.approve'] },
    ],
    incident_escalation_rules: [
      { company_id: null, severity: 'major', notify_roles: ['hse_manager', 'site_manager', 'consultant'], notify_staff: true, active: true },
      { company_id: null, severity: 'serious', notify_roles: ['site_manager', 'hse_advisor'], notify_staff: false, active: true },
    ],
    notification_preferences: [], platform_events: [], notifications: [], email_log: [], actions: [], internal_tasks: [],
  });
});

const ev = (over: Row & { entity_type: string; event_type: string }) => eventRow({ id: Math.floor(Math.random() * 1e6), company_id: 'co-1', actor_kind: 'client', ...over });
const who = () => db.tables.notifications.map(n => n.user_id).sort();
async function run(...events: Row[]) {
  db.tables.platform_events.push(...events);
  const t = await processEvents(db.client, { rules: RULES });
  expect(t.failed).toBe(0);
  return t;
}

describe('incidents', () => {
  const reported = (over: Row = {}) => ev({
    entity_type: 'hs_incidents', event_type: 'created', entity_id: 'inc-1', actor_id: 'emp',
    payload: { new: { incident_number: 'INC-2026-000007', incident_type: 'injury', status: 'reported', riddor_review_status: 'review_required', reported_by: 'emp', ...over }, old: {}, changed: [] },
  });

  it('a report prompts triage by incident.investigate holders and tells staff — number and type only', async () => {
    await run(reported({ riddor_review_status: 'not_reviewed', incident_type: 'near_miss' }));
    expect(who()).toEqual(['inv', 'staff-1']);
    const n = db.tables.notifications.find(x => x.user_id === 'inv')!;
    expect(n).toMatchObject({ type: 'hs_incident_reported', link: '/protect/incidents/inc-1' });
    expect(n.title).toBe('Incident reported: INC-2026-000007 (Near miss) — needs triage');
    expect(db.tables.notifications.find(x => x.user_id === 'staff-1')!.link).toBe('/health-safety/co-1/incidents');
  });

  it('an injury also prompts the RIDDOR reviewers of THAT organisation only', async () => {
    await run(reported());
    const riddor = db.tables.notifications.filter(n => n.type === 'riddor_review_required').map(n => n.user_id).sort();
    expect(riddor).toEqual(['hsem', 'riddor']);
    expect(who()).not.toContain('other-co');
  });

  it('a description smuggled into the payload never reaches a notification', async () => {
    await run(reported({ description: 'SECRETMEDICAL crushed finger', title: 'Joe Bloggs hand' }));
    for (const n of db.tables.notifications) {
      expect(`${n.title} ${n.body ?? ''}`).not.toMatch(/SECRETMEDICAL|Joe Bloggs/);
    }
  });

  it('a confirmed MAJOR severity escalates by the platform rule — roles + staff, urgently', async () => {
    await run(ev({
      entity_type: 'hs_incidents', event_type: 'updated', entity_id: 'inc-1', actor_id: 'inv',
      payload: { new: { incident_number: 'INC-2026-000007', incident_type: 'injury', severity: 'major', severity_confirmed_at: '2026-09-28T09:00:00Z' },
                 old: { severity: 'major', severity_confirmed_at: null }, changed: ['severity_confirmed_at'] },
    }));
    expect(who()).toEqual(['hsem', 'inv', 'staff-1']);
    expect(db.tables.notifications.every(n => n.type === 'hs_incident_escalated')).toBe(true);
    expect(db.tables.notifications[0].title).toBe('INC-2026-000007 (Injury): severity confirmed as Major');
  });

  it("an organisation's own escalation rules replace the platform default", async () => {
    db.tables.incident_escalation_rules.push({ company_id: 'co-1', severity: 'major', notify_roles: ['organisation_owner'], notify_staff: false, active: true });
    db.tables.incident_escalation_rules.push({ company_id: 'co-2', severity: 'major', notify_roles: ['hse_manager'], notify_staff: true, active: true });
    await run(ev({
      entity_type: 'hs_incidents', event_type: 'updated', entity_id: 'inc-1',
      payload: { new: { incident_number: 'INC-1', incident_type: 'injury', severity: 'major', severity_confirmed_at: 'x' }, old: { severity_confirmed_at: null }, changed: ['severity_confirmed_at'] },
    }));
    expect(who()).toEqual(['riddor']);
  });

  it('an unconfirmed severity change escalates nobody', async () => {
    await run(ev({
      entity_type: 'hs_incidents', event_type: 'updated', entity_id: 'inc-1',
      payload: { new: { incident_number: 'INC-1', incident_type: 'injury', severity: null, severity_confirmed_at: null }, old: { severity_confirmed_at: 'x' }, changed: ['severity_confirmed_at', 'severity'] },
    }));
    expect(db.tables.notifications).toHaveLength(0);
  });

  it('a person decides REPORTABLE: RIDDOR holders + staff are told and ONE human task is keyed — nothing is submitted', async () => {
    const e = ev({
      entity_type: 'hs_incidents', event_type: 'updated', entity_id: 'inc-1',
      payload: { new: { incident_number: 'INC-1', incident_type: 'injury', riddor_review_status: 'confirmed_reportable' }, old: { riddor_review_status: 'potentially_reportable' }, changed: ['riddor_review_status'] },
    });
    await run(e);
    expect(db.tables.internal_tasks).toHaveLength(1);
    expect(db.tables.internal_tasks[0]).toMatchObject({ source_ref: 'hs_incident_riddor:inc-1', priority: 'urgent', assigned_to: 'staff-1' });
    expect(db.tables.actions).toHaveLength(0);
    db.tables.platform_events[0].processed_at = null; db.tables.platform_events[0].claimed_at = null;
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.internal_tasks).toHaveLength(1);
  });

  it('closing tells incident.read holders and the reporter', async () => {
    await run(ev({
      entity_type: 'hs_incidents', event_type: 'updated', entity_id: 'inc-1', actor_id: 'appr',
      payload: { new: { incident_number: 'INC-1', incident_type: 'injury', status: 'closed', reported_by: 'emp' }, old: { status: 'awaiting_actions' }, changed: ['status'] },
    }));
    expect(who()).toEqual(['appr', 'emp', 'inv', 'riddor']);
  });
});

describe('investigations', () => {
  it('submission goes to incident.approve holders; the decision goes back to the lead', async () => {
    await run(ev({
      entity_type: 'incident_investigations', event_type: 'updated', entity_id: 'v-1', actor_id: 'inv',
      payload: { new: { reference: 'INV-000003', incident_id: 'inc-1', status: 'pending_approval', lead_investigator_id: 'inv' }, old: { status: 'in_progress' }, changed: ['status'] },
    }));
    expect(who()).toEqual(['appr', 'hsem']);
    db.tables.notifications.length = 0;
    await run(ev({
      entity_type: 'incident_investigations', event_type: 'updated', entity_id: 'v-1', actor_id: 'appr',
      payload: { new: { reference: 'INV-000003', incident_id: 'inc-1', status: 'changes_requested', lead_investigator_id: 'inv' }, old: { status: 'pending_approval' }, changed: ['status'] },
    }));
    expect(who()).toEqual(['inv']);
    expect(db.tables.notifications[0]).toMatchObject({ type: 'investigation_decided', link: '/protect/incidents/inc-1' });
  });
});

describe('corrective actions', () => {
  const upd = (nw: Row, old: Row, changed: string[], actor = 'inv') => ev({
    entity_type: 'actions', event_type: 'updated', entity_id: 'a-1', actor_id: actor,
    payload: { new: { title: 'Fit guard', source_type: 'investigation', assigned_to: 'inv', ...nw }, old, changed },
  });

  it('submitted for verification → the NAMED verifier only', async () => {
    await run(upd({ status: 'awaiting_verification', verifier_id: 'hsem' }, { status: 'active' }, ['status']));
    expect(who()).toEqual(['hsem']);
    expect(db.tables.notifications[0].type).toBe('action_verification_requested');
  });

  it('no named verifier → actions.assign holders', async () => {
    await run(upd({ status: 'awaiting_verification', verifier_id: null }, { status: 'active' }, ['status']));
    expect(who()).toEqual(['appr', 'inv']);
  });

  it('sent back → the assignee, urgently', async () => {
    await run(upd({ status: 'active', verifier_id: 'hsem' }, { status: 'awaiting_verification' }, ['status'], 'hsem'));
    expect(who()).toEqual(['inv']);
    expect(db.tables.notifications[0].type).toBe('action_verification_rejected');
  });

  it('an HR action assigned elsewhere is not a safety notification', async () => {
    await run(ev({ entity_type: 'actions', event_type: 'created', entity_id: 'a-2', actor_id: 'appr',
      payload: { new: { title: 'Update handbook', source_type: 'hr_process', assigned_to: 'inv' }, old: {}, changed: [] } }));
    expect(db.tables.notifications.filter(n => n.type === 'action_assigned')).toHaveLength(0);
  });
});

describe('controlled documents', () => {
  it('RA submitted → risk.approve; approved → the assessor and manager, never the approver who acted', async () => {
    await run(ev({ entity_type: 'risk_assessments', event_type: 'updated', entity_id: 'ra-1', actor_id: 'inv',
      payload: { new: { reference: 'RA-000004', version: 2, status: 'pending_review', assessor_id: 'inv' }, old: { status: 'draft' }, changed: ['status'] } }));
    expect(who()).toEqual(['appr']);
    expect(db.tables.notifications[0]).toMatchObject({ type: 'safety_doc_review_requested', link: '/protect/risk-assessments/ra-1' });
    db.tables.notifications.length = 0;
    await run(ev({ entity_type: 'risk_assessments', event_type: 'updated', entity_id: 'ra-1', actor_id: 'appr',
      payload: { new: { reference: 'RA-000004', version: 2, status: 'approved', assessor_id: 'inv', responsible_manager_id: 'appr' }, old: { status: 'pending_review' }, changed: ['status'] } }));
    expect(who()).toEqual(['inv']);
    expect(db.tables.notifications[0].title).toBe('Risk assessment RA-000004 v2: Approved');
  });

  it('an SDS change putting a COSHH assessment into review tells its assessor and the approvers', async () => {
    await run(ev({ entity_type: 'coshh_assessments', event_type: 'updated', entity_id: 'c-1', actor_id: null, actor_kind: 'system',
      payload: { new: { reference: 'COSHH-000002', version: 1, status: 'review_due', review_reason: 'sds_change', assessor_id: 'inv' }, old: { status: 'active' }, changed: ['status', 'review_reason'] } }));
    expect(who()).toEqual(['appr', 'inv']);
    expect(db.tables.notifications[0].title).toContain('(sds change)');
  });

  it('a RAMS end-date reminder is told apart from its review-date reminder', async () => {
    await run(ev({ entity_type: 'method_statements', event_type: 'reminder', entity_id: 'm-1', actor_kind: 'system',
      payload: { bucket: 'overdue', due_date: '2026-09-20', rule: 'method_statements_end', row: { reference: 'RAMS-000001', version: 1, author_id: 'inv' } } }));
    expect(db.tables.notifications.find(n => n.user_id === 'inv')!.title).toBe('RAMS RAMS-000001 v1 has passed its end date');
  });
});

describe('the rule source never reads free text', () => {
  const src = readFileSync(resolve(__dirname, '../safetyRules.ts'), 'utf8');
  it('no description, summary, notes, rationale, injured person or incident title', () => {
    expect(src).not.toMatch(/\.\s*(description|summary|notes|rationale|injured_person_name|findings|immediate_action)\b/);
    // An incident's own title is typed by the reporter and can name a
    // person; the incident rules and incidentLabel use number + type only.
    const incidents = src.slice(src.indexOf('// ── Incidents'), src.indexOf('// ── Investigations'));
    const label = src.slice(src.indexOf('const incidentLabel'), src.indexOf('export const safetyRules'));
    expect(incidents.length).toBeGreaterThan(1000);
    expect(`${incidents}${label}`).not.toMatch(/\.title\b/);
  });
});
