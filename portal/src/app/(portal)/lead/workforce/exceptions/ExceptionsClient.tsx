'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  EXCEPTION_KINDS, EXCEPTION_KIND_LABELS, EXCEPTION_MAX_DAYS, REQUIREMENT_TYPES, REQUIREMENT_TYPE_LABELS,
  workforcePersonPath, type ExceptionKind, type RequirementType,
} from '@/lib/workforce/vocab';
import { addDays, exceptionProblem, exceptionState, EXCEPTION_STATE_LABELS, type ExceptionState } from '@/lib/workforce/dashboard';
import { EMPLOYEE_DOC_TYPE_LABELS } from '@/lib/ui/statusMaps';
import { fmtDate, fmtDateTime } from '@/lib/hs/safetyFormat';
import Pill, { type Tone } from '@/components/safety/Pill';

export interface ExceptionRow {
  id: string; person_id: string; person: string; requirement_type: RequirementType; requirement: string;
  kind: ExceptionKind; reason: string; approved_by: string; approved_at: string; valid_from: string; valid_until: string;
  revoked_at: string | null; revoked_by: string | null; revoke_reason: string | null;
}
export interface CatalogueItem { type: RequirementType; id: string; title: string }

const STATE_TONE: Record<ExceptionState, Tone> = { in_force: 'warn', scheduled: 'info', lapsed: 'muted', revoked: 'muted' };

