import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, ShieldAlert, Eye } from 'lucide-react';
import { getSafetyContext, orgSitesAndDepartments, param, fmtDate } from '@/lib/hs/safetyContext';
import {
  HS_INCIDENT_SEVERITIES, HS_INCIDENT_SEVERITY_LABELS, HS_INCIDENT_STATUSES, HS_INCIDENT_STATUS_LABELS,
  HS_INCIDENT_TYPES, HS_INCIDENT_TYPE_LABELS, type HsIncidentSeverity, type HsIncidentStatus, type HsIncidentType,
} from '@/lib/hs/vocab';
import { RIDDOR_REVIEW_STATUSES, RIDDOR_REVIEW_STATUS_LABELS, incidentPath, type RiddorReviewStatus } from '@/lib/hs/safetyVocab';
import FilterForm from '@/components/safety/FilterForm';
import CsvButton from '@/components/safety/CsvButton';
import SafetyEmpty from '@/components/safety/SafetyEmpty';
import Pill, { toneFor } from '@/components/safety/Pill';

export const metadata: Metadata = { title: 'Incidents' };
export const dynamic = 'force-dynamic';

const LIMIT = 500;

interface Row {
  id: string; incident_number: string; incident_type: HsIncidentType; title: string | null; occurred_on: string;
  incident_time: string | null; site_id: string | null; exact_location: string | null; severity: HsIncidentSeverity | null;
  severity_confirmed_at: string | null; status: HsIncidentStatus; riddor_review_status: RiddorReviewStatus;
}

