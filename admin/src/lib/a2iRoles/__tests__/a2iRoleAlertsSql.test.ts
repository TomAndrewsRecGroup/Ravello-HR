import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(__dirname, '../../../../../supabase/migrations/217_a2i_role_alerts.sql'),
  'utf-8',
);

const TABLES = [
  'a2i_role_alert_config',
  'a2i_role_alert_recipients',
  'a2i_role_alert_optouts',
  'a2i_role_alert_sends',
  'a2i_role_alert_deliveries',
  'a2i_role_alert_tokens',
  'a2i_role_interests',
];
const STAFF_ONLY = TABLES.filter(t => t !== 'a2i_role_alert_tokens');

describe('migration 217: Athletes To Industry Thursday role email', () => {
  it('enables RLS on every table it creates', () => {
    for (const t of TABLES) {
      expect(sql, t).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`));
    }
  });

  it('every non-token table has exactly one policy, and it is staff-only', () => {
    for (const t of STAFF_ONLY) {
      const policies = [...sql.matchAll(new RegExp(`CREATE POLICY (\\w+) ON public\\.${t}\\b([\\s\\S]*?);`, 'g'))];
      expect(policies.map(p => p[1]), t).toEqual([`${t}_staff_all`]);
      expect(policies[0][2]).toMatch(/USING \(\(SELECT public\.is_tps_staff\(\)\)\)/);
      expect(policies[0][2]).toMatch(/WITH CHECK \(\(SELECT public\.is_tps_staff\(\)\)\)/);
    }
  });

  it('the token table has NO policies and every session grant revoked', () => {
    expect(sql).not.toMatch(/CREATE POLICY \w+ ON public\.a2i_role_alert_tokens/);
    expect(sql).toMatch(/REVOKE ALL ON public\.a2i_role_alert_tokens FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/token_hash\s+text PRIMARY KEY CHECK \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  });

  it('the database makes the email go out at most once a week, and once per person per week', () => {
    expect(sql).toMatch(/week_key\s+text NOT NULL UNIQUE/);
    expect(sql).toMatch(/UNIQUE \(send_id, email_lower\)/);
  });

  it('one Match me notification per athlete per role', () => {
    expect(sql).toMatch(/UNIQUE \(athlete_id, manatal_job_id\)/);
  });

  it('opt-outs live in their own staff-only table keyed by lower-cased email, never on athletes', () => {
    expect(sql).toMatch(/email_lower\s+text NOT NULL UNIQUE\s+CHECK \(email_lower = lower\(email_lower\)/);
    expect(sql).not.toMatch(/ALTER TABLE public\.athletes/);
  });

  it('is seeded switched OFF', () => {
    expect(sql).toMatch(/enabled\s+boolean NOT NULL DEFAULT false/);
  });

  it('only allows https role links that contain the {id} placeholder', () => {
    expect(sql).toMatch(/role_url_template ~ '\^https:\/\//);
    expect(sql).toMatch(/position\('\{id\}' IN role_url_template\) > 0/);
    expect(sql).toMatch(/DEFAULT 'https:\/\/www\.andrews-recruitment\.com\/jobs\/\{id\}'/);
  });

  it('audit entity names are letters and underscores only (audit_events_action_check)', () => {
    const entities = [...sql.matchAll(/audit_row\('([^']+)'/g)].map(m => m[1]);
    expect(entities.length).toBeGreaterThan(0);
    for (const e of entities) expect(e, e).toMatch(/^[a-z_]+$/);
  });

  it('rls_policy_audit() learns the new zero-policy token table without losing the earlier ones', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.rls_policy_audit\(\)[\s\S]*?\$function\$;/)![0];
    expect(fn).toMatch(
      /c\.relname NOT IN \('entity_qr_tokens', 'worker_qr_tokens', 'report_share_tokens', 'document_signature_tokens', 'a2i_role_alert_tokens'\)/,
    );
    for (const predicate of [
      'company_id', 'is_tps_staff', 'get_my_role', 'my_company_id',
      'auth\\.uid', 'user_id', 'person_visible', 'is_me\\(', 'is_company_super_user',
    ]) {
      expect(fn.includes(predicate), predicate).toBe(true);
    }
  });

  it('is additive: no DROP TABLE / DROP FUNCTION in any statement', () => {
    const statements = sql.replace(/^\s*--.*$/gm, '');
    expect(statements).not.toMatch(/DROP\s+(FUNCTION|TABLE)/i);
  });
});
