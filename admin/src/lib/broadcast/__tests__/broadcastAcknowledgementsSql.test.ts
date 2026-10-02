import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/206_broadcast_acknowledgements.sql'), 'utf-8');

describe('migration 206: broadcast_acknowledgements', () => {
  it('derives company_id/acknowledged_by/acknowledged_by_name/acknowledged_at from the parent action and the session, never trusting the caller', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.broadcast_acknowledgements_fill\(\)[\s\S]*?\$\$;/)![0];
    expect(fn).toMatch(/NEW\.company_id := v_company/);
    expect(fn).toMatch(/NEW\.acknowledged_by := auth\.uid\(\)/);
    expect(fn).toMatch(/NEW\.acknowledged_by_name := COALESCE/);
    expect(fn).toMatch(/NEW\.acknowledged_at := now\(\)/);
  });

  it('refuses acknowledging an action that was not raised by a broadcast (created_by_admin is not true)', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.broadcast_acknowledgements_fill\(\)[\s\S]*?\$\$;/)![0];
    expect(fn).toMatch(/v_created_by_admin IS NOT TRUE THEN\s*\n\s*RAISE EXCEPTION/);
  });

  it('is append-only: UPDATE/DELETE/TRUNCATE revoked from every session role', () => {
    expect(sql).toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON public\.broadcast_acknowledgements FROM PUBLIC, anon, authenticated/);
  });

  it('has a UNIQUE constraint on (action_id, acknowledged_by) so the same person can never acknowledge the same broadcast twice', () => {
    expect(sql).toMatch(/UNIQUE \(action_id, acknowledged_by\)/);
  });

  it('applies the write guard (the one client-writable table) and enables RLS', () => {
    expect(sql).toMatch(/SELECT public\.apply_write_guard\('public\.broadcast_acknowledgements'\)/);
    expect(sql).toMatch(/ALTER TABLE public\.broadcast_acknowledgements ENABLE ROW LEVEL SECURITY/);
  });

  it('the fill function is SECURITY DEFINER with EXECUTE revoked from anon/authenticated', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.broadcast_acknowledgements_fill\(\)[\s\S]*?\$\$;/)![0];
    expect(fn).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.broadcast_acknowledgements_fill\(\) FROM PUBLIC, anon, authenticated/);
  });

  it('client read/insert policies are scoped to the caller\'s own company only, no capability gate (matching plain actions RLS)', () => {
    expect(sql).toMatch(/broadcast_acknowledgements_client_read[\s\S]*?USING \(company_id = \(SELECT public\.my_company_id\(\)\)\)/);
    expect(sql).toMatch(/broadcast_acknowledgements_client_insert[\s\S]*?WITH CHECK \(company_id = \(SELECT public\.my_company_id\(\)\)\)/);
  });
});
