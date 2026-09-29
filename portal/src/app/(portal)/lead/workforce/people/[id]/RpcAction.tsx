'use client';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// One button for every decision the database makes through a function
// (134): verify / reject evidence, suspend / reinstate a competency or an
// authorisation, revoke an authorisation, decide a pre-employment check.
// The RPC checks the capability, refuses self-verification and decides
// the race; this only asks, and shows the database's own words when it
// says no. Only the functions listed here can be called.

const ALLOWED = ['workforce_verify', 'competency_suspend', 'competency_reinstate', 'authorisation_suspend',
  'authorisation_reinstate', 'authorisation_revoke', 'pre_employment_check_decide'] as const;
export type ProfileRpc = typeof ALLOWED[number];

export default function RpcAction({ rpc, args, label, reasonParam, reasonMin = 3, reasonLabel = 'Reason', tone = 'secondary', done = 'Done.' }: {
  rpc: ProfileRpc;
  args: Record<string, string | null>;
  label: string;
  /** When set, a reason is asked for and sent under this parameter name. */
  reasonParam?: string;
  reasonMin?: number;
  reasonLabel?: string;
  tone?: 'primary' | 'secondary' | 'danger';
  done?: string;
}) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    if (!(ALLOWED as readonly string[]).includes(rpc)) return;
    if (reasonParam && reason.trim().length < reasonMin) {
      setMsg({ ok: false, text: `Give a reason of at least ${reasonMin} characters.` });
      return;
    }
    setBusy(true); setMsg(null);
    const payload: Record<string, string | null> = { ...args };
    if (reasonParam) payload[reasonParam] = reason.trim();
    const { error } = await createClient().rpc(rpc, payload);
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: done });
    setOpen(false); setReason('');
    router.refresh();
  }

  const cls = tone === 'primary' ? 'btn-cta btn-sm' : 'btn-secondary btn-sm';
  const style = tone === 'danger' ? { color: 'var(--red)' } : undefined;

  return (
    <span className="inline-flex flex-col gap-1 no-print">
      {reasonParam && open ? (
        <span className="flex flex-col gap-1 min-w-[220px]">
          <label htmlFor={id} className="label">{reasonLabel}</label>
          <textarea id={id} className="input" rows={2} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} />
          <span className="flex gap-1">
            <button type="button" className={cls} style={style} onClick={run} disabled={busy}>
              {busy && <Loader2 size={12} className="animate-spin" />} {label}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => { setOpen(false); setMsg(null); }}>Cancel</button>
          </span>
        </span>
      ) : (
        <button type="button" className={cls} style={style} disabled={busy}
          onClick={() => (reasonParam ? setOpen(true) : run())}>
          {busy && <Loader2 size={12} className="animate-spin" />} {label}
        </button>
      )}
      {msg && (
        <span role={msg.ok ? 'status' : 'alert'} className="text-xs" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</span>
      )}
    </span>
  );
}
