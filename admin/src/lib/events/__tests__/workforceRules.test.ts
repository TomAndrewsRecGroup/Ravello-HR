import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, eventRow, type FakeDb, type Row } from './fakeSupabase';

// Phase 3 workforce consequences, through the real consumer and the real
// rules against the stateful fake. Audiences are capability holders in
// the organisation. A status change notifies only when a deployable
// person stops being deployable; reminders skip a row a newer one has
// replaced; nothing medical beyond "a review is due" is ever said.

vi.mock('@/lib/email', async () => {
  const n = await import('@/lib/email/templates/notification');
  return { ...n, sendEmail: async () => ({ id: 'r', delivered: true }), lastEmailError: () => null };
});

const { processEvents } = await import('../process');
const { RULES } = await import('../rules');

let db: FakeDb;
beforeEach(() => {
  db = fakeSupabase({
    profiles: [
      { id: 'reader',  email: 'r@x.com', role: 'client_user',  company_id: 'co-1' },
      { id: 'manager', email: 'm@x.com', role: 'client_admin', company_id: 'co-1' },
      { id: 'oh',      email: 'oh@x.com', role: 'client_editor', company_id: 'co-1' },
      { id: 'other',   email: 'o@y.com', role: 'client_admin', company_id: 'co-2' },
    ],
    companies: [{ id: 'co-1', name: 'Sample Co', account_owner_id: null, feature_flags: {} }],
    org_access: [
      { company_id: 'co-1', user_id: 'reader',  role_key: 'site_manager', capabilities: ['workforce.read'] },
      { company_id: 'co-1', user_id: 'manager', role_key: 'organisation_admin', capabilities: ['workforce.read', 'workforce.manage', 'deployment.exception.approve'] },
      { company_id: 'co-1', user_id: 'oh',      role_key: 'occupational_health_advisor', capabilities: ['occupational_health.manage', 'occupational_health.summary.read'] },
      { company_id: 'co-2', user_id: 'other',   role_key: 'organisation_admin', capabilities: ['workforce.read', 'workforce.manage', 'occupational_health.manage'] },
    ],
    people: [{ id: 'p-1', company_id: 'co-1', full_name: 'Sam Driver' }],
    credential_types: [{ id: 'ct-1', company_id: 'co-1', title: 'CSCS card' }],
    person_credentials: [],
    person_health_outcomes: [],
    training_records: [],
    hs_sites: [{ id: 'site-1', company_id: 'co-1', name: 'Head Office' }],
    site_checkins: [],
    notification_preferences: [], platform_events: [], notifications: [], email_log: [], actions: [], internal_tasks: [],
  });
});

const ev = (over: Row & { entity_type: string; event_type: string }) =>
  eventRow({ id: Math.floor(Math.random() * 1e6), company_id: 'co-1', actor_kind: 'system', ...over });
const who = () => db.tables.notifications.map(n => n.user_id).sort();
async function run(...events: Row[]) {
  db.tables.platform_events.push(...events);
  const t = await processEvents(db.client, { rules: RULES });
  expect(t.failed).toBe(0);
  return t;
}
const statusChange = (from: string | null, to: string) => ev({
  entity_type: 'deployment_status_log', event_type: 'created', entity_id: null,
  payload: { new: { person_id: 'p-1', from_status: from, to_status: to }, old: {}, changed: [] },
});
const reminder = (entity: string, bucket: string, due: string, row: Row) => ev({
  entity_type: entity, event_type: 'reminder', entity_id: row.id, payload: { bucket, due_date: due, row, rule: entity },
});

describe('Safe to Deploy status changes', () => {
  it('READY → NOT_READY tells workforce.read holders in the organisation, by name, with no reasons', async () => {
    await run(statusChange('READY', 'NOT_READY'));
    expect(who()).toEqual(['manager', 'reader']);
    const n = db.tables.notifications[0];
    expect(n.type).toBe('workforce_not_ready');
    expect(n.title).toBe('Sam Driver is no longer ready to deploy');
    expect(n.link).toBe('/lead/workforce/people/p-1');
  });
  it('CONDITIONALLY_READY → NOT_READY notifies too', async () => {
    await run(statusChange('CONDITIONALLY_READY', 'NOT_READY'));
    expect(who()).toEqual(['manager', 'reader']);
  });
  it.each([[null, 'NOT_READY'], ['NOT_READY', 'REVIEW_REQUIRED'], ['READY', 'REVIEW_REQUIRED'], ['NOT_READY', 'READY']])(
    '%s → %s is silent', async (from, to) => {
      await run(statusChange(from, to));
      expect(db.tables.notifications).toHaveLength(0);
    });
});

