'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Check, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';

const BAND_STYLE: Record<string, React.CSSProperties> = {
  'Low Friction':      { background: 'rgba(52,211,153,0.14)', color: 'var(--emerald)' },
  'Moderate Friction': { background: 'rgba(245,158,11,0.15)', color: 'var(--amber)' },
  'High Friction':     { background: 'rgba(217,68,68,0.10)',  color: 'var(--rose)' },
};

const SEV_STYLE: Record<string, React.CSSProperties> = {
  critical: { background: 'rgba(217,68,68,0.10)',  color: 'var(--rose)' },
  high:     { background: 'rgba(245,130,11,0.12)', color: 'var(--amber)' },
  medium:   { background: 'rgba(245,158,11,0.10)', color: 'var(--amber)' },
  low:      { background: 'rgba(59,111,255,0.10)', color: 'var(--blue)' },
};

function fmtBytes(bytes: number | null): string {
  if (!bytes) return '-';
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

interface Props {
  company: any;
  assessment: any | null;
  items: any[];
  users: any[];
  documents: any[];
}

export default function FrictionTab({ company, assessment, items: initItems, users, documents }: Props) {
  const supabase = createClient();
  const [items,  setItems]  = useState<any[]>(initItems);
  const [saving, setSaving] = useState<string | null>(null);

  async function toggleItem(item: any) {
    const newCompleted = !item.is_completed;
    setSaving(item.id);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('company_friction_items')
      .update({
        is_completed: newCompleted,
        completed_at: newCompleted ? new Date().toISOString() : null,
        completed_by: newCompleted ? user?.id : null,
      })
      .eq('id', item.id);
    if (!error) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_completed: newCompleted } : i));
      revalidateAdminPath('/clients');
    }
    setSaving(null);
  }

  if (!assessment) {
    return (
      <div className="space-y-4">
        <div className="empty-state">
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
            No Friction Lens assessment yet. The client can complete their assessment from the portal.
          </p>
        </div>
      </div>
    );
  }

  const dims = assessment.dimensions ?? [];
  const completedCount = items.filter((i: any) => i.is_completed).length;
  const totalItems     = items.length;

  // Group items by dimension
  const itemsByDim: Record<string, any[]> = {};
  for (const item of items) {
    if (!itemsByDim[item.dimension]) itemsByDim[item.dimension] = [];
    itemsByDim[item.dimension].push(item);
  }

  return (
    <div className="space-y-6">
      {/* Score overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <span className="badge text-sm px-3 py-1" style={BAND_STYLE[assessment.overall_band] ?? {}}>
            {assessment.overall_band ?? 'Not Scored'}
          </span>
          <p className="text-[10px] mt-2 uppercase tracking-wider font-semibold" style={{ color: 'var(--ink-faint)' }}>Overall Band</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{assessment.employee_count}</p>
          <p className="text-[10px] mt-1 uppercase tracking-wider font-semibold" style={{ color: 'var(--ink-faint)' }}>Employees</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{completedCount}/{totalItems}</p>
          <p className="text-[10px] mt-1 uppercase tracking-wider font-semibold" style={{ color: 'var(--ink-faint)' }}>Items Resolved</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-sm font-medium capitalize" style={{ color: 'var(--ink)' }}>{assessment.confidence ?? '-'}</p>
          <p className="text-[10px] mt-1 uppercase tracking-wider font-semibold" style={{ color: 'var(--ink-faint)' }}>Confidence</p>
        </div>
      </div>

      {/* Top signals */}
      {assessment.top_signals?.length > 0 && (
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-2" style={{ color: 'var(--ink-faint)' }}>Top Signals</p>
          <ul className="space-y-1">
            {assessment.top_signals.map((s: string, i: number) => (
              <li key={i} className="text-sm flex items-start gap-2" style={{ color: 'var(--ink-soft)' }}>
                <span style={{ color: 'var(--gold)' }}>•</span> {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dimension grid */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: 'var(--ink-faint)' }}>Dimensions</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {dims.map((dim: any, i: number) => (
            <div key={i} className="card p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{dim.name}</p>
                <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>{dim.signal_count} signal{dim.signal_count !== 1 ? 's' : ''}</p>
              </div>
              <span className="badge text-xs" style={BAND_STYLE[dim.band] ?? {}}>{dim.band}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Checklist */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: 'var(--ink-faint)' }}>
          Friction Checklist: tick items as you resolve them
        </p>
        {Object.entries(itemsByDim).map(([dim, dimItems]) => (
          <div key={dim} className="mb-4">
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-soft)' }}>{dim}</p>
            <div className="space-y-1">
              {dimItems.map((item: any) => (
                <div key={item.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[var(--surface-soft)] transition-colors">
                  <button
                    onClick={() => toggleItem(item)}
                    disabled={saving === item.id}
                    className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{
                      borderColor: item.is_completed ? 'var(--success)' : 'var(--line)',
                      background: item.is_completed ? 'rgba(22,163,74,0.1)' : 'transparent',
                    }}
                  >
                    {saving === item.id ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : item.is_completed ? (
                      <Check size={10} style={{ color: 'var(--success)' }} />
                    ) : null}
                  </button>
                  <span
                    className="text-sm flex-1"
                    style={{
                      color: item.is_completed ? 'var(--ink-faint)' : 'var(--ink)',
                      textDecoration: item.is_completed ? 'line-through' : 'none',
                    }}
                  >
                    {item.label}
                  </span>
                  {item.severity && (
                    <span className="badge text-[10px]" style={SEV_STYLE[item.severity] ?? {}}>{item.severity}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No friction items identified.</p>
        )}
      </div>

      {/* Users */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: 'var(--ink-faint)' }}>Company Users</p>
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.full_name ?? '-'}</td>
                  <td style={{ color: 'var(--ink-soft)' }}>{u.email}</td>
                  <td><span className="badge">{u.role}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Documents */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--ink-faint)' }}>Uploaded Documents</p>
          <Link
            href={`/documents/upload?company_id=${company.id}`}
            className="btn-cta btn-sm flex items-center gap-1.5"
          >
            <Upload size={12} /> Upload Documents
          </Link>
        </div>
        {documents.length === 0 ? (
          <div className="card p-12 empty-state"><p className="text-sm">No documents yet. Use the Upload button to add the first one.</p></div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Name</th><th>Category</th><th>Size</th><th>Uploaded</th></tr></thead>
              <tbody>
                {documents.map((d: any) => (
                  <tr key={d.id}>
                    <td className="font-medium">{d.name}</td>
                    <td><span className="badge">{d.category}</span></td>
                    <td style={{ color: 'var(--ink-soft)' }}>{fmtBytes(d.file_size)}</td>
                    <td style={{ color: 'var(--ink-soft)' }}>{new Date(d.created_at).toLocaleDateString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assessment date */}
      <p className="text-xs text-right" style={{ color: 'var(--ink-faint)' }}>
        Last assessed: {new Date(assessment.created_at).toLocaleDateString('en-GB')}
      </p>
    </div>
  );
}
