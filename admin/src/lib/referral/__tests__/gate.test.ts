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
    blocked_countries:   ['Nigeria', 'Brazil'],
    mandatory_criteria:  [],
    ...over,
  };
}

function scan(over: Partial<ScanResult> = {}): ScanResult {
  return { overall_score: 0.9, skill_matches: [], ...over };
}

describe('checkCountry — a BLOCK list (migration 084)', () => {
  it('blocks an exact country', () => {
    expect(checkCountry('Nigeria', ['Nigeria']).result).toBe('blocked');
  });

  it('blocks on the country half of "City, Country"', () => {
    expect(checkCountry('Lagos, Lagos State, Nigeria', ['Nigeria']).result).toBe('blocked');
  });

  it('blocks via an alias in either direction', () => {
    expect(checkCountry('London, UK', ['United Kingdom']).result).toBe('blocked');
    expect(checkCountry('Cardiff, United Kingdom', ['UK']).result).toBe('blocked');
  });

  it('does not match a country name inside a longer word', () => {
    // "us" must not match "Belarus" — the word-boundary rule.
    expect(checkCountry('Minsk, Belarus', ['US']).result).not.toBe('blocked');
  });

  it('passes anyone not on the list', () => {
    expect(checkCountry('London, United Kingdom', ['Nigeria']).result).toBe('clear');
    expect(checkCountry('Kraków, Poland', ['Nigeria', 'Brazil']).result).toBe('clear');
  });

  // THE INVERSION. An empty ALLOW list refused everyone; an empty BLOCK
  // list refuses nobody. Getting this backwards would make every
  // unconfigured role silently reject every applicant.
  it('an EMPTY list blocks nobody', () => {
    expect(checkCountry('Lagos, Nigeria', []).result).toBe('clear');
    expect(checkCountry('London, United Kingdom', []).result).toBe('clear');
  });

  it('a blank location is unknown, not blocked and not clear', () => {
    for (const loc of [null, undefined, '', '   ']) {
      expect(checkCountry(loc, ['Nigeria']).result).toBe('unknown');
    }
  });

  // A country is recognised by NAME, never by string shape. Bare
  // "United Kingdom" is two words with no comma and is three of the
  // live rows -- some of which qualified. A word-count heuristic
  // demotes them to review, which is why there is a country set.
  it('reads a bare country name as clear, not unknown', () => {
    expect(checkCountry('United Kingdom', ['Nigeria']).result).toBe('clear');
    expect(checkCountry('Luxembourg', ['Nigeria']).result).toBe('clear');
    expect(checkCountry('Sweden, Sweden', ['Nigeria']).result).toBe('clear');
  });

  it('a bare city naming no country is unknown', () => {
    expect(checkCountry('Manchester', ['Nigeria']).result).toBe('unknown');
  });

  // Every location this pipeline has actually seen, from the 50 rows
  // processed to date. None may come back `unknown` -- an unknown here
  // is a real candidate silently demoted out of auto-send.
  it('resolves every location observed in production', () => {
    const seen = [
      'London, England, United Kingdom', 'London, United Kingdom',
      'Oxford, United Kingdom', 'Southampton, United Kingdom', 'Sweden, Sweden',
      'United Kingdom', 'Welwyn Garden City, Hertfordshire, United Kingdom',
      'Cambridge, United Kingdom', 'Exeter, United Kingdom',
      'Leamington, United Kingdom', 'London, Greater London, United Kingdom',
      'Manchester, United Kingdom', 'Newcastle upon Tyne, United Kingdom',
      'United Kingdom, United Kingdom', 'Worcester, United Kingdom',
      'Elva, Estonia', 'Istanbul, Turkey', 'Lagos, Lagos State, Nigeria',
      'Luanda, Angola', 'São Paulo, Brazil', 'Skopje, Macedonia',
      'Tallinn, Estonia', 'Dublin, Ireland', 'Kraków, Poland',
      'Bucharest, Romania', 'Durham, United Kingdom', 'Hatfield, United Kingdom',
      'Toronto, ON, Canada',
    ];
    for (const loc of seen) {
      expect(checkCountry(loc, []).result, loc).toBe('clear');
    }
  });

  it('blocks exactly the seven the old allow list refused, given the seeded list', () => {
    // What migration 084 seeds blocked_countries with.
    const seeded = ['Estonia', 'Turkey', 'Nigeria', 'Angola', 'Brazil', 'Macedonia'];
    const refused = [
      'Elva, Estonia', 'Istanbul, Turkey', 'Lagos, Lagos State, Nigeria',
      'Luanda, Angola', 'São Paulo, Brazil', 'Skopje, Macedonia', 'Tallinn, Estonia',
    ];
    for (const loc of refused) expect(checkCountry(loc, seeded).result, loc).toBe('blocked');

    // ...and nobody the old list approved becomes newly refused.
    const kept = ['London, United Kingdom', 'Dublin, Ireland', 'Kraków, Poland', 'Toronto, ON, Canada'];
    for (const loc of kept) expect(checkCountry(loc, seeded).result, loc).toBe('clear');
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
  it('rejects a BLOCKED country BEFORE scoring, and reports no score', () => {
    const d = evaluate({ location: 'Lagos, Nigeria', config: config(), scan: scan({ overall_score: 0.99 }) });
    expect(d.status).toBe('rejected_country');
    expect(d.score).toBeNull();
    expect(d.countryResult).toBe('blocked');
  });

  // THE AUTO-SEND CAP -- the property that replaces the old allow
  // list's outright refusal (operator, 2026-09-02). An unreadable
  // country is NOT a rejection: they are scanned, scored, and shown.
  // They simply never get an email without a person deciding.
  it('an unreadable country is scored and reviewed, never auto-sent', () => {
    const d = evaluate({
      location: 'Manchester',                      // no country
      config:   config({ auto_send_threshold: 85, review_threshold: 75 }),
      scan:     scan({ overall_score: 0.99 }),     // way over the bar
    });
    expect(d.countryResult).toBe('unknown');
    expect(d.status).toBe('review_pending');       // NOT 'qualified'
    expect(d.score).toBe(99);                      // and it IS scored
    expect(d.reasons.join(' ')).toMatch(/country could not be read/i);
  });

  it('a blank location is scored and reviewed too, never auto-sent', () => {
    const d = evaluate({ location: null, config: config(), scan: scan({ overall_score: 0.99 }) });
    expect(d.status).toBe('review_pending');
    expect(d.countryResult).toBe('unknown');
  });

  // The same score with a READABLE country does auto-send -- otherwise
  // the test above would pass against a gate that reviews everybody.
  it('the identical score with a readable country DOES auto-send', () => {
    const d = evaluate({
      location: 'Manchester, United Kingdom',
      config:   config({ auto_send_threshold: 85, review_threshold: 75 }),
      scan:     scan({ overall_score: 0.99 }),
    });
    expect(d.countryResult).toBe('clear');
    expect(d.status).toBe('qualified');
  });

  // An empty block list must not become an accidental allow-all that
  // also bypasses the cap.
  it('an empty block list still holds an unreadable country for review', () => {
    const d = evaluate({
      location: 'Manchester',
      config:   config({ blocked_countries: [] }),
      scan:     scan({ overall_score: 0.99 }),
    });
    expect(d.status).toBe('review_pending');
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

/* ── Degenerate match terms (2026-09-02) ─────────────────────
 *
 * Found while widening the live role's criteria. `normalise` strips
 * punctuation, so "C++" becomes "c" — and the two-way containment
 * check then matches almost every skill. A mandatory criterion would
 * pass EVERY candidate while reading in the UI as a strict
 * requirement: the exact inversion of "absence of evidence fails".
 */
describe('a match term that cannot discriminate', () => {
  const skills = (...names: string[]) =>
    names.map(skill => ({ skill, found: true, confidence: 0.9 })) as any;

  it('does not let "C++" pass a candidate who has none of it', () => {
    const failed = checkMandatoryCriteria(
      [{ key: 'k', label: 'C++', match_terms: ['C++'] }],
      { overall_score: 0.9, skill_matches: skills('JavaScript', 'Docker', 'Communication') } as any,
    );
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toMatch(/too short to discriminate/i);
  });

  it('says WHICH terms were unusable, not just that it failed', () => {
    const failed = checkMandatoryCriteria(
      [{ key: 'k', label: 'C++', match_terms: ['C++'] }],
      { overall_score: 0.9, skill_matches: skills('Python') } as any,
    );
    expect(failed[0].reason).toContain('C++');
  });

  it('still distinguishes that from no terms at all', () => {
    const none = checkMandatoryCriteria(
      [{ key: 'k', label: 'X', match_terms: [] }],
      { overall_score: 0.9, skill_matches: skills('Python') } as any,
    );
    expect(none[0].reason).toMatch(/no match terms configured/i);
  });

  it('ignores the unusable term but honours the usable ones beside it', () => {
    // A mixed list must not be condemned wholesale — "Python" is real
    // evidence whatever else was typed next to it.
    const failed = checkMandatoryCriteria(
      [{ key: 'k', label: 'Languages', match_terms: ['C++', 'Python'] }],
      { overall_score: 0.9, skill_matches: skills('Python') } as any,
    );
    expect(failed).toHaveLength(0);
  });

  it('keeps two-character terms usable', () => {
    // "QA" and "ML" are real terms an operator would reasonably type.
    const failed = checkMandatoryCriteria(
      [{ key: 'k', label: 'QA', match_terms: ['QA'] }],
      { overall_score: 0.9, skill_matches: skills('QA Automation') } as any,
    );
    expect(failed).toHaveLength(0);
  });
});

/* ── The live role's criteria, against real applicant skills ── */
describe('the terms configured on requisition 7ae62d7d', () => {
  // Skills as IvyLens derives them from this role's must_haves.
  const applicant = (...names: string[]) =>
    ({ overall_score: 0.9, skill_matches: names.map(skill => ({ skill, found: true, confidence: 0.9 })) }) as any;

  const CRITERIA = [
    { key: 'ai_engineers', label: 'AI Engineering',
      match_terms: ['Python', 'Golang', 'TypeScript', 'Rust', 'Java', 'Machine Learning', 'LLM', 'Artificial Intelligence'] },
    { key: 'strong_software_engineering_or_ai_ml_exp', label: 'Strong software engineering or AI/ML experience',
      match_terms: ['Software Engineering', 'Software Development', 'Programming', 'Backend', 'Full Stack', 'Debugging', 'Refactoring', 'Machine Learning'] },
    { key: 'software_testing', label: 'Software testing',
      match_terms: ['Software Testing', 'Testing', 'Test', 'QA', 'Unit Test', 'Test Driven Development'] },
  ];

  it('passes a Rust engineer, who the old "Python" term rejected', () => {
    expect(checkMandatoryCriteria(CRITERIA,
      applicant('Rust', 'Software Engineering', 'Software Testing'))).toHaveLength(0);
  });

  it('passes a Go engineer too', () => {
    expect(checkMandatoryCriteria(CRITERIA,
      applicant('Golang', 'Backend', 'Unit Testing'))).toHaveLength(0);
  });

  it('still vetoes somebody with none of it', () => {
    // The Zambian auto-electrician in the live applicant list.
    const failed = checkMandatoryCriteria(CRITERIA,
      applicant('Electrical Fault Diagnostics', 'Hydraulic Systems Maintenance'));
    expect(failed).toHaveLength(3);
  });

  it('vetoes a strong engineer with no testing evidence', () => {
    // The AND is the point: three criteria, all must be evidenced.
    const failed = checkMandatoryCriteria(CRITERIA, applicant('Python', 'Software Engineering'));
    expect(failed.map(f => f.key)).toEqual(['software_testing']);
  });
});
