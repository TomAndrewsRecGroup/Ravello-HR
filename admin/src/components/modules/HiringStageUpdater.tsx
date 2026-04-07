'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';
import { Loader2 } from 'lucide-react';
import type { HiringStage } from '@/lib/supabase/types';

const STAGES: HiringStage[] = ['submitted','in_progress','shortlist_ready','interview','offer','filled','cancelled'];

interface Props { reqId: string; currentStage: HiringStage; }

export default function HiringStageUpdater({ reqId, currentStage }: Props) {
  const supabase = createClient();
  const [stage,   setStage]   = useState(currentStage);
  const [loading, setLoading] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStage = e.target.value as HiringStage;
    setStage(newStage);
    setLoading(true);
    await supabase.from('requisitions').update({ stage: newStage, updated_at: new Date().toISOString() }).eq('id', reqId);
    setLoading(false);
    revalidateAdminPath(`/hiring/${reqId}`);
  }

  return (
    <div className="flex items-center gap-2">
      <select value={stage} onChange={handleChange} disabled={loading} className="input text-xs py-1 px-2 w-auto">
        {STAGES.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
      </select>
      {loading && <Loader2 size={13} className="animate-spin" style={{ color: 'var(--purple)' }} />}
    </div>
  );
}
