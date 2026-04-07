'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';
import { Loader2, Send } from 'lucide-react';

interface Props { ticketId: string; userId: string; }

export default function AdminTicketReply({ ticketId, userId }: Props) {
  const supabase = createClient();
  const [body,    setBody]    = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [sent,    setSent]    = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    const { error: err } = await supabase.from('ticket_messages').insert({
      ticket_id:   ticketId,
      sender_id:   userId,
      body:        body.trim(),
      is_internal: false,
    });
    if (err) { setError(err.message); setLoading(false); return; }
    setBody('');
    setLoading(false);
    setSent(true);
    setTimeout(() => setSent(false), 3000);
    revalidateAdminPath(`/support/${ticketId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5">
      <p className="label mb-2">Reply to client</p>
      <textarea value={body} onChange={e=>setBody(e.target.value)} rows={3} required className="input mb-3" placeholder="Write your response…" />
      {error && <p className="text-xs mb-3 p-2 rounded-[6px]" style={{ background: 'rgba(239,68,68,0.08)', color: '#E05555' }}>{error}</p>}
      <button type="submit" disabled={loading || !body.trim()} className="btn-cta btn-sm flex items-center gap-2">
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
        {loading ? 'Sending…' : 'Send to Client'}
      </button>
    </form>
  );
}
