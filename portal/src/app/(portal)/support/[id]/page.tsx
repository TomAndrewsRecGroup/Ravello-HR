import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import TicketReplyForm from '@/components/modules/TicketReplyForm';

export const metadata: Metadata = { title: 'Ticket' };

const priorityBadge: Record<string,string> = { urgent:'badge-urgent', high:'badge-high', normal:'badge-normal', low:'badge-low' };
const statusBadge:   Record<string,string> = { open:'badge-open', in_progress:'badge-inprogress', resolved:'badge-resolved', closed:'badge-normal' };

export default async function TicketDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { user } = await getSessionProfile();
  const [{ data: ticket }, { data: messages }] = await Promise.all([
    supabase.from('tickets').select('id, subject, status, priority, description, created_at, resolved_at').eq('id', params.id).single(),
    supabase.from('ticket_messages').select('id, sender_id, body, created_at').eq('ticket_id', params.id).eq('is_internal', false).order('created_at'),
  ]);

  if (!ticket) notFound();
  const t   = ticket as any;
  const msgs = messages ?? [];

  return (
    <>
      <Topbar
        title={t.subject}
        subtitle={`Ticket — ${t.status.replace('_',' ')}`}
        actions={<Link href="/support" className="btn-secondary btn-sm">← All Tickets</Link>}
      />
      <main className="portal-page flex-1 max-w-[740px]">

        {/* Meta */}
        <div className="card p-5 mb-5 flex flex-wrap gap-5 items-center">
          <div><p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Status</p><span className={`badge mt-1 ${statusBadge[t.status]}`}>{t.status.replace('_',' ')}</span></div>
          <div><p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Priority</p><span className={`badge mt-1 ${priorityBadge[t.priority]}`}>{t.priority}</span></div>
          <div><p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Raised</p><p className="text-sm font-medium mt-0.5" style={{ color: 'var(--ink)' }}>{new Date(t.created_at).toLocaleDateString('en-GB')}</p></div>
          {t.resolved_at && <div><p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Resolved</p><p className="text-sm font-medium mt-0.5" style={{ color: 'var(--ink)' }}>{new Date(t.resolved_at).toLocaleDateString('en-GB')}</p></div>}
        </div>

        {/* Original message */}
        <div className="card p-6 mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: 'var(--ink-faint)' }}>Original Query</p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{t.description}</p>
        </div>

        {/* Thread */}
        {msgs.length > 0 && (
          <div className="space-y-3 mb-5">
            {msgs.map((m: any) => (
              <div
                key={m.id}
                className="rounded-[12px] p-4"
                style={{
                  background: m.sender_id === user?.id ? 'rgba(143,114,246,0.06)' : 'var(--surface)',
                  border: `1px solid ${m.sender_id === user?.id ? 'rgba(143,114,246,0.15)' : 'var(--line)'}`,
                  marginLeft: m.sender_id === user?.id ? '0' : '1.5rem',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold" style={{ color: m.sender_id === user?.id ? 'var(--purple)' : 'var(--teal)' }}>
                    {m.sender_id === user?.id ? 'You' : 'The People Office'}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                    {new Date(m.created_at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                  </span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{m.body}</p>
              </div>
            ))}
          </div>
        )}

        {/* Reply */}
        {!['resolved','closed'].includes(t.status) && (
          <TicketReplyForm ticketId={t.id} userId={user?.id ?? ''} />
        )}
      </main>
    </>
  );
}
