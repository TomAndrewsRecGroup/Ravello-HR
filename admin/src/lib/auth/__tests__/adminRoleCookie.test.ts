// The admin role cookie must be impossible to hand-craft. Until
// 2026-09-24 it held the bare role string and was trusted as-is, so
// `tpo_admin_role=tps_admin` set in devtools opened staff pages to any
// signed-in user.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ROLE_CACHE_SECONDS, signAdminRole, verifyAdminRole } from '../adminRoleCookie';

const NOW = 1_800_000_000;
const STAFF = { userId: '3f6b51bb-d9ac-43ef-9252-ff4274143897', role: 'tps_admin' };

beforeEach(() => { process.env.ADMIN_SESSION_SECRET = 'test-secret-that-is-long-enough'; });
afterEach(() => { delete process.env.ADMIN_SESSION_SECRET; });

describe('adminRoleCookie', () => {
  it('round-trips a signed role for the user it was minted for', async () => {
    const raw = await signAdminRole(STAFF, NOW);
    expect(raw).toMatch(/^[\w-]+\.[\w-]+$/);
    expect(await verifyAdminRole(raw, STAFF.userId, NOW + 10)).toEqual({ ...STAFF, iat: NOW });
  });

  it('refuses the bare role string the old cookie held', async () => {
    expect(await verifyAdminRole('tps_admin', STAFF.userId, NOW)).toBeNull();
  });

  it('refuses a payload edited to claim staff', async () => {
    const raw = (await signAdminRole({ userId: STAFF.userId, role: 'client_admin' }, NOW))!;
    const [, sig] = raw.split('.');
    const forged = Buffer.from(JSON.stringify({ ...STAFF, iat: NOW })).toString('base64url');
    expect(await verifyAdminRole(`${forged}.${sig}`, STAFF.userId, NOW)).toBeNull();
  });

  it('refuses a genuine staff cookie presented by a different user', async () => {
    const raw = await signAdminRole(STAFF, NOW);
    expect(await verifyAdminRole(raw, 'b88e11e9-acaa-4698-9c3f-2a20750d5ee5', NOW)).toBeNull();
  });

  it('stops verifying after the cache window, whatever the browser expiry says', async () => {
    const raw = await signAdminRole(STAFF, NOW);
    expect(await verifyAdminRole(raw, STAFF.userId, NOW + ROLE_CACHE_SECONDS)).not.toBeNull();
    expect(await verifyAdminRole(raw, STAFF.userId, NOW + ROLE_CACHE_SECONDS + 1)).toBeNull();
  });

  it('refuses a cookie signed with another secret', async () => {
    const raw = await signAdminRole(STAFF, NOW);
    process.env.ADMIN_SESSION_SECRET = 'a-different-secret';
    expect(await verifyAdminRole(raw, STAFF.userId, NOW)).toBeNull();
  });

  it('with no secret configured, signs nothing and verifies nothing', async () => {
    const raw = await signAdminRole(STAFF, NOW);
    delete process.env.ADMIN_SESSION_SECRET;
    expect(await signAdminRole(STAFF, NOW)).toBeNull();
    expect(await verifyAdminRole(raw, STAFF.userId, NOW)).toBeNull();
  });

  it('refuses malformed values without throwing', async () => {
    for (const bad of ['', '.', 'abc.', '.abc', 'no-dot-here', '!!!.???']) {
      expect(await verifyAdminRole(bad, STAFF.userId, NOW)).toBeNull();
    }
  });
});
