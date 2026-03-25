'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, ExternalLink, Loader2, AlertCircle } from 'lucide-react';

interface Props {
  company: any;
  onClose: () => void;
}

const STATUS_OPTIONS = ['Prospect', 'Contacted', 'Client', 'Not Relevant'];

function fmtSalary(min: number | null, max: number | null): string {
  if (!min && !max) return '—';
  const fmt = (n: number) => `£${(n / 1000).toFixed(0)}k`;
  if (min && max && min !== max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt((min ?? max)!);
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BDCompanyModal({ company, onClose }: Props) {
  const supabase = createClient();

  const [roles,        setRoles]        = useState<any[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [status,       setStatus]       = useState<string>(company.status ?? 'Prospect');
  const [notes,        setNotes]        = useState<string>(company.notes ?? '');
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingNotes,  setSavingNotes]  = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchRoles() {
      setLoadingRoles(true);
      const { data } = await supabase
        .from('bd_scanned_roles')
        .select('*')
        .eq('company_id', company.id)
        .order('scanned_at', { ascending: false });
      setRoles(data ?? []);
      setLoadingRoles(false);
    }
    fetchRoles();
  }, [company.id]);

  // Close on overlay click
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleStatusChange(newStatus: string) {
    setStatus(newStatus);
    setSavingStatus(true);
    await supabase.from('bd_companies').update({ status: newStatus }).eq('id', company.id);
    setSavingStatus(false);
  }

  async function handleNotesSave() {
    setSavingNotes(true);
    await supabase.from('bd_companies').update({ notes }).eq('id', company.id);
    setSavingNotes(false);
  }

  async function handleMarkAsClient() {
    await handleStatusChange('Client');
  }

  const showInsight = (company.total_roles_seen ?? 0) >= 3;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(7,11,29,0.55)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="card w-full max-w-3xl max-h-[88vh] flex flex-col"
        style={{ boxShadow: '0 24px 64px rgba(7,11,29,0.28)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b" style={{ borderColor: 'var(--line)' }}>
          <div>
            <h2 className="font-display font-bold text-lg" style={{ color: 'var(--ink)' }}>
              {company.company_name ?? 'Unknown Company'}
            </h2>
            {company.domain && (
              <a
                href={`https://${company.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs flex items-center gap-1 mt-0.5"
                style={{ color: 'var(--purple)' }}
              >
                {company.domain} <ExternalLink size={10} />
              </a>
            )}
          </div>
          <button onClick={onClose} className="btn-icon ml-4"><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Insight banner */}
          {showInsight && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-[10px]"
              style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.18)' }}>
              <AlertCircle size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--purple)' }} />
              <p className="text-sm" style={{ color: 'var(--purple)' }}>
                <strong>Active hiring</strong> — potential HIRE Foundations or Embedded client
              </p>
            </div>
          )}

          {/* Status + notes */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Status</label>
              <div className="flex items-center gap-2">
                <select
                  className="input"
                  value={status}
                  onChange={e => handleStatusChange(e.target.value)}
                  disabled={savingStatus}
                >
                  {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                </select>
                {savingStatus && <Loader2 size={14} className="animate-spin shrink-0" style={{ color: 'var(--purple)' }} />}
              </div>
            </div>

            <div>
              <label className="label">Total Roles Seen</label>
              <p className="text-2xl font-bold font-display mt-1" style={{ color: 'var(--ink)' }}>
                {company.total_roles_seen ?? 0}
              </p>
            </div>
          </div>

          <div>
            <label className="label">BD Notes</label>
            <textarea
              className="input h-24 resize-none"
              placeholder="Add notes about this prospect…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={handleNotesSave}
            />
            {savingNotes && (
              <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--ink-faint)' }}>
                <Loader2 size={10} className="animate-spin" /> Saving…
              </p>
            )}
          </div>

          {/* Roles table */}
          <div>
            <h3 className="font-display font-semibold text-sm mb-3" style={{ color: 'var(--ink)' }}>
              Scanned Roles
            </h3>
            {loadingRoles ? (
              <div className="flex items-center justify-center py-8 gap-2" style={{ color: 'var(--ink-faint)' }}>
                <Loader2 size={16} className="animate-spin" /> Loading roles…
              </div>
            ) : roles.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: 'var(--ink-faint)' }}>No roles scanned yet.</p>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Role Title</th>
                      <th>Salary</th>
                      <th>Location</th>
                      <th>Model</th>
                      <th>Source</th>
                      <th>Scanned</th>
                      <th>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map((r: any) => (
                      <tr key={r.id}>
                        <td className="font-medium">
                          <div className="flex items-center gap-2">
                            {r.role_title ?? '—'}
                            {!r.still_active && (
                              <span className="badge badge-inactive text-[10px]">Closed</span>
                            )}
                          </div>
                        </td>
                        <td style={{ color: 'var(--ink-soft)' }}>{fmtSalary(r.salary_min, r.salary_max)}</td>
                        <td style={{ color: 'var(--ink-soft)' }}>{r.location ?? '—'}</td>
                        <td style={{ color: 'var(--ink-soft)' }}>{r.working_model ?? '—'}</td>
                        <td style={{ color: 'var(--ink-faint)' }}>{r.source_board ?? '—'}</td>
                        <td style={{ color: 'var(--ink-faint)' }}>{fmtDate(r.scanned_at)}</td>
                        <td>
                          {r.source_url ? (
                            <a
                              href={r.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-icon"
                              title="Open listing"
                            >
                              <ExternalLink size={13} />
                            </a>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--line)', background: 'var(--surface-soft)' }}>
          <button
            onClick={handleMarkAsClient}
            disabled={savingStatus || status === 'Client'}
            className="btn-cta btn-sm"
          >
            {savingStatus ? <Loader2 size={12} className="animate-spin" /> : null}
            Mark as Client
          </button>
          <button
            onClick={() => {
              const note = window.prompt('Add a BD note:');
              if (note) setNotes(prev => (prev ? `${prev}\n${note}` : note));
            }}
            className="btn-secondary btn-sm"
          >
            Add BD Note
          </button>
          <button
            onClick={onClose}
            className="btn-ghost btn-sm ml-auto"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
