import { describe, it, expect } from 'vitest';
import { manatalRefId, type ManatalMatch } from '../manatal';

/**
 * These fixtures are VERBATIM from the live Andrews Recruitment Group
 * Manatal account on 2026-08-26, trimmed only of unused fields.
 *
 * The bug they exist to prevent: `ManatalMatch.candidate` was typed as
 * an expanded object, and the referral pipeline read `match.candidate?.id`.
 * The v3 endpoint the pipeline actually calls returns a BARE INTEGER, so
 * that expression was `undefined` for every applicant. Every match was
 * discarded with "A match arrived with no candidate id", and a live role
 * would have processed exactly zero people.
 *
 * Nothing could see it: `manatalFetch` returns `any` and the result is
 * cast with `as ManatalMatch[]`, so the cast asserted a shape the API
 * does not send and tsc believed it.
 */

// GET /open/v3/matches/?job_id=3919466 — what the referral pipeline reads.
const V3_MATCH = {
  id: 127848916,
  external_id: null,
  owner: 1120238,
  organization: 4247425,
  job: 3919466,
  candidate: 161626806,
  stage: { id: 1769709, name: 'New Candidates' },
  is_active: false,
  created_at: '2026-08-12T15:55:56.939903Z',
  updated_at: '2026-08-12T15:55:56.939921Z',
} as unknown as ManatalMatch;

// GET /open/v1/matches/?department_id=… — what the PORTAL's pipeline
// board reads. Both shapes are live in this codebase simultaneously,
// which is why the accessor is tolerant rather than the type swapped.
const V1_MATCH = {
  id: 127848916,
  job: { id: 3919466, name: 'Account Manager - Field Based' },
  candidate: { id: 161626806, first_name: 'Sanctuary', last_name: 'Danso', email: 'x@example.com' },
  stage: { id: 1769709, name: 'New Candidates' },
  is_active: true,
  created_at: '2026-08-12T15:55:56.939903Z',
  updated_at: '2026-08-12T15:55:56.939921Z',
} as unknown as ManatalMatch;

describe('manatalRefId', () => {
  it('reads the id from the v3 bare-integer shape', () => {
    expect(manatalRefId(V3_MATCH.candidate)).toBe('161626806');
    expect(manatalRefId(V3_MATCH.job)).toBe('3919466');
  });

  it('reads the id from the v1 expanded-object shape', () => {
    expect(manatalRefId(V1_MATCH.candidate)).toBe('161626806');
    expect(manatalRefId(V1_MATCH.job)).toBe('3919466');
  });

  it('agrees across both shapes for the same record', () => {
    expect(manatalRefId(V3_MATCH.candidate)).toBe(manatalRefId(V1_MATCH.candidate));
  });

  it('returns empty string — not "undefined" — when there is no id', () => {
    // The pipeline tests this falsy to skip a match, so a stringified
    // "undefined" would be truthy and get written to the database as
    // the candidate's Manatal id.
    expect(manatalRefId(null)).toBe('');
    expect(manatalRefId(undefined)).toBe('');
    expect(manatalRefId({} as { id?: number })).toBe('');
    expect(manatalRefId({ id: undefined })).toBe('');
  });

  it('accepts a string id', () => {
    expect(manatalRefId('161626806')).toBe('161626806');
  });

  it('does not treat id 0 as missing', () => {
    expect(manatalRefId(0)).toBe('0');
    expect(manatalRefId({ id: 0 })).toBe('0');
  });

  // The whole point: the batch the pipeline builds must be non-empty.
  it('yields a full id list from a v3 batch, which the old code did not', () => {
    const batch = [V3_MATCH, { ...V3_MATCH, id: 2, candidate: 157442431 }] as unknown as ManatalMatch[];

    const ids = batch.map(m => manatalRefId(m.candidate)).filter(Boolean);
    expect(ids).toEqual(['161626806', '157442431']);

    // The exact expression that shipped, against the exact payload the
    // API sends. It produces nothing, which is the outage.
    const old = batch.map(m => String((m.candidate as { id?: number })?.id ?? '')).filter(Boolean);
    expect(old).toEqual([]);
  });
});
