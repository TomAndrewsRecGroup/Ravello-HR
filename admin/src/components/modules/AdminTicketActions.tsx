'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface Props { ticketId: string; currentStatus: string; }

export default function AdminTicketActions({ ticketId, currentStatus }: Props) {
  const supabase = createClient();
  const router   = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function setStatus(status: string) {
    setLoading(status);
    const update: Record<string,string> = { status };
    if (status === 'resolved') update.resolved_at = new Date().toISOString();
    await supabase.from('tickets').update(update).eq('id', ticketId);
    setLoading(null);
    router.refresh();
  }

  if (['resolved','closed'].includes(currentStatus)) return null;

  return (
    <div className="flex gap-2">
      {currentStatus === 'open' && (
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
