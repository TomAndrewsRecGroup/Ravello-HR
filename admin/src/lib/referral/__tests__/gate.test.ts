import { describe, expect, it } from 'vitest';
import { checkCountry, checkMandatoryCriteria, evaluate, toPercent } from '../gate';
import type { MandatoryCriterion, ReferralRoleConfig, ScanResult } from '../types';

const MCP: MandatoryCriterion = {
  key:   'mcp_experience',
  label: 'MCP implementation experience',
  match_terms: ['MCP', 'Model Context Protocol'],
};

function config(over: Partial<ReferralRoleConfig> = {}): ReferralRoleConfig {
  return {
    requisition_id:      'req-1',
    enabled:             true,
    dry_run:             false,
    partner_name:        'Micro1',
    referral_url:        'https://example.com/apply',
    auto_send_threshold: 85,
    review_threshold:    75,
    approved_countries:  ['United Kingdom', 'Ireland'],
    mandatory_criteria:  [],
    ...over,
  };
}

function scan(over: Partial<ScanResult> = {}): ScanResult {
  return { overall_score: 0.9, skill_matches: [], ...over };
}

describe('checkCountry', () => {
  it('approves an exact country', () => {
    expect(checkCountry('United Kingdom', ['United Kingdom']).result).toBe('approved');
  });

  it('approves on the country half of "City, Country"', () => {
    expect(checkCountry('Cardiff, United Kingdom', ['United Kingdom']).result).toBe('approved');
  });

  it('approves via an alias in either direction', () => {
    expect(checkCountry('London, UK', ['United Kingdom']).result).toBe('approved');
    expect(checkCountry('Manchester, England', ['United Kingdom']).result).toBe('approved');
    expect(checkCountry('United Kingdom', ['UK']).result).toBe('approved');
  });

  it('rejects a readable, non-approved country', () => {
    const r = checkCountry('Ndola, Zambia', ['United Kingdom']);
    expect(r.result).toBe('rejected');
    expect(r.detected).toBe('Ndola, Zambia');
  });

  it('reports a bare unplaceable city as unknown, not approved', () => {
    expect(checkCountry('Manchester', ['Ireland']).result).toBe('unknown');
  });

  it('reports a blank location as unknown', () => {
    expect(checkCountry('', ['United Kingdom']).result).toBe('unknown');
    expect(checkCountry(null, ['United Kingdom']).result).toBe('unknown');
  });

  it('FAILS CLOSED on an empty approved list — refuses everyone', () => {
    // The dangerous inversion: an unconfigured list must not mean
    // "allow all". Flip this to `approved` and every applicant on
    // earth becomes eligible.
    expect(checkCountry('United Kingdom', []).result).toBe('rejected');
  });

  it('does not match a country name embedded inside another word', () => {
    // "us" must not match "Belarus".
    expect(checkCountry('Minsk, Belarus', ['US']).result).toBe('rejected');
  });
});

describe('checkMandatoryCriteria — absence of evidence is a FAIL', () => {
  it('passes when a skill is found with matching terms', () => {
    const failed = checkMandatoryCriteria([MCP], scan({
      skill_matches: [{ skill: 'MCP server development', found: true, confidence: 0.9 }],
    }));
    expect(failed).toEqual([]);
  });

  it('matches the long form of the term too', () => {
    const failed = checkMandatoryCriteria([MCP], scan({
      skill_matches: [{ skill: 'Model Context Protocol', found: true }],
    }));
    expect(failed).toEqual([]);
  });

  it('FAILS when the skill is absent from skill_matches entirely', () => {
    // THE core case. The scan never mentioned MCP; that is not
    // evidence the candidate has it. Default this to "pass" and a
    // 91%-on-adjacent-AI-experience candidate sails through.
    const failed = checkMandatoryCriteria([MCP], scan({
      skill_matches: [{ skill: 'Python', found: true }, { skill: 'LLM fine-tuning', found: true }],
    }));
    expect(failed).toHaveLength(1);
    expect(failed[0].key).toBe('mcp_experience');
    expect(failed[0].reason).toMatch(/No evidence/i);
  });

  it('FAILS on an explicit found:false', () => {
    const failed = checkMandatoryCriteria([MCP], scan({
      skill_matches: [{ skill: 'MCP', found: false }],
    }));
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toMatch(/not evidenced/i);
  });

  it('FAILS when found is undefined — the model did not answer', () => {
    const failed = checkMandatoryCriteria([MCP], scan({
      skill_matches: [{ skill: 'MCP' }],
    }));
    expect(failed).toHaveLength(1);
  });

  it('FAILS on low confidence even when found is true', () => {
    const failed = checkMandatoryCriteria([MCP], scan({
      skill_matches: [{ skill: 'MCP', found: true, confidence: 0.2 }],
    }));
    expect(failed).toHaveLength(1);
  });

  it('FAILS every criterion when there is no scan at all', () => {
    expect(checkMandatoryCriteria([MCP], null)).toHaveLength(1);
  });

  it('FAILS a criterion configured with no match terms rather than passing it', () => {
    const broken: MandatoryCriterion = { key: 'x', label: 'Broken', match_terms: [] };
    const failed = checkMandatoryCriteria([broken], scan({
      skill_matches: [{ skill: 'anything', found: true }],
    }));
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toMatch(/no match terms/i);
  });

  it('returns nothing when no criteria are configured', () => {
    expect(checkMandatoryCriteria([], scan())).toEqual([]);
  });
});

