import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CANDIDATE_CLIENT_STATUSES,
  CANDIDATE_CLIENT_STATUS_LABELS,
  CLIENT_STATUS_STYLE,
  COMPLIANCE_CATEGORIES,
  COMPLIANCE_CATEGORY_LABELS,
  COMPLIANCE_STATUSES,
  COMPLIANCE_STATUS_LABELS,
  DOC_CATEGORIES,
  DOC_CATEGORY_LABELS,
  HIRING_STAGES,
  HIRING_STAGE_LABELS,
  ROLE_LABELS,
  SERVICE_REQUEST_STATUSES,
  SERVICE_REQUEST_STATUS_LABELS,
  SERVICE_REQUEST_TYPES,
  SERVICE_REQUEST_TYPE_LABELS,
  USER_ROLES,
  labelFor,
} from '../statusMaps';
import { HS_REGISTER_CATEGORIES } from '../../hs/vocab';

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

describe('compliance vocabulary', () => {
  // COMPLIANCE_CATEGORY_LABELS deliberately carries one extra key,
  // 'health_safety', for historical rows written before it was retired
  // from every writer (2026-09-25) — so this is a one-direction subset
  // check, not expectExactKeys. COMPLIANCE_STATUS_LABELS carries two
  // extras ('in_progress', 'completed') for the same reason.
  it('every writable category has a label', () => {
    const missing = COMPLIANCE_CATEGORIES.filter(c => !(c in COMPLIANCE_CATEGORY_LABELS));
    expect(missing, `COMPLIANCE_CATEGORY_LABELS is missing labels for: ${missing.join(', ')}`).toEqual([]);
  });

  it("'health_safety' is not writable, but still has a label for old rows", () => {
    expect(COMPLIANCE_CATEGORIES as readonly string[]).not.toContain('health_safety');
    expect(COMPLIANCE_CATEGORY_LABELS.health_safety).toBe('Health & Safety');
  });

  it('every writable status has a label', () => {
    const missing = COMPLIANCE_STATUSES.filter(s => !(s in COMPLIANCE_STATUS_LABELS));
    expect(missing, `COMPLIANCE_STATUS_LABELS is missing labels for: ${missing.join(', ')}`).toEqual([]);
  });

  it("'in_progress' is not a live compliance_status, but still has a display label", () => {
    // AddComplianceItem.tsx used to offer this as a writable status;
    // the insert 22P02'd because the enum has no such value.
    expect(COMPLIANCE_STATUSES as readonly string[]).not.toContain('in_progress');
    expect(COMPLIANCE_STATUS_LABELS.in_progress).toBe('In progress');
  });

  it('matches the database CHECK (migration 109)', () => {
    // compliance_items.category is one column shared by the generic
    // HR form (COMPLIANCE_CATEGORIES) and the H&S register
    // (HS_REGISTER_CATEGORIES) — the CHECK allows the union of both,
    // plus the legacy-only 'health_safety'.
    const sql = readFileSync(
      path.resolve(__dirname, '../../../../../supabase/migrations/109_compliance_category_check.sql'),
      'utf8',
    );
    const m = /compliance_items_category_check\s+CHECK \(category IN \(([^)]*)\)\)/.exec(sql);
    if (!m) throw new Error('compliance_items_category_check not found in migration 109');
    const allowed = m[1].split(',').map(s => s.trim().replace(/'/g, ''));

    const expected = [...COMPLIANCE_CATEGORIES, 'health_safety', ...HS_REGISTER_CATEGORIES];
    expect([...allowed].sort()).toEqual([...expected].sort());
  });
});

describe('service request vocabulary', () => {
  it('type and status labels cover exactly their tuples', () => {
    expectExactKeys(SERVICE_REQUEST_TYPE_LABELS, SERVICE_REQUEST_TYPES, 'SERVICE_REQUEST_TYPE_LABELS');
    expectExactKeys(SERVICE_REQUEST_STATUS_LABELS, SERVICE_REQUEST_STATUSES, 'SERVICE_REQUEST_STATUS_LABELS');
  });
  it('statuses are the 097 CHECK, not the ticket words the old map carried', () => {
    expect(SERVICE_REQUEST_STATUSES).toEqual(['new', 'in_progress', 'complete']);
    expect(SERVICE_REQUEST_STATUS_LABELS).not.toHaveProperty('open');
    expect(SERVICE_REQUEST_STATUS_LABELS).not.toHaveProperty('resolved');
  });
});
