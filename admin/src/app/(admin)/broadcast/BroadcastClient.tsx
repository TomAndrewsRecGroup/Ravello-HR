'use client';
import { useState } from 'react';
import { CheckSquare, Square, Send, Loader2, CheckCircle2 } from 'lucide-react';

interface Company { id: string; name: string; active: boolean; }

interface Props { companies: Company[] }

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

  async function send() {
    if (!selected.size || !form.title || !form.action_type) return;
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
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6">

      {/* Left — compose */}
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
            className="btn-cta flex items-center gap-2"
            disabled={!selected.size || !form.title || sending}
            onClick={send}
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Broadcast to {selected.size || '…'} client{selected.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>

      {/* Right — client selector */}
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
    </div>
  );
}
