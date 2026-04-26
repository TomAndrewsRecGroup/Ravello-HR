'use client';

import { useMemo, useRef, useState } from 'react';
import { X, Search, ChevronDown, ChevronRight, Globe, MapPin, ExternalLink } from 'lucide-react';
import AvatarInitials from '@/components/ui/AvatarInitials';
import { useModalShell } from '@/components/ui/useModalShell';
import type { InterestRow, PartnerRow, RoleOpportunity } from './types';

interface Props {
  partners: PartnerRow[];
  interests: InterestRow[];
  interestsByPartner: Map<string, number>;
  onClose: () => void;
  onOpenRole: (partner: PartnerRow, role: RoleOpportunity | null) => void;
}

export default function PartnersModal({
  partners, interests, interestsByPartner, onClose, onOpenRole,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalShell(true, onClose, dialogRef);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!query.trim()) return partners;
    const q = query.toLowerCase();
    return partners.filter(p => {
      if (p.company_name.toLowerCase().includes(q)) return true;
      if (p.locations?.toLowerCase().includes(q)) return true;
      if (p.industry?.toLowerCase().includes(q)) return true;
      return p.role_opportunities.some(r =>
        r.title.toLowerCase().includes(q)
        || r.description?.toLowerCase().includes(q)
        || r.location?.toLowerCase().includes(q));
    });
  }, [partners, query]);

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function roleInterestCount(partnerId: string, roleId: string | null): number {
    return interests.filter(i => i.partner_id === partnerId && i.role_opportunity_id === roleId).length;
  }

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
        role="dialog" aria-modal="true" aria-labelledby="partners-modal-title"
      >
        <div className="px-6 py-5 flex items-center gap-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <h2 id="partners-modal-title" className="font-display text-lg font-semibold flex-1" style={{ color: 'var(--ink)' }}>
            Partners ({partners.length})
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
              placeholder="Search partners, industries, role titles or locations"
              className="input pl-10"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center text-sm py-12" style={{ color: 'var(--ink-faint)' }}>
              No partners match your search.
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
              {filtered.map(p => {
                const isOpen = expanded.has(p.id);
                const matched = interestsByPartner.get(p.id) ?? 0;
                return (
                  <li key={p.id} className="px-6 py-4">
                    <button
                      onClick={() => toggle(p.id)}
                      className="w-full flex items-center gap-3 text-left"
                    >
                      <AvatarInitials name={p.company_name} size={36} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                          {p.company_name}
                        </p>
                        <p className="text-xs mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: 'var(--ink-soft)' }}>
                          {p.industry && <span>{p.industry}</span>}
                          {p.locations && (
                            <span className="inline-flex items-center gap-0.5">
                              <MapPin size={10} /> {p.locations}
                            </span>
                          )}
                          <span>· {p.role_opportunities.length} role{p.role_opportunities.length === 1 ? '' : 's'}</span>
                        </p>
                      </div>
                      {matched > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: 'rgba(124,58,237,0.10)', color: 'var(--purple)' }}>
                          {matched} matched
                        </span>
                      )}
                      {isOpen
                        ? <ChevronDown size={14} style={{ color: 'var(--ink-faint)' }} />
                        : <ChevronRight size={14} style={{ color: 'var(--ink-faint)' }} />}
                    </button>

                    {isOpen && (
                      <div className="mt-3 pl-12 space-y-2">
                        {p.website && (
                          <a href={p.website} target="_blank" rel="noopener noreferrer"
                             className="inline-flex items-center gap-1 text-xs hover:underline"
                             style={{ color: 'var(--purple)' }}>
                            <Globe size={11} /> {p.website.replace(/^https?:\/\//, '')}
                          </a>
                        )}

                        {p.role_opportunities.length === 0 ? (
                          <p className="text-xs italic" style={{ color: 'var(--ink-faint)' }}>
                            No roles listed yet.
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {p.role_opportunities.map(role => {
                              const count = roleInterestCount(p.id, role.id);
                              return (
                                <li key={role.id} className="rounded-[10px] p-3" style={{ background: 'var(--surface-soft)' }}>
                                  <div className="flex items-start gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                                        {role.title}
                                      </p>
                                      {role.description && (
                                        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>
                                          {role.description}
                                        </p>
                                      )}
                                      <div className="flex items-center gap-2 mt-1.5 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                                        {role.location && (
                                          <span className="inline-flex items-center gap-0.5">
                                            <MapPin size={10} /> {role.location}
                                          </span>
                                        )}
                                        {role.url && (
                                          <a href={role.url} target="_blank" rel="noopener noreferrer"
                                             className="inline-flex items-center gap-0.5 hover:underline"
                                             style={{ color: 'var(--purple)' }}>
                                            View role <ExternalLink size={9} />
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => onOpenRole(p, role)}
                                      className="text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap"
                                      style={{
                                        background: count > 0 ? 'rgba(124,58,237,0.10)' : 'var(--surface)',
                                        color: count > 0 ? 'var(--purple)' : 'var(--ink-soft)',
                                        border: '1px solid var(--line)',
                                      }}
                                    >
                                      {count} interested
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}

                        <button
                          onClick={() => onOpenRole(p, null)}
                          className="text-[11px] font-semibold inline-flex items-center gap-1 hover:underline mt-1"
                          style={{ color: 'var(--purple)' }}
                        >
                          View general interest in {p.company_name}
                        </button>
                      </div>
                    )}
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
