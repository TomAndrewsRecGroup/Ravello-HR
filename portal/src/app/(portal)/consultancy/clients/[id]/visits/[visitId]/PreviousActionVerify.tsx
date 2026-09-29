'use client';

// Core-OS 360 Phase 7, Group 4 ("verify previous actions"). Extends the
// Pre-Visit Brief's read-only "Previous visit" action list (Group 2)
// with the two moves an action in awaiting_verification can legally
// take. actions_consultancy_update (175, portfolio-wide RLS) plus the
// existing actions_lifecycle()/actions_party_guard() triggers are the
// real authorization/validation boundary — including "nobody verifies
// their own work" — this component only presents the two allowed moves
// and surfaces whatever the database refuses, verbatim.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import type { PreVisitBriefAction } from '@/lib/consultancy/preVisitBrief';

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export default function PreviousActionVerify({ action }: { action: PreVisitBriefAction }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'verify' | 'reject' | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  async function verify() {
    setBusy('verify');
    setError('');
    const supabase = createClient();
    const res = await supabase.from('actions').update({ status: 'complete' }, COUNT_EXACT).eq('id', action.id);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    setBusy(null);
    if (!outcome.ok) { setError(outcome.message ?? 'Could not verify this action'); return; }
    router.refresh();
  }

  async function reject() {
    if (!reason.trim()) { setError('Say why this is not verified.'); return; }
    setBusy('reject');
    setError('');
    const supabase = createClient();
    const res = await supabase.from('actions')
      .update({ status: 'in_progress', verification_rejection_reason: reason.trim() }, COUNT_EXACT).eq('id', action.id);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    setBusy(null);
    if (!outcome.ok) { setError(outcome.message ?? 'Could not send this action back'); return; }
    setRejecting(false);
    router.refresh();
  }

  return (
    <li>
      {action.title} — <strong>{action.status}</strong>{action.due_date ? ` (due ${fmt(action.due_date)})` : ''}
      {action.status === 'awaiting_verification' && (
        <span className="ml-2 inline-flex items-center gap-2">
          <button type="button" className="btn-ghost btn-sm" disabled={busy !== null} onClick={verify}>
            {busy === 'verify' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Verify
          </button>
          <button type="button" className="btn-ghost btn-sm" disabled={busy !== null} onClick={() => setRejecting(v => !v)}>
            <RotateCcw size={12} /> Send back
          </button>
        </span>
      )}
      {rejecting && (
        <div className="mt-1 flex items-center gap-2">
          <input className="input" style={{ maxWidth: 320 }} placeholder="Why is this not verified?" value={reason} onChange={e => setReason(e.target.value)} />
          <button type="button" className="btn-secondary btn-sm" disabled={busy !== null} onClick={reject}>
            {busy === 'reject' && <Loader2 size={12} className="animate-spin" />} Confirm send back
          </button>
        </div>
      )}
      {error && <p className="text-xs mt-1" style={{ color: 'var(--red)' }}>{error}</p>}
    </li>
  );
}
