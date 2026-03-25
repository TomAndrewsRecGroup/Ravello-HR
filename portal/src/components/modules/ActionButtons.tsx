'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle, Clock, Loader2 } from 'lucide-react';

interface Props {
  actionId: string;
  onMutated?: () => void;
}

export default function ActionButtons({ actionId, onMutated }: Props) {
  const supabase = createClient();
  const [completing, setCompleting] = useState(false);
  const [dismissing,  setDismissing]  = useState(false);
  const [done, setDone] = useState<'complete' | 'dismissed' | null>(null);

  async function handleComplete() {
    setCompleting(true);
    await supabase
      .from('actions')
      .update({ status: 'complete', completed_at: new Date().toISOString() })
      .eq('id', actionId);
    setDone('complete');
    setCompleting(false);
    onMutated?.();
    // Remove card from view after short delay
    setTimeout(() => window.location.reload(), 600);
  }

  async function handleDismiss() {
    setDismissing(true);
    const until = new Date();
    until.setDate(until.getDate() + 7);
    await supabase
      .from('actions')
      .update({ dismiss_until: until.toISOString() })
      .eq('id', actionId);
    setDone('dismissed');
    setDismissing(false);
    onMutated?.();
    setTimeout(() => window.location.reload(), 600);
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
    <div className="flex items-center gap-2 mt-3">
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
  );
}
