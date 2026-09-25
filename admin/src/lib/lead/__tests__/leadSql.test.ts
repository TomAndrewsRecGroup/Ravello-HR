import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// 099 (additive, before the deploy) and 100 (a CHECK, after it).

const MIG = resolve(__dirname, '../../../../../supabase/migrations');
const sql099 = readFileSync(`${MIG}/099_lead_flow.sql`, 'utf8');
const sql100 = readFileSync(`${MIG}/100_lead_checks.sql`, 'utf8');
const onboarding = readFileSync(resolve(__dirname, '../onboarding.ts'), 'utf8');
const reminders = readFileSync(resolve(__dirname, '../../reminders/rules.ts'), 'utf8');

describe('099', () => {
  it('adds the hire join column with a unique partial index, so a candidate becomes one employee', () => {
    expect(sql099).toMatch(/ALTER TABLE public\.employee_records ADD COLUMN IF NOT EXISTS source_candidate_id uuid REFERENCES public\.candidates\(id\) ON DELETE SET NULL/);
    expect(sql099).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS employee_records_source_candidate_idx ON public\.employee_records \(source_candidate_id\) WHERE source_candidate_id IS NOT NULL/);
  });
  it('adds assigned_to to both checklist progress tables', () => {
    expect(sql099).toMatch(/ALTER TABLE public\.onboarding_task_progress\s+ADD COLUMN IF NOT EXISTS assigned_to text/);
    expect(sql099).toMatch(/ALTER TABLE public\.offboarding_task_progress ADD COLUMN IF NOT EXISTS assigned_to text/);
  });
  it('gives reviews an employee link and a unique source_ref per company, so the probation review is created once', () => {
    expect(sql099).toMatch(/ALTER TABLE public\.performance_reviews ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public\.employee_records\(id\)/);
    expect(sql099).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS performance_reviews_source_ref_idx ON public\.performance_reviews \(company_id, source_ref\) WHERE source_ref IS NOT NULL/);
    expect(onboarding).toMatch(/onConflict: 'company_id,source_ref', ignoreDuplicates: true/);
  });
  it('re-creates the employee_records trigger with the join column and nothing sensitive', () => {
    const m = sql099.match(/CREATE TRIGGER employee_records_platform_event AFTER INSERT OR UPDATE OR DELETE ON public\.employee_records\s+FOR EACH ROW EXECUTE FUNCTION public\.platform_event_row\(([^)]*)\)/);
    expect(m).toBeTruthy();
    const cols = m![1].split(',').map(c => c.trim().replace(/^'|'$/g, ''));
    expect(cols).toEqual(['status', 'start_date', 'end_date', 'probation_end', 'full_name', 'job_title', 'department', 'source_candidate_id']);
    expect(sql099).toMatch(/DROP TRIGGER IF EXISTS employee_records_platform_event ON public\.employee_records/);
  });
  it('is additive only', () => {
    expect(sql099).not.toMatch(/DROP COLUMN|DROP TABLE|ADD CONSTRAINT/);
  });
});

describe('100', () => {
  it('pins the acknowledgement statuses the code writes', () => {
    const m = sql100.match(/CHECK \(status IN \(([^)]*)\)\)/);
    const allowed = m![1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
    expect(allowed).toEqual(['pending', 'acknowledged', 'overdue', 'cancelled']);
    // the consumer writes 'cancelled' on leaving; the reminders cron writes 'overdue'
    expect(onboarding).toMatch(/from\('policy_acknowledgements'\)\.update\(\{ status: 'cancelled' \}/);
    expect(reminders).toMatch(/from\('policy_acknowledgements'\)\.update\(\{ status: 'overdue'/);
  });
});
