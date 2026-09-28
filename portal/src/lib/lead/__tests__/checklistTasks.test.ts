import { describe, expect, it } from 'vitest';
import { addDaysIso, buildTaskRows } from '../checklistTasks';

// Task rows from a template: due = anchor + offset in calendar days
// (UTC, so a BST anchor cannot shift a date), assigned_to copied and
// trimmed, order by sort_order then re-numbered.

describe('addDaysIso', () => {
  it('is calendar arithmetic across month ends, years and the DST switch', () => {
    expect(addDaysIso('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2026-03-28', 3)).toBe('2026-03-31');   // clocks go forward on the 29th
    expect(addDaysIso('2026-10-05', -2)).toBe('2026-10-03');
    expect(addDaysIso('2026-10-05T14:00:00Z', 0)).toBe('2026-10-05');
  });
});

describe('buildTaskRows', () => {
  it('dates each task from the anchor, copies the assignee, orders by sort_order', () => {
    const rows = buildTaskRows('inst-1', '2026-10-05', [
      { title: 'Laptop', description: 'Order it', category: 'it_access', due_day_offset: -2, assigned_to: ' IT ', sort_order: 2 },
      { title: 'Welcome', due_day_offset: 0, sort_order: 1 },
      { title: 'Objectives', due_day_offset: 14, assigned_to: '', sort_order: 3, category: null },
    ]);
    expect(rows).toEqual([
      { instance_id: 'inst-1', task_title: 'Welcome',    task_description: null,       category: 'general',   due_date: '2026-10-05', assigned_to: null, sort_order: 0, status: 'pending' },
      { instance_id: 'inst-1', task_title: 'Laptop',     task_description: 'Order it', category: 'it_access', due_date: '2026-10-03', assigned_to: 'IT', sort_order: 1, status: 'pending' },
      { instance_id: 'inst-1', task_title: 'Objectives', task_description: null,       category: 'general',   due_date: '2026-10-19', assigned_to: null, sort_order: 2, status: 'pending' },
    ]);
  });
  it('copies a deployment gate (134), and sends no gate columns for an ungated task', () => {
    const rows = buildTaskRows('i', '2026-10-05', [
      { title: 'Site induction', gate: 'before_unsupervised', sort_order: 1 },
      { title: 'Manual handling', gate: 'within_days', gate_days: 14, sort_order: 2 },
      { title: 'Welcome', gate: 'none', sort_order: 3 },
      { title: 'Laptop', sort_order: 4 },
    ]);
    expect(rows.map(r => [r.task_title, r.gate, r.gate_days])).toEqual([
      ['Site induction', 'before_unsupervised', null], ['Manual handling', 'within_days', 14],
      ['Welcome', undefined, undefined], ['Laptop', undefined, undefined],
    ]);
    // offboarding_task_progress has no gate columns: an ungated row must not carry the keys at all
    expect('gate' in rows[2]).toBe(false);
    expect('gate_days' in rows[3]).toBe(false);
  });
  it('an empty template gives no rows', () => {
    expect(buildTaskRows('i', '2026-10-05', [])).toEqual([]);
  });
});
