import { describe, expect, it } from 'vitest';
import { fakeSupabase } from '@/lib/events/__tests__/fakeSupabase';
import { sweepSlaBreaches } from '../slaSweep';

// One breach event per open, unanswered, overdue request per day;
// answered, closed and not-yet-due requests emit nothing.

const now = new Date('2026-09-25T10:00:00Z');

describe('sweepSlaBreaches', () => {
  it('emits once per request per day, keyed, for the unanswered and overdue only', async () => {
    const db = fakeSupabase({
      service_requests: [
        { id: 'a', company_id: 'co-1', subject: 'Late', request_type: 'hr_audit', urgency: 'Urgent', status: 'new', sla_due_at: '2026-09-25T08:00:00Z', first_response_at: null, created_at: '2026-09-25T04:00:00Z' },
        { id: 'b', company_id: 'co-1', subject: 'Answered', request_type: 'hr_audit', urgency: 'Urgent', status: 'in_progress', sla_due_at: '2026-09-25T08:00:00Z', first_response_at: '2026-09-25T07:00:00Z', created_at: '2026-09-25T04:00:00Z' },
        { id: 'c', company_id: 'co-1', subject: 'Closed', request_type: 'hr_audit', urgency: 'Urgent', status: 'complete', sla_due_at: '2026-09-25T08:00:00Z', first_response_at: null, created_at: '2026-09-25T04:00:00Z' },
        { id: 'd', company_id: 'co-1', subject: 'Not yet', request_type: 'hr_audit', urgency: 'Normal', status: 'new', sla_due_at: '2026-09-28T04:00:00Z', first_response_at: null, created_at: '2026-09-25T04:00:00Z' },
      ],
      platform_events: [],
    }, { now: () => now });
    const t1 = await sweepSlaBreaches(db.client, now);
    expect(t1).toEqual({ open_breached: 1, emitted: 1, error: null });
    expect(db.tables.platform_events).toHaveLength(1);
    expect(db.tables.platform_events[0]).toMatchObject({ entity_type: 'service_requests', entity_id: 'a', event_type: 'reminder', company_id: 'co-1', dedupe_key: 'sla:a:2026-09-25' });
    expect(db.tables.platform_events[0].payload).toMatchObject({ bucket: 'sla_breached', row: { subject: 'Late', urgency: 'Urgent' } });
    expect(JSON.stringify(db.tables.platform_events[0].payload)).not.toMatch(/details/);

    // the same day again: nothing new; the next day: one more
    const t2 = await sweepSlaBreaches(db.client, new Date('2026-09-25T18:00:00Z'));
    expect(t2).toEqual({ open_breached: 1, emitted: 0, error: null });
    const t3 = await sweepSlaBreaches(db.client, new Date('2026-09-26T06:00:00Z'));
    expect(t3.emitted).toBe(1);
    expect(db.tables.platform_events.map(e => e.dedupe_key)).toEqual(['sla:a:2026-09-25', 'sla:a:2026-09-26']);
  });
});
