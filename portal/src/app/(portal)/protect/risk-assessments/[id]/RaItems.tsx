'use client';
import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { residualAllowed, riskBand, riskScore } from '@/lib/hs/riskMatrix';
import {
  PERSONS_AT_RISK, PERSONS_AT_RISK_LABELS, RISK_ITEM_STATUSES, RISK_ITEM_STATUS_LABELS, hazardPath,
  type PersonsAtRisk, type RiskItemStatus,
} from '@/lib/hs/safetyVocab';
import RiskBadge from '@/components/safety/RiskBadge';
import Pill, { toneFor } from '@/components/safety/Pill';
import ItemControls from './ItemControls';
import type { LibraryControl, MatrixRow, Person, RaItem, RaItemControl } from './raTypes';

const nameOf = (people: Person[], id: string | null) => (id ? people.find(p => p.user_id === id)?.full_name ?? 'Someone outside this organisation' : '—');
const fmt = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

// The hazards of one assessment version, each rated BEFORE further
// controls (initial) and AFTER them (residual) on the assessment's own
// matrix. Scores are the database's generated columns once saved; the
// editor previews them with the same arithmetic. Rows change only while
// the version is a draft (hs_ra_item_guard); during review an approver
// may record control effectiveness and nothing else.
export default function RaItems({ raId, companyId, matrix, items, controls, library, hazards, people, editable, reviewing }: {
  raId: string; companyId: string; matrix: MatrixRow; items: RaItem[]; controls: RaItemControl[]; library: LibraryControl[];
  hazards: { id: string; reference: string; title: string }[]; people: Person[];
  editable: boolean; reviewing: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const band = (score: number | null) => riskBand(matrix, score);

  async function reorder(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= items.length) return;
    const order = items.map(i => i.id);
    [order[index], order[j]] = [order[j], order[index]];
    setBusy(true); setMsg(null);
    const sb = createClient();
    for (let k = 0; k < order.length; k++) {
      const it = items.find(i => i.id === order[k])!;
      if (it.sort_order === k + 1) continue;
      const res = await sb.from('risk_assessment_items').update({ sort_order: k + 1 }, COUNT_EXACT).eq('id', it.id);
      const out = judgeWrite({ error: res.error, count: res.count }, 'The order');
      if (!out.ok) { setMsg(out.message); break; }
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <section className="card p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Hazards and risk ratings</h2>
        <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>Matrix: {matrix.name} ({matrix.likelihood_labels.length} × {matrix.severity_labels.length})</span>
        {editable && !adding && (
          <button className="btn-secondary btn-sm ml-auto no-print" style={{ minHeight: 40 }} onClick={() => { setAdding(true); setOpen(null); }}>
            <Plus size={14} /> Add hazard
          </button>
        )}
      </div>
      {!editable && !reviewing && (
        <p className="text-xs no-print" style={{ color: 'var(--ink-faint)' }}>This version is locked. To change it, create a new version.</p>
      )}
      {reviewing && (
        <p className="text-xs no-print" style={{ color: 'var(--ink-soft)' }}>Under review: open each hazard to record how effective its controls are. Nothing else can change until it is approved or sent back.</p>
      )}
      {msg && <p className="text-sm" style={{ color: 'var(--red)' }}>{msg}</p>}

      {adding && (
        <ItemEditor raId={raId} companyId={companyId} matrix={matrix} hazards={hazards} people={people}
          nextSort={Math.max(0, ...items.map(i => i.sort_order)) + 1}
          onDone={() => { setAdding(false); router.refresh(); }} onCancel={() => setAdding(false)} />
      )}

      {items.length === 0 && !adding ? (
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
          No hazards on this assessment yet.{editable ? ' Add each hazard the activity involves, who could be harmed and how, and rate it before and after controls.' : ''}
        </p>
      ) : items.length > 0 && (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>#</th><th>Hazard</th><th>Persons at risk</th><th>Initial risk</th><th>Controls</th><th>Residual risk</th><th>Owner</th><th>Due</th><th>Status</th>{editable && <th className="no-print" />}</tr>
            </thead>
            <tbody>
              {items.map((it, n) => {
                const ib = band(it.initial_risk_score);
                const rb = band(it.residual_risk_score);
                const cs = controls.filter(c => c.risk_assessment_item_id === it.id);
                const isOpen = open === it.id;
                return (
                  <Fragment key={it.id}>
                    <tr>
                      <td className="whitespace-nowrap">{n + 1}</td>
                      <td>
                        <button type="button" className="text-left inline-flex items-start gap-1" style={{ color: 'var(--ink)' }}
                          onClick={() => { setOpen(isOpen ? null : it.id); setAdding(false); }} aria-expanded={isOpen}>
                          {isOpen ? <ChevronDown size={14} className="mt-0.5 shrink-0" /> : <ChevronRight size={14} className="mt-0.5 shrink-0" />}
                          <span>{it.hazard_description}</span>
                        </button>
                        {it.hazard_id && <div className="text-xs pl-5"><Link href={hazardPath(it.hazard_id)}>{hazards.find(h => h.id === it.hazard_id)?.reference ?? 'Hazard register'}</Link></div>}
                      </td>
                      <td className="text-xs">{it.persons_at_risk.length ? it.persons_at_risk.map(p => PERSONS_AT_RISK_LABELS[p]).join(', ') : '—'}</td>
                      <td className="whitespace-nowrap">
                        <RiskBadge score={it.initial_risk_score} level={ib?.level} label={ib?.label} />
                        <div className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>L{it.likelihood_before} × S{it.severity_before}</div>
                      </td>
                      <td className="text-xs whitespace-nowrap">{cs.length} ({cs.filter(c => c.stage === 'existing').length} existing, {cs.filter(c => c.stage === 'additional').length} additional)</td>
                      <td className="whitespace-nowrap">
                        {it.residual_risk_score != null ? (
                          <>
                            <RiskBadge score={it.residual_risk_score} level={rb?.level} label={rb?.label} />
                            <div className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>L{it.likelihood_after} × S{it.severity_after}</div>
                          </>
                        ) : <span className="text-xs" style={{ color: 'var(--gold)' }}>Not yet rated</span>}
                      </td>
                      <td className="text-xs">{nameOf(people, it.owner_id)}</td>
                      <td className="text-xs whitespace-nowrap">{fmt(it.due_date)}</td>
                      <td><Pill tone={toneFor(it.status)}>{RISK_ITEM_STATUS_LABELS[it.status]}</Pill></td>
                      {editable && (
                        <td className="whitespace-nowrap no-print">
                          <button className="btn-icon" aria-label="Move up" disabled={busy || n === 0} onClick={() => reorder(n, -1)}><ArrowUp size={14} /></button>
                          <button className="btn-icon" aria-label="Move down" disabled={busy || n === items.length - 1} onClick={() => reorder(n, 1)}><ArrowDown size={14} /></button>
                        </td>
                      )}
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={editable ? 10 : 9} style={{ background: 'var(--surface-soft)' }}>
                          <div className="space-y-4 py-2">
                            {editable ? (
                              <ItemEditor raId={raId} companyId={companyId} matrix={matrix} hazards={hazards} people={people} item={it}
                                nextSort={it.sort_order} onDone={() => router.refresh()} onCancel={() => setOpen(null)} />
                            ) : <ItemReadOnly item={it} people={people} />}
                            <ItemControls companyId={companyId} itemId={it.id} links={cs} library={library} people={people}
                              editable={editable} reviewing={reviewing} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ItemReadOnly({ item, people }: { item: RaItem; people: Person[] }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="label">Existing controls (as described)</dt><dd className="whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{item.existing_controls || '—'}</dd></div>
      <div><dt className="label">Further controls required</dt><dd className="whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{item.further_controls_required || '—'}</dd></div>
      {item.persons_at_risk_notes && <div><dt className="label">About the persons at risk</dt><dd style={{ color: 'var(--ink-soft)' }}>{item.persons_at_risk_notes}</dd></div>}
      <div><dt className="label">Owner of further controls</dt><dd style={{ color: 'var(--ink-soft)' }}>{nameOf(people, item.owner_id)} · due {fmt(item.due_date)}</dd></div>
    </dl>
  );
}

interface Draft {
  hazard_id: string; hazard_description: string; persons_at_risk: PersonsAtRisk[]; persons_at_risk_notes: string;
  existing_controls: string; lb: number; sb: number; further_controls_required: string; la: number; sa: number;
  owner_id: string; due_date: string; status: RiskItemStatus;
}

function ItemEditor({ raId, companyId, matrix, hazards, people, item, nextSort, onDone, onCancel }: {
  raId: string; companyId: string; matrix: MatrixRow; hazards: { id: string; reference: string; title: string }[]; people: Person[];
  item?: RaItem; nextSort: number; onDone: () => void; onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(() => ({
    hazard_id: item?.hazard_id ?? '', hazard_description: item?.hazard_description ?? '',
    persons_at_risk: item?.persons_at_risk ?? [], persons_at_risk_notes: item?.persons_at_risk_notes ?? '',
    existing_controls: item?.existing_controls ?? '', lb: item?.likelihood_before ?? 0, sb: item?.severity_before ?? 0,
    further_controls_required: item?.further_controls_required ?? '', la: item?.likelihood_after ?? 0, sa: item?.severity_after ?? 0,
    owner_id: item?.owner_id ?? '', due_date: item?.due_date ?? '', status: item?.status ?? 'open',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(p => ({ ...p, [k]: v }));

  const initial = riskScore(matrix, d.lb, d.sb);
  const residual = d.la || d.sa ? riskScore(matrix, d.la, d.sa) : null;
  const ib = riskBand(matrix, initial);
  const rb = riskBand(matrix, residual);
  const residualHalf = (d.la > 0) !== (d.sa > 0);
  const residualTooHigh = !residualAllowed(initial, residual);
  const hazardOptions = useMemo(() => hazards, [hazards]);

  function togglePerson(p: PersonsAtRisk) {
    set('persons_at_risk', d.persons_at_risk.includes(p) ? d.persons_at_risk.filter(x => x !== p) : [...d.persons_at_risk, p]);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!d.hazard_description.trim()) { setError('Describe the hazard.'); return; }
    if (!initial) { setError('Rate the initial likelihood and severity.'); return; }
    if (residualHalf) { setError('Give both residual likelihood and severity, or neither.'); return; }
    if (residualTooHigh) { setError('Residual risk cannot be higher than the initial risk. Check the ratings.'); return; }
    setBusy(true); setError(null);
    const row = {
      hazard_id: d.hazard_id || null, hazard_description: d.hazard_description.trim(), persons_at_risk: d.persons_at_risk,
      persons_at_risk_notes: d.persons_at_risk_notes.trim() || null, existing_controls: d.existing_controls.trim() || null,
      likelihood_before: d.lb, severity_before: d.sb, further_controls_required: d.further_controls_required.trim() || null,
      likelihood_after: d.la || null, severity_after: d.sa || null, owner_id: d.owner_id || null, due_date: d.due_date || null,
      status: d.status,
    };
    const sb = createClient();
    if (item) {
      const res = await sb.from('risk_assessment_items').update(row, COUNT_EXACT).eq('id', item.id);
      setBusy(false);
      const out = judgeWrite({ error: res.error, count: res.count }, 'The hazard');
      if (!out.ok) { setError(out.message); return; }
    } else {
      const { error: err } = await sb.from('risk_assessment_items').insert({ ...row, risk_assessment_id: raId, company_id: companyId, sort_order: nextSort });
      setBusy(false);
      if (err) { setError(err.message); return; }
    }
    onDone();
  }

  async function remove() {
    if (!item || !confirm('Remove this hazard and its controls from the draft?')) return;
    setBusy(true); setError(null);
    const res = await createClient().from('risk_assessment_items').delete(COUNT_EXACT).eq('id', item.id);
    setBusy(false);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The hazard');
    if (!out.ok) { setError(out.message); return; }
    onDone();
  }

  const axis = (labels: string[]) => labels.map((l, i) => <option key={i} value={i + 1}>{i + 1} — {l}</option>);

  return (
    <form onSubmit={save} className="space-y-3 no-print">
      <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{item ? 'Edit hazard' : 'Add a hazard'}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">From the hazard register (optional)</span>
          <select className="input" value={d.hazard_id} onChange={e => {
            const h = hazardOptions.find(x => x.id === e.target.value);
            setD(p => ({ ...p, hazard_id: e.target.value, hazard_description: p.hazard_description || (h?.title ?? '') }));
          }}>
            <option value="">Not linked</option>
            {hazardOptions.map(h => <option key={h.id} value={h.id}>{h.reference} — {h.title}</option>)}
          </select></label>
        <label className="block"><span className="label">Status of further controls</span>
          <select className="input" value={d.status} onChange={e => set('status', e.target.value as RiskItemStatus)}>
            {RISK_ITEM_STATUSES.map(s => <option key={s} value={s}>{RISK_ITEM_STATUS_LABELS[s]}</option>)}
          </select></label>
        <label className="block sm:col-span-2"><span className="label">Hazard and how harm could occur</span>
          <textarea className="input" rows={2} value={d.hazard_description} onChange={e => set('hazard_description', e.target.value)} maxLength={2000} required /></label>
      </div>

      <fieldset>
        <legend className="label">Persons at risk</legend>
        <div className="flex flex-wrap gap-2">
          {PERSONS_AT_RISK.map(p => (
            <label key={p} className="inline-flex items-center gap-2 text-sm px-2 rounded" style={{ minHeight: 36, border: '1px solid var(--line)', background: d.persons_at_risk.includes(p) ? 'var(--surface-alt)' : 'var(--surface)' }}>
              <input type="checkbox" checked={d.persons_at_risk.includes(p)} onChange={() => togglePerson(p)} /> {PERSONS_AT_RISK_LABELS[p]}
            </label>
          ))}
        </div>
        {(d.persons_at_risk.includes('named_individuals') || d.persons_at_risk_notes) && (
          <label className="block mt-2"><span className="label">About the persons at risk (name individuals only where it is operationally necessary)</span>
            <input className="input" value={d.persons_at_risk_notes} onChange={e => set('persons_at_risk_notes', e.target.value)} maxLength={1000} /></label>
        )}
      </fieldset>

      <label className="block"><span className="label">Existing controls (as in place today)</span>
        <textarea className="input" rows={2} value={d.existing_controls} onChange={e => set('existing_controls', e.target.value)} maxLength={4000} /></label>

      <div className="grid gap-3 sm:grid-cols-3 items-end p-3 rounded" style={{ border: '1px solid var(--line)' }}>
        <p className="sm:col-span-3 text-xs font-semibold uppercase" style={{ color: 'var(--ink-faint)' }}>Initial risk — before further controls</p>
        <label className="block"><span className="label">Likelihood</span>
          <select className="input" value={d.lb || ''} onChange={e => set('lb', Number(e.target.value))} required>
            <option value="">Choose…</option>{axis(matrix.likelihood_labels)}</select></label>
        <label className="block"><span className="label">Severity</span>
          <select className="input" value={d.sb || ''} onChange={e => set('sb', Number(e.target.value))} required>
            <option value="">Choose…</option>{axis(matrix.severity_labels)}</select></label>
        <div><span className="label">Initial risk</span><RiskBadge score={initial} level={ib?.level} label={ib?.label} /></div>
      </div>

      <label className="block"><span className="label">Further controls required</span>
        <textarea className="input" rows={2} value={d.further_controls_required} onChange={e => set('further_controls_required', e.target.value)} maxLength={4000} /></label>

      <div className="grid gap-3 sm:grid-cols-3 items-end p-3 rounded" style={{ border: '1px solid var(--line)' }}>
        <p className="sm:col-span-3 text-xs font-semibold uppercase" style={{ color: 'var(--ink-faint)' }}>Residual risk — after all controls (needed before submitting)</p>
        <label className="block"><span className="label">Likelihood</span>
          <select className="input" value={d.la || ''} onChange={e => set('la', Number(e.target.value))}>
            <option value="">Not rated</option>{axis(matrix.likelihood_labels)}</select></label>
        <label className="block"><span className="label">Severity</span>
          <select className="input" value={d.sa || ''} onChange={e => set('sa', Number(e.target.value))}>
            <option value="">Not rated</option>{axis(matrix.severity_labels)}</select></label>
        <div><span className="label">Residual risk</span><RiskBadge score={residual} level={rb?.level} label={rb?.label} /></div>
        {residualTooHigh && <p className="sm:col-span-3 text-sm" style={{ color: 'var(--red)' }}>Residual risk cannot be higher than the initial risk.</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">Owner of further controls</span>
          <select className="input" value={d.owner_id} onChange={e => set('owner_id', e.target.value)}>
            <option value="">Not assigned</option>{people.map(p => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
          </select></label>
        <label className="block"><span className="label">Due date</span>
          <input className="input" type="date" value={d.due_date} onChange={e => set('due_date', e.target.value)} /></label>
      </div>

      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-cta btn-sm" style={{ minHeight: 40 }} disabled={busy || residualTooHigh || residualHalf}>
          {busy && <Loader2 size={14} className="animate-spin" />} {item ? 'Save hazard' : 'Add hazard'}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>{item ? 'Close' : 'Cancel'}</button>
        {item && <button type="button" className="btn-ghost btn-sm ml-auto" style={{ color: 'var(--red)' }} disabled={busy} onClick={remove}><Trash2 size={14} /> Remove</button>}
      </div>
      {!item && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>After adding, open the hazard to attach controls from the control library.</p>}
    </form>
  );
}
