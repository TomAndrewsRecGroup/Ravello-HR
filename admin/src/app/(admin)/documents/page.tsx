import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import { Plus, Download } from 'lucide-react';

export const metadata: Metadata = { title: 'Documents' };
export const revalidate = 30;

const catBadge: Record<string,string> = { contract:'badge-submitted',policy:'badge-inprogress',letter:'badge-shortlist',report:'badge-offer',other:'badge-normal' };

export default async function AdminDocumentsPage() {
  const supabase = createServerSupabaseClient();
  const { data: docs } = await supabase
    .from('documents')
    .select('*, companies(name)')
    .order('created_at', { ascending: false });

  const all = docs ?? [];

  return (
    <>
      <AdminTopbar
        title="Documents"
        subtitle={`${all.length} documents across all clients`}
        actions={<Link href="/documents/upload" className="btn-cta btn-sm flex items-center gap-1.5"><Plus size={13}/>Upload Document</Link>}
      />
      <main className="admin-page flex-1">
        {all.length === 0 ? (
          <div className="card p-12 empty-state">No documents uploaded yet. <Link href="/documents/upload" className="btn-cta mt-2">Upload first document</Link></div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Client</th><th>Category</th><th>Version</th><th>Review Due</th><th></th></tr>
              </thead>
              <tbody>
                {all.map((d: any) => {
                  const due    = d.review_due_at ? new Date(d.review_due_at) : null;
                  const days   = due ? Math.ceil((due.getTime() - Date.now()) / 86400000) : null;
                  const urgent = days !== null && days <= 7;
                  return (
                    <tr key={d.id}>
                      <td className="font-medium">{d.name}</td>
                      <td style={{ color: 'var(--ink-soft)' }}>{d.companies?.name}</td>
                      <td><span className={`badge ${catBadge[d.category]}`}>{d.category}</span></td>
                      <td style={{ color: 'var(--ink-faint)' }}>v{d.version}</td>
                      <td style={{ color: urgent ? 'var(--red)' : 'var(--ink-faint)' }}>
                        {due ? due.toLocaleDateString('en-GB', { day:'numeric',month:'short',year:'numeric' }) : '—'}
                        {urgent && <span className="ml-1 text-[10px]">⚠</span>}
                      </td>
                      <td>
                        <a href={d.file_url} download target="_blank" rel="noopener noreferrer" className="btn-icon" aria-label="Download">
                          <Download size={14} />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
