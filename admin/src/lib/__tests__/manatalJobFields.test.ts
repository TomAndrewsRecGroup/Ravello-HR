// What actually reaches Manatal when a role is published.
//
// The fixture is the first real role published through this route —
// requisition 7ae62d7d ("AI & Software Engineers – Remote Opportunities",
// 2026-09-01) — and the assertions are the three things Manatal job
// 4337074 came out WRONG on. Each failed silently: the job was created,
// the route reported success, and Manatal simply took what it was given.

import { describe, expect, it } from 'vitest';
import { manatalContractDetails, manatalIsRemote, manatalSalary, parseSalaryRange } from '../manatalJobFields';

/** Verbatim from the requisitions row. */
const LIVE_ROLE = {
  employment_type: 'Contract',
  working_model:   'remote',
  salary_min:      60,
  salary_max:      120,
  salary_range:    null,
};

describe('the role that exposed all three defects', () => {
  it('sends the salary that is actually on the row', () => {
    // Manatal received salary_min: null, salary_max: null, because the
    // route parsed `salary_range` — a column the admin form never writes.
    expect(manatalSalary(LIVE_ROLE)).toEqual({ min: 60, max: 120 });
  });

  it('sends the remote flag for a remote role', () => {
    // Never sent at all. A remote role syndicated to the job boards
    // without the remote flag loses one of the strongest filters a
    // candidate applies.
    expect(manatalIsRemote(LIVE_ROLE.working_model)).toBe(true);
  });

  it('does not turn a Contract role into a full-time one', () => {
    // "Contract" matched nothing in Manatal's enum, so the field was
    // omitted and Manatal defaulted the job to full_time.
    expect(manatalContractDetails(LIVE_ROLE.employment_type)).toBe('contractor');
    expect(manatalContractDetails(LIVE_ROLE.employment_type)).not.toBe('full_time');
  });
});

describe('manatalContractDetails', () => {
  it('maps every option the admin form offers', () => {
    // The form's list and Manatal's enum are disjoint. If this ever
    // returns null for one of these, that role silently becomes
    // full_time in Manatal.
    const FORM_OPTIONS = ['Permanent', 'Fixed-term', 'Contract', 'Interim'];
    for (const option of FORM_OPTIONS) {
      expect(manatalContractDetails(option), `"${option}" mapped to nothing`).not.toBeNull();
    }
    expect(manatalContractDetails('Permanent')).toBe('full_time');
    expect(manatalContractDetails('Fixed-term')).toBe('temporary');
    expect(manatalContractDetails('Contract')).toBe('contractor');
    expect(manatalContractDetails('Interim')).toBe('contractor');
  });

  it('passes through a value that is already a Manatal one', () => {
    expect(manatalContractDetails('full_time')).toBe('full_time');
    expect(manatalContractDetails('Part Time')).toBe('part_time');
  });

  it('returns null for nothing and for the genuinely unknown', () => {
    // null omits the field, which is right: guessing would assert
    // something about the role that nobody said.
    expect(manatalContractDetails(null)).toBeNull();
    expect(manatalContractDetails('')).toBeNull();
    expect(manatalContractDetails('Zero hours-ish')).toBeNull();
  });
});

describe('manatalSalary', () => {
  it('prefers the columns over the free text', () => {
    expect(manatalSalary({ salary_min: 60000, salary_max: 80000, salary_range: '£1-£2' }))
      .toEqual({ min: 60000, max: 80000 });
  });

  it('fills both ends from a one-sided figure', () => {
    expect(manatalSalary({ salary_min: 60000 })).toEqual({ min: 60000, max: 60000 });
    expect(manatalSalary({ salary_max: 80000 })).toEqual({ min: 80000, max: 80000 });
  });

  it('falls back to the free text when there are no columns', () => {
    // The portal's form and anything imported carry only this.
    expect(manatalSalary({ salary_range: '£40k-£60k' })).toEqual({ min: 40000, max: 60000 });
  });

  it('sends nothing rather than a zero', () => {
    expect(manatalSalary({ salary_min: 0, salary_max: 0 })).toEqual({ min: null, max: null });
    expect(manatalSalary({})).toEqual({ min: null, max: null });
  });
});

describe('parseSalaryRange', () => {
  it('reads the shapes an operator actually types', () => {
    expect(parseSalaryRange('£40k-£60k')).toEqual({ min: 40000, max: 60000 });
    expect(parseSalaryRange('40,000 - 60,000')).toEqual({ min: 40000, max: 60000 });
    expect(parseSalaryRange('£55000')).toEqual({ min: 55000, max: 55000 });
  });

  it('gives up cleanly on prose', () => {
    expect(parseSalaryRange('Competitive')).toEqual({ min: null, max: null });
    expect(parseSalaryRange(null)).toEqual({ min: null, max: null });
  });
});

describe('manatalIsRemote', () => {
  it('distinguishes remote, office and hybrid', () => {
    expect(manatalIsRemote('remote')).toBe(true);
    expect(manatalIsRemote('office')).toBe(false);
    // Hybrid is genuinely neither and Manatal has no flag for it, so the
    // field is omitted rather than asserting on-site.
    expect(manatalIsRemote('hybrid')).toBeNull();
    expect(manatalIsRemote(null)).toBeNull();
  });
});
