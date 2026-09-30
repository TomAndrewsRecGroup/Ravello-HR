import { describe, expect, it } from 'vitest';
import { buildLegalPrefill } from './broadcastPrefill';

describe('buildLegalPrefill', () => {
  it('prefills the title from the requirement, pre-selects only the applicable companies, and carries the regulatory origin (C17.7)', () => {
    const prefill = buildLegalPrefill({ id: 'req-1', title: 'Health and Safety at Work etc. Act 1974' }, ['company-a', 'company-b']);
    expect(prefill).toEqual({
      title: 'Legal update: Health and Safety at Work etc. Act 1974',
      description: '',
      companyIds: ['company-a', 'company-b'],
      sourceType: 'legal_requirement',
      sourceId: 'req-1',
    });
  });

  it('de-duplicates company ids', () => {
    const prefill = buildLegalPrefill({ id: 'req-1', title: 'X' }, ['company-a', 'company-a', 'company-b']);
    expect(prefill?.companyIds).toEqual(['company-a', 'company-b']);
  });

  it('is null when the requirement was not found', () => {
    expect(buildLegalPrefill(null, ['company-a'])).toBeNull();
  });

  it('pre-selects no companies when none have recorded the requirement as applicable', () => {
    const prefill = buildLegalPrefill({ id: 'req-1', title: 'X' }, []);
    expect(prefill?.companyIds).toEqual([]);
  });

  it('truncates a very long title to 200 characters, matching the regulatory-update prefill', () => {
    const longTitle = 'A'.repeat(250);
    const prefill = buildLegalPrefill({ id: 'req-1', title: longTitle }, []);
    expect(prefill?.title.length).toBe(200);
    expect(prefill?.title.startsWith('Legal update: A')).toBe(true);
  });

  it('always carries the requirement id as sourceId, unchanged by which companies are pre-selected', () => {
    const prefill = buildLegalPrefill({ id: 'req-42', title: 'X' }, []);
    expect(prefill?.sourceType).toBe('legal_requirement');
    expect(prefill?.sourceId).toBe('req-42');
  });
});
