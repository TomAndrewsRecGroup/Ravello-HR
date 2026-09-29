'use client';

// Core-OS 360 Phase 7, Group 3 (section 4: Mobile/Tablet Visit Mode;
// section 5: Structured Observations). Each observation is its own
// insert under the caller's own session — visit_observations_
// consultancy_all (174, portfolio-wide RLS) and visit_observation_fill
// (the same-client link guard) are the real authorization/validation
// boundary; this component's own job is capturing on a phone/tablet
// without losing work, never re-implementing either check.
//
// "Offline-tolerant" here means one thing precisely: the observation
// CURRENTLY being typed survives a dropped connection, a reload, or a
// tab accidentally closed mid-visit — not a full background-sync queue.
// Submitted observations are ordinary online inserts; there is no local
// queue of unsent rows. A signal-poor site visit loses nothing typed so
// far, but a submit made with no connection at all simply fails and
// stays in the draft until retried — this matches what a site visit
// actually needs (patchy signal *while working*), the same scope note
// migration 174's own header records.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Camera, AlertTriangle, FileText, ClipboardCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { uploadEvidence, evidenceUrl } from '@/lib/hs/evidence';
import {
  OBSERVATION_TYPES, OBSERVATION_TYPE_LABELS, OBSERVATION_SEVERITIES, OBSERVATION_SEVERITY_LABELS,
} from '@/lib/consultancy/vocab';
import type { ObservationType, ObservationSeverity, VisitStatus } from '@/lib/consultancy/vocab';
import type { VisitObservation, ConsultancyVisitTemplateItem } from '@/lib/consultancy/types';
import type { LinkableRecord, ObservationEvidenceFile } from '@/lib/consultancy/loadVisitCapture';

interface Props {
  visitId: string;
  clientOrganisationId: string;
  status: VisitStatus;
  observations: VisitObservation[];
  evidenceByObservation: Record<string, ObservationEvidenceFile[]>;
  templateItems: ConsultancyVisitTemplateItem[];
  linkableAssets: LinkableRecord[];
  linkableContractors: LinkableRecord[];
  linkablePeople: LinkableRecord[];
  linkableDocuments: LinkableRecord[];
}

const LINK_KINDS: { value: string; label: string }[] = [
  { value: 'equipment', label: 'Asset' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'person', label: 'Person' },
  { value: 'document', label: 'Document' },
];

interface DraftForm {
  location_section: string;
  observation_type: ObservationType;
  description: string;
  severity: ObservationSeverity | '';
  client_visible: boolean;
  action_required: boolean;
  linked_source_type: string;
  linked_source_id: string;
}

const EMPTY_DRAFT: DraftForm = {
  location_section: '', observation_type: 'observation', description: '', severity: '',
  client_visible: true, action_required: false, linked_source_type: '', linked_source_id: '',
};

const fmtTime = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Core-OS 360 Phase 7, Group 4. Deliberately never 'urgent'/'critical' —
// those are reserved for immediate_danger's own synchronous escalation
// (visit_observation_escalate(), 174), which fires unconditionally and
// independently of this manual path, so the two can never collide on
// the same observation and the emergency path stays visibly distinct
// from a manually-raised follow-up.
const ACTION_SEVERITY_FROM_OBSERVATION: Record<ObservationSeverity, { severity: 'low' | 'medium' | 'high' | 'critical'; priority: 'normal' | 'high' }> = {
  minor:    { severity: 'low',      priority: 'normal' },
  moderate: { severity: 'medium',   priority: 'normal' },
  major:    { severity: 'high',     priority: 'high' },
  critical: { severity: 'critical', priority: 'high' },
};

