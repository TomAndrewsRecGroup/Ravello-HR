import { describe, it, expect } from 'vitest';
import { computeEmergencyReadiness, type EmergencyPlanRow, type EmergencyPlanRoleRow, type ActiveAuthorisationRow } from '../compute';

const TODAY = '2026-10-02';

function plan(overrides: Partial<EmergencyPlanRow> = {}): EmergencyPlanRow {
  return { id: 'plan-1', site_id: null, plan_type: 'fire', title: 'Fire Evacuation Plan', status: 'active', ...overrides };
}

describe('computeEmergencyReadiness', () => {
  it('is ready when every required role is held, equipment is available and a recent drill exists', () => {
    const roles: EmergencyPlanRoleRow[] = [{ plan_id: 'plan-1', authorisation_type_id: 'fire-warden', min_count: 2 }];
    const holders: ActiveAuthorisationRow[] = [
      { authorisation_type_id: 'fire-warden', scope_site_id: null, status: 'active', expires_on: null },
      { authorisation_type_id: 'fire-warden', scope_site_id: null, status: 'active', expires_on: null },
    ];
    const [r] = computeEmergencyReadiness([plan()], roles, [], [{ plan_id: 'plan-1', drill_date: '2026-09-01', outcome: 'successful' }], holders, [], { 'fire-warden': 'Fire Warden' }, {}, TODAY);
    expect(r.band).toBe('ready');
    expect(r.roles[0].met).toBe(true);
  });

  it('is critical when a required role is short of its minimum headcount', () => {
    const roles: EmergencyPlanRoleRow[] = [{ plan_id: 'plan-1', authorisation_type_id: 'fire-warden', min_count: 3 }];
    const holders: ActiveAuthorisationRow[] = [{ authorisation_type_id: 'fire-warden', scope_site_id: null, status: 'active', expires_on: null }];
    const [r] = computeEmergencyReadiness([plan()], roles, [], [{ plan_id: 'plan-1', drill_date: '2026-09-01', outcome: 'successful' }], holders, [], {}, {}, TODAY);
    expect(r.band).toBe('critical');
    expect(r.roles[0].met).toBe(false);
  });

  it('never counts an expired authorisation toward the headcount', () => {
    const roles: EmergencyPlanRoleRow[] = [{ plan_id: 'plan-1', authorisation_type_id: 'fw', min_count: 1 }];
    const holders: ActiveAuthorisationRow[] = [{ authorisation_type_id: 'fw', scope_site_id: null, status: 'active', expires_on: '2026-01-01' }];
    const [r] = computeEmergencyReadiness([plan()], roles, [], [], holders, [], {}, {}, TODAY);
    expect(r.roles[0].holding).toBe(0);
  });

  it('never counts a revoked authorisation toward the headcount', () => {
    const roles: EmergencyPlanRoleRow[] = [{ plan_id: 'plan-1', authorisation_type_id: 'fw', min_count: 1 }];
    const holders: ActiveAuthorisationRow[] = [{ authorisation_type_id: 'fw', scope_site_id: null, status: 'revoked', expires_on: null }];
    const [r] = computeEmergencyReadiness([plan()], roles, [], [], holders, [], {}, {}, TODAY);
    expect(r.roles[0].holding).toBe(0);
  });

  it('scopes a site-specific authorisation to the plan\'s own site, and never counts a different site\'s holder', () => {
    const roles: EmergencyPlanRoleRow[] = [{ plan_id: 'plan-1', authorisation_type_id: 'fw', min_count: 1 }];
    const holders: ActiveAuthorisationRow[] = [{ authorisation_type_id: 'fw', scope_site_id: 'site-b', status: 'active', expires_on: null }];
    const [r] = computeEmergencyReadiness([plan({ site_id: 'site-a' })], roles, [], [], holders, [], {}, {}, TODAY);
    expect(r.roles[0].holding).toBe(0);
  });

  it('a company-wide (no scope_site_id) holder counts for any plan site', () => {
    const roles: EmergencyPlanRoleRow[] = [{ plan_id: 'plan-1', authorisation_type_id: 'fw', min_count: 1 }];
    const holders: ActiveAuthorisationRow[] = [{ authorisation_type_id: 'fw', scope_site_id: null, status: 'active', expires_on: null }];
    const [r] = computeEmergencyReadiness([plan({ site_id: 'site-a' })], roles, [], [], holders, [], {}, {}, TODAY);
    expect(r.roles[0].holding).toBe(1);
  });

  it('flags attention when linked equipment is quarantined or out of service', () => {
    const [r] = computeEmergencyReadiness(
      [plan()], [], [{ plan_id: 'plan-1', asset_id: 'eq-1' }], [{ plan_id: 'plan-1', drill_date: '2026-09-01', outcome: 'successful' }],
      [], [{ id: 'eq-1', status: 'quarantined' }], {}, { 'eq-1': 'Fire extinguisher' }, TODAY,
    );
    expect(r.band).toBe('attention');
    expect(r.equipment[0].available).toBe(false);
  });

  it('flags attention when no drill has ever been recorded', () => {
    const [r] = computeEmergencyReadiness([plan()], [], [], [], [], [], {}, {}, TODAY);
    expect(r.band).toBe('attention');
    expect(r.drillOverdue).toBe(true);
    expect(r.reasons[0]).toContain('No drill has ever been recorded');
  });

  it('flags attention when the last drill was over a year ago', () => {
    const [r] = computeEmergencyReadiness([plan()], [], [], [{ plan_id: 'plan-1', drill_date: '2024-01-01', outcome: 'successful' }], [], [], {}, {}, TODAY);
    expect(r.drillOverdue).toBe(true);
  });

  it('a missing role is more severe than an overdue drill: critical wins over attention', () => {
    const roles: EmergencyPlanRoleRow[] = [{ plan_id: 'plan-1', authorisation_type_id: 'fw', min_count: 1 }];
    const [r] = computeEmergencyReadiness([plan()], roles, [], [], [], [], {}, {}, TODAY);
    expect(r.band).toBe('critical');
  });

  it('never surfaces a plan that is not active', () => {
    const rows = computeEmergencyReadiness([plan({ status: 'superseded' })], [], [], [], [], [], {}, {}, TODAY);
    expect(rows).toHaveLength(0);
  });
});
