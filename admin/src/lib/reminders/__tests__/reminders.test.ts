import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fakeSupabase } from '@/lib/events/__tests__/fakeSupabase';
import { REMINDERS, STATUS_WRITES, addDays, bucketFor, wanted } from '../rules';
import { runReminders } from '../run';

// The reminders cron is the only thing that ever sets `overdue`. These
// pin the bucket arithmetic, the filters behind the status writes, and
// that every due column a rule reads actually exists in a migration.

const MIG = resolve(__dirname, '../../../../../supabase/migrations');
const allSql = readdirSync(MIG).filter(f => f.endsWith('.sql')).map(f => readFileSync(`${MIG}/${f}`, 'utf8')).join('\n');

describe('bucketFor', () => {
  const today = '2026-09-25';
  it.each([
    ['2026-11-01', null], ['2026-10-25', 'due_30'], ['2026-10-03', 'due_30'], ['2026-10-02', 'due_7'], ['2026-09-26', 'due_7'],
    ['2026-09-25', 'due_0'], ['2026-09-24', 'overdue'], ['2026-09-19', 'overdue'], ['2026-09-18', 'overdue_w1'], ['2026-09-04', 'overdue_w3'],
  ])('%s → %s', (due, want) => {
    expect(bucketFor(due, today)).toBe(want);
  });
  it('overdue_weekly matches any overdue_w<n>, and nothing else', () => {
    expect(wanted('overdue_w4', ['overdue_weekly'])).toBe(true);
    expect(wanted('overdue', ['overdue_weekly'])).toBe(false);
    expect(wanted('due_7', ['due_7'])).toBe(true);
  });
  it('addDays is calendar arithmetic in UTC', () => {
    expect(addDays('2026-09-25', 14)).toBe('2026-10-09');
    expect(addDays('2026-09-25T13:00:00Z', -14)).toBe('2026-09-11');
  });
});

describe('REMINDERS', () => {
  it('every rule names an existing column set', () => {
    const cols = new Set([
      ...[...allSql.matchAll(/^\s+(\w+)\s+(TEXT|DATE|TIMESTAMPTZ|UUID|BOOLEAN|INTEGER|NUMERIC|date|text|timestamptz|uuid|boolean|integer|compliance_status|employment_status)\b/gmi)].map(m => m[1]),
      ...[...allSql.matchAll(/ADD COLUMN(?: IF NOT EXISTS)?\s+(\w+)/gi)].map(m => m[1]),
    ]);
    expect(cols.size).toBeGreaterThan(50);
    for (const r of REMINDERS) {
      for (const c of r.select.split(',').map(s => s.trim()).filter(s => !s.includes(':') && s !== 'id')) {
        expect(cols.has(c), `${r.id} selects ${c}`).toBe(true);
      }
    }
  });
});

describe('runReminders', () => {
  const today = '2026-09-25';

  it('emits one reminder event per row per bucket, deduped, with the company and a slim payload', async () => {
    const db = fakeSupabase({
      compliance_items: [
        { id: 'ci-1', company_id: 'co-1', title: 'Fire alarm test', domain: 'hs', category: 'hs_fire', due_date: '2026-09-20', status: 'pending', provider_id: null, notes: 'SECRET' },
        { id: 'ci-2', company_id: 'co-1', title: 'Far away', domain: 'hs', category: 'hs_fire', due_date: '2027-01-01', status: 'pending', provider_id: null },
        { id: 'ci-3', company_id: 'co-1', title: 'Done', domain: 'hs', category: 'hs_fire', due_date: '2026-09-01', status: 'complete', provider_id: null },
      ],
      platform_events: [],
    });
    const only = REMINDERS.filter(r => r.id === 'compliance_items');
    const t1 = await runReminders(db.client, { today, rules: only, statusWrites: [] });
    expect(t1.events_new).toBe(1);
    const e = db.tables.platform_events[0];
    expect(e).toMatchObject({ entity_type: 'compliance_items', event_type: 'reminder', company_id: 'co-1', dedupe_key: 'reminder:compliance_items:ci-1:overdue', actor_kind: 'system' });
    expect(e.payload.bucket).toBe('overdue');
    expect(e.payload.row.notes).toBeUndefined();
    const t2 = await runReminders(db.client, { today, rules: only, statusWrites: [] });
    expect(t2.events_new).toBe(0);
    expect(db.tables.platform_events).toHaveLength(1);
    // a week later the same row gets its weekly nag, once
    const t3 = await runReminders(db.client, { today: '2026-10-02', rules: only, statusWrites: [] });
    expect(t3.events_new).toBe(1);
    expect(db.tables.platform_events[1].dedupe_key).toBe('reminder:compliance_items:ci-1:overdue_w1');
  });

  it('checklist tasks take their company from the instance', async () => {
    const db = fakeSupabase({
      onboarding_task_progress: [{ id: 't1', instance_id: 'i1', task_title: 'Laptop', due_date: today, status: 'pending', instance: { company_id: 'co-9' } }],
      platform_events: [],
    });
    await runReminders(db.client, { today, rules: REMINDERS.filter(r => r.id === 'onboarding_task_progress'), statusWrites: [] });
    expect(db.tables.platform_events[0]).toMatchObject({ company_id: 'co-9', entity_id: 't1' });
    expect(db.tables.platform_events[0].payload.row.instance).toBeUndefined();
  });

  it('status writes set overdue only for rows past their date and still open', async () => {
    const db = fakeSupabase({
      compliance_items: [
        { id: 'a', due_date: '2026-09-24', status: 'pending' },
        { id: 'b', due_date: '2026-09-25', status: 'pending' },   // due today is NOT overdue
        { id: 'c', due_date: '2026-09-01', status: 'complete' },
        { id: 'd', due_date: '2026-09-01', status: 'in_review' },
      ],
      employee_documents: [{ id: 'e', expiry_date: '2026-09-01', status: 'active' }, { id: 'f', expiry_date: '2026-09-01', status: 'archived' }],
      policy_acknowledgements: [{ id: 'p', status: 'pending', sent_at: '2026-09-01T00:00:00Z' }, { id: 'q', status: 'pending', sent_at: '2026-09-20T00:00:00Z' }],
      platform_events: [],
    });
    const t = await runReminders(db.client, { today, rules: [], statusWrites: STATUS_WRITES });
    expect(t.status_writes).toEqual({ compliance_overdue: 2, employee_document_expired: 1, policy_ack_overdue: 1 });
    expect(db.tables.compliance_items.map(r => r.status)).toEqual(['overdue', 'pending', 'complete', 'overdue']);
    expect(db.tables.employee_documents.map(r => r.status)).toEqual(['expired', 'archived']);
    expect(db.tables.policy_acknowledgements.map(r => [r.status, r.reminder_sent ?? false])).toEqual([['overdue', true], ['pending', false]]);
  });
});