describe('toPercent', () => {
  it('scales a 0-1 float', () => {
    expect(toPercent(0.87)).toBe(87);
    expect(toPercent(1)).toBe(100);
    expect(toPercent(0)).toBe(0);
  });
  it('passes through a value already on 0-100', () => {
    expect(toPercent(87)).toBe(87);
  });
  it('resolves the ambiguous 1-2 band DOWNWARDS', () => {
    // 1.4 is out of IvyLens's stated 0.0-1.0 contract either way, so
    // the >1 branch reads it as 1.4 on a 0-100 scale → 1%.
    // That is deliberate: a wrongly-HIGH score sends an email to a
    // stranger, a wrongly-low one merely doesn't. When the scale is
    // ambiguous, err downwards.
    expect(toPercent(1.4)).toBe(1);
  });

  it('survives rubbish', () => {
    expect(toPercent(NaN)).toBe(0);
    expect(toPercent(Infinity)).toBe(0);
    expect(toPercent(-5)).toBe(0);
  });
});

describe('evaluate — order and vetoes', () => {
  it('rejects on country BEFORE scoring, and reports no score', () => {
    const d = evaluate({ location: 'Ndola, Zambia', config: config(), scan: scan({ overall_score: 0.99 }) });
    expect(d.status).toBe('rejected_country');
    expect(d.score).toBeNull();
    expect(d.countryResult).toBe('rejected');
  });

  it('an unknown country never auto-sends', () => {
    const d = evaluate({ location: 'Manchester', config: config({ approved_countries: ['Ireland'] }), scan: scan() });
    expect(d.status).toBe('rejected_country');
    expect(d.countryResult).toBe('unknown');
  });

  it('a hard criterion failure VETOES a high score', () => {
    // 95% and still rejected — the headline behaviour.
    const d = evaluate({
      location: 'London, UK',
      config:   config({ mandatory_criteria: [MCP] }),
      scan:     scan({ overall_score: 0.95, skill_matches: [{ skill: 'Python', found: true }] }),
    });
    expect(d.status).toBe('rejected_criteria');
    expect(d.score).toBe(95);
    expect(d.failedCriteria).toHaveLength(1);
    expect(d.reasons.join(' ')).toMatch(/failed 1 mandatory criterion/i);
  });

  it('qualifies at exactly the auto-send threshold', () => {
    const d = evaluate({ location: 'London, UK', config: config(), scan: scan({ overall_score: 0.85 }) });
    expect(d.status).toBe('qualified');
    expect(d.score).toBe(85);
  });

  it('queues one point below the auto-send threshold', () => {
    const d = evaluate({ location: 'London, UK', config: config(), scan: scan({ overall_score: 0.84 }) });
    expect(d.status).toBe('review_pending');
  });

  it('queues at exactly the review threshold', () => {
    const d = evaluate({ location: 'London, UK', config: config(), scan: scan({ overall_score: 0.75 }) });
    expect(d.status).toBe('review_pending');
  });

  it('rejects one point below the review threshold', () => {
    const d = evaluate({ location: 'London, UK', config: config(), scan: scan({ overall_score: 0.74 }) });
    expect(d.status).toBe('rejected_score');
  });

  it('reports a missing scan as a fault, never as a score of zero', () => {
    const d = evaluate({ location: 'London, UK', config: config(), scan: null });
    expect(d.status).toBe('scan_error');
    expect(d.score).toBeNull();
  });

  it('always explains itself', () => {
    const d = evaluate({ location: 'London, UK', config: config(), scan: scan({ overall_score: 0.9 }) });
    expect(d.reasons.length).toBeGreaterThan(0);
  });
});
