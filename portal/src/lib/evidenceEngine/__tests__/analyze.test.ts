import { describe, expect, it } from 'vitest';
import { analyzeEvidenceCoverage, crossReferenceComplianceItems } from '../analyze';

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
    expect(out.gaps).toEqual([{ completionId: 'c1', itemId: 'i1', itemTitle: 'Fire extinguisher check', category: 'fire', outcome: 'pass', completedOn: '2026-09-01' }]);
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

  // Core-OS 360 Phase 23, Group 3 (closes C11.4): currentGaps is a
  // genuinely different computation from "every gap ever", not a UI
  // filter over the same list.
  it('currentGaps excludes an item whose NEWEST completion has evidence, even if an OLDER one did not', () => {
    const out = analyzeEvidenceCoverage({
      completions: [
        { id: 'c1', item_id: 'i1', outcome: 'fail', completed_on: '2026-01-01' },
        { id: 'c2', item_id: 'i1', outcome: 'pass', completed_on: '2026-09-01' },
      ],
      items: [{ id: 'i1', title: 'A', category: 'fire' }],
      files: [{ entity_type: 'register_completion', entity_id: 'c2' }],
    });
    expect(out.gaps.map(g => g.completionId)).toEqual(['c1']);
    expect(out.currentGaps).toEqual([]);
  });

  it('currentGaps includes an item whose NEWEST completion still has no evidence', () => {
    const out = analyzeEvidenceCoverage({
      completions: [
        { id: 'c1', item_id: 'i1', outcome: 'pass', completed_on: '2026-01-01' },
        { id: 'c2', item_id: 'i1', outcome: 'fail', completed_on: '2026-09-01' },
      ],
      items: [{ id: 'i1', title: 'A', category: 'fire' }],
      files: [{ entity_type: 'register_completion', entity_id: 'c1' }],
    });
    expect(out.gaps.map(g => g.completionId)).toEqual(['c2']);
    expect(out.currentGaps.map(g => g.completionId)).toEqual(['c2']);
  });

  it('currentGaps handles multiple items independently, each judged only by its OWN newest completion', () => {
    const out = analyzeEvidenceCoverage({
      completions: [
        { id: 'c1', item_id: 'i1', outcome: 'fail', completed_on: '2026-01-01' }, // superseded, has no evidence, not current
        { id: 'c2', item_id: 'i1', outcome: 'pass', completed_on: '2026-09-01' }, // current, has evidence
        { id: 'c3', item_id: 'i2', outcome: 'fail', completed_on: '2026-09-05' }, // current, no evidence
      ],
      items: [
        { id: 'i1', title: 'A', category: 'fire' },
        { id: 'i2', title: 'B', category: 'electrical' },
      ],
      files: [{ entity_type: 'register_completion', entity_id: 'c2' }],
    });
    expect(out.gaps.map(g => g.completionId).sort()).toEqual(['c1', 'c3']);
    expect(out.currentGaps.map(g => g.completionId)).toEqual(['c3']);
  });
});

describe('crossReferenceComplianceItems', () => {
  it('counts links by source kind, keyed per item id', () => {
    const out = crossReferenceComplianceItems({
      itemIds: ['i1', 'i2'],
      standardEvidenceLinks: [{ entity_id: 'i1' }, { entity_id: 'i1' }],
      requirementEvidenceLinks: [
        { entity_id: 'i1', source_type: 'legal_obligation' },
        { entity_id: 'i2', source_type: 'objective' },
        { entity_id: 'i2', source_type: 'audit_finding' },
      ],
    });
    expect(out).toEqual([
      { itemId: 'i1', isoClauseCount: 2, legalObligationCount: 1, objectiveCount: 0, auditFindingCount: 0, totalCount: 3 },
      { itemId: 'i2', isoClauseCount: 0, legalObligationCount: 0, objectiveCount: 1, auditFindingCount: 1, totalCount: 2 },
    ]);
  });

  it('excludes an item with zero cross-references entirely, never a zero-count row', () => {
    const out = crossReferenceComplianceItems({
      itemIds: ['i1', 'i2'],
      standardEvidenceLinks: [{ entity_id: 'i1' }],
      requirementEvidenceLinks: [],
    });
    expect(out.map(r => r.itemId)).toEqual(['i1']);
  });

  it('ignores a link naming an item id outside the supplied itemIds list', () => {
    const out = crossReferenceComplianceItems({
      itemIds: ['i1'],
      standardEvidenceLinks: [{ entity_id: 'i1' }, { entity_id: 'unrelated-item' }],
      requirementEvidenceLinks: [],
    });
    expect(out).toEqual([{ itemId: 'i1', isoClauseCount: 1, legalObligationCount: 0, objectiveCount: 0, auditFindingCount: 0, totalCount: 1 }]);
  });

  it('returns an empty array with no links at all', () => {
    expect(crossReferenceComplianceItems({ itemIds: ['i1'], standardEvidenceLinks: [], requirementEvidenceLinks: [] })).toEqual([]);
  });
});
