import { describe, expect, it } from 'vitest';
import { analyzeEvidenceCoverage } from '../analyze';

describe('analyzeEvidenceCoverage', () => {
  it('reports null coverage (never 0%) with zero completions — "not applicable" is a different fact from "0% covered"', () => {
    const out = analyzeEvidenceCoverage({ completions: [], items: [], files: [] });
    expect(out.totalCompletions).toBe(0);
    expect(out.coveragePercent).toBeNull();
    expect(out.gaps).toEqual([]);
    expect(out.byCategory).toEqual([]);
  });

  it('flags a completion with no hs_files row referencing it as a gap', () => {
    const out = analyzeEvidenceCoverage({
      completions: [{ id: 'c1', item_id: 'i1', outcome: 'pass', completed_on: '2026-09-01' }],
      items: [{ id: 'i1', title: 'Fire extinguisher check', category: 'fire' }],
      files: [],
    });
    expect(out.gaps).toEqual([{ completionId: 'c1', itemId: 'i1', itemTitle: 'Fire extinguisher check', outcome: 'pass', completedOn: '2026-09-01' }]);
    expect(out.completionsWithEvidenceCount).toBe(0);
    expect(out.coveragePercent).toBe(0);
  });

  it('does not flag a completion with a matching hs_files row', () => {
    const out = analyzeEvidenceCoverage({
      completions: [{ id: 'c1', item_id: 'i1', outcome: 'pass', completed_on: '2026-09-01' }],
      items: [{ id: 'i1', title: 'Fire extinguisher check', category: 'fire' }],
      files: [{ entity_type: 'register_completion', entity_id: 'c1' }],
    });
    expect(out.gaps).toEqual([]);
    expect(out.completionsWithEvidenceCount).toBe(1);
    expect(out.coveragePercent).toBe(100);
  });

  it('never counts a file attached to a DIFFERENT entity_type as evidence, even with a matching id', () => {
    const out = analyzeEvidenceCoverage({
      completions: [{ id: 'c1', item_id: 'i1', outcome: 'pass', completed_on: '2026-09-01' }],
      items: [{ id: 'i1', title: 'X', category: 'fire' }],
      files: [{ entity_type: 'equipment', entity_id: 'c1' }],
    });
    expect(out.gaps).toHaveLength(1);
  });

  it('falls back to "Untitled register item" and category "unknown" for a completion whose item was not supplied, never throwing', () => {
    const out = analyzeEvidenceCoverage({
      completions: [{ id: 'c1', item_id: 'missing-item', outcome: 'fail', completed_on: '2026-09-01' }],
      items: [],
      files: [],
    });
    expect(out.gaps[0].itemTitle).toBe('Untitled register item');
    expect(out.byCategory).toEqual([{ category: 'unknown', total: 1, withEvidence: 0 }]);
  });

  it('groups by category and sorts by the WIDEST gap first, tie-broken alphabetically', () => {
    const out = analyzeEvidenceCoverage({
      completions: [
        { id: 'c1', item_id: 'i1', outcome: 'pass', completed_on: '2026-09-01' },
        { id: 'c2', item_id: 'i2', outcome: 'pass', completed_on: '2026-09-02' },
        { id: 'c3', item_id: 'i2', outcome: 'pass', completed_on: '2026-09-03' },
      ],
      items: [
        { id: 'i1', title: 'A', category: 'fire' },
        { id: 'i2', title: 'B', category: 'electrical' },
      ],
      files: [],
    });
    expect(out.byCategory).toEqual([
      { category: 'electrical', total: 2, withEvidence: 0 },
      { category: 'fire', total: 1, withEvidence: 0 },
    ]);
  });

  it('sorts gaps most-recent-first', () => {
    const out = analyzeEvidenceCoverage({
      completions: [
        { id: 'c1', item_id: 'i1', outcome: 'pass', completed_on: '2026-09-01' },
        { id: 'c2', item_id: 'i1', outcome: 'pass', completed_on: '2026-09-15' },
      ],
      items: [{ id: 'i1', title: 'A', category: 'fire' }],
      files: [],
    });
    expect(out.gaps.map(g => g.completionId)).toEqual(['c2', 'c1']);
  });
});
