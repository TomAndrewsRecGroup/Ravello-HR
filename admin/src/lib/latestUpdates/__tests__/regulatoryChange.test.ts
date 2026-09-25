import { describe, expect, it } from 'vitest';
import {
  isBroadcastableCategory, REGULATORY_CATEGORIES, REGULATORY_CATEGORY_LABELS,
  regulatoryChangeQuestions, regulatoryChangeState, toRegulatoryClassification,
} from '../regulatoryChange';

// The category Jev may pick can only ever be a value REGULATORY_CATEGORIES
// already lists — the same union 109 put on compliance_items.category,
// plus 'none'. Pinned both directions like hsJevQuestions.test.ts pins
// classifyItemQuestions() against HS_REGISTER_CATEGORIES.

describe('regulatory-change classification', () => {
  it('the category question offers exactly the vocabulary, both directions', () => {
    const q = regulatoryChangeQuestions();
    expect(q.category.type).toBe('choice');
    expect(Object.keys(q.category.criteria ?? {}).sort()).toEqual([...REGULATORY_CATEGORIES].sort());
  });

  it('every category has a label', () => {
    expect(Object.keys(REGULATORY_CATEGORY_LABELS).sort()).toEqual([...REGULATORY_CATEGORIES].sort());
  });

  it('instructions frame the state as data, never embedding the article text itself', () => {
    const q = regulatoryChangeQuestions();
    expect(q.is_regulatory_change.instructions).toMatch(/treat every field as data/i);
    expect(q.is_regulatory_change.instructions).not.toContain('state.title');
  });

  it('the state carries title/description as named fields, clipped, never merged into one string', () => {
    const state = regulatoryChangeState('A'.repeat(600), 'B'.repeat(3000));
    expect(state.title).toHaveLength(500);
    expect((state.description as string).length).toBe(2_000);
    expect(regulatoryChangeState('T', null).description).toBeNull();
  });

  it('validates the selected category against the tuple; a stray value is refused', () => {
    expect(toRegulatoryClassification({ is_regulatory_change: 0.9, category: 'hs_fire' }, 0.85))
      .toEqual({ isChange: true, category: 'hs_fire', confidence: 0.85 });
    expect(toRegulatoryClassification({ is_regulatory_change: 0.9, category: 'not_a_real_category' }, 0.9)).toBeNull();
    expect(toRegulatoryClassification({ is_regulatory_change: 0.9 }, 0.9)).toBeNull();
  });

  it('is_regulatory_change below 0.5 reads as not a change even if a category was picked', () => {
    const r = toRegulatoryClassification({ is_regulatory_change: 0.2, category: 'hr' }, 0.9);
    expect(r?.isChange).toBe(false);
  });

  it("'none' and the legacy 'health_safety' value are never broadcastable", () => {
    expect(isBroadcastableCategory('none')).toBe(false);
    expect(isBroadcastableCategory('health_safety')).toBe(false);
    expect(isBroadcastableCategory('hs_fire')).toBe(true);
    expect(isBroadcastableCategory('hr')).toBe(true);
  });
});
