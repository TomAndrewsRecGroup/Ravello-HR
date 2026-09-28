'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { INVESTIGATION_STATUS_LABELS, type InvestigationStatus } from '@/lib/hs/safetyVocab';
import Pill, { toneFor } from '@/components/safety/Pill';
import InvestigationWork from './InvestigationWork';
import type { CauseRow, InvestigationRow, Option, Person, TimelineRow, WhyRow } from './types';

type Msg = { ok: boolean; text: string } | null;
const TEXT_FIELDS: { key: keyof InvestigationRow; label: string; rows: number }[] = [
  { key: 'summary', label: 'Summary (required before submitting)', rows: 3 },
  { key: 'sequence_of_events', label: 'Sequence of events (narrative)', rows: 3 },
  { key: 'immediate_causes', label: 'Immediate causes — what directly occurred', rows: 2 },
  { key: 'underlying_causes', label: 'Underlying causes — conditions that allowed it', rows: 2 },
  { key: 'root_causes', label: 'Root causes — systemic reasons needing correction', rows: 2 },
  { key: 'contributing_factors', label: 'Contributing factors', rows: 2 },
  { key: 'findings', label: 'Findings', rows: 3 },
  { key: 'lessons_learned', label: 'Lessons learned', rows: 2 },
];

const fmt = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }) : '—');

