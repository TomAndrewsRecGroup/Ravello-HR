import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// H&S is delivered by Core OS 360 staff directly (2026-09-25, migration
// 105 — there is no external provider login any more). The properties
// that must survive every later H&S migration:
//
//   * every hs_ table has RLS on and a staff policy;
//   * no policy is USING (true), and none is granted TO public / anon;
//   * a non-staff, non-own-company policy no longer exists at all —
//     105 removed the only thing that ever needed one (a provider
//     grant); if a future migration adds one back, it is a security
//     decision this test should force someone to look at;
//   * the timeline, completions, activities and files cannot be edited
//     or deleted by a session;
//   * every surviving source table writes to the timeline (an
//     _hs_event trigger).
//
// Policies are DROP POLICY IF EXISTS + CREATE POLICY pairs across
// several files; this resolves the FINAL definition per name, the way
// Postgres actually ends up, not just what each file mentions.
//
// Add each new H&S migration to FILES.

const MIG = resolve(__dirname, '../../../../../supabase/migrations');
const FILES = ['094_hs_providers_access.sql', '095_hs_core.sql', '105_hs_staff_delivered.sql', '106_hs_documents_sector_packs.sql', '110_hs_audits.sql', '112_hs_incidents_equipment_toolbox.sql'];
const sql = FILES.map(f => readFileSync(`${MIG}/${f}`, 'utf8')).join('\n');

type Policy = { name: string; table: string; body: string };

function resolvePolicies(text: string): Policy[] {
  const live = new Map<string, Policy>();
  // A single pass in file order: a DROP removes the name, a CREATE
  // (re)installs it. The regex for CREATE also captures DROP lines
  // that precede it so ordering within one statement block is exact.
  const tokens = [...text.matchAll(/DROP POLICY IF EXISTS (\w+)\s+ON (?:public\.)?[\w.]+;|CREATE POLICY (\w+) ON (?:public\.)?([\w.]+)([\s\S]*?);/g)];
  for (const m of tokens) {
    if (m[1]) { live.delete(m[1]); continue; }               // DROP POLICY
    live.set(m[2], { name: m[2], table: m[3].replace(/^public\./, ''), body: m[4] });
  }
  return [...live.values()];
}

const droppedTables = new Set(
  [...sql.matchAll(/DROP TABLE IF EXISTS public\.(hs_\w+)/g)].map(m => m[1]),
);
const tables = [...new Set([...sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.(hs_[a-z_]+)/g)].map(m => m[1]))]
  .filter(t => !droppedTables.has(t));
const policies = resolvePolicies(sql);

