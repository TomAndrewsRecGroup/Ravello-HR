// A dry run of the admin Applicants table against LIVE data.
//
// Fixture: the seven matches Manatal returns for job 4324606 (read
// 2026-08-28), which is the job the test requisition
// 0cb628a6-60d0-40f3-973b-b2010753985a points at. Nothing here is
// invented — the ids, creators, stages and timestamps are verbatim.
//
// This exists to answer "what would the operator actually see", which a
// unit test over synthetic rows cannot.

import { describe, expect, it } from 'vitest';
import { buildPipelineRows, displayName } from '../manatalPipeline';
import type { ManatalMatch } from '../manatal';

/* Verbatim from GET /open/v3/matches/?job_id=4324606 */
const LIVE_MATCHES = [
  { id: 129688383, candidate: 163544005, creator: null,    is_active: false, created_at: '2026-08-28T09:15:12.699283Z' },
  { id: 129686050, candidate: 163541754, creator: null,    is_active: false, created_at: '2026-08-28T08:45:40.567597Z' },
  { id: 129683298, candidate: 163539061, creator: null,    is_active: true,  created_at: '2026-08-28T08:12:10.722581Z' },
  { id: 129571006, candidate: 163462178, creator: 1120238, is_active: true,  created_at: '2026-08-27T15:52:05.835491Z' },
  { id: 129570998, candidate: 163462170, creator: 1120238, is_active: true,  created_at: '2026-08-27T15:51:59.894802Z' },
  { id: 129570974, candidate: 163462152, creator: 1120238, is_active: true,  created_at: '2026-08-27T15:51:49.284117Z' },
  { id: 129570301, candidate: 163461532, creator: 1120238, is_active: true,  created_at: '2026-08-27T15:45:19.112467Z' },
].map(m => ({
  ...m,
  job: 4324606,
  stage: { id: 1769709, name: 'New Candidates' },
  updated_at: m.created_at,
})) as ManatalMatch[];

describe('the admin Applicants table, against live job 4324606', () => {
  it('renders a row for every match Manatal returned', () => {
    // Seven applied-or-added people exist on that job; seven rows.
    const rows = buildPipelineRows(LIVE_MATCHES, []);
    expect(rows).toHaveLength(7);
  });

  it('separates the three who applied from the four the recruiter added', () => {
    const rows = buildPipelineRows(LIVE_MATCHES, []);
    const applied = rows.filter(r => r.applied).map(r => r.candidate_id);
    const added   = rows.filter(r => !r.applied).map(r => r.candidate_id);

    // The three Adzuna applicants, and only those, are referable.
    expect(applied).toEqual(['163544005', '163541754', '163539061']);
    expect(added).toEqual(['163462178', '163462170', '163462152', '163461532']);
  });

  it('shows a dropped applicant rather than hiding them', () => {
    // Two of the three applicants were dropped 21 minutes after applying.
    // They are the best referral candidates there are, so they must be on
    // the page — flagged, not filtered.
    const rows = buildPipelineRows(LIVE_MATCHES, []);
    const dropped = rows.filter(r => !r.is_active);
    expect(dropped).toHaveLength(2);
    expect(dropped.every(r => r.applied)).toBe(true);
  });

  it('names every applicant when the bulk lookup resolves (v1 shape)', () => {
    const hydrated = buildPipelineRows(LIVE_MATCHES, [
      { candidate: { id: 163544005, first_name: 'Pala Nanda Kumar', last_name: 'Reddy', email: 'nandareddy1949@gmail.com' } },
    ] as unknown as ManatalMatch[]);
    const first = hydrated.find(r => r.candidate_id === '163544005')!;
    expect(first.full_name).toBe('Pala Nanda Kumar Reddy');
    expect(first.email).toBe('nandareddy1949@gmail.com');
  });

  it('names them from the per-candidate fallback too (v3 shape)', () => {
    // THE DEFECT THIS TEST WAS WRITTEN FOR. The v3 candidate payload,
    // verbatim from GET /open/v3/candidates/163544005/, carries
    // `full_name` and has NO first_name/last_name. Reading only the v1
    // shape rendered this row as "Candidate #163544005" while every
    // other assertion about the table passed.
    const extras = new Map([
      ['163544005', { id: 163544005, full_name: 'Pala Nanda Kumar Reddy', email: 'nandareddy1949@gmail.com' }],
    ]);
    const rows = buildPipelineRows(LIVE_MATCHES, [], extras);
    const first = rows.find(r => r.candidate_id === '163544005')!;
    expect(first.full_name).toBe('Pala Nanda Kumar Reddy');
    expect(first.email).toBe('nandareddy1949@gmail.com');
  });
});

describe('displayName reads whichever shape arrived', () => {
  it('prefers full_name (v3)', () => {
    expect(displayName({ full_name: 'Pala Nanda Kumar Reddy' })).toBe('Pala Nanda Kumar Reddy');
  });

  it('falls back to first + last (v1)', () => {
    expect(displayName({ first_name: 'Pala Nanda Kumar', last_name: 'Reddy' })).toBe('Pala Nanda Kumar Reddy');
  });

  it('returns null rather than an empty-looking name', () => {
    // '' would render as a blank cell, which reads as a candidate with
    // no name rather than a lookup that did not resolve. The table shows
    // the id in the null case, so the distinction is load-bearing.
    expect(displayName(undefined)).toBeNull();
    expect(displayName({})).toBeNull();
    expect(displayName({ full_name: '   ', first_name: '', last_name: '' })).toBeNull();
  });
});
