import { describe, expect, it } from 'vitest';
import { readEffectiveCompany, sessionIsStale } from '../activeOrganisation';

// The layout redirects to /api/organisation/refresh when the signed
// cookie names a different tenant from the database. Two failure modes
// matter: missing a real change (stale tenant on screen) and acting on a
// failed read (a redirect loop for as long as the database is down).

describe('sessionIsStale', () => {
  it('is stale when the database names another organisation', () => {
    expect(sessionIsStale('org-a', { ok: true, companyId: 'org-b' })).toBe(true);
  });
  it('is stale when a grant was revoked back to no company', () => {
    expect(sessionIsStale('org-a', { ok: true, companyId: null })).toBe(true);
  });
  it('is fresh when they agree (every single-organisation user)', () => {
    expect(sessionIsStale('org-a', { ok: true, companyId: 'org-a' })).toBe(false);
    expect(sessionIsStale('', { ok: true, companyId: null })).toBe(false);
  });
  it('never acts on a failed read', () => {
    expect(sessionIsStale('org-a', { ok: false, companyId: null })).toBe(false);
  });
});

describe('readEffectiveCompany', () => {
  const client = (res: { data: unknown; error: unknown }) => ({ rpc: async () => res }) as never;
  it('distinguishes "no company" from "could not ask"', async () => {
    expect(await readEffectiveCompany(client({ data: null, error: null }))).toEqual({ ok: true, companyId: null });
    expect(await readEffectiveCompany(client({ data: null, error: { message: 'down' } }))).toEqual({ ok: false, companyId: null });
    expect(await readEffectiveCompany(client({ data: 'org-a', error: null }))).toEqual({ ok: true, companyId: 'org-a' });
  });
});
