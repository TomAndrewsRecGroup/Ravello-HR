import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRIGGERED_ENTITIES } from '../types';

// The outbox is written by SECURITY DEFINER triggers and read by a
// service-role consumer; a session must never write it, and a trigger's
// column whitelist is the privacy boundary between a row and the
// people who will be emailed about it. These pin 096 in place.

const MIG = resolve(__dirname, '../../../../../supabase/migrations');
const sql = readFileSync(`${MIG}/096_platform_events.sql`, 'utf8');
const sql097 = readFileSync(`${MIG}/097_vocab_checks.sql`, 'utf8');

// A later migration may re-create a trigger with a wider (or, 105,
// narrower — the provider_id column it whitelisted is dropped) column
// list. The LATEST definition per table is the live one, so it is the
// one checked. 105 also DROPs hs_provider_companies entirely (H&S
// becomes staff-delivered, 2026-09-25) — its trigger goes with the
// table, even though 096's CREATE TRIGGER text for it still exists on
// disk from before that table was dropped.
const LATER = ['099_lead_flow.sql', '101_support_bd.sql', '104_hire_flow.sql', '105_hs_staff_delivered.sql', '106_hs_documents_sector_packs.sql'];
const parseTriggers = (text: string) => [...text.matchAll(/CREATE TRIGGER (\w+)_platform_event AFTER ([A-Z OR]+) ON public\.(\w+)\s+FOR EACH ROW EXECUTE FUNCTION public\.platform_event_row\(([^)]*)\)/g)]
  .map(m => ({ name: m[1], ops: m[2].trim(), table: m[3], cols: m[4].split(',').map(c => c.trim().replace(/^'|'$/g, '')) }));
const byTable = new Map(parseTriggers(sql).map(t => [t.table, t]));
for (const f of LATER) for (const t of parseTriggers(readFileSync(`${MIG}/${f}`, 'utf8'))) byTable.set(t.table, t);
const sql105 = readFileSync(`${MIG}/105_hs_staff_delivered.sql`, 'utf8');
for (const m of sql105.matchAll(/DROP TABLE IF EXISTS public\.(\w+)/g)) byTable.delete(m[1]);
const triggers = [...byTable.values()];

const FORBIDDEN = /^(salary|ni_number|tax_code|date_of_birth|leave_token|details|body|notes|description|email|phone|address|summary|exit_interview_notes|client_feedback|recruiter_notes|response_notes|invite_token|smtp_\w+)$/;

