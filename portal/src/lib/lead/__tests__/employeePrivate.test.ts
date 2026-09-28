import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EMPLOYEE_HR_FIELDS, EMPLOYEE_SAFE_COLUMNS, withPrivate, withoutHrFields, type EmployeePrivate,
} from '../employeePrivate';

// Migration 131: a session may read only the granted employee_records
// columns; the rest come from employee_private_fields(). These tests pin
// the TypeScript lists to the SQL both ways and scan the portal for any
// read that would name a revoked column (a permission error at runtime,
// invisible to tsc).
const root = resolve(__dirname, '../../../../..');
const sql = readFileSync(join(root, 'supabase/migrations/131_employee_records_sensitive_columns.sql'), 'utf8');
const granted = sql.match(/GRANT SELECT \(([\s\S]*?)\) ON public\.employee_records TO authenticated/)![1]
  .split(',').map(c => c.trim()).filter(Boolean);
const fnReturns = sql.match(/employee_private_fields\(p_company uuid, p_ids uuid\[\] DEFAULT NULL\)\s*RETURNS TABLE \(([\s\S]*?)\)\s*LANGUAGE/)![1]
  .split(',').map(c => c.trim().split(/\s+/)[0]);
const SENSITIVE = [...EMPLOYEE_HR_FIELDS, 'leave_token'];

describe('131 grant list', () => {
  it('EMPLOYEE_SAFE_COLUMNS is exactly the granted column list', () => {
    expect(EMPLOYEE_SAFE_COLUMNS.split(',').sort()).toEqual([...granted].sort());
  });

  it('grants no sensitive column', () => {
    for (const c of SENSITIVE) expect(granted).not.toContain(c);
  });

  it('revokes table-level SELECT from anon and authenticated first', () => {
    expect(sql).toMatch(/REVOKE SELECT ON public\.employee_records FROM anon, authenticated;/);
    expect(sql.indexOf('REVOKE SELECT')).toBeLessThan(sql.indexOf('GRANT SELECT ('));
  });

  it('the function returns every sensitive field, gated', () => {
    expect(fnReturns.sort()).toEqual(['hr_visible', 'id', ...SENSITIVE].sort());
    for (const f of EMPLOYEE_HR_FIELDS) expect(sql).toMatch(new RegExp(`CASE WHEN hr THEN e\\.${f} END`));
    expect(sql).toMatch(/CASE WHEN lt THEN e\.leave_token END/);
    expect(sql).toMatch(/hr := public\.is_tps_staff\(\) OR public\.has_capability\(p_company, 'hr\.sensitive\.read'\)/);
    expect(sql).toMatch(/p_company = public\.my_company_id\(\) OR public\.is_tps_staff\(\)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.employee_private_fields\(uuid, uuid\[\]\) FROM PUBLIC, anon;/);
  });

  it('the write guard needs hr.sensitive.write and skips server roles', () => {
    expect(sql).toMatch(/current_user NOT IN \('authenticated', 'anon'\)/);
    expect(sql).toMatch(/has_capability\(NEW\.company_id, 'hr\.sensitive\.write'\)/);
    for (const f of SENSITIVE) expect(sql).toMatch(new RegExp(`NEW\\.${f}\\b`));
  });
});

// Every `.from('employee_records')` read in the portal must name only
// granted columns; `*` and a bare `.select()` return revoked ones.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '__tests__' || n === 'node_modules' ? [] : files(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe('portal reads of employee_records', () => {
  it('never select a revoked column, *, or everything after a write', () => {
    const bad: string[] = [];
    for (const f of files(join(root, 'portal/src'))) {
      const s = readFileSync(f, 'utf8');
      for (const m of s.matchAll(/from\('employee_records'\)/g)) {
        let chunk = s.slice(m.index! + m[0].length, m.index! + m[0].length + 600);
        const stop = [chunk.indexOf('.from('), chunk.indexOf(';\n')].filter(i => i >= 0);
        if (stop.length) chunk = chunk.slice(0, Math.min(...stop));
        for (const sel of chunk.matchAll(/\.select\(\s*(?:'([^']*)'|(EMPLOYEE_SAFE_COLUMNS))?/g)) {
          if (sel[2]) continue;
          const cols = (sel[1] ?? '').split(',').map(c => c.trim().split(':').pop()!.trim()).filter(Boolean);
          const where = `${f.slice(root.length + 1)}: .select(${sel[1] === undefined ? '' : `'${sel[1]}'`})`;
          if (cols.length === 0 || cols.includes('*')) bad.push(where);
          else for (const c of cols) if (!granted.includes(c)) bad.push(`${where} → ${c}`);
        }
      }
      for (const m of s.matchAll(/employee_records(?:!inner)?\s*\(([^)]*)\)/g)) {
        for (const c of m[1].split(',').map(x => x.trim()).filter(x => /^[a-z_]+$/.test(x))) {
          if (!granted.includes(c)) bad.push(`${f.slice(root.length + 1)}: embed → ${c}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('merge helpers', () => {
  const priv = (p: Partial<EmployeePrivate>): Map<string, EmployeePrivate> =>
    new Map([['e1', { id: 'e1', hr_visible: true, leave_token: 't', ...Object.fromEntries(EMPLOYEE_HR_FIELDS.map(f => [f, null])), ...p } as EmployeePrivate]]);

  it('withPrivate merges the gated fields by id', () => {
    const [r] = withPrivate([{ id: 'e1', full_name: 'A' }], priv({ salary: 95000 }));
    expect(r.salary).toBe(95000);
    expect(r.leave_token).toBe('t');
    expect(r.hr_visible).toBe(true);
    expect(r.full_name).toBe('A');
  });

  it('a row the function did not return reads as not visible, all null', () => {
    const [r] = withPrivate([{ id: 'e2' }], priv({ salary: 1 }));
    expect(r.hr_visible).toBe(false);
    expect(r.salary).toBeNull();
    expect(r.leave_token).toBeNull();
  });

  it('withoutHrFields drops every HR field and the leave token, keeps the rest', () => {
    const payload = { full_name: 'A', job_title: 'B', leave_token: 'x',
      ...Object.fromEntries(EMPLOYEE_HR_FIELDS.map(f => [f, 'v'])) };
    expect(Object.keys(withoutHrFields(payload)).sort()).toEqual(['full_name', 'job_title']);
  });
});
