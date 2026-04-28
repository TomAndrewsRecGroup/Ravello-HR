'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Search, ChevronDown, ChevronRight, Loader2, Plus, Trash2, Check,
} from 'lucide-react';
import AvatarInitials from '@/components/ui/AvatarInitials';
import { useModalShell } from '@/components/ui/useModalShell';
import type {
  AthleteRow, TrainingProviderRow, TrainingInterestRow, TrainingStatus,
} from './types';
import { trainingInterestApi } from './api';

interface Props {
  athlete: AthleteRow;
  providers: TrainingProviderRow[];
  initialInterests: TrainingInterestRow[];
  onClose: () => void;
  onChanged?: () => void;
}

type PendingKey = string;
const k = (p: string, o: string | null): PendingKey => `${p}::${o ?? 'null'}`;

const STATUS_LABEL: Record<TrainingStatus, string> = {
  interested: 'Interested',
  enrolled:   'Enrolled',
  completed:  'Completed',
  passed:     'Passed',
};

// Mirror of MatchPickerModal but for training providers / offerings.
// Blue accent throughout to distinguish from the partner flow.

export default function TrainingPickerModal({
  athlete, providers, initialInterests, onClose, onChanged,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalShell(true, onClose, dialogRef);

  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Map<PendingKey, { providerId: string; offeringId: string | null }>>(new Map());
  const [interests, setInterests] = useState<TrainingInterestRow[]>(initialInterests);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const existingByKey = useMemo(() => {
    const m = new Map<PendingKey, TrainingInterestRow>();
    for (const i of interests) m.set(k(i.provider_id, i.offering_id), i);
    return m;
  }, [interests]);

  const filteredProviders = useMemo(() => {
    if (!query.trim()) return providers;
    const q = query.toLowerCase();
    return providers.filter(p => {
      if (p.provider_name.toLowerCase().includes(q)) return true;
      if (p.locations?.toLowerCase().includes(q)) return true;
      if (p.category?.toLowerCase().includes(q)) return true;
      for (const o of p.offerings) {
        if (o.title.toLowerCase().includes(q)) return true;
        if (o.description?.toLowerCase().includes(q)) return true;
        if (o.location?.toLowerCase().includes(q)) return true;
        if (o.format?.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [providers, query]);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function togglePending(providerId: string, offeringId: string | null) {
    const key = k(providerId, offeringId);
    if (existingByKey.has(key)) return;
    setPending(prev => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, { providerId, offeringId });
      return next;
    });
  }

  async function save() {
    if (pending.size === 0) return;
    setSaving(true);
    setError('');
    try {
      const items = Array.from(pending.values()).map(v => ({
        provider_id: v.providerId,
        offering_id: v.offeringId,
      }));
      const inserted = await trainingInterestApi.bulkCreate(athlete.id, items);
      setInterests(prev => [...prev, ...inserted]);
      setPending(new Map());
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(id: string, status: TrainingStatus) {
    const prev = interests.find(i => i.id === id);
    if (!prev || prev.status === status) return;
    setInterests(curr => curr.map(i => i.id === id ? { ...i, status } : i));
    try {
      await trainingInterestApi.patch(id, { status });
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
      setInterests(curr => curr.map(i => i.id === id ? prev : i));
    }
  }

  async function removeMatch(id: string) {
    const prev = interests.find(i => i.id === id);
    if (!prev) return;
    setInterests(curr => curr.filter(i => i.id !== id));
    try {
      await trainingInterestApi.remove(id);
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
      setInterests(curr => [...curr, prev]);
    }
  }

  function close() {
    if (pending.size > 0) {
      const ok = confirm(`Discard ${pending.size} unsaved match${pending.size === 1 ? '' : 'es'}?`);
      if (!ok) return;
    }
    onClose();
  }

  function providerName(id: string): string {
    return providers.find(p => p.id === id)?.provider_name ?? 'Unknown provider';
  }
  function offeringTitle(providerId: string, offeringId: string | null): string {
    if (!offeringId) return 'general interest';
    const provider = providers.find(p => p.id === providerId);
    return provider?.offerings.find(o => o.id === offeringId)?.title ?? 'Removed offering';
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(7,11,29,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={close}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="card w-full max-w-[720px] max-h-[88vh] flex flex-col overflow-hidden p-0"
        style={{ boxShadow: '0 24px 64px rgba(7,11,29,0.28)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby="training-picker-title"
      >
        <div className="px-6 py-5 flex items-center gap-4"
             style={{ borderBottom: '1px solid var(--line)', background: 'rgba(59,111,255,0.04)' }}>
          <AvatarInitials name={athlete.full_name} size={44} />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--blue)' }}>
              Training & Workshops
            </p>
            <h2 id="training-picker-title" className="font-display text-lg font-semibold leading-tight" style={{ color: 'var(--ink)' }}>
              Match {athlete.full_name} to a course
            </h2>
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--ink-soft)' }}>
              {[athlete.sport, athlete.previous_role, athlete.company_name].filter(Boolean).join(' · ') || 'Athlete'}
            </p>
          </div>
          <button onClick={close} className="btn-icon btn-ghost" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--ink-faint)' }} />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search providers, offerings or formats  (press / to focus)"
              className="input pl-10"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {filteredProviders.length === 0 ? (
            <div className="text-center text-sm py-10" style={{ color: 'var(--ink-faint)' }}>
              No providers match.
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
              {filteredProviders.map(p => {
                const isOpen = expanded.has(p.id);
                const interestedHere = interests.filter(i => i.provider_id === p.id).length;
                return (
                  <li key={p.id} className="px-3">
                    <button onClick={() => toggleExpand(p.id)} className="w-full flex items-center gap-3 py-3 text-left">
                      {isOpen
                        ? <ChevronDown size={14} style={{ color: 'var(--ink-faint)' }} />
                        : <ChevronRight size={14} style={{ color: 'var(--ink-faint)' }} />}
                      <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{p.provider_name}</span>
                      {p.locations && (<span className="text-xs" style={{ color: 'var(--ink-soft)' }}>· {p.locations}</span>)}
                      {p.category && (<span className="badge ml-auto" style={{ background: 'rgba(59,111,255,0.08)', color: 'var(--blue)' }}>{p.category}</span>)}
                      {interestedHere > 0 && (
                        <span className="text-[11px] font-semibold" style={{ color: 'var(--blue)' }}>{interestedHere} interested</span>
                      )}
                    </button>
                    {isOpen && (
                      <div className="pb-3 pl-7 space-y-1.5">
                        {p.offerings.length === 0 && (
                          <p className="text-xs italic" style={{ color: 'var(--ink-faint)' }}>No offerings listed yet.</p>
                        )}
                        {p.offerings.map(offering => {
                          const key = k(p.id, offering.id);
                          const saved = existingByKey.has(key);
                          const queued = pending.has(key);
                          const checked = saved || queued;
                          return (
                            <label key={offering.id}
                                   className="flex items-center gap-3 py-1.5 px-2 rounded-[8px] cursor-pointer hover:bg-[rgba(59,111,255,0.04)]"
                                   style={{ opacity: saved ? 0.6 : 1, cursor: saved ? 'default' : 'pointer' }}>
                              <Checkbox checked={checked} onChange={() => togglePending(p.id, offering.id)} disabled={saved} />
                              <span className="text-sm flex-1" style={{ color: 'var(--ink)' }}>{offering.title}</span>
                              {offering.format && (<span className="text-[11px] px-1.5 py-0.5 rounded-full"
                                                          style={{ background: 'rgba(59,111,255,0.08)', color: 'var(--blue)' }}>{offering.format}</span>)}
                              {saved && (<Check size={13} style={{ color: 'var(--blue)' }} />)}
                            </label>
                          );
                        })}
                        {(() => {
                          const key = k(p.id, null);
                          const saved = existingByKey.has(key);
                          const queued = pending.has(key);
                          return (
                            <button type="button" onClick={() => togglePending(p.id, null)} disabled={saved}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold mt-1 px-2.5 py-1 rounded-full"
                                    style={{
                                      background: saved || queued ? 'rgba(59,111,255,0.10)' : 'var(--surface)',
                                      color: saved || queued ? 'var(--blue)' : 'var(--ink-soft)',
                                      border: '1px dashed var(--line)',
                                      opacity: saved ? 0.6 : 1,
                                      cursor: saved ? 'default' : 'pointer',
                                    }}>
                              <Plus size={11} /> general interest{saved ? ' (saved)' : ''}
                            </button>
                          );
                        })()}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-6 py-3" style={{ background: 'rgba(59,111,255,0.04)', borderTop: '1px solid var(--line)' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--blue)' }}>
            Currently matched ({interests.length})
          </p>
          {interests.length === 0 ? (
            <p className="text-xs italic" style={{ color: 'var(--ink-faint)' }}>No matches yet.</p>
          ) : (
            <ul className="space-y-1.5 max-h-[180px] overflow-y-auto">
              {interests.map(i => (
                <li key={i.id} className="flex items-center gap-2 text-xs">
                  <span className="font-semibold flex-1 truncate" style={{ color: 'var(--ink)' }}>
                    {providerName(i.provider_id)} <span style={{ color: 'var(--ink-faint)' }}>·</span> {offeringTitle(i.provider_id, i.offering_id)}
                  </span>
                  <select value={i.status} onChange={e => changeStatus(i.id, e.target.value as TrainingStatus)}
                          className="input" style={{ padding: '3px 22px 3px 8px', fontSize: 11, width: 'auto' }}>
                    {(Object.keys(STATUS_LABEL) as TrainingStatus[]).map(s => (<option key={s} value={s}>{STATUS_LABEL[s]}</option>))}
                  </select>
                  <button onClick={() => removeMatch(i.id)} className="btn-icon btn-ghost"
                          style={{ width: 24, height: 24, color: 'var(--red)' }} aria-label="Remove">
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-6 py-4 flex items-center justify-between gap-3" style={{ borderTop: '1px solid var(--line)' }}>
          {error
            ? <span className="text-xs" style={{ color: 'var(--red)' }}>{error}</span>
            : <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{pending.size === 0 ? 'No pending changes' : `${pending.size} pending`}</span>}
          <div className="flex items-center gap-2">
            <button onClick={close} className="btn-secondary btn-sm">Cancel</button>
            <button onClick={save} disabled={saving || pending.size === 0}
                    className="btn-sm flex items-center gap-1.5 font-semibold text-white"
                    style={{ background: 'var(--blue)', padding: '6px 12px', borderRadius: 10, opacity: (saving || pending.size === 0) ? 0.5 : 1 }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : null}
              {pending.size > 0 ? `Save ${pending.size} change${pending.size === 1 ? '' : 's'}` : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Checkbox({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={e => { e.preventDefault(); e.stopPropagation(); if (!disabled) onChange(); }}
      onKeyDown={e => {
        if ((e.key === ' ' || e.key === 'Enter') && !disabled) {
          e.preventDefault();
          onChange();
        }
      }}
      className="inline-flex items-center justify-center"
      style={{
        width: 16, height: 16, borderRadius: 4,
        border: `1.5px solid ${checked ? 'var(--blue)' : 'var(--line)'}`,
        background: checked ? 'var(--blue)' : 'var(--surface)',
        color: '#fff',
        padding: 0,
        cursor: disabled ? 'default' : 'pointer',
      }}>
      {checked && <Check size={10} strokeWidth={3} />}
    </button>
  );
}
