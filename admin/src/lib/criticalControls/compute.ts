// Critical Control Visibility (go-live gap list, item 4, 2026-10-02).
//
// lib/riskGraph/intelligence.ts's own `ineffectiveSharedControls`
// already flags an ineffective control relied on by 2+ DISTINCT
// assessments — but that is a SHARED-exposure signal, not a dedicated
// "is every control we have called safety-critical actually working"
// view, and risk_item_controls/controls (123) had no safety-critical
// concept at all until migration 205 added `controls.safety_critical`,
// the exact pattern `training_courses`/`competencies`/
// `authorisation_types`/`job_roles` already use for the same fact on
// their own catalogues (Phase 3).
//
// Pure, deterministic, computed at read time — no stored aggregate,
// no AI, no score. A control's own `effectiveness` on each use it
// appears in already exists (123); this only groups those uses by
// control and reports which safety-critical controls have a gap.

export interface CriticalControlCatalogueRow { id: string; title: string; safety_critical: boolean; status: string }
export interface CriticalControlUseRow { risk_assessment_item_id: string; risk_assessment_id: string; control_id: string; effectiveness: string }
export interface CriticalControlAssessmentRow { id: string; title: string; status: string }

export type ControlUseBand = 'effective' | 'unverified' | 'gap';
export type CriticalControlBand = ControlUseBand;

const GAP_EFFECTIVENESS = new Set(['ineffective', 'not_implemented']);
const UNVERIFIED_EFFECTIVENESS = new Set(['verification_required']);

function bandFor(effectiveness: string): ControlUseBand {
  if (GAP_EFFECTIVENESS.has(effectiveness)) return 'gap';
  if (UNVERIFIED_EFFECTIVENESS.has(effectiveness)) return 'unverified';
  return 'effective';
}

/** gap is the most severe, then unverified, then effective. */
function worstBand(bands: readonly ControlUseBand[]): CriticalControlBand {
  if (bands.some(b => b === 'gap')) return 'gap';
  if (bands.some(b => b === 'unverified')) return 'unverified';
  return 'effective';
}

export interface CriticalControlUse {
  riskAssessmentId: string;
  riskAssessmentTitle: string;
  effectiveness: string;
  band: ControlUseBand;
}

export interface CriticalControlStatus {
  controlId: string;
  title: string;
  band: CriticalControlBand;
  uses: CriticalControlUse[];
  gapCount: number;
  unverifiedCount: number;
}

/** Only ACTIVE, safety-critical controls that are actually relied on
 *  by at least one risk assessment — a safety-critical control with
 *  zero uses is a catalogue entry nobody has applied yet, a different
 *  (and separately worth knowing) fact from "applied, and failing". */
export function computeCriticalControlVisibility(
  catalogue: readonly CriticalControlCatalogueRow[],
  uses: readonly CriticalControlUseRow[],
  assessments: readonly CriticalControlAssessmentRow[],
): CriticalControlStatus[] {
  const assessmentById = new Map(assessments.map(a => [a.id, a]));
  const criticalIds = new Set(catalogue.filter(c => c.safety_critical && c.status === 'active').map(c => c.id));
  const titleById = new Map(catalogue.map(c => [c.id, c.title]));

  const usesByControl = new Map<string, CriticalControlUseRow[]>();
  for (const u of uses) {
    if (!criticalIds.has(u.control_id)) continue;
    const list = usesByControl.get(u.control_id) ?? [];
    list.push(u);
    usesByControl.set(u.control_id, list);
  }

  const out: CriticalControlStatus[] = [];
  for (const [controlId, controlUses] of usesByControl) {
    const mapped: CriticalControlUse[] = controlUses.map(u => ({
      riskAssessmentId: u.risk_assessment_id,
      riskAssessmentTitle: assessmentById.get(u.risk_assessment_id)?.title ?? 'A risk assessment',
      effectiveness: u.effectiveness,
      band: bandFor(u.effectiveness),
    }));
    out.push({
      controlId,
      title: titleById.get(controlId) ?? 'A control',
      band: worstBand(mapped.map(m => m.band)),
      uses: mapped,
      gapCount: mapped.filter(m => m.band === 'gap').length,
      unverifiedCount: mapped.filter(m => m.band === 'unverified').length,
    });
  }

  // Worst first, then by title for a stable order.
  const severity: Record<CriticalControlBand, number> = { gap: 0, unverified: 1, effective: 2 };
  return out.sort((a, b) => severity[a.band] - severity[b.band] || a.title.localeCompare(b.title));
}
