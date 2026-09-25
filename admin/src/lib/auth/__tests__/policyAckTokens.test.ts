import { describe, expect, it } from 'vitest';
import { fakeSupabase } from '@/lib/events/__tests__/fakeSupabase';
import { hashAccessToken } from '../accessTokens';
import { POLICY_ACK_TOKEN_TTL_MS, burnPolicyAckTokens, mintPolicyAckToken, peekPolicyAckToken, redeemPolicyAckToken } from '../policyAckTokens';

// The database holds only the SHA-256; the link works until it is used
// or 30 days pass; acknowledging is conditional, counted, and burns
// every link for the row.

const now = Date.parse('2026-09-25T10:00:00Z');

describe('policy acknowledgement tokens', () => {
  it('mints a hash (never the raw token), peeks it, and expires it after 30 days', async () => {
    const db = fakeSupabase({ policy_ack_tokens: [], policy_acknowledgements: [{ id: 'ack-1', status: 'pending' }] });
    const minted = await mintPolicyAckToken(db.client, 'ack-1', now);
    if ('error' in minted) throw new Error(minted.error);
    expect(minted.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(db.tables.policy_ack_tokens).toHaveLength(1);
    expect(db.tables.policy_ack_tokens[0].token_hash).toBe(await hashAccessToken(minted.token));
    expect(JSON.stringify(db.tables.policy_ack_tokens)).not.toContain(minted.token);
    expect(minted.expiresAt).toBe(new Date(now + POLICY_ACK_TOKEN_TTL_MS).toISOString());

    expect(await peekPolicyAckToken(db.client, minted.token, now)).toEqual({ acknowledgementId: 'ack-1', expiresAt: minted.expiresAt });
    expect(await peekPolicyAckToken(db.client, minted.token.toUpperCase(), now)).toEqual({ acknowledgementId: 'ack-1', expiresAt: minted.expiresAt });
    expect(await peekPolicyAckToken(db.client, minted.token, now + POLICY_ACK_TOKEN_TTL_MS)).toBe('expired');
    expect(await peekPolicyAckToken(db.client, 'not-a-token', now)).toBeNull();
    expect(await peekPolicyAckToken(db.client, crypto.randomUUID(), now)).toBeNull();
  });

  it('redeems once: the row is acknowledged via the link, every link for it is burned, a second use says already', async () => {
    const db = fakeSupabase({ policy_ack_tokens: [], policy_acknowledgements: [{ id: 'ack-1', status: 'pending', acknowledged_at: null }, { id: 'ack-2', status: 'pending' }] });
    const a = await mintPolicyAckToken(db.client, 'ack-1', now);
    const b = await mintPolicyAckToken(db.client, 'ack-1', now);   // a resend: both live
    const other = await mintPolicyAckToken(db.client, 'ack-2', now);
    if ('error' in a || 'error' in b || 'error' in other) throw new Error('mint');
    expect(db.tables.policy_ack_tokens).toHaveLength(3);

    const r = await redeemPolicyAckToken(db.client, b.token, now);
    expect(r).toEqual({ acknowledgementId: 'ack-1', already: false });
    expect(db.tables.policy_acknowledgements[0]).toMatchObject({ status: 'acknowledged', acknowledged_at: new Date(now).toISOString(), acknowledged_via: 'link' });
    expect(db.tables.policy_ack_tokens.map(t => t.acknowledgement_id)).toEqual(['ack-2']);   // ack-1's two links gone, ack-2's kept

    expect(await redeemPolicyAckToken(db.client, a.token, now)).toBeNull();   // burned
    expect(await redeemPolicyAckToken(db.client, b.token, now)).toBeNull();
    // a link that survives to a row already signed by an admin: says already, changes nothing
    db.tables.policy_acknowledgements[1].status = 'acknowledged';
    db.tables.policy_acknowledgements[1].acknowledged_via = 'admin';
    expect(await redeemPolicyAckToken(db.client, other.token, now)).toEqual({ acknowledgementId: 'ack-2', already: true });
    expect(db.tables.policy_acknowledgements[1].acknowledged_via).toBe('admin');
    expect(db.tables.policy_ack_tokens).toHaveLength(0);
  });

  it('an overdue row can still be acknowledged; an expired link cannot', async () => {
    const db = fakeSupabase({ policy_ack_tokens: [], policy_acknowledgements: [{ id: 'ack-1', status: 'overdue' }] });
    const m = await mintPolicyAckToken(db.client, 'ack-1', now);
    if ('error' in m) throw new Error(m.error);
    expect(await redeemPolicyAckToken(db.client, m.token, now + POLICY_ACK_TOKEN_TTL_MS + 1)).toBe('expired');
    expect(db.tables.policy_acknowledgements[0].status).toBe('overdue');
    expect(await redeemPolicyAckToken(db.client, m.token, now)).toEqual({ acknowledgementId: 'ack-1', already: false });
    await burnPolicyAckTokens(db.client, 'ack-1');
    expect(db.tables.policy_ack_tokens).toHaveLength(0);
  });

  it('burning all-but-one keeps the newest emailed link working', async () => {
    const db = fakeSupabase({ policy_ack_tokens: [], policy_acknowledgements: [{ id: 'ack-1', status: 'pending' }] });
    const a = await mintPolicyAckToken(db.client, 'ack-1', now);
    const b = await mintPolicyAckToken(db.client, 'ack-1', now);
    if ('error' in a || 'error' in b) throw new Error('mint');
    await burnPolicyAckTokens(db.client, 'ack-1', b.tokenHash);
    expect(db.tables.policy_ack_tokens.map(t => t.token_hash)).toEqual([b.tokenHash]);
    expect(await peekPolicyAckToken(db.client, a.token, now)).toBeNull();
    expect(await peekPolicyAckToken(db.client, b.token, now)).toMatchObject({ acknowledgementId: 'ack-1' });
  });
});
