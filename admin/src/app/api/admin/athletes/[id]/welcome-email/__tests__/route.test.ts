import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Core-OS 360 Completion Programme, Phase 29 (PL.1) — closes a real
// gap this phase's own plan doc named but Group 2 never covered: "the
// admin resend route sends the same [A2I] shell" as the portal's
// public signup route. athleteWelcome.test.ts already covers the
// template in isolation (UNIT-ONLY); this drives the real route.
//
// athleteWelcomeEmail is left UNMOCKED so the real A2I navy/gold shell
// is exercised end to end, the same discipline the sibling public A2I
// signup test (../../../r/athlete/[slug]/__tests__/route.test.ts) uses
// — only sendEmail (a real Resend fetch) is mocked.

let staffOk: boolean;
let athlete: Record<string, unknown> | null;
let updatedAthletes: Array<{ id: string; patch: Record<string, unknown> }>;
let sendResult: { delivered: boolean; id?: string } | null;
let sent: Array<{ to: string; subject: string; html: string }>;
let auditCalls: unknown[];

vi.mock('@/lib/auth/requireStaff', () => ({
  requireStaff: () =>
    Promise.resolve(
      staffOk ? { ok: true, userId: 'staff-1' } : { ok: false, response: new Response('no', { status: 403 }) },
    ),
}));

vi.mock('@/lib/rateLimit', () => ({
  limiters: { email: { check: () => ({ allowed: true, resetAt: 0 }) } },
  getUserRateLimitKey: () => 'k',
  rateLimitResponse: () => new Response('rate limited', { status: 429 }),
}));

vi.mock('@/lib/audit', () => ({ auditLog: (e: unknown) => { auditCalls.push(e); } }));

vi.mock('@/lib/email', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/email')>();
  return {
    ...actual,
    sendEmail: vi.fn((input: { to: string; subject: string; html: string }) => {
      if (sendResult?.delivered) sent.push(input);
      return Promise.resolve(sendResult);
    }),
    lastEmailError: () => (sendResult?.delivered ? null : { message: 'Resend rejected the request' }),
  };
});

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () =>
    Promise.resolve({
      from(table: string) {
        if (table !== 'athletes') throw new Error(`unexpected table ${table}`);
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve(athlete ? { data: athlete, error: null } : { data: null, error: { message: 'not found' } }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (_col: string, id: string) => {
              updatedAthletes.push({ id, patch });
              if (athlete && athlete.id === id) Object.assign(athlete, patch);
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      },
    }),
}));

const { POST } = await import('../route');

const ATHLETE_ID = '11111111-1111-4111-8111-111111111111';
const req = () => new NextRequest(`https://admin.example.com/api/admin/athletes/${ATHLETE_ID}/welcome-email`, { method: 'POST' });
const params = () => Promise.resolve({ id: ATHLETE_ID });

beforeEach(() => {
  staffOk = true;
  athlete = { id: ATHLETE_ID, full_name: 'Jordan Smith', email: 'jordan@example.com' };
  updatedAthletes = [];
  sendResult = { delivered: true, id: 'resend-1' };
  sent = [];
  auditCalls = [];
});

describe('POST /api/admin/athletes/[id]/welcome-email', () => {
  it('sends the SAME A2I navy/gold shell the public signup route sends, never the purple TPS one', async () => {
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('Your Athletes To Industry journey starts here');
    expect(sent[0].html).toMatch(/Andrews Recruitment Group's Athletes To Industry programme/);
    expect(sent[0].html).toMatch(/Operated by Andrews Recruitment Group/);
    expect(sent[0].html).toMatch(/#c9a24a/); // A2I.gold
    expect(sent[0].html).not.toMatch(/The People System's Athletes To Industry/);
  });

  it('stamps welcome_email_sent_at and welcome_email_sent_by from the STAFF SESSION', async () => {
    await POST(req(), { params: params() });
    expect(updatedAthletes).toHaveLength(1);
    expect(updatedAthletes[0].patch).toMatchObject({ welcome_email_sent_by: 'staff-1' });
    expect(updatedAthletes[0].patch.welcome_email_sent_at).toBeTruthy();
  });

  it('does NOT refuse a re-send — admin may send again, and the timestamp updates each time', async () => {
    athlete!.welcome_email_sent_at = '2026-01-01T09:00:00.000Z';
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(updatedAthletes[0].patch.welcome_email_sent_at).not.toBe('2026-01-01T09:00:00.000Z');
  });

  it('refuses with 403 when the caller is not staff, sending nothing', async () => {
    staffOk = false;
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(403);
    expect(sent).toHaveLength(0);
  });

  it('refuses a malformed athlete id with 400 before any lookup', async () => {
    const res = await POST(req(), { params: Promise.resolve({ id: 'not-a-uuid' }) });
    expect(res.status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('refuses with 404 for an athlete that does not exist', async () => {
    athlete = null;
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(404);
  });

  it('refuses with 400 when the athlete has no email on file', async () => {
    athlete!.email = null;
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('reports 502 and updates NOTHING when the send itself fails', async () => {
    sendResult = { delivered: false };
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(502);
    expect(updatedAthletes).toHaveLength(0);
  });
});
