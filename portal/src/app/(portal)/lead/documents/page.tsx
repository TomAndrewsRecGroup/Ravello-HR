import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import DocumentUpload from '@/components/modules/DocumentUpload';
import {
  FolderOpen, Download, CheckCircle, ChevronDown,
} from 'lucide-react';

export const metadata: Metadata = { title: 'Documents' };
export const revalidate = 60;

const CATEGORY_GROUPS: { key: string; label: string }[] = [
  { key: 'contract',      label: 'Contracts'      },
  { key: 'policy',        label: 'Policies'        },
  { key: 'handbook',      label: 'Handbooks'       },
  { key: 'template',      label: 'Templates'       },
  { key: 'role_pack',     label: 'Role Packs'      },
  { key: 'meeting_notes', label: 'Meeting Notes'   },
  { key: 'strategic_plan',label: 'Strategic Plans' },
  { key: 'other',         label: 'Other'           },
  { key: 'letter',        label: 'Letters'         },
  { key: 'report',        label: 'Reports'         },
];

function catBadgeClass(cat: string): string {
  const m: Record<string, string> = {
    contract:       'badge-admin',
    policy:         'badge-staff',
    handbook:       'badge-normal',
    template:       'badge-normal',
    role_pack:      'badge-normal',
    meeting_notes:  'badge-normal',
    strategic_plan: 'badge-normal',
    letter:         'badge-normal',
    report:         'badge-normal',
    compliance:     'badge-active',
    other:          'badge-inactive',
  };
  return m[cat] ?? 'badge-normal';
}

function statusBadge(status: string, requiresApproval: boolean, approvedAt: string | null): React.ReactNode {
  if (requiresApproval && !approvedAt) {
    return <span className="badge badge-pending">Pending Approval</span>;
  }
  if (status === 'archived') {
    return <span className="badge badge-normal">Archived</span>;
  }
  return <span className="badge badge-filled">Active</span>;
}

function fileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// Detect the display category from file_path (stored as {company_id}/{uiCategory}/...)
function detectDisplayCategory(doc: any): string {
  if (doc.file_path) {
    const parts = doc.file_path.split('/');
    if (parts.length >= 2) {
      const seg = parts[1];
      if (CATEGORY_GROUPS.some(g => g.key === seg)) return seg;
    }
  }
  return doc.category;
}

export default async function DocumentsPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId } = await getSessionProfile();

  const { data: docs } = await supabase
    .from('documents')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  const allDocs = docs ?? [];

  // Group docs: use file_path segment to identify UI category, fall back to db category
  const grouped: Record<string, any[]> = {};
  for (const g of CATEGORY_GROUPS) grouped[g.key] = [];

  for (const d of allDocs) {
    const displayCat = detectDisplayCategory(d);
    if (grouped[displayCat] !== undefined) {
      grouped[displayCat].push(d);
    } else {
      grouped['other'].push(d);
    }
  }

  const nonEmptyGroups = CATEGORY_GROUPS.filter(g => grouped[g.key].length > 0);

  return (
      <main className="portal-page flex-1">

        {/* Upload form — client component */}
        <DocumentUpload companyId={companyId} userId={user?.id ?? ''} />

        {/* Document list */}
        {allDocs.length === 0 ? (
          <div className="card p-12">
            <div className="empty-state">
              <FolderOpen size={28} />
              <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No documents yet</p>
              <p className="text-sm max-w-[300px]" style={{ color: 'var(--ink-faint)' }}>
                Upload your first document above, or The People Office will share documents with you here.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {nonEmptyGroups.map((group) => {
              const groupDocs = grouped[group.key];
              return (
                <details key={group.key} className="card overflow-hidden" open>
                  <summary
                    className="flex items-center gap-2 px-5 py-4 cursor-pointer select-none"
                    style={{ listStyle: 'none' }}
                  >
                    <ChevronDown
                      size={14}
                      style={{ color: 'var(--ink-faint)' }}
                      className="transition-transform details-chevron flex-shrink-0"
                    />
                    <span className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                      {group.label}
                    </span>
                    <span
                      className="text-xs font-normal ml-1"
                      style={{ color: 'var(--ink-faint)' }}
                    >
                      ({groupDocs.length})
                    </span>
                  </summary>

                  <div className="table-wrapper border-t" style={{ borderColor: 'var(--line)' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Category</th>
                          <th>Version</th>
                          <th>Size</th>
                          <th>Uploaded</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupDocs.map((d: any) => (
                          <tr key={d.id}>
                            <td>
                              <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>
                                {d.name}
                              </p>
                              {d.requires_approval && d.approved_at && (
                                <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'var(--teal)' }}>
                                  <CheckCircle size={10} />
                                  Approved {new Date(d.approved_at).toLocaleDateString('en-GB')}
                                </p>
                              )}
                            </td>
                            <td>
                              <span className={`badge ${catBadgeClass(d.category)}`}>
                                {d.category}
                              </span>
                            </td>
                            <td style={{ color: 'var(--ink-faint)' }}>
                              v{d.version ?? 1}
                            </td>
                            <td style={{ color: 'var(--ink-faint)' }}>
                              {fileSize(d.file_size)}
                            </td>
                            <td style={{ color: 'var(--ink-faint)' }}>
                              {new Date(d.created_at).toLocaleDateString('en-GB', {
                                day: 'numeric', month: 'short', year: 'numeric',
                              })}
                            </td>
                            <td>
                              {statusBadge(d.status, d.requires_approval, d.approved_at)}
                            </td>
                            <td>
                              <div className="flex items-center gap-2">
                                <a
                                  href={d.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn-secondary btn-sm flex items-center gap-1.5"
                                  aria-label="Download"
                                >
                                  <Download size={12} />
                                  Download
                                </a>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </main>
  );
}
