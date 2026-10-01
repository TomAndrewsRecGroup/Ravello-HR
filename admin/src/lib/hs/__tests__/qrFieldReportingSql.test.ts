// Pins migration 201 (QR field reporting — closing the audit-named
// gap that /w/[token] and /e/[token] only ever showed a status, never
// a way to report an incident or hazard). The live database is the
// real check; this stops the migration file drifting from what was
// applied and pins the properties a text scan CAN verify.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/201_qr_field_reporting.sql'), 'utf8');

describe('QR field reporting (201)', () => {
  it('hs_check_refs gains reported_by_person_id → people, every prior reference kept', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.hs_check_refs(p_company uuid, p_row jsonb)');
    const body = sql.slice(start, sql.indexOf('END $$;', start));
    expect(body).toMatch(/\('reported_by_person_id','people'\)/);
    for (const kept of ["('site_id','hs_sites')", "('hazard_id','hazards')", "('incident_id','hs_incidents')", "('evidence_id','hs_files')"]) {
      expect(body).toContain(kept);
    }
  });

  it('hs_incidents and hazards both gain reported_by_person_id + reported_via, constrained to portal/qr_scan', () => {
    for (const table of ['hs_incidents', 'hazards']) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table}[\\s\\S]*?reported_by_person_id uuid REFERENCES public\\.people\\(id\\) ON DELETE SET NULL`));
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ADD CONSTRAINT ${table}_reported_via_check CHECK \\(reported_via IN \\('portal', 'qr_scan'\\)\\)`));
    }
  });

  it('entity_qr_report_context() is revoked from PUBLIC/anon/authenticated and granted to service_role only', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.entity_qr_report_context\(text\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.entity_qr_report_context\(text\) TO service_role/);
  });

  it('entity_qr_report_context() resolves a revoked or unknown token to { ok: false } — never an error', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.entity_qr_report_context(p_token_hash text)');
    const body = sql.slice(start, sql.indexOf('$$;', start) + 3);
    expect(body).toMatch(/IF NOT FOUND OR t\.revoked_at IS NOT NULL THEN/);
    expect(body).toMatch(/RETURN jsonb_build_object\('ok', false\)/);
  });

  it('is idempotent: every ALTER COLUMN/CONSTRAINT add is guarded or droppable', () => {
    expect(sql.match(/ADD COLUMN IF NOT EXISTS reported_by_person_id/g)).toHaveLength(2);
    expect(sql.match(/DROP CONSTRAINT IF EXISTS \w+_reported_via_check/g)).toHaveLength(2);
  });
});
