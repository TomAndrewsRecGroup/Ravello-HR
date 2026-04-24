'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Search, ChevronDown, ChevronRight, Loader2, Plus, Trash2, Check,
} from 'lucide-react';
import AvatarInitials from '@/components/ui/AvatarInitials';
import { useModalShell } from '@/components/ui/useModalShell';
import type { AthleteRow, PartnerRow, InterestRow, InterestStatus } from './types';
import { makeInterestApi } from './api';

interface Props {
  athlete: AthleteRow;
  partners: PartnerRow[];
  initialInterests: InterestRow[];
  /** '/api' for clients, '/api/admin' for staff inside the admin app */
  apiBase: '/api' | '/api/admin';
  onClose: () => void;
  /** Optional callback invoked after every save / patch / delete */
  onChanged?: () => void;
}

type PendingKey = string;            // `${partner_id}::${role_opportunity_id ?? 'null'}`
const k = (p: string, r: string | null): PendingKey => `${p}::${r ?? 'null'}`;

const STATUS_BADGE: Record<InterestStatus, { label: string; className: string }> = {
  interested:  { label: 'Interested',  className: 'badge-submitted' },
  introduced:  { label: 'Introduced',  className: 'badge-inprogress' },
  passed:      { label: 'Passed',      className: 'badge-shortlist' },
};