// Grant (requirement_exception_grant) and revoke
// (requirement_exception_revoke) — the only ways in (134). The limits are
// checked here for a plain message; the database decides.
export default function ExceptionsClient({ rows, canApprove, people, catalogue, today }: {
  rows: ExceptionRow[]; canApprove: boolean; people: { id: string; name: string }[]; catalogue: CatalogueItem[]; today: string;
}) {
  const [granting, setGranting] = useState(false);
  return (
    <div className="space-y-4">
      {canApprove && (
        granting
          ? <GrantForm people={people} catalogue={catalogue} today={today} onClose={() => setGranting(false)} />
          : <button type="button" className="btn-cta btn-sm" style={{ minHeight: 44 }} onClick={() => setGranting(true)}>
              <Plus size={14} /> Grant an exception
            </button>
      )}
      {rows.length > 0 && (
        <div className="table-wrapper">
          <table className="table">
            <caption className="sr-only">Requirement exceptions, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Person</th><th scope="col">Requirement</th><th scope="col">Kind</th><th scope="col">Reason</th>
                <th scope="col">From</th><th scope="col">Until</th><th scope="col">Approved by</th><th scope="col">State</th>
                {canApprove && <th scope="col"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => <Row key={r.id} r={r} canApprove={canApprove} today={today} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ r, canApprove, today }: { r: ExceptionRow; canApprove: boolean; today: string }) {
  const router = useRouter();
  const state = exceptionState(r, today);
  const [revoking, setRevoking] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function revoke(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 3) { setErr('Say why it is being revoked.'); return; }
    setBusy(true); setErr(null);
    const { error } = await createClient().rpc('requirement_exception_revoke', { p_id: r.id, p_reason: reason.trim() });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setRevoking(false);
    router.refresh();
  }

  return (
    <tr>
      <th scope="row" style={{ fontWeight: 500 }}><Link href={workforcePersonPath(r.person_id)} style={{ color: 'var(--ink)' }}>{r.person}</Link></th>
      <td>
        <span className="block">{r.requirement}</span>
        <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{REQUIREMENT_TYPE_LABELS[r.requirement_type] ?? r.requirement_type}</span>
      </td>
      <td className="whitespace-nowrap">{EXCEPTION_KIND_LABELS[r.kind] ?? r.kind}</td>
      <td className="text-sm" style={{ minWidth: 200, color: 'var(--ink-soft)' }}>
        {r.reason}
        {r.revoked_at && (
          <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>
            Revoked {fmtDateTime(r.revoked_at)}{r.revoked_by && ` by ${r.revoked_by}`}{r.revoke_reason && `: ${r.revoke_reason}`}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap">{fmtDate(r.valid_from)}</td>
      <td className="whitespace-nowrap">{fmtDate(r.valid_until)}</td>
      <td>
        {r.approved_by}
        <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>{fmtDate(r.approved_at)}</span>
      </td>
      <td><Pill tone={STATE_TONE[state]}>{EXCEPTION_STATE_LABELS[state]}</Pill></td>
      {canApprove && (
        <td style={{ minWidth: 140 }}>
          {(state === 'in_force' || state === 'scheduled') && (
            revoking ? (
              <form onSubmit={revoke} className="space-y-1">
                <label className="block"><span className="label">Reason for revoking</span>
                  <input className="input" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} autoFocus />
                </label>
                <div className="flex gap-1">
                  <button type="submit" className="btn-secondary btn-sm" disabled={busy}>{busy && <Loader2 size={12} className="animate-spin" />} Revoke</button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => { setRevoking(false); setErr(null); }}>Cancel</button>
                </div>
                {err && <p className="text-xs" role="alert" style={{ color: 'var(--red)' }}>{err}</p>}
              </form>
            ) : (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setRevoking(true)}>Revoke</button>
            )
          )}
        </td>
      )}
    </tr>
  );
}

function GrantForm({ people, catalogue, today, onClose }: {
  people: { id: string; name: string }[]; catalogue: CatalogueItem[]; today: string; onClose: () => void;
}) {
  const router = useRouter();
  const [f, setF] = useState({ person: '', type: '' as RequirementType | '', ref: '', key: '', kind: 'temporary_exception' as ExceptionKind,
    reason: '', from: today, until: addDays(today, 30) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const options = useMemo(() => catalogue.filter(c => c.type === f.type), [catalogue, f.type]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!f.person) { setErr('Choose the person.'); return; }
    if (!f.type) { setErr('Choose the kind of requirement.'); return; }
    if (f.type === 'document' ? !f.key.trim() : !f.ref) { setErr('Choose the requirement.'); return; }
    const problem = exceptionProblem({ reason: f.reason, validFrom: f.from, validUntil: f.until, today });
    if (problem) { setErr(problem); return; }
    setBusy(true);
    const { error } = await createClient().rpc('requirement_exception_grant', {
      p_person: f.person, p_type: f.type,
      p_reference_id: f.type === 'document' ? null : f.ref,
      p_reference_key: f.type === 'document' ? f.key.trim() : null,
      p_kind: f.kind, p_reason: f.reason.trim(), p_valid_until: f.until, p_valid_from: f.from,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onClose();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card p-4 grid gap-3 grid-cols-1 sm:grid-cols-2" noValidate aria-labelledby="grant-h">
      <h2 id="grant-h" className="font-semibold sm:col-span-2" style={{ color: 'var(--ink)' }}>Grant an exception</h2>
      <label className="block"><span className="label">Person</span>
        <select className="input" value={f.person} onChange={e => setF({ ...f, person: e.target.value })}>
          <option value="">Choose…</option>
          {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="block"><span className="label">Kind of requirement</span>
        <select className="input" value={f.type} onChange={e => setF({ ...f, type: e.target.value as RequirementType, ref: '', key: '' })}>
          <option value="">Choose…</option>
          {REQUIREMENT_TYPES.map(t => <option key={t} value={t}>{REQUIREMENT_TYPE_LABELS[t]}</option>)}
        </select>
      </label>
      {f.type === 'document' ? (
        <label className="block"><span className="label">Document type</span>
          <select className="input" value={f.key} onChange={e => setF({ ...f, key: e.target.value })}>
            <option value="">Choose…</option>
            {Object.entries(EMPLOYEE_DOC_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      ) : (
        <label className="block"><span className="label">Requirement</span>
          <select className="input" value={f.ref} disabled={!f.type} onChange={e => setF({ ...f, ref: e.target.value })}>
            <option value="">{f.type ? (options.length ? 'Choose…' : 'Nothing in the catalogue') : 'Choose the kind first'}</option>
            {options.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
        </label>
      )}
      <label className="block"><span className="label">Exception type</span>
        <select className="input" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as ExceptionKind })}>
          {EXCEPTION_KINDS.map(k => <option key={k} value={k}>{EXCEPTION_KIND_LABELS[k]}</option>)}
        </select>
      </label>
      <label className="block sm:col-span-2"><span className="label">Reason (at least 10 characters — what controls the risk meanwhile?)</span>
        <textarea className="input" rows={3} maxLength={1000} value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} />
      </label>
      <label className="block"><span className="label">Starts</span>
        <input className="input" type="date" min={today} value={f.from} onChange={e => setF({ ...f, from: e.target.value })} />
      </label>
      <label className="block"><span className="label">Ends (at most {EXCEPTION_MAX_DAYS} days after the start)</span>
        <input className="input" type="date" min={f.from} max={f.from ? addDays(f.from, EXCEPTION_MAX_DAYS) : undefined}
          value={f.until} onChange={e => setF({ ...f, until: e.target.value })} />
      </label>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-cta btn-sm" style={{ minHeight: 44 }} disabled={busy}>
          {busy && <Loader2 size={14} className="animate-spin" />} Grant exception
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        {err && <p className="text-sm" role="alert" style={{ color: 'var(--red)' }}>{err}</p>}
      </div>
    </form>
  );
}
