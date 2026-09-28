import type { Metadata } from 'next';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { getSafetyContext, orgDirectory, nameOf, param, fmtDate, todayIso } from '@/lib/hs/safetyContext';
import { INVESTIGATION_STATUSES, INVESTIGATION_STATUS_LABELS, incidentPath, type InvestigationStatus } from '@/lib/hs/safetyVocab';
import { HS_INCIDENT_TYPE_LABELS, type HsIncidentType } from '@/lib/hs/vocab';
import FilterForm from '@/components/safety/FilterForm';
import CsvButton from '@/components/safety/CsvButton';
import SafetyEmpty from '@/components/safety/SafetyEmpty';
import Pill, { toneFor } from '@/components/safety/Pill';

export const metadata: Metadata = { title: 'Investigations' };
export const dynamic = 'force-dynamic';

const LIMIT = 500;

interface Row {
  id: string; reference: string; incident_id: string; lead_investigator_id: string | null; status: InvestigationStatus;
  target_completion_date: string | null; started_at: string; approved_at: string | null;
}

// Every incident investigation in the organisation (125). One per
// incident, near misses included. Visible to anyone with incident.read;
// the work itself is done on the incident's page.
export default async function InvestigationsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const ctx = await getSafetyContext();
  const { supabase, companyId } = ctx;
  if (!companyId) return <main className="portal-page flex-1"><p className="card p-4 text-sm">No organisation is selected.</p></main>;

  const f = { q: param(sp, 'q'), status: param(sp, 'status'), lead: param(sp, 'lead'), overdue: param(sp, 'overdue') };
  const today = todayIso();

  let q = supabase.from('incident_investigations')
    .select('id, reference, incident_id, lead_investigator_id, status, target_completion_date, started_at, approved_at', { count: 'exact' })
    .eq('company_id', companyId);
  if (f.status) q = q.eq('status', f.status);
  if (f.lead) q = q.eq('lead_investigator_id', f.lead);
  if (f.overdue === '1') q = q.lt('target_completion_date', today).neq('status', 'approved');
  if (f.q) q = q.ilike('reference', `%${f.q.replace(/[%_\\,()]/g, ' ')}%`);

  const [{ data, count, error }, dir] = await Promise.all([
    q.order('started_at', { ascending: false }).limit(LIMIT),
    orgDirectory(supabase),
  ]);
  const rows = (data ?? []) as Row[];
  const incIds = [...new Set(rows.map(r => r.incident_id))];
  const invIds = rows.map(r => r.id);
  const [incs, roots] = await Promise.all([
    incIds.length ? supabase.from('hs_incidents').select('id, incident_number, incident_type, title').in('id', incIds).limit(LIMIT) : Promise.resolve({ data: [] }),
    invIds.length
      ? supabase.from('incident_causes').select('investigation_id').in('investigation_id', invIds).eq('cause_level', 'root').not('confirmed_at', 'is', null).limit(999)
      : Promise.resolve({ data: [] }),
  ]);
  const incById = new Map(((incs.data ?? []) as { id: string; incident_number: string; incident_type: HsIncidentType; title: string | null }[]).map(i => [i.id, i]));
  const rootCount = new Map<string, number>();
  for (const c of (roots.data ?? []) as { investigation_id: string }[]) rootCount.set(c.investigation_id, (rootCount.get(c.investigation_id) ?? 0) + 1);
  const isOverdue = (r: Row) => !!r.target_completion_date && r.target_completion_date < today && r.status !== 'approved';

  const csvRows = rows.map(r => {
    const i = incById.get(r.incident_id);
    return {
      reference: r.reference, incident: i?.incident_number ?? '', incident_type: i ? HS_INCIDENT_TYPE_LABELS[i.incident_type] : '',
      lead: nameOf(dir, r.lead_investigator_id), status: INVESTIGATION_STATUS_LABELS[r.status], started: r.started_at.slice(0, 10),
      target: r.target_completion_date ?? '', overdue: isOverdue(r) ? 'Yes' : 'No', roots: rootCount.get(r.id) ?? 0,
    };
  });

  return (
    <main className="portal-page flex-1 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          {ctx.can('incident.read')
            ? 'Investigations into incidents and near misses. Open an investigation from the incident itself.'
            : 'Investigations are visible to the people who manage incidents in this organisation.'}
        </p>
        <div className="ml-auto">
          <CsvButton filename="investigations.csv" rows={csvRows} columns={[
            { key: 'reference', label: 'Reference' }, { key: 'incident', label: 'Incident' }, { key: 'incident_type', label: 'Incident type' },
            { key: 'lead', label: 'Lead investigator' }, { key: 'status', label: 'Status' }, { key: 'started', label: 'Started' },
            { key: 'target', label: 'Target completion' }, { key: 'overdue', label: 'Overdue' }, { key: 'roots', label: 'Confirmed root causes' },
          ]} />
        </div>
      </div>

      <FilterForm fields={[
        { name: 'q', label: 'Search', type: 'search', value: f.q },
        { name: 'status', label: 'Status', value: f.status, options: INVESTIGATION_STATUSES.map(s => ({ value: s, label: INVESTIGATION_STATUS_LABELS[s] })) },
        { name: 'lead', label: 'Lead investigator', value: f.lead, options: dir.map(p => ({ value: p.user_id, label: p.full_name })) },
        { name: 'overdue', label: 'Overdue only', type: 'checkbox', value: f.overdue },
      ]} />

      {error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Investigations could not be loaded. Refresh to try again.</p>}
      {(count ?? 0) > LIMIT && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Showing the {LIMIT} most recent of {count}. Narrow the filters to see the rest.</p>}

      {rows.length === 0 ? (
        <SafetyEmpty icon={Search} title="No investigations"
          text={Object.values(f).some(Boolean)
            ? 'Nothing matches these filters.'
            : 'An investigation is opened from an incident or near miss. Open the incident and choose "Open investigation".'}>
          <Link href="/protect/incidents" className="btn-secondary btn-sm mt-2">Go to incidents</Link>
        </SafetyEmpty>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Reference</th><th>Incident</th><th>Lead investigator</th><th>Status</th><th>Target</th><th>Root causes confirmed</th></tr></thead>
            <tbody>
              {rows.map(r => {
                const i = incById.get(r.incident_id);
                return (
                  <tr key={r.id}>
                    <td className="font-mono text-xs whitespace-nowrap"><Link href={incidentPath(r.incident_id)}>{r.reference}</Link></td>
                    <td>{i ? <Link href={incidentPath(r.incident_id)}>{i.incident_number}</Link> : '—'}
                      {i && <span className="text-xs ml-2" style={{ color: 'var(--ink-faint)' }}>{i.title ?? HS_INCIDENT_TYPE_LABELS[i.incident_type]}</span>}</td>
                    <td>{nameOf(dir, r.lead_investigator_id)}</td>
                    <td><Pill tone={toneFor(r.status)}>{INVESTIGATION_STATUS_LABELS[r.status]}</Pill></td>
                    <td className="whitespace-nowrap" style={{ color: isOverdue(r) ? 'var(--red)' : undefined }}>
                      {fmtDate(r.target_completion_date)}{isOverdue(r) ? ' (overdue)' : ''}</td>
                    <td>{rootCount.get(r.id) ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
