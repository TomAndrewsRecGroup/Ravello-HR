'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidatePortalPath } from '@/app/actions';
import { CheckCircle2, XCircle, MessageSquare, Loader2, UserPlus } from 'lucide-react';
import HiredModal from './HiredModal';

interface Props {
  candidateId: string;
  candidateName: string;
  currentStatus: string;
  requisitionId: string;
  companyId: string;
  jobTitle?: string;
  department?: string;
}

export default function CandidateFeedbackButton({
  candidateId, candidateName, currentStatus,
  requisitionId, companyId, jobTitle, department,
}: Props) {
  const supabase  = createClient();
  const [loading, setLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [showHired, setShowHired] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(status: string, fb?: string) {
    setLoading(status);
    setError(null);
    try {
      const upd: Record<string, string> = { client_status: status };
      if (fb) upd.client_feedback = fb;
      const { error: err } = await supabase.from('candidates').update(upd).eq('id', candidateId);
      if (err) throw err;
      setDone(true);
      revalidatePortalPath('/hiring');
    } catch (err) {
      console.error('Failed to update candidate feedback:', err);
      setError('Failed to save feedback. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  if (done && !showHired) return (
    <span className="text-xs" style={{ color: 'var(--teal)' }}>Feedback saved ✓</span>
  );

  if (error && !done) {
    return (
      <div>
        <p className="text-xs p-2 rounded-[6px] mb-2" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--red)' }}>{error}</p>
      </div>
    );
  }

  // Approved candidates get a "Hire" button
  if (currentStatus === 'approved' || (done && !showHired)) {
    return (
      <>
        <button
          onClick={() => setShowHired(true)}
          className="btn-cta btn-sm flex items-center gap-1.5"
        >
          <UserPlus size={12} /> Hire
        </button>
        {showHired && (
          <HiredModal
            candidateId={candidateId}
            candidateName={candidateName}
            requisitionId={requisitionId}
            companyId={companyId}
            jobTitle={jobTitle}
            department={department}
            onClose={() => setShowHired(false)}
            onSaved={() => { setDone(true); window.location.reload(); }}
          />
        )}
      </>
    );
  }

  if (currentStatus === 'hired') {
    return <span className="badge badge-filled">Hired</span>;
  }

  if (currentStatus === 'pending') {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => update('approved')}
          disabled={!!loading}
          className="btn-sm flex items-center gap-1.5"
          style={{ background: 'rgba(52,211,153,0.12)', color: 'var(--emerald)', border: '1px solid rgba(52,211,153,0.2)' }}
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
