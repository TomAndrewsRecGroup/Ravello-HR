// Pins migration 192 (Core-OS 360 Completion Programme, Phase 25,
// Group 2: legal_requirement_research_notes row_version, closing
// gap-ledger row C17.6). The live database is the real check (a
// rolled-back probe: insert forces row_version=1 regardless of what
// the caller sends, a normal update advances OLD+1 regardless of what
// the caller sends, a stale conditional update matches 0 rows, a
// fresh one succeeds, and changing the research content itself is
// refused); this stops the migration file drifting from what was
// applied and pins the properties a text scan CAN verify.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/192_legal_research_notes_row_version.sql'), 'utf8');

describe('legal_requirement_research_notes row_version (192)', () => {
  it('adds row_version as a NOT NULL integer defaulting to 1', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1/);
  });

  it('the INSERT-time fill() function forces row_version to 1, never trusting a caller-sent value', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.legal_requirement_research_notes_fill()');
    const body = sql.slice(start, sql.indexOf('$$;', start) + 3);
    expect(body).toMatch(/NEW\.row_version := 1;/);
  });

  it('the UPDATE-time touch() function always advances OLD.row_version + 1, never trusting a caller-sent value', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.legal_requirement_research_notes_touch()');
    const body = sql.slice(start, sql.indexOf('$$;', start) + 3);
    expect(body).toMatch(/NEW\.row_version := OLD\.row_version \+ 1;/);
  });

  it('the touch() function refuses a change to any research-content column — only the review fields may move', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.legal_requirement_research_notes_touch()');
    const body = sql.slice(start, sql.indexOf('$$;', start) + 3);
    for (const col of ['legal_requirement_id', 'source', 'query_used', 'raw_result_summary', 'created_by', 'created_at']) {
      expect(body, col).toMatch(new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}`));
    }
    expect(body).toMatch(/RAISE EXCEPTION.*USING ERRCODE = '42501'/);
  });

  it('both trigger functions are revoked from PUBLIC, anon and authenticated — SECURITY DEFINER for the transaction only, never a session-callable RPC', () => {
    expect(sql.match(/REVOKE ALL ON FUNCTION public\.legal_requirement_research_notes_(fill|touch)\(\) FROM PUBLIC, anon, authenticated/g)).toHaveLength(2);
  });

  it('registers the new BEFORE UPDATE trigger exactly once', () => {
    expect(sql.match(/CREATE TRIGGER legal_requirement_research_notes_touch/g)).toHaveLength(1);
    expect(sql).toMatch(/BEFORE UPDATE ON public\.legal_requirement_research_notes/);
  });
});
