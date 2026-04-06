'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle, Clock, Loader2 } from 'lucide-react';

interface Props {
  actionId: string;
  onMutated?: () => void;
}

export default function ActionButtons({ actionId, onMutated }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [completing, setCompleting] = useState(false);
  const [dismissing,  setDismissing]  = useState(false);
  const [done, setDone] = useState<'complete' | 'dismissed' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleComplete() {
    setCompleting(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('actions')
        .update({ status: 'complete', completed_at: new Date().toISOString() })
        .eq('id', actionId);
      if (err) throw err;
      setDone('complete');
      onMutated?.();
      router.refresh();
    } catch (err) {
      console.error('Failed to complete action:', err);
      setError('Failed to mark complete. Please try again.');
    } finally {
      setCompleting(false);
    }
  }

  async function handleDismiss() {
    setDismissing(true);
    setError(null);
    try {
      const until = new Date();
      until.setDate(until.getDate() + 7);
      const { error: err } = await supabase
        .from('actions')
        .update({ dismiss_until: until.toISOString() })
        .eq('id', actionId);
      if (err) throw err;
      setDone('dismissed');
      onMutated?.();
      router.refresh();
    } catch (err) {
      console.error('Failed to dismiss action:', err);
      setError('Failed to dismiss. Please try again.');
    } finally {
      setDismissing(false);
    }
  }

  if (done === 'complete') {
    return (
      <p className="text-xs flex items-center gap-1" style={{ color: 'var(--teal)' }}>
        <CheckCircle size={12} /> Marked complete
      </p>
    );
  }

  if (done === 'dismissed') {
    return (
      <p className="text-xs flex items-center gap-1" style={{ color: 'var(--ink-faint)' }}>
        <Clock size={12} /> Dismissed for 7 days
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 mt-3">
      {error && (
        <p className="text-xs p-2 rounded-[6px]" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--red)' }}>{error}</p>
      )}
      <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleComplete}
        disabled={completing || dismissing}
        className="btn-cta btn-sm flex items-center gap-1.5"
      >
        {completing
          ? <Loader2 size={12} className="animate-spin" />
          : <CheckCircle size={12} />
        }
        Mark Complete
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        disabled={completing || dismissing}
        className="btn-secondary btn-sm flex items-center gap-1.5"
      >
        {dismissing
          ? <Loader2 size={12} className="animate-spin" />
          : <Clock size={12} />
        }
        Dismiss 7 days
      </button>
      </div>
    </div>
  );
}
