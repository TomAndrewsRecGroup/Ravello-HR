'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';
import { Loader2 } from 'lucide-react';
import type { HiringStage } from '@/lib/supabase/types';
import { judgeWrite, COUNT_EXACT } from '@/lib/supabase/mutations';

const STAGES: HiringStage[] = ['submitted','in_progress','shortlist_ready','interview','offer','filled','cancelled'];

interface Props { reqId: string; currentStage: HiringStage; }

export default function HiringStageUpdater({ reqId, currentStage }: Props) {
  const supabase = createClient();
  const [stage,   setStage]   = useState(currentStage);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStage = e.target.value as HiringStage;
    const previous = stage;
    setStage(newStage);
    setLoading(true);
    setError(null);
    // This checked NOTHING — not even `error`. The dropdown moved and
    // the row might not have.
    const { error: err, count } = await supabase
      .from('requisitions')
      .update({ stage: newStage, updated_at: new Date().toISOString() }, COUNT_EXACT)
      .eq('id', reqId);
    setLoading(false);
    const outcome = judgeWrite({ error: err, count }, 'The stage change');
    if (!outcome.ok) {
      // Put the control back where the data actually is.
      setStage(previous);
      setError(outcome.message);
      return;
    }
    revalidateAdminPath(`/hiring/${reqId}`);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <select value={stage} onChange={handleChange} disabled={loading} className="input text-xs py-1 px-2 w-auto">
          {STAGES.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
        </select>
        {loading && <Loader2 size={13} className="animate-spin" style={{ color: 'var(--purple)' }} />}
      </div>
      {error && (
        <span className="text-xs" style={{ color: 'var(--red)' }}>{error}</span>
      )}
    </div>
  );
}
