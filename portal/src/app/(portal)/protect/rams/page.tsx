import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipboardList, Plus } from 'lucide-react';
import { getSafetyContext, orgDirectory, orgSitesAndDepartments, nameOf, param, fmtDate, todayIso } from '@/lib/hs/safetyContext';
import { DOC_STATUS_LABELS, RAMS_STATUSES, docPath, type DocStatus } from '@/lib/hs/safetyVocab';
import FilterForm from '@/components/safety/FilterForm';
import CsvButton from '@/components/safety/CsvButton';
import SafetyEmpty from '@/components/safety/SafetyEmpty';
import Pill, { toneFor } from '@/components/safety/Pill';

export const metadata: Metadata = { title: 'RAMS' };
export const dynamic = 'force-dynamic';

const LIMIT = 500;

// Risk Assessments and Method Statements (124). A RAMS is a controlled
// document: it counts as approved only when the workflow says so — never
// because a PDF exists. Superseded and archived versions are hidden
// unless asked for by status.
export default async function RamsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const ctx = await getSafetyContext();
  const { supabase, companyId } = ctx;
  if (!companyId) return <main className="portal-page flex-1"><p className="card p-4 text-sm">No organisation is selected.</p></main>;
  if (!ctx.can('risk.read')) {
    return <main className="portal-page flex-1"><p className="card p-4 text-sm">You do not have access to method statements in this organisation.</p></main>;
  }

  const f = { q: param(sp, 'q'), status: param(sp, 'status'), site: param(sp, 'site'), author: param(sp, 'author'), ended: param(sp, 'ended') };
  const today = todayIso();

  let q = supabase.from('method_statements')
    .select('id, reference, version, title, project_name, status, site_id, author_id, start_date, end_date, review_date, approved_at', { count: 'exact' })
    .eq('company_id', companyId);
  if (f.status) q = q.eq('status', f.status); else q = q.not('status', 'in', '(superseded,archived)');
  if (f.site) q = q.eq('site_id', f.site);
  if (f.author) q = q.eq('author_id', f.author);
  if (f.ended === '1') q = q.lt('end_date', today);
  if (f.q) {
    const pat = `%${f.q.replace(/[%_\\,()]/g, ' ')}%`;
    q = q.or(`reference.ilike.${pat},title.ilike.${pat},project_name.ilike.${pat}`);
  }

  const [{ data, count, error }, { sites }, dir] = await Promise.all([
    q.order('updated_at', { ascending: false }).limit(LIMIT),
    orgSitesAndDepartments(supabase, companyId),
    orgDirectory(supabase),
  ]);
  const rows = (data ?? []) as { id: string; reference: string; version: number; title: string; project_name: string | null; status: DocStatus;
    site_id: string | null; author_id: string | null; start_date: string | null; end_date: string | null; review_date: string | null; approved_at: string | null }[];
  const siteName = new Map(sites.map(s => [s.id, s.name]));
  const live = (s: DocStatus) => s === 'approved' || s === 'active';

  const csvRows = rows.map(r => ({
    reference: r.reference, version: r.version, title: r.title, project: r.project_name ?? '', status: DOC_STATUS_LABELS[r.status],
    site: r.site_id ? siteName.get(r.site_id) ?? '' : '', author: r.author_id ? nameOf(dir, r.author_id) : '',
    start: r.start_date ?? '', end: r.end_date ?? '', review: r.review_date ?? '', approved: r.approved_at?.slice(0, 10) ?? '',
  }));

  return (
    <main className="portal-page flex-1 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Method statements with their work sequence, linked risk assessments and COSHH assessments.</p>
        <div className="ml-auto flex gap-2">
          <CsvButton filename="rams.csv" rows={csvRows} columns={[
            { key: 'reference', label: 'Reference' }, { key: 'version', label: 'Version' }, { key: 'title', label: 'Title' },
            { key: 'project', label: 'Project' }, { key: 'status', label: 'Status' }, { key: 'site', label: 'Site' },
            { key: 'author', label: 'Author' }, { key: 'start', label: 'Start' }, { key: 'end', label: 'End' },
            { key: 'review', label: 'Review date' }, { key: 'approved', label: 'Approved' },
          ]} />
          {ctx.can('risk.create') && (
            <Link href="/protect/rams/new" className="btn-cta btn-sm" style={{ minHeight: 40 }}><Plus size={14} /> New RAMS</Link>
          )}
        </div>
      </div>

      <FilterForm fields={[
        { name: 'q', label: 'Search', type: 'search', value: f.q },
        { name: 'status', label: 'Status', value: f.status, options: RAMS_STATUSES.map(s => ({ value: s, label: DOC_STATUS_LABELS[s] })) },
        { name: 'site', label: 'Site', value: f.site, options: sites.map(s => ({ value: s.id, label: s.name })) },
        { name: 'author', label: 'Author', value: f.author, options: dir.map(p => ({ value: p.user_id, label: p.full_name })) },
        { name: 'ended', label: 'End date passed', type: 'checkbox', value: f.ended },
      ]} />

      {error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Method statements could not be loaded. Refresh to try again.</p>}
      {(count ?? 0) > LIMIT && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Showing {LIMIT} of {count}. Narrow the filters to see the rest.</p>}

      {rows.length === 0 ? (
        <SafetyEmpty icon={ClipboardList} title="No method statements yet"
          text={Object.values(f).some(Boolean) ? 'Nothing matches these filters.' : 'Write a RAMS for work that needs a planned, step-by-step safe system — start blank or from a template.'}>
          {!Object.values(f).some(Boolean) && ctx.can('risk.create') && <Link href="/protect/rams/new" className="btn-cta btn-sm mt-2"><Plus size={14} /> New RAMS</Link>}
        </SafetyEmpty>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Ref</th><th>Title</th><th>Status</th><th>Site</th><th>Author</th><th>Start</th><th>End</th><th>Review</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="font-mono text-xs whitespace-nowrap"><Link href={docPath('method_statement', r.id)}>{r.reference} v{r.version}</Link></td>
                  <td>
                    <Link href={docPath('method_statement', r.id)} style={{ color: 'var(--ink)' }}>{r.title}</Link>
                    {r.project_name && <div className="text-xs" style={{ color: 'var(--ink-faint)' }}>{r.project_name}</div>}
                  </td>
                  <td><Pill tone={toneFor(r.status)}>{DOC_STATUS_LABELS[r.status]}</Pill></td>
                  <td>{r.site_id ? siteName.get(r.site_id) ?? '—' : '—'}</td>
                  <td>{r.author_id ? nameOf(dir, r.author_id) : '—'}</td>
                  <td className="whitespace-nowrap">{fmtDate(r.start_date)}</td>
                  <td className="whitespace-nowrap">
                    {fmtDate(r.end_date)}
                    {live(r.status) && r.end_date && r.end_date < today && <div><Pill tone="bad">Ended</Pill></div>}
                  </td>
                  <td className="whitespace-nowrap">
                    {fmtDate(r.review_date)}
                    {live(r.status) && r.review_date && r.review_date < today && <div><Pill tone="bad">Overdue</Pill></div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
