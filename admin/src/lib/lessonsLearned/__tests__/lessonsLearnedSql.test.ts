// Pins migration 181 (Core-OS 360 Phase 16, Group 1: Cross-Client
// Lessons Learned Network). The live database is the real check
// (supabase/probes/181_lessons_learned_network.sql, 17/17 PASS); this
// stops the migration file drifting from what was applied and pins the
// properties that, if lost, would let a client read another client's
// source incident, let a lesson reach a client before it is published,
// or let a read receipt be forged for someone else's company/identity.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/181_lessons_learned_network.sql'), 'utf8');

describe('Cross-Client Lessons Learned Network (181)', () => {
  it('RLS is enabled on all three new tables', () => {
    expect(sql).toMatch(/ALTER TABLE public\.lessons_learned ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE public\.lesson_learned_distributions ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE public\.lesson_learned_reads ENABLE ROW LEVEL SECURITY/);
  });

  it('all three tables have a staff ALL policy, and no policy is USING (true) or granted to anon', () => {
    expect(sql).toMatch(/CREATE POLICY lessons_learned_staff_all ON public\.lessons_learned FOR ALL TO authenticated[\s\S]*?is_tps_staff\(\)/);
    expect(sql).toMatch(/CREATE POLICY lesson_learned_distributions_staff_all ON public\.lesson_learned_distributions FOR ALL TO authenticated[\s\S]*?is_tps_staff\(\)/);
    expect(sql).toMatch(/CREATE POLICY lesson_learned_reads_staff_all ON public\.lesson_learned_reads FOR ALL TO authenticated[\s\S]*?is_tps_staff\(\)/);
    expect(sql).not.toMatch(/USING \(true\)/);
    expect(sql).not.toMatch(/TO anon/);
  });

  it('lessons_learned has NO client-facing policy at all — staff-only, exactly the legal_requirements shape', () => {
    expect(sql).not.toMatch(/CREATE POLICY lessons_learned_(client_read|read|insert|update|delete)/);
  });

  it('lesson_learned_distributions: client may only SELECT their own company rows, never write', () => {
    expect(sql).toMatch(/CREATE POLICY lesson_learned_distributions_client_read ON public\.lesson_learned_distributions FOR SELECT TO authenticated\s+USING \(company_id = \(SELECT public\.my_company_id\(\)\)\)/);
    expect(sql).not.toMatch(/CREATE POLICY lesson_learned_distributions_(insert|update|delete)/);
  });

  it('lesson_learned_reads: client may SELECT and INSERT their own company rows, never UPDATE/DELETE', () => {
    expect(sql).toMatch(/CREATE POLICY lesson_learned_reads_select ON public\.lesson_learned_reads FOR SELECT TO authenticated/);
    expect(sql).toMatch(/CREATE POLICY lesson_learned_reads_insert ON public\.lesson_learned_reads FOR INSERT TO authenticated/);
    expect(sql).not.toMatch(/CREATE POLICY lesson_learned_reads_(update|delete)/);
  });

  it('a lesson may only be distributed once it is published', () => {
    expect(sql).toMatch(/IF lesson_status <> 'published' THEN\s*\n\s*RAISE EXCEPTION/);
  });

  it('a lesson read receipt derives company_id, read_by and read_by_name from the session, never the caller', () => {
    expect(sql).toMatch(/NEW\.company_id := my_company;/);
    expect(sql).toMatch(/NEW\.read_by := auth\.uid\(\);/);
    expect(sql).toMatch(/SELECT full_name INTO my_name FROM public\.profiles WHERE id = auth\.uid\(\);/);
  });

  it('a read receipt is refused unless the lesson was genuinely distributed to the caller\'s own company', () => {
    expect(sql).toMatch(/This lesson has not been shared with your organisation/);
  });

  it('source_type is validated via the shared hs_entity_table\\(\\)\\/hs_entity_company\\(\\) resolver, never a bespoke lookup', () => {
    expect(sql).toMatch(/hs_entity_table\(NEW\.source_type\) IS NULL/);
    expect(sql).toMatch(/hs_entity_company\(NEW\.source_type, NEW\.source_id\) IS NULL/);
  });

  it('source_type is a small closed vocabulary, and source_type/source_id are both-or-neither', () => {
    expect(sql).toMatch(/source_type\s+text CHECK \(source_type IS NULL OR source_type IN \('incident', 'audit_finding', 'inspection'\)\)/);
    expect(sql).toMatch(/CHECK \(\(source_type IS NULL\) = \(source_id IS NULL\)\)/);
  });

  it('published_at/published_by are stamped once and never reset by a later status change', () => {
    expect(sql).toMatch(/IF NEW\.status = 'published' AND NEW\.published_at IS NULL THEN/);
  });

  it('created_by is derived and immutable after creation', () => {
    expect(sql).toMatch(/NEW\.created_by := auth\.uid\(\);/);
    expect(sql).toMatch(/NEW\.created_by := OLD\.created_by;/);
  });

  it('the write guard is applied to the one client-writable table only', () => {
    expect(sql).toMatch(/apply_write_guard\('public\.lesson_learned_reads'\)/);
    expect(sql).not.toMatch(/apply_write_guard\('public\.lessons_learned'\)/);
    expect(sql).not.toMatch(/apply_write_guard\('public\.lesson_learned_distributions'\)/);
  });

  it('every SECURITY DEFINER function in this migration is revoked from PUBLIC, anon and authenticated', () => {
    const fns = ['lessons_learned_stamp', 'lesson_learned_distributions_fill', 'lesson_learned_reads_fill'];
    for (const fn of fns) {
      expect(sql, fn).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(\\) FROM PUBLIC, anon, authenticated`));
    }
  });

  it('an audit trigger is present for lesson_learned_distributions, identifying columns only', () => {
    expect(sql).toMatch(/audit_row\('lesson_learned_distribution', 'company_id', 'lesson_id'\)/);
  });

  it('lessons_learned itself gets no generic audit_row trigger — it has no company_id, the legal_requirements precedent', () => {
    expect(sql).not.toMatch(/audit_row\('lesson',/);
    expect(sql).not.toMatch(/audit_row\('lessons_learned',/);
  });

  it('lesson_learned_reads has a UNIQUE constraint of one row per (lesson, reader)', () => {
    expect(sql).toMatch(/UNIQUE \(lesson_id, read_by\)/);
  });
});
