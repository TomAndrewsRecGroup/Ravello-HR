'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidatePortalPath } from '@/app/actions';
import { Loader2 } from 'lucide-react';

interface Props {
  itemId: string;
  currentStatus: string;
}

const NEXT_STATUS: Record<string, { label: string; value: string }> = {
  pending:   { label: 'Mark In Review', value: 'in_review' },
  in_review: { label: 'Mark Complete',  value: 'complete'  },
  overdue:   { label: 'Mark In Review', value: 'in_review' },
};

export default function ComplianceStatusButton({ itemId, currentStatus }: Props) {
  const supabase = createClient();
  const [status,  setStatus]  = useState(currentStatus);
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const next = NEXT_STATUS[status];
  if (!next || done) return null;

  async function advance() {
    setLoading(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('compliance_items')
        .update({ status: next.value })
        .eq('id', itemId);
      if (err) throw err;
      setStatus(next.value);
      if (next.value === 'complete') setDone(true);
      revalidatePortalPath('/compliance');
    } catch (err) {
      console.error('Failed to update compliance status:', err);
      setError('Update failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
      onClick={advance}
      disabled={loading}
      className="btn-secondary btn-sm flex-shrink-0 flex items-center gap-1.5"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : null}
      {next.label}
    </button>
      {error && <span className="text-xs" style={{ color: 'var(--red)' }}>{error}</span>}
    </div>
  );
}
