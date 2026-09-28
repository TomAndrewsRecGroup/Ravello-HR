import type { Metadata } from 'next';
import Link from 'next/link';
import { HeartPulse, Lock } from 'lucide-react';
import { getWorkforceContext } from '@/lib/workforce/context';
import { param, fmtDate, todayIso } from '@/lib/hs/safetyContext';
import { readAllPages } from '@/lib/supabase/paged';
import { HEALTH_OUTCOME_LABELS, workforcePersonPath, type HealthOutcome } from '@/lib/workforce/vocab';
import type { MatrixRow } from '@/lib/workforce/types';
import { surveillanceRows, type HealthOutcomeRow } from '@/lib/workforce/matrix';
import { RequirementBadge } from '@/components/workforce/DeploymentBadge';
import CsvButton from '@/components/safety/CsvButton';
import SafetyEmpty from '@/components/safety/SafetyEmpty';
import RecordOutcome from './RecordOutcome';
import ClinicalRecords, { type ClinicalRow } from './ClinicalRecords';

export const metadata: Metadata = { title: 'Occupational health' };
export const dynamic = 'force-dynamic';

// Health surveillance (spec 38-43). Two audiences, kept apart:
//  - the OPERATIONAL summary (outcome category, dates, provider,
//    restriction) — occupational_health.summary.read (135 RLS);
//  - CLINICAL notes and documents — only an explicit
//    occupational_health.clinical.read grant (staff do not get it). They
//    are not even queried unless the viewer holds it.
// Requirement status is the Safe to Deploy engine's (136), never ours.
export default async function OccupationalHealthPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const ctx = await getWorkforceContext();
  const { supabase, companyId } = ctx;
  if (!companyId) return <main className="portal-page flex-1"><p className="card p-4 text-sm">No organisation is selected.</p></main>;

  if (!ctx.can('occupational_health.summary.read')) {
    return (
      <main className="portal-page flex-1">
        <SafetyEmpty icon={Lock} title="You do not have access to occupational health records"
          text="Occupational health outcomes are visible only to people your organisation has authorised. Safe to Deploy shows each person's status without the medical detail." />
      </main>
    );
  }
  const canClinical = ctx.can('occupational_health.clinical.read');
  const canManage = ctx.can('occupational_health.manage');

  const [matrix, outcomes, catalogue, clinical] = await Promise.all([
    readAllPages<MatrixRow>((from, to) => supabase.rpc('workforce_matrix', { p_company: companyId })
      .order('full_name').order('person_id').range(from, to)),
    readAllPages<HealthOutcomeRow>((from, to) => supabase.from('person_health_outcomes')
      .select('id, person_id, requirement_id, assessed_on, provider, outcome, restriction_summary, review_date, created_at')
      .eq('company_id', companyId).order('assessed_on', { ascending: false }).order('id').range(from, to)),
    supabase.from('occupational_health_requirements').select('id, title, company_id, active_status')
      .or(`company_id.is.null,company_id.eq.${companyId}`).eq('active_status', 'active').order('title').limit(500),
    // Clinical rows are fetched ONLY for an explicit clinical grant.
    canClinical
      ? readAllPages<ClinicalRow>((from, to) => supabase.from('occupational_health_clinical')
          .select('id, person_id, outcome_id, clinical_notes, document_path, created_at')
          .eq('company_id', companyId).order('created_at', { ascending: false }).order('id').range(from, to))
      : Promise.resolve(null),
  ]);

  const rows = surveillanceRows(matrix.rows, outcomes.rows);
  const people = matrix.rows.map(p => ({ id: p.person_id, name: p.full_name }));
  const requirements = ((catalogue.data ?? []) as { id: string; title: string }[]).map(r => ({ id: r.id, title: r.title }));
  const outcomeLabel = (o: string) => HEALTH_OUTCOME_LABELS[o as HealthOutcome] ?? o;

  // The export never carries restriction text or anything clinical.
  const csv = rows.map(r => ({
    person: r.personName, requirement: r.requirementName, status: r.status,
    outcome: r.latest ? outcomeLabel(r.latest.outcome) : '', assessed_on: r.latest?.assessed_on ?? '',
    next_due: r.nextDue ?? '', provider: r.latest?.provider ?? '',
  }));

  const loadError = matrix.error ?? outcomes.error ?? catalogue.error?.message ?? null;

  return (
    <main className="portal-page flex-1 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          Health surveillance: each person against the occupational health requirements their roles and sites set, with the
          latest outcome. Clinical detail is never shown here.
        </p>
        <div className="ml-auto">
          <CsvButton filename="health-surveillance.csv" rows={csv} columns={[
            { key: 'person', label: 'Person' }, { key: 'requirement', label: 'Requirement' }, { key: 'status', label: 'Safe to Deploy status' },
            { key: 'outcome', label: 'Latest outcome' }, { key: 'assessed_on', label: 'Assessed on' }, { key: 'next_due', label: 'Next due' },
            { key: 'provider', label: 'Provider' },
          ]} />
        </div>
      </div>

      {loadError && <p className="card p-3 text-sm" role="alert" style={{ color: 'var(--red)' }}>Some records could not be loaded: {loadError}</p>}

      {canManage && (
        <RecordOutcome key={`${param(sp, 'person')}|${param(sp, 'req')}`} companyId={companyId} people={people} requirements={requirements} today={todayIso()}
          defaultPerson={param(sp, 'person')} defaultRequirement={param(sp, 'req')} />
      )}

      {rows.length === 0 ? (
        <SafetyEmpty icon={HeartPulse} title="No health surveillance requirements yet"
          text="Nobody you can see has an occupational health requirement. Add one (for example audiometry) to a role or site in the Roles tab, and the people it applies to appear here." />
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <caption className="sr-only">Health surveillance matrix</caption>
            <thead>
              <tr>
                <th scope="col">Person</th><th scope="col">Requirement</th><th scope="col">Status</th><th scope="col">Latest outcome</th>
                <th scope="col">Assessed</th><th scope="col">Next due</th><th scope="col">Provider</th><th scope="col">Restriction</th>
                {canManage && <th scope="col"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.personId}-${r.requirementId}`}>
                  <th scope="row" style={{ fontWeight: 500, textAlign: 'left' }}>
                    <Link href={workforcePersonPath(r.personId)} style={{ color: 'var(--ink)' }}>{r.personName}</Link>
                  </th>
                  <td>{r.requirementName}{r.safetyCritical && <span className="text-xs" style={{ color: 'var(--red)' }}> · safety-critical</span>}</td>
                  <td><RequirementBadge status={r.status} /></td>
                  <td>{r.latest ? outcomeLabel(r.latest.outcome) : <span style={{ color: 'var(--ink-faint)' }}>None on record</span>}</td>
                  <td className="whitespace-nowrap">{fmtDate(r.latest?.assessed_on)}</td>
                  <td className="whitespace-nowrap">{fmtDate(r.nextDue)}</td>
                  <td>{r.latest?.provider ?? '—'}</td>
                  <td className="text-sm">{r.latest?.restriction_summary ?? '—'}</td>
                  {canManage && (
                    <td>
                      <Link className="btn-ghost btn-sm" href={`?person=${r.personId}&req=${r.requirementId}#record-outcome`}
                        aria-label={`Record an outcome for ${r.personName} — ${r.requirementName}`}>Record</Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canClinical && clinical && (
        <ClinicalRecords companyId={companyId} people={people} rows={clinical.rows} loadError={clinical.error}
          outcomes={outcomes.rows.map(o => ({ id: o.id, person_id: o.person_id, label: `${outcomeLabel(o.outcome)} — ${fmtDate(o.assessed_on)}` }))} />
      )}
    </main>
  );
}
