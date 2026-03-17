'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle2, XCircle, MessageSquare, Loader2 } from 'lucide-react';

interface Props {
  candidateId: string;
  currentStatus: string;
}

export default function CandidateFeedbackButton({ candidateId, currentStatus }: Props) {
  const supabase  = createClient();
  const [loading, setLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [done,    setDone]    = useState(false);

  async function update(status: string, fb?: string) {
    setLoading(status);
    const update: Record<string, string> = { client_status: status };
    if (fb) update.client_feedback = fb;
    await supabase.from('candidates').update(update).eq('id', candidateId);
    setLoading(null);
    setDone(true);
  }

  if (done) return (
    <span className="text-xs" style={{ color: 'var(--teal)' }}>Feedback saved ✓</span>
  );

  if (currentStatus === 'pending') {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => update('approved')}
          disabled={!!loading}
          className="btn-sm flex items-center gap-1.5"
          style={{ background: 'rgba(52,211,153,0.12)', color: '#047857', border: '1px solid rgba(52,211,153,0.2)' }}
        >
          {loading === 'approved' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
          Approve
        </button>
        <button
          onClick={() => update('rejected')}
          disabled={!!loading}
          className="btn-sm flex items-center gap-1.5"
          style={{ background: 'rgba(239,68,68,0.08)', color: '#B91C1C', border: '1px solid rgba(239,68,68,0.15)' }}
        >
          {loading === 'rejected' ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
          Not right
        </button>
        <button
          onClick={() => setShowInput(!showInput)}
          className="btn-sm flex items-center gap-1.5 btn-ghost"
        >
          <MessageSquare size={12} /> Request info
        </button>
        {showInput && (
          <div className="w-full flex gap-2 mt-1">
            <input
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              className="input text-xs py-1.5 flex-1"
              placeholder="What would you like to know?"
            />
            <button
              onClick={() => update('info_requested', feedback)}
              disabled={!feedback || !!loading}
              className="btn-cta btn-sm"
            >
              Send
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
}
