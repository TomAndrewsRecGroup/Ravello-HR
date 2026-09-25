import type { SupabaseClient } from '@supabase/supabase-js';
import { readAllPages } from '@/lib/supabase/paged';
import { askJev } from '@/lib/jev/client';
import { notify } from '@/lib/notify/notify';
import { absenceSignals, type Spell } from './bradford';
import {
  ABSENCE_MIN_SPELLS, absencePatternQuestions, absencePatternState, fallbackOnboardingRisk,
  onboardingRiskQuestions, onboardingRiskState, ONBOARDING_RISK, type AbsencePattern, type OnboardingRisk, type OnboardingSignals,
} from './jevQuestions';
import { isoWeek } from '@/lib/hs/weeklySummary';

// Monday people insights, run from the weekly-summary cron.
//
//   absence_pattern — for each employee with ≥3 absence spells in the
//   last twelve months, Jev reads NUMBERS ONLY (never a name or a note)
//   and says whether the pattern is worth a supportive conversation.
//   The result is an in-app suggestion to the client's admins, once per
//   employee per month, never emailed, never written to the employee.
//
//   onboarding_risk — for each in-progress onboarding, whether the
//   checklist is slipping. In-app, once per instance per week.

export interface PeopleTally { companies: number; employees_scored: number; absence_flags: number; onboarding_scored: number; onboarding_flags: number; jev_calls: number; errors: string[] }

export async function runWeeklyPeople(sb: SupabaseClient, opts: { now?: Date } = {}): Promise<PeopleTally> {
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const week = isoWeek(now);
  const since = new Date(now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
  const tally: PeopleTally = { companies: 0, employees_scored: 0, absence_flags: 0, onboarding_scored: 0, onboarding_flags: 0, jev_calls: 0, errors: [] };

  const { data: companies, error } = await sb.from('companies').select('id, name, feature_flags').eq('active', true);
  if (error) { tally.errors.push(`companies: ${error.message}`); return tally; }

  for (const co of (companies ?? []) as { id: string; name: string; feature_flags: Record<string, unknown> | null }[]) {
    const flags = co.feature_flags ?? {};
    if (flags.lead === false || flags.ai_assist === false) continue;
    tally.companies++;

    // ── absence patterns ──
    const spells = await readAllPages<Spell & { employee_id: string | null; employee_name: string }>((from, to) =>
      sb.from('absence_records').select('employee_id, employee_name, start_date, end_date, days, absence_type')
        .eq('company_id', co.id).in('status', ['approved', 'pending']).gte('start_date', since).order('id').range(from, to));
    if (spells.error) { tally.errors.push(`${co.id} absences: ${spells.error}`); continue; }
    const byEmployee = new Map<string, { name: string; spells: Spell[] }>();
    for (const r of spells.rows) {
      if (!r.employee_id) continue;   // a legacy row typed by name cannot be scored
      const e = byEmployee.get(r.employee_id) ?? { name: r.employee_name, spells: [] };
      e.spells.push(r);
      byEmployee.set(r.employee_id, e);
    }
    for (const [employeeId, e] of byEmployee) {
      if (e.spells.length < ABSENCE_MIN_SPELLS) continue;
      tally.employees_scored++;
      const signals = absenceSignals(e.spells);
      const r = await askJev(sb, {
        kind: 'absence_pattern', companyId: co.id, entityType: 'employee_record', entityId: employeeId,
        actor: { id: null, kind: 'system' }, state: absencePatternState(signals), questions: absencePatternQuestions(), flags, gate: 0.7,
      });
      if (r && !r.cached) tally.jev_calls++;
      const pattern = (r && !r.gated && r.answers.pattern?.type === 'choice' ? r.answers.pattern.selected : 'no_concern') as AbsencePattern;
      if (pattern === 'no_concern') continue;
      tally.absence_flags++;
      await notify(sb, {
        audiences: [{ kind: 'company_admins', companyId: co.id }], companyId: co.id, type: 'absence_pattern_flag', inAppOnly: true,
        title: `${e.name}: ${signals.spells} absence spells in 12 months (Bradford ${signals.bradford})`,
        body:  pattern === 'discuss' ? 'Consider a supportive return-to-work conversation. This is a suggestion from the numbers, not a judgement.' : 'Worth keeping an eye on over the next few months.',
        link:  { portal: '/lead/absence' },
        dedupeKey: `absence_pattern:${employeeId}:${month}`,
      });
    }

    // ── onboarding risk ──
    const { data: instances } = await sb.from('onboarding_instances')
      .select('id, employee_id, started_at, employee_records(full_name, start_date, probation_end), onboarding_task_progress(status, due_date)')
      .eq('company_id', co.id).eq('status', 'in_progress');
    for (const inst of (instances ?? []) as unknown as { id: string; employee_id: string; started_at: string; employee_records: { full_name: string; start_date: string; probation_end: string | null } | null; onboarding_task_progress: { status: string; due_date: string | null }[] }[]) {
      const tasks = inst.onboarding_task_progress ?? [];
      const emp = inst.employee_records;
      const startDate = emp?.start_date ?? inst.started_at.slice(0, 10);
      const signals: OnboardingSignals = {
        tasks_total: tasks.length,
        tasks_done: tasks.filter(t => t.status === 'completed' || t.status === 'skipped').length,
        tasks_overdue: tasks.filter(t => t.status !== 'completed' && t.status !== 'skipped' && t.due_date && t.due_date < today).length,
        days_since_start: Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${startDate.slice(0, 10)}T00:00:00Z`)) / 86_400_000),
        probation_days: emp?.probation_end ? Math.round((Date.parse(`${emp.probation_end}T00:00:00Z`) - Date.parse(`${startDate.slice(0, 10)}T00:00:00Z`)) / 86_400_000) : null,
      };
      if (signals.tasks_total === 0) continue;
      tally.onboarding_scored++;
      const r = await askJev(sb, {
        kind: 'onboarding_risk', companyId: co.id, entityType: 'onboarding_instance', entityId: inst.id,
        actor: { id: null, kind: 'system' }, state: onboardingRiskState(signals), questions: onboardingRiskQuestions(), flags, gate: 0.6,
      });
      if (r && !r.cached) tally.jev_calls++;
      let risk: OnboardingRisk = fallbackOnboardingRisk(signals);
      if (r && !r.gated && r.answers.risk?.type === 'score' && (ONBOARDING_RISK as readonly string[]).includes(r.answers.risk.selected)) risk = r.answers.risk.selected as OnboardingRisk;
      if (risk === 'on_track') continue;
      tally.onboarding_flags++;
      await notify(sb, {
        audiences: [{ kind: 'company_admins', companyId: co.id }], companyId: co.id, type: 'onboarding_risk', inAppOnly: true,
        title: `${emp?.full_name ?? 'A new starter'}'s onboarding is ${risk === 'at_risk' ? 'at risk' : 'slipping'}`,
        body:  `${signals.tasks_overdue} overdue of ${signals.tasks_total} tasks, ${signals.days_since_start} days since start.`,
        link:  { portal: '/lead/onboarding' },
        dedupeKey: `onboarding_risk:${inst.id}:${week}`,
      });
    }
  }
  return tally;
}
