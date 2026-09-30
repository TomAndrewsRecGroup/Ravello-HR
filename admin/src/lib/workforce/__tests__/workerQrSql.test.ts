// Pins migration 179 (Core-OS 360 Phase 14, Group 1). worker_qr_tokens
// is a durable badge token — the one deliberate departure from every
// other token table in this codebase (profile_access_tokens/091,
// policy_ack_tokens/103, hs_test_tokens/116 are all single-use). What
// stays the same, and what this test pins: RLS on with NO session
// policies at all (service role only), and the public-safe status
// function never leaking reasons/requirements.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/179_worker_qr_system.sql'), 'utf8');

describe('worker_qr_tokens (179)', () => {
  it('has RLS enabled and REVOKEs all session access — service role only', () => {
    expect(sql).toMatch(/ALTER TABLE public\.worker_qr_tokens ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON public\.worker_qr_tokens FROM PUBLIC, anon, authenticated/);
  });

  it('has NO CREATE POLICY of its own anywhere in the migration', () => {
    expect(sql).not.toMatch(/CREATE POLICY \w+ ON public\.worker_qr_tokens/);
  });

  it('stores only a SHA-256 hash, never a raw token column', () => {
    expect(sql).toMatch(/token_hash\s+text NOT NULL UNIQUE CHECK \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
    expect(sql).not.toMatch(/\btoken\s+text/);
  });

  it('enforces at most one ACTIVE token per person via a partial unique index', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS worker_qr_tokens_one_active_per_person\s+ON public\.worker_qr_tokens \(person_id\) WHERE revoked_at IS NULL/,
    );
  });

  it('derives company_id from the person in a BEFORE INSERT trigger, never trusting the caller', () => {
    expect(sql).toMatch(/CREATE TRIGGER worker_qr_tokens_fill BEFORE INSERT ON public\.worker_qr_tokens/);
    expect(sql).toMatch(/SELECT company_id INTO NEW\.company_id FROM public\.people WHERE id = NEW\.person_id/);
  });

  it('audits created/updated (mint/revoke) but the whitelist never includes token_hash', () => {
    const trigger = sql.match(/CREATE TRIGGER worker_qr_tokens_audit[\s\S]*?;/)?.[0] ?? '';
    expect(trigger).toMatch(/audit_row\('worker_qr_token', 'company_id', 'person_id', 'revoked_at'\)/);
    expect(trigger).not.toMatch(/token_hash/);
  });
});

describe('worker_qr_status() (179)', () => {
  it('is REVOKEd from PUBLIC/anon/authenticated and granted to service_role only', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.worker_qr_status\(text\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.worker_qr_status\(text\) TO service_role/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.worker_qr_status\(text\) TO (anon|authenticated)/);
  });

  it('returns only status, never the engine\'s reasons/requirements arrays', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.worker_qr_status[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(fn).toMatch(/'status', result->>'status'/);
    expect(fn).not.toMatch(/'reasons'/);
    expect(fn).not.toMatch(/'requirements'/);
  });

  it('is SECURITY DEFINER (so it can call the otherwise-locked-down _wf_deployment_safe)', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.worker_qr_status[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(fn).toMatch(/SECURITY DEFINER/);
  });
});

function policies(text: string, table: string) {
  return [...text.matchAll(new RegExp(`CREATE POLICY (\\w+) ON public\\.${table} FOR (\\w+)[\\s\\S]*?;`, 'g'))]
    .map(m => ({ name: m[1], cmd: m[2] }));
}

describe('site_checkins (179)', () => {
  it('has RLS enabled, exactly a staff ALL policy and a client SELECT policy — no client write policy at all', () => {
    expect(sql).toMatch(/ALTER TABLE public\.site_checkins ENABLE ROW LEVEL SECURITY/);
    const pols = policies(sql, 'site_checkins');
    expect(pols).toHaveLength(2);
    expect(pols.find(p => p.name === 'site_checkins_staff_all')?.cmd).toBe('ALL');
    expect(pols.find(p => p.name === 'site_checkins_client_read')?.cmd).toBe('SELECT');
  });

  it('the staff policy requires is_tps_staff(), the client policy requires workforce.read', () => {
    expect(sql).toMatch(/CREATE POLICY site_checkins_staff_all ON public\.site_checkins FOR ALL[\s\S]*?is_tps_staff\(\)/);
    expect(sql).toMatch(/CREATE POLICY site_checkins_client_read ON public\.site_checkins FOR SELECT[\s\S]*?workforce\.read/);
  });

  it('refuses a site belonging to a different organisation than the person', () => {
    expect(sql).toMatch(/site_checkins: site does not belong to this person''s organisation/);
  });

  it('enforces at most one OPEN check-in per person via a partial unique index', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS site_checkins_one_open_per_person\s+ON public\.site_checkins \(person_id\) WHERE checked_out_at IS NULL/,
    );
  });

  it('has no outbox (platform_events) trigger — a deliberate Group 1 scope decision, not an oversight', () => {
    expect(sql).not.toMatch(/platform_event_row/);
  });
});

describe('workforce_employee_sync() leaver revoke (180)', () => {
  const sql180 = readFileSync(join(__dirname, '../../../../../supabase/migrations/180_worker_qr_leaver_revoke.sql'), 'utf8');

  it('revokes any active worker_qr_tokens row inside the SAME "leaving" branch that already ends assignments', () => {
    const leavingBranch = sql180.match(/IF NEW\.status::text = 'terminated'[\s\S]*?END IF;/)?.[0] ?? '';
    expect(leavingBranch).toMatch(/UPDATE worker_qr_tokens SET revoked_at = now\(\), revoked_by = NULL/);
    expect(leavingBranch).toMatch(/WHERE person_id = NEW\.person_id AND company_id = NEW\.company_id AND revoked_at IS NULL/);
  });

  it('extends the EXISTING workforce_employee_sync() function rather than adding a new trigger', () => {
    expect(sql180).toMatch(/CREATE OR REPLACE FUNCTION public\.workforce_employee_sync\(\)/);
    expect(sql180).not.toMatch(/CREATE TRIGGER/);
  });
});
