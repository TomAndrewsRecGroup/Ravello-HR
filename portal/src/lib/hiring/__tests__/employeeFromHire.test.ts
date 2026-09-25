import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildEmployeeFromHire, type HireForm } from '../employeeFromHire';

// "Mark as Hired" inserted annual_salary and reporting_manager, two
// columns employee_records never had, so every hire failed at the
// database. The builder's keys are checked against migration 015.

const MIG = resolve(__dirname, '../../../../../supabase/migrations');
const sql = readFileSync(`${MIG}/015_employee_records_leave_calendar.sql`, 'utf8');
const sql099 = readFileSync(`${MIG}/099_lead_flow.sql`, 'utf8');
const table = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS employee_records'), sql.indexOf(');', sql.indexOf('CREATE TABLE IF NOT EXISTS employee_records')));
const columns = new Set([
  ...[...table.matchAll(/^\s+(\w+)\s+(UUID|TEXT|DATE|NUMERIC|INTEGER|BOOLEAN|TIMESTAMPTZ|employment_status)\b/gm)].map(m => m[1]),
  ...[...sql099.matchAll(/ALTER TABLE public\.employee_records ADD COLUMN IF NOT EXISTS (\w+)/g)].map(m => m[1]),
]);

const form: HireForm = {
  companyId: 'co-1', fullName: ' Ada Lovelace ', email: 'ada@example.com', jobTitle: 'Engineer', department: '',
  startDate: '2026-10-01', employmentType: 'full-time', salary: '52000', lineManager: 'Babbage',
};

describe('buildEmployeeFromHire', () => {
  it('writes only columns employee_records has', () => {
    expect(columns.size).toBeGreaterThan(20);
    for (const k of Object.keys(buildEmployeeFromHire(form))) expect(columns.has(k), k).toBe(true);
  });
  it('maps the form to 015 vocabulary', () => {
    expect(buildEmployeeFromHire(form)).toEqual({
      company_id: 'co-1', full_name: 'Ada Lovelace', email: 'ada@example.com', job_title: 'Engineer', department: null,
      start_date: '2026-10-01', employment_type: 'full_time', salary: 52000, line_manager: 'Babbage', status: 'active',
      source_candidate_id: null,
    });
    expect(buildEmployeeFromHire({ ...form, candidateId: 'cand-1' }).source_candidate_id).toBe('cand-1');
  });
  it('refuses a missing start date instead of sending null into a NOT NULL column', () => {
    expect(() => buildEmployeeFromHire({ ...form, startDate: '' })).toThrow(/start date/i);
  });
  it('refuses a non-numeric salary', () => {
    expect(() => buildEmployeeFromHire({ ...form, salary: 'lots' })).toThrow(/number/i);
    expect(buildEmployeeFromHire({ ...form, salary: '' }).salary).toBeNull();
  });
});
