'use client';

import { Pencil, PhoneCall } from 'lucide-react';
import AvatarInitials from '@/components/ui/AvatarInitials';
import type { AthleteRow } from './types';

interface Props {
  athlete: AthleteRow;
  matchCount: number;
  onEdit: () => void;
}

// Client-portal athlete card. The whole card is clickable — opens the
// profile/edit modal where clients review notes from their account
// manager and update details (incl. phone). The pencil affordance
// stays for keyboard/screen-reader users.

export default function AthleteCard({ athlete, matchCount, onEdit }: Props) {
  return (
    <li
      className={`card p-3 relative group cursor-pointer ${athlete.called_at ? 'athlete-called' : ''}`}
      style={athlete.called_at ? undefined : { boxShadow: 'none', borderColor: 'var(--line)' }}
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(); } }}
      aria-label={`Open profile for ${athlete.full_name}`}
    >
      <div className="flex items-center gap-3">
        <AvatarInitials name={athlete.full_name} size={36} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-[13px] leading-tight truncate" style={{ color: 'var(--ink)' }}>
              {athlete.full_name}
            </p>
            {athlete.called_at && (
              <span
                className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 flex-shrink-0"
                style={{ background: 'rgba(20,184,166,0.12)', color: 'var(--teal)' }}
                title="The People System has been in touch with this athlete"
              >
                <PhoneCall size={8} /> Called
              </span>
            )}
          </div>
          <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--ink-soft)' }}>
            {[athlete.sport, athlete.previous_role].filter(Boolean).join(' · ') || 'Athlete'}
          </p>
        </div>
        {matchCount > 0 && (
          <span
            className="text-[10px] font-bold px-2 py-1 rounded-full"
            style={{ background: 'rgba(124,58,237,0.10)', color: 'var(--purple)' }}
          >
            {matchCount} match{matchCount === 1 ? '' : 'es'}
          </span>
        )}
      </div>
      <span
        aria-hidden="true"
        className="absolute top-2 right-2 btn-icon btn-ghost opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{ width: 26, height: 26, background: 'var(--surface)', border: '1px solid var(--line)' }}
      >
        <Pencil size={11} />
      </span>
    </li>
  );
}
