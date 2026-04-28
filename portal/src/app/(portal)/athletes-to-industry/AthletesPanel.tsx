'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Trophy, ArrowRight } from 'lucide-react';
import AvatarInitials from '@/components/ui/AvatarInitials';
import AthleteCard from './AthleteCard';
import type { AthleteRow, InterestRow } from './types';

const AthletesModal = dynamic(() => import('./AthletesModal'), { ssr: false });

interface Props {
  athletes: AthleteRow[];
  interests: InterestRow[];
}

// Read-only athletes panel.
//
// The People System staff own the recruitment side of the Athletes
// To Industry programme — adding athletes, matching them to partner
// roles, tracking interest. The client just sees their roster here
// with the match count for each athlete. Edit + match flows are
// handled in the admin portal.

export default function AthletesPanel({ athletes, interests }: Props) {
  const [showAll, setShowAll] = useState(false);

  const interestsByAthlete = useMemo(() => {
    const m = new Map<string, InterestRow[]>();
    for (const i of interests) {
      const arr = m.get(i.athlete_id) ?? [];
      arr.push(i);
      m.set(i.athlete_id, arr);
    }
    return m;
  }, [interests]);

  const recent = athletes.slice(0, 6);

  return (
    <>
      <section className="card p-5 flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
               style={{ background: 'rgba(124,58,237,0.10)', color: 'var(--purple)' }}>
            <Trophy size={15} />
          </div>
          <div className="flex-1">
            <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
              Your athletes
            </h2>
            <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
              {athletes.length} on your roster · The People System manages matches
            </p>
          </div>
          {athletes.length > 6 && (
            <button onClick={() => setShowAll(true)}
                    className="text-xs font-semibold flex items-center gap-1 hover:underline"
                    style={{ color: 'var(--purple)' }}>
              See all <ArrowRight size={11} />
            </button>
          )}
        </div>

        {recent.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
            <AvatarInitials name="?" size={48} className="mb-3 opacity-30" />
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--ink-soft)' }}>No athletes yet</p>
            <p className="text-xs max-w-[260px]" style={{ color: 'var(--ink-faint)' }}>
              Your athlete roster is managed by The People System. Get in touch to start building it.
            </p>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-2.5 flex-1 content-start">
            {recent.map(a => (
              <AthleteCard
                key={a.id}
                athlete={a}
                matchCount={interestsByAthlete.get(a.id)?.length ?? 0}
              />
            ))}
          </ul>
        )}
      </section>

      {showAll && (
        <AthletesModal
          athletes={athletes}
          interestsByAthlete={interestsByAthlete}
          onClose={() => setShowAll(false)}
        />
      )}
    </>
  );
}
