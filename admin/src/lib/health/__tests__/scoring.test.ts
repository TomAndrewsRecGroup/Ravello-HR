import { describe, expect, it } from 'vitest';
import { computeBand, computeChurnSignal, computeEngagementScore } from '../scoring';

describe('computeBand', () => {
  it('an inactive client is always red, even with no other issues', () => {
    expect(computeBand({ active: false, overdue_comp: 0, open_tickets: 0, stalled_reqs: 0 })).toBe('red');
  });

  it('is green with no issues', () => {
    expect(computeBand({ active: true, overdue_comp: 0, open_tickets: 0, stalled_reqs: 0 })).toBe('green');
  });

  it('is amber with one minor issue', () => {
    expect(computeBand({ active: true, overdue_comp: 1, open_tickets: 0, stalled_reqs: 0 })).toBe('amber');
  });

  it('is red once any threshold is crossed', () => {
    expect(computeBand({ active: true, overdue_comp: 3, open_tickets: 0, stalled_reqs: 0 })).toBe('red');
    expect(computeBand({ active: true, overdue_comp: 0, open_tickets: 3, stalled_reqs: 0 })).toBe('red');
    expect(computeBand({ active: true, overdue_comp: 0, open_tickets: 0, stalled_reqs: 2 })).toBe('red');
  });
});

describe('computeEngagementScore', () => {
  const base = { daysSinceLogin: 999, activeRoles: 0, recentReqs: 0, recentTickets: 0, docCount: 0, loginCount30d: 0 };

  it('a client who never logged in and has no activity scores low', () => {
    expect(computeEngagementScore(base)).toBe(15); // 50 - 35
  });

  it('a client active in the last week with roles and docs scores high', () => {
    const score = computeEngagementScore({ ...base, daysSinceLogin: 2, activeRoles: 1, recentReqs: 1, recentTickets: 1, docCount: 1, loginCount30d: 10 });
    expect(score).toBe(100); // 50+20+10+5+5+5+5, clamped
  });

  it('clamps to 0..100', () => {
    expect(computeEngagementScore(base)).toBeGreaterThanOrEqual(0);
    expect(computeEngagementScore({ ...base, daysSinceLogin: 2, activeRoles: 1, recentReqs: 1, recentTickets: 1, docCount: 1, loginCount30d: 10 })).toBeLessThanOrEqual(100);
  });
});

describe('computeChurnSignal', () => {
  it('no snapshots: no streak, no delta, not at risk', () => {
    const s = computeChurnSignal([]);
    expect(s).toEqual({ decliningStreak: 0, scoreDelta7d: null, atRisk: false });
  });

  it('counts a streak of non-green snapshots from most recent, stopping at the first green', () => {
    const snaps = [
      { snapshot_date: '2026-09-25', band: 'amber' as const, engagement_score: 40 },
      { snapshot_date: '2026-09-24', band: 'red' as const, engagement_score: 30 },
      { snapshot_date: '2026-09-23', band: 'green' as const, engagement_score: 70 },
      { snapshot_date: '2026-09-22', band: 'red' as const, engagement_score: 20 },
    ];
    const s = computeChurnSignal(snaps);
    expect(s.decliningStreak).toBe(2);
  });

  it('flags at risk once the streak reaches the threshold (3)', () => {
    const snaps = [
      { snapshot_date: '2026-09-25', band: 'amber' as const, engagement_score: 40 },
      { snapshot_date: '2026-09-24', band: 'amber' as const, engagement_score: 40 },
      { snapshot_date: '2026-09-23', band: 'red' as const, engagement_score: 30 },
    ];
    expect(computeChurnSignal(snaps).atRisk).toBe(true);
  });

  it('computes a 7-day score delta against the nearest snapshot at or before that cutoff', () => {
    const snaps = [
      { snapshot_date: '2026-09-25', band: 'green' as const, engagement_score: 40 },
      { snapshot_date: '2026-09-18', band: 'green' as const, engagement_score: 70 },
      { snapshot_date: '2026-09-10', band: 'green' as const, engagement_score: 90 },
    ];
    const s = computeChurnSignal(snaps);
    expect(s.scoreDelta7d).toBe(-30); // 40 - 70, the 18th is exactly 7 days before the 25th
  });

  it('flags at risk on a steep score drop even with an all-green streak', () => {
    const snaps = [
      { snapshot_date: '2026-09-25', band: 'green' as const, engagement_score: 40 },
      { snapshot_date: '2026-09-18', band: 'green' as const, engagement_score: 70 },
    ];
    expect(computeChurnSignal(snaps).atRisk).toBe(true);
  });

  it('a client with no 7-day-old snapshot yet gets a null delta, not a false positive', () => {
    const snaps = [{ snapshot_date: '2026-09-25', band: 'green' as const, engagement_score: 10 }];
    const s = computeChurnSignal(snaps);
    expect(s.scoreDelta7d).toBeNull();
    expect(s.atRisk).toBe(false);
  });

  it('a healthy client with a short green history is never flagged', () => {
    const snaps = [
      { snapshot_date: '2026-09-25', band: 'green' as const, engagement_score: 80 },
      { snapshot_date: '2026-09-18', band: 'green' as const, engagement_score: 78 },
    ];
    expect(computeChurnSignal(snaps).atRisk).toBe(false);
  });
});
