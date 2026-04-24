'use client';

import { Pencil, UserRoundSearch } from 'lucide-react';
import AvatarInitials from '@/components/ui/AvatarInitials';
import type { AthleteRow } from './types';

interface Props {
  athlete: AthleteRow;
  matchCount: number;
  onMatch: () => void;
  onEdit: () => void;
}

export default function AthleteCard({ athlete, matchCount, onMatch, onEdit }: Props) {
  return (
    <li
      className="card p-3 group relative"
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
          <button
            onClick={onMatch}
            className="text-[10px] font-bold px-2 py-1 rounded-full"
            style={{ background: 'rgba(124,58,237,0.10)', color: 'var(--purple)' }}
          >
            {matchCount} match{matchCount === 1 ? '' : 'es'}
          </button>
        )}
      </div>

      {/* Hover actions */}
      <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onMatch}
          className="btn-secondary btn-sm flex items-center gap-1"
          style={{ padding: '3px 8px', fontSize: 11 }}
        >
          <UserRoundSearch size={11} /> Match
        </button>
        <button
          onClick={onEdit}
          className="btn-ghost btn-sm flex items-center gap-1"
          style={{ padding: '3px 8px', fontSize: 11 }}
        >
          <Pencil size={11} /> Edit
        </button>
      </div>
    </li>
  );
}
