import { describe, it, expect } from 'vitest';
import { groupMemberIds, groupParents, computeGroupRollup, type GroupCompanyRow } from '../compute';
import type { BriefingSnapshotRow } from '@/lib/briefing/compute';

function company(overrides: Partial<GroupCompanyRow> = {}): GroupCompanyRow {
  return { id: 'co-1', name: 'Co 1', parent_organisation_id: null, monthly_retainer_pence: null, active: true, ...overrides };
}

function snapshot(overrides: Partial<BriefingSnapshotRow> = {}): BriefingSnapshotRow {
  return {
    company_id: 'co-1', band: 'green', overdue_comp: 0, open_tickets: 0, stalled_reqs: 0,
    open_critical_actions: 0, overdue_legal_evaluations: 0, overdue_controlled_documents: 0,
    open_incident_investigations: 0, safety_critical_gaps: 0, workers_not_ready: 0, assets_unavailable: 0,
    major_audit_findings: 0, contractor_expiring: 0, environmental_permits_expiring: 0,
    management_reviews_due: 0, outstanding_service_requests: 0, next_consultant_visit_date: null,
    ...overrides,
  };
}

describe('groupMemberIds', () => {
  it('includes the parent plus every direct child, never a grandchild chain', () => {
    const companies = [
      company({ id: 'parent' }),
      company({ id: 'child-1', parent_organisation_id: 'parent' }),
      company({ id: 'child-2', parent_organisation_id: 'parent' }),
      company({ id: 'unrelated' }),
    ];
    expect(new Set(groupMemberIds(companies, 'parent'))).toEqual(new Set(['parent', 'child-1', 'child-2']));
  });

  it('returns just the parent when it has no children', () => {
    const companies = [company({ id: 'solo' })];
    expect(groupMemberIds(companies, 'solo')).toEqual(['solo']);
  });
});

describe('groupParents', () => {
  it('lists only companies that at least one other company names as parent', () => {
    const companies = [
      company({ id: 'parent' }),
      company({ id: 'child', parent_organisation_id: 'parent' }),
      company({ id: 'standalone' }),
    ];
    const parents = groupParents(companies);
    expect(parents).toHaveLength(1);
    expect(parents[0].id).toBe('parent');
    expect(parents[0].memberCount).toBe(2);
  });
});

describe('computeGroupRollup', () => {
  it('sums monthly retainer across every member including the parent', () => {
    const companies = [
      company({ id: 'parent', name: 'Parent Ltd', monthly_retainer_pence: 10000 }),
      company({ id: 'child-1', name: 'Child One', parent_organisation_id: 'parent', monthly_retainer_pence: 5000 }),
      company({ id: 'child-2', name: 'Child Two', parent_organisation_id: 'parent', monthly_retainer_pence: 7500 }),
    ];
    const rollup = computeGroupRollup('parent', companies, '2026-10-02', []);
    expect(rollup).not.toBeNull();
    expect(rollup!.totalMonthlyRetainerPence).toBe(22500);
    expect(rollup!.members).toHaveLength(3);
  });

  it('treats a null retainer as zero rather than NaN', () => {
    const companies = [company({ id: 'parent', monthly_retainer_pence: null })];
    const rollup = computeGroupRollup('parent', companies, '2026-10-02', []);
    expect(rollup!.totalMonthlyRetainerPence).toBe(0);
  });

  it('returns null for an id that is not a real company', () => {
    expect(computeGroupRollup('ghost', [company()], '2026-10-02', [])).toBeNull();
  });

  it('scopes the reused briefing computation to only this group\'s members, never the whole portfolio', () => {
    const companies = [
      company({ id: 'parent', name: 'Parent' }),
      company({ id: 'child', name: 'Child', parent_organisation_id: 'parent' }),
      company({ id: 'outsider', name: 'Outsider' }),
    ];
    const rows = [
      snapshot({ company_id: 'parent', overdue_comp: 1 }),
      snapshot({ company_id: 'child', overdue_comp: 2 }),
      snapshot({ company_id: 'outsider', open_critical_actions: 9 }),
    ];
    const rollup = computeGroupRollup('parent', companies, '2026-10-02', rows);
    expect(rollup!.briefing.totalCompanies).toBe(2);
    expect(rollup!.briefing.flags.some(f => f.companyId === 'outsider')).toBe(false);
  });

  it('lists the parent first in the member list', () => {
    const companies = [
      company({ id: 'parent', name: 'Zed Parent' }),
      company({ id: 'child', name: 'Alpha Child', parent_organisation_id: 'parent' }),
    ];
    const rollup = computeGroupRollup('parent', companies, '2026-10-02', []);
    expect(rollup!.members[0].isParent).toBe(true);
  });
});
