import { describe, expect, it } from 'vitest';
import { suggestDistributionTargets, type DistributionCandidate } from '../suggestDistribution';

const co = (id: string, sector: string | null, active = true): DistributionCandidate => ({ id, name: id, sector, active });

describe('suggestDistributionTargets', () => {
  it('suggests active companies sharing the source company\'s sector', () => {
    const companies = [co('src', 'Construction'), co('a', 'Construction'), co('b', 'Retail'), co('c', 'Construction')];
    expect(suggestDistributionTargets(companies, 'src').sort()).toEqual(['a', 'c']);
  });

  it('never suggests the source company itself', () => {
    const companies = [co('src', 'Construction'), co('a', 'Construction')];
    expect(suggestDistributionTargets(companies, 'src')).not.toContain('src');
  });

  it('excludes inactive companies even when the sector matches', () => {
    const companies = [co('src', 'Construction'), co('a', 'Construction', false), co('b', 'Construction', true)];
    expect(suggestDistributionTargets(companies, 'src')).toEqual(['b']);
  });

  it('returns empty when there is no source company (a manually-authored lesson)', () => {
    const companies = [co('a', 'Construction')];
    expect(suggestDistributionTargets(companies, null)).toEqual([]);
  });

  it('returns empty when the source company has no sector recorded', () => {
    const companies = [co('src', null), co('a', null)];
    expect(suggestDistributionTargets(companies, 'src')).toEqual([]);
  });

  it('returns empty when the source company id is not found in the list', () => {
    const companies = [co('a', 'Construction')];
    expect(suggestDistributionTargets(companies, 'missing')).toEqual([]);
  });

  it('returns no duplicates and no unrelated sectors', () => {
    const companies = [co('src', 'Retail'), co('a', 'Retail'), co('b', 'Manufacturing')];
    const result = suggestDistributionTargets(companies, 'src');
    expect(result).toEqual(['a']);
  });
});
