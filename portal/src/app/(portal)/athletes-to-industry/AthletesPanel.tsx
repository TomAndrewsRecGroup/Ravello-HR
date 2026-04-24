'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trophy, ArrowRight, Sparkles } from 'lucide-react';
import AvatarInitials from '@/components/ui/AvatarInitials';
import AthleteCard from './AthleteCard';
import AthletesModal from './AthletesModal';
import AthleteFormModal from './AthleteFormModal';
import MatchPickerModal from './MatchPickerModal';
import type { AthleteRow, InterestRow, PartnerRow } from './types';

interface Props {
  athletes: AthleteRow[];
  partners: PartnerRow[];
  interests: InterestRow[];
}

export default function AthletesPanel({ athletes, partners, interests }: Props) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<AthleteRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [matching, setMatching] = useState<AthleteRow | null>(null);

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
              {athletes.length} on your roster
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
              Add your first athlete to start matching them with partner roles.
            </p>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-2.5 flex-1 content-start">
            {recent.map(a => (
              <AthleteCard
                key={a.id}
                athlete={a}
                matchCount={interestsByAthlete.get(a.id)?.length ?? 0}
                onMatch={() => setMatching(a)}
                onEdit={() => setEditing(a)}
              />
            ))}
          </ul>
        )}

        <button
          onClick={() => setCreating(true)}
          className="btn-cta btn-sm mt-4 flex items-center justify-center gap-1.5 self-start"
        >
          <Plus size={13} /> Add athlete
        </button>
      </section>

      {showAll && (
        <AthletesModal
          athletes={athletes}
          interestsByAthlete={interestsByAthlete}
          onClose={() => setShowAll(false)}
          onMatch={a => { setShowAll(false); setMatching(a); }}
          onEdit={a => { setShowAll(false); setEditing(a); }}
        />
      )}

      {creating && (
        <AthleteFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={(saved, openMatch) => {
            setCreating(false);
            router.refresh();
            if (openMatch) setMatching(saved);
          }}
        />
      )}

      {editing && (
        <AthleteFormModal
          mode="edit"
          athlete={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}

      {matching && (
        <MatchPickerModal
          athlete={matching}
          partners={partners}
          initialInterests={interests.filter(i => i.athlete_id === matching.id)}
          apiBase="/api"
          onClose={() => setMatching(null)}
          onChanged={() => router.refresh()}
        />
      )}

      {/* Empty state CTA when no partners exist yet */}
      {athletes.length > 0 && partners.length === 0 && (
        <p className="text-[11px] mt-2 px-1 inline-flex items-center gap-1" style={{ color: 'var(--ink-faint)' }}>
          <Sparkles size={11} /> Once partners list roles you&apos;ll be able to match athletes here.
        </p>
      )}
    </>
  );
}
