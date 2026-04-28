'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { revalidatePortalPath } from '@/app/actions';
import { CheckCircle, Clock, Loader2 } from 'lucide-react';

interface Props {
  actionId: string;
  onMutated?: () => void;
}

// Mark-complete + snooze for actions on /protect/actions.
//
// Goes through a server route so the mutation isn't silently lost on
// any RLS edge case (the previous direct-supabase update sometimes
// returned data:null with no error, leaving the user thinking they'd
// clicked but nothing changed). After a successful PATCH we kick a
// router.refresh() so the next render re-queries the actions list and
// the row drops out without a full reload.
export default function ActionButtons({ actionId, onMutated }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [completing, setCompleting] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [done, setDone] = useState<'complete' | 'dismissed' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function patch(op: 'complete' | 'dismiss_7d'): Promise<boolean> {
    const res = await fetch(`/api/actions/${actionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'Update failed. Please try again.');
      return false;
    }
    return true;
  }

  async function handleComplete() {
    setCompleting(true);
    setError(null);
    const ok = await patch('complete');
    setCompleting(false);
    if (!ok) return;
    setDone('complete');
    onMutated?.();
    revalidatePortalPath('/protect/actions');
    revalidatePortalPath('/dashboard');
    startTransition(() => router.refresh());
  }

  async function handleDismiss() {
    setDismissing(true);
    setError(null);
    const ok = await patch('dismiss_7d');
    setDismissing(false);
    if (!ok) return;
    setDone('dismissed');
    onMutated?.();
    revalidatePortalPath('/protect/actions');
    revalidatePortalPath('/dashboard');
    startTransition(() => router.refresh());
  }

  if (done === 'complete') {
    return (
      <p className="text-xs flex items-center gap-1 mt-3" style={{ color: 'var(--teal)' }}>
        <CheckCircle size={12} /> Marked complete
      </p>
    );
  }

  if (done === 'dismissed') {
    return (
      <p className="text-xs flex items-center gap-1 mt-3" style={{ color: 'var(--ink-faint)' }}>
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
