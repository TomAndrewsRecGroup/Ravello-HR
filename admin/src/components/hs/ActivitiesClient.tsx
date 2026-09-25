'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarCheck, FileText, Loader2, Paperclip, Plus, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/modules/Toast';
import { HS_ACTIVITY_TYPE_LABELS, HS_ACTIVITY_TYPES, type HsActivityType } from '@/lib/hs/vocab';
import { HS_EVIDENCE_ACCEPT, evidenceUrl, uploadEvidence } from '@/lib/hs/evidence';
import type { HsActivity, HsFile } from '@/lib/hs/types';

/** A Jev "follow-up suggested" decision for an activity (staff only see these). */
export interface FollowupSuggestion { decision_id: string; probability: number; severity: string; outcome: string | null }

interface Props {
  companyId:  string;
  canRecord:  boolean;
  activities: HsActivity[];
  files:      HsFile[];
  loadError:  string | null;
  /** Staff only: suggestions keyed by activity id, and the right to raise an action. */
  followups?: Record<string, FollowupSuggestion>;
  canRaise?:  boolean;
}

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function ActivitiesClient({ companyId, canRecord, activities, files, loadError, followups = {}, canRaise = false }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<HsActivityType>('site_visit');
  const [title, setTitle] = useState('');
  const [on, setOn] = useState(today());
  const [summary, setSummary] = useState('');
  const [fileList, setFileList] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.from('hs_activities').insert({
      company_id: companyId, activity_type: type, title: title.trim(), occurred_on: on, summary: summary.trim() || null,
    }).select('id').single();
    if (error || !data) { setBusy(false); toast(error?.message ?? 'Could not log it.', 'error'); return; }
    const problems: string[] = [];
    for (const file of fileList) {
      const p = await uploadEvidence(supabase, { companyId, entityType: 'activity', entityId: data.id, file });
      if (p) problems.push(p);
    }
    setBusy(false);
    if (problems.length) toast(`Logged, but: ${problems.join(' ')}`, 'error');
    else toast('Logged', 'success');
    setTitle(''); setSummary(''); setFileList([]); setOpen(false);
    router.refresh();
  }

  const [raising, setRaising] = useState<string | null>(null);
  async function raiseAction(a: HsActivity, f: FollowupSuggestion | undefined) {
    setRaising(a.id);
    try {
      const res = await fetch(`/api/admin/hs/activities/${a.id}/raise-action`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: `Follow up: ${a.title}`.slice(0, 200),
          description: a.summary ? a.summary.slice(0, 4000) : null,
          priority: f?.severity === 'serious' ? 'urgent' : f?.severity === 'significant' ? 'high' : 'normal',
          decision_id: f?.decision_id ?? null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Could not raise the action (${res.status})`);
      toast(json.already ? 'An action already exists for this activity' : 'Action raised for the client', 'success');
      router.refresh();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setRaising(null);
    }
  }

  async function openFile(f: HsFile) {
    const url = await evidenceUrl(createClient(), f.storage_path);
    if (url) window.open(url, '_blank', 'noopener');
    else toast('Could not open that file.', 'error');
  }

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load activities: {loadError}</p>}
      {canRecord && (
        <div className="flex">
          <button className="btn-cta btn-sm ml-auto" onClick={() => setOpen(o => !o)}><Plus size={14} /> Log an activity</button>
        </div>
      )}

      {open && (
        <form onSubmit={submit} className="card p-4 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="label">Type</span>
            <select className="input" value={type} onChange={e => setType(e.target.value as HsActivityType)}>
              {HS_ACTIVITY_TYPES.map(t => <option key={t} value={t}>{HS_ACTIVITY_TYPE_LABELS[t]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Date</span>
            <input className="input" type="date" value={on} max={today()} onChange={e => setOn(e.target.value)} required />
          </label>
          <label className="block md:col-span-2">
            <span className="label">Title</span>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required placeholder="Quarterly site visit, Leeds depot" />
          </label>
          <label className="block md:col-span-2">
            <span className="label">What happened (the client will see this)</span>
            <textarea className="input" rows={4} value={summary} onChange={e => setSummary(e.target.value)} maxLength={8000} />
          </label>
          <label className="block md:col-span-2">
            <span className="label flex items-center gap-1.5"><Paperclip size={13} /> Files (visit report, photos)</span>
            <input type="file" multiple accept={HS_EVIDENCE_ACCEPT.join(',')} onChange={e => setFileList(Array.from(e.target.files ?? []))} className="text-sm" />
          </label>
          <div className="md:col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-cta" disabled={busy || !title.trim()}>{busy && <Loader2 size={15} className="animate-spin" />} Save</button>
          </div>
        </form>
      )}

      {activities.length === 0 ? (
        <div className="card empty-state p-10">
          <CalendarCheck size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No activities logged yet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {activities.map(a => {
            const attached = files.filter(f => f.entity_id === a.id);
            return (
              <li key={a.id} className="card p-4">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="badge">{HS_ACTIVITY_TYPE_LABELS[a.activity_type]}</span>
                  <strong style={{ color: 'var(--ink)' }}>{a.title}</strong>
                  <span className="text-sm ml-auto" style={{ color: 'var(--ink-faint)' }}>{fmt(a.occurred_on)} · {a.recorded_by_kind}</span>
                </div>
                {a.summary && <p className="mt-2 text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{a.summary}</p>}
                {(followups[a.id] || canRaise) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {followups[a.id] && (
                      <span className="badge flex items-center gap-1" style={{ background: 'rgba(11,120,150,0.1)', color: 'var(--purple)' }}>
                        <Sparkles size={11} /> Follow-up suggested · {followups[a.id].severity} · {Math.round(followups[a.id].probability * 100)}%
                        {followups[a.id].outcome === 'accepted' && ' · action raised'}
                      </span>
                    )}
                    {canRaise && followups[a.id]?.outcome !== 'accepted' && (
                      <button className="btn-secondary btn-sm" disabled={raising === a.id} onClick={() => raiseAction(a, followups[a.id])}>
                        {raising === a.id ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Raise action for the client
                      </button>
                    )}
                  </div>
                )}
                {attached.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {attached.map(f => (
                      <li key={f.id}><button className="btn-ghost btn-sm" onClick={() => openFile(f)}><FileText size={13} /> {f.file_name}</button></li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
