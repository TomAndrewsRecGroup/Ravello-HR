import { describe, expect, it } from 'vitest';
import { emptyTally } from '../pipeline';
import { isUnhealthy } from '../runScan';

// Found live 2026-10-14: a run with exactly one applicant that hour,
// and a single Manatal read failure for them, tripped "unhealthy" and
// made the route return 500 — which is what triggered an email alert
// reporting "the referral scan failed" for what the rest of that
// hour's data (and every run before and after it) show was a harmless,
// one-off blip. See runScan.ts's own isUnhealthy() comment for the
// full reasoning; this pins the arithmetic that comment describes.
describe('isUnhealthy', () => {
  it('a single scan error out of a single attempt is NOT unhealthy — this is the exact 2026-10-14 05:01 UTC incident', () => {
    const tally = emptyTally();
    tally.scanned = 0;
    tally.scan_errors = 1;
    tally.roles_considered = 3;
    expect(isUnhealthy(tally)).toBe(false);
  });

  it('two scan errors out of two attempts (100%) IS unhealthy — the absolute floor does not mask a real small-scale failure', () => {
    const tally = emptyTally();
    tally.scanned = 0;
    tally.scan_errors = 2;
    tally.roles_considered = 3;
    expect(isUnhealthy(tally)).toBe(true);
  });

  it('two scan errors out of five attempts (40%) is NOT unhealthy — under the ratio threshold', () => {
    const tally = emptyTally();
    tally.scanned = 3;
    tally.scan_errors = 2;
    tally.roles_considered = 3;
    expect(isUnhealthy(tally)).toBe(false);
  });

  it('a real outage shape — many errors, high ratio — is still caught', () => {
    const tally = emptyTally();
    tally.scanned = 1;
    tally.scan_errors = 9;
    tally.roles_considered = 3;
    expect(isUnhealthy(tally)).toBe(true);
  });

  it('a quiet hour with nothing attempted at all is healthy, not a failure', () => {
    const tally = emptyTally();
    tally.roles_considered = 3;
    expect(isUnhealthy(tally)).toBe(false);
  });

  it('a clean, fully successful run is healthy', () => {
    const tally = emptyTally();
    tally.scanned = 5;
    tally.roles_considered = 3;
    expect(isUnhealthy(tally)).toBe(false);
  });

  it('every role unreadable this run (roles_considered 0, something skipped) is still unhealthy regardless of scan_errors', () => {
    const tally = emptyTally();
    tally.roles_considered = 0;
    tally.roles_skipped = 1;
    expect(isUnhealthy(tally)).toBe(true);
  });
});
