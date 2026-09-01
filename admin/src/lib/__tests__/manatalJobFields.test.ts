// What actually reaches Manatal when a role is published.
//
// The fixture is the first real role published through this route —
// requisition 7ae62d7d ("AI & Software Engineers – Remote Opportunities",
// 2026-09-01) — and the assertions are the three things Manatal job
// 4337074 came out WRONG on. Each failed silently: the job was created,
// the route reported success, and Manatal simply took what it was given.

import { describe, expect, it } from 'vitest';
import {
  manatalContractDetails, manatalCurrency, manatalFrequency, manatalHeadcount,
  manatalIsRemote, manatalSalary, parseSalaryRange, splitLocation,
} from '../manatalJobFields';

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

describe('splitLocation', () => {
  it('splits the live role rather than dumping it all in address', () => {
    // Manatal received address:"London, UK", city:"", country:"" and
    // Tom filled the other two in by hand. Every job he creates
    // natively carries city + country, which is what job boards
    // filter on.
    expect(splitLocation('London, UK')).toEqual({
      address: 'London, UK', city: 'London', state: '', country: 'United Kingdom',
    });
  });

  it('recognises the country spellings an operator types', () => {
    for (const s of ['Leeds, UK', 'Leeds, United Kingdom', 'Leeds, England', 'Leeds, GB']) {
      expect(splitLocation(s).country, s).toBe('United Kingdom');
    }
    expect(splitLocation('Dublin, Ireland').country).toBe('Ireland');
    expect(splitLocation('Austin, USA').country).toBe('United States');
  });

  it('keeps the middle segments as state', () => {
    expect(splitLocation('Harlow, Essex, UK')).toEqual({
      address: 'Harlow, Essex, UK', city: 'Harlow', state: 'Essex', country: 'United Kingdom',
    });
  });

  it('never guesses a country it does not recognise', () => {
    // "Cambridge" is a real place in three of the countries listed.
    // Empty is the honest answer; a wrong country is a wrong audience.
    expect(splitLocation('Cambridge')).toEqual({
      address: 'Cambridge', city: 'Cambridge', state: '', country: '',
    });
    expect(splitLocation('Milton Keynes, Bucks').country).toBe('');
  });

  it('does not eat the only segment when it is a country', () => {
    // Consuming "UK" here would leave a job with no city at all.
    expect(splitLocation('UK')).toEqual({
      address: 'UK', city: '', state: '', country: 'United Kingdom',
    });
  });

  it('returns empties for nothing', () => {
    const empty = { address: '', city: '', state: '', country: '' };
    expect(splitLocation(null)).toEqual(empty);
    expect(splitLocation('  ')).toEqual(empty);
    expect(splitLocation(',, ,')).toEqual(empty);
  });
});

describe('manatalFrequency', () => {
  it('reads the live role as hourly', () => {
    // $60-$120 PER HOUR. Defaulting this to 'year' would advertise
    // £60-£120 a year on every job board.
    expect(manatalFrequency('hour')).toBe('hour');
    expect(manatalFrequency('per hour')).toBe('hour');
    expect(manatalFrequency('Hourly')).toBe('hour');
  });

  it('maps the words an operator writes', () => {
    expect(manatalFrequency('annum')).toBe('year');
    expect(manatalFrequency('per annum')).toBe('year');
    expect(manatalFrequency('Yearly')).toBe('year');
    expect(manatalFrequency('PCM')).toBe('month');
    expect(manatalFrequency('day')).toBe('day');
  });

  it('omits rather than defaults on the unknown', () => {
    expect(manatalFrequency('per sprint')).toBeNull();
    expect(manatalFrequency(null)).toBeNull();
    expect(manatalFrequency('')).toBeNull();
  });
});

describe('manatalCurrency', () => {
  it('takes an ISO code in any case', () => {
    expect(manatalCurrency('usd')).toBe('USD');
    expect(manatalCurrency(' GBP ')).toBe('GBP');
  });

  it('refuses anything that is not three letters', () => {
    // Manatal validates this and a bad value fails the whole create,
    // so passing "£" or "pounds" through would block publishing.
    expect(manatalCurrency('£')).toBeNull();
    expect(manatalCurrency('pounds')).toBeNull();
    expect(manatalCurrency('US$')).toBeNull();
    expect(manatalCurrency(null)).toBeNull();
  });
});

describe('manatalHeadcount', () => {
  it('accepts a positive integer, from a number or a form string', () => {
    expect(manatalHeadcount(3)).toBe(3);
    expect(manatalHeadcount('2')).toBe(2);
    expect(manatalHeadcount(2.7)).toBe(2);
  });

  it('treats zero, negatives and junk as unset', () => {
    expect(manatalHeadcount(0)).toBeNull();
    expect(manatalHeadcount(-1)).toBeNull();
    expect(manatalHeadcount('')).toBeNull();
    expect(manatalHeadcount('lots')).toBeNull();
    expect(manatalHeadcount(null)).toBeNull();
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
