// Pins migration 169 (Core-OS 360 Phase 6, Group 3: the Client Service
// Ledger). Live-behaviour correctness (actor attribution, live-relationship
// gating, idempotency) is covered by serviceLedgerRules.test.ts against
// the fake event consumer; this file pins the SQL shape itself.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SERVICE_LEDGER_ENTRY_TYPES } from '../vocab';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/169_consultancy_service_ledger.sql'), 'utf8');

describe('Client Service Ledger (169)', () => {
  it('entry_type CHECK matches the TS vocabulary exactly', () => {
    const m = sql.match(/entry_type\s+text NOT NULL CHECK \(entry_type IN \(([^)]*(?:\)[^)]*)*?)\)\)/);
    expect(m, 'entry_type CHECK not found').toBeTruthy();
    const values = [...m![1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
    expect(values.sort()).toEqual([...SERVICE_LEDGER_ENTRY_TYPES].sort());
  });

  it('refuses consultancy_organisation_id = client_organisation_id', () => {
    expect(sql).toMatch(/CHECK \(consultancy_organisation_id <> client_organisation_id\)/);
  });

  it('has the composite UNIQUE constraint that IS the idempotency guard — not an application-level check', () => {
    expect(sql).toMatch(
      /CONSTRAINT consultancy_service_ledger_no_dup UNIQUE \(consultancy_organisation_id, client_organisation_id, source_type, source_id\)/,
    );
  });

  it('the consultancy read policy is portfolio-wide: my_home_company_id(), not my_company_id()', () => {
    expect(sql).toMatch(
      /CREATE POLICY consultancy_service_ledger_consultancy_read[\s\S]*?consultancy_organisation_id = \(SELECT public\.my_home_company_id\(\)\)[\s\S]*?has_capability\(consultancy_service_ledger\.client_organisation_id, 'consultancy\.client_access'\)/,
    );
  });

  it('the manual-insert policy refuses anything but a manual entry with no source, and stamps the caller as created_by', () => {
    const p = sql.slice(sql.indexOf('CREATE POLICY consultancy_service_ledger_consultancy_manual_insert'));
    expect(p).toMatch(/entry_type = 'manual'/);
    expect(p).toMatch(/source_type IS NULL AND source_id IS NULL/);
    expect(p).toMatch(/created_by = auth\.uid\(\)/);
  });

  it('there is no consultancy UPDATE/DELETE policy — an automated entry is written by the service role only, a manual one is corrected by a new row', () => {
    expect(sql).not.toMatch(/consultancy_service_ledger_consultancy_write/);
    expect(sql).not.toMatch(/FOR (UPDATE|DELETE) TO authenticated[\s\S]{0,200}consultancy_service_ledger/);
  });

  it('the client-side policy is read-only, the ordinary single-org shape', () => {
    expect(sql).toMatch(/CREATE POLICY consultancy_service_ledger_client_read ON public\.consultancy_service_ledger FOR SELECT/);
    expect(sql).not.toMatch(/consultancy_service_ledger_client_write/);
  });

  it('calls apply_write_guard()', () => {
    expect(sql).toMatch(/apply_write_guard\('public\.consultancy_service_ledger'\)/);
  });

  it('actions.created_by_admin joins the outbox whitelist, and every other existing column is preserved (additive, not a narrowing rewrite)', () => {
    const t = sql.slice(sql.indexOf('CREATE TRIGGER actions_platform_event'));
    for (const c of ['status', 'priority', 'action_type', 'title', 'source_ref', 'related_entity_type',
      'related_entity_id', 'source_type', 'source_id', 'action_class', 'assigned_to', 'verifier_id',
      'due_date', 'verification_required', 'created_by_admin']) {
      expect(t, c).toMatch(new RegExp(`'${c}'`));
    }
  });

  it('every new outbox trigger calls public.platform_event_row (fully qualified) and whitelists no free text', () => {
    const FORBIDDEN = /^(notes|description|summary|details|body)$/;
    for (const table of ['consultancy_visits', 'reports', 'training_records']) {
      const start = sql.indexOf(`CREATE TRIGGER ${table}_platform_event`);
      expect(start, table).toBeGreaterThan(-1);
      const line = sql.slice(start, sql.indexOf(';', start));
      expect(line, table).toMatch(/EXECUTE FUNCTION public\.platform_event_row\(/);
      const cols = [...line.matchAll(/'([^']+)'/g)].map(x => x[1]);
      expect(cols.length, table).toBeGreaterThan(0);
      for (const c of cols) expect(c, `${table}.${c}`).not.toMatch(FORBIDDEN);
    }
  });
});
