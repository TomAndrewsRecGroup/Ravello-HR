import { describe, expect, it } from 'vitest';
import { buildLegalPrefill } from './broadcastPrefill';

describe('buildLegalPrefill', () => {
  it('prefills the title from the requirement and pre-selects only the applicable companies', () => {
    const prefill = buildLegalPrefill({ title: 'Health and Safety at Work etc. Act 1974' }, ['company-a', 'company-b']);
    expect(prefill).toEqual({
      title: 'Legal update: Health and Safety at Work etc. Act 1974',
      description: '',
      companyIds: ['company-a', 'company-b'],
    });
  });

  it('de-duplicates company ids', () => {
    const prefill = buildLegalPrefill({ title: 'X' }, ['company-a', 'company-a', 'company-b']);
    expect(prefill?.companyIds).toEqual(['company-a', 'company-b']);
  });

  it('is null when the requirement was not found', () => {
    expect(buildLegalPrefill(null, ['company-a'])).toBeNull();
  });

  it('pre-selects no companies when none have recorded the requirement as applicable', () => {
    const prefill = buildLegalPrefill({ title: 'X' }, []);
    expect(prefill?.companyIds).toEqual([]);
  });

  it('truncates a very long title to 200 characters, matching the regulatory-update prefill', () => {
    const longTitle = 'A'.repeat(250);
    const prefill = buildLegalPrefill({ title: longTitle }, []);
    expect(prefill?.title.length).toBe(200);
    expect(prefill?.title.startsWith('Legal update: A')).toBe(true);
  });
});
