'use client';

import { useMemo, useRef, useState } from 'react';
import { X, Search, Pencil } from 'lucide-react';
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
                  <li key={a.id} className="px-6 py-4 flex gap-3 items-start">
                    <AvatarInitials name={a.full_name} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                          {a.full_name}
                        </span>
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
                    <button
                      type="button"
                      onClick={() => onEdit(a)}
                      className="btn-secondary btn-sm flex items-center gap-1 flex-shrink-0"
                      style={{ padding: '4px 8px', fontSize: 11 }}
                      aria-label={`Edit ${a.full_name}`}
                    >
                      <Pencil size={11} /> Edit
                    </button>
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
