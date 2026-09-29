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

// Core-OS 360 Phase 5, Group 2 (157): incidents/spills/waste/
// monitoring/permits.
describe('environmental spills, waste, monitoring, permits (157)', () => {
  it('a spill NOT contained raises an urgent action and tells both sides', async () => {
    const created = eventRow({
      id: 10, entity_type: 'environmental_spills', event_type: 'created', actor_kind: 'client', entity_id: 'spill-1',
      payload: { new: { site_id: null, receiving_environment: 'water', contained: false, notified_authority: false, status: 'reported', hs_incident_id: null }, old: {}, changed: [] },
    });
    db.tables.platform_events.push(created);
    const t = await processEvents(db.client, { rules: RULES });
    expect(t.failed).toBe(0);
    expect(db.tables.actions).toHaveLength(1);
    expect(db.tables.actions[0]).toMatchObject({ action_type: 'environmental_spill_response', priority: 'urgent', source_type: 'environmental_spill', source_id: 'spill-1' });
    expect(db.tables.notifications.some(n => n.user_id === 'ca' && n.type === 'environmental_spill_reported')).toBe(true);
    expect(db.tables.notifications.some(n => n.user_id === 'staff-1' && n.type === 'environmental_spill_reported')).toBe(true);
  });

  it('a CONTAINED spill notifies but raises no action', async () => {
    const created = eventRow({
      id: 11, entity_type: 'environmental_spills', event_type: 'created', actor_kind: 'client', entity_id: 'spill-2',
      payload: { new: { site_id: null, receiving_environment: 'land', contained: true, notified_authority: false, status: 'reported', hs_incident_id: null }, old: {}, changed: [] },
    });
    db.tables.platform_events.push(created);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.actions).toHaveLength(0);
    expect(db.tables.notifications.some(n => n.type === 'environmental_spill_reported')).toBe(true);
  });

  it('a waste movement with non_conformance raises an action; a routine one raises nothing', async () => {
    const nc = eventRow({
      id: 12, entity_type: 'waste_movements', event_type: 'created', actor_kind: 'client', entity_id: 'wm-1',
      payload: { new: { waste_stream_id: 'ws-1', site_id: null, quantity: 10, unit: 'kg', non_conformance: true }, old: {}, changed: [] },
    });
    db.tables.platform_events.push(nc);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.actions).toHaveLength(1);
    expect(db.tables.actions[0]).toMatchObject({ action_type: 'environmental_waste_non_conformance', source_type: 'waste_movement', source_id: 'wm-1' });

    const routine = eventRow({
      id: 13, entity_type: 'waste_movements', event_type: 'created', actor_kind: 'client', entity_id: 'wm-2',
      payload: { new: { waste_stream_id: 'ws-1', site_id: null, quantity: 10, unit: 'kg', non_conformance: false }, old: {}, changed: [] },
    });
    db.tables.platform_events.push(routine);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.actions).toHaveLength(1); // unchanged — no second action from the routine movement
  });

  it('a monitoring exceedance (within_limit=false) raises an action; within-limit raises nothing', async () => {
    const exceeded = eventRow({
      id: 14, entity_type: 'environmental_monitoring', event_type: 'created', actor_kind: 'client', entity_id: 'em-1',
      payload: { new: { site_id: null, category: 'noise', parameter: 'Site boundary noise', recorded_limit: 70, within_limit: false }, old: {}, changed: [] },
    });
    db.tables.platform_events.push(exceeded);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.actions).toHaveLength(1);
    expect(db.tables.actions[0]).toMatchObject({ action_type: 'environmental_monitoring_exceedance', source_type: 'environmental_monitoring', source_id: 'em-1' });

    const ok = eventRow({
      id: 15, entity_type: 'environmental_monitoring', event_type: 'created', actor_kind: 'client', entity_id: 'em-2',
      payload: { new: { site_id: null, category: 'noise', parameter: 'Site boundary noise', recorded_limit: 70, within_limit: true }, old: {}, changed: [] },
    });
    db.tables.platform_events.push(ok);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.actions).toHaveLength(1); // unchanged

    const noLimit = eventRow({
      id: 16, entity_type: 'environmental_monitoring', event_type: 'created', actor_kind: 'client', entity_id: 'em-3',
      payload: { new: { site_id: null, category: 'noise', parameter: 'Site boundary noise', recorded_limit: null, within_limit: null }, old: {}, changed: [] },
    });
    db.tables.platform_events.push(noLimit);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.actions).toHaveLength(1); // still unchanged — null within_limit is never treated as an exceedance
  });

  it('an environmental permit moving to expired/surrendered/revoked tells staff only (no portal page yet)', async () => {
    const changed = eventRow({
      id: 17, entity_type: 'environmental_permits', event_type: 'updated', actor_kind: 'staff', entity_id: 'perm-1',
      payload: { new: { site_id: null, permit_type: 'Discharge consent', status: 'expired', expires_on: '2026-01-01' }, old: { status: 'active' }, changed: ['status'] },
    });
    db.tables.platform_events.push(changed);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.notifications.some(n => n.user_id === 'staff-1' && n.type === 'environmental_permit_status_changed')).toBe(true);
    expect(db.tables.notifications.some(n => n.user_id === 'ca')).toBe(false);
  });

  it('a permit condition moving to breach_recorded raises an action and tells both sides', async () => {
    const changed = eventRow({
      id: 18, entity_type: 'permit_conditions', event_type: 'updated', actor_kind: 'staff', entity_id: 'cond-1',
      payload: { new: { environmental_permit_id: 'perm-1', status: 'breach_recorded', next_review_due: null }, old: { status: 'current' }, changed: ['status'] },
    });
    db.tables.platform_events.push(changed);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.actions).toHaveLength(1);
    expect(db.tables.actions[0]).toMatchObject({ action_type: 'environmental_permit_condition_review', source_type: 'environmental_permit_condition', source_id: 'cond-1' });
    expect(db.tables.notifications.some(n => n.user_id === 'ca' && n.type === 'environmental_permit_condition_review')).toBe(true);
    expect(db.tables.notifications.some(n => n.user_id === 'staff-1' && n.type === 'environmental_permit_condition_review')).toBe(true);
  });

  it('a permit condition moving to current (resolved) raises nothing from this rule', async () => {
    const changed = eventRow({
      id: 19, entity_type: 'permit_conditions', event_type: 'updated', actor_kind: 'staff', entity_id: 'cond-2',
      payload: { new: { environmental_permit_id: 'perm-1', status: 'current', next_review_due: null }, old: { status: 'overdue' }, changed: ['status'] },
    });
    db.tables.platform_events.push(changed);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.actions).toHaveLength(0);
  });
});

