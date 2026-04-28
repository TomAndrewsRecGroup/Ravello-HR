'use client';

import AvatarInitials from '@/components/ui/AvatarInitials';
import type { AthleteRow } from './types';

interface Props {
  athlete: AthleteRow;
  matchCount: number;
}

// Read-only athlete card.
//
// The match flow lives on the admin side now — client users see their
// athletes and the partner roster, but the matching itself is handled
// by The People System staff and surfaced to the client as the
// `matchCount` chip on each athlete card. Editing / creating athletes
// is also admin-side.

export default function AthleteCard({ athlete, matchCount }: Props) {
  return (
    <li
      className="card p-3 relative"
      style={{ boxShadow: 'none', borderColor: 'var(--line)' }}
    >
      <div className="flex items-center gap-3">
        <AvatarInitials name={athlete.full_name} size={36} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[13px] leading-tight truncate" style={{ color: 'var(--ink)' }}>
            {athlete.full_name}
          </p>
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
    </li>
  );
}
