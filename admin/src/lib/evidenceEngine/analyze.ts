// Core-OS 360 Phase 11, Group 1: Evidence Engine & Evidence-Backed
// Compliance.
//
// hs_files (095) has always accepted `entity_type = 'register_
// completion'` — a completion CAN already carry evidence. Nothing has
// ever checked whether one actually DOES. This module answers exactly
// that, and only that: "is there a file", never a judgement of whether
// the file is legible, current, or actually proves what it claims to.
// Pure, deterministic, computed at READ TIME from already-fetched rows
// — no AI, no stored aggregate, the same posture every KPI/
// intelligence module in this codebase already takes.
//
// This is deliberately NOT the requirement_evidence_links/ISO-readiness
// system (Phase 5) — that already reports its own clause-evidence
// coverage; duplicating that logic here would be a second source of
// the same kind of fact. This module closes a DIFFERENT, checked gap:
// the H&S register's own completions have no equivalent report at all.

export interface RegisterCompletionRow {
  id: string;
  item_id: string;
  outcome: 'pass' | 'pass_with_actions' | 'fail';
  completed_on: string;
}

export interface ComplianceItemRow {
  id: string;
  title: string;
  category: string;
}

export interface EvidenceFileRow {
  entity_type: string;
  entity_id: string;
}

export interface EvidenceGap {
  completionId: string;
  itemId: string;
  itemTitle: string;
  /** Core-OS 360 Phase 23, Group 3 (closes C11.3): resolvable via the
   *  existing itemById lookup all along, just not carried onto the row
   *  before this — needed for the client's per-category filter. */
  category: string;
  outcome: RegisterCompletionRow['outcome'];
  completedOn: string;
}

export interface CategoryCoverage {
  category: string;
  total: number;
  withEvidence: number;
}

export interface EvidenceCoverageSummary {
  totalCompletions: number;
  completionsWithEvidenceCount: number;
  /** Never a percentage rounded away to nothing — null with zero completions, since "0% covered" and "not applicable" are different facts. */
  coveragePercent: number | null;
  gaps: EvidenceGap[];
  /**
   * Core-OS 360 Phase 23, Group 3 (closes C11.4): the subset of `gaps`
   * restricted to, per item, only its NEWEST completion (by
   * `completed_on`) — a genuinely different, correct computation from
   * "every gap ever", never a UI filter over the same list. Mirrors
   * the "only the newest row decides current state" rule
   * `hs_equipment_inspection_roll()`/148a's PUWER review-date roll
   * already established: an item whose LATEST completion has evidence
   * is not a current gap, even if an older, now-superseded completion
   * for the same item lacked one.
   */
  currentGaps: EvidenceGap[];
  byCategory: CategoryCoverage[];
}

/**
 * Core-OS 360 Phase 23, Group 3 (closes C11.5): "combined
 * cross-reference navigation" — given a compliance-item id, how many
 * OTHER records already point at it as evidence, broken down by
 * SOURCE kind. Deliberately COUNTS ONLY, never a per-link title
 * resolution (no join into standard_clauses/legal_requirements/
 * objectives/audit_findings for a label) — the same "reporting a
 * fact, never re-deriving a label chain that already lives on its
 * own page" economy Phase 8's own explorer scope note already
 * accepted for uncurated neighbours. The UI links to the relevant
 * CATALOGUE page (/iso, /legal) instead of naming each individual
 * linked record.
 */
export interface StandardEvidenceLinkRow { entity_id: string }
export interface RequirementEvidenceLinkRow {
  entity_id: string;
  source_type: 'legal_obligation' | 'objective' | 'audit_finding';
}

export interface ComplianceItemCrossReference {
  itemId: string;
  isoClauseCount: number;
  legalObligationCount: number;
  objectiveCount: number;
  auditFindingCount: number;
  totalCount: number;
}

