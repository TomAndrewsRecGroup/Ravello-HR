'use client';
import { useMemo, useState } from 'react';
import { FileText, Send, Ban, Loader2 } from 'lucide-react';
import FileLink from '@/components/modules/FileLink';
import { useToast } from '@/components/modules/Toast';
import {
  DOCUMENT_INSTANCE_STATUS_LABELS, DOCUMENT_INSTANCE_STATUSES,
  type DocumentInstance, type DocumentInstanceStatus,
} from '@/lib/documentTemplates/types';

interface Props {
  initialInstances: DocumentInstance[];
  employeeNames: Record<string, string>;
  companyNames: Record<string, string>;
}

const STATUS_COLOUR: Record<DocumentInstanceStatus, string> = {
  draft: 'var(--ink-faint)',
  sent_for_signature: 'var(--gold)',
  signed: 'var(--teal)',
  declined: 'var(--red)',
  voided: 'var(--ink-faint)',
};

function fmt(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function InstancesClient({ initialInstances, employeeNames, companyNames }: Props) {
  const { toast } = useToast();
  const [instances, setInstances] = useState(initialInstances);
  const [statusFilter, setStatusFilter] = useState<DocumentInstanceStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return instances.filter(i => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = `${i.rendered_title} ${employeeNames[i.employee_id] ?? ''} ${companyNames[i.company_id] ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [instances, statusFilter, search, employeeNames, companyNames]);

  async function act(id: string, action: 'resend' | 'void') {
    setBusy(`${action}:${id}`);
    try {
      const res = await fetch(`/api/admin/document-templates/${id}/${action}`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast(body.error ?? `Could not ${action} this document.`, 'error'); return; }
      if (action === 'void') {
        setInstances(prev => prev.map(i => i.id === id ? { ...i, status: 'voided' } : i));
      }
      toast(action === 'resend' ? 'A new sign link has been sent.' : 'Document voided.', 'success');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value as DocumentInstanceStatus | 'all')}>
          <option value="all">All statuses</option>
          {DOCUMENT_INSTANCE_STATUSES.map(s => <option key={s} value={s}>{DOCUMENT_INSTANCE_STATUS_LABELS[s]}</option>)}
        </select>
        <input
          className="input flex-1 min-w-[200px]"
          placeholder="Search by document, employee or client…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card empty-state p-10">
          <FileText size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
            {search || statusFilter !== 'all' ? 'No documents match your filters.' : 'No documents have been sent yet.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop / tablet table — a phone card list sits beside it,
              putting View/Resend/Void within thumb reach. */}
          <div className="hidden md:block overflow-x-auto card">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  {['Document', 'Employee', 'Client', 'Status', 'Last activity', ''].map(h => (
                    <th key={h} className="pb-2.5 pt-3 px-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(i => (
                  <tr key={i.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td className="py-3 px-3 font-medium" style={{ color: 'var(--ink)' }}>{i.rendered_title}</td>
                    <td className="py-3 px-3" style={{ color: 'var(--ink-soft)' }}>{employeeNames[i.employee_id] ?? '—'}</td>
                    <td className="py-3 px-3" style={{ color: 'var(--ink-soft)' }}>{companyNames[i.company_id] ?? '—'}</td>
                    <td className="py-3 px-3">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(7,11,29,0.06)', color: STATUS_COLOUR[i.status] }}>
                        {DOCUMENT_INSTANCE_STATUS_LABELS[i.status]}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-xs" style={{ color: 'var(--ink-faint)' }}>
                      {fmt(i.declined_at ?? i.signed_at ?? i.voided_at ?? i.sent_for_signature_at ?? i.created_at)}
                    </td>
                    <td className="py-3 px-3">
                      <RowActions i={i} busy={busy} onAct={act} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-card-list">
            {filtered.map(i => (
              <div key={i.id} className="mobile-card">
                <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{i.rendered_title}</p>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Employee</span>
                  <span className="mobile-card-value">{employeeNames[i.employee_id] ?? '—'}</span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Client</span>
                  <span className="mobile-card-value">{companyNames[i.company_id] ?? '—'}</span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Status</span>
                  <span className="mobile-card-value" style={{ color: STATUS_COLOUR[i.status] }}>{DOCUMENT_INSTANCE_STATUS_LABELS[i.status]}</span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Last activity</span>
                  <span className="mobile-card-value">{fmt(i.declined_at ?? i.signed_at ?? i.voided_at ?? i.sent_for_signature_at ?? i.created_at)}</span>
                </div>
                <div className="mobile-card-actions">
                  <RowActions i={i} busy={busy} onAct={act} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RowActions({ i, busy, onAct }: {
  i: DocumentInstance;
  busy: string | null;
  onAct: (id: string, action: 'resend' | 'void') => void;
}) {
  const resendBusy = busy === `resend:${i.id}`;
  const voidBusy = busy === `void:${i.id}`;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {i.storage_path && (
        <FileLink kind="document_instance" id={i.id} storagePath={i.storage_path} className="btn-ghost btn-sm">
          View PDF
        </FileLink>
      )}
      {i.status === 'sent_for_signature' && (
        <button className="btn-secondary btn-sm" disabled={resendBusy} onClick={() => onAct(i.id, 'resend')}>
          {resendBusy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Resend
        </button>
      )}
      {(i.status === 'draft' || i.status === 'sent_for_signature') && (
        <button className="btn-icon btn-sm" disabled={voidBusy} title="Void" aria-label="Void" style={{ color: 'var(--red)' }} onClick={() => onAct(i.id, 'void')}>
          {voidBusy ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />}
        </button>
      )}
    </div>
  );
}
