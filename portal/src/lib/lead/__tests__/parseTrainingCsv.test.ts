import { describe, expect, it } from 'vitest';
import { parseTrainingCsv } from '../parseTrainingCsv';

const employees = [
  { id: 'e1', full_name: 'Jordan Lee', email: 'jordan@example.com' },
  { id: 'e2', full_name: 'Sam Patel', email: null },
  { id: 'e3', full_name: 'Sam Patel', email: 'sam.p@example.com' }, // duplicate name, distinct email
];

describe('parseTrainingCsv', () => {
  it('matches by email in preference to name, and parses ISO dates', () => {
    const csv = 'employee_email,employee_name,course_name,provider,completed_on,expires_on,notes\n' +
      'jordan@example.com,Jordan Lee,Fire Warden,Acme Training,2026-01-10,2027-01-10,Refresher due annually';
    const { matched, unmatched } = parseTrainingCsv(csv, employees);
    expect(unmatched).toEqual([]);
    expect(matched).toEqual([{
      employee_id: 'e1', course_name: 'Fire Warden', provider: 'Acme Training',
      completed_on: '2026-01-10', expires_on: '2027-01-10', notes: 'Refresher due annually',
    }]);
  });

  it('matches by name when no email column is present', () => {
    const csv = 'employee_name,course_name,completed_on\nSam Patel,First Aid,2026-02-01';
    const { matched, unmatched } = parseTrainingCsv(csv, [employees[1]]); // the one with no email
    expect(unmatched).toEqual([]);
    expect(matched[0].employee_id).toBe('e2');
  });

  it('accepts UK dd/mm/yyyy dates and normalises to ISO', () => {
    const csv = 'employee_email,course_name,completed_on,expires_on\njordan@example.com,Manual Handling,05/03/2026,05/03/2027';
    const { matched } = parseTrainingCsv(csv, employees);
    expect(matched[0]).toMatchObject({ completed_on: '2026-03-05', expires_on: '2027-03-05' });
  });

  it('reports an unmatched employee by line number, without crashing the rest of the file', () => {
    const csv = 'employee_email,course_name,completed_on\n' +
      'nobody@example.com,First Aid,2026-01-01\n' +
      'jordan@example.com,Fire Warden,2026-01-02';
    const { matched, unmatched } = parseTrainingCsv(csv, employees);
    expect(unmatched).toEqual([{ line: 2, reason: expect.stringContaining('nobody@example.com') }]);
    expect(matched).toHaveLength(1);
    expect(matched[0].course_name).toBe('Fire Warden');
  });

  it('reports a missing or unrecognised completed_on rather than silently dropping the date', () => {
    const csv = 'employee_email,course_name,completed_on\njordan@example.com,Fire Warden,not-a-date';
    const { matched, unmatched } = parseTrainingCsv(csv, employees);
    expect(matched).toEqual([]);
    expect(unmatched[0].reason).toMatch(/completed_on/);
  });

  it('a header missing a required column reports one error and parses nothing', () => {
    const csv = 'employee_email,provider\njordan@example.com,Acme';
    const { matched, unmatched } = parseTrainingCsv(csv, employees);
    expect(matched).toEqual([]);
    expect(unmatched).toHaveLength(1);
  });

  it('handles a quoted field containing a comma', () => {
    const csv = 'employee_email,course_name,completed_on,notes\njordan@example.com,"Health, Safety and Wellbeing",2026-01-01,"Passed, no resits"';
    const { matched } = parseTrainingCsv(csv, employees);
    expect(matched[0].course_name).toBe('Health, Safety and Wellbeing');
    expect(matched[0].notes).toBe('Passed, no resits');
  });

  it('an empty file produces no matches and no errors', () => {
    expect(parseTrainingCsv('', employees)).toEqual({ matched: [], unmatched: [] });
  });
});
