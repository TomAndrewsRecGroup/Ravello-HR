'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Lock, Loader2, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { useToast } from '@/components/modules/Toast';
import {
  ISOLATION_TYPES, ISOLATION_TYPE_LABELS, ISOLATION_STATUS_LABELS, type IsolationType, type IsolationStatus,
} from '@/lib/hs/vocab';
import type { Isolation, IsolationLock } from '@/lib/hs/types';
import ConnectionsPanel from './ConnectionsPanel';

interface PickOption { id: string; name: string }

interface Props {
  companyId: string;
  isolations: Isolation[];
  locks: IsolationLock[];
  equipment: PickOption[];
  people: PickOption[];
  loadError: string | null;
  // UI/UX cross-linking pass, round 3 (2026-10-04): the exact
  // PermitsClient.tsx/ContractorsClient.tsx precedent — a true
  // shared-dupe pair, each caller passes its own role.
  role: 'admin' | 'portal';
}

const fmtDt = (d: string | null) =>
  d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const STATUS_COLOUR: Record<IsolationStatus, string> = {
  applied: 'var(--gold)', verified: 'var(--teal)', removed: 'var(--ink-faint)',
};

export default function IsolationsClient({ companyId, isolations, locks, equipment, people, loadError, role }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const nameFor = (id: string | null) => (id ? people.find(p => p.id === id)?.name ?? 'Unknown' : '—');
  const assetFor = (id: string) => equipment.find(e => e.id === id)?.name ?? 'Unknown asset';
  const locksFor = (id: string) => locks.filter(l => l.isolation_id === id);

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load isolations: {loadError}</p>}
      <div className="flex">
        <button className="btn-cta btn-sm ml-auto" onClick={() => setOpen(o => !o)}><Plus size={14} /> New isolation</button>
      </div>

      {open && (
        <NewIsolationForm companyId={companyId} equipment={equipment} people={people}
          onDone={() => { setOpen(false); router.refresh(); }} />
      )}

      {isolations.length === 0 ? (
        <div className="card empty-state p-10">
          <Lock size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No isolations recorded.</p>
        </div>
      ) : (
        <ul className="card divide-y" style={{ borderColor: 'var(--line)' }}>
          {isolations.map(iso => {
            const isOpen = expanded === iso.id;
            const isoLocks = locksFor(iso.id);
            return (
              <li key={iso.id}>
                <button className="w-full flex items-center gap-3 p-4 text-left" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : iso.id)}>
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate" style={{ color: 'var(--ink)' }}>{assetFor(iso.asset_id)}</span>
                    <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>
                      {ISOLATION_TYPE_LABELS[iso.isolation_type]} · applied by {nameFor(iso.applied_by)}
                    </span>
                  </span>
                  <span className="text-right text-sm whitespace-nowrap font-medium" style={{ color: STATUS_COLOUR[iso.status] }}>
                    {ISOLATION_STATUS_LABELS[iso.status]}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pl-11 space-y-4">
                    {iso.description && <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{iso.description}</p>}
                    <div className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                      Applied {fmtDt(iso.applied_at)} ·{' '}
                      <Link href={`/health-safety/${companyId}/equipment#eq-${iso.asset_id}`} style={{ color: 'var(--purple)' }}>
                        View {assetFor(iso.asset_id)} on the Equipment tab
                      </Link>
                    </div>

                    <div>
                      <h3 className="label">Personal locks</h3>
                      {isoLocks.length === 0 ? (
                        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No locks applied yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {isoLocks.map(l => (
                            <li key={l.id} className="text-sm rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
                              <div className="flex flex-wrap items-center gap-x-3">
                                <strong style={{ color: 'var(--ink)' }}>{nameFor(l.person_id)}</strong>
                                {l.lock_number && <span style={{ color: 'var(--ink-faint)' }}>lock #{l.lock_number}</span>}
                                {l.removed_at ? (
                                  <span style={{ color: 'var(--ink-faint)' }}>removed {fmtDt(l.removed_at)} by {nameFor(l.removed_by)}</span>
                                ) : (
                                  <span style={{ color: 'var(--gold)' }}>open</span>
                                )}
                              </div>
                              {l.override_reason && <p className="mt-1 text-xs" style={{ color: 'var(--red)' }}>Override: {l.override_reason}</p>}
                              {!l.removed_at && iso.status !== 'removed' && (
                                <RemoveLockForm lock={l} people={people} onDone={() => router.refresh()} />
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {iso.status !== 'removed' && <AddLockForm companyId={companyId} isolationId={iso.id} people={people} onDone={() => router.refresh()} />}
                    </div>

                    <IsolationActions isolation={iso} locks={isoLocks} people={people} onDone={() => router.refresh()} />

                    <ConnectionsPanel entityType="isolation" entityId={iso.id} companyId={companyId} canEdit role={role} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NewIsolationForm({ companyId, equipment, people, onDone }: {
  companyId: string; equipment: PickOption[]; people: PickOption[]; onDone: () => void;
}) {
  const { toast } = useToast();
  const [assetId, setAssetId] = useState(equipment[0]?.id ?? '');
  const [type, setType] = useState<IsolationType>('electrical');
  const [description, setDescription] = useState('');
  const [appliedBy, setAppliedBy] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!assetId || !appliedBy) { toast('An asset and who applied it are both required.', 'error'); return; }
    setBusy(true);
    const { error } = await createClient().from('isolations').insert({
      company_id: companyId, asset_id: assetId, isolation_type: type,
      description: description.trim() || null, applied_by: appliedBy,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Isolation applied — the asset is now out of service', 'success');
    onDone();
  }

  if (equipment.length === 0) {
    return <p className="card p-4 text-sm" style={{ color: 'var(--ink-faint)' }}>Add equipment to the asset register first.</p>;
  }

  return (
    <form onSubmit={submit} className="card p-4 grid gap-3 md:grid-cols-2">
      <label className="block">
        <span className="label">Asset</span>
        <select className="input" value={assetId} onChange={e => setAssetId(e.target.value)}>
          {equipment.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">Isolation type</span>
        <select className="input" value={type} onChange={e => setType(e.target.value as IsolationType)}>
          {ISOLATION_TYPES.map(t => <option key={t} value={t}>{ISOLATION_TYPE_LABELS[t]}</option>)}
        </select>
      </label>
      <label className="block md:col-span-2">
        <span className="label">Applied by</span>
        <select className="input" value={appliedBy} onChange={e => setAppliedBy(e.target.value)}>
          <option value="">—</option>
          {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="block md:col-span-2">
        <span className="label">Description (optional)</span>
        <textarea className="input" rows={2} value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} />
      </label>
      <div className="md:col-span-2 flex justify-end">
        <button className="btn-cta" disabled={busy || !assetId || !appliedBy}>{busy && <Loader2 size={15} className="animate-spin" />} Apply isolation</button>
      </div>
    </form>
  );
}

function AddLockForm({ companyId, isolationId, people, onDone }: {
  companyId: string; isolationId: string; people: PickOption[]; onDone: () => void;
}) {
  const { toast } = useToast();
  const [personId, setPersonId] = useState('');
  const [lockNumber, setLockNumber] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!personId) return;
    setBusy(true);
    const { error } = await createClient().from('isolation_locks').insert({
      isolation_id: isolationId, company_id: companyId, person_id: personId, lock_number: lockNumber.trim() || null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    setPersonId(''); setLockNumber('');
    onDone();
  }

  return (
    <form onSubmit={add} className="mt-2 flex flex-wrap items-center gap-2">
      <select className="input input-sm" value={personId} onChange={e => setPersonId(e.target.value)}>
        <option value="">Add a lock for…</option>
        {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input className="input input-sm" placeholder="Lock # (optional)" value={lockNumber} onChange={e => setLockNumber(e.target.value)} style={{ width: '10rem' }} />
      <button className="btn-secondary btn-sm" disabled={busy || !personId}>{busy && <Loader2 size={13} className="animate-spin" />} Add lock</button>
    </form>
  );
}

function RemoveLockForm({ lock, people, onDone }: {
  lock: IsolationLock; people: PickOption[]; onDone: () => void;
}) {
  const { toast } = useToast();
  const [removedBy, setRemovedBy] = useState(lock.person_id);
  const [authorisedBy, setAuthorisedBy] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const isOverride = removedBy !== lock.person_id;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isOverride && (!authorisedBy || !reason.trim())) {
      toast('An override needs a different authorising person and a reason.', 'error');
      return;
    }
    setBusy(true);
    const res = await createClient().from('isolation_locks').update({
      removed_at: new Date().toISOString(), removed_by: removedBy,
      override_reason: isOverride ? reason.trim() : null,
      override_authorised_by: isOverride ? authorisedBy : null,
    }, COUNT_EXACT).eq('id', lock.id);
    setBusy(false);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Could not remove the lock.', 'error'); return; }
    onDone();
  }

  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <span style={{ color: 'var(--ink-faint)' }}>Remove lock as</span>
      <select className="input input-sm" value={removedBy} onChange={e => setRemovedBy(e.target.value)}>
        {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {isOverride && (
        <>
          <span style={{ color: 'var(--gold)' }}>override — authorised by</span>
          <select className="input input-sm" value={authorisedBy} onChange={e => setAuthorisedBy(e.target.value)}>
            <option value="">—</option>
            {people.filter(p => p.id !== removedBy).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className="input input-sm" placeholder="Reason" value={reason} onChange={e => setReason(e.target.value)} />
        </>
      )}
      <button className="btn-secondary btn-sm" disabled={busy}>{busy && <Loader2 size={13} className="animate-spin" />} Remove lock</button>
    </form>
  );
}

function IsolationActions({ isolation, locks, people, onDone }: {
  isolation: Isolation; locks: IsolationLock[]; people: PickOption[]; onDone: () => void;
}) {
  const { toast } = useToast();
  const [verifiedBy, setVerifiedBy] = useState('');
  const [removedBy, setRemovedBy] = useState('');
  const [removalVerifiedBy, setRemovalVerifiedBy] = useState('');
  const [busy, setBusy] = useState(false);
  const openLocks = locks.filter(l => !l.removed_at).length;

  async function verify() {
    if (!verifiedBy) { toast('Pick who verified the isolation.', 'error'); return; }
    setBusy(true);
    const res = await createClient().from('isolations').update({ status: 'verified', verified_by: verifiedBy }, COUNT_EXACT).eq('id', isolation.id);
    setBusy(false);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Could not verify the isolation.', 'error'); return; }
    toast('Isolation verified', 'success');
    onDone();
  }

  async function remove() {
    if (!removedBy || !removalVerifiedBy) { toast('Both who removed it and who verified the removal are required.', 'error'); return; }
    setBusy(true);
    const res = await createClient().from('isolations').update({
      status: 'removed', removed_by: removedBy, removal_verified_by: removalVerifiedBy,
    }, COUNT_EXACT).eq('id', isolation.id);
    setBusy(false);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Could not remove the isolation.', 'error'); return; }
    toast('Isolation removed', 'success');
    onDone();
  }

  if (isolation.status === 'applied') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>Verified by</span>
        <select className="input input-sm" value={verifiedBy} onChange={e => setVerifiedBy(e.target.value)}>
          <option value="">—</option>
          {people.filter(p => p.id !== isolation.applied_by).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn-cta btn-sm" disabled={busy || !verifiedBy} onClick={verify}>
          {busy && <Loader2 size={14} className="animate-spin" />} Confirm verified
        </button>
      </div>
    );
  }

  if (isolation.status === 'verified') {
    return (
      <div className="space-y-2">
        {openLocks > 0 && (
          <p className="text-xs" style={{ color: 'var(--gold)' }}>{openLocks} lock{openLocks === 1 ? '' : 's'} still open — every lock must be removed first.</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>Removed by</span>
          <select className="input input-sm" value={removedBy} onChange={e => setRemovedBy(e.target.value)}>
            <option value="">—</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>Removal verified by</span>
          <select className="input input-sm" value={removalVerifiedBy} onChange={e => setRemovalVerifiedBy(e.target.value)}>
            <option value="">—</option>
            {people.filter(p => p.id !== removedBy).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn-cta btn-sm" disabled={busy || !removedBy || !removalVerifiedBy} onClick={remove}>
            {busy && <Loader2 size={14} className="animate-spin" />} Confirm removed
          </button>
        </div>
      </div>
    );
  }

  return null; // removed — terminal
}