// One investigation per incident (125). The investigator builds the
// record; the causes are a PERSON's conclusion (a root cause counts only
// once someone presses Confirm, and the database stamps who); approval
// is by someone other than the lead or the submitter. Nothing here
// suggests, scores or closes anything automatically.
export default function InvestigationPanel({ companyId, incidentId, incidentOpen, investigation, timeline, causes, whys, dir, orgPeople,
  userId, canInvestigate, canApprove, prompts }: {
  companyId: string; incidentId: string; incidentOpen: boolean; investigation: InvestigationRow | null; timeline: TimelineRow[];
  causes: CauseRow[]; whys: WhyRow[]; dir: Person[]; orgPeople: Option[]; userId: string | null; canInvestigate: boolean;
  canApprove: boolean; prompts: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [lead, setLead] = useState(userId ?? '');
  const [target, setTarget] = useState('');
  const inv = investigation;
  const [f, setF] = useState(() => inv ? {
    lead_investigator_id: inv.lead_investigator_id ?? '', team_member_ids: inv.team_member_ids ?? [], target_completion_date: inv.target_completion_date ?? '',
    ...Object.fromEntries(TEXT_FIELDS.map(t => [t.key, (inv[t.key] as string | null) ?? ''])),
  } as Record<string, string | string[]> : {});
  const [reviewComments, setReviewComments] = useState('');
  const name = (id: string | null) => (id ? dir.find(p => p.user_id === id)?.full_name ?? 'Someone outside this organisation' : '—');

  async function open(e: React.FormEvent) {
    e.preventDefault();
    setBusy('open'); setMsg(null);
    const { error } = await createClient().from('incident_investigations').insert({
      company_id: companyId, incident_id: incidentId, lead_investigator_id: lead || null, target_completion_date: target || null,
    });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    router.refresh();
  }

  if (!inv) {
    return (
      <section className="card p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--ink)' }}><Search size={16} /> Investigation</h2>
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
          No investigation has been opened. Near misses use the same investigation as any other incident.
        </p>
        {canInvestigate && incidentOpen && (
          <form onSubmit={open} className="flex flex-wrap items-end gap-2 no-print">
            <label className="block"><span className="label">Lead investigator</span>
              <select className="input" value={lead} onChange={e => setLead(e.target.value)}>
                <option value="">Me</option>{dir.map(p => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}</select></label>
            <label className="block"><span className="label">Target completion</span>
              <input className="input" type="date" value={target} onChange={e => setTarget(e.target.value)} /></label>
            <button className="btn-cta btn-sm" disabled={busy === 'open'}>{busy === 'open' && <Loader2 size={14} className="animate-spin" />} Open investigation</button>
          </form>
        )}
        {msg && <p className="text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</p>}
      </section>
    );
  }

  const status = inv.status;
  const editable = canInvestigate && incidentOpen && (status === 'in_progress' || status === 'changes_requested');
  const today = new Date().toISOString().slice(0, 10);
  const overdue = inv.target_completion_date && inv.target_completion_date < today && status !== 'approved';
  const selfApproval = !!userId && (userId === inv.lead_investigator_id || userId === inv.submitted_by);
  const rootConfirmed = causes.some(c => c.cause_level === 'root' && c.confirmed_at);

  async function update(key: string, patch: Record<string, unknown>, ok: string) {
    setBusy(key); setMsg(null);
    const res = await createClient().from('incident_investigations').update(patch, COUNT_EXACT)
      .eq('id', inv!.id).eq('row_version', inv!.row_version);
    setBusy(null);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The investigation');
    if (!out.ok) {
      setMsg({ ok: false, text: res.count === 0 && !res.error ? 'Someone else changed this investigation since you opened it. Refresh to see their change.' : out.message! });
      return;
    }
    setMsg({ ok: true, text: ok });
    router.refresh();
  }

  function save() {
    const patch: Record<string, unknown> = {
      lead_investigator_id: (f.lead_investigator_id as string) || null, team_member_ids: f.team_member_ids,
      target_completion_date: (f.target_completion_date as string) || null,
    };
    for (const t of TEXT_FIELDS) patch[t.key] = ((f[t.key] as string) ?? '').trim() || null;
    return update('save', patch, 'Investigation saved.');
  }

  const team = (f.team_member_ids as string[]) ?? [];
  const move = (to: InvestigationStatus, ok: string, extra: Record<string, unknown> = {}) => update(to, { status: to, ...extra }, ok);

  return (
    <section className="card p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--ink)' }}><Search size={16} /> Investigation</h2>
        <span className="font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{inv.reference}</span>
        <Pill tone={toneFor(status)}>{INVESTIGATION_STATUS_LABELS[status]}</Pill>
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>Lead investigator</dt><dd>{name(inv.lead_investigator_id)}</dd></div>
        <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>Team</dt><dd>{inv.team_member_ids.length ? inv.team_member_ids.map(name).join(', ') : '—'}</dd></div>
        <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>Started</dt><dd>{fmt(inv.started_at)}</dd></div>
        <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>Target completion</dt>
          <dd style={{ color: overdue ? 'var(--red)' : undefined }}>{fmt(inv.target_completion_date)}{overdue ? ' (overdue)' : ''}</dd></div>
        {inv.submitted_at && <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>Submitted</dt><dd>{fmt(inv.submitted_at)} by {name(inv.submitted_by)}</dd></div>}
        {inv.approved_at && <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>Approved</dt><dd>{fmt(inv.approved_at)} by {name(inv.approved_by)}</dd></div>}
      </dl>
      {inv.review_comments && (status === 'changes_requested' || status === 'in_progress') && (
        <p className="text-sm rounded-[6px] p-2" style={{ background: 'rgba(217,68,68,0.08)', color: 'var(--ink-soft)' }}>
          <strong>Changes requested:</strong> {inv.review_comments}</p>
      )}

      {prompts.length > 0 && editable && (
        <details className="text-sm no-print">
          <summary className="cursor-pointer" style={{ color: 'var(--ink-soft)' }}>Investigation prompts</summary>
          <ul className="list-disc pl-5 mt-1 space-y-0.5" style={{ color: 'var(--ink-faint)' }}>{prompts.map((p, i) => <li key={i}>{p}</li>)}</ul>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>Prompts only. The investigator decides the causes.</p>
        </details>
      )}

      {editable ? (
        <div className="space-y-3 no-print">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label">Lead investigator</span>
              <select className="input" value={f.lead_investigator_id as string} onChange={e => setF({ ...f, lead_investigator_id: e.target.value })}>
                <option value="">Not set</option>{dir.map(p => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}</select></label>
            <label className="block"><span className="label">Target completion</span>
              <input className="input" type="date" value={f.target_completion_date as string} onChange={e => setF({ ...f, target_completion_date: e.target.value })} /></label>
          </div>
          <fieldset><legend className="label">Investigation team</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {dir.map(p => (
                <label key={p.user_id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={team.includes(p.user_id)} disabled={!team.includes(p.user_id) && team.length >= 20}
                    onChange={() => setF({ ...f, team_member_ids: team.includes(p.user_id) ? team.filter(x => x !== p.user_id) : [...team, p.user_id] })} />
                  {p.full_name}</label>
              ))}
            </div></fieldset>
          {TEXT_FIELDS.map(t => (
            <label key={t.key} className="block"><span className="label">{t.label}</span>
              <textarea className="input" rows={t.rows} value={(f[t.key] as string) ?? ''} maxLength={8000}
                onChange={e => setF({ ...f, [t.key]: e.target.value })} /></label>
          ))}
          <button className="btn-cta btn-sm" onClick={save} disabled={busy !== null}>{busy === 'save' && <Loader2 size={14} className="animate-spin" />} Save investigation</button>
        </div>
      ) : (
        <div className="space-y-2">
          {TEXT_FIELDS.map(t => (inv[t.key] ? (
            <div key={t.key}><h3 className="text-xs font-semibold uppercase" style={{ color: 'var(--ink-faint)' }}>{t.label.replace(/ \(.*\)$/, '').replace(/ —.*$/, '')}</h3>
              <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{inv[t.key] as string}</p></div>
          ) : null))}
        </div>
      )}

      <InvestigationWork investigationId={inv.id} companyId={companyId} editable={editable} timeline={timeline} causes={causes} whys={whys}
        dir={dir} orgPeople={orgPeople} />

      <div className="space-y-2 no-print" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-cta btn-sm" disabled={busy !== null} onClick={() => move('pending_approval', 'Submitted for approval.')}>
              {busy === 'pending_approval' && <Loader2 size={14} className="animate-spin" />} Submit for approval</button>
            {!rootConfirmed && <span className="text-xs" style={{ color: 'var(--gold)' }}>Confirm at least one root cause and write the summary first. Save your changes before submitting.</span>}
          </div>
        )}
        {status === 'pending_approval' && canInvestigate && incidentOpen && (
          <button className="btn-ghost btn-sm" disabled={busy !== null} onClick={() => move('in_progress', 'Withdrawn for further work.')}>Withdraw for more work</button>
        )}
        {status === 'pending_approval' && canApprove && incidentOpen && (
          <div className="space-y-2">
            {selfApproval && <p className="text-xs" style={{ color: 'var(--gold)' }}>You led or submitted this investigation, so someone else must approve it.</p>}
            <label className="block"><span className="label">Review comments (required to request changes)</span>
              <textarea className="input" rows={2} value={reviewComments} onChange={e => setReviewComments(e.target.value)} maxLength={4000} /></label>
            <div className="flex flex-wrap gap-2">
              <button className="btn-cta btn-sm" disabled={busy !== null} onClick={() => move('approved', 'Investigation approved.')}>
                {busy === 'approved' && <Loader2 size={14} className="animate-spin" />} Approve investigation</button>
              <button className="btn-secondary btn-sm" disabled={busy !== null || !reviewComments.trim()}
                onClick={() => move('changes_requested', 'Changes requested.', { review_comments: reviewComments.trim() })}>Request changes</button>
            </div>
          </div>
        )}
        {status === 'approved' && canApprove && incidentOpen && (
          <button className="btn-ghost btn-sm" disabled={busy !== null} onClick={() => move('in_progress', 'Investigation reopened.')}>Reopen investigation</button>
        )}
        {msg && <p className="text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</p>}
      </div>
    </section>
  );
}
