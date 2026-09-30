// Pins migration 196 (Core-OS 360 Completion Programme, Phase 26,
// Group 4: QR coverage beyond people, closing gap-ledger row C14.9).
// The live database is the real check (a rolled-back probe: a token
// for a real asset/COSHH assessment resolves status-only fields, an
// unknown entity_id is refused, a second active token for the same
// entity is refused, revoking then minting succeeds, an unrecognised
// entity_type is refused both by the fill trigger AND the CHECK
// constraint independently, an unknown token hash resolves not_found
// with no error — 9/9 passed, no trace left live); this stops the
// migration file drifting from what was applied and pins the
// properties a text scan CAN verify.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/196_entity_qr_tokens.sql'), 'utf8');
const sqlNoComments = sql.replace(/^\s*--.*$/gm, '');

describe('entity_qr_tokens (196)', () => {
  it('scopes entity_type to exactly the two covered kinds — never a third, undocumented one', () => {
    expect(sql).toMatch(/CHECK \(entity_type IN \('equipment', 'coshh_assessment'\)\)/);
  });

  it('has RLS enabled and NO session policies at all — the worker_qr_tokens/policy_ack_tokens shape', () => {
    expect(sql).toMatch(/ALTER TABLE public\.entity_qr_tokens ENABLE ROW LEVEL SECURITY/);
    expect(sqlNoComments).not.toMatch(/CREATE POLICY/);
  });

  it('enforces at most one ACTIVE token per (entity_type, entity_id)', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX entity_qr_tokens_one_active\s+ON public\.entity_qr_tokens \(entity_type, entity_id\) WHERE revoked_at IS NULL/);
  });

  it('the fill() trigger derives company_id via hs_entity_company(), never trusting the caller', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.entity_qr_tokens_fill()');
    const body = sql.slice(start, sql.indexOf('$$;', start) + 3);
    expect(body).toMatch(/derived := public\.hs_entity_company\(NEW\.entity_type, NEW\.entity_id\)/);
    expect(body).toMatch(/NEW\.company_id := derived/);
    expect(body).toMatch(/RAISE EXCEPTION.*USING ERRCODE = '23503'/);
  });

  it('registers the BEFORE INSERT fill trigger exactly once', () => {
    expect(sql.match(/CREATE TRIGGER entity_qr_tokens_fill/g)).toHaveLength(1);
    expect(sql).toMatch(/BEFORE INSERT ON public\.entity_qr_tokens/);
  });

  it('entity_qr_status() only ever selects status-shaped columns, never a free-text one', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.entity_qr_status(p_token_hash text)');
    const body = sql.slice(start, sql.indexOf('REVOKE ALL', start));
    for (const forbidden of ['notes', 'description', 'task_or_process', 'spill_response', 'existing_controls', 'emergency_arrangements']) {
      expect(body, forbidden).not.toMatch(new RegExp(`'${forbidden}'`));
    }
    expect(body).toMatch(/'status', e\.status/);
    expect(body).toMatch(/'status', c\.status/);
  });

  it('entity_qr_status() is revoked from PUBLIC/anon/authenticated and granted to service_role only', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.entity_qr_status\(text\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.entity_qr_status\(text\) TO service_role/);
  });

  it('a revoked or unknown token always resolves { ok: false, reason: not_found } — no error surfaced', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.entity_qr_status(p_token_hash text)');
    const body = sql.slice(start, sql.indexOf('$$;', start) + 3);
    expect(body.match(/'ok', false, 'reason', 'not_found'/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
