import { describe, it, expect } from 'vitest';
import { buildPersonTimeline, type TimelineInput, type TimelineNames } from '../timeline';

const NAMES: TimelineNames = {
  courses: { c1: 'Fire Warden' }, competencies: { comp1: 'Forklift operation' },
  credentialTypes: { ct1: 'CSCS Card' }, inductions: { i1: 'Site induction' },
  authTypes: { at1: 'Confined Space Entry' }, ppeTypes: { p1: 'Hard hat' }, checkTypes: { chk1: 'DBS check' },
};

const STATUS_LABELS = { ready: 'Ready', not_ready: 'Not ready' };

function baseInput(overrides: Partial<TimelineInput> = {}): TimelineInput {
  return {
    training: [], competencies: [], credentials: [], inductionCompletions: [],
    authorisations: [], authSuspensions: [], suspensions: [], ppe: [], checks: [],
    development: [], log: [], incidents: [],
    ...overrides,
  };
}

describe('buildPersonTimeline', () => {
  it('returns an empty feed for a person with no recorded data', () => {
    expect(buildPersonTimeline(baseInput(), NAMES, STATUS_LABELS)).toHaveLength(0);
  });

  it('labels a training event with the resolved course title', () => {
    const events = buildPersonTimeline(baseInput({
      training: [{ id: 't1', course_id: 'c1', course_name: 'fallback', provider: null, completed_on: '2026-01-05', expires_on: null, result: 'pass', certificate_number: null, evidence_path: null, verification_status: 'verified', verified_at: null, rejection_reason: null, source: 'manual', submitted_by: null }],
    }), NAMES, STATUS_LABELS);
    expect(events).toHaveLength(1);
    expect(events[0].label).toContain('Fire Warden');
    expect(events[0].category).toBe('training');
  });

  it('falls back to the free-text course_name when course_id has no catalogue match', () => {
    const events = buildPersonTimeline(baseInput({
      training: [{ id: 't1', course_id: null, course_name: 'Ad hoc toolbox talk', provider: null, completed_on: '2026-01-05', expires_on: null, result: 'pass', certificate_number: null, evidence_path: null, verification_status: 'verified', verified_at: null, rejection_reason: null, source: 'manual', submitted_by: null }],
    }), NAMES, STATUS_LABELS);
    expect(events[0].label).toContain('Ad hoc toolbox talk');
  });

  it('sorts newest first across different categories', () => {
    const events = buildPersonTimeline(baseInput({
      training: [{ id: 't1', course_id: 'c1', course_name: '', provider: null, completed_on: '2026-01-01', expires_on: null, result: 'pass', certificate_number: null, evidence_path: null, verification_status: 'verified', verified_at: null, rejection_reason: null, source: 'manual', submitted_by: null }],
      development: [{ id: 'd1', title: 'Leadership course', source_type: 'manual', status: 'open', due_date: null, linked_course_id: null, linked_competency_id: null, created_at: '2026-06-01' }],
    }), NAMES, STATUS_LABELS);
    expect(events).toHaveLength(2);
    expect(events[0].category).toBe('development');
    expect(events[1].category).toBe('training');
  });

  it('emits two events for a suspension that has been lifted — suspended and lifted', () => {
    const events = buildPersonTimeline(baseInput({
      suspensions: [{ id: 's1', competency_id: 'comp1', suspended_at: '2026-02-01', reason: 'Incident', lifted_at: '2026-03-01', lift_reason: 'Retrained' }],
    }), NAMES, STATUS_LABELS);
    expect(events).toHaveLength(2);
    expect(events.map(e => e.label).some(l => l.includes('suspended'))).toBe(true);
    expect(events.map(e => e.label).some(l => l.includes('lifted'))).toBe(true);
  });

  it('only emits an authorisation-revoked event when revoked_at is set', () => {
    const active = buildPersonTimeline(baseInput({
      authorisations: [{ id: 'a1', authorisation_type_id: 'at1', scope_site_id: null, scope_detail: null, issuing_authority: null, issued_on: '2026-01-01', expires_on: null, evidence_path: null, status: 'active', revoked_at: null, revoke_reason: null }],
    }), NAMES, STATUS_LABELS);
    expect(active).toHaveLength(1);

    const revoked = buildPersonTimeline(baseInput({
      authorisations: [{ id: 'a1', authorisation_type_id: 'at1', scope_site_id: null, scope_detail: null, issuing_authority: null, issued_on: '2026-01-01', expires_on: null, evidence_path: null, status: 'revoked', revoked_at: '2026-04-01', revoke_reason: 'No longer required' }],
    }), NAMES, STATUS_LABELS);
    expect(revoked).toHaveLength(2);
  });

  it('labels a status-log event using the deployment status labels, from and to', () => {
    const events = buildPersonTimeline(baseInput({
      log: [{ id: 1, from_status: 'not_ready', to_status: 'ready', reasons: [], changed_at: '2026-05-01T00:00:00Z' }],
    }), NAMES, STATUS_LABELS);
    expect(events[0].category).toBe('status');
    expect(events[0].label).toContain('Not ready');
    expect(events[0].label).toContain('Ready');
  });

  it('never surfaces a pre-employment check with no received_on date', () => {
    const events = buildPersonTimeline(baseInput({
      checks: [{ id: 'chk1', check_type_id: 'chk1', status: 'pending', requested_on: '2026-01-01', received_on: null, evidence_path: null, verified_at: null, decision_reason: null }],
    }), NAMES, STATUS_LABELS);
    expect(events).toHaveLength(0);
  });

  it('filters out any row with no date at all rather than crashing or sorting it first', () => {
    const events = buildPersonTimeline(baseInput({
      training: [{ id: 't1', course_id: null, course_name: 'X', provider: null, completed_on: '', expires_on: null, result: 'pass', certificate_number: null, evidence_path: null, verification_status: 'verified', verified_at: null, rejection_reason: null, source: 'manual', submitted_by: null }],
    }), NAMES, STATUS_LABELS);
    expect(events).toHaveLength(0);
  });
});
