// Telling "written" from "silently matched no rows".
//
// The bug this exists for: a supabase UPDATE that changes nothing
// returns `error: null`. On 2026-09-02 a headcount of 100 was typed,
// saved, and re-published; the panel showed a green "Saved" and null
// reached Manatal. Nothing errored at any point.

import { describe, expect, it } from 'vitest';
import { judgeWrite, COUNT_EXACT } from '../mutations';

describe('judgeWrite', () => {
  it('accepts a write that changed a row', () => {
    const out = judgeWrite({ error: null, count: 1 });
    expect(out.ok).toBe(true);
    expect(out.matched).toBe(1);
    expect(out.message).toBeNull();
  });

  it('REFUSES a write that matched nothing, even with no error', () => {
    // This is the whole point. error:null and count:0 is what RLS
    // refusing a write looks like, and it used to read as success.
    const out = judgeWrite({ error: null, count: 0 });
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/matched no rows/i);
  });

  it('names the thing that was not saved, so the message is usable', () => {
    expect(judgeWrite({ error: null, count: 0 }, 'The stage change').message)
      .toMatch(/^The stage change was not saved/);
  });

  it('suggests the two things that actually cause it', () => {
    // Permission and a deleted record. A bare "failed" sends the
    // operator looking at the network tab for an error that is not there.
    const msg = judgeWrite({ error: null, count: 0 }).message ?? '';
    expect(msg).toMatch(/permission/i);
    expect(msg).toMatch(/deleted/i);
  });

  it('reports a real error in preference to the count', () => {
    const out = judgeWrite({ error: { message: 'permission denied for table x' }, count: 0 });
    expect(out.ok).toBe(false);
    expect(out.message).toBe('permission denied for table x');
  });

  it('does NOT fail a write whose count was never requested', () => {
    // PostgREST only counts when asked. Treating null as a refusal
    // would report every un-migrated call site as broken — a guard
    // that cries wolf gets deleted, and the real defect comes back.
    const out = judgeWrite({ error: null, count: null });
    expect(out.ok).toBe(true);
    expect(out.matched).toBe(1);
  });

  it('accepts a multi-row update', () => {
    expect(judgeWrite({ error: null, count: 7 })).toMatchObject({ ok: true, matched: 7 });
  });

  it('exports the exact options object supabase needs', () => {
    // A typo here silently returns count:null, which judgeWrite then
    // passes — so the constant is the thing to share, not the literal.
    expect(COUNT_EXACT).toEqual({ count: 'exact' });
  });
});
