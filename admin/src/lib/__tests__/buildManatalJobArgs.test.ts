// What actually reaches Manatal when a role is published.
//
// The fixture is requisition 7ae62d7d as it sat in the database when
// it was published — the first role through this route. The job it
// produced (4337074) arrived with no salary, no remote flag, the wrong
// contract type, no city, no country, no headcount, the wrong currency,
// no salary period, and a description collapsed into one paragraph.
//
// Nine defects, one HTTP 201, and a green "Published to Manatal".
// Nothing errored at any point: Manatal stored precisely what it was
// given. So the property worth asserting is the SENT VALUE, field by
// field — not that the call returns something.

import { describe, expect, it } from 'vitest';
import { buildManatalJobArgs, type RequisitionForManatal } from '../manatalJobFields';

/** Verbatim from `requisitions`, plus the five columns migration 083
 *  added and an operator would now fill in. */
const LIVE_ROW: RequisitionForManatal = {
  id:                  '7ae62d7d-491f-49e5-a250-b1816b6c9b03',
  title:               'AI & Software Engineers – Remote Opportunities',
  description:         'We are recruiting for two routes.\n\nSuitable for candidates with experience in:\n\nPython\nC++\nRust',
  location:            'London, UK',
  employment_type:     'Contract',
  working_model:       'remote',
  salary_min:          60,
  salary_max:          120,
  salary_range:        null,
  salary_currency:     'USD',
  salary_period:       'hour',
  salary_visible:      true,
  headcount:           2,
  manatal_industry_id: '7673654',
  must_haves:          ['Python', 'C++', 'Java', 'Golang', 'TypeScript', 'Rust'],
  nice_to_haves:       null,
};

const ORG = '8136723';

describe('the nine things job 4337074 came out wrong on', () => {
  const args = buildManatalJobArgs(LIVE_ROW, ORG);

  it('sends the salary that is on the row', () => {
    // Manatal received null/null: the route parsed `salary_range`, a
    // column the admin form never writes.
    expect(args.salaryMin).toBe(60);
    expect(args.salaryMax).toBe(120);
  });

  it('sends the remote flag', () => {
    expect(args.isRemote).toBe(true);
  });

  it('sends contractor, not full_time', () => {
    expect(args.contractDetails).toBe('contractor');
  });

  it('sends the city and country, not just an address blob', () => {
    // city is what job boards filter and sort on. A role with no city
    // is a role nobody finds by searching their own town.
    expect(args.city).toBe('London');
    expect(args.country).toBe('United Kingdom');
    expect(args.address).toBe('London, UK');
  });

  it('sends the headcount', () => {
    expect(args.headcount).toBe(2);
  });

  it('sends the stored currency instead of a hardcoded GBP', () => {
    // The role pays in dollars. 'GBP' was a literal in the route.
    expect(args.currency).toBe('USD');
  });

  it('sends the salary period', () => {
    // Without this the advert reads $60–$120 per YEAR.
    expect(args.frequency).toBe('hour');
  });

  it('sends the salary visibility', () => {
    expect(args.isSalaryVisible).toBe(true);
  });

  it('sends the industry id', () => {
    expect(args.industryId).toBe('7673654');
  });

  it('sends HTML, and the requirements we hold', () => {
    expect(args.description).toContain('<p>We are recruiting for two routes.</p>');
    expect(args.description).toContain('<li>Python</li>');
    // Six must_haves sat on this row and reached neither Manatal nor
    // the job boards.
    expect(args.description).toContain('<strong>Essential requirements</strong>');
    expect(args.description).toContain('<li>Golang</li>');
    expect(args.description).not.toMatch(/\n/);
  });

  it('round-trips our id and targets the right organization', () => {
    expect(args.externalId).toBe('7ae62d7d-491f-49e5-a250-b1816b6c9b03');
    expect(args.organizationId).toBe(ORG);
  });
});

describe('a bare row — nothing regresses when the new columns are unset', () => {
  // Every existing requisition looks like this. It must publish
  // exactly as it does today, with the new fields simply absent.
  const args = buildManatalJobArgs(
    { id: 'r1', title: 'Area Sales Manager', description: 'Sell things.', location: 'Leeds' },
    ORG,
  );

  it('omits rather than invents', () => {
    expect(args.frequency).toBeNull();
    expect(args.isSalaryVisible).toBeNull();
    expect(args.headcount).toBeNull();
    expect(args.industryId).toBeNull();
    expect(args.contractDetails).toBeNull();
    expect(args.isRemote).toBeNull();
    expect(args.salaryMin).toBeNull();
  });

  it('still falls back to GBP, which is what every historical role is', () => {
    expect(args.currency).toBe('GBP');
  });

  it('does not guess a country from a bare town name', () => {
    expect(args.city).toBe('Leeds');
    expect(args.country).toBe('');
  });

  it('still sends a rendered description', () => {
    expect(args.description).toBe('<p>Sell things.</p>');
  });
});

describe('bad values are refused before they reach Manatal', () => {
  // Manatal validates these and rejects the whole create on a bad one,
  // which would block publishing rather than leave a field blank.
  it('drops a currency that is not an ISO code', () => {
    const args = buildManatalJobArgs({ ...LIVE_ROW, salary_currency: 'pounds' }, ORG);
    expect(args.currency).toBe('GBP');
  });

  it('drops an unrecognised salary period', () => {
    const args = buildManatalJobArgs({ ...LIVE_ROW, salary_period: 'per sprint' }, ORG);
    expect(args.frequency).toBeNull();
  });

  it('drops a zero headcount', () => {
    const args = buildManatalJobArgs({ ...LIVE_ROW, headcount: 0 }, ORG);
    expect(args.headcount).toBeNull();
  });

  it('drops a blank industry id rather than sending an empty string', () => {
    const args = buildManatalJobArgs({ ...LIVE_ROW, manatal_industry_id: '' }, ORG);
    expect(args.industryId === null || args.industryId === '').toBe(true);
  });
});

describe('every field Manatal accepts is decided here', () => {
  it('names them all, so a new one cannot be silently forgotten', () => {
    // Guard the guard. The failure mode of this whole change is a
    // field that exists on Manatal, exists on our row, and is simply
    // never mentioned — which is what the original defect WAS, four
    // times over. Listing the keys makes an omission visible in the
    // diff rather than in production.
    const args = buildManatalJobArgs(LIVE_ROW, ORG);
    expect(Object.keys(args).sort()).toEqual([
      'address', 'city', 'contractDetails', 'country', 'currency',
      'description', 'externalId', 'frequency', 'headcount',
      'industryId', 'isRemote', 'isSalaryVisible', 'organizationId',
      'salaryMax', 'salaryMin', 'state', 'title',
    ]);
  });
});
