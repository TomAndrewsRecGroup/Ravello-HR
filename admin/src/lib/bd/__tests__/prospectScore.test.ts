import { describe, expect, it } from 'vitest';
import { fallbackNextAction, normaliseCompanyName, prospectScore, type ProspectSignals } from '../prospectScore';

const base: ProspectSignals = { roles_seen: 3, active_roles: 2, days_since_last_seen: 5, high_repost: 0, long_vacancy: 0, volume_hiring: 0, prior_status: 'prospect', prior_contacts: 0 };

describe('prospectScore', () => {
  it('is bounded 0–100 and zero for a client or a dismissed company', () => {
    expect(prospectScore({ ...base, active_roles: 50, roles_seen: 90, high_repost: 9, long_vacancy: 9, volume_hiring: 9 })).toBe(100);
    expect(prospectScore({ ...base, active_roles: 0, roles_seen: 0, days_since_last_seen: 400 })).toBe(0);
    expect(prospectScore({ ...base, prior_status: 'Client' })).toBe(0);
    expect(prospectScore({ ...base, prior_status: 'not_relevant' })).toBe(0);
  });
  it('rises with live demand and friction, falls as the company fades', () => {
    const s0 = prospectScore(base);
    expect(prospectScore({ ...base, active_roles: 4 })).toBeGreaterThan(s0);
    expect(prospectScore({ ...base, high_repost: 1 })).toBeGreaterThan(s0);
    expect(prospectScore({ ...base, long_vacancy: 2 })).toBeGreaterThan(s0);
    expect(prospectScore({ ...base, days_since_last_seen: 95 })).toBeLessThan(s0);
    expect(prospectScore({ ...base, prior_status: 'contacted' })).toBeLessThan(s0);
  });
  it('the fallback action follows the score, and dismisses the long-gone', () => {
    expect(fallbackNextAction(base, 75)).toBe('call');
    expect(fallbackNextAction(base, 45)).toBe('email_sequence');
    expect(fallbackNextAction(base, 10)).toBe('watch');
    expect(fallbackNextAction({ ...base, active_roles: 0, days_since_last_seen: 200 }, 75)).toBe('dismiss');
    expect(fallbackNextAction({ ...base, prior_status: 'client' }, 90)).toBe('dismiss');
  });
});

describe('normaliseCompanyName', () => {
  it('matches the spellings one company arrives under', () => {
    for (const v of ['Acme Ltd', 'ACME Limited', 'Acme Ltd.', ' acme ', 'Acme (UK) Ltd', 'Acme Group PLC']) expect(normaliseCompanyName(v), v).toBe('acme');
    expect(normaliseCompanyName('Smith & Jones LLP')).toBe('smith and jones');
    expect(normaliseCompanyName('Ltd')).toBe('');
  });
});
