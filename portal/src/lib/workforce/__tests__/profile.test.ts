import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Capability } from '@/lib/auth/capabilities';
import type { DeploymentRequirement } from '../types';
import {
  HEALTH_OUTCOME_COLUMNS, HEALTH_OUTCOME_PRINT_COLUMNS, PROFILE_TABS, canSeeHealthOutcomes, duplicateMatchText,
  groupRequirements, historyItems, latestFirstBy, openSuspension, parseAsOf, parseTab, previewSummary, printShowsHealth,
  profileHref, sourcesText, suggestExpiry, visibleTabs,
} from '../profile';

const caps = (...c: Capability[]) => (x: Capability) => c.includes(x);

const req = (o: Partial<DeploymentRequirement>): DeploymentRequirement => ({
  type: 'training', reference_id: 'r', reference_key: null, name: 'X', mandatory: true, safety_critical: false,
  status: 'met', detail: null, evidence_date: null, expires_on: null, required_by: null, sources: [], ...o,
});

describe('tabs', () => {
  it('hides occupational health without summary.read', () => {
    expect(visibleTabs({ can: caps('workforce.read'), isMe: false })).not.toContain('occupational_health');
  });
  it('shows occupational health on my own profile without summary.read', () => {
    expect(visibleTabs({ can: caps(), isMe: true })).toContain('occupational_health');
  });
  it('shows occupational health to a summary reader', () => {
    expect(visibleTabs({ can: caps('occupational_health.summary.read'), isMe: false })).toContain('occupational_health');
    expect(canSeeHealthOutcomes({ can: caps('occupational_health.clinical.read'), isMe: false })).toBe(false);
  });
  it('safety activity needs incident.read', () => {
    expect(visibleTabs({ can: caps(), isMe: true })).not.toContain('safety');
    expect(visibleTabs({ can: caps('incident.read'), isMe: false })).toContain('safety');
  });
  it('there is no clinical tab at all', () => {
    expect(PROFILE_TABS.some(t => /clinical/.test(t))).toBe(false);
  });
  it('a hidden tab falls back to overview', () => {
    const v = visibleTabs({ can: caps(), isMe: false });
    expect(parseTab('occupational_health', v)).toBe('overview');
    expect(parseTab('training', v)).toBe('training');
    expect(parseTab(undefined, v)).toBe('overview');
  });
});

describe('as of', () => {
  it('accepts only a real past date', () => {
    expect(parseAsOf('2026-03-15', '2026-09-28')).toBe('2026-03-15');
    expect(parseAsOf('2026-09-28', '2026-09-28')).toBeNull();
    expect(parseAsOf('2027-01-01', '2026-09-28')).toBeNull();
    expect(parseAsOf('2026-02-30', '2026-09-28')).toBeNull();
    expect(parseAsOf('15/03/2026', '2026-09-28')).toBeNull();
  });
  it('builds hrefs', () => {
    expect(profileHref('p1')).toBe('/lead/workforce/people/p1');
    expect(profileHref('p1', { tab: 'training', asOf: '2026-03-15' })).toBe('/lead/workforce/people/p1?tab=training&as_of=2026-03-15');
  });
});

describe('requirements', () => {
  it('groups by type in catalogue order, safety-critical first', () => {
    const g = groupRequirements([
      req({ type: 'competency', name: 'B' }),
      req({ type: 'training', name: 'Z' }),
      req({ type: 'training', name: 'A', safety_critical: true }),
    ]);
    expect(g.map(x => x.type)).toEqual(['training', 'competency']);
    expect(g[0].items.map(x => x.name)).toEqual(['A', 'Z']);
    expect(g[0].label).toBe('Training');
  });
  it('names each source once', () => {
    const r = req({ sources: [{ scope: 'role', scope_id: 'r1' }, { scope: 'role', scope_id: 'r1' }, { scope: 'site', scope_id: 's1' }, { scope: 'person', scope_id: 'p' }] });
    expect(sourcesText(r, { roles: { r1: 'Fitter' }, sites: { s1: 'Leeds' } })).toBe('Role: Fitter; Site: Leeds; Specific to this person');
  });
});

