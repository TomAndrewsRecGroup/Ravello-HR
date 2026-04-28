'use client';
import { useEffect, useState } from 'react';
import { CheckSquare, Square, Send, Loader2, CheckCircle2, X, AlertTriangle } from 'lucide-react';
import type { CompanyRef } from '@/lib/supabase/types';

import { ACTION_TYPE_LABELS, labelFor } from '@/lib/ui/statusMaps';
interface Props { companies: CompanyRef[] }

const ACTION_TYPES = [
  'compliance_update', 'policy_change', 'document_review', 'training_required',
  'information_request', 'deadline_reminder', 'general',
];
const PRIORITIES = ['high', 'normal', 'low'];

export default function BroadcastClient({ companies }: Props) {
  const active = companies.filter(c => c.active);

  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    title: '', description: '', action_type: 'compliance_update',
    priority: 'normal', due_date: '',
  });
  const [sending,  setSending]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [error,    setError]    = useState('');
  // Confirmation modal — broadcasting to multiple clients is destructive
  // (creates a row in every client's actions table), so a typed confirm
  // step prevents accidental mass sends.
  const [confirming, setConfirming] = useState(false);

  function toggleAll() {
    if (selected.size === active.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(active.map(c => c.id)));
    }
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openConfirm() {
    if (!selected.size || !form.title || !form.action_type) return;
    setError('');
    setConfirming(true);
  }

  async function send() {
    setSending(true); setError('');
    try {
      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, company_ids: Array.from(selected) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setSent(true);
      setSelected(new Set());
      setForm({ title: '', description: '', action_type: 'compliance_update', priority: 'normal', due_date: '' });
      setConfirming(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  // Esc to close + body scroll lock while modal is open
  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) setConfirming(false); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [confirming, sending]);

  const selectedClients = active.filter(c => selected.has(c.id));

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6">

      {/* Left: compose */}
      <div className="space-y-5">
        <div className="card p-6">
          <h2 className="font-display font-semibold text-sm mb-5" style={{ color: 'var(--ink)' }}>Compose Action</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Title *</label>
              <input
                className="input"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Complete annual data protection training"
              />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="input"
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional guidance or context for this action…"
              />
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="label">Type</label>
                <select className="input" value={form.action_type} onChange={e => setForm(f => ({ ...f, action_type: e.target.value }))}>
                  {ACTION_TYPES.map(t => (
                    <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Priority</label>
                <select className="input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Due Date</label>
                <input className="input" type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="card p-4" style={{ borderLeft: '3px solid var(--red)', color: 'var(--red)', background: 'rgba(217,68,68,0.04)' }}>
            {error}
          </div>
        )}

        {sent && (
          <div
            className="card p-4 flex items-center gap-2"
            style={{ borderLeft: '3px solid var(--success)', color: 'var(--emerald)', background: 'rgba(22,163,74,0.06)' }}
          >
            <CheckCircle2 size={16} />
            Action broadcast sent successfully.
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
            {selected.size} client{selected.size !== 1 ? 's' : ''} selected
          </p>
          <button
            className="btn-cta flex items-center gap-2 whitespace-nowrap"
            disabled={!selected.size || !form.title || sending}
            onClick={openConfirm}
          >
            <Send size={14} />
            Send to {selected.size || '0'} client{selected.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>

      {/* Right: client selector */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
            Recipients
          </h2>
          <button
            onClick={toggleAll}
            className="flex items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--purple)' }}
          >
            {selected.size === active.length
              ? <><CheckSquare size={13} /> Deselect all</>
              : <><Square size={13} /> Select all ({active.length})</>
            }
          </button>
        </div>
        <div className="space-y-1">
          {active.map(c => {
            const on = selected.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] text-left transition-colors"
                style={{
                  background: on ? 'rgba(124,58,237,0.07)' : 'transparent',
                  border:     `1px solid ${on ? 'rgba(124,58,237,0.2)' : 'transparent'}`,
                }}
              >
                {on
                  ? <CheckSquare size={14} style={{ color: 'var(--purple)', flexShrink: 0 }} />
                  : <Square      size={14} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />}
                <span className="text-sm" style={{ color: on ? 'var(--ink)' : 'var(--ink-soft)' }}>{c.name}</span>
              </button>
            );
          })}
          {active.length === 0 && (
            <p className="text-sm text-center py-6" style={{ color: 'var(--ink-faint)' }}>No active clients.</p>
          )}
        </div>
      </div>

      {/* Confirmation modal */}
      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm broadcast"
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(7,11,32,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget && !sending) setConfirming(false); }}
        >
          <div
            className="card p-0 w-full max-w-lg overflow-hidden"
            style={{ background: 'var(--surface)', boxShadow: '0 24px 64px rgba(7,11,32,0.30)' }}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--line)' }}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,0.10)' }}>
                  <AlertTriangle size={17} style={{ color: '#D97706' }} />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-base" style={{ color: 'var(--ink)' }}>
                    Confirm broadcast to {selectedClients.length} client{selectedClients.length !== 1 ? 's' : ''}
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                    This creates a new action in each selected client&rsquo;s portal. It cannot be undone in bulk.
                  </p>
                </div>
              </div>
              <button
                onClick={() => !sending && setConfirming(false)}
                disabled={sending}
                aria-label="Cancel"
                className="btn-icon"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              {/* Action preview */}
              <div className="rounded-[10px] p-4" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--ink-faint)' }}>Action</p>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{form.title}</p>
                {form.description && (
                  <p className="text-xs mt-1.5" style={{ color: 'var(--ink-soft)' }}>{form.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--bg)', color: 'var(--ink-soft)', border: '1px solid var(--line)' }}>
                    {labelFor(ACTION_TYPE_LABELS, form.action_type)}
                  </span>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--bg)', color: 'var(--ink-soft)', border: '1px solid var(--line)' }}>
                    {form.priority} priority
                  </span>
                  {form.due_date && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--bg)', color: 'var(--ink-soft)', border: '1px solid var(--line)' }}>
                      due {form.due_date}
                    </span>
                  )}
                </div>
              </div>

              {/* Recipient list */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-faint)' }}>
                  Going to ({selectedClients.length})
                </p>
                <div className="rounded-[10px] max-h-48 overflow-y-auto" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
                  {selectedClients.map((c, i) => (
                    <div
                      key={c.id}
                      className="px-3 py-2 text-sm"
                      style={{ color: 'var(--ink)', borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}
                    >
                      {c.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--line)', background: 'var(--surface-soft)' }}>
              <button
                onClick={() => setConfirming(false)}
                disabled={sending}
                className="btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={send}
                disabled={sending}
                className="btn-cta btn-sm flex items-center gap-2"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {sending ? 'Sending…' : `Send to ${selectedClients.length} client${selectedClients.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
