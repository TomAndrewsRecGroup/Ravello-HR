import { describe, expect, it } from 'vitest';
import { packSectorKeyForCompanySector, SECTOR_TO_PACK_KEY } from '../sectorPackMapping';
import { SECTORS } from '@/lib/sectors';

describe('packSectorKeyForCompanySector', () => {
  it('maps a clearly site-based sector to its pack', () => {
    expect(packSectorKeyForCompanySector('Construction')).toBe('construction');
    expect(packSectorKeyForCompanySector('Manufacturing')).toBe('manufacturing');
    expect(packSectorKeyForCompanySector('Healthcare & Medical')).toBe('care');
    expect(packSectorKeyForCompanySector('Hospitality & Tourism')).toBe('hospitality');
  });

  it('maps a clearly desk-based sector to office', () => {
    expect(packSectorKeyForCompanySector('Legal Services')).toBe('office');
    expect(packSectorKeyForCompanySector('Accounting & Tax')).toBe('office');
  });

  it('never guesses for an ambiguous or unlisted sector', () => {
    expect(packSectorKeyForCompanySector('Engineering')).toBeNull();
    expect(packSectorKeyForCompanySector('Agriculture & Farming')).toBeNull();
    expect(packSectorKeyForCompanySector('Other')).toBeNull();
    expect(packSectorKeyForCompanySector('TPS')).toBeNull();
  });

  it('returns null for no sector at all', () => {
    expect(packSectorKeyForCompanySector(null)).toBeNull();
    expect(packSectorKeyForCompanySector(undefined)).toBeNull();
    expect(packSectorKeyForCompanySector('')).toBeNull();
  });

  it('every mapped sector is a real value from the onboarding SECTORS list', () => {
    for (const sector of Object.keys(SECTOR_TO_PACK_KEY)) {
      expect(SECTORS).toContain(sector);
    }
  });

  it('every mapped value is one of the five seeded pack keys', () => {
    const valid = new Set(['office', 'construction', 'manufacturing', 'care', 'hospitality']);
    for (const key of Object.values(SECTOR_TO_PACK_KEY)) {
      expect(valid.has(key)).toBe(true);
    }
  });
});
