// Pins migration 202 (learning_assignments — real LMS assignment +
// progress tracking, closing the audit-named gap that the e-learning
// marketplace, 006, only ever granted company-wide access with no way
// to assign a specific piece of content to a specific employee or
// track their own completion). The live database is the real check;
// this stops the migration file drifting from what was applied.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/202_learning_assignments.sql'), 'utf8');

describe('learning_assignments (202)', () => {
  it('one assignment per person per piece of content — a re-assignment upserts, never duplicates', () => {
    expect(sql).toMatch(/UNIQUE \(content_id, person_id\)/);
  });

  it('completed_at is tied to status = completed by a table CHECK, not just application code', () => {
    expect(sql).toMatch(/CHECK \(\(status = 'completed'\) = \(completed_at IS NOT NULL\)\)/);
  });

  it('the fill() trigger derives company_id from the person via the shared DEFINER helper, never trusts the caller', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.learning_assignments_fill()');
    const body = sql.slice(start, sql.indexOf('END $$;', start));
    expect(body).toMatch(/derived := public\.workforce_person_company\(NEW\.person_id\)/);
    expect(body).toMatch(/NEW\.company_id := derived/);
  });

  it('the fill() trigger is SECURITY INVOKER — it keys on current_user and a DEFINER version would skip every session rule', () => {
    const header = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.learning_assignments_fill()'),
      sql.indexOf('AS $$', sql.indexOf('CREATE OR REPLACE FUNCTION public.learning_assignments_fill()')),
    );
    expect(header).toMatch(/SECURITY INVOKER/);
    expect(header).not.toMatch(/SECURITY DEFINER/);
  });

  it('organisation, content and person are immutable after creation — a re-point is a new row', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.learning_assignments_fill()');
    const body = sql.slice(start, sql.indexOf('END $$;', start));
    expect(body).toMatch(/organisation, content and person cannot change/);
  });

  it('row_version is forced to OLD + 1 on update, never trusting a caller-sent value', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.learning_assignments_fill()');
    const body = sql.slice(start, sql.indexOf('END $$;', start));
    expect(body).toMatch(/NEW\.row_version := OLD\.row_version \+ 1/);
  });

  it('a non-manager, non-self session may change only their own progress — never due_date/notes/assigned_by', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.learning_assignments_fill()');
    const body = sql.slice(start, sql.indexOf('END $$;', start));
    expect(body).toMatch(/You may only update your own progress/);
    expect(body).toMatch(/NEW\.due_date IS DISTINCT FROM OLD\.due_date/);
  });

  it('three RLS policies: staff, the company manager (training.manage), and the assigned person themselves', () => {
    expect(sql).toMatch(/CREATE POLICY learning_assignments_staff_all/);
    expect(sql).toMatch(/CREATE POLICY learning_assignments_manage[\s\S]*?'training\.manage'/);
    expect(sql).toMatch(/CREATE POLICY learning_assignments_self /);
    expect(sql).toMatch(/CREATE POLICY learning_assignments_self_update/);
  });

  it('applies the write guard — a read-only consultancy grant must not be able to assign learning', () => {
    expect(sql).toMatch(/SELECT public\.apply_write_guard\('public\.learning_assignments'\)/);
  });

  it('audits identifying columns only — never notes', () => {
    const line = sql.match(/CREATE TRIGGER learning_assignments_audit[\s\S]*?audit_row\([^)]*\)/)?.[0] ?? '';
    expect(line).not.toMatch(/'notes'/);
    expect(line).toMatch(/'content_id'/);
    expect(line).toMatch(/'person_id'/);
  });
});
