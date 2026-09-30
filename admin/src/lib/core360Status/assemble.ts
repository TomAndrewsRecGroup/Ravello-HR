// Core-OS 360 Completion Programme, Phase 27, Group 3 (gap-ledger row
// C13.8 — "Core 360 Status view: People/Plant/Training/Risk Controls/
// Environmental/Contractors"). A shared-dupe pair (both apps need the
// identical domain logic) and a sibling to lib/complianceTwin/
// assemble.ts / lib/assurance/today.ts — a PURE COMPOSITION, computing
// no new raw fact of its own beyond the two small counts this file
// adds (training expiry, open environmental spills/waste non-
// conformances), neither of which any existing module already
// computes.
//
// Never a duplicate of the Digital Twin (Phase 12) or Assurance Today
// (Phase 18) — both are explicitly narrower predecessors (see C18.4 in
// docs/CORE_OS_360_COMPLETION_MATRIX.md: "Phase 18 was always scoped
// as 'today only'... Phase 27 supersedes/extends it"). This is the
// first DOMAIN-scored, six-area-NAMED surface the Master Spec's own
// C13.8 wording asks for, reusing already-computed inputs
// (PortfolioCounts, RiskGraphIntelligence) rather than inventing new
// raw facts a third time.
//
// No AI anywhere in this file. Every band is a fixed, named-threshold
// `if`-chain over inspectable counts — the same complianceTwin/
// assemble.ts posture, never a formula or a score.

import type { PortfolioCounts } from '@/lib/health/portfolioCounts';
import type { RiskGraphIntelligence } from '@/lib/riskGraph/intelligence';

export type Core360Band = 'ok' | 'attention' | 'critical';
export type Core360DomainKey = 'people' | 'plant' | 'training' | 'risk_controls' | 'environmental' | 'contractors';

export interface Core360Domain {
  domain: Core360DomainKey;
  label: string;
  band: Core360Band;
  reasons: string[];
  inputs: Record<string, number>;
}

export interface Core360StatusSnapshot {
  overallBand: Core360Band;
  domains: Core360Domain[];
}

export interface TrainingRecordExpiryRow {
  expires_on: string | null;
}

export interface EnvironmentalSpillStatusRow {
  status: string;
}

export interface WasteMovementConformanceRow {
  non_conformance: boolean;
}

const TRAINING_EXPIRING_WINDOW_DAYS = 30; // matches lib/reminders/rules.ts's own due_30 bucket

export interface TrainingExpiryCounts {
  expired: number;
  expiringSoon: number;
}

/** The one genuinely new count this file adds for Training — no
 *  existing module computes it. An expiry exactly today counts as
 *  expired, not expiring (the same "due_0 is already due, not still
 *  due soon" convention the reminders framework uses elsewhere). */
