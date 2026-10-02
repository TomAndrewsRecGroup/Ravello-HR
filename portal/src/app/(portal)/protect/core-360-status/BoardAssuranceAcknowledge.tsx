'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// Core-OS 360 Phase 13, Group 2. Records that a board member has read
// and reviewed this ISSUED report — an insert-only sign-off
// (board_assurance_acknowledgements, migration 178). company_id,
// acknowledged_by and acknowledged_by_name are all derived server-side
// by board_assurance_acknowledgements_fill(), never sent from here; a
// duplicate click is refused by the table's own UNIQUE (report_id,
// acknowledged_by), surfaced below as a plain message rather than a
// pre-check this component would have to keep in step with the
// database's own rule. The exact RamsAcknowledge.tsx pattern.
export default function BoardAssuranceAcknowledge({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().from('board_assurance_acknowledgements').insert({
      report_id: reportId,
      comment: comment.trim() || null,
    });
    setBusy(false);
    if (error) {
      setMsg({
        ok: false,
        text: error.code === '23505' ? 'You have already acknowledged this report.' : error.message,
      });
      return;
    }
    setComment('');
    setOpen(false);
    setMsg({ ok: true, text: 'Acknowledgement recorded.' });
    router.refresh();
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
          Acknowledge this report
        </button>
        {msg && <p className="text-xs" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="block">
        <span className="label">Comment (optional)</span>
        <textarea
          className="input" rows={2} maxLength={2000}
          value={comment} onChange={e => setComment(e.target.value)}
          placeholder="Any note the record should carry alongside your acknowledgement"
        />
      </label>
      {msg && <p className="text-xs" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</p>}
      <div className="flex gap-2">
        <button className="btn-cta btn-sm" disabled={busy}>
          {busy && <Loader2 size={14} className="animate-spin" />} Confirm acknowledgement
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
