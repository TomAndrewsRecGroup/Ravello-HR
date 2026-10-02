import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/204_requisition_stage_history.sql'), 'utf-8');

describe('migration 204: requisition_stage_history', () => {
  it('creates the table with from_stage nullable and to_stage NOT NULL', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.requisition_stage_history/);
    expect(sql).toMatch(/from_stage\s+text,/);
    expect(sql).toMatch(/to_stage\s+text NOT NULL/);
  });

  it('enables RLS and grants only staff a policy', () => {
    expect(sql).toMatch(/ALTER TABLE public\.requisition_stage_history ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/requisition_stage_history_staff_all[\s\S]*is_tps_staff/);
  });

  it('is insert-only: UPDATE/DELETE/TRUNCATE revoked from every session role', () => {
    expect(sql).toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON public\.requisition_stage_history FROM PUBLIC, anon, authenticated/);
  });

  it('re-creates requisition_stage_stamp() to insert a history row on both INSERT and a real stage change', () => {
    const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.requisition_stage_stamp\(\)[\s\S]*?\$\$;/);
    expect(fnMatch).not.toBeNull();
    const body = fnMatch![0];
    expect(body).toMatch(/INSERT INTO public\.requisition_stage_history[\s\S]*VALUES \(NEW\.id, NEW\.company_id, NULL, NEW\.stage, NEW\.stage_changed_at\)/);
    expect(body).toMatch(/IF NEW\.stage IS DISTINCT FROM OLD\.stage THEN/);
    expect(body).toMatch(/VALUES \(NEW\.id, NEW\.company_id, OLD\.stage, NEW\.stage, NEW\.stage_changed_at\)/);
  });

  it('the backfill inserts exactly one row per requisition with no existing history, never duplicating on re-run', () => {
    expect(sql).toMatch(/WHERE NOT EXISTS \(\s*SELECT 1 FROM public\.requisition_stage_history h WHERE h\.requisition_id = r\.id\s*\)/);
  });
});
