import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import { BarChart3, ExternalLink } from 'lucide-react';
import ReportUploadForm from './ReportUploadForm';
import ExportCSVButton from '@/components/modules/ExportCSVButton';

export const metadata: Metadata = { title: 'Reports' };
export const revalidate = 30;

export default async function AdminReportsPage() {
  const supabase = createServerSupabaseClient();

  // These are CSV EXPORTS, so "most of the rows" is the wrong answer.
  // The five-thousand-row limits these used to carry did nothing: PostgREST clamps
  // every response at ~1000, so a client exporting "all candidates"
  // received 1000 with no warning and nothing reporting a fault. Each
  // exhaustive read now walks pages with a stable, unique sort key.
  //
  // The `id` tie-break is load-bearing: created_at alone is not unique
  // (an import writes many rows in the same millisecond) and without a
  // total order two pages can be ordered differently, dropping or
  // duplicating rows across the boundary.
  const [reportsRes, companiesRes, reqs, cands, comp, tickets] = await Promise.all([
    supabase.from('reports').select('id,title,period,file_url,created_at,companies(id,slug,name)').order('created_at', { ascending: false }).limit(500),
    supabase.from('companies').select('id,slug,name').eq('active', true).order('name').limit(500),
    readAllPages<any>((from, to) => supabase.from('requisitions')
      .select('id,title,department,seniority,location,stage,assigned_recruiter,created_at,companies(name)')
      .order('created_at', { ascending: false }).order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('candidates')
      .select('id,full_name,email,client_status,approved_for_client,created_at,requisitions(title),companies(name)')
      .order('created_at', { ascending: false }).order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('compliance_items')
      .select('id,title,category,status,due_date,companies(name)')
      .order('due_date').order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('tickets')
      .select('id,subject,status,priority,created_at,resolved_at,companies(name)')
      .order('created_at', { ascending: false }).order('id').range(from, to)),
  ]);

  const reports   = reportsRes.data   ?? [];
  const companies = companiesRes.data ?? [];

  // Surfaced rather than swallowed: an export that could not be read in
  // full must say so, otherwise it is the same silent truncation with
  // extra steps.
  const exportProblems = [
    reqs.error    && `Roles: ${reqs.error}`,
    cands.error   && `Candidates: ${cands.error}`,
    comp.error    && `Compliance: ${comp.error}`,
    tickets.error && `Tickets: ${tickets.error}`,
    (reqs.truncated || cands.truncated || comp.truncated || tickets.truncated)
      && 'An export hit the 200,000-row safety ceiling and is incomplete.',
  ].filter(Boolean) as string[];
  const today = new Date().toISOString().slice(0, 10);

  const reqsCSV = reqs.rows.map((r: any) => ({
    Client:      (r.companies as any)?.name ?? '',
    Title:       r.title,
    Department:  r.department ?? '',
    Seniority:   r.seniority ?? '',
    Location:    r.location ?? '',
    Stage:       r.stage,
    Recruiter:   r.assigned_recruiter ?? '',
    Created:     new Date(r.created_at).toLocaleDateString('en-GB'),
  }));

  const candsCSV = cands.rows.map((c: any) => ({
    Client:          (c.companies as any)?.name ?? '',
    Name:            c.full_name,
    Email:           c.email ?? '',
    Role:            (c.requisitions as any)?.title ?? '',
    'Client Status': c.client_status,
    Approved:        c.approved_for_client ? 'Yes' : 'No',
    Submitted:       new Date(c.created_at).toLocaleDateString('en-GB'),
  }));

  const compCSV = comp.rows.map((c: any) => ({
    Client:   (c.companies as any)?.name ?? '',
    Title:    c.title,
    Category: c.category ?? '',
    Status:   c.status,
    'Due Date': c.due_date ? new Date(c.due_date).toLocaleDateString('en-GB') : '',
  }));

  const ticketsCSV = tickets.rows.map((t: any) => ({
    Client:     (t.companies as any)?.name ?? '',
    Subject:    t.subject,
    Status:     t.status,
    Priority:   t.priority,
    Raised:     new Date(t.created_at).toLocaleDateString('en-GB'),
    Resolved:   t.resolved_at ? new Date(t.resolved_at).toLocaleDateString('en-GB') : '',
  }));

  return (
    <>
      <AdminTopbar
        title="Reports"
        subtitle="Upload and manage client reports"
      />
      <main className="admin-page flex-1 space-y-6">
        {exportProblems.length > 0 && (
          <div className="card p-4" style={{ borderColor: 'var(--red)' }}>
            <p className="text-sm" style={{ color: 'var(--ink)', fontWeight: 600, margin: 0 }}>
              These exports may be incomplete
            </p>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {exportProblems.map((p, i) => (
                <li key={i} className="text-sm" style={{ color: 'var(--ink-soft)' }}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        {/* CSV Exports */}
        <div>
          <h2 className="font-display font-semibold text-sm mb-3" style={{ color: 'var(--ink)' }}>Quick CSV Exports</h2>
          <div className="flex flex-wrap gap-3">
            <ExportCSVButton
              data={reqsCSV}
              filename={`all-requisitions-${today}`}
              label="All Requisitions"
              headers={['Client', 'Title', 'Department', 'Seniority', 'Location', 'Stage', 'Recruiter', 'Created']}
            />
            <ExportCSVButton
              data={candsCSV}
              filename={`all-candidates-${today}`}
              label="All Candidates"
              headers={['Client', 'Name', 'Email', 'Role', 'Client Status', 'Approved', 'Submitted']}
            />
            <ExportCSVButton
              data={compCSV}
              filename={`compliance-items-${today}`}
              label="Compliance Items"
              headers={['Client', 'Title', 'Category', 'Status', 'Due Date']}
            />
            <ExportCSVButton
              data={ticketsCSV}
              filename={`support-tickets-${today}`}
              label="Support Tickets"
              headers={['Client', 'Subject', 'Status', 'Priority', 'Created', 'Resolved']}
            />
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_360px] gap-6">

          {/* Report list */}
          <section>
            <div className="card overflow-hidden">
              {reports.length === 0 ? (
                <div className="card p-12 empty-state">
                  <BarChart3 size={28} />
                  <p className="text-sm">No reports yet.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--surface-alt)' }}>
                      {['Client', 'Title', 'Period', 'Date', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r: any) => (
                      <tr
                        key={r.id}
                        className="hover:bg-[var(--surface-alt)] transition-colors"
                        style={{ borderBottom: '1px solid var(--line)' }}
                      >
                        <td className="px-4 py-3">
                          <Link prefetch={false}
                            href={`/clients/${(r.companies as any)?.slug ?? (r.companies as any)?.id}`}
                            className="font-medium hover:underline"
                            style={{ color: 'var(--purple)' }}
                          >
                            {(r.companies as any)?.name ?? '-'}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--ink)' }}>{r.title}</td>
                        <td className="px-4 py-3" style={{ color: 'var(--ink-soft)' }}>{r.period ?? '-'}</td>
                        <td className="px-4 py-3" style={{ color: 'var(--ink-faint)' }}>
                          {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3">
                          <a
                            href={r.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary btn-sm flex items-center gap-1.5 w-fit"
                          >
                            <ExternalLink size={12} /> Open
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Upload form */}
          <aside>
            <ReportUploadForm companies={companies} />
          </aside>

        </div>

      </main>
    </>
  );
}
