import { describe, expect, it } from 'vitest';
import { formatRamsSuggestionProvenance } from '../ramsSuggestionProvenance';

describe('formatRamsSuggestionProvenance', () => {
  it('lists only the site-derived facts present in state, never title/project_name/scope_of_work', () => {
    const state = {
      title: 'Roof replacement', project_name: 'Site A', scope_of_work: 'Replace roof sheeting using a MEWP',
      site_name: 'Leeds Depot', open_hazards_at_site: 3, lifting_or_plant_equipment_at_site: 1, incidents_at_site_last_12_months: 0,
    };
    const r = formatRamsSuggestionProvenance(state, {}, 'test-model', '2026-09-30T10:00:00Z');
    expect(r.facts).toEqual([
      { label: 'Site', value: 'Leeds Depot' },
      { label: 'Open hazards at this site', value: '3' },
      { label: 'Lifting/plant equipment at this site', value: '1' },
      { label: 'Incidents at this site (last 12 months)', value: '0' },
    ]);
    expect(r.facts.map(f => f.label)).not.toContain('Title');
    expect(r.facts.map(f => f.label)).not.toContain('Scope of work');
  });

  it('with no site context, the facts list is empty — no error, no fabricated fact', () => {
    const state = { title: 'X', project_name: null, scope_of_work: 'Y' };
    const r = formatRamsSuggestionProvenance(state, {}, 'test-model', null);
    expect(r.facts).toEqual([]);
  });

  it('handles a null state without throwing', () => {
    const r = formatRamsSuggestionProvenance(null, null, null, null);
    expect(r.facts).toEqual([]);
    expect(r.sections).toEqual([]);
  });

  it('every conditional section with a numeric probability is listed, sorted highest first', () => {
    const selected = { lifting_arrangements: 0.9, isolations: 0.1, waste_disposal: 0.95, exclusion_zones: 0.5, environmental_controls: 0.2, permits_required: 0.3 };
    const r = formatRamsSuggestionProvenance({}, selected, 'test-model', null);
    expect(r.sections.map(s => s.key)).toEqual(['waste_disposal', 'lifting_arrangements', 'exclusion_zones', 'permits_required', 'environmental_controls', 'isolations']);
    expect(r.sections[0]).toEqual({ key: 'waste_disposal', label: 'Waste disposal', probability: 0.95 });
  });

  it('never lists a non-conditional key even if it happens to be present in selected', () => {
    const r = formatRamsSuggestionProvenance({}, { purpose: 0.9, lifting_arrangements: 0.8 }, null, null);
    expect(r.sections.map(s => s.key)).toEqual(['lifting_arrangements']);
  });

  it('carries the model and asked-at time through unchanged', () => {
    const r = formatRamsSuggestionProvenance({}, {}, 'jev-1.0', '2026-09-30T10:00:00Z');
    expect(r.model).toBe('jev-1.0');
    expect(r.askedAt).toBe('2026-09-30T10:00:00Z');
  });
});