// The incident log (125). Anyone with incident.read sees the
// organisation's incidents; someone who can only report sees the
// reports they made (RLS decides — this page only explains it). The
// description is never listed or exported: it can hold medical detail.
export default async function IncidentsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const ctx = await getSafetyContext();
  const { supabase, companyId } = ctx;
  if (!companyId) return <main className="portal-page flex-1"><p className="card p-4 text-sm">No organisation is selected.</p></main>;

  const f = {
    q: param(sp, 'q'), type: param(sp, 'type'), status: param(sp, 'status'), severity: param(sp, 'severity'),
    site: param(sp, 'site'), from: param(sp, 'from'), to: param(sp, 'to'), riddor: param(sp, 'riddor'), near_miss: param(sp, 'near_miss'),
  };

  let q = supabase.from('hs_incidents')
    .select('id, incident_number, incident_type, title, occurred_on, incident_time, site_id, exact_location, severity, severity_confirmed_at, status, riddor_review_status', { count: 'exact' })
    .eq('company_id', companyId);
  if (f.status) q = q.eq('status', f.status); else q = q.neq('status', 'archived');
  if (f.near_miss === '1') q = q.eq('incident_type', 'near_miss');
  else if (f.type) q = q.eq('incident_type', f.type);
  if (f.severity === 'unconfirmed') q = q.is('severity_confirmed_at', null);
  else if (f.severity) q = q.eq('severity', f.severity).not('severity_confirmed_at', 'is', null);
  if (f.site) q = q.eq('site_id', f.site);
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.from)) q = q.gte('occurred_on', f.from);
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.to)) q = q.lte('occurred_on', f.to);
  if (f.riddor) q = q.eq('riddor_review_status', f.riddor);
  if (f.q) {
    const pat = `%${f.q.replace(/[%_\\,()]/g, ' ')}%`;
    q = q.or(`incident_number.ilike.${pat},title.ilike.${pat}`);
  }

  const [{ data, count, error }, { sites }] = await Promise.all([
    q.order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(LIMIT),
    orgSitesAndDepartments(supabase, companyId),
  ]);
  const rows = (data ?? []) as Row[];
  const siteName = new Map(sites.map(s => [s.id, s.name]));
  const readAll = ctx.can('incident.read');
  const canReport = ctx.can('incident.create');
  const where = (r: Row) => [r.site_id ? siteName.get(r.site_id) : null, r.exact_location].filter(Boolean).join(' · ') || '—';
  const sev = (r: Row) => (r.severity && r.severity_confirmed_at ? HS_INCIDENT_SEVERITY_LABELS[r.severity] : 'Unconfirmed');

  const csvRows = rows.map(r => ({
    number: r.incident_number, date: r.occurred_on, time: r.incident_time?.slice(0, 5) ?? '', type: HS_INCIDENT_TYPE_LABELS[r.incident_type],
    title: r.title ?? '', location: where(r), severity: sev(r), status: HS_INCIDENT_STATUS_LABELS[r.status],
    riddor: RIDDOR_REVIEW_STATUS_LABELS[r.riddor_review_status] ?? r.riddor_review_status,
  }));

  return (
    <main className="portal-page flex-1 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          {readAll
            ? 'Every accident, injury, near miss and dangerous occurrence reported in this organisation.'
            : 'The incidents you have reported. The H&S team reviews and investigates each one; you will not see other people\'s reports or the investigation detail.'}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          <CsvButton filename="incidents.csv" rows={csvRows} columns={[
            { key: 'number', label: 'Incident number' }, { key: 'date', label: 'Date' }, { key: 'time', label: 'Time' },
            { key: 'type', label: 'Type' }, { key: 'title', label: 'Title' }, { key: 'location', label: 'Site / location' },
            { key: 'severity', label: 'Severity' }, { key: 'status', label: 'Status' }, { key: 'riddor', label: 'RIDDOR review' },
          ]} />
          {canReport && (
            <>
              <Link href="/protect/incidents/new?type=near_miss" className="btn-secondary btn-sm" style={{ minHeight: 40 }}>
                <Eye size={14} /> Report a near miss
              </Link>
              <Link href="/protect/incidents/new" className="btn-cta btn-sm" style={{ minHeight: 40 }}>
                <Plus size={14} /> Report an incident
              </Link>
            </>
          )}
        </div>
      </div>

      <FilterForm fields={[
        { name: 'q', label: 'Search', type: 'search', value: f.q },
        { name: 'type', label: 'Type', value: f.type, options: HS_INCIDENT_TYPES.map(t => ({ value: t, label: HS_INCIDENT_TYPE_LABELS[t] })) },
        { name: 'status', label: 'Status', value: f.status, options: HS_INCIDENT_STATUSES.map(s => ({ value: s, label: HS_INCIDENT_STATUS_LABELS[s] })) },
        { name: 'severity', label: 'Severity', value: f.severity, options: [
          { value: 'unconfirmed', label: 'Unconfirmed' },
          ...HS_INCIDENT_SEVERITIES.map(s => ({ value: s, label: HS_INCIDENT_SEVERITY_LABELS[s] })),
        ] },
        { name: 'site', label: 'Site', value: f.site, options: sites.map(s => ({ value: s.id, label: s.name })) },
        { name: 'from', label: 'From', type: 'date', value: f.from },
        { name: 'to', label: 'To', type: 'date', value: f.to },
        { name: 'riddor', label: 'RIDDOR review', value: f.riddor, options: RIDDOR_REVIEW_STATUSES.map(s => ({ value: s, label: RIDDOR_REVIEW_STATUS_LABELS[s] })) },
        { name: 'near_miss', label: 'Near misses only', type: 'checkbox', value: f.near_miss },
      ]} />

      {error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Incidents could not be loaded. Refresh to try again.</p>}
      {(count ?? 0) > LIMIT && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Showing the {LIMIT} most recent of {count}. Narrow the filters to see the rest.</p>}

      {rows.length === 0 ? (
        <SafetyEmpty icon={ShieldAlert} title="No incidents reported"
          text={Object.values(f).some(Boolean)
            ? 'Nothing matches these filters.'
            : 'When an accident, injury, near miss or dangerous occurrence happens, report it here straight away. It takes a minute on a phone; detail can be added later.'}>
          {canReport && !Object.values(f).some(Boolean) && (
            <Link href="/protect/incidents/new" className="btn-cta btn-sm mt-2"><Plus size={14} /> Report an incident</Link>
          )}
        </SafetyEmpty>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Number</th><th>Date</th><th>Type</th><th>Title</th><th>Site / location</th><th>Severity</th><th>Status</th><th>RIDDOR</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="font-mono text-xs whitespace-nowrap"><Link href={incidentPath(r.id)}>{r.incident_number}</Link></td>
                  <td className="whitespace-nowrap">{fmtDate(r.occurred_on)}{r.incident_time ? ` ${r.incident_time.slice(0, 5)}` : ''}</td>
                  <td>{HS_INCIDENT_TYPE_LABELS[r.incident_type]}</td>
                  <td><Link href={incidentPath(r.id)} style={{ color: 'var(--ink)' }}>{r.title ?? HS_INCIDENT_TYPE_LABELS[r.incident_type]}</Link></td>
                  <td>{where(r)}</td>
                  <td>{r.severity && r.severity_confirmed_at
                    ? <Pill tone={['major', 'critical', 'fatal'].includes(r.severity) ? 'bad' : r.severity === 'serious' ? 'warn' : 'neutral'}>{HS_INCIDENT_SEVERITY_LABELS[r.severity]}</Pill>
                    : <Pill tone="muted">Unconfirmed</Pill>}</td>
                  <td><Pill tone={toneFor(r.status)}>{HS_INCIDENT_STATUS_LABELS[r.status]}</Pill></td>
                  <td><Pill tone={toneFor(r.riddor_review_status)}>{RIDDOR_REVIEW_STATUS_LABELS[r.riddor_review_status] ?? r.riddor_review_status}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
