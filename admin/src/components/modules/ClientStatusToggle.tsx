'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';
import { judgeWrite, COUNT_EXACT } from '@/lib/supabase/mutations';

interface Props { companyId: string; currentActive: boolean; }

export default function ClientStatusToggle({ companyId, currentActive }: Props) {
  const supabase = createClient();
  const [active, setActive] = useState(currentActive);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function toggle() {
    setLoading(true);
    const newVal = !active;
    const { error, count } = await supabase
      .from('companies').update({ active: newVal }, COUNT_EXACT).eq('id', companyId);
    setLoading(false);
    const outcome = judgeWrite({ error, count }, 'The client status');
    if (!outcome.ok) { setError(outcome.message); return; }
    setError(null);
    setActive(newVal);
    revalidateAdminPath(`/clients/${companyId}`);
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        onClick={toggle}
        disabled={loading}
        className={`badge ${active ? 'badge-active' : 'badge-inactive'} cursor-pointer hover:opacity-80 transition-opacity`}
      >
        {loading ? '…' : active ? 'Active' : 'Inactive'}
      </button>
      {error && (
        <span className="text-xs" style={{ color: 'var(--red)' }}>{error}</span>
      )}
    </span>
  );
}
