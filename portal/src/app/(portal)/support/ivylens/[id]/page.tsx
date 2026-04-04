'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import {
  BarChart2, Building2, Plug, Target, Bug, Lightbulb, HelpCircle,
  Loader2, Send, ArrowLeft, User, Headphones,
} from 'lucide-react';

const CATEGORIES: Record<string, { label: string; Icon: any; color: string }> = {
  friction_lens_role:     { label: 'Friction Lens — Role',     Icon: BarChart2,  color: '#a855f7' },
  friction_lens_business: { label: 'Friction Lens — Business', Icon: Building2,  color: '#06b6d4' },
  score_connection:       { label: 'Score Connection',          Icon: Plug,       color: '#f59e0b' },
  bd_leads:              { label: 'BD Leads',                  Icon: Target,     color: '#10b981' },
  bug_report:            { label: 'Bug Report',                Icon: Bug,        color: '#ef4444' },
  feature_request:       { label: 'Feature Request',           Icon: Lightbulb,  color: '#3b82f6' },
  general:               { label: 'General',                   Icon: HelpCircle, color: '#6b7280' },
};

const STATUS_COLORS: Record<string, string> = {
  open: '#f59e0b', in_progress: '#00d4ff', resolved: '#10b981', closed: '#6b7280',
};

export default function IvyLensTicketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const ticketId = params.id as string;
  const bottomRef = useRef<HTMLDivElement>(null);

  const [ticket, setTicket] = useState<any>(null);
  const [responses, setResponses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Reply
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState('');

  async function fetchTicket() {
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load ticket');
      setTicket(data.ticket);
      setResponses(data.responses ?? []);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  }

  useEffect(() => { fetchTicket(); }, [ticketId]);

  useEffect(() => {
    if (responses.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [responses.length]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true); setReplyError('');
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to send reply');
      }
      setReply('');
      fetchTicket();
    } catch (err: any) {
      setReplyError(err.message);
    }
    setSending(false);
  }

  if (loading) {
    return (
      <>
        <Topbar title="Loading…" />
        <main className="portal-page flex-1 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--purple)' }} />
        </main>
      </>
    );
  }

  if (error || !ticket) {
    return (
      <>
        <Topbar title="Ticket" actions={<Link href="/support/ivylens" className="btn-secondary btn-sm"><ArrowLeft size={13} /> Back</Link>} />
        <main className="portal-page flex-1">
          <div className="card p-6 text-center">
            <p className="text-sm" style={{ color: 'var(--red)' }}>{error || 'Ticket not found'}</p>
          </div>
        </main>
      </>
    );
  }

  const cat = CATEGORIES[ticket.category] ?? CATEGORIES.general;
  const CatIcon = cat.Icon;

  return (
    <>
      <Topbar
        title={ticket.subject}
        subtitle="IvyLens Support Ticket"
        actions={<Link href="/support/ivylens" className="btn-secondary btn-sm"><ArrowLeft size={13} /> All Tickets</Link>}
      />
      <main className="portal-page flex-1 max-w-[740px]">

        {/* Meta */}
        <div className="card p-5 mb-5 flex flex-wrap gap-5 items-center">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-[8px] flex items-center justify-center" style={{ background: `${cat.color}14` }}>
              <CatIcon size={14} style={{ color: cat.color }} />
            </div>
            <span className="text-xs font-medium" style={{ color: cat.color }}>{cat.label}</span>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Status</p>
            <span className="badge mt-0.5 text-xs capitalize" style={{ background: `${STATUS_COLORS[ticket.status]}18`, color: STATUS_COLORS[ticket.status] }}>
              {ticket.status?.replace('_', ' ')}
            </span>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Priority</p>
            <span className="text-sm font-medium capitalize mt-0.5 block" style={{ color: ticket.priority === 'high' ? '#dc2626' : 'var(--ink)' }}>
              {ticket.priority}
            </span>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Created</p>
            <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--ink)' }}>
              {new Date(ticket.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
          {ticket.reference_id && (
            <div>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Reference</p>
              <code className="text-xs font-mono mt-0.5 block" style={{ color: 'var(--purple)' }}>{ticket.reference_id}</code>
            </div>
          )}
        </div>

        {/* Original message */}
        <div className="card p-6 mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: 'var(--ink-faint)' }}>
            Original Message
          </p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>
            {ticket.message}
          </p>
        </div>

        {/* Conversation thread */}
        {responses.length > 0 && (
          <div className="space-y-3 mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--ink-faint)' }}>
              Conversation ({responses.length})
            </p>
            {responses.map((r: any) => {
              const isAdmin = r.author_type === 'admin';
              return (
                <div
                  key={r.id}
                  className="rounded-[12px] p-4"
                  style={{
                    background: isAdmin ? 'rgba(124,58,237,0.05)' : 'rgba(6,182,212,0.05)',
                    border: `1px solid ${isAdmin ? 'rgba(124,58,237,0.12)' : 'rgba(6,182,212,0.12)'}`,
                    marginLeft: isAdmin ? '0' : 'auto',
                    marginRight: isAdmin ? 'auto' : '0',
                    maxWidth: '85%',
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      {isAdmin ? <Headphones size={12} style={{ color: 'var(--purple)' }} /> : <User size={12} style={{ color: '#06b6d4' }} />}
                      <span className="text-xs font-semibold" style={{ color: isAdmin ? 'var(--purple)' : '#06b6d4' }}>
                        {r.author_name ?? (isAdmin ? 'IvyLens Support' : 'You')}
                      </span>
                    </div>
                    <span className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                      {new Date(r.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>
                    {r.message}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <div ref={bottomRef} />

        {/* Reply form */}
        {ticket.status !== 'closed' && (
          <form onSubmit={handleReply} className="card p-4 flex gap-3 items-end">
            <div className="flex-1">
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                className="input h-20 resize-none text-sm"
                placeholder="Type your reply…"
              />
              {replyError && <p className="text-xs mt-1" style={{ color: '#E05555' }}>{replyError}</p>}
            </div>
            <button
              type="submit"
              disabled={sending || !reply.trim()}
              className="btn-cta btn-sm flex items-center gap-1.5 flex-shrink-0"
            >
              {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Send
            </button>
          </form>
        )}

        {ticket.status === 'closed' && (
          <div className="card p-4 text-center">
            <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>This ticket is closed.</p>
          </div>
        )}
      </main>
    </>
  );
}
