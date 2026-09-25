import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// 104 / 104a: the shape the HIRE rules depend on.

const MIG = resolve(__dirname, '../../../../../supabase/migrations');
const sql = readFileSync(`${MIG}/104_hire_flow.sql`, 'utf8');
const sql104a = readFileSync(`${MIG}/104a_calendar_interview_type.sql`, 'utf8');

describe('104a', () => {
  it('adds the calendar interview value alone in its file', () => {
    expect(sql104a).toMatch(/ALTER TYPE public\.calendar_event_type ADD VALUE IF NOT EXISTS 'interview';/);
    expect(sql104a.replace(/--[^\n]*/g, '').trim().split(';').filter(Boolean)).toHaveLength(1);
    expect(sql).not.toMatch(/ADD VALUE/);
  });
});

describe('104', () => {
  it('stamps stage_changed_at and filled_at in a BEFORE trigger, filled_at only once', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS filled_at\s+timestamptz/);
    expect(sql).toMatch(/CREATE TRIGGER requisitions_stage_stamp BEFORE INSERT OR UPDATE ON public\.requisitions/);
    const fn = sql.slice(sql.indexOf('FUNCTION public.requisition_stage_stamp'), sql.indexOf('DROP TRIGGER IF EXISTS requisitions_stage_stamp'));
    expect(fn).toMatch(/IF NEW\.stage IS DISTINCT FROM OLD\.stage THEN\s+NEW\.stage_changed_at := now\(\);/);
    expect(fn).toMatch(/NEW\.filled_at := coalesce\(NEW\.filled_at, now\(\)\)/);
    expect(fn).not.toMatch(/NEW\.filled_at := now\(\)/);
    // backfill so the stale-role reminder has a date for every open role
    expect(sql).toMatch(/UPDATE public\.requisitions SET stage_changed_at = coalesce\(updated_at, created_at\) WHERE stage_changed_at IS NULL/);
  });

  it('the calendar row the consumer writes is unique per (company, source_ref)', () => {
    expect(sql).toMatch(/ALTER TABLE public\.company_calendar_events ADD COLUMN IF NOT EXISTS source_ref text/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS company_calendar_events_source_ref_idx\s+ON public\.company_calendar_events \(company_id, source_ref\) WHERE source_ref IS NOT NULL/);
  });

  it('interview_schedules joins the outbox without its notes; referral_scan_runs on INSERT only', () => {
    const iv = sql.match(/CREATE TRIGGER interview_schedules_platform_event AFTER INSERT OR UPDATE OR DELETE ON public\.interview_schedules\s+FOR EACH ROW EXECUTE FUNCTION public\.platform_event_row\(([^)]*)\)/);
    expect(iv).toBeTruthy();
    const cols = iv![1].split(',').map(c => c.trim().replace(/'/g, ''));
    expect(cols).toEqual(expect.arrayContaining(['status', 'scheduled_at', 'candidate_id', 'requisition_id']));
    expect(cols).not.toContain('feedback_notes');
    expect(cols).not.toContain('client_feedback');
    expect(cols).not.toContain('location_or_link');
    expect(sql).toMatch(/CREATE TRIGGER referral_scan_runs_platform_event AFTER INSERT ON public\.referral_scan_runs/);
    const rs = sql.match(/referral_scan_runs\s+FOR EACH ROW EXECUTE FUNCTION public\.platform_event_row\(([^)]*)\)/)![1];
    expect(rs).not.toMatch(/tally|notes/);
  });

  it('feedback_triage is a nullable jsonb and client_feedback never enters a whitelist', () => {
    expect(sql).toMatch(/ALTER TABLE public\.candidates ADD COLUMN IF NOT EXISTS feedback_triage jsonb;/);
    for (const m of sql.matchAll(/platform_event_row\(([^)]*)\)/g)) expect(m[1]).not.toMatch(/client_feedback|feedback_notes/);
  });
});
