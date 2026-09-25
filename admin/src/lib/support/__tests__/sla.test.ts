import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SLA_HOURS, normaliseUrgency, slaDueAt, slaHoursLeft } from '../sla';

// The TypeScript SLA table and 101's service_request_sla() trigger are
// two copies of one rule; this pins them to each other.

const sql = readFileSync(resolve(__dirname, '../../../../../supabase/migrations/101_support_bd.sql'), 'utf8');
const fn = sql.slice(sql.indexOf('FUNCTION public.service_request_sla'), sql.indexOf('DROP TRIGGER IF EXISTS service_requests_sla'));

describe('service request SLA', () => {
  it('the SQL trigger carries the same hours as SLA_HOURS', () => {
    expect(fn).toMatch(new RegExp(`WHEN 'urgent' THEN interval '${SLA_HOURS.urgent} hours'`));
    expect(fn).toMatch(new RegExp(`WHEN 'high'\\s+THEN interval '${SLA_HOURS.high} hours'`));
    expect(fn).toMatch(new RegExp(`ELSE\\s+interval '${SLA_HOURS.normal} hours'`));
    expect(SLA_HOURS.low).toBe(SLA_HOURS.normal);   // the trigger has no 'low' branch on purpose
    expect(fn).toMatch(/lower\(coalesce\(NEW\.urgency, ''\)\)/);   // 'Urgent' from the portal form counts
    expect(fn).toMatch(/IF NEW\.sla_due_at IS NULL THEN/);         // an explicit value is kept
  });
  it('normalises whatever the form wrote', () => {
    expect(normaliseUrgency('Urgent')).toBe('urgent');
    expect(normaliseUrgency(' HIGH ')).toBe('high');
    expect(normaliseUrgency('Low')).toBe('low');
    expect(normaliseUrgency('Normal')).toBe('normal');
    expect(normaliseUrgency(null)).toBe('normal');
    expect(normaliseUrgency('asap')).toBe('normal');
  });
  it('the clock runs from created_at', () => {
    expect(slaDueAt('2026-09-25T09:00:00Z', 'Urgent').toISOString()).toBe('2026-09-25T13:00:00.000Z');
    expect(slaDueAt('2026-09-25T09:00:00Z', 'high').toISOString()).toBe('2026-09-26T09:00:00.000Z');
    expect(slaDueAt('2026-09-25T09:00:00Z', null).toISOString()).toBe('2026-09-28T09:00:00.000Z');
    expect(slaHoursLeft('2026-09-25T13:00:00Z', new Date('2026-09-25T09:30:00Z'))).toBe(3.5);
    expect(slaHoursLeft('2026-09-25T13:00:00Z', new Date('2026-09-25T15:00:00Z'))).toBe(-2);
    expect(slaHoursLeft(null)).toBeNull();
  });
});
