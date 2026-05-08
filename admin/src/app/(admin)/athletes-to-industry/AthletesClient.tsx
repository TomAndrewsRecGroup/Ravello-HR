'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Trophy, Plus, Trash2, Loader2, Save, X, UserRoundSearch, FileText, ExternalLink, GraduationCap,
  Upload, Type as TypeIcon,
} from 'lucide-react';
import AvatarInitials from '@/components/ui/AvatarInitials';
import { openAthleteCv } from './openCv';
import type {
  AthleteRow, InterestRow, PartnerRow, TrainingInterestRow, TrainingProviderRow,
} from './types';

const MatchPickerModal    = dynamic(() => import('./MatchPickerModal'),    { ssr: false });
const TrainingPickerModal = dynamic(() => import('./TrainingPickerModal'), { ssr: false });
const AthleteProfileModal = dynamic(() => import('./AthleteProfileModal'), { ssr: false });
type ProfileNote = { label: string; status: string; note: string };

interface CompanyRow { id: string; name: string }

interface Props {
  initial: AthleteRow[];
  partners: PartnerRow[];
  providers: TrainingProviderRow[];
  interests: InterestRow[];
  trainingInterests: TrainingInterestRow[];
  companies: CompanyRow[];
  devPlans?: Array<{ id: string; title: string; status: string; athlete_id: string | null }>;
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
  initial, partners, providers, interests, trainingInterests, companies, devPlans = [],
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
  const [viewing,          setViewing]          = useState<AthleteRow | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [migratingCvs, setMigratingCvs] = useState(false);

