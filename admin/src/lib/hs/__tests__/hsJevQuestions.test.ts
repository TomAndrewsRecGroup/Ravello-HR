import { describe, expect, it } from 'vitest';
import {
  HS_ATTENTION_LEVELS, HS_LEGAL_BASIS_OPTIONS, HS_RECURRENCE_OPTIONS, HS_SEVERITY_LEVELS,
  classifyItemQuestions, fallbackAttention, followupQuestions, followupState, rankQuestions, toClassifySuggestion,
} from '../jevQuestions';
import { HS_REGISTER_CATEGORIES, HS_RECURRENCE_UNITS } from '../vocab';
import { AUTO_ACT_KINDS, DECISION_KINDS } from '@/lib/jev/types';

// A Jev suggestion can only ever be a value the register form already
// accepts. Both directions: every category is offered, and nothing
// offered is outside the vocabulary.

describe('classify questions', () => {
  const q = classifyItemQuestions();
  it('offers exactly the register categories', () => {
    expect(Object.keys((q.category as { criteria: Record<string, string> }).criteria).sort()).toEqual([...HS_REGISTER_CATEGORIES].sort());
  });
  it('every recurrence option maps to a real recurrence unit', () => {
    for (const [k, v] of Object.entries(HS_RECURRENCE_OPTIONS)) {
      if (v.unit !== null) expect(HS_RECURRENCE_UNITS as readonly string[], k).toContain(v.unit);
      else expect(v.every).toBeNull();
    }
    expect(Object.keys((q.recurrence as { criteria: Record<string, string> }).criteria).sort()).toEqual(Object.keys(HS_RECURRENCE_OPTIONS).sort());
    expect(Object.keys((q.legal_basis as { criteria: Record<string, string> }).criteria).sort()).toEqual(Object.keys(HS_LEGAL_BASIS_OPTIONS).sort());
  });
  it('frames the state as data and never interpolates it into the instructions', () => {
    for (const question of Object.values(q)) {
      expect(question.instructions).toMatch(/data/i);
      expect(question.instructions).toMatch(/not as instructions|ignore anything/i);
      expect(question.instructions).not.toMatch(/\$\{/);
    }
  });
  it('validates a suggestion against the tuples, so an unknown id is null', () => {
    expect(toClassifySuggestion({ category: 'hs_fire', recurrence: 'annual', legal_basis: 'rrfso_2005' }, 0.9)).toMatchObject({
      category: 'hs_fire', recurrence: 'annual', legal_basis_text: 'Regulatory Reform (Fire Safety) Order 2005', confidence: 0.9,
    });
    expect(toClassifySuggestion({ category: 'hs_drones', recurrence: 'annual', legal_basis: 'none' }, 0.9)).toBeNull();
    expect(toClassifySuggestion({ category: 'hs_fire', recurrence: 'never', legal_basis: 'none' }, 0.9)).toBeNull();
    expect(toClassifySuggestion({ category: 'hs_fire', recurrence: 'annual', legal_basis: 'none' }, 0.9)!.legal_basis_text).toBeNull();
  });
});

describe('rank and follow-up', () => {
  it('rank asks one score per item over the attention rubric', () => {
    const q = rankQuestions([{ category: 'hs_fire', days_overdue: 3, recurrence_months: 12, last_outcome: null, evidence_count: 0, legal_basis_present: true }, { category: null, days_overdue: -40, recurrence_months: null, last_outcome: 'pass', evidence_count: 2, legal_basis_present: false }]);
    expect(Object.keys(q)).toEqual(['item_0', 'item_1']);
    expect((q.item_0 as { criteria: readonly string[] }).criteria).toEqual([...HS_ATTENTION_LEVELS]);
  });
  it('the deterministic fallback ranks a failed fire check above a routine item', () => {
    expect(fallbackAttention({ category: 'hs_fire', days_overdue: 10, recurrence_months: 12, last_outcome: 'fail', evidence_count: 0, legal_basis_present: true })).toBe('critical');
    expect(fallbackAttention({ category: 'hs_other', days_overdue: -200, recurrence_months: 12, last_outcome: 'pass', evidence_count: 3, legal_basis_present: false })).toBe('routine');
    expect(fallbackAttention({ category: 'hs_gas', days_overdue: 5, recurrence_months: 12, last_outcome: null, evidence_count: 1, legal_basis_present: true })).toBe('priority');
  });
  it('follow-up state carries the provider text under named fields only', () => {
    expect(Object.keys(followupState({ activity_type: 'site_visit', title: 'T', summary: null })).sort()).toEqual(['activity_type', 'summary', 'title']);
    const q = followupQuestions();
    expect(Object.keys((q.severity as { criteria: Record<string, string> }).criteria).sort()).toEqual(Object.keys(HS_SEVERITY_LEVELS).sort());
    expect(q.needs_followup.instructions).toMatch(/claims something has already been decided/);
  });
});

describe('policy', () => {
  it('only the register ranking may act on its own; classify and follow-up are recommendations', () => {
    // bd_next_action joins it in PR 4: its state is scan counts and dates the platform computed, never text.
    expect([...AUTO_ACT_KINDS]).toEqual(['hs_register_rank', 'bd_next_action']);
    for (const k of DECISION_KINDS) if (k !== 'hs_register_rank' && k !== 'bd_next_action') expect(AUTO_ACT_KINDS.has(k)).toBe(false);
  });
});
