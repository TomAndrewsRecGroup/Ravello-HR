'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Trophy, ArrowRight, Plus } from 'lucide-react';
import AvatarInitials from '@/components/ui/AvatarInitials';
import AthleteCard from './AthleteCard';
import type { AthleteRow, InterestRow, PartnerRow, TrainingInterestRow, TrainingProviderRow } from './types';
import type { AthleteNote, AthleteDevPlanLink } from './AthleteFormModal';

interface DevPlanRow {
  id: string;
  title: string;
  status: string;
  athlete_id: string | null;
}

const AthletesModal    = dynamic(() => import('./AthletesModal'),    { ssr: false });
const AthleteFormModal = dynamic(() => import('./AthleteFormModal'), { ssr: false });

interface Props {
  athletes: AthleteRow[];
  interests: InterestRow[];
  partners?: PartnerRow[];
  providers?: TrainingProviderRow[];
  trainingInterests?: TrainingInterestRow[];
  devPlans?: DevPlanRow[];
}

// Client-portal athletes panel.
//
// Clients own the roster: they add athletes here and upload (or paste)
// each CV. Match management is admin-only — when a client adds an
// athlete, The People System staff handle introductions to partner
// roles + training providers and the match counts surface back here
// on each card.

export default function AthletesPanel({ athletes, interests, partners = [], providers = [], trainingInterests = [], devPlans = [] }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  const [showAll, setShowAll] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AthleteRow | null>(null);

  const interestsByAthlete = useMemo(() => {
    const m = new Map<string, InterestRow[]>();
    for (const i of interests) {
      const arr = m.get(i.athlete_id) ?? [];
      arr.push(i);
      m.set(i.athlete_id, arr);
    }
    return m;
  }, [interests]);

  const partnerById = useMemo(() => new Map(partners.map(p => [p.id, p])), [partners]);
  const providerById = useMemo(() => new Map(providers.map(p => [p.id, p])), [providers]);

  function devPlansFor(athleteId: string): AthleteDevPlanLink[] {
    return devPlans
      .filter(p => p.athlete_id === athleteId)
      .map(p => ({ id: p.id, title: p.title, status: p.status }));
  }

  function notesFor(athleteId: string): AthleteNote[] {
    const out: AthleteNote[] = [];
    for (const i of interests) {
      if (i.athlete_id !== athleteId || !i.notes) continue;
      const p = partnerById.get(i.partner_id);
      out.push({ label: p?.company_name ?? 'Partner', status: i.status, note: i.notes });
    }
    for (const t of trainingInterests) {
      if (t.athlete_id !== athleteId || !t.notes) continue;
      const p = providerById.get(t.provider_id);
      out.push({ label: p?.provider_name ?? 'Training', status: t.status, note: t.notes });
    }
    return out;
  }

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
          <button onClick={() => setCreating(true)} className="btn-cta btn-sm flex items-center gap-1.5">
            <Plus size={12} /> Add athlete
          </button>
        </div>

        {recent.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
            <AvatarInitials name="?" size={48} className="mb-3 opacity-30" />
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--ink-soft)' }}>No athletes yet</p>
            <p className="text-xs max-w-[260px]" style={{ color: 'var(--ink-faint)' }}>
              Add your first athlete and upload their CV — The People System will take it from there.
            </p>
            <button onClick={() => setCreating(true)} className="btn-cta btn-sm flex items-center gap-1.5 mt-4">
              <Plus size={12} /> Add your first athlete
            </button>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-2.5 flex-1 content-start">
            {recent.map(a => (
              <AthleteCard
                key={a.id}
                athlete={a}
                matchCount={interestsByAthlete.get(a.id)?.length ?? 0}
                onEdit={() => setEditing(a)}
              />
            ))}
          </ul>
        )}
      </section>

      {showAll && (
        <AthletesModal
          athletes={athletes}
          interestsByAthlete={interestsByAthlete}
          onEdit={(a) => { setShowAll(false); setEditing(a); }}
          onClose={() => setShowAll(false)}
        />
      )}

      {creating && (
        <AthleteFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); refresh(); }}
        />
      )}

      {editing && (
        <AthleteFormModal
          mode="edit"
          athlete={editing}
          notes={notesFor(editing.id)}
          devPlans={devPlansFor(editing.id)}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
    </>
  );
}