  async function migrateLegacyCvs() {
    if (!confirm('Move every legacy CV from the old documents bucket into the private athlete-cvs bucket?\n\nThis can take a minute. Safe to re-run.')) return;
    setMigratingCvs(true);
    try {
      const res = await fetch('/api/admin/athletes/migrate-cvs', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Migration failed');
      const s = json.summary as Record<string, number>;
      alert(`CV migration done — migrated ${s.migrated ?? 0}, skipped ${s.skipped ?? 0}, errors ${s.error ?? 0}.`);
      refresh();
    } catch (e) {
      alert(`CV migration failed: ${(e as Error).message}`);
    } finally {
      setMigratingCvs(false);
    }
  }

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

  const partnerById = useMemo(() => new Map(partners.map(p => [p.id, p])), [partners]);
  const providerById = useMemo(() => new Map(providers.map(p => [p.id, p])), [providers]);

  function notesFor(athleteId: string): ProfileNote[] {
    const out: ProfileNote[] = [];
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

  // ── CV state for the create form ──────────────────────────
  // Mirrors the portal AthleteFormModal: pick file or paste text;
  // on Add, create the athlete first (POST /api/admin/athletes),
  // then upload the file (POST .../cv) or PATCH the text.
  const [cvKindNew, setCvKindNew] = useState<'file' | 'text' | null>(null);
  const [cvFileNew, setCvFileNew] = useState<File | null>(null);
  const [cvTextNew, setCvTextNew] = useState('');

  function resetCvState() {
    setCvKindNew(null); setCvFileNew(null); setCvTextNew('');
  }

  async function create() {
    if (!draft.company_id) { setError('Pick a client.'); return; }
    if (!draft.full_name.trim()) { setError('Name is required.'); return; }
    if (cvKindNew === 'file' && cvFileNew && cvFileNew.size > 10 * 1024 * 1024) {
      setError('CV file exceeds 10 MB limit.'); return;
    }
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

      const newId = json.id ?? json.row?.id;

      // Attach CV after creation, if one was provided. If this step
      // fails the athlete row is already saved — refresh the page to
      // pick it up, then surface a retry instruction so the operator
      // can re-attempt via the per-card Upload CV button instead of
      // having to re-enter every field.
      if (newId && cvKindNew === 'file' && cvFileNew) {
        const fd = new FormData();
        fd.append('file', cvFileNew);
        const upRes = await fetch(`/api/admin/athletes/${newId}/cv`, { method: 'POST', body: fd });
        if (!upRes.ok) {
          const upJson = await upRes.json().catch(() => ({}));
          refresh();
          throw new Error(`Athlete created but CV upload failed: ${upJson.error ?? upRes.statusText}. Click 'Upload CV' on the new athlete's card to retry.`);
        }
      } else if (newId && cvKindNew === 'text' && cvTextNew.trim()) {
        const tRes = await fetch(`/api/admin/athletes/${newId}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ cv_kind: 'text', cv_text: cvTextNew.trim() }),
        });
        if (!tRes.ok) {
          const tJson = await tRes.json().catch(() => ({}));
          refresh();
          throw new Error(`Athlete created but CV text save failed: ${tJson.error ?? tRes.statusText}. Use 'Replace' on the new athlete's card to retry.`);
        }
      }

      setDraft(EMPTY_DRAFT);
      resetCvState();
      setAdding(false);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ── Per-row CV upload (existing athletes) ─────────────────
  // Triggered by the small Upload button on each card. Uploads the
  // file, then updates local state so the new CV link appears
  // without a hard refresh.
  async function uploadCvForAthlete(athleteId: string, file: File) {
    if (file.size > 10 * 1024 * 1024) {
      alert('CV file exceeds 10 MB limit.');
      return;
    }
    setBusyFor(athleteId, true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/admin/athletes/${athleteId}/cv`, { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.error ?? 'CV upload failed');
        return;
      }
      // The admin API returns { url, filename } — patch local state.
      setAthletes((curr) => curr.map((a) => (a.id === athleteId
        ? { ...a, cv_kind: 'file', cv_url: null, cv_filename: json.filename ?? file.name, cv_text: null }
        : a)));
    } finally {
      setBusyFor(athleteId, false);
    }
  }

  async function clearCvForAthlete(athleteId: string) {
    if (!confirm('Remove this athlete’s CV?')) return;
    setBusyFor(athleteId, true);
    try {
      const res = await fetch(`/api/admin/athletes/${athleteId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cv_kind: null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Failed to clear CV');
        return;
      }
      setAthletes((curr) => curr.map((a) => (a.id === athleteId
        ? { ...a, cv_kind: null, cv_url: null, cv_filename: null, cv_text: null }
        : a)));
    } finally {
      setBusyFor(athleteId, false);
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
            <>
              <button onClick={migrateLegacyCvs} disabled={migratingCvs}
                      className="btn-secondary btn-sm flex items-center gap-1.5"
                      title="Move legacy CVs from the old documents bucket into the private athlete-cvs bucket">
                {migratingCvs ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {migratingCvs ? 'Migrating CVs…' : 'Migrate legacy CVs'}
              </button>
              <button onClick={() => { setDraft(EMPTY_DRAFT); setAdding(true); setError(''); }}
                      className="btn-cta btn-sm flex items-center gap-1.5">
                <Plus size={13} /> Add for client
              </button>
            </>
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

          {/* CV: same two-mode pattern as the portal AthleteFormModal. */}
          <div>
            <p className="label">CV (optional)</p>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => { setCvKindNew('file'); setCvTextNew(''); }}
                className="btn-sm flex items-center gap-1"
                style={{
                  background: cvKindNew === 'file' ? 'var(--purple)' : 'var(--surface-alt)',
                  color:      cvKindNew === 'file' ? '#fff'         : 'var(--ink-soft)',
                  fontSize: 11, padding: '4px 8px',
                }}
              >
                <Upload size={11} /> Upload file
              </button>
              <button
                type="button"
                onClick={() => { setCvKindNew('text'); setCvFileNew(null); }}
                className="btn-sm flex items-center gap-1"
                style={{
                  background: cvKindNew === 'text' ? 'var(--purple)' : 'var(--surface-alt)',
                  color:      cvKindNew === 'text' ? '#fff'         : 'var(--ink-soft)',
                  fontSize: 11, padding: '4px 8px',
                }}
              >
                <TypeIcon size={11} /> Paste text
              </button>
              {cvKindNew && (
                <button type="button" onClick={resetCvState} className="btn-ghost btn-sm" style={{ fontSize: 11 }}>
                  Clear
                </button>
              )}
            </div>

            {cvKindNew === 'file' && (
              <label
                className="block rounded-[10px] p-3 text-center cursor-pointer hover:bg-[var(--surface-alt)]"
                style={{ border: '1.5px dashed var(--line)' }}
              >
                <Upload size={16} className="mx-auto mb-1" style={{ color: 'var(--ink-faint)' }} />
                <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                  {cvFileNew ? cvFileNew.name : 'Click to choose a CV file'}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                  PDF, DOC, DOCX or TXT — up to 10 MB
                </p>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  onChange={e => setCvFileNew(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
            )}
            {cvKindNew === 'text' && (
              <textarea
                className="input"
                rows={5}
                value={cvTextNew}
                onChange={e => setCvTextNew(e.target.value)}
                placeholder="Paste the CV text here…"
              />
            )}
          </div>

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

      {/* Card grid — same shape as the portal AthleteCard, with admin
          actions revealed in the top-right of each card. */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center text-sm" style={{ color: 'var(--ink-faint)' }}>
          {filterCompany ? 'No athletes for this client.' : 'No athletes yet across the platform.'}
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(a => {
            const isBusy = busy.has(a.id);
            const matched = interestsByAthlete.get(a.id) ?? 0;
            const trainingMatched = trainingByAthlete.get(a.id) ?? 0;
            return (
              <li
                key={a.id}
                className="card p-3 relative flex flex-col"
                style={{ boxShadow: 'none', borderColor: 'var(--line)' }}
              >
                <button
                  type="button"
                  onClick={() => setViewing(a)}
                  className="flex items-center gap-3 text-left rounded-md -mx-1 px-1 py-0.5 hover:bg-[var(--surface-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--purple)]"
                  aria-label={`Open profile for ${a.full_name}`}
                >
                  <AvatarInitials name={a.full_name} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[13px] leading-tight truncate" style={{ color: 'var(--ink)' }}>
                      {a.full_name}
                    </p>
                    <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--ink-soft)' }}>
                      {[a.sport, a.previous_role].filter(Boolean).join(' · ') || 'Athlete'}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {a.company_name && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}>
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

                <div className="flex items-center gap-2 mt-2 text-[11px] flex-wrap" style={{ color: 'var(--ink-faint)' }}>
                  {a.cv_kind === 'file' && (
                    <button
                      type="button"
                      onClick={() => openAthleteCv(a.id)}
                      className="inline-flex items-center gap-0.5 hover:underline truncate"
                      style={{ color: 'var(--purple)', background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
                      title="Open CV (signed link valid for 1 hour)"
                    >
                      <FileText size={10} /> {a.cv_filename ?? 'CV'} <ExternalLink size={9} />
                    </button>
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

                  {/* Upload / replace CV — file picker hidden behind a label. */}
                  <label
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded cursor-pointer"
                    style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}
                    title={a.cv_kind === 'file' || a.cv_kind === 'text' ? 'Replace CV' : 'Upload CV'}
                  >
                    {isBusy ? <Loader2 size={9} className="animate-spin" /> : <Upload size={9} />}
                    {a.cv_kind === 'file' || a.cv_kind === 'text' ? 'Replace' : 'Upload CV'}
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) uploadCvForAthlete(a.id, f);
                      }}
                      className="hidden"
                      disabled={isBusy}
                    />
                  </label>
                  {(a.cv_kind === 'file' || a.cv_kind === 'text') && (
                    <button
                      type="button"
                      onClick={() => clearCvForAthlete(a.id)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded"
                      style={{ background: 'transparent', color: 'var(--red, #DC2626)' }}
                      title="Remove CV"
                    >
                      <Trash2 size={9} /> Remove
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 mt-3 pt-3" style={{ borderTop: '1px dashed var(--line)' }}>
                  <button onClick={() => setMatching(a)} disabled={isBusy}
                          className="btn-secondary btn-sm flex-1 flex items-center justify-center gap-1"
                          style={{ padding: '4px 8px', fontSize: 11 }}
                          title="Match to partner role">
                    <UserRoundSearch size={11} /> Roles
                  </button>
                  <button onClick={() => setMatchingTraining(a)} disabled={isBusy}
                          className="btn-sm flex-1 flex items-center justify-center gap-1 font-semibold"
                          style={{
                            padding: '4px 8px', fontSize: 11, borderRadius: 8,
                            background: 'rgba(59,111,255,0.08)', color: 'var(--blue)',
                            border: '1px solid rgba(59,111,255,0.20)',
                          }}
                          title="Match to training">
                    <GraduationCap size={11} /> Training
                  </button>
                  <button onClick={() => remove(a.id)} disabled={isBusy} className="btn-icon btn-sm flex-shrink-0"
                          style={{ color: 'var(--red)' }} title="Delete">
                    <Trash2 size={12} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

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
      {viewing && (
        <AthleteProfileModal
          athlete={viewing}
          notes={notesFor(viewing.id)}
          devPlans={devPlans.filter(p => p.athlete_id === viewing.id).map(p => ({ id: p.id, title: p.title, status: p.status }))}
          onClose={() => setViewing(null)}
          onSaved={(saved) => {
            setAthletes((curr) => curr.map((x) => (x.id === saved.id ? { ...x, ...saved } : x)));
            setViewing(saved);
          }}
        />
      )}
    </section>
  );
}
