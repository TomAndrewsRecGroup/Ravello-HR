import { describe, expect, it } from 'vitest';
import { ramsApprovalWarnings, type RamsAssignedPersonFact, type RamsLinkedEquipmentFact } from '../ramsApprovalWarnings';

const TODAY = '2026-09-30';

describe('ramsApprovalWarnings', () => {
  it('no warnings when everything is in service and everyone is ready', () => {
    const eq: RamsLinkedEquipmentFact[] = [{ name: 'MEWP 1', status: 'in_service', nextInspectionDue: '2027-01-01' }];
    const people: RamsAssignedPersonFact[] = [{ role: 'Author', name: 'Ada Lovelace', status: 'READY' }];
    expect(ramsApprovalWarnings(eq, people, TODAY)).toEqual([]);
  });

  it('flags quarantined equipment', () => {
    const eq: RamsLinkedEquipmentFact[] = [{ name: 'Forklift 3', status: 'quarantined', nextInspectionDue: null }];
    expect(ramsApprovalWarnings(eq, [], TODAY)).toEqual(['Linked equipment "Forklift 3" is currently quarantined.']);
  });

  it('flags decommissioned and out-of-service equipment with their own status', () => {
    const eq: RamsLinkedEquipmentFact[] = [
      { name: 'Old Crane', status: 'decommissioned', nextInspectionDue: null },
      { name: 'Genny 2', status: 'out_of_service', nextInspectionDue: null },
    ];
    expect(ramsApprovalWarnings(eq, [], TODAY)).toEqual([
      'Linked equipment "Old Crane" is currently decommissioned.',
      'Linked equipment "Genny 2" is currently out of service.',
    ]);
  });

  it('flags in-service equipment with an overdue inspection, never both reasons at once', () => {
    const eq: RamsLinkedEquipmentFact[] = [{ name: 'MEWP 1', status: 'in_service', nextInspectionDue: '2026-01-01' }];
    expect(ramsApprovalWarnings(eq, [], TODAY)).toEqual(['Linked equipment "MEWP 1" has an overdue inspection (was due 2026-01-01).']);
  });

  it('never warns on an in-service asset with a future inspection date', () => {
    const eq: RamsLinkedEquipmentFact[] = [{ name: 'MEWP 1', status: 'in_service', nextInspectionDue: '2026-12-01' }];
    expect(ramsApprovalWarnings(eq, [], TODAY)).toEqual([]);
  });

  it('never warns on an in-service asset with no inspection date on record', () => {
    const eq: RamsLinkedEquipmentFact[] = [{ name: 'Tool 1', status: 'in_service', nextInspectionDue: null }];
    expect(ramsApprovalWarnings(eq, [], TODAY)).toEqual([]);
  });

  it('flags a NOT_READY or REVIEW_REQUIRED author/manager, but never CONDITIONALLY_READY', () => {
    const people: RamsAssignedPersonFact[] = [
      { role: 'Author', name: 'Ada Lovelace', status: 'NOT_READY' },
      { role: 'Responsible manager', name: 'Grace Hopper', status: 'REVIEW_REQUIRED' },
      { role: 'Author', name: 'Someone Else', status: 'CONDITIONALLY_READY' },
    ];
    expect(ramsApprovalWarnings([], people, TODAY)).toEqual([
      'Author Ada Lovelace is currently not ready for deployment.',
      'Responsible manager Grace Hopper is currently review required for deployment.',
    ]);
  });

  it('combines equipment and people warnings, equipment first', () => {
    const eq: RamsLinkedEquipmentFact[] = [{ name: 'Forklift 3', status: 'quarantined', nextInspectionDue: null }];
    const people: RamsAssignedPersonFact[] = [{ role: 'Author', name: 'Ada Lovelace', status: 'NOT_READY' }];
    expect(ramsApprovalWarnings(eq, people, TODAY)).toEqual([
      'Linked equipment "Forklift 3" is currently quarantined.',
      'Author Ada Lovelace is currently not ready for deployment.',
    ]);
  });
});