export function computeTrainingExpiry(rows: TrainingRecordExpiryRow[], today: Date): TrainingExpiryCounts {
  const todayStr = today.toISOString().slice(0, 10);
  const windowEnd = new Date(today.getTime() + TRAINING_EXPIRING_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  let expired = 0;
  let expiringSoon = 0;
  for (const r of rows) {
    if (!r.expires_on) continue;
    if (r.expires_on <= todayStr) expired++;
    else if (r.expires_on <= windowEnd) expiringSoon++;
  }
  return { expired, expiringSoon };
}

export interface EnvironmentalOpenCounts {
  openSpills: number;
  wasteNonConformances: number;
}

/** The other genuinely new count — an open (not yet closed) spill and
 *  a recorded waste non-conformance, the same two source tables
 *  environmentalRules.ts's own consequence rules already key on. */
export function computeEnvironmentalOpen(
  spills: EnvironmentalSpillStatusRow[],
  wasteMovements: WasteMovementConformanceRow[],
): EnvironmentalOpenCounts {
  return {
    openSpills: spills.filter(s => s.status !== 'closed').length,
    wasteNonConformances: wasteMovements.filter(w => w.non_conformance).length,
  };
}

function buildDomain(domain: Core360DomainKey, label: string, band: Core360Band, reasons: string[], inputs: Record<string, number>): Core360Domain {
  return { domain, label, band, reasons, inputs };
}

function worstBand(domains: Core360Domain[]): Core360Band {
  if (domains.some(d => d.band === 'critical')) return 'critical';
  if (domains.some(d => d.band === 'attention')) return 'attention';
  return 'ok';
}

export interface Core360StatusInput {
  portfolioCounts: PortfolioCounts;
  riskGraph: RiskGraphIntelligence;
  trainingRows: TrainingRecordExpiryRow[];
  environmentalSpills: EnvironmentalSpillStatusRow[];
  wasteMovements: WasteMovementConformanceRow[];
  today: Date;
}

export function assembleCore360Status(input: Core360StatusInput): Core360StatusSnapshot {
  const { portfolioCounts: pc, riskGraph: rg } = input;
  const training = computeTrainingExpiry(input.trainingRows, input.today);
  const environmental = computeEnvironmentalOpen(input.environmentalSpills, input.wasteMovements);

  // People — safety_critical_gaps is Phase 3's ONE definition of
  // safety-critical (person_deployment_status's own stored summary),
  // so any nonzero value is the domain's critical signal; an ordinary
  // not-ready worker with no safety-critical gap is only attention.
  // The two counts are independently derived over the same rows (not a
  // guaranteed subset relationship at the type level — countBy() runs
  // two separate predicates), so both facts are reported when both
  // apply, never hiding the broader not-ready count behind the
  // narrower safety-critical one — the same "a red domain still
  // reports every true amber-level fact" discipline this file's own
  // Training/Environmental domains already use, and the exact bug
  // class Phase 23's own Compliance Twin adversarial pass found and
  // fixed once already.
  const peopleReasons: string[] = [];
  if (pc.safety_critical_gaps > 0) peopleReasons.push(`${pc.safety_critical_gaps} safety-critical Safe to Deploy gap${pc.safety_critical_gaps === 1 ? '' : 's'}.`);
  if (pc.workers_not_ready > 0) peopleReasons.push(`${pc.workers_not_ready} worker${pc.workers_not_ready === 1 ? '' : 's'} not currently Safe to Deploy.`);
  if (peopleReasons.length === 0) peopleReasons.push('No workers currently flagged not-ready.');
  const people = buildDomain('people', 'People', pc.safety_critical_gaps > 0 ? 'critical' : pc.workers_not_ready > 0 ? 'attention' : 'ok',
    peopleReasons,
    { workers_not_ready: pc.workers_not_ready, safety_critical_gaps: pc.safety_critical_gaps });

  // Plant — assets_unavailable already merges quarantined and
  // out_of_service (lib/health/portfolioCounts.ts). 3+ unavailable is
  // treated as critical — a single asset off the floor is routine
  // maintenance; several at once is a pattern worth escalating.
  const PLANT_CRITICAL_MIN = 3;
  const plant = buildDomain('plant', 'Plant', pc.assets_unavailable >= PLANT_CRITICAL_MIN ? 'critical' : pc.assets_unavailable > 0 ? 'attention' : 'ok',
    pc.assets_unavailable > 0
      ? [`${pc.assets_unavailable} asset${pc.assets_unavailable === 1 ? '' : 's'} quarantined or out of service.`]
      : ['No assets currently unavailable.'],
    { assets_unavailable: pc.assets_unavailable });

  // Training — any EXPIRED record is critical (a lapsed, not merely
  // approaching, certification); expiring-only is attention.
  const trainingBand: Core360Band = training.expired > 0 ? 'critical' : training.expiringSoon > 0 ? 'attention' : 'ok';
  const trainingReasons: string[] = [];
  if (training.expired > 0) trainingReasons.push(`${training.expired} training record${training.expired === 1 ? '' : 's'} expired.`);
  if (training.expiringSoon > 0) trainingReasons.push(`${training.expiringSoon} expiring within ${TRAINING_EXPIRING_WINDOW_DAYS} days.`);
  if (trainingReasons.length === 0) trainingReasons.push('No training records expired or expiring soon.');
  const trainingDomain = buildDomain('training', 'Training', trainingBand, trainingReasons, { expired: training.expired, expiring_soon: training.expiringSoon });

  // Risk Controls — an ineffective SHARED control (relied on by 2+
  // assessments, Phase 8's own definition) is a single point of
  // failure across multiple assessments at once, so it is this
  // domain's critical signal; an uncovered hazard alone is attention.
  const riskControlsBand: Core360Band = rg.ineffectiveSharedControls.length > 0 ? 'critical' : rg.uncoveredHazards.length > 0 ? 'attention' : 'ok';
  const riskControlsReasons: string[] = [];
  if (rg.ineffectiveSharedControls.length > 0) riskControlsReasons.push(`${rg.ineffectiveSharedControls.length} control${rg.ineffectiveSharedControls.length === 1 ? '' : 's'} relied on by multiple assessments recorded as ineffective.`);
  if (rg.uncoveredHazards.length > 0) riskControlsReasons.push(`${rg.uncoveredHazards.length} hazard${rg.uncoveredHazards.length === 1 ? '' : 's'} with no risk assessment coverage.`);
  if (riskControlsReasons.length === 0) riskControlsReasons.push('Every hazard has risk assessment coverage and no shared control is recorded ineffective.');
  const riskControls = buildDomain('risk_controls', 'Risk Controls', riskControlsBand, riskControlsReasons,
    { uncovered_hazards: rg.uncoveredHazards.length, ineffective_shared_controls: rg.ineffectiveSharedControls.length });

  // Environmental — an open (uncontained/unclosed) spill is critical;
  // a waste non-conformance alone, and permits expiring within 30
  // days (PortfolioCounts), are attention.
  const envAttentionCount = environmental.wasteNonConformances + pc.environmental_permits_expiring;
  const environmentalBand: Core360Band = environmental.openSpills > 0 ? 'critical' : envAttentionCount > 0 ? 'attention' : 'ok';
  const environmentalReasons: string[] = [];
  if (environmental.openSpills > 0) environmentalReasons.push(`${environmental.openSpills} environmental spill${environmental.openSpills === 1 ? '' : 's'} not yet closed.`);
  if (environmental.wasteNonConformances > 0) environmentalReasons.push(`${environmental.wasteNonConformances} waste movement non-conformance${environmental.wasteNonConformances === 1 ? '' : 's'}.`);
  if (pc.environmental_permits_expiring > 0) environmentalReasons.push(`${pc.environmental_permits_expiring} environmental permit${pc.environmental_permits_expiring === 1 ? '' : 's'} expiring within 30 days.`);
  if (environmentalReasons.length === 0) environmentalReasons.push('No open spills, waste non-conformances, or permits expiring soon.');
  const environmentalDomain = buildDomain('environmental', 'Environmental', environmentalBand, environmentalReasons,
    { open_spills: environmental.openSpills, waste_non_conformances: environmental.wasteNonConformances, permits_expiring: pc.environmental_permits_expiring });

  // Contractors — PortfolioCounts.contractor_expiring already merges a
  // non-approved status with an expiring/missing required insurance
  // policy (see its own doc comment). No second, narrower read exists
  // here to split the two apart, so — a deliberate, documented
  // simplification — this domain has no distinct critical tier: any
  // flagged contractor is attention.
  const contractors = buildDomain('contractors', 'Contractors', pc.contractor_expiring > 0 ? 'attention' : 'ok',
    pc.contractor_expiring > 0
      ? [`${pc.contractor_expiring} contractor${pc.contractor_expiring === 1 ? '' : 's'} flagged (not approved, or an insurance policy expiring/expired).`]
      : ['No contractors currently flagged.'],
    { contractor_expiring: pc.contractor_expiring });

  const domains = [people, plant, trainingDomain, riskControls, environmentalDomain, contractors];
  return { overallBand: worstBand(domains), domains };
}
