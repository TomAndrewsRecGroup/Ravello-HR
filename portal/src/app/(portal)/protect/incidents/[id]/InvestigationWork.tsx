'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import {
  CAUSE_CATEGORIES, CAUSE_CATEGORY_LABELS, CAUSE_LEVELS, CAUSE_LEVEL_LABELS, WHYS_MAX, WHYS_MIN,
  type CauseCategory, type CauseLevel,
} from '@/lib/hs/safetyVocab';
import type { CauseRow, Option, Person, TimelineRow, WhyRow } from './types';

const fmtDT = (d: string | null) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : '');

// The investigation's working rows: the ordered event timeline, the
// classified causes (immediate / underlying / root) and 5-Whys analyses.
// Editable only while the investigation is open (hs_investigation_child_guard).
export default function InvestigationWork({ investigationId, companyId, editable, timeline, causes, whys, dir, orgPeople }: {
  investigationId: string; companyId: string; editable: boolean; timeline: TimelineRow[]; causes: CauseRow[]; whys: WhyRow[];
  dir: Person[]; orgPeople: Option[];
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const sb = () => createClient();
  const name = (id: string | null) => (id ? dir.find(p => p.user_id === id)?.full_name ?? 'Someone outside this organisation' : '—');

  async function run(key: string, fn: () => Promise<string | null>) {
    setBusy(key); setErr(null);
    const problem = await fn();
    setBusy(null);
    if (problem) { setErr(problem); return false; }
    router.refresh();
    return true;
  }
  const counted = (what: string) => (res: { error: { message: string } | null; count: number | null }) => judgeWrite(res, what).message;

  /* ── timeline ── */
  const [ev, setEv] = useState({ event_time: '', title: '', description: '', person_id: '' });
  const nextSeq = (timeline.reduce((m, t) => Math.max(m, t.sequence), 0) || 0) + 1;
  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!ev.title.trim()) return;
    const ok = await run('ev', async () => {
      const { error } = await sb().from('incident_timeline_events').insert({
        company_id: companyId, investigation_id: investigationId, sequence: nextSeq, title: ev.title.trim(),
        description: ev.description.trim() || null, person_id: ev.person_id || null,
        event_time: ev.event_time ? new Date(ev.event_time).toISOString() : null,
      });
      return error?.message ?? null;
    });
    if (ok) setEv({ event_time: '', title: '', description: '', person_id: '' });
  }
  async function swap(i: number, j: number) {
    const a = timeline[i], b = timeline[j];
    if (!a || !b) return;
    await run(`mv${a.id}`, async () => {
      const r1 = await sb().from('incident_timeline_events').update({ sequence: b.sequence }, COUNT_EXACT).eq('id', a.id);
      const m1 = counted('The timeline')(r1); if (m1) return m1;
      const r2 = await sb().from('incident_timeline_events').update({ sequence: a.sequence }, COUNT_EXACT).eq('id', b.id);
      return counted('The timeline')(r2);
    });
  }
  const del = (table: string, id: string, what: string) => run(`del${id}`, async () =>
    counted(what)(await sb().from(table).delete(COUNT_EXACT).eq('id', id)));

  /* ── causes ── */
  const [cause, setCause] = useState({ cause_level: 'immediate' as CauseLevel, category: 'people' as CauseCategory, description: '' });
  async function addCause(e: React.FormEvent) {
    e.preventDefault();
    if (!cause.description.trim()) return;
    const ok = await run('cause', async () => {
      const { error } = await sb().from('incident_causes').insert({ company_id: companyId, investigation_id: investigationId, ...cause, description: cause.description.trim() });
      return error?.message ?? null;
    });
    if (ok) setCause({ ...cause, description: '' });
  }
  // The database stamps the confirming person and the moment; the value sent is only a signal.
  const confirmCause = (c: CauseRow, yes: boolean) => run(`cf${c.id}`, async () =>
    counted('The cause')(await sb().from('incident_causes').update({ confirmed_at: yes ? new Date().toISOString() : null }, COUNT_EXACT).eq('id', c.id)));

  /* ── 5 whys ── */
  const [why, setWhy] = useState<{ id: string | null; problem: string; whys: string[]; conclusion: string; linked_cause_id: string } | null>(null);
  async function saveWhy(e: React.FormEvent) {
    e.preventDefault();
    if (!why) return;
    const list = why.whys.map(w => w.trim()).filter(Boolean);
    if (!why.problem.trim() || list.length < WHYS_MIN) { setErr('Describe the problem and give at least one "why".'); return; }
    const payload = { problem: why.problem.trim(), whys: list, conclusion: why.conclusion.trim() || null, linked_cause_id: why.linked_cause_id || null };
    const ok = await run('why', async () => {
      if (why.id) return counted('The analysis')(await sb().from('investigation_why_analyses').update(payload, COUNT_EXACT).eq('id', why.id));
      const { error } = await sb().from('investigation_why_analyses').insert({ company_id: companyId, investigation_id: investigationId, ...payload });
      return error?.message ?? null;
    });
    if (ok) setWhy(null);
  }

  const levelOrder = (l: string) => CAUSE_LEVELS.indexOf(l as CauseLevel);
  const sortedCauses = [...causes].sort((a, b) => levelOrder(a.cause_level) - levelOrder(b.cause_level));

  return (
    <div className="space-y-5">
      {/* Timeline */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Sequence of events</h3>
        {timeline.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No events recorded yet. Build the timeline in the order things happened.</p> : (
          <ol className="space-y-1">
            {timeline.map((t, i) => (
              <li key={t.id} className="flex items-start gap-2 text-sm rounded-[6px] p-2" style={{ border: '1px solid var(--line)' }}>
                <span className="font-mono text-xs pt-0.5" style={{ color: 'var(--ink-faint)' }}>{i + 1}.</span>
                <div className="flex-1">
                  <p style={{ color: 'var(--ink)' }}><strong>{t.title}</strong>{t.event_time && <span className="text-xs ml-2" style={{ color: 'var(--ink-faint)' }}>{fmtDT(t.event_time)}</span>}</p>
                  {t.description && <p className="whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{t.description}</p>}
                  {t.person_id && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Person: {orgPeople.find(p => p.id === t.person_id)?.label ?? 'A person on record'}</p>}
                </div>
                {editable && (
                  <span className="flex gap-1 no-print">
                    <button className="btn-icon" aria-label="Move earlier" disabled={i === 0 || busy !== null} onClick={() => swap(i, i - 1)}><ArrowUp size={13} /></button>
                    <button className="btn-icon" aria-label="Move later" disabled={i === timeline.length - 1 || busy !== null} onClick={() => swap(i, i + 1)}><ArrowDown size={13} /></button>
                    <button className="btn-icon" aria-label="Remove event" disabled={busy !== null} onClick={() => del('incident_timeline_events', t.id, 'The event')}><Trash2 size={13} /></button>
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
        {editable && (
          <form onSubmit={addEvent} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 items-end no-print">
            <label className="block"><span className="label">When</span>
              <input className="input" type="datetime-local" value={ev.event_time} onChange={e => setEv({ ...ev, event_time: e.target.value })} /></label>
            <label className="block"><span className="label">What happened</span>
              <input className="input" value={ev.title} onChange={e => setEv({ ...ev, title: e.target.value })} maxLength={200} /></label>
            <label className="block"><span className="label">Person (optional)</span>
              <select className="input" value={ev.person_id} onChange={e => setEv({ ...ev, person_id: e.target.value })}>
                <option value="">—</option>{orgPeople.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
            <button className="btn-secondary btn-sm" disabled={busy !== null || !ev.title.trim()}>{busy === 'ev' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add event</button>
            <label className="block sm:col-span-2 lg:col-span-4"><span className="label">Detail (optional)</span>
              <textarea className="input" rows={2} value={ev.description} onChange={e => setEv({ ...ev, description: e.target.value })} maxLength={4000} /></label>
          </form>
        )}
      </div>

      {/* Causes */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Causes</h3>
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          Immediate cause: what directly occurred. Underlying cause: the conditions that allowed it. Root cause: the systemic reason that needs correcting.
          A cause is a conclusion only once a person confirms it.
        </p>
        {sortedCauses.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No causes recorded yet.</p> : (
          <ul className="space-y-1">
            {sortedCauses.map(c => (
              <li key={c.id} className="flex flex-wrap items-start gap-2 text-sm rounded-[6px] p-2" style={{ border: '1px solid var(--line)' }}>
                <span className="badge">{CAUSE_LEVEL_LABELS[c.cause_level as CauseLevel]}</span>
                <span className="badge" style={{ background: 'var(--surface-soft)' }}>{CAUSE_CATEGORY_LABELS[c.category as CauseCategory]}</span>
                <span className="flex-1 min-w-[200px]" style={{ color: 'var(--ink)' }}>{c.description}</span>
                {c.confirmed_at
                  ? <span className="text-xs flex items-center gap-1" style={{ color: 'var(--teal)' }}><CheckCircle2 size={12} /> Confirmed by {name(c.confirmed_by)}, {fmtDT(c.confirmed_at)}</span>
                  : <span className="text-xs" style={{ color: 'var(--gold)' }}>Not confirmed</span>}
                {editable && (
                  <span className="flex gap-1 no-print">
                    {c.confirmed_at
                      ? <button className="btn-ghost btn-sm" disabled={busy !== null} onClick={() => confirmCause(c, false)}>Withdraw confirmation</button>
                      : <button className="btn-secondary btn-sm" disabled={busy !== null} onClick={() => confirmCause(c, true)}>Confirm</button>}
                    <button className="btn-icon" aria-label="Remove cause" disabled={busy !== null} onClick={() => del('incident_causes', c.id, 'The cause')}><Trash2 size={13} /></button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {editable && (
          <form onSubmit={addCause} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 items-end no-print">
            <label className="block"><span className="label">Level</span>
              <select className="input" value={cause.cause_level} onChange={e => setCause({ ...cause, cause_level: e.target.value as CauseLevel })}>
                {CAUSE_LEVELS.map(l => <option key={l} value={l}>{CAUSE_LEVEL_LABELS[l]}</option>)}</select></label>
            <label className="block"><span className="label">Category</span>
              <select className="input" value={cause.category} onChange={e => setCause({ ...cause, category: e.target.value as CauseCategory })}>
                {CAUSE_CATEGORIES.map(l => <option key={l} value={l}>{CAUSE_CATEGORY_LABELS[l]}</option>)}</select></label>
            <label className="block"><span className="label">Description</span>
              <input className="input" value={cause.description} onChange={e => setCause({ ...cause, description: e.target.value })} maxLength={2000} /></label>
            <button className="btn-secondary btn-sm" disabled={busy !== null || !cause.description.trim()}>{busy === 'cause' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add cause</button>
          </form>
        )}
      </div>

      {/* 5 Whys */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>5 Whys</h3>
        {whys.length === 0 && !why && <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No 5-Whys analysis yet. Use as many whys as the problem needs — one to ten.</p>}
        {whys.map(w => (
          <div key={w.id} className="rounded-[6px] p-3 text-sm space-y-1" style={{ border: '1px solid var(--line)' }}>
            <p style={{ color: 'var(--ink)' }}><strong>Problem:</strong> {w.problem}</p>
            <ol className="list-decimal pl-6" style={{ color: 'var(--ink-soft)' }}>{w.whys.map((x, i) => <li key={i}>Why? {x}</li>)}</ol>
            {w.conclusion && <p style={{ color: 'var(--ink)' }}><strong>Conclusion:</strong> {w.conclusion}</p>}
            {w.linked_cause_id && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Supports: {causes.find(c => c.id === w.linked_cause_id)?.description ?? 'a recorded cause'}</p>}
            {editable && (
              <div className="flex gap-2 no-print">
                <button className="btn-ghost btn-sm" onClick={() => setWhy({ id: w.id, problem: w.problem, whys: [...w.whys], conclusion: w.conclusion ?? '', linked_cause_id: w.linked_cause_id ?? '' })}>Edit</button>
                <button className="btn-ghost btn-sm" disabled={busy !== null} onClick={() => del('investigation_why_analyses', w.id, 'The analysis')}><Trash2 size={13} /> Remove</button>
              </div>
            )}
          </div>
        ))}
        {editable && !why && (
          <button className="btn-secondary btn-sm no-print" onClick={() => setWhy({ id: null, problem: '', whys: ['', '', ''], conclusion: '', linked_cause_id: '' })}><Plus size={14} /> Add a 5-Whys analysis</button>
        )}
        {editable && why && (
          <form onSubmit={saveWhy} className="space-y-2 rounded-[6px] p-3 no-print" style={{ background: 'var(--surface-soft)' }}>
            <label className="block"><span className="label">Problem</span>
              <input className="input" value={why.problem} onChange={e => setWhy({ ...why, problem: e.target.value })} maxLength={1000} /></label>
            {why.whys.map((w, i) => (
              <div key={i} className="flex items-end gap-2">
                <label className="block flex-1"><span className="label">Why {i + 1}</span>
                  <input className="input" value={w} onChange={e => setWhy({ ...why, whys: why.whys.map((x, j) => (j === i ? e.target.value : x)) })} maxLength={1000} /></label>
                <button type="button" className="btn-icon" aria-label="Remove this why" disabled={why.whys.length <= WHYS_MIN}
                  onClick={() => setWhy({ ...why, whys: why.whys.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
              </div>
            ))}
            {why.whys.length < WHYS_MAX && (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setWhy({ ...why, whys: [...why.whys, ''] })}><Plus size={13} /> Add another why</button>
            )}
            <label className="block"><span className="label">Conclusion</span>
              <textarea className="input" rows={2} value={why.conclusion} onChange={e => setWhy({ ...why, conclusion: e.target.value })} maxLength={2000} /></label>
            <label className="block"><span className="label">Links to cause (optional)</span>
              <select className="input" value={why.linked_cause_id} onChange={e => setWhy({ ...why, linked_cause_id: e.target.value })}>
                <option value="">None</option>{causes.map(c => <option key={c.id} value={c.id}>{CAUSE_LEVEL_LABELS[c.cause_level as CauseLevel]}: {c.description.slice(0, 80)}</option>)}</select></label>
            <div className="flex gap-2">
              <button className="btn-cta btn-sm" disabled={busy !== null}>{busy === 'why' && <Loader2 size={14} className="animate-spin" />} Save analysis</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setWhy(null)}>Cancel</button>
            </div>
          </form>
        )}
      </div>
      {err && <p className="text-sm" style={{ color: 'var(--red)' }}>{err}</p>}
    </div>
  );
}
