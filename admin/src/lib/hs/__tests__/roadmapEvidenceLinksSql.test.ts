// Pins migration 170 (Core-OS 360 Phase 6, Group 5: Roadmap
// Integration). The live database is the real check
// (supabase/probes/170_roadmap_evidence_links.sql, 2/2 pass); this
// stops the migration file drifting from what was applied.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/170_roadmap_evidence_links.sql'), 'utf8');

describe('Roadmap evidence links (170)', () => {
  it('widens requirement_evidence_links.source_type to include milestone, keeping every prior value', () => {
    expect(sql).toMatch(
      /CHECK \(source_type IN \('legal_obligation', 'objective', 'audit_finding', 'milestone'\)\)/,
    );
  });

  it('hs_entity_table gains milestone -> milestones, and every prior branch is copied unchanged (additive, not a rewrite)', () => {
    expect(sql).toMatch(/WHEN 'milestone'\s+THEN 'milestones'/);
    for (const [from, to] of [
      ['hazard', 'hazards'], ['contractor', 'contractors'], ['audit_finding', 'audit_findings'],
      ['legal_obligation', 'organisation_legal_obligations'], ['objective', 'objectives'],
      ['environmental_permit', 'environmental_permits'], ['compliance_item', 'compliance_items'],
    ]) {
      expect(sql, from).toMatch(new RegExp(`WHEN '${from}'\\s+THEN '${to}'`));
    }
  });

  it('is a plain DROP + ADD CONSTRAINT, not a full table rewrite — the rest of the table is untouched', () => {
    expect(sql).toMatch(/ALTER TABLE public\.requirement_evidence_links DROP CONSTRAINT requirement_evidence_links_source_type_check/);
    expect(sql).not.toMatch(/DROP TABLE|CREATE TABLE/);
  });
});
