'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { GraduationCap, ArrowRight, Globe } from 'lucide-react';
import AvatarInitials from '@/components/ui/AvatarInitials';
import type { TrainingInterestRow, TrainingProviderRow } from './types';

const TrainingModal = dynamic(() => import('./TrainingModal'), { ssr: false });

interface Props {
  providers: TrainingProviderRow[];
  interests: TrainingInterestRow[];
}

// Read-only training & workshops panel.
//
// The People System staff publish providers and their offerings.
// Clients see the line-up + how many of their athletes have been
// matched to courses. Match management is admin-side, mirroring the
// partners/roles flow but with a blue accent.

export default function TrainingPanel({ providers, interests }: Props) {
  const [showAll, setShowAll] = useState(false);

  const interestsByProvider = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of interests) m.set(i.provider_id, (m.get(i.provider_id) ?? 0) + 1);
    return m;
  }, [interests]);

  const recent = providers.slice(0, 6);
  const totalOfferings = providers.reduce((acc, p) => acc + p.offerings.length, 0);

  return (
    <>
      <section className="card p-5 flex flex-col"
               style={{ borderColor: 'rgba(59,111,255,0.20)' }}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
               style={{ background: 'rgba(59,111,255,0.10)', color: 'var(--blue)' }}>
            <GraduationCap size={15} />
          </div>
          <div className="flex-1">
            <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
              Training & Workshops
            </h2>
            <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
              {providers.length} provider{providers.length === 1 ? '' : 's'} · {totalOfferings} offering{totalOfferings === 1 ? '' : 's'}
            </p>
          </div>
          {providers.length > 6 && (
            <button onClick={() => setShowAll(true)}
                    className="text-xs font-semibold flex items-center gap-1 hover:underline"
                    style={{ color: 'var(--blue)' }}>
              See all <ArrowRight size={11} />
            </button>
          )}
        </div>

        {recent.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
            <GraduationCap size={32} className="mb-3 opacity-30" style={{ color: 'var(--ink-faint)' }} />
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--ink-soft)' }}>No providers listed yet</p>
            <p className="text-xs max-w-[260px]" style={{ color: 'var(--ink-faint)' }}>
              The People System will publish training providers and workshops here as they join the programme.
            </p>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-2.5 flex-1 content-start">
            {recent.map(p => (
              <ProviderCard
                key={p.id}
                provider={p}
                matchCount={interestsByProvider.get(p.id) ?? 0}
                onOpen={() => setShowAll(true)}
              />
            ))}
          </ul>
        )}
      </section>

      {showAll && (
        <TrainingModal
          providers={providers}
          interestsByProvider={interestsByProvider}
          interests={interests}
          onClose={() => setShowAll(false)}
        />
      )}
    </>
  );
}

function ProviderCard({ provider, matchCount, onOpen }: {
  provider: TrainingProviderRow; matchCount: number; onOpen: () => void;
}) {
  return (
    <li
      className="card p-3 cursor-pointer hover:shadow-md transition-shadow"
      style={{ boxShadow: 'none', borderColor: 'rgba(59,111,255,0.18)' }}
      onClick={onOpen}
    >
      <div className="flex items-center gap-3">
        {provider.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={provider.logo_url} alt={provider.provider_name} width={36} height={36}
               style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'contain', background: '#fff', border: '1px solid var(--line)' }} />
        ) : (
          <AvatarInitials name={provider.provider_name} size={36} />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[13px] leading-tight truncate" style={{ color: 'var(--ink)' }}>
            {provider.provider_name}
          </p>
          <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--ink-soft)' }}>
            {provider.category || provider.locations || 'Training provider'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
        <span>{provider.offerings.length} offering{provider.offerings.length === 1 ? '' : 's'}</span>
        {matchCount > 0 && (
          <>
            <span>·</span>
            <span style={{ color: 'var(--blue)', fontWeight: 600 }}>{matchCount} interested</span>
          </>
        )}
        {provider.website && (
          <a href={provider.website} target="_blank" rel="noopener noreferrer"
             onClick={e => e.stopPropagation()}
             className="ml-auto inline-flex items-center gap-0.5 hover:underline">
            <Globe size={10} /> site
          </a>
        )}
      </div>
    </li>
  );
}
