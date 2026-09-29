import { beforeEach, describe, expect, it, vi } from 'vitest';

// Core-OS 360 Phase 6, Group 7 (section 12): the poll endpoint
// StaleOrganisationGuard uses. No write of its own; the only thing
// worth pinning is that a signed-out caller is refused and a signed-in
// one gets back exactly what readEffectiveCompany() resolved.

let user: { id: string } | null;
let liveCompanyId: string | null;

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => Promise.resolve({
    auth: { getUser: () => Promise.resolve({ data: { user } }) },
  }),
}));

vi.mock('@/lib/auth/activeOrganisation', () => ({
  readEffectiveCompany: () => Promise.resolve({ ok: true, companyId: liveCompanyId }),
}));

const { GET } = await import('../route');

beforeEach(() => {
  user = { id: 'u-1' };
  liveCompanyId = 'co-b';
});

describe('GET /api/organisation/current', () => {
  it('returns the live company id for a signed-in caller', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ companyId: 'co-b' });
  });

  it('refuses a signed-out caller', async () => {
    user = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