describe('H&S RLS shape', () => {
  it('finds the surviving tables (so the rest is not vacuous), and the provider tables are actually gone', () => {
    expect(tables).toEqual(expect.arrayContaining([
      'hs_sites', 'hs_register_completions', 'hs_activities', 'hs_files', 'hs_events',
    ]));
    expect(tables).not.toContain('hs_providers');
    expect(tables).not.toContain('hs_provider_companies');
    expect(droppedTables).toEqual(new Set(['hs_provider_companies', 'hs_providers']));
  });

  it.each(tables)('%s has RLS enabled and a staff policy', (t) => {
    expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`));
    expect(policies.some(p => p.table === t && /_staff_(all|read)$/.test(p.name) && /is_tps_staff\(\)/.test(p.body))).toBe(true);
  });

  it('no policy is open', () => {
    for (const p of policies) {
      expect(p.body, p.name).not.toMatch(/USING\s*\(\s*true\s*\)|WITH CHECK\s*\(\s*true\s*\)/i);
      expect(p.body, p.name).not.toMatch(/TO\s+(public|anon)\b/i);
      expect(p.body, p.name).toMatch(/TO authenticated/);
    }
  });

  it('no policy on a surviving H&S table names a provider, hs_can_access, hs_can_write or my_hs_provider_id', () => {
    // The one thing that ever needed a non-staff, non-own-company policy
    // was a provider grant. 105 removed it; a policy of that shape
    // reappearing is a security decision, not a routine change.
    for (const p of policies.filter(p => tables.includes(p.table) || p.table === 'compliance_items')) {
      expect(p.body, p.name).not.toMatch(/hs_can_access|hs_can_write|my_hs_provider_id\(\)/);
      expect(p.name).not.toMatch(/provider/);
    }
  });

  it('hs_incidents and hs_equipment are MUTABLE, register-shaped — no insert-only revoke, unlike audits/completions', () => {
    // A registered incident is investigated over time (status moves
    // open -> investigating -> closed, riddor_reported_on gets filled
    // in later) and equipment's next_inspection_due is updated in place
    // — neither is a finished submission the way an audit or a
    // completion is, so unlike those tables there is deliberately no
    // REVOKE UPDATE here.
    for (const t of ['hs_incidents', 'hs_equipment']) {
      expect(sql, t).not.toMatch(new RegExp(`REVOKE UPDATE, DELETE, TRUNCATE ON public\\.${t}\\s+FROM PUBLIC, anon, authenticated`));
    }
  });

  it('the timeline and recorded evidence cannot be rewritten by a session', () => {
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.hs_events FROM PUBLIC, anon, authenticated/);
    for (const t of ['hs_register_completions', 'hs_activities', 'hs_files', 'hs_audits', 'hs_audit_responses']) {
      expect(sql).toMatch(new RegExp(`REVOKE UPDATE, DELETE, TRUNCATE ON public\\.${t}\\s+FROM PUBLIC, anon, authenticated`));
    }
    expect(policies.filter(p => p.table === 'hs_events' && !/FOR SELECT/.test(p.body))).toEqual([]);
  });

  it('every SECURITY DEFINER function ever defined here is revoked from anon, and the provider-only ones are dropped in 105', () => {
    const definers = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(([\s\S]*?)AS \$\$/g)]
      .filter(m => /SECURITY DEFINER/.test(m[2])).map(m => m[1]);
    expect(definers.length).toBeGreaterThan(10);
    for (const f of definers) {
      expect(sql, f).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\)\\s+FROM PUBLIC, anon`));
    }
    const sql105 = readFileSync(`${MIG}/105_hs_staff_delivered.sql`, 'utf8');
    for (const fn of ['my_hs_provider_id\\(\\)', 'hs_can_access\\(uuid, text\\)', 'hs_can_write\\(uuid, text\\)', 'hs_path_company\\(text\\)', 'hs_my_companies\\(\\)', 'hs_event_assignment\\(\\)']) {
      expect(sql105, fn).toMatch(new RegExp(`DROP FUNCTION IF EXISTS public\\.${fn}`));
    }
    // hs_actor_kind loses its provider branch, not the function itself.
    const latest = sql105.slice(sql105.indexOf('CREATE OR REPLACE FUNCTION public.hs_actor_kind'));
    expect(latest).not.toMatch(/'provider'/);
  });

  it('105 drops the provider_id column everywhere it was stamped', () => {
    for (const t of ['compliance_items', 'hs_register_completions', 'hs_activities', 'hs_files', 'hs_events']) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+DROP COLUMN IF EXISTS provider_id`));
    }
    expect(sql).toMatch(/ALTER TABLE public\.profiles DROP COLUMN IF EXISTS hs_provider_id/);
    expect(sql).toMatch(/ALTER TABLE public\.profiles DROP CONSTRAINT IF EXISTS profiles_hs_provider_shape/);
  });
});

describe('every surviving H&S source table writes to the Safety Timeline', () => {
  const SOURCES = ['compliance_items', 'hs_register_completions', 'hs_activities', 'hs_files', 'hs_sites', 'hs_documents', 'hs_audits', 'hs_incidents', 'hs_equipment'];
  // Sector packs (106) are staff reference data — typical register items
  // for a sector, applied TO a client's own register. They are never a
  // record of anything that happened to a specific client, so unlike
  // every other hs_ table they deliberately have no _hs_event trigger:
  // "the Office pack's PAT item description was edited" is not a Safety
  // Timeline entry for anyone. Applying a pack DOES appear on the
  // timeline — as ordinary compliance_items inserts, which already fire
  // compliance_items_hs_event.
  // hs_audit_responses: each response is part of ONE audit's own
  // Timeline entry (the audit row itself, above) — a 20-question audit
  // would otherwise put 20 lines on the client's Timeline for one visit.
  // hs_audit_templates/_items are staff reference data, same posture as
  // sector packs.
  // hs_activity_attendees: an attendee row is not its own Timeline
  // moment — the toolbox talk itself (its parent hs_activities row)
  // already fires hs_activities_hs_event; a per-attendee entry would
  // put N lines on the Timeline for one talk.
  const NOT_SOURCES = ['hs_sector_packs', 'hs_sector_pack_items', 'hs_audit_templates', 'hs_audit_template_items', 'hs_audit_responses', 'hs_activity_attendees'];
  it.each(SOURCES)('%s has an AFTER _hs_event trigger', (t) => {
    expect(sql).toMatch(new RegExp(`CREATE TRIGGER ${t}_hs_event\\s+AFTER [A-Z ]+ ON public\\.${t}`));
  });

  it.each(NOT_SOURCES)('%s is reference data, not a source — no _hs_event trigger', (t) => {
    expect(sql).not.toMatch(new RegExp(`CREATE TRIGGER ${t}_hs_event`));
  });

  it('every surviving hs_ table is accounted for as a source, reference data, or the timeline itself', () => {
    for (const t of tables.filter(t => t !== 'hs_events')) {
      expect([...SOURCES, ...NOT_SOURCES], t).toContain(t);
    }
  });
});
