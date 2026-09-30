import { describe, expect, it } from 'vitest';
import { humanBadgeId } from '../badgeId';

describe('humanBadgeId', () => {
  it('uses the employee number when present', () => {
    expect(humanBadgeId('EMP-0042', '11111111-2222-3333-4444-555555555555')).toBe('EMP-0042');
  });

  it('trims surrounding whitespace on a real employee number', () => {
    expect(humanBadgeId('  EMP-0042  ', '11111111-2222-3333-4444-555555555555')).toBe('EMP-0042');
  });

  it('falls back to a reference id built from the person id when null', () => {
    expect(humanBadgeId(null, '11111111-2222-3333-4444-555555555555')).toBe('REF-55555555');
  });

  it('falls back when the employee number is blank/whitespace-only', () => {
    expect(humanBadgeId('   ', '11111111-2222-3333-4444-555555555555')).toBe('REF-55555555');
  });

  it('the fallback reference is deterministic for the same person id', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(humanBadgeId(null, id)).toBe(humanBadgeId(null, id));
  });

  it('the fallback reference is upper-cased and hyphen-free', () => {
    const result = humanBadgeId(null, '11111111-2222-3333-4444-abc123de4567');
    expect(result).toBe('REF-23DE4567');
    expect(result).not.toMatch(/-.*-/); // only the one REF- separator
  });
});
