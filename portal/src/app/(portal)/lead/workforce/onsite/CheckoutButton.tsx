'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';

// Core-OS 360 Completion Programme, Phase 26, Group 2 (C14.7). A
// manager with workforce.manage may close out ANY open check-in here,
// not only a manual one — the manual/qr_scan distinction only matters
// for how a row was OPENED (migration 195's own RLS policy is
// deliberately not restricted by recorded_via on the update side).
export default function CheckoutButton({ checkinId }: { checkinId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkout() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const res = await supabase
        .from('site_checkins')
        .update({ checked_out_at: new Date().toISOString() }, COUNT_EXACT)
        .eq('id', checkinId);
      const outcome = judgeWrite({ error: res.error, count: res.count });
      if (!outcome.ok) { setError(outcome.message ?? 'Could not check that person out.'); return; }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={checkout}>
        {busy ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />} Check out
      </button>
      {error && <span className="text-xs" style={{ color: 'var(--red)' }}>{error}</span>}
    </span>
  );
}
