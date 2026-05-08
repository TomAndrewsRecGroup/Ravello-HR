'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Search, ChevronDown, ChevronRight, Globe, MapPin, ExternalLink, Plus, Check } from 'lucide-react';
import AvatarInitials from '@/components/ui/AvatarInitials';
import { useModalShell } from '@/components/ui/useModalShell';
import { createClient } from '@/lib/supabase/client';
import type { AthleteRow, TrainingInterestRow, TrainingProviderRow } from './types';

interface Props {
  providers: TrainingProviderRow[];
  interests: TrainingInterestRow[];
  interestsByProvider: Map<string, number>;
  athletes?: AthleteRow[];
  onClose: () => void;
}

// Read-only training providers browser. Match management lives in the
// admin portal — this just shows providers, their offerings, and
// aggregate interest counts in the same shape as PartnersModal but
// with a blue accent.

export default function TrainingModal({
  providers, interests, interestsByProvider, athletes = [], onClose,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalShell(true, onClose, dialogRef);
  const router = useRouter();
  const supabase = createClient();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const [pickerAthlete, setPickerAthlete] = useState('');
  const [pickerNote, setPickerNote] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errorByKey, setErrorByKey] = useState<Record<string, string>>({});

  function rowKey(providerId: string, offeringId: string | null): string {
    return `${providerId}:${offeringId ?? 'root'}`;
  }

  async function expressInterest(providerId: string, offeringId: string | null) {
    const key = rowKey(providerId, offeringId);
    if (!pickerAthlete) {
      setErrorByKey(p => ({ ...p, [key]: 'Pick an athlete first' }));
      return;
    }
    setSavingKey(key);
    setErrorByKey(p => ({ ...p, [key]: '' }));
    try {
      const { error } = await supabase
        .from('athlete_training_interests')
        .insert({
          athlete_id: pickerAthlete,
          provider_id: providerId,
          offering_id: offeringId,
          status: 'interested',
          notes: pickerNote.trim() || null,
        });
      if (error) throw error;
      setPickerKey(null);
      setPickerAthlete('');
      setPickerNote('');
      router.refresh();
    } catch (e) {
      setErrorByKey(p => ({ ...p, [key]: (e as Error).message }));
    } finally {
      setSavingKey(null);
    }
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return providers;
    const q = query.toLowerCase();
    return providers.filter(p => {
      if (p.provider_name.toLowerCase().includes(q)) return true;
      if (p.locations?.toLowerCase().includes(q)) return true;
      if (p.category?.toLowerCase().includes(q)) return true;
      return p.offerings.some(o =>
        o.title.toLowerCase().includes(q)
        || o.description?.toLowerCase().includes(q)
        || o.format?.toLowerCase().includes(q)
        || o.location?.toLowerCase().includes(q));
    });
  }, [providers, query]);

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function offeringInterestCount(providerId: string, offeringId: string | null): number {
    return interests.filter(i => i.provider_id === providerId && i.offering_id === offeringId).length;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(7,11,29,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="card w-full max-w-2xl max-h-[88vh] flex flex-col p-0 overflow-hidden"
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby="training-modal-title"
      >
        <div className="px-6 py-5 flex items-center gap-3"
             style={{ borderBottom: '1px solid var(--line)', background: 'rgba(59,111,255,0.04)' }}>
          <h2 id="training-modal-title" className="font-display text-lg font-semibold flex-1" style={{ color: 'var(--ink)' }}>
            Training & Workshops ({providers.length})
          </h2>
          <button onClick={onClose} className="btn-icon btn-ghost"><X size={18} /></button>
        </div>

        <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--ink-faint)' }} />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search providers, courses, formats or locations"
              className="input pl-10"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center text-sm py-12" style={{ color: 'var(--ink-faint)' }}>
              No providers match your search.
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
              {filtered.map(p => {
                const isOpen = expanded.has(p.id);
                const matched = interestsByProvider.get(p.id) ?? 0;
                return (
                  <li key={p.id} className="px-6 py-4">
                    <button
                      onClick={() => toggle(p.id)}
                      className="w-full flex items-center gap-3 text-left"
                    >
                      <AvatarInitials name={p.provider_name} size={36} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                          {p.provider_name}
                        </p>
                        <p className="text-xs mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: 'var(--ink-soft)' }}>
                          {p.category && <span>{p.category}</span>}
                          {p.locations && (
                            <span className="inline-flex items-center gap-0.5">
                              <MapPin size={10} /> {p.locations}
                            </span>
                          )}
                          <span>· {p.offerings.length} offering{p.offerings.length === 1 ? '' : 's'}</span>
                        </p>
                      </div>
                      {matched > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: 'rgba(59,111,255,0.10)', color: 'var(--blue)' }}>
                          {matched} interested
                        </span>
                      )}
                      {isOpen
                        ? <ChevronDown size={14} style={{ color: 'var(--ink-faint)' }} />
                        : <ChevronRight size={14} style={{ color: 'var(--ink-faint)' }} />}
                    </button>

                    {isOpen && (
                      <div className="mt-3 pl-12 space-y-2">
                        {p.website && (
                          <a href={p.website} target="_blank" rel="noopener noreferrer"
                             className="inline-flex items-center gap-1 text-xs hover:underline"
                             style={{ color: 'var(--blue)' }}>
                            <Globe size={11} /> {p.website.replace(/^https?:\/\//, '')}
                          </a>
                        )}

                        {p.offerings.length === 0 ? (
                          <p className="text-xs italic" style={{ color: 'var(--ink-faint)' }}>
                            No offerings listed yet.
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {p.offerings.map(offering => {
                              const count = offeringInterestCount(p.id, offering.id);
                              const key = rowKey(p.id, offering.id);
                              const open = pickerKey === key;
                              return (
                                <li key={offering.id} className="rounded-[10px] p-3"
                                    style={{ background: 'rgba(59,111,255,0.04)' }}>
                                  <div className="flex items-start gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                                        {offering.title}
                                      </p>
                                      {offering.description && (
                                        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>
                                          {offering.description}
                                        </p>
                                      )}
                                      <div className="flex items-center gap-2 mt-1.5 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                                        {offering.format && (
                                          <span className="px-1.5 py-0.5 rounded-full"
                                                style={{ background: 'rgba(59,111,255,0.10)', color: 'var(--blue)' }}>
                                            {offering.format}
                                          </span>
                                        )}
                                        {offering.location && (
                                          <span className="inline-flex items-center gap-0.5">
                                            <MapPin size={10} /> {offering.location}
                                          </span>
                                        )}
                                        {offering.url && (
                                          <a href={offering.url} target="_blank" rel="noopener noreferrer"
                                             className="inline-flex items-center gap-0.5 hover:underline"
                                             style={{ color: 'var(--blue)' }}>
                                            View course <ExternalLink size={9} />
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                      {count > 0 && (
                                        <span
                                          className="text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap"
                                          style={{
                                            background: 'rgba(59,111,255,0.10)',
                                            color: 'var(--blue)',
                                            border: '1px solid rgba(59,111,255,0.20)',
                                          }}
                                        >
                                          {count} interested
                                        </span>
                                      )}
                                      {athletes.length > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const next = open ? null : key;
                                            setPickerKey(next);
                                            setPickerAthlete('');
                                            setPickerNote('');
                                            setErrorByKey(p => ({ ...p, [key]: '' }));
                                          }}
                                          className="btn-secondary btn-sm"
                                          style={{ padding: '4px 8px', fontSize: 11 }}
                                          title="Express an athlete's interest in this course"
                                        >
                                          {open ? <X size={11} /> : <Plus size={11} />}
                                          {open ? 'Cancel' : 'Add interest'}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  {open && (
                                    <div className="mt-3 pt-3 space-y-2" style={{ borderTop: '1px dashed var(--line)' }}>
                                      <select
                                        className="input"
                                        value={pickerAthlete}
                                        onChange={e => setPickerAthlete(e.target.value)}
                                      >
                                        <option value="">Select an athlete…</option>
                                        {athletes.map(a => (
                                          <option key={a.id} value={a.id}>{a.full_name}</option>
                                        ))}
                                      </select>
                                      <input
                                        className="input"
                                        placeholder="Note (optional) — e.g. why this course suits them"
                                        value={pickerNote}
                                        onChange={e => setPickerNote(e.target.value)}
                                      />
                                      {errorByKey[key] && (
                                        <p className="text-xs" style={{ color: 'var(--red)' }}>{errorByKey[key]}</p>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => expressInterest(p.id, offering.id)}
                                        disabled={savingKey === key || !pickerAthlete}
                                        className="btn-cta btn-sm"
                                      >
                                        <Check size={12} /> {savingKey === key ? 'Saving…' : 'Save interest'}
                                      </button>
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
