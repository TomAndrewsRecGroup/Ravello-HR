'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { fmtDate } from '@/lib/hs/safetyFormat';
import Pill from '@/components/safety/Pill';
import {
  REQUIREMENT_TYPES, REQUIREMENT_TYPE_LABELS, REQUIREMENT_SOURCE_LABELS, type RequirementSource,
} from '@/lib/workforce/vocab';
import {
  groupRules, validateRuleForm, buildRuleInsert, ruleToForm, optionsForType, referenceTitle, suggestReplaced,
  replaceableRules, earliestEndDate, addDaysIso, EMPTY_RULE_FORM,
  type RuleTable, type RuleRow, type RuleForm, type RuleFields, type CatalogueOption, dbMessage,
} from '@/lib/workforce/requirements';

export interface LevelOpt { id: string; label: string; rank: number; company_id: string | null }

type Msg = { ok: boolean; text: string } | null;

// The requirements on ONE scope — a role (role_requirements) or a site
// (site_requirements). In-force rules never change meaning (spec 105):
// "Change" copies the rule as a draft, the draft is edited, and activating
// it ends the old rule the day before. The database enforces every one of
// these rules (133 requirement_rule_guard); this screen only asks, and
// shows the database's message when it refuses.
export default function RequirementsEditor({ table, scopeId, companyId, rules, byTable, levels, canManage, today, scopeNoun }: {
  table: RuleTable;
  scopeId: string;
  companyId: string;
  rules: RuleRow[];
  byTable: Record<string, CatalogueOption[]>;
  levels: LevelOpt[];
  canManage: boolean;
  today: string;
  scopeNoun: 'role' | 'site';
}) {
  const router = useRouter();
  const groups = useMemo(() => groupRules(rules, today), [rules, today]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const [ending, setEnding] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  // draft id → the in-force rule it was copied from (this session only; the suggestion covers a reload)
  const [origin, setOrigin] = useState<Record<string, string>>({});
  const levelName = (id: string | null) => {
    const l = levels.find(x => x.id === id);
    return l ? l.label : '—';
  };

  function done(text: string) { setMsg({ ok: true, text }); router.refresh(); }

  async function supersede(r: RuleRow) {
    setBusy(r.id); setMsg(null);
    const { data, error } = await createClient().rpc('requirement_supersede', { p_table: table, p_id: r.id });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: dbMessage(error) }); return; }
    const draftId = data as string;
    setOrigin(o => ({ ...o, [draftId]: r.id }));
    setEditing(draftId);
    done('A draft copy has been made below. Edit it, then activate it from a date. The current rule stays in force until then.');
  }

  async function removeRule(r: RuleRow, what: string) {
    if (!window.confirm(`${what}? This cannot be undone.`)) return;
    setBusy(r.id); setMsg(null);
    const res = await createClient().from(table).delete(COUNT_EXACT).eq('id', r.id);
    setBusy(null);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The requirement');
    if (!out.ok) { setMsg({ ok: false, text: out.message! }); return; }
    done(`${what}: done.`);
  }

  const cols = (
    <tr>
      <th scope="col">Type</th><th scope="col">Requirement</th><th scope="col">Min level</th><th scope="col">Mandatory</th>
      <th scope="col">Safety-critical</th><th scope="col">Evidence</th><th scope="col">E-learning</th>
      <th scope="col">Validity</th><th scope="col">Grace</th><th scope="col">Source</th><th scope="col">Dates</th>
      {canManage && <th scope="col"><span className="sr-only">Actions</span></th>}
    </tr>
  );

  function row(r: RuleRow, state: 'in_force' | 'draft' | 'scheduled' | 'history') {
    const yes = (b: boolean) => (b ? 'Yes' : 'No');
    return (
      <tr key={r.id}>
        <td className="whitespace-nowrap">{REQUIREMENT_TYPE_LABELS[r.requirement_type] ?? r.requirement_type}</td>
        <td style={{ color: 'var(--ink)' }}>
          {referenceTitle(r, byTable)}
          {r.notes && <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>{r.notes}</span>}
        </td>
        <td>{r.requirement_type === 'competency' ? levelName(r.min_level_id) : '—'}</td>
        <td>{yes(r.mandatory)}</td>
        <td>{r.safety_critical ? <Pill tone="bad">Safety-critical</Pill> : 'No'}</td>
        <td>{r.evidence_required ? 'Required' : 'Not required'}</td>
        <td>{yes(r.allow_elearning)}</td>
        <td className="whitespace-nowrap">{r.validity_months ? `${r.validity_months} months` : 'Catalogue default'}</td>
        <td className="whitespace-nowrap">{r.grace_days ? `${r.grace_days} days` : 'None'}</td>
        <td>{r.source_type ? REQUIREMENT_SOURCE_LABELS[r.source_type as RequirementSource] ?? r.source_type : '—'}</td>
        <td className="whitespace-nowrap text-xs">
          {r.effective_from ? `From ${fmtDate(r.effective_from)}` : 'Not in force'}
          {r.effective_until && <span className="block">Until {fmtDate(r.effective_until)}</span>}
          {r.superseded_by && <span className="block" style={{ color: 'var(--ink-faint)' }}>Replaced by a newer version</span>}
        </td>
        {canManage && (
          <td className="whitespace-nowrap">
            <div className="flex flex-wrap gap-1">
              {state === 'in_force' && !r.effective_until && <>
                <button type="button" className="btn-secondary btn-sm" disabled={busy === r.id} onClick={() => supersede(r)}>
                  {busy === r.id ? <Loader2 size={12} className="animate-spin" /> : null} Change
                </button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => { setEnding(ending === r.id ? null : r.id); setMsg(null); }}>End</button>
              </>}
              {state === 'scheduled' && (
                <button type="button" className="btn-ghost btn-sm" disabled={busy === r.id} onClick={() => removeRule(r, 'Withdraw this scheduled requirement')}>Withdraw</button>
              )}
              {state === 'draft' && <>
                <button type="button" className="btn-secondary btn-sm" onClick={() => { setEditing(editing === r.id ? null : r.id); setActivating(null); }}>Edit</button>
                <button type="button" className="btn-cta btn-sm" onClick={() => { setActivating(activating === r.id ? null : r.id); setEditing(null); }}>Activate</button>
                <button type="button" className="btn-ghost btn-sm" disabled={busy === r.id} onClick={() => removeRule(r, 'Delete this draft')}>Delete</button>
              </>}
            </div>
          </td>
        )}
      </tr>
    );
  }

  function section(title: string, list: RuleRow[], state: 'in_force' | 'draft' | 'scheduled' | 'history', hint: string) {
    if (list.length === 0 && state !== 'in_force') return null;
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{title} <span style={{ color: 'var(--ink-faint)' }}>({list.length})</span></h3>
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{hint}</p>
        {list.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            Nothing is in force for this {scopeNoun}. {canManage ? 'Add a requirement, or activate a draft.' : 'Someone with workforce management access can add requirements.'}
          </p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>{cols}</thead>
              <tbody>
                {list.map(r => [
                  row(r, state),
                  editing === r.id && state === 'draft' ? (
                    <tr key={`${r.id}-edit`}><td colSpan={canManage ? 12 : 11}>
                      <RuleFormPanel mode="edit" initial={ruleToForm(r)} byTable={byTable} levels={levels} today={today}
                        onCancel={() => setEditing(null)}
                        onSubmit={async (fields) => {
                          const res = await createClient().from(table).update(fields, COUNT_EXACT).eq('id', r.id).is('effective_from', null);
                          const out = judgeWrite({ error: res.error, count: res.count }, 'The draft');
                          if (!out.ok) return out.message!;
                          setEditing(null); done('Draft saved. Activate it when it is ready.');
                          return null;
                        }} />
                    </td></tr>
                  ) : null,
                  activating === r.id && state === 'draft' ? (
                    <tr key={`${r.id}-act`}><td colSpan={canManage ? 12 : 11}>
                      <ActivatePanel draft={r} rules={rules} today={today} byTable={byTable} originId={origin[r.id] ?? null}
                        onCancel={() => setActivating(null)}
                        onSubmit={async (from, replaces) => {
                          const { error } = await createClient().rpc('requirement_activate',
                            { p_table: table, p_id: r.id, p_from: from, p_replaces: replaces });
                          if (error) return dbMessage(error);
                          setActivating(null);
                          done(replaces
                            ? `Activated from ${fmtDate(from)}. The version it replaces ends on ${fmtDate(addDaysIso(from, -1))} and stays in history.`
                            : `Activated from ${fmtDate(from)}.`);
                          return null;
                        }} />
                    </td></tr>
                  ) : null,
                  ending === r.id && state === 'in_force' ? (
                    <tr key={`${r.id}-end`}><td colSpan={canManage ? 12 : 11}>
                      <EndPanel today={today} onCancel={() => setEnding(null)} onSubmit={async (until) => {
                        const res = await createClient().from(table).update({ effective_until: until }, COUNT_EXACT).eq('id', r.id);
                        const out = judgeWrite({ error: res.error, count: res.count }, 'The end date');
                        if (!out.ok) return out.message!;
                        setEnding(null); done(`This requirement ends on ${fmtDate(until)}. It stays in history.`);
                        return null;
                      }} />
                    </td></tr>
                  ) : null,
                ])}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="card p-5 space-y-5" aria-label="Requirements">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Requirements</h2>
        {canManage && !adding && (
          <button type="button" className="btn-cta btn-sm ml-auto" onClick={() => { setAdding(true); setMsg(null); }}>
            <Plus size={14} /> Add a requirement
          </button>
        )}
      </div>
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
        A requirement in force never changes its meaning. To change one, press Change: a draft copy is made, you edit it and
        activate it from a date, and the old version ends the day before and stays in history.
      </p>
      {msg && <p role="status" className="text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</p>}

      {adding && (
        <RuleFormPanel mode="add" initial={EMPTY_RULE_FORM} byTable={byTable} levels={levels} today={today}
          onCancel={() => setAdding(false)}
          onSubmit={async (fields, from) => {
            const res = await createClient().from(table).insert(buildRuleInsert(table, scopeId, companyId, fields, from));
            if (res.error) return dbMessage(res.error);
            setAdding(false);
            done(from ? `Requirement added. It is in force from ${fmtDate(from)}.` : 'Draft added. Activate it when it is ready.');
            return null;
          }} />
      )}

      {section('In force', groups.in_force, 'in_force', 'Applies to everyone on this ' + scopeNoun + ' today.')}
      {section('Scheduled', groups.scheduled, 'scheduled', 'Comes into force on the date shown.')}
      {section('Drafts', groups.draft, 'draft', 'Applies to no one until activated.')}
      {groups.history.length > 0 && (
        <details>
          <summary className="text-sm font-semibold cursor-pointer" style={{ color: 'var(--ink)' }}>
            History ({groups.history.length})
          </summary>
          <div className="mt-2">{section('Ended or replaced', groups.history, 'history', 'Kept so a past date is always judged by the rule in force then.')}</div>
        </details>
      )}
    </section>
  );
}

function RuleFormPanel({ mode, initial, byTable, levels, today, onSubmit, onCancel }: {
  mode: 'add' | 'edit';
  initial: RuleForm;
  byTable: Record<string, CatalogueOption[]>;
  levels: LevelOpt[];
  today: string;
  onSubmit: (fields: RuleFields, from: string | null) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [f, setF] = useState<RuleForm>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof RuleForm>(k: K, v: RuleForm[K]) => setF(p => ({ ...p, [k]: v }));
  const options = optionsForType(f.requirement_type, byTable);
  const id = (s: string) => `rf-${mode}-${s}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = validateRuleForm(f, today, mode === 'add');
    if (!v.ok) { setErr(v.message); return; }
    setBusy(true); setErr(null);
    const problem = await onSubmit(v.fields, v.effective_from);
    setBusy(false);
    if (problem) setErr(problem);
  }

  return (
    <form onSubmit={submit} className="space-y-3 p-3 rounded-lg" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
      <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{mode === 'add' ? 'New requirement' : 'Edit draft'}</p>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="label" htmlFor={id('type')}>Type</label>
          <select id={id('type')} className="input" value={f.requirement_type}
            onChange={e => setF(p => ({ ...p, requirement_type: e.target.value as RuleForm['requirement_type'], reference_id: '', min_level_id: '' }))}>
            <option value="">Choose…</option>
            {REQUIREMENT_TYPES.map(t => <option key={t} value={t}>{REQUIREMENT_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        {f.requirement_type === 'document' ? (
          <div>
            <label className="label" htmlFor={id('key')}>Document</label>
            <input id={id('key')} className="input" value={f.reference_key} maxLength={100} onChange={e => set('reference_key', e.target.value)}
              placeholder="For example: Driving licence check" />
          </div>
        ) : f.requirement_type ? (
          <div>
            <label className="label" htmlFor={id('ref')}>{REQUIREMENT_TYPE_LABELS[f.requirement_type]}</label>
            <select id={id('ref')} className="input" value={f.reference_id} onChange={e => set('reference_id', e.target.value)}>
              <option value="">Choose…</option>
              {options.map(o => <option key={o.id} value={o.id}>{o.title}{o.company_id ? '' : ' (standard)'}</option>)}
            </select>
            {options.length === 0 && (
              <p className="text-xs mt-1" style={{ color: 'var(--gold)' }}>
                Nothing of this type in the catalogue yet. Add one on the Catalogue page first.
              </p>
            )}
          </div>
        ) : null}
        {f.requirement_type === 'competency' && (
          <div>
            <label className="label" htmlFor={id('lvl')}>Minimum level</label>
            <select id={id('lvl')} className="input" value={f.min_level_id} onChange={e => set('min_level_id', e.target.value)}>
              <option value="">Choose…</option>
              {levels.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor={id('val')}>Validity (months)</label>
          <input id={id('val')} className="input" inputMode="numeric" value={f.validity_months} onChange={e => set('validity_months', e.target.value)}
            placeholder="Blank = catalogue default" />
        </div>
        <div>
          <label className="label" htmlFor={id('grace')}>Grace (days, 0–90)</label>
          <input id={id('grace')} className="input" inputMode="numeric" value={f.grace_days} onChange={e => set('grace_days', e.target.value)} />
        </div>
      </div>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
        <legend className="label">Rules</legend>
        {([['mandatory', 'Mandatory'], ['safety_critical', 'Safety-critical'], ['evidence_required', 'Evidence required'], ['allow_elearning', 'E-learning can satisfy it']] as const).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
            <input type="checkbox" checked={f[k]} onChange={e => set(k, e.target.checked)} /> {l}
          </label>
        ))}
      </fieldset>
      <div>
        <label className="label" htmlFor={id('notes')}>Notes</label>
        <textarea id={id('notes')} className="input" rows={2} maxLength={2000} value={f.notes} onChange={e => set('notes', e.target.value)} />
      </div>
      {mode === 'add' && (
        <fieldset className="space-y-2">
          <legend className="label">When</legend>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
            <input type="radio" name={id('mode')} checked={f.mode === 'draft'} onChange={() => set('mode', 'draft')} /> Save as a draft (applies to no one yet)
          </label>
          <label className="flex flex-wrap items-center gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
            <input type="radio" name={id('mode')} checked={f.mode === 'from'} onChange={() => set('mode', 'from')} /> In force from
            <input type="date" className="input" style={{ width: 'auto' }} aria-label="In force from" min={today}
              value={f.effective_from} onChange={e => { set('effective_from', e.target.value); set('mode', 'from'); }} />
          </label>
        </fieldset>
      )}
      {err && <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-cta btn-sm" disabled={busy}>
          {busy && <Loader2 size={12} className="animate-spin" />} {mode === 'add' ? 'Add requirement' : 'Save draft'}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function ActivatePanel({ draft, rules, today, byTable, originId, onSubmit, onCancel }: {
  draft: RuleRow; rules: RuleRow[]; today: string; byTable: Record<string, CatalogueOption[]>; originId: string | null;
  onSubmit: (from: string, replaces: string | null) => Promise<string | null>; onCancel: () => void;
}) {
  const candidates = replaceableRules(rules, today).filter(r => r.id !== draft.id);
  const suggested = originId && candidates.some(c => c.id === originId) ? originId : suggestReplaced(draft, rules, today)?.id ?? '';
  const [from, setFrom] = useState(today);
  const [replaces, setReplaces] = useState(suggested);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || from < today) { setErr('Activate from today or a later date.'); return; }
    setBusy(true); setErr(null);
    const problem = await onSubmit(from, replaces || null);
    setBusy(false);
    if (problem) setErr(problem);
  }

  return (
    <form onSubmit={submit} className="space-y-3 p-3 rounded-lg" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`act-from-${draft.id}`}>In force from</label>
          <input id={`act-from-${draft.id}`} type="date" className="input" min={today} value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor={`act-rep-${draft.id}`}>Replaces</label>
          <select id={`act-rep-${draft.id}`} className="input" value={replaces} onChange={e => setReplaces(e.target.value)}>
            <option value="">Nothing — this is a new requirement</option>
            {candidates.map(c => (
              <option key={c.id} value={c.id}>
                {REQUIREMENT_TYPE_LABELS[c.requirement_type]}: {referenceTitle(c, byTable)} (from {fmtDate(c.effective_from)})
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
        {replaces
          ? `The version it replaces stays in history and ends on ${fmtDate(from ? addDaysIso(from, -1) : null)}. Nobody's past compliance is reinterpreted.`
          : 'This adds a new requirement. If it is meant to replace one already in force, choose it above, or both will apply.'}
      </p>
      {err && <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-cta btn-sm" disabled={busy}>{busy && <Loader2 size={12} className="animate-spin" />} Activate</button>
        <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function EndPanel({ today, onSubmit, onCancel }: {
  today: string; onSubmit: (until: string) => Promise<string | null>; onCancel: () => void;
}) {
  const min = earliestEndDate(today);
  const [until, setUntil] = useState(today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!until || until < min) { setErr(`An end date cannot be earlier than ${fmtDate(min)} — requirements are never ended retroactively.`); return; }
    setBusy(true); setErr(null);
    const problem = await onSubmit(until);
    setBusy(false);
    if (problem) setErr(problem);
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 p-3 rounded-lg" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
      <div>
        <label className="label" htmlFor="end-until">Last day in force</label>
        <input id="end-until" type="date" className="input" min={min} value={until} onChange={e => setUntil(e.target.value)} />
      </div>
      <button type="submit" className="btn-cta btn-sm" disabled={busy}>{busy && <Loader2 size={12} className="animate-spin" />} End requirement</button>
      <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      {err && <p role="alert" className="text-sm w-full" style={{ color: 'var(--red)' }}>{err}</p>}
    </form>
  );
}