describe('history', () => {
  it('orders newest first and lists reason names', () => {
    const h = historyItems([
      { id: 1, from_status: null, to_status: 'READY', reasons: [], changed_at: '2026-01-01T00:00:00Z' },
      { id: 2, from_status: 'READY', to_status: 'NOT_READY', reasons: [{ code: 'unmet', name: 'Forklift', text: 'Forklift: expired' }, { code: 'unmet', text: 'No role' }], changed_at: '2026-02-01T00:00:00Z' },
    ]);
    expect(h[0]).toMatchObject({ from: 'Ready', to: 'Not ready', toStatus: 'NOT_READY', reasons: ['Forklift', 'No role'] });
    expect(h[1].from).toBe('Not calculated');
  });
});

describe('evidence history', () => {
  it('keeps every assessment, newest first', () => {
    const g = latestFirstBy([{ c: 'a', d: '2026-01-01' }, { c: 'a', d: '2026-05-01' }, { c: 'b', d: '2026-02-01' }], r => r.c, r => r.d);
    const a = g.find(x => x.key === 'a')!;
    expect(a.latest.d).toBe('2026-05-01');
    expect(a.history).toHaveLength(1);
  });
  it('finds the open suspension', () => {
    expect(openSuspension([{ id: 1, lifted_at: '2026-01-01' }, { id: 2, lifted_at: null }])?.id).toBe(2);
    expect(openSuspension([{ lifted_at: '2026-01-01' }])).toBeNull();
  });
});

describe('role change preview', () => {
  it('counts only NEW mandatory requirements', () => {
    const base = { reference_id: 'x', reference_key: null, name: 'n', safety_critical: false };
    const s = previewSummary([
      { ...base, requirement_type: 'training', mandatory: true, already_required: false },
      { ...base, requirement_type: 'training', mandatory: true, already_required: true },
      { ...base, requirement_type: 'ppe', mandatory: false, already_required: false },
    ]);
    expect(s.newMandatory).toHaveLength(1);
    expect(s.newOptional).toHaveLength(1);
    expect(s.alreadyCovered).toBe(1);
    expect(s.sentence).toBe('This role introduces 1 new mandatory requirement.');
    expect(previewSummary([]).sentence).toBe('This role introduces no new mandatory requirements.');
  });
});

describe('small helpers', () => {
  it('suggests an expiry from the course validity', () => {
    expect(suggestExpiry('2026-01-31', 1)).toBe('2026-02-28');
    expect(suggestExpiry('2026-03-15', 36)).toBe('2029-03-15');
    expect(suggestExpiry('2026-03-15', null)).toBe('');
  });
  it('labels duplicate matches', () => {
    expect(duplicateMatchText(['email', 'name'])).toBe('Same email, Same name');
  });
});

describe('occupational health never goes clinical', () => {
  it('reads outcome columns only, and print reads no restriction', () => {
    expect(HEALTH_OUTCOME_COLUMNS).not.toMatch(/clinical|notes|document/);
    expect(HEALTH_OUTCOME_PRINT_COLUMNS).not.toMatch(/restriction|provider|clinical/);
  });
  it('print shows health only to summary readers — not even to the person', () => {
    expect(printShowsHealth(caps())).toBe(false);
    expect(printShowsHealth(caps('occupational_health.clinical.read'))).toBe(false);
    expect(printShowsHealth(caps('occupational_health.summary.read'))).toBe(true);
  });
  it('no profile file touches the clinical table or bucket', () => {
    const dir = path.resolve(__dirname, '../../../app/(portal)/lead/workforce/people');
    if (!existsSync(dir)) return;
    const walk = (d: string): string[] => readdirSync(d).flatMap(n => {
      const f = path.join(d, n);
      return statSync(f).isDirectory() ? walk(f) : [f];
    });
    const files = [...walk(dir).filter(f => /\.tsx?$/.test(f)), path.resolve(__dirname, '../profile.ts')];
    expect(files.length).toBeGreaterThan(1);
    for (const f of files) {
      const text = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(text, f).not.toMatch(/occupational_health_clinical|oh-clinical|OH_CLINICAL_BUCKET|clinicalKey|clinical_notes/);
    }
  });
});
