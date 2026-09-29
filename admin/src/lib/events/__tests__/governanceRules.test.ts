import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, eventRow, type FakeDb } from './fakeSupabase';

// Core-OS 360 Phase 5, Group 6 (161): Objectives & Targets, and
// Management Review. Absolute rule: nothing here ever decides an
// objective's status or a review's outcome — the deterministic roll
// (objective_measurements_roll()) and the human review-completion
// action already happened, synchronously, in the database, before this
// event was ever emitted; this rule only REPORTS what already happened.

const sent: { to: string; subject: string; html: string }[] = [];
vi.mock('@/lib/email', async () => {
  const n = await import('@/lib/email/templates/notification');
  return {
    ...n,
    sendEmail: async (m: { to: string; subject: string; html: string }) => { sent.push(m); return { id: 'r', delivered: true }; },
    lastEmailError: () => null,
  };
});

const { processEvents } = await import('../process');
const { RULES } = await import('../rules');

let db: FakeDb;
beforeEach(() => {
  sent.length = 0;
  db = fakeSupabase({
    profiles: [
      { id: 'staff-1', email: 'tom@example.com', role: 'tps_admin' },
      { id: 'ca', email: 'ca@client.com', role: 'client_admin', company_id: 'co-1' },
    ],
    companies: [{ id: 'co-1', name: 'Sample Co', account_owner_id: null, feature_flags: {} }],
    objectives: [
      { id: 'obj-1', company_id: 'co-1', title: 'Reduce lost-time incidents', status: 'active' },
    ],
    management_reviews: [
      { id: 'rev-1', company_id: 'co-1', review_date: '2026-10-01', status: 'in_progress' },
    ],
    notification_preferences: [{ user_id: 'staff-1', email_mode: 'immediate', muted_types: [], weekly_summary: true }],
    platform_events: [], notifications: [], email_log: [], actions: [],
  });
});

describe('objective status transitions (161)', () => {
  it('at_risk raises a normal-priority action and tells both sides', async () => {
    const updated = eventRow({
      id: 1, entity_type: 'objectives', event_type: 'updated', actor_kind: 'system', entity_id: 'obj-1',
      payload: { new: { title: 'Reduce lost-time incidents', status: 'at_risk' }, old: { status: 'active' }, changed: ['status'] },
    });
    db.tables.platform_events.push(updated);
    const t = await processEvents(db.client, { rules: RULES });
    expect(t.failed).toBe(0);

    expect(db.tables.actions).toHaveLength(1);
    expect(db.tables.actions[0]).toMatchObject({
      company_id: 'co-1', action_type: 'objective_at_risk', priority: 'normal',
      source_ref: 'objective:obj-1:at_risk', source_type: 'objective', source_id: 'obj-1',
    });

    const client = db.tables.notifications.find(n => n.user_id === 'ca')!;
    expect(client).toMatchObject({ type: 'objective_at_risk', link: '/protect/objectives' });
    const staff = db.tables.notifications.find(n => n.user_id === 'staff-1')!;
    expect(staff).toMatchObject({ type: 'objective_at_risk', link: '/health-safety/co-1/objectives' });
  });

  it('missed raises a HIGH-priority action, distinct sourceRef from at_risk', async () => {
    const updated = eventRow({
      id: 2, entity_type: 'objectives', event_type: 'updated', actor_kind: 'system', entity_id: 'obj-1',
      payload: { new: { title: 'Reduce lost-time incidents', status: 'missed' }, old: { status: 'at_risk' }, changed: ['status'] },
    });
    db.tables.platform_events.push(updated);
    await processEvents(db.client, { rules: RULES });

    expect(db.tables.actions).toHaveLength(1);
    expect(db.tables.actions[0]).toMatchObject({ action_type: 'objective_missed', priority: 'high', source_ref: 'objective:obj-1:missed' });
  });

  it('a re-entry into the SAME status is idempotent — never raises a second action for an already-keyed status', async () => {
    for (let i = 0; i < 2; i++) {
      db.tables.platform_events.push(eventRow({
        id: 10 + i, entity_type: 'objectives', event_type: 'updated', actor_kind: 'system', entity_id: 'obj-1',
        payload: { new: { title: 'Reduce lost-time incidents', status: 'at_risk' }, old: { status: 'on_track' }, changed: ['status'] },
      }));
    }
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.actions).toHaveLength(1);
  });

  it('achieved raises NO action — only a notification', async () => {
    const updated = eventRow({
      id: 3, entity_type: 'objectives', event_type: 'updated', actor_kind: 'system', entity_id: 'obj-1',
      payload: { new: { title: 'Reduce lost-time incidents', status: 'achieved' }, old: { status: 'on_track' }, changed: ['status'] },
    });
    db.tables.platform_events.push(updated);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.actions).toHaveLength(0);
    expect(db.tables.notifications.some(n => n.user_id === 'ca' && n.type === 'objective_achieved')).toBe(true);
  });

  it('a status change other than at_risk/missed/achieved (e.g. draft -> active) raises nothing from this rule', async () => {
    const updated = eventRow({
      id: 4, entity_type: 'objectives', event_type: 'updated', actor_kind: 'staff', entity_id: 'obj-1',
      payload: { new: { title: 'Reduce lost-time incidents', status: 'active' }, old: { status: 'draft' }, changed: ['status'] },
    });
    db.tables.platform_events.push(updated);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.actions).toHaveLength(0);
    expect(db.tables.notifications).toHaveLength(0);
  });
});

