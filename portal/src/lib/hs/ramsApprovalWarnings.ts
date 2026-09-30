import { HS_EQUIPMENT_STATUS_LABELS, type HsEquipmentStatus } from './vocab';
import { DEPLOYMENT_STATUS_LABELS, type DeploymentStatus } from '@/lib/workforce/vocab';

// Core-OS 360 Completion Programme, Phase 26 Group 6 (gap-ledger row
// C15.5): a plain, deterministic check against facts the platform has
// ALREADY computed — never a guess, never AI, never a new judgement of
// its own. Two sources, both real:
//
// - "Assigned equipment" is whatever a RAMS is linked to via hs_links
//   (the only real equipment linkage a method statement has — its own
//   record carries no separate "assigned asset" column).
// - "Assigned people" means the two individuals a RAMS genuinely
//   names on the row itself: its author and its responsible manager.
//   A method statement has no "assigned workforce" list of its own
//   (Group 5's own finding, unchanged here) — widening this to every
//   acknowledging worker would be inventing a linkage that doesn't
//   exist, the same guessed-signal shortcut this codebase's standing
//   discipline rejects elsewhere.
//
// This is a WARNING, never a database block: the shared hs_doc_guard()
// (123) governs every controlled-document transition for hazards, risk
// assessments, method statements AND COSHH assessments alike, and
// teaching it a RAMS-specific side-check would entangle three other
// document kinds in a rule that only applies to one. The "hard" part
// lives in the UI instead — RamsCoshhWorkflow.tsx requires an explicit
// acknowledgement before Approve/Make active can be confirmed while
// any of these warnings stand.

export interface RamsLinkedEquipmentFact {
  name: string;
  status: HsEquipmentStatus;
  nextInspectionDue: string | null;
}

export interface RamsAssignedPersonFact {
  role: 'Author' | 'Responsible manager';
  name: string;
  status: DeploymentStatus;
}

export function ramsApprovalWarnings(
  equipment: readonly RamsLinkedEquipmentFact[], people: readonly RamsAssignedPersonFact[], today: string,
): string[] {
  const warnings: string[] = [];
  for (const eq of equipment) {
    if (eq.status !== 'in_service') {
      warnings.push(`Linked equipment "${eq.name}" is currently ${HS_EQUIPMENT_STATUS_LABELS[eq.status].toLowerCase()}.`);
    } else if (eq.nextInspectionDue && eq.nextInspectionDue < today) {
      warnings.push(`Linked equipment "${eq.name}" has an overdue inspection (was due ${eq.nextInspectionDue}).`);
    }
  }
  // CONDITIONALLY_READY is deliberately never a warning here — it means
  // ready with restrictions recorded, not a failing requirement.
  for (const p of people) {
    if (p.status === 'NOT_READY' || p.status === 'REVIEW_REQUIRED') {
      warnings.push(`${p.role} ${p.name} is currently ${DEPLOYMENT_STATUS_LABELS[p.status].toLowerCase()} for deployment.`);
    }
  }
  return warnings;
}
