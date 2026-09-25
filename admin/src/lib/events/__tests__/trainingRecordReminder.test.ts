import { beforeEach, describe, expect, it } from 'vitest';
import { fakeSupabase, eventRow, type FakeDb } from './fakeSupabase';

// training_records links employee_id rather than storing a free-text
// name; slimRow() (lib/reminders/run.ts) never lets an embed into the
// reminder payload, so the title's employee name is looked up by the
// rule itself, the same way hsRules.ts's itemTitle() resolves a title.

const { processEvents } = await import('../process');
const { RULES } = await import('../rules');

let db: FakeDb;
beforeEach(() => {
  db = fakeSupabase({
    profiles: [{ id: 'ca', email: 'ca@client.com', role: 'client_admin', company_id: 'co-1' }],
    companies: [{ id: 'co-1', name: 'Sample Co', feature_flags: {} }],
    employee_records: [{ id: 'emp-1', company_id: 'co-1', full_name: 'Jordan Lee' }],
    notification_preferences: [],
    platform_events: [], notifications: [], email_log: [],
  });
});

const reminder = (bucket: string) => eventRow({
  id: 20, entity_type: 'training_records', event_type: 'reminder', actor_kind: 'system', entity_id: 'tr-1',
  payload: { bucket, due_date: '2026-10-15', row: { id: 'tr-1', company_id: 'co-1', employee_id: 'emp-1', course_name: 'Fire Warden' } },
});

describe('training_record_reminder', () => {
  it('due_30/due_7 tells the client admins the training is EXPIRING, with the employee name looked up', async () => {
    db.tables.platform_events.push(reminder('due_30'));
    const t = await processEvents(db.client, { rules: RULES });
    expect(t.failed).toBe(0);
    const n = db.tables.notifications.find((x: any) => x.user_id === 'ca')!;
    expect(n).toMatchObject({ type: 'training_record_expiring', link: '/lead/training-records' });
    expect(n.title).toBe('Fire Warden for Jordan Lee expires 2026-10-15');
  });

  it('overdue tells the client admins the training has EXPIRED', async () => {
    db.tables.platform_events.push(reminder('overdue'));
    await processEvents(db.client, { rules: RULES });
    const n = db.tables.notifications.find((x: any) => x.user_id === 'ca')!;
    expect(n).toMatchObject({ type: 'training_record_expired' });
    expect(n.title).toBe('Fire Warden for Jordan Lee expired on 2026-10-15');
  });

  it('falls back to "an employee" if the employee record cannot be found', async () => {
    db.tables.employee_records = [];
    db.tables.platform_events.push(reminder('due_7'));
    await processEvents(db.client, { rules: RULES });
    const n = db.tables.notifications.find((x: any) => x.user_id === 'ca')!;
    expect(n.title).toBe('Fire Warden for an employee expires 2026-10-15');
  });

  it('a due_0 bucket (not yet expired or in the due_30/due_7 window) raises nothing', async () => {
    db.tables.platform_events.push(reminder('due_0'));
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.notifications).toEqual([]);
  });
});
