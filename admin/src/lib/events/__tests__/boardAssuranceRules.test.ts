import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, eventRow, type FakeDb } from './fakeSupabase';

// Core-OS 360 Phase 13, Group 1 (178): Board Assurance & Executive
// Reporting. Absolute rule: nothing here decides anything — the
// draft -> issued transition already happened, as a staff action taken
// directly on the row (board_assurance_reports_guard() only stamps the
// issue timestamp; it never chooses to transition on its own). This
// rule only REPORTS that it happened, the same posture
// management_review_completed already established.

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
    board_assurance_reports: [
      { id: 'bar-1', company_id: 'co-1', year: 2026, quarter: 3, status: 'draft' },
    ],
    notification_preferences: [{ user_id: 'staff-1', email_mode: 'immediate', muted_types: [], weekly_summary: true }],
    platform_events: [], notifications: [], email_log: [], actions: [],
  });
});

describe('board assurance report issued (178)', () => {
  it('tells both staff and the client admins, with the correct per-app links, and raises no action', async () => {
    const updated = eventRow({
      id: 1, entity_type: 'board_assurance_reports', event_type: 'updated', actor_kind: 'staff', entity_id: 'bar-1', company_id: 'co-1',
      payload: { new: { year: 2026, quarter: 3, status: 'issued' }, old: { status: 'draft' }, changed: ['status'] },
    });
    db.tables.platform_events.push(updated);
    const t = await processEvents(db.client, { rules: RULES });
    expect(t.failed).toBe(0);

    const staff = db.tables.notifications.find(n => n.user_id === 'staff-1' && n.type === 'board_assurance_report_issued')!;
    expect(staff).toMatchObject({ link: '/health-safety/co-1/board-assurance' });
    expect(staff.title).toContain('Sample Co');

    const client = db.tables.notifications.find(n => n.user_id === 'ca' && n.type === 'board_assurance_report_issued')!;
    expect(client).toMatchObject({ link: '/protect/board-assurance' });

    expect(db.tables.actions).toHaveLength(0);
  });

  it('a status update that is NOT a move to issued raises nothing', async () => {
    const updated = eventRow({
      id: 2, entity_type: 'board_assurance_reports', event_type: 'updated', actor_kind: 'staff', entity_id: 'bar-1', company_id: 'co-1',
      payload: { new: { year: 2026, quarter: 3, status: 'draft' }, old: { status: 'draft' }, changed: [] },
    });
    db.tables.platform_events.push(updated);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.notifications).toHaveLength(0);
  });
});
