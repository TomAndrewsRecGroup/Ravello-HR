import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import ExportCSVButton from '@/components/modules/ExportCSVButton';
import { BarChart3, Download } from 'lucide-react';

export const metadata: Metadata = { title: 'Reports' };
export const revalidate = 60;

export default async function ReportsPage() {
  const supabase = createServerSupabaseClient();
  const { companyId } = await getSessionProfile();
  const { data: company } = await supabase.from('companies').select('feature_flags, name').eq('id', companyId).single();
  const companyName: string = (company as any)?.name ?? 'company';
  const flags: Record<string, boolean> = (company as any)?.feature_flags ?? {};
  const enabled = flags.reports !== false;

  const [
    { data: reports },
    { data: reqs },
    { data: candidates },
    { data: complianceItems },
    { data: actions },
  ] = await Promise.all([
    supabase.from('reports').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    supabase.from('requisitions').select('title,department,seniority,location,working_model,stage,salary_min,salary_max,created_at').eq('company_id', companyId).order('created_at', { ascending: false }),
    supabase.from('candidates').select('full_name,email,requisition_id,client_status,approved_for_client,created_at').eq('company_id', companyId).eq('approved_for_client', true).order('created_at', { ascending: false }),
    supabase.from('compliance_items').select('title,category,status,due_date').eq('company_id', companyId).order('due_date', { ascending: true }),
    supabase.from('actions').select('title,priority,status,due_date,created_at').eq('company_id', companyId).order('created_at', { ascending: false }),
  ]);

  const all = reports ?? [];

  // Prepare CSV export data
  const slug = companyName.toLowerCase().replace(/\s+/g, '-');
  const today = new Date().toISOString().slice(0, 10);

  const reqsCSV = (reqs ?? []).map((r: any) => ({
    Title:         r.title,
    Department:    r.department ?? '',
    Seniority:     r.seniority ?? '',
    Location:      r.location ?? '',
    'Working Model': r.working_model ?? '',
    Stage:         r.stage,
    'Salary Min':  r.salary_min ?? '',
    'Salary Max':  r.salary_max ?? '',
    Created:       new Date(r.created_at).toLocaleDateString('en-GB'),
  }));

  const candsCSV = (candidates ?? []).map((c: any) => ({
    Name:          c.full_name,
    Email:         c.email ?? '',
    'Client Status': c.client_status,
    Submitted:     new Date(c.created_at).toLocaleDateString('en-GB'),
  }));

  const compCSV = (complianceItems ?? []).map((ci: any) => ({
    Title:    ci.title,
    Category: ci.category ?? '',
    Status:   ci.status,
    'Due Date': ci.due_date ? new Date(ci.due_date).toLocaleDateString('en-GB') : '',
  }));

  const actionsCSV = (actions ?? []).map((a: any) => ({
    Title:    a.title,
    Priority: a.priority,
    Status:   a.status,
    'Due Date': a.due_date ? new Date(a.due_date).toLocaleDateString('en-GB') : '',
    Created:  new Date(a.created_at).toLocaleDateString('en-GB'),
  }));

  if (!enabled) {
    return (
        <main className="portal-page flex-1">
          <div className="card p-12">
            <div className="empty-state">
              <BarChart3 size={28} />
              <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>Reports not enabled</p>
              <p className="text-sm max-w-[300px] text-center" style={{ color: 'var(--ink-faint)' }}>
                Regular reporting is available on higher-tier plans. Contact The People Office to upgrade.
              </p>
              <a href="mailto:hello@thepeopleoffice.co.uk?subject=Reports module" className="btn-cta btn-sm mt-1">
                Get in touch
              </a>
            </div>
          </div>
        </main>
    );
  }

  return (
      <main className="portal-page flex-1 space-y-8">

        {/* ── Live CSV Exports ──────────────────────────────── */}
        <div>
          <h2 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>
            CSV Exports
            <span className="ml-2 text-xs font-normal" style={{ color: 'var(--ink-faint)' }}>
              Download your current data as CSV
            </span>
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Active Roles',       count: reqsCSV.length,    data: reqsCSV,    file: `${slug}-roles-${today}`      },
              { label: 'Candidates',         count: candsCSV.length,   data: candsCSV,   file: `${slug}-candidates-${today}` },
              { label: 'Compliance Items',   count: compCSV.length,    data: compCSV,    file: `${slug}-compliance-${today}` },
              { label: 'Actions',            count: actionsCSV.length, data: actionsCSV, file: `${slug}-actions-${today}`    },
            ].map(({ label, count, data, file }) => (
              <div key={label} className="card p-5">
                <p className="font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>{label}</p>
                <p className="text-2xl font-bold mb-3" style={{ color: 'var(--purple)' }}>{count}</p>
                <ExportCSVButton data={data} filename={file} label={`Download ${label}`} />
              </div>
            ))}
          </div>
        </div>

        {/* ── Generated reports ─────────────────────────────── */}
        <div>
          <h2 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>
            Generated Reports
            <span className="ml-2 text-xs font-normal" style={{ color: 'var(--ink-faint)' }}>
              Reports produced by The People Office
            </span>
          </h2>
          {all.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
                No reports yet. Reports generated by The People Office will appear here.
              </p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>Period</th>
                    <th>Generated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((r: any) => (
                    <tr key={r.id}>
                      <td>
                        <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{r.title}</p>
                      </td>
                      <td style={{ color: 'var(--ink-soft)' }}>{r.period ?? '—'}</td>
                      <td style={{ color: 'var(--ink-faint)' }}>{new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td>
                        <a
                          href={r.file_url}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary btn-sm flex items-center gap-1.5"
                        >
                          <Download size={13} /> Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
  );
}
