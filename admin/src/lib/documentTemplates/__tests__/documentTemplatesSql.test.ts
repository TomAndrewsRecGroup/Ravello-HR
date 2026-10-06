// Pins migration 213 (contract/policy template library with native
// e-signing — Part 2 of the Peninsula-style gap-closure programme).
// The live database is the real check (supabase/probes/
// 213_document_templates_signing.sql, 6/6 pass, including the
// sibling-race CHECK 2b); this stops the migration file drifting from
// what was actually applied.
//
// A real bug was caught by the probe's own FIRST run, before this
// migration shipped: document_templates_supersede_roll()'s WHERE
// clause matched only a sibling sharing the same supersedes_id, never
// the PARENT row itself. Test 5 below pins the fixed WHERE clause
// (both halves) so this cannot silently regress.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/213_document_templates_signing.sql'), 'utf8');

describe('document_templates / document_instances / document_signature_tokens (213)', () => {
  it('enables RLS on all three tables', () => {
    for (const t of ['document_templates', 'document_instances', 'document_signature_tokens']) {
      expect(sql, t).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`));
    }
  });

  it('document_templates: staff FOR ALL + a client SELECT restricted to active rows and super-users only', () => {
    expect(sql).toMatch(/CREATE POLICY document_templates_staff_all ON public\.document_templates\s+FOR ALL TO authenticated\s+USING \(\(SELECT public\.is_tps_staff\(\)\)\)/);
    expect(sql).toMatch(/CREATE POLICY document_templates_client_read ON public\.document_templates\s+FOR SELECT TO authenticated\s+USING \(status = 'active' AND \(SELECT public\.is_company_super_user\(\)\)\)/);
  });

  it('document_templates has NO apply_write_guard() call — a staff-only-write reference table needs none (the jd_templates precedent)', () => {
    expect(sql).not.toMatch(/apply_write_guard\('public\.document_templates'\)/);
  });

  it('document_instances: every client policy is scoped by company_id = my_company_id() AND is_company_super_user()', () => {
    for (const policy of ['document_instances_client_select', 'document_instances_client_insert', 'document_instances_client_update']) {
      const re = new RegExp(`CREATE POLICY ${policy} ON public\\.document_instances[\\s\\S]*?company_id = \\(SELECT public\\.my_company_id\\(\\)\\) AND \\(SELECT public\\.is_company_super_user\\(\\)\\)`);
      expect(sql, policy).toMatch(re);
    }
  });

  it('document_instances has NO client DELETE policy — voiding is a status change, never a row deletion', () => {
    expect(sql).not.toMatch(/document_instances_client_delete/);
    expect(sql).not.toMatch(/FOR DELETE TO authenticated[\s\S]{0,50}document_instances/);
  });

  it('document_instances calls apply_write_guard() — it is client-writable, unlike document_templates', () => {
    expect(sql).toMatch(/SELECT public\.apply_write_guard\('public\.document_instances'\)/);
  });

  it('document_signature_tokens has RLS on, zero policies, and REVOKE ALL from PUBLIC/anon/authenticated — the policy_ack_tokens (103) shape', () => {
    expect(sql).not.toMatch(/CREATE POLICY \w+ ON public\.document_signature_tokens/);
    expect(sql).toMatch(/REVOKE ALL ON public\.document_signature_tokens FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/token_hash\s+text PRIMARY KEY CHECK \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  });

  it('the employee_id cross-organisation guard calls assert_same_org against employee_records', () => {
    const guardFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.document_instances_guard()'));
    expect(guardFn).toMatch(/PERFORM public\.assert_same_org\(NEW\.company_id, 'employee_records', NEW\.employee_id\)/);
  });

  it('the supersede-roll trigger matches BOTH the named parent AND any sibling sharing the same supersedes_id (the sibling-race fix)', () => {
    const fn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.document_templates_supersede_roll()'),
      sql.indexOf('REVOKE ALL ON FUNCTION public.document_templates_supersede_roll()'),
    );
    expect(fn).toMatch(/WHERE \(id = NEW\.supersedes_id OR supersedes_id = NEW\.supersedes_id\)/);
    expect(fn).toMatch(/AND id <> NEW\.id/);
    expect(fn).toMatch(/AND status = 'active'/);
  });

  it('both new SECURITY DEFINER functions are revoked from PUBLIC, anon and authenticated', () => {
    for (const fn of ['document_templates_supersede_roll', 'document_instances_guard']) {
      expect(sql, fn).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(\\)[\\s\\S]*?SECURITY DEFINER`));
      expect(sql, fn).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(\\) FROM PUBLIC, anon, authenticated`));
    }
  });

  it('the outbox whitelist for document_instances carries only status/category/template_id/employee_id — never rendered_body, merge_values, signed_by_name or declined_reason', () => {
    const trig = sql.match(/CREATE TRIGGER document_instances_platform_event AFTER[\s\S]*?EXECUTE FUNCTION public\.platform_event_row\(([^)]*)\)/);
    expect(trig).not.toBeNull();
    const cols = trig![1].split(',').map(c => c.trim().replace(/^'|'$/g, ''));
    expect(cols.sort()).toEqual(['category', 'employee_id', 'status', 'template_id']);
    for (const forbidden of ['rendered_body', 'rendered_title', 'merge_values', 'signed_by_name', 'signed_ip', 'declined_reason']) {
      expect(cols).not.toContain(forbidden);
    }
  });

  it('body/rendered_body are length-capped — never an unbounded text column', () => {
    expect(sql).toMatch(/body\s+text NOT NULL CHECK \(length\(body\) <= 50000\)/);
    expect(sql).toMatch(/rendered_body\s+text NOT NULL CHECK \(length\(rendered_body\) <= 50000\)/);
  });

  it('document_templates/document_instances reuse the shared doc_category enum — never a parallel vocabulary', () => {
    expect(sql).toMatch(/category\s+doc_category NOT NULL DEFAULT 'contract'/);
    expect(sql).toMatch(/category\s+doc_category NOT NULL,/);
  });
});
