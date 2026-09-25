import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SERVICE_REQUEST_PRIORITIES, SERVICE_REQUEST_TYPES } from '@/lib/ui/statusMaps';
import { BD_NEXT_ACTIONS } from '@/lib/bd/prospectScore';

const MIG = resolve(__dirname, '../../../../../supabase/migrations');
const sql101 = readFileSync(`${MIG}/101_support_bd.sql`, 'utf8');
const sql102 = readFileSync(`${MIG}/102_support_checks.sql`, 'utf8');
const list = (re: RegExp, text: string) => { const m = text.match(re); expect(m, re.source).toBeTruthy(); return m![1].split(',').map(s => s.trim().replace(/^'|'$/g, '')); };

describe('101', () => {
  it('adds the support flow columns and an SLA trigger BEFORE INSERT', () => {
    for (const c of ['assigned_to', 'priority', 'first_response_at', 'sla_due_at', 'triage', 'source']) expect(sql101).toMatch(new RegExp(`ALTER TABLE public\\.service_requests ADD COLUMN IF NOT EXISTS ${c}\\b`));
    expect(sql101).toMatch(/CREATE TRIGGER service_requests_sla BEFORE INSERT ON public\.service_requests/);
  });
  it('adds the four bd_companies columns the BD page selects, and the score', () => {
    for (const c of ['domain', 'company_location', 'friction_intel', 'ivylens_roles', 'prospect_score', 'next_action', 'scored_at', 'score_inputs', 'source', 'outreach_status']) expect(sql101).toMatch(new RegExp(`ALTER TABLE public\\.bd_companies ADD COLUMN IF NOT EXISTS ${c}\\b`));
    expect(sql101).toMatch(/ALTER TABLE public\.enquiries ADD COLUMN IF NOT EXISTS bd_company_id uuid REFERENCES public\.bd_companies\(id\)/);
  });
  it('the re-created whitelists carry the flow columns and never the text ones', () => {
    const sr = list(/ON public\.service_requests\s+FOR EACH ROW EXECUTE FUNCTION public\.platform_event_row\(([^)]*)\)/, sql101);
    expect(sr).toEqual(expect.arrayContaining(['status', 'assigned_to', 'priority', 'first_response_at', 'sla_due_at']));
    const enq = list(/ON public\.enquiries\s+FOR EACH ROW EXECUTE FUNCTION public\.platform_event_row\(([^)]*)\)/, sql101);
    expect(enq).toEqual(['status', 'source', 'company_name', 'bd_company_id']);
    const bd = list(/ON public\.bd_companies\s+FOR EACH ROW EXECUTE FUNCTION public\.platform_event_row\(([^)]*)\)/, sql101);
    expect(bd).toEqual(['status', 'prospect_score', 'next_action', 'outreach_status']);
    for (const cols of [sr, enq, bd]) for (const c of cols) expect(c).not.toMatch(/^(details|notes|triage|result|response_notes|email|phone|full_name|score_inputs)$/);
  });
  it('is additive only', () => {
    expect(sql101).not.toMatch(/DROP COLUMN|DROP TABLE|ADD CONSTRAINT/);
  });
});

describe('102', () => {
  it('pins the request types, priorities and next actions to the tuples', () => {
    expect(list(/CHECK \(request_type IN \(([^)]*)\)\)/, sql102)).toEqual([...SERVICE_REQUEST_TYPES]);
    expect(list(/priority IN \(([^)]*)\)/, sql102)).toEqual([...SERVICE_REQUEST_PRIORITIES]);
    expect(list(/next_action IN \(([^)]*)\)/, sql102)).toEqual([...BD_NEXT_ACTIONS]);
  });
});
