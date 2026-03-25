import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import { BarChart3, ExternalLink } from 'lucide-react';
import ReportUploadForm from './ReportUploadForm';

export const metadata: Metadata = { title: 'Reports' };

export default async function AdminReportsPage() {
  const supabase = createServerSupabaseClient();

  const [reportsRes, companiesRes] = await Promise.all([
    supabase
      .from('reports')
      .select('*, companies(id,name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('companies')
      .select('id,name')
      .eq('active', true)
      .order('name'),
  ]);

  const reports   = reportsRes.data   ?? [];
  const companies = companiesRes.data ?? [];

  return (
    <>
      <AdminTopbar
        title="Reports"
        subtitle="Upload and manage client reports"
      />
      <main className="admin-page flex-1">
        <div className="grid lg:grid-cols-[1fr_360px] gap-6">

          {/* Report list */}
          <section>
            <div className="card overflow-hidden">
              {reports.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16">
                  <BarChart3 size={28} style={{ color: 'var(--ink-faint)' }} />
                  <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No reports uploaded yet</p>
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
                          <Link
                            href={`/clients/${(r.companies as any)?.id}`}
                            className="font-medium hover:underline"
                            style={{ color: 'var(--purple)' }}
                          >
                            {(r.companies as any)?.name ?? '—'}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--ink)' }}>{r.title}</td>
                        <td className="px-4 py-3" style={{ color: 'var(--ink-soft)' }}>{r.period ?? '—'}</td>
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
