import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import { FolderOpen, Download, Clock } from 'lucide-react';
import type { DocCategory } from '@/lib/supabase/types';

export const metadata: Metadata = { title: 'Documents' };

const CATEGORIES: { key: DocCategory | 'all'; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'contract', label: 'Contracts' },
  { key: 'policy',   label: 'Policies' },
  { key: 'letter',   label: 'Letters' },
  { key: 'report',   label: 'Reports' },
  { key: 'other',    label: 'Other' },
];

function catBadge(cat: string) {
  const m: Record<string, string> = {
    contract: 'badge-submitted', policy: 'badge-inprogress',
    letter: 'badge-shortlist', report: 'badge-offer', other: 'badge-normal',
  };
  return m[cat] ?? 'badge-normal';
}

function fileSize(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes/1024).toFixed(0)}KB`;
  return `${(bytes/(1024*1024)).toFixed(1)}MB`;
}

export default async function DocumentsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user?.id ?? '').single();
  const companyId: string = (profile as any)?.company_id ?? '';

  const { data: docs } = await supabase
    .from('documents')
    .select('*')
    .eq('company_id', companyId)
    .order('category')
    .order('name');

  const allDocs = docs ?? [];

  // Group by category
  const byCategory: Record<string, typeof allDocs> = {};
  for (const cat of ['contract','policy','letter','report','other']) {
    byCategory[cat] = allDocs.filter((d: any) => d.category === cat);
  }

  return (
    <>
      <Topbar title="Documents" subtitle={`${allDocs.length} document${allDocs.length !== 1 ? 's' : ''} stored`} />
      <main className="portal-page flex-1">

        {allDocs.length === 0 ? (
          <div className="card p-12">
            <div className="empty-state">
              <FolderOpen size={28} />
              <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No documents yet</p>
              <p className="text-sm max-w-[300px]" style={{ color: 'var(--ink-faint)' }}>
                Ravello will upload documents here as they are created or shared with you.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {CATEGORIES.filter(c => c.key !== 'all' && byCategory[c.key]?.length > 0).map((cat) => (
              <section key={cat.key}>
                <h2 className="font-display font-semibold text-sm mb-3" style={{ color: 'var(--ink)' }}>
                  {cat.label}
                  <span className="ml-2 text-xs font-normal" style={{ color: 'var(--ink-faint)' }}>({byCategory[cat.key].length})</span>
                </h2>
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Category</th>
                        <th>Version</th>
                        <th>Size</th>
                        <th>Review Due</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {byCategory[cat.key].map((d: any) => {
                        const due   = d.review_due_at ? new Date(d.review_due_at) : null;
                        const days  = due ? Math.ceil((due.getTime() - Date.now()) / 86400000) : null;
                        const overdue = days !== null && days < 0;
                        const soon    = days !== null && days >= 0 && days <= 14;
                        return (
                          <tr key={d.id}>
                            <td>
                              <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{d.name}</p>
                              {d.notes && <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{d.notes}</p>}
                            </td>
                            <td><span className={`badge ${catBadge(d.category)}`}>{d.category}</span></td>
                            <td style={{ color: 'var(--ink-faint)' }}>v{d.version}</td>
                            <td style={{ color: 'var(--ink-faint)' }}>{fileSize(d.file_size)}</td>
                            <td>
                              {due ? (
                                <span className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-500' : soon ? 'text-amber-500' : ''}`} style={!overdue && !soon ? { color: 'var(--ink-faint)' } : undefined}>
                                  <Clock size={11} />
                                  {overdue ? 'Overdue' : due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                              ) : '—'}
                            </td>
                            <td>
                              <a
                                href={d.file_url}
                                download
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-icon"
                                aria-label="Download"
                              >
                                <Download size={14} />
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
