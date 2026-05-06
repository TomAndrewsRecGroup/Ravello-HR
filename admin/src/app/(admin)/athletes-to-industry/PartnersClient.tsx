'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Building2, Plus, Pencil, Trash2, Loader2, Power, PowerOff, Globe, MapPin, Save, X, Users,
} from 'lucide-react';
import AvatarInitials from '@/components/ui/AvatarInitials';
import LogoUpload from '@/components/modules/LogoUpload';
import RoleOpportunitiesEditor from './RoleOpportunitiesEditor';
import type { AthleteRow, InterestRow, PartnerRow, RoleOpportunity } from './types';

const RoleInterestsPanel = dynamic(() => import('./RoleInterestsPanel'), { ssr: false });

interface Props {
  initial: PartnerRow[];
  interests: InterestRow[];
  athletes: AthleteRow[];
}

interface Draft {
  company_name: string;
  locations: string;
  industry: string;
  website: string;
  role_opportunities: RoleOpportunity[];
}

const EMPTY_DRAFT: Draft = {
  company_name: '', locations: '', industry: '', website: '', role_opportunities: [],
};

export default function PartnersClient({ initial, interests, athletes }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState<{ partner: PartnerRow; role: RoleOpportunity | null } | null>(null);

  const [partners, setPartners] = useState<PartnerRow[]>(initial);
  useEffect(() => { setPartners(initial); }, [initial]);
  const refresh = () => startTransition(() => router.refresh());

  const athletesById = useMemo(() => {
    const m = new Map<string, AthleteRow>();
    for (const a of athletes) m.set(a.id, a);
    return m;
  }, [athletes]);

  const interestsByPartnerRole = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of interests) {
      const key = `${i.partner_id}::${i.role_opportunity_id ?? '_general'}`;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [interests]);
  const roleCount = (partnerId: string, roleId: string | null) =>
    interestsByPartnerRole.get(`${partnerId}::${roleId ?? '_general'}`) ?? 0;

  function setBusyFor(id: string, on: boolean) {
    setBusy(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }

  function startNew() { setDraft(EMPTY_DRAFT); setEditing('new'); setError(''); }
  function startEdit(p: PartnerRow) {
    setDraft({
      company_name: p.company_name,
      locations: p.locations ?? '',
      industry: p.industry ?? '',
      website: p.website ?? '',
      role_opportunities: p.role_opportunities,
    });
    setEditing(p.id);
    setError('');
  }
  function cancel() { setEditing(null); setError(''); }

  async function save() {
    if (!draft.company_name.trim()) { setError('Company name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const isNew = editing === 'new';
      const res = await fetch(
        isNew ? '/api/admin/partners' : `/api/admin/partners/${editing}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_name: draft.company_name.trim(),
            locations: draft.locations.trim() || null,
            industry: draft.industry.trim() || null,
            website: draft.website.trim() || null,
            role_opportunities: draft.role_opportunities,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setEditing(null);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyFor(id, true);
    const prev = partners.find(p => p.id === id);
    if (prev) {
      setPartners(curr => curr.map(p => p.id === id ? { ...p, ...body } as PartnerRow : p));
    }
    try {
      const res = await fetch(`/api/admin/partners/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (prev) setPartners(curr => curr.map(p => p.id === id ? prev : p));
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Update failed');
        return;
      }
    } finally {
      setBusyFor(id, false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this partner? Existing matches will be removed too.')) return;
    setBusyFor(id, true);
    const prev = partners;
    setPartners(curr => curr.filter(p => p.id !== id));
    try {
      const res = await fetch(`/api/admin/partners/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setPartners(prev);
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Delete failed');
        return;
      }
    } finally {
      setBusyFor(id, false);
    }
  }

  function partnerInterestCount(partnerId: string): number {
    return interests.filter(i => i.partner_id === partnerId).length;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
             style={{ background: 'rgba(124,58,237,0.10)', color: 'var(--purple)' }}>
          <Building2 size={15} />
        </div>
        <div className="flex-1">
          <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
            Partners
          </h2>
          <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
            Platform-wide pool · visible to every client with the channel enabled.
          </p>
        </div>
        {editing === null && (
          <button onClick={startNew} className="btn-cta btn-sm flex items-center gap-1.5">
            <Plus size={13} /> Add partner
          </button>
        )}
      </div>

      {/* Edit / new form */}
      {editing !== null && (
        <div className="card p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Company name *</label>
              <input className="input" value={draft.company_name}
                     onChange={e => setDraft({ ...draft, company_name: e.target.value })}
                     placeholder="Acme Manufacturing" />
            </div>
            <div>
              <label className="label">Industry</label>
              <input className="input" value={draft.industry}
                     onChange={e => setDraft({ ...draft, industry: e.target.value })}
                     placeholder="Manufacturing" />
            </div>
            <div>
              <label className="label">Locations</label>
              <input className="input" value={draft.locations}
                     onChange={e => setDraft({ ...draft, locations: e.target.value })}
                     placeholder="London, Manchester, Remote" />
            </div>
            <div>
              <label className="label">Website</label>
              <input className="input" value={draft.website}
                     onChange={e => setDraft({ ...draft, website: e.target.value })}
                     placeholder="acme.com" />
            </div>
          </div>

          <div>
            <p className="label">Role opportunities</p>
            <RoleOpportunitiesEditor
              value={draft.role_opportunities}
              onChange={next => setDraft({ ...draft, role_opportunities: next })}
            />
          </div>

          {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
            <button onClick={cancel} className="btn-secondary btn-sm flex items-center gap-1.5">
              <X size={12} /> Cancel
            </button>
            <button onClick={save} disabled={saving} className="btn-cta btn-sm flex items-center gap-1.5">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {editing === 'new' ? 'Create partner' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {/* Partner cards */}
      {partners.length === 0 ? (
        <div className="card p-12 text-center text-sm" style={{ color: 'var(--ink-faint)' }}>
          No partners yet. Add the first one above.
        </div>
      ) : (
        <ul className="grid md:grid-cols-2 gap-3">
          {partners.map(p => {
            const isBusy = busy.has(p.id);
            const totalMatches = partnerInterestCount(p.id);
            const generalCount = roleCount(p.id, null);
            return (
              <li key={p.id}
                  className="card p-4 flex flex-col"
                  style={{ borderColor: p.active ? 'var(--line)' : 'rgba(116,128,153,0.20)', opacity: p.active ? 1 : 0.7 }}>
                <div className="flex items-start gap-3">
                  {p.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.logo_url}
                      alt={p.company_name}
                      width={40}
                      height={40}
                      style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'contain', background: '#fff', border: '1px solid var(--line)' }}
                    />
                  ) : (
                    <AvatarInitials name={p.company_name} size={40} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                        {p.company_name}
                      </span>
                      {!p.active && (
                        <span className="badge" style={{ background: 'rgba(116,128,153,0.10)', color: 'var(--ink-faint)' }}>
                          paused
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] flex-wrap" style={{ color: 'var(--ink-faint)' }}>
                      {p.industry && <span>{p.industry}</span>}
                      {p.locations && (
                        <span className="inline-flex items-center gap-0.5"><MapPin size={10} /> {p.locations}</span>
                      )}
                      {p.website && (
                        <a href={p.website} target="_blank" rel="noopener noreferrer"
                           className="inline-flex items-center gap-0.5 hover:underline" style={{ color: 'var(--purple)' }}>
                          <Globe size={10} /> site
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => startEdit(p)} disabled={isBusy} className="btn-icon btn-sm" title="Edit">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => patch(p.id, { active: !p.active })} disabled={isBusy} className="btn-icon btn-sm"
                            title={p.active ? 'Pause' : 'Resume'}>
                      {p.active ? <Power size={12} /> : <PowerOff size={12} />}
                    </button>
                    <button onClick={() => remove(p.id)} disabled={isBusy} className="btn-icon btn-sm"
                            style={{ color: 'var(--red)' }} title="Delete">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                <div className="mt-3 pt-3" style={{ borderTop: '1px dashed var(--line)' }}>
                  <LogoUpload kind="partner" targetId={p.id} currentUrl={p.logo_url} alt={p.company_name} size={48} />
                </div>

                <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: '1px dashed var(--line)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>
                    Roles ({p.role_opportunities.length}) · {totalMatches} match{totalMatches === 1 ? '' : 'es'}
                  </p>
                  {p.role_opportunities.length === 0 ? (
                    <p className="text-[11px] italic" style={{ color: 'var(--ink-faint)' }}>
                      No roles listed yet.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {p.role_opportunities.map(role => {
                        const count = roleCount(p.id, role.id);
                        return (
                          <li key={role.id}>
                            <button
                              onClick={() => setViewing({ partner: p, role })}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[8px] text-left hover:bg-[var(--surface-soft)] transition-colors"
                            >
                              <span className="flex-1 text-[12px] truncate" style={{ color: 'var(--ink-soft)' }}>
                                {role.title}
                              </span>
                              {role.location && (
                                <span className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                                  {role.location}
                                </span>
                              )}
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                                style={{
                                  background: count > 0 ? 'rgba(124,58,237,0.10)' : 'var(--surface-alt)',
                                  color: count > 0 ? 'var(--purple)' : 'var(--ink-faint)',
                                }}
                              >
                                <Users size={9} /> {count}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <button
                    onClick={() => setViewing({ partner: p, role: null })}
                    className="text-[11px] font-semibold inline-flex items-center gap-1 hover:underline mt-1"
                    style={{ color: 'var(--purple)' }}
                  >
                    General interest · {generalCount}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {viewing && (
        <RoleInterestsPanel
          partner={viewing.partner}
          role={viewing.role}
          allInterests={interests}
          athletesById={athletesById}
          onClose={() => setViewing(null)}
          onChanged={refresh}
        />
      )}
    </section>
  );
}
