import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// 103: the token table is service-role only (RLS on, NO policies, the
// grants revoked), a link dies with its row, and the two new columns on
// policy_acknowledgements carry the values the code writes.

const MIG = resolve(__dirname, '../../../../../supabase/migrations');
const sql = readFileSync(`${MIG}/103_policy_ack_tokens.sql`, 'utf8');
const tokens = readFileSync(resolve(__dirname, '../../auth/policyAckTokens.ts'), 'utf8');
const client = readFileSync(resolve(__dirname, '../../../../../portal/src/app/(portal)/lead/policy-acknowledgements/PolicyAckClient.tsx'), 'utf8');

describe('103', () => {
  it('stores hashes only, service role only', () => {
    expect(sql).toMatch(/token_hash\s+text PRIMARY KEY CHECK \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
    expect(sql).toMatch(/acknowledgement_id uuid NOT NULL REFERENCES public\.policy_acknowledgements\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/ALTER TABLE public\.policy_ack_tokens ENABLE ROW LEVEL SECURITY/);
    expect(sql).not.toMatch(/CREATE POLICY/);
    expect(sql).toMatch(/REVOKE ALL ON public\.policy_ack_tokens FROM PUBLIC, anon, authenticated/);
  });
  it('acknowledged_via is pinned to what the two writers write', () => {
    const m = sql.match(/acknowledged_via IN \(([^)]*)\)/)!;
    const allowed = m[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
    expect(allowed).toEqual(['link', 'admin']);
    expect(tokens).toMatch(/acknowledged_via: 'link'/);
    expect(client).toMatch(/acknowledged_via: 'admin'/);
  });
  it('is additive: no drops, no data rewrite', () => {
    expect(sql).not.toMatch(/DROP COLUMN|DROP TABLE|\bUPDATE\b/);
  });
});
