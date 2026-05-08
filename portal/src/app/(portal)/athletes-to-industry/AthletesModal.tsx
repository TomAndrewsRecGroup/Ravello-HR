'use client';

import { useMemo, useRef, useState } from 'react';
import { X, Search, Pencil, PhoneCall } from 'lucide-react';
import AvatarInitials from '@/components/ui/AvatarInitials';
import { useModalShell } from '@/components/ui/useModalShell';
import type { AthleteRow, InterestRow } from './types';

interface Props {
  athletes: AthleteRow[];
  interestsByAthlete: Map<string, InterestRow[]>;
  onEdit: (athlete: AthleteRow) => void;
  onClose: () => void;
}

// Full-roster browser for clients. Edit (incl. CV) is supported here;
// matching/recruitment lives on the admin side.

export default function AthletesModal({
  athletes, interestsByAthlete, onEdit, onClose,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalShell(true, onClose, dialogRef);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return athletes;
    const q = query.toLowerCase();
    return athletes.filter(a =>
      a.full_name.toLowerCase().includes(q)
      || a.sport?.toLowerCase().includes(q)
      || a.previous_role?.toLowerCase().includes(q)
      || a.bio?.toLowerCase().includes(q),
    );
  }, [athletes, query]);

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
        role="dialog" aria-modal="true" aria-labelledby="athletes-modal-title"
      >
        <div className="px-6 py-5 flex items-center gap-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <h2 id="athletes-modal-title" className="font-display text-lg font-semibold flex-1" style={{ color: 'var(--ink)' }}>
            Athletes ({athletes.length})
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
              placeholder="Search by name, sport or previous role"
              className="input pl-10"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center text-sm py-12" style={{ color: 'var(--ink-faint)' }}>
              No athletes match your search.
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
              {filtered.map(a => {
                const matches = interestsByAthlete.get(a.id)?.length ?? 0;
                return (
                  <li
                    key={a.id}
                    className={`px-6 py-4 flex gap-3 items-start cursor-pointer hover:bg-[var(--surface-soft)] ${a.called_at ? 'athlete-called-glow rounded-md' : ''}`}
                    onClick={() => onEdit(a)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(a); } }}
                    aria-label={`Open profile for ${a.full_name}`}
                  >
                    <AvatarInitials name={a.full_name} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                          {a.full_name}
                        </span>
                        {a.called_at && (
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                            style={{ background: 'rgba(20,184,166,0.12)', color: 'var(--teal)' }}
                            title="The People System has been in touch with this athlete"
                          >
                            <PhoneCall size={9} /> Called
                          </span>
                        )}
                        {matches > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                style={{ background: 'rgba(124,58,237,0.10)', color: 'var(--purple)' }}>
                            {matches} match{matches === 1 ? '' : 'es'}
                          </span>
                        )}
                      </div>
                      {(a.sport || a.previous_role) && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>
                          {[a.sport, a.previous_role].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {a.bio && (
                        <p className="text-xs mt-1.5 line-clamp-2" style={{ color: 'var(--ink-soft)' }}>
                          {a.bio}
                        </p>
                      )}
                    </div>
                    <span
                      aria-hidden="true"
                      className="btn-secondary btn-sm flex items-center gap-1 flex-shrink-0 pointer-events-none"
                      style={{ padding: '4px 8px', fontSize: 11 }}
                    >
                      <Pencil size={11} /> Open
                    </span>
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
