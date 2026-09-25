// Pins migration 111. training_needs/skills_matrix's LIVE policies (read
// from pg_policies, not their migration history — see CLAUDE.md's
// standing rule that a .sql file on disk is a record of intent, not
// proof of what the database contains) have a FOR ALL "client" policy
// alongside a separate super-user-only DELETE policy — since Postgres
// ORs permissive policies, the ALL policy already lets any company user
// delete, making the narrower one dead. This asserts training_records
// does NOT repeat that: no client policy covers DELETE except the one
// restricted to a company super-user.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/111_training_records.sql'), 'utf8');

function policies(text: string) {
  return [...text.matchAll(/CREATE POLICY (\w+) ON public\.training_records FOR (\w+)[\s\S]*?;/g)]
    .map(m => ({ name: m[1], cmd: m[2] }));
}

describe('training_records (111)', () => {
  it('has RLS on and a staff ALL policy', () => {
    expect(sql).toMatch(/ALTER TABLE public\.training_records ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/CREATE POLICY admin_training_records ON public\.training_records FOR ALL[\s\S]*?is_tps_staff\(\)/);
  });

  it('no client-facing policy grants ALL or DELETE except the super-user-restricted one', () => {
    const pols = policies(sql);
    const clientPolicies = pols.filter(p => p.name.startsWith('client_'));
    expect(clientPolicies.length).toBeGreaterThan(0);
    for (const p of clientPolicies) {
      expect(p.cmd, p.name).not.toBe('ALL');
      expect(p.cmd, p.name).not.toBe('DELETE');
    }
    const deletePolicies = pols.filter(p => p.cmd === 'DELETE');
    expect(deletePolicies.map(p => p.name)).toEqual(['training_records_delete']);
  });

  it('the delete policy requires is_company_super_user()', () => {
    const m = /CREATE POLICY training_records_delete ON public\.training_records FOR DELETE[\s\S]*?;/.exec(sql);
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/is_company_super_user\(\)/);
    expect(m![0]).toMatch(/my_company_id\(\)/);
  });

  it('employee_id links to employee_records, not a free-text name', () => {
    expect(sql).toMatch(/employee_id\s+uuid NOT NULL REFERENCES public\.employee_records\(id\)/);
    expect(sql).not.toMatch(/\bemployee_name\s+text/);
  });

  it('expires_on must be after completed_on when present', () => {
    expect(sql).toMatch(/expires_on IS NULL OR expires_on > completed_on/);
  });
});
