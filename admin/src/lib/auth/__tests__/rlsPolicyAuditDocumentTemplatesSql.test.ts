import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(__dirname, '../../../../../supabase/migrations/216_rls_policy_audit_document_templates.sql'),
  'utf-8',
);

// Found live 2026-10-14, during a production audit: rls_policy_audit()
// (080, re-tuned 198) had gone stale again, false-flagging two things
// migration 213 (document template library + e-signing) added — the
// exact "a new predicate function or a new zero-policy token table
// exists and the audit's own list never learned it" gap 198 itself
// fixed once, for a different migration. This pins the fix the same
// way reportShareTokensSql.test.ts already pins 207's own addition —
// against THIS migration's own text, never the live function, so a
// later re-definition is caught by whichever migration redefines it
// next being the one under test (the "latest definition wins"
// discipline platformEventsSql.test.ts already established).
describe('migration 216: rls_policy_audit() recognises document_templates/document_signature_tokens', () => {
  it('adds document_signature_tokens to the zero-policy-by-design exemption list, alongside the three existing ones', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.rls_policy_audit\(\)[\s\S]*?\$function\$;/)![0];
    expect(fn).toMatch(
      /c\.relname NOT IN \('entity_qr_tokens', 'worker_qr_tokens', 'report_share_tokens', 'document_signature_tokens'\)/,
    );
  });

  it('adds is_company_super_user to the recognised-scoping regex, without removing any existing predicate', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.rls_policy_audit\(\)[\s\S]*?\$function\$;/)![0];
    for (const predicate of [
      'company_id', 'is_tps_staff', 'get_my_role', 'my_company_id',
      'auth\\.uid', 'user_id', 'person_visible', 'is_me\\(', 'is_company_super_user',
    ]) {
      expect(fn.includes(predicate)).toBe(true);
    }
  });

  it('is a plain CREATE OR REPLACE FUNCTION — no DROP, matching this sandbox\'s own known DDL-timeout limitation on DROP statements', () => {
    expect(sql).not.toMatch(/DROP\s+(FUNCTION|TABLE)/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.rls_policy_audit\(\)/);
  });
});
