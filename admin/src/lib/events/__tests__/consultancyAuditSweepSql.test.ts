// Pins migration 172 (Core-OS 360 Phase 6, Group 7: Events and Audit
// sweep). The live database is the real check (rolled back, verified
// 2026-09-29: trigger exists; insert/update/delete each produce the
// correct client_roadmap.<verb> audit_events row; description is
// excluded from the whitelist; organisation_id matches company_id);
// this stops the migration file drifting from what was applied.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/172_consultancy_audit_sweep.sql'), 'utf8');

describe('Consultancy audit sweep (172)', () => {
  it('adds an audit_row trigger to milestones producing client_roadmap.<verb>', () => {
    expect(sql).toMatch(
      /CREATE TRIGGER milestones_audit AFTER INSERT OR UPDATE OR DELETE ON public\.milestones\s+FOR EACH ROW EXECUTE FUNCTION public\.audit_row\(/,
    );
    expect(sql).toMatch(/'client_roadmap', 'company_id',/);
  });

  it('never whitelists the free-text description column', () => {
    expect(sql).not.toMatch(/'description'/);
  });

  it('whitelists the identifying/classifying columns the spec cares about', () => {
    for (const col of ["'pillar'", "'title'", "'owner'", "'due_date'", "'status'", "'quarter'"]) {
      expect(sql, col).toContain(col);
    }
  });
});
