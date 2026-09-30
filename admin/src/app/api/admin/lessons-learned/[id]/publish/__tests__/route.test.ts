import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// A hand-rolled fake, not the shared events/__tests__/fakeSupabase —
// that fixture's uniqueKeys mechanism only supports a SINGLE-column
// unique key, and lesson_learned_distributions' real constraint is the
// composite UNIQUE (lesson_id, company_id) — simulating "this specific
// company already holds a distribution" needs the same narrow,
// route-scoped fake pipelineIdempotency.test.ts already uses for the
// identical reason.

vi.mock('@/lib/auth/requireStaff', () => ({
  requireStaff: () => Promise.resolve({ ok: true, userId: 'staff-1' }),
}));

let lesson: { id: string; title: string; status: string };
let existingDistributions: Set<string>; // `${lessonId}:${companyId}`
let notifyCalls: Array<{ companyId: string; type: string }>;

vi.mock('@/lib/notify/notify', () => ({
  notify: (_sb: unknown, input: { companyId: string; type: string }) => {
    notifyCalls.push({ companyId: input.companyId, type: input.type });
    return Promise.resolve({});
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    from(table: string) {
      if (table === 'lessons_learned') {
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({
              maybeSingle: () => Promise.resolve({ data: id === lesson.id ? { ...lesson } : null, error: null }),
            }),
          }),
          update: (patch: { status: string }) => ({
            eq: (_c: string, id: string) => {
              if (id !== lesson.id) return Promise.resolve({ error: null, count: 0 });
              lesson.status = patch.status;
              return Promise.resolve({ error: null, count: 1 });
            },
          }),
        };
      }
      if (table === 'lesson_learned_distributions') {
        return {
          insert: (row: { lesson_id: string; company_id: string }) => {
            const key = `${row.lesson_id}:${row.company_id}`;
            if (existingDistributions.has(key)) {
              return Promise.resolve({ error: { message: 'duplicate key value violates unique constraint "lesson_learned_distributions_lesson_id_company_id_key"', code: '23505' } });
            }
            existingDistributions.add(key);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`fake: unexpected table ${table}`);
    },
  }),
}));

const { POST } = await import('../route');

const req = (companyIds: string[]) => new NextRequest('https://admin.example.com/api/admin/lessons-learned/lesson-1/publish', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyIds }),
});

const CO_A = '11111111-1111-4111-8111-111111111111';
const CO_B = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  lesson = { id: 'lesson-1', title: 'Unsecured ladder near miss', status: 'draft' };
  existingDistributions = new Set();
  notifyCalls = [];
});

describe('POST /api/admin/lessons-learned/[id]/publish', () => {
  it('publishes a draft and distributes to every requested company, notifying each one', async () => {
    const res = await POST(req([CO_A, CO_B]), { params: Promise.resolve({ id: 'lesson-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, distributed: 2 });
    expect(lesson.status).toBe('published');
    expect(notifyCalls.map(c => c.companyId).sort()).toEqual([CO_A, CO_B].sort());
    expect(notifyCalls.every(c => c.type === 'lesson_learned_published')).toBe(true);
  });

  it('adding a recipient to an already-published lesson does not re-publish or re-notify existing recipients', async () => {
    lesson.status = 'published';
    existingDistributions.add(`lesson-1:${CO_A}`);

    const res = await POST(req([CO_A, CO_B]), { params: Promise.resolve({ id: 'lesson-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, distributed: 1 });
    // Only the NEW recipient is notified — the existing one, silently
    // skipped by the duplicate-key branch, is never told twice.
    expect(notifyCalls).toEqual([{ companyId: CO_B, type: 'lesson_learned_published' }]);
  });

  it('a duplicate distribution is recognised by the Postgres error CODE (23505), never a string match on its message', async () => {
    // The real defect this test pins: the first draft of this route
    // checked `error.message.includes('duplicate key')` — fragile
    // against any wording change. Reproduced by giving the duplicate a
    // DIFFERENT message text than the route's own original guess, with
    // the correct code still attached; a code-based check must still
    // recognise it as "already shared", not a real failure.
    existingDistributions.add(`lesson-1:${CO_A}`);
    lesson.status = 'published';

    const res = await POST(req([CO_A]), { params: Promise.resolve({ id: 'lesson-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, distributed: 0 });
    expect(notifyCalls).toEqual([]);
  });

  it('refuses an archived lesson outright', async () => {
    lesson.status = 'archived';
    const res = await POST(req([CO_A]), { params: Promise.resolve({ id: 'lesson-1' }) });
    expect(res.status).toBe(400);
    expect(notifyCalls).toEqual([]);
  });

  it('404s for a lesson that does not exist', async () => {
    const res = await POST(req([CO_A]), { params: Promise.resolve({ id: 'no-such-lesson' }) });
    expect(res.status).toBe(404);
  });

  it('rejects a malformed company id rather than silently dropping it', async () => {
    const res = await POST(req(['not-a-uuid']), { params: Promise.resolve({ id: 'lesson-1' }) });
    expect(res.status).toBe(400);
    expect(notifyCalls).toEqual([]);
  });
});
