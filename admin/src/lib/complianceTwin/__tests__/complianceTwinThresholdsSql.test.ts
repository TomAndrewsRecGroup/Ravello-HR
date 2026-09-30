// Pins migration 189 (Core-OS 360 Completion Programme, Phase 23,
// Group 5: configurable Digital Twin thresholds, closing gap-ledger
// row C12.5). The live database is the real check
// (supabase/probes/189_compliance_twin_thresholds.sql, all 7 checks
// pass — including a real cross-session read/write refusal a
// text-only test cannot exercise); this stops the migration file
// drifting from what was applied and pins the properties a text scan
// CAN verify.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/189_compliance_twin_thresholds.sql'), 'utf8');

describe('compliance_twin_thresholds (189)', () => {
  it('has company_id UNIQUE — one override row per company', () => {
    expect(sql).toMatch(/company_id\s+uuid NOT NULL UNIQUE REFERENCES public\.companies/);
  });

  it('every one of the five threshold columns is nullable numeric — null means "use the documented default"', () => {
    for (const col of [
      'audit_score_low_threshold', 'evidence_red_threshold', 'evidence_amber_threshold',
      'objectives_on_track_amber_threshold', 'waste_non_conformance_amber_threshold',
    ]) {
      const re = new RegExp(`${col}\\s+numeric,`);
      expect(sql, col).toMatch(re);
    }
  });

  it('RLS is enabled and gated staff-only — a client never gets a write path to loosen their own thresholds', () => {
    expect(sql).toMatch(/ALTER TABLE public\.compliance_twin_thresholds ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/CREATE POLICY compliance_twin_thresholds_staff_all ON public\.compliance_twin_thresholds FOR ALL TO authenticated\s*\n\s*USING \(\(SELECT public\.is_tps_staff\(\)\)\) WITH CHECK \(\(SELECT public\.is_tps_staff\(\)\)\)/);
  });

  it('never adds a client-facing policy of any kind', () => {
    expect(sql.match(/CREATE POLICY/g)).toHaveLength(1);
    expect(sql).not.toMatch(/consultancy\.service_manage/);
  });

  it('the audit trail whitelists exactly the five threshold columns, never a free-text field (this table has none)', () => {
    expect(sql).toMatch(
      /EXECUTE FUNCTION public\.audit_row\(\s*'compliance_twin_threshold', 'company_id',\s*'audit_score_low_threshold', 'evidence_red_threshold', 'evidence_amber_threshold',\s*'objectives_on_track_amber_threshold', 'waste_non_conformance_amber_threshold'\s*\)/,
    );
  });
});
