// Pins migrations 091/092. The live check is
// supabase/probes/091_profile_access_tokens.sql; this stops the files
// drifting — above all, from someone "fixing" the policy-less table by
// adding a policy, which would hand the token hashes back to clients.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(__dirname, '../../../../../supabase/migrations');
const m091 = readFileSync(join(dir, '091_profile_access_tokens.sql'), 'utf8');
const m092 = readFileSync(join(dir, '092_clear_profile_invite_tokens.sql'), 'utf8');

describe('091 profile_access_tokens', () => {
  it('stores a hash, not a token', () => {
    expect(m091).toMatch(/token_hash text PRIMARY KEY CHECK \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
    expect(m091).not.toMatch(/\btoken\s+(uuid|text)\b/);
  });

  it('is reachable by the service role only: RLS on, no policy, privileges revoked', () => {
    expect(m091).toMatch(/ALTER TABLE public\.profile_access_tokens ENABLE ROW LEVEL SECURITY;/);
    expect(m091).toMatch(/REVOKE ALL ON public\.profile_access_tokens FROM PUBLIC, anon, authenticated;/);
    expect(m091).not.toMatch(/CREATE POLICY/i);
    expect(m091).not.toMatch(/GRANT\s+\w+.*ON public\.profile_access_tokens/i);
  });

  it('carries live tokens over with the same hash the app computes', () => {
    expect(m091).toMatch(/encode\(sha256\(convert_to\(lower\(p\.invite_token::text\), 'UTF8'\)\), 'hex'\)/);
    expect(m091).toMatch(/invite_token_expires_at > now\(\)/);
  });

  it('092 re-copies late tokens, then clears the readable ones', () => {
    const copy = m092.indexOf('INSERT INTO public.profile_access_tokens');
    const clear = m092.indexOf('SET invite_token = NULL, invite_token_expires_at = NULL');
    expect(copy).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(copy);
    expect(m092).toMatch(/APPLY AFTER THE CODE/);
  });
});