export default function MatchPickerModal({
  athlete, partners, initialInterests, apiBase, onClose, onChanged,
}: Props) {
  useModalShell(true, onClose);

  const api = useMemo(() => makeInterestApi(apiBase), [apiBase]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<PendingKey>>(new Set());
  const [interests, setInterests] = useState<InterestRow[]>(initialInterests);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Keyboard: '/' focuses search.
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

  // Index existing matches by key so we can fast-check from the role list.
  const existingByKey = useMemo(() => {
    const m = new Map<PendingKey, InterestRow>();
    for (const i of interests) m.set(k(i.partner_id, i.role_opportunity_id), i);
    return m;
  }, [interests]);

  const filteredPartners = useMemo(() => {
    if (!query.trim()) return partners;
    const q = query.toLowerCase();
    return partners.filter(p => {
      if (p.company_name.toLowerCase().includes(q)) return true;
      if (p.locations?.toLowerCase().includes(q)) return true;
      if (p.industry?.toLowerCase().includes(q)) return true;
      for (const r of p.role_opportunities) {
        if (r.title.toLowerCase().includes(q)) return true;
        if (r.description?.toLowerCase().includes(q)) return true;
        if (r.location?.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [partners, query]);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function togglePending(partnerId: string, roleId: string | null) {
    const key = k(partnerId, roleId);
    if (existingByKey.has(key)) return; // can't queue an already-saved match
    setPending(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function save() {
    if (pending.size === 0) return;
    setSaving(true);
    setError('');
    try {
      const items = Array.from(pending).map(key => {
        const [partner_id, roleRaw] = key.split('::');
        return { partner_id, role_opportunity_id: roleRaw === 'null' ? null : roleRaw };
      });
      const inserted = await api.bulkCreate(athlete.id, items);
      setInterests(prev => [...prev, ...inserted]);
      setPending(new Set());
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(id: string, status: InterestStatus) {
    const prev = interests.find(i => i.id === id);
    if (!prev || prev.status === status) return;
    setInterests(curr => curr.map(i => i.id === id ? { ...i, status } : i));
    try {
      await api.patch(id, { status });
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
      await api.remove(id);
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

  function partnerName(id: string): string {
    return partners.find(p => p.id === id)?.company_name ?? 'Unknown partner';
  }
  function roleTitle(partnerId: string, roleId: string | null): string {
    if (!roleId) return 'general interest';
    const partner = partners.find(p => p.id === partnerId);
    return partner?.role_opportunities.find(r => r.id === roleId)?.title ?? 'Removed role';
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(7,11,29,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={close}
    >
      <div
        className="card w-full max-w-[720px] max-h-[88vh] flex flex-col overflow-hidden p-0"
        style={{ boxShadow: '0 24px 64px rgba(7,11,29,0.28)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-picker-title"
      >
        {/* Header */}
        <div className="px-6 py-5 flex items-center gap-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <AvatarInitials name={athlete.full_name} size={44} />
          <div className="flex-1 min-w-0">
            <h2 id="match-picker-title" className="font-display text-lg font-semibold leading-tight" style={{ color: 'var(--ink)' }}>
              Match {athlete.full_name} to a role
            </h2>
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--ink-soft)' }}>
              {[athlete.sport, athlete.previous_role].filter(Boolean).join(' · ') || 'Athlete'}
            </p>
          </div>
          <button onClick={close} className="btn-icon btn-ghost" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--ink-faint)' }} />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search partners or roles  (press / to focus)"
              className="input pl-10"
            />
          </div>
        </div>

        {/* Partner list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {filteredPartners.length === 0 ? (
            <div className="text-center text-sm py-10" style={{ color: 'var(--ink-faint)' }}>
              No partners match.
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
              {filteredPartners.map(p => {
                const isOpen = expanded.has(p.id);
                const interestedHere = interests.filter(i => i.partner_id === p.id).length;
                return (
                  <li key={p.id} className="px-3">
                    <button
                      onClick={() => toggleExpand(p.id)}
                      className="w-full flex items-center gap-3 py-3 text-left"
                    >
                      {isOpen
                        ? <ChevronDown size={14} style={{ color: 'var(--ink-faint)' }} />
                        : <ChevronRight size={14} style={{ color: 'var(--ink-faint)' }} />}
                      <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                        {p.company_name}
                      </span>
                      {p.locations && (
                        <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                          · {p.locations}
                        </span>
                      )}
                      {p.industry && (
                        <span className="badge ml-auto" style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}>
                          {p.industry}
                        </span>
                      )}
                      {interestedHere > 0 && (
                        <span className="text-[11px] font-semibold" style={{ color: 'var(--purple)' }}>
                          {interestedHere} matched
                        </span>
                      )}
                    </button>
                    {isOpen && (
                      <div className="pb-3 pl-7 space-y-1.5">
                        {p.role_opportunities.length === 0 && (
                          <p className="text-xs italic" style={{ color: 'var(--ink-faint)' }}>
                            No roles listed yet.
                          </p>
                        )}
                        {p.role_opportunities.map(role => {
                          const key = k(p.id, role.id);
                          const saved = existingByKey.has(key);
                          const queued = pending.has(key);
                          const checked = saved || queued;
                          return (
                            <label
                              key={role.id}
                              className="flex items-center gap-3 py-1.5 px-2 rounded-[8px] cursor-pointer hover:bg-[var(--surface-alt)]"
                              style={{
                                opacity: saved ? 0.6 : 1,
                                cursor: saved ? 'default' : 'pointer',
                              }}
                            >
                              <Checkbox checked={checked} onChange={() => togglePending(p.id, role.id)} disabled={saved} />
                              <span className="text-sm flex-1" style={{ color: 'var(--ink)' }}>
                                {role.title}
                              </span>
                              {role.location && (
                                <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                                  {role.location}
                                </span>
                              )}
                              {saved && (
                                <Check size={13} style={{ color: 'var(--purple)' }} />
                              )}
                            </label>
                          );
                        })}
                        {/* general interest */}
                        {(() => {
                          const key = k(p.id, null);
                          const saved = existingByKey.has(key);
                          const queued = pending.has(key);
                          return (
                            <button
                              type="button"
                              onClick={() => togglePending(p.id, null)}
                              disabled={saved}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold mt-1 px-2.5 py-1 rounded-full"
                              style={{
                                background: saved || queued ? 'rgba(124,58,237,0.10)' : 'var(--surface)',
                                color: saved || queued ? 'var(--purple)' : 'var(--ink-soft)',
                                border: '1px dashed var(--line)',
                                opacity: saved ? 0.6 : 1,
                                cursor: saved ? 'default' : 'pointer',
                              }}
                            >
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

        {/* Saved matches strip */}
        <div className="px-6 py-3" style={{ background: 'var(--surface-soft)', borderTop: '1px solid var(--line)' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--ink-faint)' }}>
            Currently matched ({interests.length})
          </p>
          {interests.length === 0 ? (
            <p className="text-xs italic" style={{ color: 'var(--ink-faint)' }}>No matches yet.</p>
          ) : (
            <ul className="space-y-1.5 max-h-[180px] overflow-y-auto">
              {interests.map(i => (
                <li key={i.id} className="flex items-center gap-2 text-xs">
                  <span className="font-semibold flex-1 truncate" style={{ color: 'var(--ink)' }}>
                    {partnerName(i.partner_id)} <span style={{ color: 'var(--ink-faint)' }}>·</span> {roleTitle(i.partner_id, i.role_opportunity_id)}
                  </span>
                  <select
                    value={i.status}
                    onChange={e => changeStatus(i.id, e.target.value as InterestStatus)}
                    className="input"
                    style={{ padding: '3px 22px 3px 8px', fontSize: 11, width: 'auto' }}
                  >
                    {(Object.keys(STATUS_BADGE) as InterestStatus[]).map(s => (
                      <option key={s} value={s}>{STATUS_BADGE[s].label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeMatch(i.id)}
                    className="btn-icon btn-ghost"
                    style={{ width: 24, height: 24, color: 'var(--red)' }}
                    aria-label="Remove match"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-between gap-3" style={{ borderTop: '1px solid var(--line)' }}>
          {error
            ? <span className="text-xs" style={{ color: 'var(--red)' }}>{error}</span>
            : <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                {pending.size === 0 ? 'No pending changes' : `${pending.size} pending`}
              </span>}
          <div className="flex items-center gap-2">
            <button onClick={close} className="btn-secondary btn-sm">Cancel</button>
            <button
              onClick={save}
              disabled={saving || pending.size === 0}
              className="btn-cta btn-sm flex items-center gap-1.5"
            >
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
    <span
      onClick={e => { e.preventDefault(); if (!disabled) onChange(); }}
      className="inline-flex items-center justify-center"
      style={{
        width: 16,
        height: 16,
        borderRadius: 4,
        border: `1.5px solid ${checked ? 'var(--purple)' : 'var(--line)'}`,
        background: checked ? 'var(--purple)' : 'var(--surface)',
        color: '#fff',
      }}
    >
      {checked && <Check size={10} strokeWidth={3} />}
    </span>
  );
}
