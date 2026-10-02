'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// Required Acknowledgement on Broadcasts (go-live gap list, item 2).
// A plain session insert under RLS — company_id/acknowledged_by/
// acknowledged_by_name/acknowledged_at are ALL derived server-side by
// broadcast_acknowledgements_fill() (206), never sent from here, the
// same RamsAcknowledge.tsx/BoardAssuranceAcknowledge.tsx pattern. The
// database refuses this for any action that was not raised by a
// broadcast (created_by_admin = true) — this button is only ever
// rendered for one, so that refusal should never actually surface.
export default function AcknowledgeBroadcastButton({ actionId, acknowledged }: { actionId: string; acknowledged: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(acknowledged);
  const [error, setError] = useState<string | null>(null);

  async function acknowledge() {
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().from('broadcast_acknowledgements').insert({ action_id: actionId });
    setBusy(false);
    if (err) {
      setError(err.code === '23505' ? 'You have already acknowledged this.' : err.message);
      if (err.code === '23505') setDone(true);
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs mt-2" style={{ color: 'var(--teal)' }}>
        <CheckCircle2 size={13} /> Acknowledged
      </span>
    );
  }

  return (
    <div className="mt-2">
      <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={acknowledge}>
        {busy && <Loader2 size={13} className="animate-spin" />} Acknowledge
      </button>
      {error && <p className="text-xs mt-1" style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  );
}
