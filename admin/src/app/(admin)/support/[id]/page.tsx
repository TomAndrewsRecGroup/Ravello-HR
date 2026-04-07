import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import AdminTicketActions from '@/components/modules/AdminTicketActions';
import AdminTicketReply from '@/components/modules/AdminTicketReply';

export const metadata: Metadata = { title: 'Ticket' };
export const revalidate = 30;

export default async function AdminTicketPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: ticket }, { data: messages }] = await Promise.all([
    supabase.from('tickets').select('*, companies(name)').eq('id', params.id).single(),
    supabase.from('ticket_messages').select('*').eq('ticket_id', params.id).order('created_at'),
  ]);
  if (!ticket) notFound();

  const t    = ticket as any;
  const msgs = messages ?? [];
  const prioBadge: Record<string,string>   = { urgent:'badge-urgent',high:'badge-high',normal:'badge-normal',low:'badge-normal' };
  const statusBadge: Record<string,string> = { open:'badge-open',in_progress:'badge-inprogress',resolved:'badge-resolved',closed:'badge-normal' };

  return (
    <>
      <AdminTopbar
        title={t.subject}
        subtitle={t.companies?.name}
        actions={<Link href="/support" className="btn-secondary btn-sm">← All Tickets</Link>}
      />
      <main className="admin-page flex-1 max-w-[800px]">

        {/* Meta + actions */}
        <div className="card p-5 mb-5 flex flex-wrap gap-5 items-center justify-between">
          <div className="flex flex-wrap gap-5">
            <div><p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Status</p><span className={`badge mt-1 ${statusBadge[t.status]}`}>{t.status.replace('_',' ')}</span></div>
            <div><p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Priority</p><span className={`badge mt-1 ${prioBadge[t.priority]}`}>{t.priority}</span></div>
            <div><p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Raised</p><p className="text-sm font-medium mt-0.5">{new Date(t.created_at).toLocaleDateString('en-GB')}</p></div>
          </div>
          <AdminTicketActions ticketId={t.id} currentStatus={t.status} />
        </div>

        {/* Original */}
        <div className="card p-6 mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: 'var(--ink-faint)' }}>Client Query</p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{t.description}</p>
        </div>

        {/* Thread */}
        {msgs.length > 0 && (
          <div className="space-y-3 mb-5">
            {msgs.map((m: any) => {
              const isTPO = m.is_internal || (m.sender_id !== t.submitted_by);
              return (
                <div key={m.id} className="rounded-[12px] p-4"
                  style={{ background: isTPO ? 'rgba(143,114,246,0.06)' : 'var(--surface)', border: `1px solid ${isTPO ? 'rgba(143,114,246,0.15)' : 'var(--line)'}`, marginLeft: isTPO ? '1.5rem' : '0' }}
                >
                  <div className="flex justify-between mb-2">
                    <span className="text-xs font-semibold" style={{ color: isTPO ? 'var(--purple)' : 'var(--teal)' }}>
                      {isTPO ? 'The People Office' : 'Client'}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                      {new Date(m.created_at).toLocaleString('en-GB', { day:'numeric',month:'short',hour:'2-digit',minute:'2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{m.body}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Reply */}
        {!['resolved','closed'].includes(t.status) && (
          <AdminTicketReply ticketId={t.id} userId={user?.id ?? ''} />
        )}
      </main>
    </>
  );
}