describe('workforce reminders', () => {
  const cred = { id: 'pc-1', company_id: 'co-1', person_id: 'p-1', credential_type_id: 'ct-1', expires_on: '2026-10-20', verification_status: 'verified' };

  it('a credential expiring tells workforce.manage holders, with the credential and the person', async () => {
    db.tables.person_credentials.push(cred);
    await run(reminder('person_credentials', 'due_30', '2026-10-20', cred));
    expect(who()).toEqual(['manager']);
    expect(db.tables.notifications[0].title).toBe('CSCS card for Sam Driver expires 2026-10-20');
  });
  it('a credential replaced by a newer one is not reminded', async () => {
    db.tables.person_credentials.push(cred, { ...cred, id: 'pc-2', expires_on: '2031-10-20' });
    await run(reminder('person_credentials', 'due_30', '2026-10-20', cred));
    expect(db.tables.notifications).toHaveLength(0);
  });
  it('an OLDER credential does not suppress the reminder, nor does a rejected newer one', async () => {
    db.tables.person_credentials.push(cred, { ...cred, id: 'pc-0', expires_on: '2021-10-20' },
      { ...cred, id: 'pc-3', expires_on: '2031-01-01', verification_status: 'rejected' });
    await run(reminder('person_credentials', 'due_7', '2026-10-20', cred));
    expect(who()).toEqual(['manager']);
  });
  it('an exception ending is said a week ahead and on the day only', async () => {
    const x = { id: 'ex-1', company_id: 'co-1', person_id: 'p-1', requirement_type: 'training', kind: 'temporary_exception', valid_until: '2026-10-01' };
    await run(reminder('requirement_exceptions', 'due_30', '2026-10-01', x));
    expect(db.tables.notifications).toHaveLength(0);
    await run(reminder('requirement_exceptions', 'due_7', '2026-10-01', { ...x, id: 'ex-2' }));
    expect(who()).toEqual(['manager']);
    expect(db.tables.notifications[0].type).toBe('workforce_exception_lapsing');
  });
  it('an occupational health review reaches occupational_health.manage only, and says nothing about the outcome', async () => {
    const o = { id: 'oh-1', company_id: 'co-1', person_id: 'p-1', requirement_id: 'req-1', review_date: '2026-10-10',
                assessed_on: '2025-10-10', created_at: '2025-10-10', outcome: 'fit_with_restrictions', restriction_summary: 'No ladders' };
    db.tables.person_health_outcomes.push(o);
    await run(reminder('person_health_outcomes', 'due_30', '2026-10-10',
      { id: 'oh-1', company_id: 'co-1', person_id: 'p-1', requirement_id: 'req-1', review_date: '2026-10-10' }));
    expect(who()).toEqual(['oh']);
    const t = db.tables.notifications[0].title as string;
    expect(t).toBe('Occupational health review for Sam Driver is due 2026-10-10');
    expect(t).not.toMatch(/restriction|ladder|fit/i);
  });
  it('an occupational health reminder for a superseded outcome is skipped', async () => {
    db.tables.person_health_outcomes.push(
      { id: 'oh-1', company_id: 'co-1', person_id: 'p-1', requirement_id: 'req-1', review_date: '2026-10-10', assessed_on: '2025-10-10', created_at: '2025-10-10' },
      { id: 'oh-2', company_id: 'co-1', person_id: 'p-1', requirement_id: 'req-1', review_date: '2027-09-01', assessed_on: '2026-09-01', created_at: '2026-09-01' });
    await run(reminder('person_health_outcomes', 'due_30', '2026-10-10',
      { id: 'oh-1', company_id: 'co-1', person_id: 'p-1', requirement_id: 'req-1', review_date: '2026-10-10' }));
    expect(db.tables.notifications).toHaveLength(0);
  });
  it('a training record with no employee record is named from the person', async () => {
    const tr = { id: 'tr-1', company_id: 'co-1', employee_id: null, person_id: 'p-1', course_id: 'c-1', course_name: 'Forklift', expires_on: '2026-10-20', verification_status: 'verified' };
    db.tables.training_records.push(tr);
    await run(reminder('training_records', 'due_30', '2026-10-20', tr));
    expect(db.tables.notifications.map(n => n.title)[0]).toBe('Forklift for Sam Driver expires 2026-10-20');
  });

  describe('stale site check-in (C14.8)', () => {
    const openCheckin = { id: 'sc-1', company_id: 'co-1', person_id: 'p-1', site_id: 'site-1', checked_in_at: '2026-09-29' };

    it('an open check-in still open the morning after tells workforce.manage holders, by person and site', async () => {
      db.tables.site_checkins.push(openCheckin);
      await run(reminder('site_checkins', 'overdue', '2026-09-29', openCheckin));
      expect(who()).toEqual(['manager']);
      const n = db.tables.notifications[0];
      expect(n.type).toBe('site_checkin_stale');
      expect(n.title).toBe('Sam Driver checked in at Head Office on 2026-09-29 and has not checked out');
      expect(n.link).toBe('/lead/workforce/onsite');
    });

    it('is silent on the due_0 bucket — only overdue/overdue_weekly, matching the role_stale precedent', async () => {
      db.tables.site_checkins.push(openCheckin);
      await run(reminder('site_checkins', 'due_0', '2026-09-29', openCheckin));
      expect(db.tables.notifications).toHaveLength(0);
    });

    it('a re-processed event for a row already checked out since is skipped', async () => {
      db.tables.site_checkins.push({ ...openCheckin, checked_out_at: '2026-09-30T08:00:00Z' });
      await run(reminder('site_checkins', 'overdue', '2026-09-29', openCheckin));
      expect(db.tables.notifications).toHaveLength(0);
    });

    it('with no site recorded, falls back to "a site" rather than a blank', async () => {
      const noSite = { ...openCheckin, id: 'sc-2', site_id: null };
      db.tables.site_checkins.push(noSite);
      await run(reminder('site_checkins', 'overdue', '2026-09-29', noSite));
      expect(db.tables.notifications[0].title).toBe('Sam Driver checked in at a site on 2026-09-29 and has not checked out');
    });
  });
});

describe('the rules never read medical or reason text', () => {
  const src = readFileSync(resolve(__dirname, '../workforceRules.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  it('no outcome, restriction, clinical or reasons column is selected or used', () => {
    expect(src).not.toMatch(/restriction|clinical|\.outcome|'outcome'|reasons|detail/i);
  });
});