export default function VisitCaptureClient({
  visitId, clientOrganisationId, status,
  observations: initialObservations, evidenceByObservation: initialEvidence,
  templateItems, linkableAssets, linkableContractors, linkablePeople, linkableDocuments,
}: Props) {
  const router = useRouter();
  const draftKey = `visit-observation-draft:${visitId}`;

  const [observations, setObservations] = useState(initialObservations);
  const [evidence, setEvidence] = useState(initialEvidence);
  const [form, setForm] = useState<DraftForm>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [raisingFor, setRaisingFor] = useState<string | null>(null);
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) setForm({ ...EMPTY_DRAFT, ...JSON.parse(raw) });
    } catch { /* private window, cleared storage, or bad JSON — start blank */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      if (form.description.trim() || form.location_section.trim()) {
        localStorage.setItem(draftKey, JSON.stringify(form));
      } else {
        localStorage.removeItem(draftKey);
      }
    } catch { /* never block capture on storage failing */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const linkableFor = (kind: string): LinkableRecord[] => {
    if (kind === 'equipment') return linkableAssets;
    if (kind === 'contractor') return linkableContractors;
    if (kind === 'person') return linkablePeople;
    if (kind === 'document') return linkableDocuments;
    return [];
  };

  async function submitObservation(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const supabase = createClient();
    const { data, error: insertErr } = await supabase.from('visit_observations').insert({
      visit_id: visitId,
      location_section: form.location_section.trim() || null,
      observation_type: form.observation_type,
      description: form.description.trim(),
      severity: form.severity || null,
      client_visible: form.client_visible,
      action_required: form.action_required,
      linked_source_type: form.linked_source_type || null,
      linked_source_id: form.linked_source_type ? (form.linked_source_id || null) : null,
    }).select('*').single();
    if (insertErr) { setError(insertErr.message); setSaving(false); return; }
    setObservations(prev => [data as VisitObservation, ...prev]);
    setForm(EMPTY_DRAFT);
    try { localStorage.removeItem(draftKey); } catch { /* best effort */ }
    setSaving(false);
    router.refresh();
  }

  async function uploadPhoto(observationId: string, file: File) {
    setUploadingFor(observationId);
    const supabase = createClient();
    const err = await uploadEvidence(supabase, { companyId: clientOrganisationId, entityType: 'visit_observation', entityId: observationId, file });
    if (!err) {
      const { data } = await supabase.from('hs_files').select('id, entity_id, storage_path, file_name')
        .eq('entity_type', 'visit_observation').eq('entity_id', observationId).order('created_at', { ascending: false }).limit(1);
      if (data?.[0]) setEvidence(prev => ({ ...prev, [observationId]: [data[0] as ObservationEvidenceFile, ...(prev[observationId] ?? [])] }));
    }
    setUploadingFor(null);
    if (err) setError(err);
  }

  async function openPhoto(path: string) {
    const url = await evidenceUrl(createClient(), path);
    if (url) window.open(url, '_blank', 'noopener');
  }

  // Manual "raise an action" path for a non-immediate-danger finding —
  // immediate_danger already escalates synchronously and unconditionally
  // (visit_observation_escalate(), 174); this is the SEPARATE path for
  // an observation flagged action_required that needs a follow-up
  // without being an emergency. actions_consultancy_insert (175) is the
  // real authorization boundary; this only maps observation severity to
  // an action's own vocabulary and links the two records together.
  async function raiseAction(o: VisitObservation) {
    setRaisingFor(o.id);
    setError('');
    const supabase = createClient();
    const mapped = o.severity ? ACTION_SEVERITY_FROM_OBSERVATION[o.severity] : null;
    const { data, error: insertErr } = await supabase.from('actions').insert({
      company_id: clientOrganisationId,
      title: `Visit finding: ${o.description.slice(0, 140)}`,
      description: o.description,
      action_type: 'hs_check',
      priority: mapped?.priority ?? 'normal',
      severity: mapped?.severity ?? null,
      status: 'active',
      source_type: 'consultant_visit',
      source_id: visitId,
      related_entity_type: 'visit_observation',
      related_entity_id: o.id,
    }).select('id').single();
    if (insertErr) { setRaisingFor(null); setError(insertErr.message); return; }
    const res = await supabase.from('visit_observations')
      .update({ resulting_action_id: data.id }, COUNT_EXACT).eq('id', o.id);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    setRaisingFor(null);
    if (!outcome.ok) { setError(outcome.message ?? 'Action raised, but could not be linked to the observation'); return; }
    setObservations(prev => prev.map(x => (x.id === o.id ? { ...x, resulting_action_id: data.id } : x)));
    router.refresh();
  }

  async function startVisit() {
    setStatusBusy(true);
    setStatusError('');
    const supabase = createClient();
    const res = await supabase.from('consultancy_visits')
      .update({ status: 'in_progress', started_at: new Date().toISOString() }, COUNT_EXACT).eq('id', visitId);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    setStatusBusy(false);
    if (!outcome.ok) { setStatusError(outcome.message ?? 'Could not start the visit'); return; }
    router.refresh();
  }

  async function finishCapturing() {
    setStatusBusy(true);
    setStatusError('');
    const supabase = createClient();
    const res = await supabase.from('consultancy_visits')
      .update({ status: 'awaiting_report', ended_at: new Date().toISOString() }, COUNT_EXACT).eq('id', visitId);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    setStatusBusy(false);
    if (!outcome.ok) { setStatusError(outcome.message ?? 'Could not finish the visit'); return; }
    router.refresh();
  }

  return (
    <section className="card p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Visit capture</h2>
        {(status === 'planned' || status === 'confirmed') && (
          <button className="btn-cta btn-sm" onClick={startVisit} disabled={statusBusy}>
            {statusBusy && <Loader2 size={13} className="animate-spin" />} Start visit
          </button>
        )}
        {status === 'in_progress' && (
          <button className="btn-secondary btn-sm" onClick={finishCapturing} disabled={statusBusy}>
            {statusBusy && <Loader2 size={13} className="animate-spin" />} Finish capturing ({observations.length} observation{observations.length === 1 ? '' : 's'})
          </button>
        )}
      </div>
      {statusError && <p className="text-xs" style={{ color: 'var(--red)' }}>{statusError}</p>}

      {status !== 'planned' && status !== 'confirmed' && status !== 'cancelled' && templateItems.length > 0 && (
        <details className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          <summary className="cursor-pointer font-semibold" style={{ color: 'var(--ink)' }}>Checklist ({templateItems.length} items)</summary>
          <ul className="text-xs space-y-0.5 mt-2">
            {templateItems.map(i => (
              <li key={i.id}><span className="font-semibold">{i.section}</span> — {i.question}{i.expects_evidence ? ' (evidence expected)' : ''}</li>
            ))}
          </ul>
        </details>
      )}

      {status === 'in_progress' && (
        <form onSubmit={submitObservation} className="space-y-2 p-3 rounded" style={{ background: 'var(--surface-soft)' }}>
          <div className="grid sm:grid-cols-2 gap-2">
            <input className="input" placeholder="Location / section (optional)" value={form.location_section}
              onChange={e => setForm(f => ({ ...f, location_section: e.target.value }))} />
            <select className="input" value={form.observation_type}
              onChange={e => setForm(f => ({ ...f, observation_type: e.target.value as ObservationType }))}>
              {OBSERVATION_TYPES.map(t => <option key={t} value={t}>{OBSERVATION_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <textarea className="input" rows={3} placeholder="What did you see?" required
            value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          {form.observation_type === 'immediate_danger' && (
            <p className="text-xs flex items-center gap-1" style={{ color: 'var(--red)' }}>
              <AlertTriangle size={13} /> This will immediately raise an urgent action for follow-up — regardless of the fields below.
            </p>
          )}
          <div className="grid sm:grid-cols-3 gap-2">
            <select className="input" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value as ObservationSeverity | '' }))}>
              <option value="">Severity (optional)</option>
              {OBSERVATION_SEVERITIES.map(s => <option key={s} value={s}>{OBSERVATION_SEVERITY_LABELS[s]}</option>)}
            </select>
            <select className="input" value={form.linked_source_type}
              onChange={e => setForm(f => ({ ...f, linked_source_type: e.target.value, linked_source_id: '' }))}>
              <option value="">Not linked to a record</option>
              {LINK_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            {form.linked_source_type && (
              <select className="input" value={form.linked_source_id} onChange={e => setForm(f => ({ ...f, linked_source_id: e.target.value }))}>
                <option value="">Select…</option>
                {linkableFor(form.linked_source_type).map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            )}
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
              <input type="checkbox" checked={form.client_visible} onChange={e => setForm(f => ({ ...f, client_visible: e.target.checked }))} /> Visible to client
            </label>
            <label className="flex items-center gap-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
              <input type="checkbox" checked={form.action_required} onChange={e => setForm(f => ({ ...f, action_required: e.target.checked }))} /> Action required
            </label>
          </div>
          {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
          <button type="submit" disabled={saving} className="btn-cta btn-sm">
            {saving && <Loader2 size={13} className="animate-spin" />} <Plus size={13} /> Add observation
          </button>
        </form>
      )}

      {observations.length === 0 ? (
        <div className="empty-state p-6"><p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No observations recorded yet.</p></div>
      ) : (
        <ul className="space-y-2">
          {observations.map(o => (
            <li key={o.id} className="p-3 rounded" style={{ border: '1px solid var(--line)' }}>
              <div className="flex items-center gap-2 flex-wrap text-xs" style={{ color: 'var(--ink-faint)' }}>
                <span className="badge">{OBSERVATION_TYPE_LABELS[o.observation_type]}</span>
                {o.severity && <span className="badge">{OBSERVATION_SEVERITY_LABELS[o.severity]}</span>}
                {o.location_section && <span>{o.location_section}</span>}
                <span>{fmtTime(o.created_at)}</span>
                {!o.client_visible && <span>· Internal only</span>}
                {o.resulting_action_id && o.observation_type === 'immediate_danger' && (
                  <span className="flex items-center gap-1" style={{ color: 'var(--red)' }}><AlertTriangle size={12} /> Escalated — action raised</span>
                )}
                {o.resulting_action_id && o.observation_type !== 'immediate_danger' && (
                  <span className="flex items-center gap-1"><ClipboardCheck size={12} /> Action raised</span>
                )}
              </div>
              <p className="text-sm mt-1" style={{ color: 'var(--ink)' }}>{o.description}</p>
              {(evidence[o.id] ?? []).length > 0 && (
                <ul className="flex flex-wrap gap-2 mt-2">
                  {evidence[o.id].map(f => (
                    <li key={f.id}>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => openPhoto(f.storage_path)}>
                        <FileText size={13} /> {f.file_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {status === 'in_progress' && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <label className="btn-ghost btn-sm inline-flex items-center gap-1 cursor-pointer">
                    {uploadingFor === o.id ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />} Add photo
                    <input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploadingFor === o.id}
                      onChange={e => { const f = e.target.files?.[0]; if (f) void uploadPhoto(o.id, f); e.target.value = ''; }} />
                  </label>
                  {o.action_required && !o.resulting_action_id && (
                    <button type="button" className="btn-ghost btn-sm" disabled={raisingFor === o.id} onClick={() => void raiseAction(o)}>
                      {raisingFor === o.id ? <Loader2 size={13} className="animate-spin" /> : <ClipboardCheck size={13} />} Raise action
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
