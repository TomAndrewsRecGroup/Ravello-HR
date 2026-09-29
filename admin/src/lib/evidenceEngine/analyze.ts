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
  byCategory: CategoryCoverage[];
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
        outcome: c.outcome,
        completedOn: c.completed_on,
      });
    }
  }

  const completionsWithEvidenceCount = completions.length - gaps.length;

  return {
    totalCompletions: completions.length,
    completionsWithEvidenceCount,
    coveragePercent: completions.length > 0 ? (completionsWithEvidenceCount / completions.length) * 100 : null,
    gaps: gaps.sort((a, b) => b.completedOn.localeCompare(a.completedOn)),
    byCategory: [...byCategory.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => {
        const gapsA = a.total - a.withEvidence;
        const gapsB = b.total - b.withEvidence;
        return gapsB - gapsA || a.category.localeCompare(b.category);
      }),
  };
}
