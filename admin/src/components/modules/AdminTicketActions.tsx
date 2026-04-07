'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';

interface Props { ticketId: string; currentStatus: string; }

export default function AdminTicketActions({ ticketId, currentStatus }: Props) {
  const supabase = createClient();
  const [status, setCurrentStatus] = useState(currentStatus);
  const [loading, setLoading] = useState<string | null>(null);

  async function setStatus(newStatus: string) {
    setLoading(newStatus);
    const update: Record<string,string> = { status: newStatus };
    if (newStatus === 'resolved') update.resolved_at = new Date().toISOString();
    await supabase.from('tickets').update(update).eq('id', ticketId);
    setCurrentStatus(newStatus);
    setLoading(null);
    revalidateAdminPath(`/support/${ticketId}`);
  }

  if (['resolved','closed'].includes(status)) return null;

  return (
    <div className="flex gap-2">
      {status === 'open' && (
        <button onClick={() => setStatus('in_progress')} disabled={!!loading} className="btn-secondary btn-sm">
          {loading === 'in_progress' ? '…' : 'Mark In Progress'}
        </button>
      )}
      <button onClick={() => setStatus('resolved')} disabled={!!loading} className="btn-cta btn-sm">
        {loading === 'resolved' ? '…' : 'Mark Resolved'}
      </button>
      <button onClick={() => setStatus('closed')} disabled={!!loading} className="btn-ghost btn-sm">
        {loading === 'closed' ? '…' : 'Close'}
      </button>
    </div>
  );
}
