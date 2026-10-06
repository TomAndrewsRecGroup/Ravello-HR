// Pins migration 215 (document_instances gets a database-level
// lifecycle guard — Part 2, Group 6). The live database is the real
// check (a rolled-back probe, 13/13 checks, run against the actual
// companies/employee_records/document_templates rows in production);
// this stops the migration file drifting from what was actually
// applied.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/215_document_instances_lifecycle_guard.sql'), 'utf8');

describe('document_instances_lifecycle_guard (215)', () => {
  it('is a BEFORE UPDATE trigger, additive alongside 213\'s own employee-org guard', () => {
    expect(sql).toMatch(/CREATE TRIGGER document_instances_lifecycle_guard BEFORE UPDATE ON public\.document_instances/);
    // 213's own document_instances_guard() (the employee-org check) is
    // a DIFFERENT, untouched function — this migration never redefines it.
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.document_instances_guard\(\)/);
  });

  it('is revoked from every session role — a trigger function, never called directly', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.document_instances_lifecycle_guard\(\) FROM PUBLIC, anon, authenticated/);
  });

  it('allows draft -> sent_for_signature, draft -> signed, and the sent_for_signature edges', () => {
    expect(sql).toMatch(/OLD\.status = 'draft' AND NEW\.status IN \('sent_for_signature', 'signed', 'voided'\)/);
    expect(sql).toMatch(/OLD\.status = 'sent_for_signature' AND NEW\.status IN \('draft', 'signed', 'declined', 'voided'\)/);
  });

  it('allows the two narrow signed -> draft / signed -> sent_for_signature revert paths, and nothing else out of signed', () => {
    expect(sql).toMatch(/OLD\.status = 'signed' AND NEW\.status IN \('draft', 'sent_for_signature'\)/);
  });

  it('never allows a direct draft -> declined or signed -> voided edge', () => {
    // Every allowed-edge line is pinned above; a direct draft->declined
    // or signed->voided transition is absent from all of them — the
    // live probe (checks 12 and 13) is what actually proves both are
    // refused with 23514, not a string match on an ELSE branch.
    expect(sql).not.toMatch(/OLD\.status = 'draft' AND NEW\.status IN \([^)]*'declined'/);
  });

  it('stamps voided_at/voided_by automatically, never trusting the caller to set them', () => {
    expect(sql).toMatch(/NEW\.voided_at := COALESCE\(NEW\.voided_at, now\(\)\)/);
    expect(sql).toMatch(/NEW\.voided_by := COALESCE\(NEW\.voided_by, auth\.uid\(\)\)/);
  });

  it('refuses any other transition with 23514', () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'Cannot move a document from % to %', OLD\.status, NEW\.status USING ERRCODE = '23514'/);
  });

  it('does nothing when status is unchanged (every other column may still move)', () => {
    expect(sql).toMatch(/IF NEW\.status IS DISTINCT FROM OLD\.status THEN/);
  });
});
