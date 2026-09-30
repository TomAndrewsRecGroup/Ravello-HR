// Pins migration 188 (Core-OS 360 Completion Programme, Phase 23,
// Group 4: stored Digital Twin snapshot / history, closing gap-ledger
// row C12.4). The live database is the real check
// (supabase/probes/188_compliance_twin_snapshots.sql, all 6 checks
// pass — including a real cross-session read/write round trip a
// text-only test cannot exercise); this stops the migration file
// drifting from what was applied and pins the properties a text scan
// CAN verify.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/188_compliance_twin_snapshots.sql'), 'utf8');

describe('compliance_twin_snapshots (188)', () => {
  it('has a UNIQUE(company_id, snapshot_date) so a same-day re-save upserts rather than duplicating', () => {
    expect(sql).toMatch(/UNIQUE \(company_id, snapshot_date\)/);
  });

  it('overall_band is constrained to the three real band values', () => {
    expect(sql).toMatch(/overall_band\s+text NOT NULL CHECK \(overall_band IN \('red', 'amber', 'green'\)\)/);
  });

  it('RLS is enabled and gated staff-only, the management_review_data_pack (161) precedent — never my_company_id()', () => {
    expect(sql).toMatch(/ALTER TABLE public\.compliance_twin_snapshots ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/CREATE POLICY compliance_twin_snapshots_staff_all ON public\.compliance_twin_snapshots FOR ALL TO authenticated\s*\n\s*USING \(\(SELECT public\.is_tps_staff\(\)\)\) WITH CHECK \(\(SELECT public\.is_tps_staff\(\)\)\)/);
    expect(sql).not.toMatch(/my_company_id\(\)/);
  });

  it('never adds a client-readable policy — no consultancy.service_manage grant, matching the staff-only-internal-artefact posture', () => {
    expect(sql).not.toMatch(/consultancy\.service_manage/);
    expect(sql.match(/CREATE POLICY/g)).toHaveLength(1);
  });

  it('carries an audit trail, but never whitelists the areas jsonb blob itself', () => {
    expect(sql).toMatch(/EXECUTE FUNCTION public\.audit_row\('compliance_twin_snapshot', 'company_id', 'overall_band', 'snapshot_date'\)/);
    expect(sql).not.toMatch(/audit_row\([^)]*'areas'/);
  });

  it('adds no apply_write_guard() call — a staff-only table has no client write path to guard, the 158 precedent', () => {
    expect(sql).not.toMatch(/SELECT public\.apply_write_guard/);
  });
});
