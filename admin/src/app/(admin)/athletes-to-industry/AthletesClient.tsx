'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Trophy, Plus, Trash2, Loader2, Save, X, UserRoundSearch, FileText, ExternalLink, GraduationCap,
} from 'lucide-react';
import AvatarInitials from '@/components/ui/AvatarInitials';
import type {
  AthleteRow, InterestRow, PartnerRow, TrainingInterestRow, TrainingProviderRow,
} from './types';

const MatchPickerModal    = dynamic(() => import('./MatchPickerModal'),    { ssr: false });
const TrainingPickerModal = dynamic(() => import('./TrainingPickerModal'), { ssr: false });

interface CompanyRow { id: string; name: string }

interface Props {
  initial: AthleteRow[];
  partners: PartnerRow[];
  providers: TrainingProviderRow[];
  interests: InterestRow[];
  trainingInterests: TrainingInterestRow[];
  companies: CompanyRow[];
}

interface NewAthleteDraft {
  company_id: string;
  full_name: string;
  email: string;
  sport: string;
  previous_role: string;
  bio: string;
  linkedin_url: string;
}

const EMPTY_DRAFT: NewAthleteDraft = {
  company_id: '', full_name: '', email: '', sport: '', previous_role: '', bio: '', linkedin_url: '',
};