describe('platform_events (096)', () => {
  it('has RLS on, staff SELECT only, and no session write path', () => {
    expect(sql).toMatch(/ALTER TABLE public\.platform_events ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/CREATE POLICY platform_events_staff_read ON public\.platform_events\s+FOR SELECT TO authenticated USING \(\(SELECT public\.is_tps_staff\(\)\)\)/);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.platform_events FROM PUBLIC, anon, authenticated/);
    const policies = [...sql.matchAll(/CREATE POLICY (\w+) ON public\.platform_events([\s\S]*?);/g)];
    expect(policies.map(p => p[1])).toEqual(['platform_events_staff_read']);
  });

  it('every SECURITY DEFINER function is revoked from PUBLIC, anon and authenticated', () => {
    const definers = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(([\s\S]*?)AS \$\$/g)]
      .filter(m => /SECURITY DEFINER/.test(m[2])).map(m => m[1]);
    expect(definers).toEqual(expect.arrayContaining(['platform_event_row', 'claim_platform_events', 'hs_completion_roll']));
    for (const f of definers) {
      expect(sql, f).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon, authenticated`));
    }
  });

  it('the claim is leased, capped at five attempts, and skips locked rows', () => {
    const body = sql.slice(sql.indexOf('FUNCTION public.claim_platform_events'), sql.indexOf('REVOKE ALL ON FUNCTION public.claim_platform_events'));
    expect(body).toMatch(/processed_at IS NULL/);
    expect(body).toMatch(/attempts < 5/);
    expect(body).toMatch(/claimed_at < now\(\) - p_lease/);
    expect(body).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(body).toMatch(/attempts = e\.attempts \+ 1/);
  });

  it('has one trigger per TRIGGERED_ENTITIES entry, and no trigger the tuple does not know', () => {
    const tables = triggers.map(t => t.table).sort();
    expect(tables).toEqual([...TRIGGERED_ENTITIES].sort());
    for (const t of triggers) expect(t.name, t.table).toBe(t.table);
  });

  it('no whitelist carries a sensitive column', () => {
    expect(triggers.length).toBeGreaterThan(20);
    for (const t of triggers) {
      for (const c of t.cols) expect(c, `${t.table} whitelists ${c}`).not.toMatch(FORBIDDEN);
    }
  });

  it('the trigger function copies only whitelisted columns and drops an UPDATE that changed none', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.platform_event_row'), sql.indexOf('REVOKE ALL ON FUNCTION public.platform_event_row'));
    expect(fn).toMatch(/cols\s+text\[\] := TG_ARGV/);
    expect(fn).toMatch(/FOREACH c IN ARRAY cols LOOP/);
    expect(fn).toMatch(/IF TG_OP = 'UPDATE' AND cardinality\(changed\) = 0 THEN RETURN NULL; END IF;/);
    expect(fn).not.toMatch(/to_jsonb\(NEW\)\s*\)/); // never the whole row into the payload
    expect(fn).toMatch(/jsonb_build_object\('new', newv, 'old', oldv, 'changed', to_jsonb\(changed\)\)/);
  });

  it('notifications gain a dedupe key, an email claim, an own-row DELETE policy and realtime', () => {
    expect(sql).toMatch(/ALTER TABLE public\.notifications\s+ADD COLUMN IF NOT EXISTS dedupe_key text,\s+ADD COLUMN IF NOT EXISTS emailed_at timestamptz/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_idx ON public\.notifications \(dedupe_key\) WHERE dedupe_key IS NOT NULL/);
    expect(sql).toMatch(/CREATE POLICY notifications_delete_own ON public\.notifications\s+FOR DELETE TO authenticated USING \(user_id = \(SELECT auth\.uid\(\)\)\)/);
    expect(sql).toMatch(/ALTER PUBLICATION supabase_realtime ADD TABLE public\.notifications/);
    expect(sql).toMatch(/ALTER PUBLICATION supabase_realtime ADD TABLE public\.enquiries/);
  });

  it('email_log gains the consumer claim key', () => {
    expect(sql).toMatch(/ALTER TABLE public\.email_log ADD COLUMN IF NOT EXISTS dedupe_key text/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS email_log_dedupe_idx ON public\.email_log \(dedupe_key\) WHERE dedupe_key IS NOT NULL/);
  });

  it('X8: a failed H&S check marks the item in_review and never rolls the register forward', () => {
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.hs_completion_roll'), sql.indexOf('REVOKE ALL ON FUNCTION public.hs_completion_roll'));
    expect(fn).toMatch(/IF NEW\.outcome = 'fail' THEN/);
    const failBranch = fn.slice(fn.indexOf("IF NEW.outcome = 'fail' THEN"), fn.indexOf('RETURN NULL;'));
    expect(failBranch).toMatch(/status = 'in_review'::compliance_status/);
    expect(failBranch).not.toMatch(/due_date/);
    expect(failBranch).not.toMatch(/last_completed_on/);
    // the pass branch still rolls, only when newest
    expect(fn).toMatch(/last_completed_on = NEW\.completed_on/);
    expect(fn).toMatch(/ci\.last_completed_on <= NEW\.completed_on/);
  });

  it('actions and internal_tasks can be created idempotently by the consumer', () => {
    expect(sql).toMatch(/ALTER TABLE public\.actions ADD COLUMN IF NOT EXISTS source_ref text/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS actions_source_ref_idx ON public\.actions \(company_id, source_ref\) WHERE source_ref IS NOT NULL/);
    expect(sql).toMatch(/ALTER TABLE public\.internal_tasks ADD COLUMN IF NOT EXISTS source_ref text/);
    expect(sql).toMatch(/ALTER TABLE public\.actions ALTER COLUMN priority SET DEFAULT 'normal'/);
  });

  it('automation_runs and notification_preferences are RLS-guarded', () => {
    expect(sql).toMatch(/ALTER TABLE public\.automation_runs ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.automation_runs FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/ALTER TABLE public\.notification_preferences ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/CREATE POLICY notification_preferences_own ON public\.notification_preferences\s+FOR ALL TO authenticated\s+USING \(user_id = \(SELECT auth\.uid\(\)\)\) WITH CHECK \(user_id = \(SELECT auth\.uid\(\)\)\)/);
    for (const p of [...sql.matchAll(/CREATE POLICY (\w+) ON ([\w.]+)([\s\S]*?);/g)]) {
      expect(p[3], p[1]).not.toMatch(/USING\s*\(\s*true\s*\)|WITH CHECK\s*\(\s*true\s*\)/i);
      expect(p[3], p[1]).toMatch(/TO authenticated/);
    }
  });

  it('097 CHECKs match the vocabularies the code writes', () => {
    expect(sql097).toMatch(/CHECK \(actor_kind IN \('system', 'staff', 'provider', 'client'\)\)/);
    expect(sql097).toMatch(/CHECK \(event_type IN \('created', 'updated', 'deleted', 'reminder'\)\)/);
    expect(sql097).toMatch(/CHECK \(status IN \('new', 'in_progress', 'complete'\)\)/);
  });
});
