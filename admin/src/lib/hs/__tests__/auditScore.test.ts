import { describe, expect, it } from 'vitest';
import { computeAuditScore, countFindings } from '../auditScore';

const r = (rating: 'pass' | 'fail' | 'na') => ({ rating });

describe('computeAuditScore', () => {
  it('is the pass share of applicable (pass+fail) answers', () => {
    expect(computeAuditScore([r('pass'), r('pass'), r('fail')])).toBe(67); // 2/3 rounded
    expect(computeAuditScore([r('pass'), r('pass'), r('pass'), r('pass')])).toBe(100);
    expect(computeAuditScore([r('fail')])).toBe(0);
  });

  it('excludes na from both sides of the ratio, not counted as pass or fail', () => {
    // 1 pass, 1 fail, 2 na -> 50%, not 25% (if na counted as fail) or 75%.
    expect(computeAuditScore([r('pass'), r('fail'), r('na'), r('na')])).toBe(50);
  });

  it('is null when nothing is applicable (all na, or no answers at all)', () => {
    expect(computeAuditScore([r('na'), r('na')])).toBeNull();
    expect(computeAuditScore([])).toBeNull();
  });
});

describe('countFindings', () => {
  it('counts only fail ratings', () => {
    expect(countFindings([r('pass'), r('fail'), r('na'), r('fail')])).toBe(2);
    expect(countFindings([r('pass'), r('na')])).toBe(0);
  });
});