export default function AthletesClient({
  initial, partners, providers, interests, trainingInterests, companies,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [filterCompany, setFilterCompany] = useState<string>('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<NewAthleteDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [matching,         setMatching]         = useState<AthleteRow | null>(null);
  const [matchingTraining, setMatchingTraining] = useState<AthleteRow | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  // Local mirror of the server-fetched athletes list so deletes
  // remove the row instantly without re-running the server component.
  const [athletes, setAthletes] = useState<AthleteRow[]>(initial);

  // Sync local state whenever the server-fetched prop changes — fires
  // after router.refresh() resolves with a freshly-rendered server
  // component (e.g. after a successful create). Without this, new
  // athletes "disappeared" — POST succeeded, refresh ran, but the
  // local list never picked up the new row, so the user only saw it
  // after a hard refresh.
  useEffect(() => { setAthletes(initial); }, [initial]);

  const refresh = () => startTransition(() => router.refresh());

  const interestsByAthlete = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of interests) m.set(i.athlete_id, (m.get(i.athlete_id) ?? 0) + 1);
    return m;
  }, [interests]);

  const trainingByAthlete = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of trainingInterests) m.set(i.athlete_id, (m.get(i.athlete_id) ?? 0) + 1);
    return m;
  }, [trainingInterests]);

  const filtered = useMemo(() => {
    return filterCompany
      ? athletes.filter(a => a.company_id === filterCompany)
      : athletes;
  }, [athletes, filterCompany]);

  function setBusyFor(id: string, on: boolean) {
    setBusy(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }

  async function create() {
    if (!draft.company_id) { setError('Pick a client.'); return; }
    if (!draft.full_name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/athletes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: draft.company_id,
          full_name: draft.full_name.trim(),
          email: draft.email.trim() || null,
          sport: draft.sport.trim() || null,
          previous_role: draft.previous_role.trim() || null,
          bio: draft.bio.trim() || null,
          linkedin_url: draft.linkedin_url.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setDraft(EMPTY_DRAFT);
      setAdding(false);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this athlete? Their CV file and match records go too.')) return;
    setBusyFor(id, true);
    const prev = athletes;
    setAthletes(curr => curr.filter(a => a.id !== id));
    try {
      const res = await fetch(`/api/admin/athletes/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setAthletes(prev);
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Delete failed');
        return;
      }
    } finally {
      setBusyFor(id, false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Trophy size={15} style={{ color: 'var(--purple)' }} />
        <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
          Athletes (across all clients)
        </h2>
        <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          Clients add their own; staff can add on behalf of any client.
        </span>
        <div className="ml-auto flex items-center gap-2">
          <select className="input" style={{ width: 220, padding: '6px 10px', fontSize: 12 }}
                  value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
            <option value="">All clients ({initial.length})</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {!adding && (
            <button onClick={() => { setDraft(EMPTY_DRAFT); setAdding(true); setError(''); }}
                    className="btn-cta btn-sm flex items-center gap-1.5">
              <Plus size={13} /> Add for client
            </button>
          )}
        </div>
      </div>

      {/* Inline create */}
      {adding && (
        <div className="card p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Client *</label>
              <select className="input" value={draft.company_id}
                      onChange={e => setDraft({ ...draft, company_id: e.target.value })}>
                <option value="">Select a client…</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Full name *</label>
              <input className="input" value={draft.full_name}
                     onChange={e => setDraft({ ...draft, full_name: e.target.value })}
                     placeholder="Sarah Mitchell" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={draft.email}
                     onChange={e => setDraft({ ...draft, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Sport</label>
              <input className="input" value={draft.sport}
                     onChange={e => setDraft({ ...draft, sport: e.target.value })}
                     placeholder="Rugby" />
            </div>
            <div>
              <label className="label">Previous role</label>
              <input className="input" value={draft.previous_role}
                     onChange={e => setDraft({ ...draft, previous_role: e.target.value })}
                     placeholder="Fly-half, Harlequins" />
            </div>
            <div>
              <label className="label">LinkedIn</label>
              <input className="input" value={draft.linkedin_url}
                     onChange={e => setDraft({ ...draft, linkedin_url: e.target.value })}
                     placeholder="https://linkedin.com/in/…" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Bio</label>
              <textarea className="input" rows={2} value={draft.bio}
                        onChange={e => setDraft({ ...draft, bio: e.target.value })}
                        placeholder="Short summary." />
            </div>
          </div>

          <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
            CV uploads are done from the client portal — admins can edit profile fields here, but the CV file/text input lives client-side for now.
          </p>

          {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
            <button onClick={() => setAdding(false)} className="btn-secondary btn-sm flex items-center gap-1.5">
              <X size={12} /> Cancel
            </button>
            <button onClick={create} disabled={saving} className="btn-cta btn-sm flex items-center gap-1.5">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Add athlete
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="card p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm" style={{ color: 'var(--ink-faint)' }}>
            {filterCompany ? 'No athletes for this client.' : 'No athletes yet across the platform.'}
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
            {filtered.map(a => {
              const isBusy = busy.has(a.id);
              const matched = interestsByAthlete.get(a.id) ?? 0;
              const trainingMatched = trainingByAthlete.get(a.id) ?? 0;
              return (
                <li key={a.id} className="px-5 py-4 flex gap-4 items-start">
                  <AvatarInitials name={a.full_name} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                        {a.full_name}
                      </span>
                      {a.company_name && (
                        <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                          {a.company_name}
                        </span>
                      )}
                      {matched > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: 'rgba(124,58,237,0.10)', color: 'var(--purple)' }}>
                          {matched} role{matched === 1 ? '' : 's'}
                        </span>
                      )}
                      {trainingMatched > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: 'rgba(59,111,255,0.10)', color: 'var(--blue)' }}>
                          {trainingMatched} training
                        </span>
                      )}
                    </div>
                    {(a.sport || a.previous_role) && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>
                        {[a.sport, a.previous_role].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                      {a.cv_url && (
                        <a href={a.cv_url} target="_blank" rel="noopener noreferrer"
                           className="inline-flex items-center gap-0.5 hover:underline" style={{ color: 'var(--purple)' }}>
                          <FileText size={10} /> {a.cv_filename ?? 'CV'} <ExternalLink size={9} />
                        </a>
                      )}
                      {a.cv_kind === 'text' && (
                        <span className="inline-flex items-center gap-0.5">
                          <FileText size={10} /> Pasted CV
                        </span>
                      )}
                      {a.linkedin_url && (
                        <a href={a.linkedin_url} target="_blank" rel="noopener noreferrer"
                           className="hover:underline" style={{ color: 'var(--purple)' }}>
                          LinkedIn
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setMatching(a)} disabled={isBusy}
                            className="btn-secondary btn-sm flex items-center gap-1"
                            style={{ padding: '4px 8px', fontSize: 11 }}
                            title="Match to partner role">
                      <UserRoundSearch size={11} /> Roles
                    </button>
                    <button onClick={() => setMatchingTraining(a)} disabled={isBusy}
                            className="btn-sm flex items-center gap-1 font-semibold"
                            style={{
                              padding: '4px 8px', fontSize: 11, borderRadius: 8,
                              background: 'rgba(59,111,255,0.08)', color: 'var(--blue)',
                              border: '1px solid rgba(59,111,255,0.20)',
                            }}
                            title="Match to training">
                      <GraduationCap size={11} /> Training
                    </button>
                    <button onClick={() => remove(a.id)} disabled={isBusy} className="btn-icon btn-sm"
                            style={{ color: 'var(--red)' }} title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {matching && (
        <MatchPickerModal
          athlete={matching}
          partners={partners}
          initialInterests={interests.filter(i => i.athlete_id === matching.id)}
          onClose={() => setMatching(null)}
          onChanged={refresh}
        />
      )}
      {matchingTraining && (
        <TrainingPickerModal
          athlete={matchingTraining}
          providers={providers}
          initialInterests={trainingInterests.filter(i => i.athlete_id === matchingTraining.id)}
          onClose={() => setMatchingTraining(null)}
          onChanged={refresh}
        />
      )}
    </section>
  );
}
