// The admin applicant list must show EVERY match on the role.
//
// Fixtures are the live shapes from the Manatal account (2026-08-28):
// the v3 job-scoped read returns `candidate` as a BARE INTEGER, while
// the v1 org-wide read returns it EXPANDED. Both are live in this
// codebase at once, which is exactly how `.candidate?.id` silently
// discarded every match once before.
//
// Hydration is a LABEL, not a filter. A candidate the v1 read cannot
// name still has to appear — an applicant missing from this page looks
// like a quiet role rather than a broken lookup, and the operator would
// have no reason to go and check.

import { describe, expect, it } from 'vitest';
import { buildPipelineRows } from '../manatalPipeline';
import type { ManatalMatch } from '../manatal';

/** v3 job-scoped shape: bare integer candidate. */
function v3(id: number, candidate: number, creator: number | null): ManatalMatch {
  return {
    id,
    candidate,
    job: 4324606,
    creator,
    stage: { id: 1769709, name: 'New Candidates' },
    is_active: true,
    created_at: '2026-08-28T09:15:12.699283Z',
    updated_at: '2026-08-28T09:15:12.699302Z',
  };
}

/** v1 org-wide shape: expanded candidate, which is where names come from. */
function v1(id: number, candidate: { id: number; first_name: string; last_name: string; email: string }): ManatalMatch {
  return {
    id,
    candidate,
    job: { id: 4324606, name: 'Area Sales Manager' },
    stage: { id: 1769709, name: 'New Candidates' },
    is_active: true,
    created_at: '',
    updated_at: '',
  } as ManatalMatch;
}

const ADA = { id: 163544005, first_name: 'AARON', last_name: 'KASANAMA', email: 'aaron@example.com' };

describe('buildPipelineRows', () => {
  it('returns one row per match, never fewer', () => {
    const matches = [v3(1, 163544005, null), v3(2, 163541754, null), v3(3, 163462178, 1120238)];
    expect(buildPipelineRows(matches, [])).toHaveLength(3);
  });

  it('keeps a candidate it cannot name, identified by id', () => {
    // The rule. With no hydration available every row still appears.
    const rows = buildPipelineRows([v3(1, 163544005, null)], []);
    expect(rows[0].full_name).toBeNull();
    expect(rows[0].candidate_id).toBe('163544005');
    expect(rows[0].email).toBeNull();
  });

  it('resolves a name across the v3/v1 id-shape boundary', () => {
    // The bare integer from v3 must match the expanded object from v1.
    // Keying either side wrongly yields a page of unnamed rows.
    const rows = buildPipelineRows([v3(1, 163544005, null)], [v1(99, ADA)]);
    expect(rows[0].full_name).toBe('AARON KASANAMA');
    expect(rows[0].email).toBe('aaron@example.com');
  });

  it('labels who applied and who a recruiter attached', () => {
    const rows = buildPipelineRows([v3(1, 163544005, null), v3(2, 163462178, 1120238)], []);
    expect(rows.map(r => r.applied)).toEqual([true, false]);
  });

  it('survives a match with no stage rather than throwing', () => {
    // One malformed row must not blank the whole page.
    const broken = { ...v3(1, 1, null), stage: undefined } as unknown as ManatalMatch;
    const rows = buildPipelineRows([broken], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].stage.name).toBe('Unknown');
  });

  it('does not invent rows from the hydration source', () => {
    // orgMatches is the whole ORGANISATION's matches — every job. If it
    // leaked into the output, one role's page would list applicants to
    // every other role the client has.
    const rows = buildPipelineRows([v3(1, 163544005, null)], [v1(99, ADA), v1(100, { ...ADA, id: 999 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].candidate_id).toBe('163544005');
  });
});