describe('environmental complaints (Core-OS 360 Phase 5, Group 7, migration 162)', () => {
  it('a received complaint tells both the client and staff, never the free-text description', async () => {
    const created = eventRow({
      id: 20, entity_type: 'environmental_complaints', event_type: 'created', actor_kind: 'staff', entity_id: 'comp-1', company_id: 'co-1',
      payload: { new: { source: 'neighbour', investigated: false, closed_at: null, site_id: null }, old: {}, changed: [] },
    });
    db.tables.platform_events.push(created);
    await processEvents(db.client, { rules: RULES });

    const client = db.tables.notifications.find(n => n.user_id === 'ca' && n.type === 'environmental_complaint_received')!;
    expect(client).toMatchObject({ link: '/protect/environmental-complaints' });
    expect(client.title).not.toContain('description');
    const staff = db.tables.notifications.find(n => n.user_id === 'staff-1' && n.type === 'environmental_complaint_received')!;
    expect(staff).toMatchObject({ link: '/health-safety/co-1/environmental-complaints' });
  });

  it('investigated flipping to true tells the client admins', async () => {
    const updated = eventRow({
      id: 21, entity_type: 'environmental_complaints', event_type: 'updated', actor_kind: 'staff', entity_id: 'comp-1', company_id: 'co-1',
      payload: { new: { investigated: true, closed_at: null }, old: { investigated: false }, changed: ['investigated'] },
    });
    db.tables.platform_events.push(updated);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.notifications.some(n => n.user_id === 'ca' && n.type === 'environmental_complaint_updated')).toBe(true);
  });

  it('an unrelated column change raises nothing from either complaint rule', async () => {
    const updated = eventRow({
      id: 22, entity_type: 'environmental_complaints', event_type: 'updated', actor_kind: 'staff', entity_id: 'comp-1', company_id: 'co-1',
      payload: { new: { source: 'regulator' }, old: { source: 'neighbour' }, changed: ['source'] },
    });
    db.tables.platform_events.push(updated);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.notifications).toHaveLength(0);
  });
});
