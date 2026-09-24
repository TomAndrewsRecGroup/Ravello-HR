// A signature proves who MINTED a session cookie, not that it is still
// true. Until 2026-09-24 verifyPortalSession() never looked at `iat`, so
// a tps_portal_session value copied out of devtools verified for ever:
// a user deleted, demoted or moved months later could replay it — with
// no Supabase session at all — past the middleware fast path and into
// getSessionProfile(), which service-role routes trusted.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PORTAL_SESSION_TTL_SECONDS, signPortalSession, verifyPortalSession } from '../portalSession';

const NOW = 1_790_000_000;
const claims = { userId: 'u-1', role: 'client_admin', companyId: 'co-1', isTpsStaff: false };

beforeEach(() => { process.env.PORTAL_SESSION_SECRET = 'test-secret-that-is-long-enough'; });
afterEach(() => { delete process.env.PORTAL_SESSION_SECRET; });

describe('portal session cookie', () => {
  it('verifies inside its window', async () => {
    const raw = await signPortalSession({ ...claims, iat: NOW });
    expect(await verifyPortalSession(raw, NOW + 60)).toMatchObject(claims);
    expect(await verifyPortalSession(raw, NOW + PORTAL_SESSION_TTL_SECONDS)).not.toBeNull();
  });

  it('stops verifying once it is older than the TTL, however it was stored', async () => {
    const raw = await signPortalSession({ ...claims, iat: NOW });
    expect(await verifyPortalSession(raw, NOW + PORTAL_SESSION_TTL_SECONDS + 1)).toBeNull();
    expect(await verifyPortalSession(raw, NOW + 90 * 24 * 3600)).toBeNull();
  });

  it('refuses a cookie claiming to be issued in the future', async () => {
    const raw = await signPortalSession({ ...claims, iat: NOW + 3600 });
    expect(await verifyPortalSession(raw, NOW)).toBeNull();
  });

  it('refuses a validly signed payload with no iat', async () => {
    // Sign by hand without iat, the shape an older build could have minted.
    const { createHmac } = await import('node:crypto');
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const sig = createHmac('sha256', process.env.PORTAL_SESSION_SECRET!).update(Buffer.from(JSON.stringify(claims))).digest('base64url');
    expect(await verifyPortalSession(`${body}.${sig}`, NOW)).toBeNull();
  });

  it('still refuses a tampered payload', async () => {
    const raw = (await signPortalSession({ ...claims, iat: NOW }))!;
    const [, sig] = raw.split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, role: 'tps_admin', isTpsStaff: true, iat: NOW })).toString('base64url');
    expect(await verifyPortalSession(`${forged}.${sig}`, NOW)).toBeNull();
  });
});