describe('management review completion (161)', () => {
  it('reaching completed tells staff and the client admins, with real links, and raises no action', async () => {
    const updated = eventRow({
      id: 5, entity_type: 'management_reviews', event_type: 'updated', actor_kind: 'staff', entity_id: 'rev-1',
      payload: { new: { review_date: '2026-10-01', status: 'completed' }, old: { status: 'in_progress' }, changed: ['status'] },
    });
    db.tables.platform_events.push(updated);
    await processEvents(db.client, { rules: RULES });

    const staff = db.tables.notifications.find(n => n.user_id === 'staff-1' && n.type === 'management_review_completed')!;
    expect(staff).toMatchObject({ link: '/health-safety/co-1/management-review' });
    expect(staff.title).toContain('Sample Co');

    const client = db.tables.notifications.find(n => n.user_id === 'ca' && n.type === 'management_review_completed')!;
    expect(client).toMatchObject({ link: '/protect/management-review' });

    expect(db.tables.actions).toHaveLength(0);
  });

  it('a move to a non-completed status raises nothing from this rule', async () => {
    const updated = eventRow({
      id: 6, entity_type: 'management_reviews', event_type: 'updated', actor_kind: 'staff', entity_id: 'rev-1',
      payload: { new: { review_date: '2026-10-01', status: 'cancelled' }, old: { status: 'in_progress' }, changed: ['status'] },
    });
    db.tables.platform_events.push(updated);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.notifications).toHaveLength(0);
  });
});

describe('worker consultation recorded (Core-OS 360 Phase 5, Group 7, migration 162)', () => {
  it('tells the client admins, never puts the topic/outcome text in the title', async () => {
    const created = eventRow({
      id: 7, entity_type: 'consultation_records', event_type: 'created', actor_kind: 'staff', entity_id: 'cons-1', company_id: 'co-1',
      payload: { new: { consultation_date: '2026-09-29', method: 'meeting', site_id: null }, old: {}, changed: [] },
    });
    db.tables.platform_events.push(created);
    await processEvents(db.client, { rules: RULES });

    const client = db.tables.notifications.find(n => n.user_id === 'ca' && n.type === 'consultation_recorded')!;
    expect(client).toMatchObject({ link: '/protect/consultation' });
    expect(client.title).not.toContain('topic');
    expect(db.tables.actions).toHaveLength(0);
  });
});
