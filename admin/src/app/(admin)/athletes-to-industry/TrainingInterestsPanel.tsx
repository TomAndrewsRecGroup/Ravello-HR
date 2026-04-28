'use client';

import { useMemo, useRef, useState } from 'react';
import { X, Trash2, ExternalLink, FileText } from 'lucide-react';
import AvatarInitials from '@/components/ui/AvatarInitials';
import { useModalShell } from '@/components/ui/useModalShell';
import { trainingInterestApi } from './api';
import type {
  AthleteRow, TrainingInterestRow, TrainingOffering, TrainingProviderRow, TrainingStatus,
} from './types';

interface Props {
  provider: TrainingProviderRow;
  /** null = "general interest" / provider-only matches */
  offering: TrainingOffering | null;
  allInterests: TrainingInterestRow[];
  athletesById: Map<string, AthleteRow>;
  onClose: () => void;
  onChanged?: () => void;
}

// Slide-over panel listing every athlete who's flagged interest in a
// training provider's offering. Mirrors RoleInterestsPanel but for the
// `athlete_training_interests` table — different status enum
// (interested → enrolled → completed → passed) and blue accent.

export default function TrainingInterestsPanel({
  provider, offering, allInterests, athletesById, onClose, onChanged,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalShell(true, onClose, dialogRef);

  const [overrides, setOverrides] = useState<Map<string, TrainingInterestRow | null>>(new Map());
  const [error, setError] = useState('');

  const rows = useMemo(() => {
    const matching = allInterests.filter(i =>
      i.provider_id === provider.id
      && (offering ? i.offering_id === offering.id : i.offering_id === null),
    );
    const out: { interest: TrainingInterestRow; athlete: AthleteRow }[] = [];
    for (const base of matching) {
      const override = overrides.get(base.id);
      if (override === null) continue;
      const interest = override ?? base;
      const athlete = athletesById.get(interest.athlete_id);
      if (!athlete) continue;
      out.push({ interest, athlete });
    }
    return out;
  }, [allInterests, athletesById, provider.id, offering, overrides]);

  async function changeStatus(id: string, status: TrainingStatus) {
    const current = rows.find(r => r.interest.id === id);
    if (!current || current.interest.status === status) return;
    const updated: TrainingInterestRow = { ...current.interest, status };
    setOverrides(prev => new Map(prev).set(id, updated));
    try {
      await trainingInterestApi.patch(id, { status });
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
      setOverrides(prev => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this match?')) return;
    setOverrides(prev => new Map(prev).set(id, null));
    try {
      await trainingInterestApi.remove(id);
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
      setOverrides(prev => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end"
      style={{ background: 'rgba(7,11,29,0.45)' }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="card h-full w-full max-w-[520px] overflow-hidden flex flex-col p-0"
        style={{ borderRadius: 0, boxShadow: '-12px 0 32px rgba(7,11,29,0.18)' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="training-interests-title"
      >
        <div className="px-6 py-5 flex items-start gap-3" style={{ borderBottom: '1px solid var(--line)', background: 'rgba(59,111,255,0.04)' }}>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--blue)' }}>
              Interested athletes
            </p>
            <h2 id="training-interests-title" className="font-display text-base font-semibold mt-1" style={{ color: 'var(--ink)' }}>
              {offering ? offering.title : 'General interest'}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>
              {provider.provider_name}
              {offering?.format ? ` · ${offering.format}` : ''}
              {offering?.location ? ` · ${offering.location}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="btn-icon btn-ghost" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="px-6 py-3 text-sm" style={{ color: 'var(--red)' }}>{error}</div>
          )}
          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm" style={{ color: 'var(--ink-faint)' }}>
              No athletes have shown interest yet.
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
              {rows.map(({ interest, athlete }) => (
                <li key={interest.id} className="px-6 py-4 flex gap-3 items-start">
                  <AvatarInitials name={athlete.full_name} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate" style={{ color: 'var(--ink)' }}>
                        {athlete.full_name}
                      </span>
                      {athlete.company_name && (
                        <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                          {athlete.company_name}
                        </span>
                      )}
                    </div>
                    {(athlete.sport || athlete.previous_role) && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>
                        {[athlete.sport, athlete.previous_role].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {athlete.cv_url && (
                      <a
                        href={athlete.cv_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] mt-1.5 hover:underline"
                        style={{ color: 'var(--blue)' }}
                      >
                        <FileText size={10} /> {athlete.cv_filename ?? 'CV'} <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <select
                      value={interest.status}
                      onChange={e => changeStatus(interest.id, e.target.value as TrainingStatus)}
                      className="input"
                      style={{ padding: '3px 22px 3px 8px', fontSize: 11, width: 'auto' }}
                    >
                      <option value="interested">Interested</option>
                      <option value="enrolled">Enrolled</option>
                      <option value="completed">Completed</option>
                      <option value="passed">Passed</option>
                    </select>
                    <button
                      onClick={() => remove(interest.id)}
                      className="btn-icon btn-ghost"
                      style={{ width: 24, height: 24, color: 'var(--red)' }}
                      aria-label="Remove"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
