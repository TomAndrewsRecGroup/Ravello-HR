// Who gets referred on — and who must NOT.
//
// The fixtures below are VERBATIM matches from the live Manatal account
// (job 4324606, read 2026-08-28). That job carried seven matches: three
// with `creator: null`, which arrived from Adzuna through the free job
// boards, and four with `creator: 1120238` — the operator's own Manatal
// user id, candidates they had sourced and attached to the job by hand.
//
// Before this filter existed the pipeline processed all seven, so an
// operator's own shortlist would have been emailed a partner's referral
// link. That is the failure these tests exist to prevent, and it is not
// something a correctness test can see: every one of those seven scans
// would have succeeded and every email would have sent.

import { describe, expect, it } from 'vitest';
import { isJobBoardApplicant, type ManatalMatch } from '../../manatal';

/** Adzuna applicant. `creator` is null; nobody attached them. */
const APPLIED: ManatalMatch = {
  id: 129688383,
  candidate: 163544005,
  job: 4324606,
  creator: null,
  stage: { id: 1769709, name: 'New Candidates' } as never,
  is_active: false,          // dropped by the recruiter at 09:36 that day
  created_at: '2026-08-28T09:15:12.699283Z',
  updated_at: '2026-08-28T09:15:12.699302Z',
};

/** Sourced by the operator and attached to the job. */
const RECRUITER_ADDED: ManatalMatch = {
  id: 129571006,
  candidate: 163462178,
  job: 4324606,
  creator: 1120238,
  stage: { id: 1769709, name: 'New Candidates' } as never,
  is_active: true,
  created_at: '2026-08-27T15:52:05.835491Z',
  updated_at: '2026-08-27T15:52:05.835510Z',
};

describe('isJobBoardApplicant', () => {
  it('accepts a candidate who applied', () => {
    expect(isJobBoardApplicant(APPLIED)).toBe(true);
  });

  it('REFUSES a candidate the operator sourced and attached', () => {
    // The one that matters. Referring this person on emails the
    // operator's own shortlist a partner's referral link.
    expect(isJobBoardApplicant(RECRUITER_ADDED)).toBe(false);
  });

  it('treats a missing `creator` key as applied, not as sourced', () => {
    // Manatal omits null fields on some serialisations. Failing OPEN
    // here would be wrong in the safe direction — it would refer
    // somebody — so it is pinned rather than left to chance.
    const { creator, ...noKey } = RECRUITER_ADDED;
    expect(creator).toBe(1120238);
    expect(isJobBoardApplicant(noKey as ManatalMatch)).toBe(true);
  });

  it('does not read `is_active` or a drop', () => {
    // A REJECTED applicant is the best referral candidate there is —
    // that is the entire point of the feature. The live applicant above
    // was dropped 21 minutes after applying and must still qualify.
    expect(APPLIED.is_active).toBe(false);
    expect(isJobBoardApplicant(APPLIED)).toBe(true);

    // And an active sourced candidate must still be refused.
    expect(RECRUITER_ADDED.is_active).toBe(true);
    expect(isJobBoardApplicant(RECRUITER_ADDED)).toBe(false);
  });

  it('splits the real seven-match job three/four', () => {
    // The measurement this whole filter came from, kept as a test so a
    // change to the rule has to explain what it does to real data.
    const job4324606: ManatalMatch[] = [
      { ...APPLIED, id: 129688383, candidate: 163544005, creator: null },
      { ...APPLIED, id: 129686050, candidate: 163541754, creator: null },
      { ...APPLIED, id: 129683298, candidate: 163539061, creator: null },
      { ...RECRUITER_ADDED, id: 129571006, candidate: 163462178, creator: 1120238 },
      { ...RECRUITER_ADDED, id: 129570998, candidate: 163462170, creator: 1120238 },
      { ...RECRUITER_ADDED, id: 129570974, candidate: 163462152, creator: 1120238 },
      { ...RECRUITER_ADDED, id: 129570301, candidate: 163461532, creator: 1120238 },
    ];
    const referable = job4324606.filter(isJobBoardApplicant);
    expect(referable).toHaveLength(3);
    expect(referable.map(m => m.candidate)).toEqual([163544005, 163541754, 163539061]);
  });
});
