'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import {
  BarChart2, Building2, Plug, Target, Bug, Lightbulb, HelpCircle,
  Loader2, Send, ChevronDown, AlertTriangle, ArrowLeft,
} from 'lucide-react';

/* ─── Category config ─── */
const CATEGORIES = [
  { value: 'friction_lens_role',     label: 'Friction Lens — Role Analysis', Icon: BarChart2,  color: '#a855f7' },
  { value: 'friction_lens_business', label: 'Friction Lens — Business Form', Icon: Building2,  color: '#06b6d4' },
  { value: 'score_connection',       label: 'Score Connection',               Icon: Plug,       color: '#f59e0b' },
  { value: 'bd_leads',              label: 'BD Leads',                       Icon: Target,     color: '#10b981' },
  { value: 'bug_report',            label: 'Bug Report',                     Icon: Bug,        color: '#ef4444' },
  { value: 'feature_request',       label: 'Feature Request',                Icon: Lightbulb,  color: '#3b82f6' },
  { value: 'general',               label: 'General',                        Icon: HelpCircle, color: '#6b7280' },
] as const;

const STATUS_COLORS: Record<string, string> = {
  open: '#f59e0b', in_progress: '#00d4ff', resolved: '#10b981', closed: '#6b7280',
};

function categoryMeta(cat: string) {
  return CATEGORIES.find(c => c.value === cat) ?? CATEGORIES[6];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function IvyLensSupportPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'create' | 'list'>('list');
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  // Create form
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState('normal');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function fetchTickets() {
    try {
      const res = await fetch('/api/support/tickets');
      const data = await res.json();
      setTickets(data?.tickets ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => { fetchTickets(); }, []);

  // Poll for updates every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/support/poll').catch(() => {});
      fetchTickets();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true); setError(''); setSuccess('');
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message, category, priority }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create ticket');
      setSuccess('Ticket submitted — we\'ll get back to you.');
      setSubject(''); setMessage(''); setCategory(''); setPriority('normal');
      setTab('list');
      fetchTickets();
    } catch (err: any) {
      setError(err.message);
    }
    setCreating(false);
  }

  const filtered = filter === 'all' ? tickets : tickets.filter((t: any) => t.status === filter);
  const openCount = tickets.filter((t: any) => t.status === 'open' || t.status === 'in_progress').length;

  return (
    <>
      <Topbar
        title="IvyLens Support"
        subtitle={`${openCount} open ticket${openCount !== 1 ? 's' : ''}`}
        actions={
          <Link href="/support" className="btn-secondary btn-sm flex items-center gap-1.5">
            <ArrowLeft size={13} /> Local Tickets
          </Link>
        }
      />
      <main className="portal-page flex-1 max-w-[840px]">

        {/* Success banner */}
        {success && (
          <div className="card p-4 mb-5 flex items-center gap-2" style={{ background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.2)' }}>
            <span className="text-sm font-medium" style={{ color: '#047857' }}>{success}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-[10px]" style={{ background: 'var(--surface-alt)' }}>
          <button
            onClick={() => setTab('list')}
            className="flex-1 py-2 rounded-[8px] text-sm font-medium transition-all"
            style={{
              background: tab === 'list' ? 'var(--surface)' : 'transparent',
              color: tab === 'list' ? 'var(--ink)' : 'var(--ink-faint)',
              boxShadow: tab === 'list' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            My Tickets {tickets.length > 0 && `(${tickets.length})`}
          </button>
          <button
            onClick={() => setTab('create')}
            className="flex-1 py-2 rounded-[8px] text-sm font-medium transition-all"
            style={{
              background: tab === 'create' ? 'var(--surface)' : 'transparent',
              color: tab === 'create' ? 'var(--ink)' : 'var(--ink-faint)',
              boxShadow: tab === 'create' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            Create Ticket
          </button>
        </div>

        {/* ─── CREATE TAB ─── */}
        {tab === 'create' && (
          <form onSubmit={handleCreate} className="card p-6 space-y-5">
            <div>
              <label className="label">Category *</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                {CATEGORIES.map(c => {
                  const active = category === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(c.value)}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-left transition-all text-sm"
                      style={{
                        background: active ? `${c.color}14` : 'var(--surface-alt)',
                        border: `1.5px solid ${active ? c.color : 'transparent'}`,
                        color: active ? c.color : 'var(--ink-soft)',
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      <c.Icon size={15} style={{ color: c.color, flexShrink: 0 }} />
                      <span className="text-xs leading-tight">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="label">Subject *</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="input"
                placeholder="Brief summary of the issue"
                required
              />
            </div>

            <div>
              <label className="label">Description * <span className="font-normal text-xs" style={{ color: 'var(--ink-faint)' }}>min 20 chars</span></label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="input h-28 resize-none"
                placeholder="Describe the issue in detail. Include any role titles, scores, or error messages you saw."
                required
                minLength={20}
              />
            </div>

            <div>
              <label className="label">Priority</label>
              <div className="flex gap-2 mt-1">
                {['low', 'normal', 'high'].map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className="px-4 py-2 rounded-[8px] text-sm font-medium transition-all capitalize"
                    style={{
                      background: priority === p
                        ? p === 'high' ? 'rgba(239,68,68,0.12)' : p === 'low' ? 'rgba(59,111,255,0.08)' : 'rgba(124,58,237,0.08)'
                        : 'var(--surface-alt)',
                      color: priority === p
                        ? p === 'high' ? '#dc2626' : p === 'low' ? '#3b82f6' : 'var(--purple)'
                        : 'var(--ink-faint)',
                      border: `1.5px solid ${priority === p ? (p === 'high' ? '#ef444440' : p === 'low' ? '#3b82f640' : '#7c3aed30') : 'transparent'}`,
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.08)', color: '#E05555' }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={creating || !category || !subject.trim() || message.trim().length < 20}
              className="btn-cta flex items-center gap-2"
            >
              {creating ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : <><Send size={14} /> Submit Ticket</>}
            </button>
          </form>
        )}

        {/* ─── LIST TAB ─── */}
        {tab === 'list' && (
          <div className="space-y-4">
            {/* Filter pills */}
            <div className="flex gap-2 flex-wrap">
              {['all', 'open', 'in_progress', 'resolved', 'closed'].map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="px-3 py-1.5 rounded-[8px] text-xs font-medium transition-all capitalize"
                  style={{
                    background: filter === f ? 'var(--ink)' : 'var(--surface-alt)',
                    color: filter === f ? '#fff' : 'var(--ink-faint)',
                  }}
                >
                  {f === 'all' ? 'All' : f.replace('_', ' ')}
                  {f !== 'all' && ` (${tickets.filter((t: any) => t.status === f).length})`}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin" style={{ color: 'var(--purple)' }} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="card p-10 text-center">
                <HelpCircle size={28} style={{ color: 'var(--ink-faint)', margin: '0 auto 12px' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  {filter !== 'all' ? `No ${filter.replace('_', ' ')} tickets` : 'No tickets yet'}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
                  Create a ticket to get help from IvyLens support.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((t: any) => {
                  const cat = categoryMeta(t.category);
                  const CatIcon = cat.Icon;
                  return (
                    <Link
                      key={t.id}
                      href={`/support/ivylens/${t.id}`}
                      className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow"
                    >
                      <div
                        className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
                        style={{ background: `${cat.color}14` }}
                      >
                        <CatIcon size={16} style={{ color: cat.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{t.subject}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-medium" style={{ color: cat.color }}>{cat.label}</span>
                          <span className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>{timeAgo(t.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {t.priority === 'high' && (
                          <span className="badge text-[10px]" style={{ background: 'rgba(239,68,68,0.10)', color: '#dc2626' }}>High</span>
                        )}
                        <span
                          className="badge text-[10px] capitalize"
                          style={{
                            background: `${STATUS_COLORS[t.status] ?? '#6b7280'}18`,
                            color: STATUS_COLORS[t.status] ?? '#6b7280',
                          }}
                        >
                          {t.status?.replace('_', ' ')}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
