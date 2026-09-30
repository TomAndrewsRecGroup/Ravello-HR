import { RAMS_SECTION_LABELS, type RamsSectionKey } from './safetyVocab';
import { RAMS_CONDITIONAL_SECTIONS } from './ramsSectionQuestions';

// Core-OS 360 Completion Programme, Phase 26 Group 7 (gap-ledger row
// C15.6): `jev_decisions` (098) already records every call in full —
// this is only the UI-side formatting for reading one back. Nothing
// here writes anything; the row already exists the moment
// suggestSections() (RamsHeaderEditor.tsx) gets a real decision_id.
//
// Only the SITE-DERIVED facts are shown (Group 5's own
// site_name/open_hazards_at_site/lifting_or_plant_equipment_at_site/
// incidents_at_site_last_12_months) — never title/project_name/
// scope_of_work, which the author just typed on the same form a
// moment ago and can already see; repeating their own free text back
// to them would not be provenance, just noise.

export interface RamsSuggestionFact { label: string; value: string }
export interface RamsSuggestionSectionProbability { key: RamsSectionKey; label: string; probability: number }

export interface RamsSuggestionProvenance {
  facts: RamsSuggestionFact[];
  sections: RamsSuggestionSectionProbability[];
  model: string | null;
  askedAt: string | null;
}

const SITE_FACT_LABELS: Record<string, string> = {
  site_name: 'Site',
  open_hazards_at_site: 'Open hazards at this site',
  lifting_or_plant_equipment_at_site: 'Lifting/plant equipment at this site',
  incidents_at_site_last_12_months: 'Incidents at this site (last 12 months)',
};
const SITE_FACT_KEYS = Object.keys(SITE_FACT_LABELS);

export function formatRamsSuggestionProvenance(
  state: Record<string, unknown> | null, selected: Record<string, unknown> | null, model: string | null, askedAt: string | null,
): RamsSuggestionProvenance {
  const facts: RamsSuggestionFact[] = [];
  for (const key of SITE_FACT_KEYS) {
    const v = state?.[key];
    if (v === null || v === undefined) continue;
    facts.push({ label: SITE_FACT_LABELS[key], value: String(v) });
  }
  const sections: RamsSuggestionSectionProbability[] = RAMS_CONDITIONAL_SECTIONS
    .filter(k => typeof selected?.[k] === 'number')
    .map(k => ({ key: k, label: RAMS_SECTION_LABELS[k], probability: selected![k] as number }))
    .sort((a, b) => b.probability - a.probability);
  return { facts, sections, model, askedAt };
}
