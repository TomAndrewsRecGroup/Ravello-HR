import { describe, it, expect } from 'vitest';
import { resolveMergeFieldValues, todayDateUK } from '../mergeFieldValues';
import type { MergeFieldDef } from '../types';

describe('resolveMergeFieldValues', () => {
  it('resolves a date-source field to today, formatted in UK style', () => {
    const fields: MergeFieldDef[] = [{ key: 'today_date', label: 'Today', source: 'date' }];
    const { values, missing } = resolveMergeFieldValues(fields, {
      employeeSafe: {}, employeeHr: {}, companyName: 'Acme Ltd', manual: {},
    });
    expect(values.today_date).toBe(todayDateUK());
    expect(missing).toEqual([]); // a date field is never "missing"
  });

  it('resolves a company-source field to the company name', () => {
    const fields: MergeFieldDef[] = [{ key: 'company_name', label: 'Company', source: 'company' }];
    const { values } = resolveMergeFieldValues(fields, {
      employeeSafe: {}, employeeHr: {}, companyName: 'Acme Ltd', manual: {},
    });
    expect(values.company_name).toBe('Acme Ltd');
  });

  it('reads an employee-source field from the safe columns object', () => {
    const fields: MergeFieldDef[] = [{ key: 'job_title', label: 'Job title', source: 'employee', employee_column: 'job_title' }];
    const { values, missing } = resolveMergeFieldValues(fields, {
      employeeSafe: { job_title: 'Engineer' }, employeeHr: {}, companyName: 'Acme', manual: {},
    });
    expect(values.job_title).toBe('Engineer');
    expect(missing).toEqual([]);
  });

  it('falls back to the HR-sensitive object for a column not in the safe object', () => {
    const fields: MergeFieldDef[] = [{ key: 'salary', label: 'Salary', source: 'employee', employee_column: 'salary' }];
    const { values } = resolveMergeFieldValues(fields, {
      employeeSafe: { job_title: 'Engineer' }, employeeHr: { salary: 45000 }, companyName: 'Acme', manual: {},
    });
    expect(values.salary).toBe('45000');
  });

  it('formats an ISO date employee column in UK style', () => {
    const fields: MergeFieldDef[] = [{ key: 'start_date', label: 'Start', source: 'employee', employee_column: 'start_date' }];
    const { values } = resolveMergeFieldValues(fields, {
      employeeSafe: { start_date: '2026-03-15' }, employeeHr: {}, companyName: 'Acme', manual: {},
    });
    expect(values.start_date).toBe('15 March 2026');
  });

  it('leaves a non-date string value unchanged', () => {
    const fields: MergeFieldDef[] = [{ key: 'work_location', label: 'Location', source: 'employee', employee_column: 'work_location' }];
    const { values } = resolveMergeFieldValues(fields, {
      employeeSafe: { work_location: 'Leeds office' }, employeeHr: {}, companyName: 'Acme', manual: {},
    });
    expect(values.work_location).toBe('Leeds office');
  });

  it('resolves a manual field from the typed values and flags it missing when blank', () => {
    const fields: MergeFieldDef[] = [{ key: 'notice_period', label: 'Notice', source: 'manual' }];
    const filled = resolveMergeFieldValues(fields, { employeeSafe: {}, employeeHr: {}, companyName: 'Acme', manual: { notice_period: '4 weeks' } });
    expect(filled.values.notice_period).toBe('4 weeks');
    expect(filled.missing).toEqual([]);

    const blank = resolveMergeFieldValues(fields, { employeeSafe: {}, employeeHr: {}, companyName: 'Acme', manual: {} });
    expect(blank.values.notice_period).toBe('');
    expect(blank.missing).toEqual(['notice_period']);
  });

  it('flags an employee-source field as missing when null on both objects', () => {
    const fields: MergeFieldDef[] = [{ key: 'work_location', label: 'Location', source: 'employee', employee_column: 'work_location' }];
    const { missing } = resolveMergeFieldValues(fields, {
      employeeSafe: { work_location: null }, employeeHr: {}, companyName: 'Acme', manual: {},
    });
    expect(missing).toEqual(['work_location']);
  });

  it('resolves a whole-template field list in one pass, missing only the unfilled ones', () => {
    const fields: MergeFieldDef[] = [
      { key: 'employee_name', label: 'Name', source: 'employee', employee_column: 'full_name' },
      { key: 'company_name', label: 'Company', source: 'company' },
      { key: 'notice_period', label: 'Notice', source: 'manual' },
      { key: 'today_date', label: 'Today', source: 'date' },
    ];
    const { values, missing } = resolveMergeFieldValues(fields, {
      employeeSafe: { full_name: 'Jamie Smith' }, employeeHr: {}, companyName: 'Acme Ltd', manual: {},
    });
    expect(values.employee_name).toBe('Jamie Smith');
    expect(values.company_name).toBe('Acme Ltd');
    expect(missing).toEqual(['notice_period']);
  });
});
