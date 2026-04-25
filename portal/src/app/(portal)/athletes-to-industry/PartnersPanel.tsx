'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Building2, ArrowRight, Globe } from 'lucide-react';
import AvatarInitials from '@/components/ui/AvatarInitials';
import type { AthleteRow, InterestRow, PartnerRow, RoleOpportunity } from './types';

const PartnersModal      = dynamic(() => import('./PartnersModal'),      { ssr: false });
const RoleInterestsPanel = dynamic(() => import('./RoleInterestsPanel'), { ssr: false });

interface Props {
  partners: PartnerRow[];
  athletes: AthleteRow[];
  interests: InterestRow[];
}

export default function PartnersPanel({ partners, athletes, interests }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());
  const [showAll, setShowAll] = useState(false);
  const [viewingRole, setViewingRole] = useState<{ partner: PartnerRow; role: RoleOpportunity | null } | null>(null);

  const athletesById = useMemo(() => {
    const m = new Map<string, AthleteRow>();
    for (const a of athletes) m.set(a.id, a);
    return m;
  }, [athletes]);

  const interestsByPartner = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of interests) m.set(i.partner_id, (m.get(i.partner_id) ?? 0) + 1);
    return m;
  }, [interests]);

  const recent = partners.slice(0, 6);
  const totalRoles = partners.reduce((acc, p) => acc + p.role_opportunities.length, 0);

  return (
    <>
      <section className="card p-5 flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
               style={{ background: 'rgba(20,184,166,0.10)', color: 'var(--teal)' }}>
            <Building2 size={15} />
          </div>
          <div className="flex-1">
            <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
              Partners & roles
            </h2>
            <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
              {partners.length} partner{partners.length === 1 ? '' : 's'} · {totalRoles} role{totalRoles === 1 ? '' : 's'} open
            </p>
          </div>
          {partners.length > 6 && (
            <button onClick={() => setShowAll(true)}
                    className="text-xs font-semibold flex items-center gap-1 hover:underline"
                    style={{ color: 'var(--purple)' }}>
              See all <ArrowRight size={11} />
            </button>
          )}
        </div>

        {recent.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
            <Building2 size={32} className="mb-3 opacity-30" style={{ color: 'var(--ink-faint)' }} />
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--ink-soft)' }}>No partners listed yet</p>
            <p className="text-xs max-w-[260px]" style={{ color: 'var(--ink-faint)' }}>
              The People System will publish partner companies here as they join the programme.
            </p>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-2.5 flex-1 content-start">
            {recent.map(p => (
              <PartnerCard
                key={p.id}
                partner={p}
                matchCount={interestsByPartner.get(p.id) ?? 0}
                onOpen={() => setShowAll(true)}
              />
            ))}
          </ul>
        )}
      </section>

      {showAll && (
        <PartnersModal
          partners={partners}
          interestsByPartner={interestsByPartner}
          interests={interests}
          onClose={() => setShowAll(false)}
          onOpenRole={(partner, role) => setViewingRole({ partner, role })}
        />
      )}

      {viewingRole && (
        <RoleInterestsPanel
          partner={viewingRole.partner}
          role={viewingRole.role}
          allInterests={interests}
          athletesById={athletesById}
          apiBase="/api"
          staffView={false}
          onClose={() => setViewingRole(null)}
          onChanged={refresh}
        />
      )}
    </>
  );
}

function PartnerCard({ partner, matchCount, onOpen }: {
  partner: PartnerRow; matchCount: number; onOpen: () => void;
}) {
  return (
    <li
      className="card p-3 cursor-pointer hover:shadow-md transition-shadow"
      style={{ boxShadow: 'none', borderColor: 'var(--line)' }}
      onClick={onOpen}
    >
      <div className="flex items-center gap-3">
        <AvatarInitials name={partner.company_name} size={36} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[13px] leading-tight truncate" style={{ color: 'var(--ink)' }}>
            {partner.company_name}
          </p>
          <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--ink-soft)' }}>
            {partner.industry || partner.locations || 'Partner'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
        <span>{partner.role_opportunities.length} role{partner.role_opportunities.length === 1 ? '' : 's'}</span>
        {matchCount > 0 && (
          <>
            <span>·</span>
            <span style={{ color: 'var(--purple)', fontWeight: 600 }}>{matchCount} matched</span>
          </>
        )}
        {partner.website && (
          <a href={partner.website} target="_blank" rel="noopener noreferrer"
             onClick={e => e.stopPropagation()}
             className="ml-auto inline-flex items-center gap-0.5 hover:underline">
            <Globe size={10} /> site
          </a>
        )}
      </div>
    </li>
  );
}
