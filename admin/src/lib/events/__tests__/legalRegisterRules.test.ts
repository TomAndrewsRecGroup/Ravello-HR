import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, eventRow, type FakeDb } from './fakeSupabase';

// Core-OS 360 Phase 5, Group 4 (159): the Legal Register. Absolute
// rule: nothing here ever decides applicability or asserts a compliance
// conclusion — the human decision and the evaluation already happened,
// synchronously, in the database, before this event was ever emitted;
// this rule only REPORTS what already happened.

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
    legal_requirements: [
      { id: 'req-1', title: 'Health and Safety at Work etc. Act 1974', category: 'health_safety', jurisdiction: 'UK' },
    ],
    organisation_legal_obligations: [
      { id: 'obl-1', company_id: 'co-1', legal_requirement_id: 'req-1', applicability_status: 'applicable' },
    ],
    notification_preferences: [{ user_id: 'staff-1', email_mode: 'immediate', muted_types: [], weekly_summary: true }],
    platform_events: [], notifications: [], email_log: [], actions: [],
  });
});

describe('legal obligation applicability (159)', () => {
  it('a move to applicable tells the client admins and staff, with a real portal link', async () => {
    const updated = eventRow({
      id: 1, entity_type: 'organisation_legal_obligations', event_type: 'updated', actor_kind: 'staff', entity_id: 'obl-1',
      payload: { new: { legal_requirement_id: 'req-1', applicability_status: 'applicable' }, old: { applicability_status: 'not_assessed' }, changed: ['applicability_status'] },
    });
    db.tables.platform_events.push(updated);
    const t = await processEvents(db.client, { rules: RULES });
    expect(t.failed).toBe(0);

    const client = db.tables.notifications.find(n => n.user_id === 'ca')!;
    expect(client).toMatchObject({ type: 'legal_obligation_applicable', link: '/protect/legal-register' });
    expect(client.title).toContain('Health and Safety at Work etc. Act 1974');

    const staff = db.tables.notifications.find(n => n.user_id === 'staff-1')!;
    expect(staff).toMatchObject({ type: 'legal_obligation_applicable', link: '/health-safety/co-1/legal' });
    expect(staff.title).toContain('Sample Co');

    // Never an action from an applicability change alone — only a
    // noncompliance-flavoured EVALUATION raises one (see below).
    expect(db.tables.actions).toHaveLength(0);
  });

  it('a move to not_applicable or under_review raises nothing from this rule', async () => {
    for (const status of ['not_applicable', 'under_review']) {
      const updated = eventRow({
        id: 2, entity_type: 'organisation_legal_obligations', event_type: 'updated', actor_kind: 'staff', entity_id: 'obl-1',
        payload: { new: { legal_requirement_id: 'req-1', applicability_status: status }, old: { applicability_status: 'not_assessed' }, changed: ['applicability_status'] },
      });
      db.tables.platform_events.push(updated);
    }
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.notifications.some(n => n.type === 'legal_obligation_applicable')).toBe(false);
  });
});

describe('compliance evaluations (159) — the cautious vocabulary only', () => {
  it('evidence_current is reported to STAFF ONLY — no client email for a routine, clean evaluation', async () => {
    const created = eventRow({
      id: 3, entity_type: 'compliance_evaluations', event_type: 'created', actor_kind: 'staff', entity_id: 'eval-1',
      payload: { new: { obligation_id: 'obl-1', status: 'evidence_current', next_review_due: '2027-01-01' }, old: {}, changed: [] },
    });
    db.tables.platform_events.push(created);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.notifications.some(n => n.user_id === 'staff-1' && n.type === 'legal_evaluation_recorded')).toBe(true);
    expect(db.tables.notifications.some(n => n.user_id === 'ca')).toBe(false);
    expect(db.tables.actions).toHaveLength(0);
  });

  it('potential_noncompliance raises a HIGH, non-urgent action and tells both sides — never "non-compliant" as a verdict word', async () => {
    const created = eventRow({
      id: 4, entity_type: 'compliance_evaluations', event_type: 'created', actor_kind: 'staff', entity_id: 'eval-2',
      payload: { new: { obligation_id: 'obl-1', status: 'potential_noncompliance', next_review_due: null }, old: {}, changed: [] },
    });
    db.tables.platform_events.push(created);
    await processEvents(db.client, { rules: RULES });

    expect(db.tables.actions).toHaveLength(1);
    expect(db.tables.actions[0]).toMatchObject({
      company_id: 'co-1', action_type: 'legal_evaluation_finding', priority: 'high', severity: 'high',
      source_ref: 'legal_requirement:eval-2', source_type: 'legal_requirement', source_id: 'obl-1',
      verification_required: false,
    });

    const client = db.tables.notifications.find(n => n.user_id === 'ca')!;
    expect(client).toMatchObject({ type: 'legal_evaluation_noncompliance', link: '/protect/legal-register' });
  });

  it('confirmed_noncompliance raises an URGENT, verification-required action', async () => {
    const created = eventRow({
      id: 5, entity_type: 'compliance_evaluations', event_type: 'created', actor_kind: 'staff', entity_id: 'eval-3',
      payload: { new: { obligation_id: 'obl-1', status: 'confirmed_noncompliance', next_review_due: null }, old: {}, changed: [] },
    });
    db.tables.platform_events.push(created);
    await processEvents(db.client, { rules: RULES });

    expect(db.tables.actions).toHaveLength(1);
    expect(db.tables.actions[0]).toMatchObject({ priority: 'urgent', severity: 'critical', verification_required: true });
    expect(db.tables.notifications.some(n => n.user_id === 'ca' && n.type === 'legal_evaluation_noncompliance')).toBe(true);
  });

  it('review_due / evidence_incomplete / not_evaluated raise no action (only current/noncompliance branches do)', async () => {
    for (const status of ['review_due', 'evidence_incomplete', 'not_evaluated']) {
      const created = eventRow({
        id: 6, entity_type: 'compliance_evaluations', event_type: 'created', actor_kind: 'staff', entity_id: `eval-${status}`,
        payload: { new: { obligation_id: 'obl-1', status, next_review_due: null }, old: {}, changed: [] },
      });
      db.tables.platform_events.push(created);
    }
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.actions).toHaveLength(0);
  });

  it('no notification title or body anywhere ever reads "compliant" or "illegal" as a standalone word', async () => {
    for (const status of ['evidence_current', 'evidence_incomplete', 'review_due', 'potential_noncompliance', 'confirmed_noncompliance', 'not_evaluated']) {
      db.tables.platform_events.push(eventRow({
        id: 100 + Math.random(), entity_type: 'compliance_evaluations', event_type: 'created', actor_kind: 'staff', entity_id: `eval-vocab-${status}`,
        payload: { new: { obligation_id: 'obl-1', status, next_review_due: null }, old: {}, changed: [] },
      }));
    }
    await processEvents(db.client, { rules: RULES });
    for (const n of db.tables.notifications) {
      const text = `${n.title ?? ''} ${n.body ?? ''}`.toLowerCase();
      expect(text).not.toMatch(/\bcompliant\b|\billegal\b/);
    }
  });
});
