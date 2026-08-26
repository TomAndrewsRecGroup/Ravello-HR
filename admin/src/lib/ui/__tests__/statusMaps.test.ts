import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_CLIENT_STATUSES,
  CANDIDATE_CLIENT_STATUS_LABELS,
  CLIENT_STATUS_STYLE,
  DOC_CATEGORIES,
  DOC_CATEGORY_LABELS,
  HIRING_STAGES,
  HIRING_STAGE_LABELS,
  ROLE_LABELS,
  USER_ROLES,
  labelFor,
} from '../statusMaps';

// These tuples mirror pg_enum on the live project. The maps below are
// what the UI renders from. A drift in either direction is a bug:
//
//   label with no enum value  → dead entry, and a hint that somebody
//                               believes a value exists when it does
//                               not (this is how 'compliance' sat in
//                               DOC_CATEGORY_LABELS, and how 'shared'
//                               and 'handbook' came to be WRITTEN
//                               before they existed).
//   enum value with no label  → the raw enum string renders to the
//                               user ("info_requested", "hired").
//
// So both directions are asserted, for every enum.

function expectExactKeys(map: Record<string, unknown>, values: readonly string[], name: string) {
  const keys = Object.keys(map).sort();
  const want = [...values].sort();

  const extra   = keys.filter(k => !want.includes(k));
  const missing = want.filter(v => !keys.includes(v));

  expect(extra,   `${name} has labels for values the enum does not have: ${extra.join(', ')}`).toEqual([]);
  expect(missing, `${name} is missing labels for live enum values: ${missing.join(', ')}`).toEqual([]);
}

describe('label maps cover exactly their enum, in both directions', () => {
  it('HIRING_STAGE_LABELS', () => {
    expectExactKeys(HIRING_STAGE_LABELS, HIRING_STAGES, 'HIRING_STAGE_LABELS');
  });

  it('CANDIDATE_CLIENT_STATUS_LABELS', () => {
    expectExactKeys(CANDIDATE_CLIENT_STATUS_LABELS, CANDIDATE_CLIENT_STATUSES, 'CANDIDATE_CLIENT_STATUS_LABELS');
  });

  it('CLIENT_STATUS_STYLE', () => {
    // Styling drifted from labels before: only one of four copies knew
    // about 'shared', none knew about 'hired'.
    expectExactKeys(CLIENT_STATUS_STYLE, CANDIDATE_CLIENT_STATUSES, 'CLIENT_STATUS_STYLE');
  });

  it('DOC_CATEGORY_LABELS', () => {
    expectExactKeys(DOC_CATEGORY_LABELS, DOC_CATEGORIES, 'DOC_CATEGORY_LABELS');
  });

  it('ROLE_LABELS', () => {
    expectExactKeys(ROLE_LABELS, USER_ROLES, 'ROLE_LABELS');
  });
});

describe('the values that caused the 22P02 errors are present', () => {
  it("'shared' is a candidate status", () => {
    expect(CANDIDATE_CLIENT_STATUSES).toContain('shared');
  });

  it("'handbook' is a document category", () => {
    expect(DOC_CATEGORIES).toContain('handbook');
  });

  it("'pending_approval' is NOT a hiring stage", () => {
    // Deliberately never added. The portal's new-role form writes
    // 'submitted'; if this ever starts passing, somebody has added an
    // eighth stage and every stage filter and Kanban column needs
    // revisiting.
    expect(HIRING_STAGES as readonly string[]).not.toContain('pending_approval');
  });

  it("'submitted' exists and is what the new-role form should write", () => {
    expect(HIRING_STAGES).toContain('submitted');
    expect(HIRING_STAGE_LABELS.submitted).toBe('New');
  });
});

describe('labelFor', () => {
  it('renders a human label, not the raw enum', () => {
    expect(labelFor(CANDIDATE_CLIENT_STATUS_LABELS, 'info_requested')).toBe('More info requested');
    expect(labelFor(CANDIDATE_CLIENT_STATUS_LABELS, 'hired')).toBe('Hired');
  });

  it('falls back rather than throwing on an unknown value', () => {
    expect(labelFor(CANDIDATE_CLIENT_STATUS_LABELS, 'nonsense', 'Unknown')).toBe('Unknown');
    expect(labelFor(CANDIDATE_CLIENT_STATUS_LABELS, null)).toBe('—');
  });
});
