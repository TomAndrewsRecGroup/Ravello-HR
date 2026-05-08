import type { Metadata } from 'next';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { Plus, FileText, Eye } from 'lucide-react';

export const metadata: Metadata = { title: 'Development Plans' };
export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', active: 'Active', completed: 'Completed', archived: 'Archived',
};

export default async function DevPlansPage() {
  const supabase = createServerSupabaseClient();
  const [{ data: plans }, { data: templates }] = await Promise.all([
    supabase
      .from('dev_plans')
      .select('id, title, status, assigned_at, created_at, athlete:athlete_id (full_name), company:company_id (name)')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('dev_plan_templates').select('id', { count: 'exact', head: true }),
  ]);

  type Row = {
    id: string;
    title: string;
    status: keyof typeof STATUS_LABELS;
    assigned_at: string | null;
    created_at: string;
    athlete: { full_name: string } | { full_name: string }[] | null;
    company: { name: string } | { name: string }[] | null;
  };
  const rows = ((plans ?? []) as unknown as Row[]).map(r => ({
    ...r,
    athlete_name: Array.isArray(r.athlete) ? r.athlete[0]?.full_name : r.athlete?.full_name,
    company_name: Array.isArray(r.company) ? r.company[0]?.name : r.company?.name,
  }));

  return (
    <>
      <AdminTopbar
        title="Development Plans"
        subtitle="Reusable, branded development plans for athletes and other client contacts."
      />
      <main className="admin-page flex-1 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dev-plans/new" className="btn-cta">
            <Plus size={14} /> New plan
          </Link>
          <Link href="/dev-plans/templates" className="btn-secondary">
            <FileText size={14} /> Templates ({templates ? '' : 0})
          </Link>
        </div>

        <div className="card p-0">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Athlete</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Assigned</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="empty-state">No plans yet — create your first one.</td></tr>
                ) : rows.map(r => (
                  <tr key={r.id}>
                    <td><Link href={`/dev-plans/${r.id}`} className="font-semibold" style={{ color: 'var(--purple)' }}>{r.title}</Link></td>
                    <td>{r.athlete_name ?? <span style={{ color: 'var(--ink-faint)' }}>—</span>}</td>
                    <td>{r.company_name ?? <span style={{ color: 'var(--ink-faint)' }}>—</span>}</td>
                    <td><span className="badge">{STATUS_LABELS[r.status] ?? r.status}</span></td>
                    <td>{r.assigned_at ? new Date(r.assigned_at).toLocaleDateString('en-GB') : <span style={{ color: 'var(--ink-faint)' }}>—</span>}</td>
                    <td className="text-right whitespace-nowrap">
                      <Link href={`/dev-plans/${r.id}/preview`} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm" title="Open preview in a new tab">
                        <Eye size={12} /> Preview
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}
