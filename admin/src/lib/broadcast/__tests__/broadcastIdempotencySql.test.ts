// Pins migration 191 (Core-OS 360 Completion Programme, Phase 25,
// Group 1: Broadcast idempotency key, closing gap-ledger row C1.11).
// The live database is the real check (a rolled-back probe confirming
// staff insert, a genuine 23505 on a repeated id, and refused client
// read/insert); this stops the migration file drifting from what was
// applied and pins the properties a text scan CAN verify.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/191_broadcast_idempotency.sql'), 'utf8');

describe('Broadcast idempotency (191)', () => {
  it('creates broadcast_sends with id as the PRIMARY KEY — the caller-supplied key is what claims a send', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.broadcast_sends/);
    expect(sql).toMatch(/id\s+uuid PRIMARY KEY/);
  });

  it('is staff-only — one FOR ALL policy gated on is_tps_staff(), no client policy of any kind', () => {
    expect(sql).toMatch(/CREATE POLICY broadcast_sends_staff_all ON public\.broadcast_sends FOR ALL TO authenticated/);
    expect(sql).toMatch(/USING \(\(SELECT public\.is_tps_staff\(\)\)\) WITH CHECK \(\(SELECT public\.is_tps_staff\(\)\)\)/);
    expect(sql.match(/CREATE POLICY/g)).toHaveLength(1);
  });

  it('enables RLS and revokes anon entirely', () => {
    expect(sql).toMatch(/ALTER TABLE public\.broadcast_sends ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON public\.broadcast_sends FROM anon/);
  });

  it('adds no write guard and no audit_row trigger — a pure claim/bookkeeping table, the email_log (074) precedent: nothing here is client-writable to guard, and the route\'s own auditLog() call already records the real trail', () => {
    expect(sql).not.toMatch(/apply_write_guard/);
    expect(sql).not.toMatch(/FOR EACH ROW EXECUTE FUNCTION public\.audit_row/);
    expect(sql).not.toMatch(/CREATE TRIGGER/);
  });
});
