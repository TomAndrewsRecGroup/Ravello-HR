'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  GraduationCap, Plus, Pencil, Trash2, Loader2, Power, PowerOff, Globe, MapPin, Save, X, Users,
} from 'lucide-react';
import AvatarInitials from '@/components/ui/AvatarInitials';
import LogoUpload from '@/components/modules/LogoUpload';
import OfferingsEditor from './OfferingsEditor';
import type {
  AthleteRow, TrainingInterestRow, TrainingOffering, TrainingProviderRow,
} from './types';

const TrainingInterestsPanel = dynamic(() => import('./TrainingInterestsPanel'), { ssr: false });

interface Props {
  initial: TrainingProviderRow[];
  interests: TrainingInterestRow[];
  athletes: AthleteRow[];
}

interface Draft {
  provider_name: string;
  locations: string;
  category: string;
  website: string;
  offerings: TrainingOffering[];
}

const EMPTY_DRAFT: Draft = {
  provider_name: '', locations: '', category: '', website: '', offerings: [],
};

// Mirror of PartnersClient, but for training_providers + training
// interests. Uses blue (var(--blue)) as the accent so the section
// stands out from the purple partners block above it.

export default function TrainingProvidersClient({ initial, interests, athletes }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState<{ provider: TrainingProviderRow; offering: TrainingOffering | null } | null>(null);

  const [providers, setProviders] = useState<TrainingProviderRow[]>(initial);
  useEffect(() => { setProviders(initial); }, [initial]);
  const refresh = () => startTransition(() => router.refresh());

  const athletesById = useMemo(() => {
    const m = new Map<string, AthleteRow>();
    for (const a of athletes) m.set(a.id, a);
    return m;
  }, [athletes]);

  const interestsByProviderOffering = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of interests) {
      const key = `${i.provider_id}::${i.offering_id ?? '_general'}`;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [interests]);
  const offeringCount = (providerId: string, offeringId: string | null) =>
    interestsByProviderOffering.get(`${providerId}::${offeringId ?? '_general'}`) ?? 0;

  function setBusyFor(id: string, on: boolean) {
    setBusy(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }

  function startNew() { setDraft(EMPTY_DRAFT); setEditing('new'); setError(''); }
  function startEdit(p: TrainingProviderRow) {
    setDraft({
      provider_name: p.provider_name,
      locations: p.locations ?? '',
      category: p.category ?? '',
      website: p.website ?? '',
      offerings: p.offerings,
    });
    setEditing(p.id);
    setError('');
  }
  function cancel() { setEditing(null); setError(''); }

  async function save() {
    if (!draft.provider_name.trim()) { setError('Provider name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const isNew = editing === 'new';
      const res = await fetch(
        isNew ? '/api/admin/training-providers' : `/api/admin/training-providers/${editing}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider_name: draft.provider_name.trim(),
            locations: draft.locations.trim() || null,
            category: draft.category.trim() || null,
            website: draft.website.trim() || null,
            offerings: draft.offerings,
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
    const prev = providers.find(p => p.id === id);
    if (prev) {
      setProviders(curr => curr.map(p => p.id === id ? { ...p, ...body } as TrainingProviderRow : p));
    }
    try {
      const res = await fetch(`/api/admin/training-providers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (prev) setProviders(curr => curr.map(p => p.id === id ? prev : p));
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Update failed');
        return;
      }
    } finally {
      setBusyFor(id, false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this provider? Existing matches will be removed too.')) return;
    setBusyFor(id, true);
    const prev = providers;
    setProviders(curr => curr.filter(p => p.id !== id));
    try {
      const res = await fetch(`/api/admin/training-providers/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setProviders(prev);
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Delete failed');
        return;
      }
    } finally {
      setBusyFor(id, false);
    }
  }

  function providerInterestCount(providerId: string): number {
    return interests.filter(i => i.provider_id === providerId).length;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
             style={{ background: 'rgba(59,111,255,0.10)', color: 'var(--blue)' }}>
          <GraduationCap size={15} />
        </div>
        <div className="flex-1">
          <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
            Training & Workshops
          </h2>
          <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
            Courses, workshops and coaching providers · visible to every client with the channel enabled.
          </p>
        </div>
        {editing === null && (
          <button onClick={startNew} className="btn-sm flex items-center gap-1.5 font-semibold text-white"
                  style={{ background: 'var(--blue)', padding: '6px 12px', borderRadius: 10 }}>
            <Plus size={13} /> Add provider
          </button>
        )}
      </div>

      {/* Edit / new form */}
      {editing !== null && (
        <div className="card p-5 space-y-4" style={{ borderColor: 'rgba(59,111,255,0.30)' }}>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Provider name *</label>
              <input className="input" value={draft.provider_name}
                     onChange={e => setDraft({ ...draft, provider_name: e.target.value })}
                     placeholder="London Business School" />
            </div>
            <div>
              <label className="label">Category</label>
              <input className="input" value={draft.category}
                     onChange={e => setDraft({ ...draft, category: e.target.value })}
                     placeholder="Leadership · Wellbeing · Finance" />
            </div>
            <div>
              <label className="label">Locations</label>
              <input className="input" value={draft.locations}
                     onChange={e => setDraft({ ...draft, locations: e.target.value })}
                     placeholder="London, Online" />
            </div>
            <div>
              <label className="label">Website</label>
              <input className="input" value={draft.website}
                     onChange={e => setDraft({ ...draft, website: e.target.value })}
                     placeholder="provider.com" />
            </div>
          </div>

          <div>
            <p className="label">Courses & workshops</p>
            <OfferingsEditor
              value={draft.offerings}
              onChange={next => setDraft({ ...draft, offerings: next })}
            />
          </div>

          {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
            <button onClick={cancel} className="btn-secondary btn-sm flex items-center gap-1.5">
              <X size={12} /> Cancel
            </button>
            <button onClick={save} disabled={saving}
                    className="btn-sm flex items-center gap-1.5 font-semibold text-white"
                    style={{ background: 'var(--blue)', padding: '6px 12px', borderRadius: 10, opacity: saving ? 0.6 : 1 }}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {editing === 'new' ? 'Create provider' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {/* Provider cards */}
      {providers.length === 0 ? (
        <div className="card p-12 text-center text-sm" style={{ color: 'var(--ink-faint)' }}>
          No providers yet. Add the first one above.
        </div>
      ) : (
        <ul className="grid md:grid-cols-2 gap-3">
          {providers.map(p => {
            const isBusy = busy.has(p.id);
            const totalMatches = providerInterestCount(p.id);
            const generalCount = offeringCount(p.id, null);
            return (
              <li key={p.id}
                  className="card p-4 flex flex-col"
                  style={{
                    borderColor: p.active ? 'rgba(59,111,255,0.20)' : 'rgba(116,128,153,0.20)',
                    opacity: p.active ? 1 : 0.7,
                  }}>
                <div className="flex items-start gap-3">
                  {p.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.logo_url}
                      alt={p.provider_name}
                      width={40}
                      height={40}
                      style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'contain', background: '#fff', border: '1px solid var(--line)' }}
                    />
                  ) : (
                    <AvatarInitials name={p.provider_name} size={40} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                        {p.provider_name}
                      </span>
                      {!p.active && (
                        <span className="badge" style={{ background: 'rgba(116,128,153,0.10)', color: 'var(--ink-faint)' }}>
                          paused
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] flex-wrap" style={{ color: 'var(--ink-faint)' }}>
                      {p.category && <span>{p.category}</span>}
                      {p.locations && (
                        <span className="inline-flex items-center gap-0.5"><MapPin size={10} /> {p.locations}</span>
                      )}
                      {p.website && (
                        <a href={p.website} target="_blank" rel="noopener noreferrer"
                           className="inline-flex items-center gap-0.5 hover:underline" style={{ color: 'var(--blue)' }}>
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

                <div className="mt-3 pt-3" style={{ borderTop: '1px dashed rgba(59,111,255,0.18)' }}>
                  <LogoUpload kind="training_provider" targetId={p.id} currentUrl={p.logo_url} alt={p.provider_name} size={48} />
                </div>

                <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: '1px dashed rgba(59,111,255,0.18)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--blue)' }}>
                    Offerings ({p.offerings.length}) · {totalMatches} interest{totalMatches === 1 ? '' : 's'}
                  </p>
                  {p.offerings.length === 0 ? (
                    <p className="text-[11px] italic" style={{ color: 'var(--ink-faint)' }}>
                      No offerings listed yet.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {p.offerings.map(offering => {
                        const count = offeringCount(p.id, offering.id);
                        return (
                          <li key={offering.id}>
                            <button
                              onClick={() => setViewing({ provider: p, offering })}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[8px] text-left hover:bg-[rgba(59,111,255,0.04)] transition-colors"
                            >
                              <span className="flex-1 text-[12px] truncate" style={{ color: 'var(--ink-soft)' }}>
                                {offering.title}
                              </span>
                              {offering.format && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                                      style={{ background: 'rgba(59,111,255,0.08)', color: 'var(--blue)' }}>
                                  {offering.format}
                                </span>
                              )}
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                                style={{
                                  background: count > 0 ? 'rgba(59,111,255,0.10)' : 'var(--surface-alt)',
                                  color: count > 0 ? 'var(--blue)' : 'var(--ink-faint)',
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
                    onClick={() => setViewing({ provider: p, offering: null })}
                    className="text-[11px] font-semibold inline-flex items-center gap-1 hover:underline mt-1"
                    style={{ color: 'var(--blue)' }}
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
        <TrainingInterestsPanel
          provider={viewing.provider}
          offering={viewing.offering}
          allInterests={interests}
          athletesById={athletesById}
          onClose={() => setViewing(null)}
          onChanged={refresh}
        />
      )}
    </section>
  );
}
