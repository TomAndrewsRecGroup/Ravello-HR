// Pins migration 186 (Core-OS 360 Completion Programme, Phase 22,
// closes C5.3). 157's own header comment flagged this as a known,
// documented simplification: "the comparison direction... assumes an
// UPPER-bound limit... a lower-bound limit is a known, documented
// simplification for a later group." Vocabulary coverage (the
// limit_direction CHECK matching ENVIRONMENTAL_MONITORING_LIMIT_
// DIRECTIONS) is pinned by vocab.test.ts; this asserts the shape of
// the GENERATED column, the range-inversion guard, and that the table
// stays insert-only. The live database is the real check
// (supabase/probes/186_environmental_monitoring_limit_direction.sql,
// 12/12 pass); this stops the migration file drifting from what was
// applied.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/186_environmental_monitoring_limit_direction.sql'), 'utf8');

describe('environmental_monitoring limit_direction (186)', () => {
  it('limit_direction defaults to upper — every pre-186 row keeps its existing meaning', () => {
    expect(sql).toMatch(/limit_direction text NOT NULL DEFAULT 'upper'/);
  });

  it('within_limit is dropped and re-added as a GENERATED column, never a plain column a session could write', () => {
    expect(sql).toMatch(/ALTER TABLE public\.environmental_monitoring DROP COLUMN IF EXISTS within_limit/);
    expect(sql).toMatch(/ALTER TABLE public\.environmental_monitoring ADD COLUMN within_limit boolean GENERATED ALWAYS AS \(/);
    expect(sql).toMatch(/\) STORED;/);
  });

  it('the upper branch is untouched from the pre-186 formula (value <= recorded_limit)', () => {
    expect(sql).toMatch(/WHEN limit_direction = 'upper' THEN\s*\n\s*CASE WHEN recorded_limit IS NULL THEN NULL ELSE \(value <= recorded_limit\) END/);
  });

  it('the lower branch inverts the comparison (value >= recorded_limit, a minimum)', () => {
    expect(sql).toMatch(/WHEN limit_direction = 'lower' THEN\s*\n\s*CASE WHEN recorded_limit IS NULL THEN NULL ELSE \(value >= recorded_limit\) END/);
  });

  it('the range branch requires BOTH bounds on file before ever evaluating', () => {
    expect(sql).toMatch(/WHEN limit_direction = 'range' THEN\s*\n\s*CASE WHEN recorded_limit IS NULL OR recorded_limit_upper IS NULL THEN NULL/);
    expect(sql).toMatch(/ELSE \(value >= recorded_limit AND value <= recorded_limit_upper\) END/);
  });

  it('an inverted range (upper < lower) is refused by a BEFORE INSERT guard, not silently accepted', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.environmental_monitoring_range_guard\(\)[\s\S]*?SECURITY DEFINER/);
    expect(sql).toMatch(/NEW\.recorded_limit_upper < NEW\.recorded_limit THEN/);
    expect(sql).toMatch(/RAISE EXCEPTION 'The upper bound of a range must not be less than the lower bound' USING ERRCODE = '23514'/);
    expect(sql).toMatch(/CREATE TRIGGER environmental_monitoring_range_guard BEFORE INSERT ON public\.environmental_monitoring/);
  });

  it('the range guard is revoked from every session role', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.environmental_monitoring_range_guard\(\) FROM PUBLIC, anon, authenticated/);
  });

  it('the audit and outbox triggers are RE-CREATED to widen their whitelist, never leaving a stale definition behind', () => {
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS environmental_monitoring_audit ON public\.environmental_monitoring/);
    expect(sql).toMatch(/CREATE TRIGGER environmental_monitoring_audit AFTER INSERT ON public\.environmental_monitoring\s*\n\s*FOR EACH ROW EXECUTE FUNCTION public\.audit_row\('environmental_monitoring', 'company_id', 'category', 'parameter', 'limit_direction', 'within_limit'\)/);
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS environmental_monitoring_platform_event ON public\.environmental_monitoring/);
    expect(sql).toMatch(
      /CREATE TRIGGER environmental_monitoring_platform_event AFTER INSERT ON public\.environmental_monitoring\s*\n\s*FOR EACH ROW EXECUTE FUNCTION public\.platform_event_row\('site_id', 'category', 'parameter', 'limit_direction', 'recorded_limit', 'recorded_limit_upper', 'within_limit'\)/,
    );
  });

  it('never whitelists free text — no notes/description column in either whitelist', () => {
    const auditMatch = sql.match(/audit_row\('environmental_monitoring'[^)]*\)/);
    const outboxMatch = sql.match(/platform_event_row\([^)]*\)/);
    expect(auditMatch).toBeTruthy();
    expect(outboxMatch).toBeTruthy();
    for (const m of [auditMatch![0], outboxMatch![0]]) {
      expect(m).not.toMatch(/notes|description/);
    }
  });

  it('adds no UPDATE/DELETE grant — the table stays insert-only', () => {
    expect(sql).not.toMatch(/GRANT UPDATE|GRANT DELETE/);
  });
});
