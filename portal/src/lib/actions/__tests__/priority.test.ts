import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { groupActionsByPriority } from '../priority';
import { ACTION_PRIORITIES, ACTION_PRIORITY_LABELS, ACTION_STATUSES } from '@/lib/ui/statusMaps';

// Broadcast wrote priority 'normal'; the Actions page grouped high /
// medium / low. Every broadcast action was silently invisible.

const sql097 = readFileSync(resolve(__dirname, '../../../../../supabase/migrations/097_vocab_checks.sql'), 'utf8');

describe('action priority vocabulary', () => {
  it('the grouping shows every priority the database can hold', () => {
    const actions = ACTION_PRIORITIES.map(priority => ({ id: priority, priority }));
    const groups = groupActionsByPriority(actions);
    const shown = groups.flatMap(g => g.actions.map(a => a.id)).sort();
    expect(shown).toEqual([...ACTION_PRIORITIES].sort());
    expect(groups.map(g => g.priority)).toEqual(['urgent', 'high', 'normal', 'low']);
  });
  it('an unknown value is still shown (in the last group), never dropped', () => {
    const groups = groupActionsByPriority([{ id: 'x', priority: 'medium' }]);
    expect(groups.flatMap(g => g.actions)).toHaveLength(1);
  });
  it('labels cover the tuple exactly', () => {
    expect(Object.keys(ACTION_PRIORITY_LABELS).sort()).toEqual([...ACTION_PRIORITIES].sort());
  });
  it('097 CHECKs equal the tuples', () => {
    const p = /CHECK \(priority IN \(([^)]+)\)\)/.exec(sql097)![1].split(',').map(s => s.trim().replace(/'/g, '')).sort();
    expect(p).toEqual([...ACTION_PRIORITIES].sort());
    const st = /actions_status_check\s+CHECK \(status IN \(([^)]+)\)\)/.exec(sql097)![1].split(',').map(s => s.trim().replace(/'/g, '')).sort();
    expect(st).toEqual([...ACTION_STATUSES].sort());
  });
  it('no page still groups on the old medium value', () => {
    const page = readFileSync(resolve(__dirname, '../../../app/(portal)/protect/actions/page.tsx'), 'utf8');
    expect(page).not.toMatch(/=== 'medium'/);
    expect(page).toMatch(/groupActionsByPriority/);
  });
});
