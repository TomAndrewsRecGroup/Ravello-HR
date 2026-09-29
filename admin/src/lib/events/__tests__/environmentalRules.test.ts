import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, eventRow, type FakeDb } from './fakeSupabase';

// Core-OS 360 Phase 5, Group 1 (156): environmental aspects & impacts.
// The ONLY consequence: a confirmed-significant status change raises
// ONE action + tells the client admins (with a real portal link) + staff.
// A move to any other status (assessed / confirmed_not_significant /
// superseded) raises nothing from this rule. Significance itself is
// never decided here — it already happened, in the database, before
// this event was ever emitted.

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
    environmental_aspects: [
      { id: 'aspect-1', company_id: 'co-1', activity: 'Diesel generator run during power cuts', aspect_type: 'emissions_to_air', status: 'confirmed_significant' },
    ],
    notification_preferences: [{ user_id: 'staff-1', email_mode: 'immediate', muted_types: [], weekly_summary: true }],
    platform_events: [], notifications: [], email_log: [], actions: [],
  });
});

describe('environmental aspects (156)', () => {
  it('a status change to confirmed_significant raises ONE action and tells both the client and staff', async () => {
    const updated = eventRow({
      id: 1, entity_type: 'environmental_aspects', event_type: 'updated', actor_kind: 'client', entity_id: 'aspect-1',
      payload: { new: { site_id: null, aspect_type: 'emissions_to_air', condition: 'abnormal', status: 'confirmed_significant' }, old: { status: 'draft' }, changed: ['status'] },
    });
    db.tables.platform_events.push(updated);
    const t = await processEvents(db.client, { rules: RULES });
    expect(t.failed).toBe(0);

    expect(db.tables.actions).toHaveLength(1);
    expect(db.tables.actions[0]).toMatchObject({
      company_id: 'co-1', action_type: 'environmental_significant_aspect', priority: 'high',
      source_ref: 'environmental_aspect:aspect-1', related_entity_type: 'environmental_aspect', related_entity_id: 'aspect-1',
      source_type: 'environmental_aspect', source_id: 'aspect-1',
    });
    expect(db.tables.actions[0].title).toContain('Diesel generator run during power cuts');

    const client = db.tables.notifications.find(n => n.user_id === 'ca')!;
    expect(client).toMatchObject({ type: 'environmental_aspect_significant', link: '/protect/environmental-aspects' });
    expect(client.title).toContain('Diesel generator run during power cuts');

    const staff = db.tables.notifications.find(n => n.user_id === 'staff-1')!;
    expect(staff).toMatchObject({ type: 'environmental_aspect_significant', link: '/health-safety/co-1/environmental-aspects' });
    expect(staff.title).toContain('Sample Co');
  });

  it('re-processing the same event raises nothing new (idempotent by sourceRef)', async () => {
    const updated = eventRow({
      id: 2, entity_type: 'environmental_aspects', event_type: 'updated', actor_kind: 'client', entity_id: 'aspect-1',
      payload: { new: { site_id: null, aspect_type: 'emissions_to_air', condition: 'abnormal', status: 'confirmed_significant' }, old: { status: 'draft' }, changed: ['status'] },
    });
    db.tables.platform_events.push(updated);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.actions).toHaveLength(1);

    // A second, distinct event against the SAME aspect (e.g. a re-run of
    // the confirmation flow) must not create a second action.
    const updated2 = eventRow({
      id: 3, entity_type: 'environmental_aspects', event_type: 'updated', actor_kind: 'client', entity_id: 'aspect-1',
      payload: { new: { site_id: null, aspect_type: 'emissions_to_air', condition: 'abnormal', status: 'confirmed_significant' }, old: { status: 'confirmed_significant' }, changed: ['status'] },
    });
    db.tables.platform_events.push(updated2);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.actions).toHaveLength(1);
  });

  it('a move to confirmed_not_significant raises nothing from this rule', async () => {
    const updated = eventRow({
      id: 4, entity_type: 'environmental_aspects', event_type: 'updated', actor_kind: 'client', entity_id: 'aspect-1',
      payload: { new: { site_id: null, aspect_type: 'emissions_to_air', condition: 'normal', status: 'confirmed_not_significant' }, old: { status: 'draft' }, changed: ['status'] },
    });
    db.tables.platform_events.push(updated);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.actions).toHaveLength(0);
    expect(db.tables.notifications.some(n => n.type === 'environmental_aspect_significant')).toBe(false);
  });

  it('a plain "created" event (a fresh draft aspect) raises nothing', async () => {
    const created = eventRow({
      id: 5, entity_type: 'environmental_aspects', event_type: 'created', actor_kind: 'client', entity_id: 'aspect-2',
      payload: { new: { site_id: null, aspect_type: 'waste_generation', condition: 'normal', status: 'draft' }, old: {}, changed: [] },
    });
    db.tables.platform_events.push(created);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.actions).toHaveLength(0);
    expect(db.tables.notifications).toHaveLength(0);
  });
});
