// The PATCH to Manatal uses the platform-wide API key, so this route is
// the only thing stopping one client moving another client's candidates.
// Until 2026-09-24 its only check was that the caller's company HAD a
// Manatal id; any integer matchId was then moved — and the upstream match
// (candidate names and emails) echoed back. Found by the second security
// review. Drives the real handler; asserts on the calls Manatal received.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const OWN_ORG = '1234567';
const patched: { matchId: number; stageId: number }[] = [];

vi.mock('@/lib/manatal', () => ({
  isManatalConfigured: () => true,
  getManatalMatches: (org: string) => Promise.resolve(org === OWN_ORG ? [{ id: 101 }, { id: 102 }] : [{ id: 999 }]),
  getManatalStages:  () => Promise.resolve([{ id: 1, name: 'Applied' }, { id: 2, name: 'Interview' }]),
  updateMatchStage:  (matchId: number, stageId: number) => {
    patched.push({ matchId, stageId });
    return Promise.resolve({ id: matchId, candidate: { email: 'someone@example.com' } });
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u-1', email: 'u@own.example' } } }) },
    from: (table: string) => table === 'profiles'
      ? {
          select: () => ({
            eq: (_c: string, _v: string) => ({
              single: () => Promise.resolve({ data: { company_id: 'co-own', full_name: 'U', companies: { manatal_client_id: OWN_ORG, name: 'Own' } } }),
            }),
          }),
        }
      : { insert: () => Promise.resolve({ error: null }) },
  }),
}));

import { POST } from '../route';

function move(body: unknown) {
  return POST(new Request('https://portal.thepeoplesystem.co.uk/api/manatal/matches/move-stage', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }) as any);
}

beforeEach(() => { patched.length = 0; });

describe('moving a Manatal match', () => {
  it("refuses a match that is not in the caller's own organisation", async () => {
    const res = await move({ matchId: 999, stageId: 2 });
    expect(res.status).toBe(404);
    expect(patched).toEqual([]);
  });

  it('refuses an unknown stage', async () => {
    const res = await move({ matchId: 101, stageId: 77 });
    expect(res.status).toBe(400);
    expect(patched).toEqual([]);
  });

  it('moves its own match, and does not echo the upstream record back', async () => {
    const res = await move({ matchId: 101, stageId: 2 });
    expect(res.status).toBe(200);
    expect(patched).toEqual([{ matchId: 101, stageId: 2 }]);
    expect(JSON.stringify(await res.json())).not.toContain('someone@example.com');
  });
});
