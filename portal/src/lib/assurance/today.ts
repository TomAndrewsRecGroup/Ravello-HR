// Core-OS 360 Phase 18: Core 360 Assurance — "Are we safe and
// compliant today?"
//
// A composition, not a new computation: this file takes an ALREADY-
// COMPUTED PortfolioCounts (lib/health/portfolioCounts.ts, Phase 6 —
// the "right now" operational facts: workers not currently Safe to
// Deploy, assets quarantined or out of service, safety-critical
// requirement gaps, open critical actions, open incident
// investigations, major audit findings still open, overdue legal
// evaluations, overdue controlled documents) for ONE company, and an
// ALREADY-COMPUTED ComplianceTwinSnapshot (lib/complianceTwin/
// assemble.ts, Phase 12 — the slower-moving five-area RAG picture),
// and combines them into one dated view. It computes no new raw fact
// of its own — the identical posture assemble.ts itself already takes
// one layer down.
//
// ABSOLUTE RULE, inherited from every prior phase that touched this
// ground: never assert "safe" or "compliant" as a verdict. The
// headline is a COUNT, or the plain absence of one — "no items are
// currently flagged" is a fact; "you are compliant" is a legal
// conclusion this platform never makes, the same discipline
// PUWER_ASSESSMENT_OUTCOME_LABELS / the Digital Twin / the governance
// KPI module already apply.

import type { PortfolioCounts } from '@/lib/health/portfolioCounts';
import type { ComplianceTwinSnapshot } from '@/lib/complianceTwin/assemble';

export type AssuranceBand = 'clear' | 'attention' | 'urgent';

export interface AssuranceItem {
  key: string;
  label: string;
  count: number;
  /** 'high' drives the overall band to 'urgent'; 'medium' to at least 'attention'. */
  severity: 'high' | 'medium';
}

export interface AssuranceTodaySnapshot {
  band: AssuranceBand;
  /** A plain factual sentence — never "safe" or "compliant" used as an assertion. */
  headline: string;
  /** Only the non-zero counts, worst severity first, tie-broken by key for determinism. */
  items: AssuranceItem[];
  twin: ComplianceTwinSnapshot;
  asOf: string;
}

const SEVERITY_WEIGHT: Record<AssuranceItem['severity'], number> = { high: 1, medium: 0 };

/** Every candidate item this function knows how to report — order here
 *  is the tie-break order when severities are equal. Add a new
 *  PortfolioCounts field here, never invent a second combining
 *  function elsewhere. */
function buildItems(counts: PortfolioCounts): AssuranceItem[] {
  const candidates: AssuranceItem[] = [
    { key: 'safety_critical_gaps', label: 'Safety-critical requirement gaps', count: counts.safety_critical_gaps, severity: 'high' },
    { key: 'workers_not_ready', label: 'Workers not currently Safe to Deploy', count: counts.workers_not_ready, severity: 'high' },
    { key: 'assets_unavailable', label: 'Assets quarantined or out of service', count: counts.assets_unavailable, severity: 'high' },
    { key: 'open_critical_actions', label: 'Open high/critical actions', count: counts.open_critical_actions, severity: 'high' },
    { key: 'open_incident_investigations', label: 'Open incident investigations', count: counts.open_incident_investigations, severity: 'medium' },
    { key: 'major_audit_findings', label: 'Major/critical audit findings still open', count: counts.major_audit_findings, severity: 'medium' },
    { key: 'overdue_legal_evaluations', label: 'Legal obligations overdue review', count: counts.overdue_legal_evaluations, severity: 'medium' },
    { key: 'overdue_controlled_documents', label: 'Controlled documents overdue review', count: counts.overdue_controlled_documents, severity: 'medium' },
  ];
  return candidates
    .filter(i => i.count > 0)
    .sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || a.key.localeCompare(b.key));
}

export function assembleAssuranceToday(
  counts: PortfolioCounts,
  twin: ComplianceTwinSnapshot,
  now: Date,
): AssuranceTodaySnapshot {
  const items = buildItems(counts);

  const hasHigh = items.some(i => i.severity === 'high') || twin.overallBand === 'red';
  const hasMedium = items.some(i => i.severity === 'medium') || twin.overallBand === 'amber';
  const band: AssuranceBand = hasHigh ? 'urgent' : hasMedium ? 'attention' : 'clear';

  const total = items.reduce((sum, i) => sum + i.count, 0);
  const headline = items.length === 0
    ? 'No items are currently flagged across safety, workforce, assets, actions or governance.'
    : `${total} item${total === 1 ? '' : 's'} across ${items.length} area${items.length === 1 ? '' : 's'} currently need${total === 1 ? 's' : ''} attention.`;

  return { band, headline, items, twin, asOf: now.toISOString() };
}
