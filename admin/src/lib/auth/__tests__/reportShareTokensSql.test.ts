import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/207_report_share_tokens.sql'), 'utf-8');

describe('migration 207: report_share_tokens', () => {
  it('is RLS-on-no-policies — service role only, the policy_ack_tokens/hs_test_tokens/worker_qr_tokens shape', () => {
    expect(sql).toMatch(/ALTER TABLE public\.report_share_tokens ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON public\.report_share_tokens FROM PUBLIC, anon, authenticated/);
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*?public\.report_share_tokens/);
  });

  it('token_hash is the primary key and is shaped like a SHA-256 hex digest', () => {
    expect(sql).toMatch(/token_hash\s+text PRIMARY KEY CHECK \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  });

  it('bounds a link to a hard 90-day maximum lifetime, never indefinite', () => {
    expect(sql).toMatch(/CHECK \(expires_at > created_at AND expires_at <= created_at \+ interval '90 days'\)/);
  });

  it('recipient_note is bounded to 200 characters', () => {
    expect(sql).toMatch(/recipient_note\s+text CHECK \(recipient_note IS NULL OR length\(recipient_note\) <= 200\)/);
  });

  it('exempts itself from rls_policy_audit()\'s "unreachable table" false positive, alongside the two existing exemptions', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.rls_policy_audit\(\)[\s\S]*?\$function\$;/)![0];
    expect(fn).toMatch(/c\.relname NOT IN \('entity_qr_tokens', 'worker_qr_tokens', 'report_share_tokens'\)/);
  });

  it('report_id and company_id cascade on delete, so a deleted report/company takes its share links with it', () => {
    expect(sql).toMatch(/report_id\s+uuid NOT NULL REFERENCES public\.reports\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/company_id\s+uuid NOT NULL REFERENCES public\.companies\(id\) ON DELETE CASCADE/);
  });
});
