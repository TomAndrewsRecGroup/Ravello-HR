// Pins migration 214 (the four seeded starter example
// document_templates — Part 2, Group 2 of the Peninsula-style
// gap-closure programme). The user's own recorded decision: "a few
// clearly-marked starter examples", not empty and not a large vetted
// catalogue.
//
// A real inconsistency was caught live, before this migration shipped
// (not by this test — the test exists BECAUSE of what the live check
// found): the Disciplinary letter's seeded `merge_fields` declared a
// `job_title` entry the body never actually references. Fixed live
// and in this file. This test uses the shared `extractMergeFieldKeys()`
// helper (the exact function the generate-document flow, a later
// group, will use to validate ANY template, not just the seeded ones)
// to pin every seeded template's body placeholders against its own
// declared merge_fields — in BOTH directions, so a future edit to
// either the body or merge_fields of a seed row cannot silently drift
// from the other again.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractMergeFieldKeys, type MergeFieldDef } from '../types';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/214_document_templates_seed_examples.sql'), 'utf8');

// Extracts each (title, body, merge_fields-json) tuple from the raw
// migration SQL — a plain string scan, not a SQL parser, matching the
// established SQL-shape-test convention throughout this codebase.
function parseSeedRows(text: string): { title: string; body: string; mergeFields: MergeFieldDef[] }[] {
  const rows: { title: string; body: string; mergeFields: MergeFieldDef[] }[] = [];
  const titleRe = /^\s*'([^']+)',\n\s*'(contract|letter|policy|handbook|report|other)',/gm;
  let m: RegExpExecArray | null;
  while ((m = titleRe.exec(text))) {
    const title = m[1];
    const afterTitle = text.slice(m.index);
    const bodyMatch = afterTitle.match(/\$tpl\$([\s\S]*?)\$tpl\$/);
    if (!bodyMatch) continue;
    const body = bodyMatch[1];
    const afterBody = afterTitle.slice(afterTitle.indexOf(bodyMatch[0]) + bodyMatch[0].length);
    const fieldsMatch = afterBody.match(/'(\[[\s\S]*?\])'::jsonb/);
    if (!fieldsMatch) continue;
    const mergeFields = JSON.parse(fieldsMatch[1].replace(/''/g, "'")) as MergeFieldDef[];
    rows.push({ title, body, mergeFields });
  }
  return rows;
}

const rows = parseSeedRows(sql);

describe('document_templates seed examples (214)', () => {
  it('seeds exactly four starter templates, each is_example = true and status = active', () => {
    expect(rows.map(r => r.title).sort()).toEqual([
      'Disciplinary Hearing Invitation Letter',
      'Employment Contract',
      'Settlement Agreement (Shell)',
      'Written Statement of Particulars',
    ]);
    // is_example/status are positional literals in each VALUES tuple —
    // pinned as a plain count rather than per-row, since every row in
    // this migration is a starter example by construction.
    expect([...sql.matchAll(/true, true, 'active'\s*\)/g)]).toHaveLength(3);
    expect([...sql.matchAll(/false, true, 'active'\s*\)/g)]).toHaveLength(1);
  });

  it.each(rows.map(r => [r.title, r] as const))('%s: every body placeholder has a declared merge field, and every declared field is actually used', (_title, row) => {
    const bodyKeys = new Set(extractMergeFieldKeys(row.body));
    const declaredKeys = new Set(row.mergeFields.map(f => f.key));
    for (const k of bodyKeys) expect(declaredKeys, `body uses {{${k}}} but it is not declared`).toContain(k);
    for (const k of declaredKeys) expect(bodyKeys, `merge_fields declares "${k}" but the body never uses it`).toContain(k);
  });

  it('every declared merge field has a real source and, for an employee-sourced field, a real employee_records column', () => {
    const EMPLOYEE_SAFE = ['job_title', 'start_date', 'work_location', 'contract_hours', 'annual_leave_allowance', 'full_name'];
    const EMPLOYEE_HR = ['salary', 'salary_currency', 'pay_frequency'];
    for (const row of rows) {
      for (const f of row.mergeFields) {
        expect(['employee', 'company', 'date', 'manual']).toContain(f.source);
        if (f.source === 'employee') {
          expect(f.employee_column, `${row.title}.${f.key} has source=employee but no employee_column`).toBeTruthy();
          expect([...EMPLOYEE_SAFE, ...EMPLOYEE_HR]).toContain(f.employee_column);
        }
      }
    }
  });

  it('the Settlement Agreement shell carries the real ERA 1996 s.203 independent-advice requirement, never baked as a disclaimer about being an example', () => {
    const row = rows.find(r => r.title === 'Settlement Agreement (Shell)')!;
    expect(row.body).toMatch(/section 203 of the Employment Rights Act 1996/);
    expect(row.body).not.toMatch(/must be reviewed by a qualified advisor/i);
    expect(row.body).not.toMatch(/example/i);
  });

  it('no seeded body contains an "is just an example" disclaimer — that lives only in description/is_example, never in rendered content', () => {
    for (const row of rows) {
      expect(row.body, row.title).not.toMatch(/example content/i);
      expect(row.body, row.title).not.toMatch(/must be reviewed/i);
    }
  });
});
