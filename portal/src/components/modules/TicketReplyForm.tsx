'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Props { ticketId: string; userId: string; }

export default function TicketReplyForm({ ticketId, userId }: Props) {
  const supabase = createClient();
  const router   = useRouter();
  const [body,    setBody]    = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

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
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5">
      <label className="label mb-2">Add a reply</label>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={3}
        required
        className="input mb-3"
        placeholder="Your message…"
      />
      {error && <p className="text-xs mb-3 p-2 rounded-[6px]" style={{ background: 'rgba(239,68,68,0.08)', color: '#E05555' }}>{error}</p>}
      <button type="submit" disabled={loading || !body.trim()} className="btn-cta btn-sm flex items-center gap-2">
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
        {loading ? 'Sending…' : 'Send Reply'}
      </button>
    </form>
  );
}