export function crossReferenceComplianceItems(input: {
  itemIds: string[];
  /** Already filtered by the caller to entity_type = 'compliance_item'. */
  standardEvidenceLinks: StandardEvidenceLinkRow[];
  /** Already filtered by the caller to entity_type = 'compliance_item'. */
  requirementEvidenceLinks: RequirementEvidenceLinkRow[];
}): ComplianceItemCrossReference[] {
  const { itemIds, standardEvidenceLinks, requirementEvidenceLinks } = input;

  const isoCounts = new Map<string, number>();
  for (const l of standardEvidenceLinks) isoCounts.set(l.entity_id, (isoCounts.get(l.entity_id) ?? 0) + 1);

  const bySource: Record<'legal_obligation' | 'objective' | 'audit_finding', Map<string, number>> = {
    legal_obligation: new Map(), objective: new Map(), audit_finding: new Map(),
  };
  for (const l of requirementEvidenceLinks) {
    const m = bySource[l.source_type];
    m.set(l.entity_id, (m.get(l.entity_id) ?? 0) + 1);
  }

  return itemIds
    .map(itemId => {
      const isoClauseCount = isoCounts.get(itemId) ?? 0;
      const legalObligationCount = bySource.legal_obligation.get(itemId) ?? 0;
      const objectiveCount = bySource.objective.get(itemId) ?? 0;
      const auditFindingCount = bySource.audit_finding.get(itemId) ?? 0;
      return {
        itemId, isoClauseCount, legalObligationCount, objectiveCount, auditFindingCount,
        totalCount: isoClauseCount + legalObligationCount + objectiveCount + auditFindingCount,
      };
    })
    .filter(r => r.totalCount > 0);
}

export function analyzeEvidenceCoverage(input: {
  completions: RegisterCompletionRow[];
  items: ComplianceItemRow[];
  files: EvidenceFileRow[];
}): EvidenceCoverageSummary {
  const { completions, items, files } = input;

  const evidencedCompletionIds = new Set(
    files.filter(f => f.entity_type === 'register_completion').map(f => f.entity_id),
  );
  const itemById = new Map(items.map(i => [i.id, i]));

  const gaps: EvidenceGap[] = [];
  const byCategory = new Map<string, { total: number; withEvidence: number }>();

  for (const c of completions) {
    const item = itemById.get(c.item_id);
    const category = item?.category ?? 'unknown';
    if (!byCategory.has(category)) byCategory.set(category, { total: 0, withEvidence: 0 });
    const cat = byCategory.get(category)!;
    cat.total++;

    const hasEvidence = evidencedCompletionIds.has(c.id);
    if (hasEvidence) {
      cat.withEvidence++;
    } else {
      gaps.push({
        completionId: c.id,
        itemId: c.item_id,
        itemTitle: item?.title ?? 'Untitled register item',
        category,
        outcome: c.outcome,
        completedOn: c.completed_on,
      });
    }
  }

  const completionsWithEvidenceCount = completions.length - gaps.length;

  // The newest completion per item, ties broken by id for determinism —
  // never trusted to arrive pre-sorted from the caller.
  const newestByItem = new Map<string, RegisterCompletionRow>();
  for (const c of completions) {
    const current = newestByItem.get(c.item_id);
    if (!current || c.completed_on > current.completed_on
      || (c.completed_on === current.completed_on && c.id > current.id)) {
      newestByItem.set(c.item_id, c);
    }
  }
  const newestCompletionIds = new Set([...newestByItem.values()].map(c => c.id));
  const currentGaps = gaps.filter(g => newestCompletionIds.has(g.completionId));

  return {
    totalCompletions: completions.length,
    completionsWithEvidenceCount,
    coveragePercent: completions.length > 0 ? (completionsWithEvidenceCount / completions.length) * 100 : null,
    gaps: gaps.sort((a, b) => b.completedOn.localeCompare(a.completedOn)),
    currentGaps: currentGaps.sort((a, b) => b.completedOn.localeCompare(a.completedOn)),
    byCategory: [...byCategory.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => {
        const gapsA = a.total - a.withEvidence;
        const gapsB = b.total - b.withEvidence;
        return gapsB - gapsA || a.category.localeCompare(b.category);
      }),
  };
}
