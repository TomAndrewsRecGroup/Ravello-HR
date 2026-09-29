import { describe, expect, it } from 'vitest';
import { isOrganisationStale } from '../StaleOrganisationGuard';

describe('isOrganisationStale', () => {
  it('is stale when the live id differs from what the tab was rendered under', () => {
    expect(isOrganisationStale('co-a', 'co-b')).toBe(true);
  });

  it('is not stale when the live id matches', () => {
    expect(isOrganisationStale('co-a', 'co-a')).toBe(false);
  });

  it('a null/missing live id is never treated as staleness — a failed check is not evidence', () => {
    expect(isOrganisationStale('co-a', null)).toBe(false);
  });
});
