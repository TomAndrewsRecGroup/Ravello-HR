'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import Pill from '@/components/safety/Pill';
import {
  CATALOGUE_CONFIG, buildCatalogueRow, emptyValues, rowToValues, cellText,
  type EditableTab, type CatalogueField, type FormValues, dbMessage,
} from '@/lib/workforce/requirements';

type Row = Record<string, unknown> & { id: string; company_id: string | null; active_status: string };
interface Opt { id: string; name: string }

// One catalogue (courses, competencies, …). Standard rows (company_id
// NULL) are maintained by Core OS 360 and are read-only here; the
// organisation's own rows are editable with workforce.manage (RLS
// decides). Items are deactivated, never deleted, so existing
// requirements that point at them keep their meaning.
export default function CatalogueClient({ tab, rows, companyId, canManage, sites, learningContent = [] }: {
  tab: EditableTab; rows: Row[]; companyId: string; canManage: boolean; sites: Opt[]; learningContent?: Opt[];
}) {
  const router = useRouter();
  const cfg = CATALOGUE_CONFIG[tab];
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const siteName = (id: string) => sites.find(s => s.id === id)?.name ?? '—';
  const learningContentTitle = (id: string) => learningContent.find(c => c.id === id)?.name ?? '—';
  const columns = cfg.fields.filter(f => f.column);
  const colSpan = columns.length + 2 + (canManage ? 1 : 0);

  async function setActive(r: Row, next: 'active' | 'inactive') {
    setBusy(r.id); setMsg(null);
    const res = await createClient().from(cfg.table).update({ active_status: next }, COUNT_EXACT).eq('id', r.id).eq('company_id', companyId);
    setBusy(null);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The item');
    if (!out.ok) { setMsg({ ok: false, text: out.message! }); return; }
    setMsg({ ok: true, text: next === 'inactive'
      ? 'Deactivated. It can no longer be chosen for new requirements; requirements already using it are unchanged.'
      : 'Reactivated.' });
    router.refresh();
  }

  return (
    <section className="space-y-3" aria-label={cfg.label}>
      <div className="flex flex-wrap items-start gap-2">
        <p className="text-sm flex-1 min-w-[240px]" style={{ color: 'var(--ink-soft)' }}>{cfg.intro}</p>
        {canManage && !adding && (
          <button type="button" className="btn-cta btn-sm" style={{ minHeight: 40 }} onClick={() => { setAdding(true); setMsg(null); }}>
            <Plus size={14} /> Add
          </button>
        )}
      </div>
      {msg && <p role="status" className="text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</p>}
      {adding && (
        <ItemForm tab={tab} mode="insert" initial={emptyValues(tab)} sites={sites} learningContent={learningContent} onCancel={() => setAdding(false)}
          onSubmit={async (row) => {
            const res = await createClient().from(cfg.table).insert({ company_id: companyId, ...row });
            if (res.error) return dbMessage(res.error);
            setAdding(false); setMsg({ ok: true, text: 'Added.' }); router.refresh();
            return null;
          }} />
      )}

      {rows.length === 0 ? (
        <div className="card p-6 text-sm" style={{ color: 'var(--ink-soft)' }}>
          Nothing in this catalogue yet. {canManage ? 'Add the first item — requirements on roles and sites can then point at it.' : 'Someone with workforce management access can add items.'}
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <caption className="sr-only">{cfg.label}</caption>
            <thead>
              <tr>
                {columns.map(c => <th key={c.name} scope="col">{c.label}</th>)}
                <th scope="col">Owner</th><th scope="col">Status</th>
                {canManage && <th scope="col"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const own = r.company_id === companyId;
                return [
                  <tr key={r.id}>
                    {columns.map(c => (
                      <td key={c.name} style={c.name === 'title' ? { color: 'var(--ink)' } : undefined}>{cellText(c, r[c.name], siteName, learningContentTitle)}</td>
                    ))}
                    <td>{own ? 'Your organisation' : <Pill tone="muted">Standard</Pill>}</td>
                    <td>{r.active_status === 'active' ? <Pill tone="good">Active</Pill> : <Pill tone="muted">Inactive</Pill>}</td>
                    {canManage && (
                      <td className="whitespace-nowrap">
                        {own ? (
                          <div className="flex gap-1">
                            <button type="button" className="btn-secondary btn-sm" onClick={() => { setEditing(editing === r.id ? null : r.id); setMsg(null); }}>Edit</button>
                            <button type="button" className="btn-ghost btn-sm" disabled={busy === r.id}
                              onClick={() => setActive(r, r.active_status === 'active' ? 'inactive' : 'active')}>
                              {r.active_status === 'active' ? 'Deactivate' : 'Reactivate'}
                            </button>
                          </div>
                        ) : <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>Read-only</span>}
                      </td>
                    )}
                  </tr>,
                  editing === r.id ? (
                    <tr key={`${r.id}-edit`}><td colSpan={colSpan}>
                      <ItemForm tab={tab} mode="update" initial={rowToValues(tab, r)} sites={sites} learningContent={learningContent} onCancel={() => setEditing(null)}
                        onSubmit={async (row) => {
                          const res = await createClient().from(cfg.table).update(row, COUNT_EXACT).eq('id', r.id).eq('company_id', companyId);
                          const out = judgeWrite({ error: res.error, count: res.count }, 'The item');
                          if (!out.ok) return out.message!;
                          setEditing(null); setMsg({ ok: true, text: 'Saved.' }); router.refresh();
                          return null;
                        }} />
                    </td></tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ItemForm({ tab, mode, initial, sites, learningContent, onSubmit, onCancel }: {
  tab: EditableTab; mode: 'insert' | 'update'; initial: FormValues; sites: Opt[]; learningContent: Opt[];
  onSubmit: (row: Record<string, string | number | boolean | null>) => Promise<string | null>; onCancel: () => void;
}) {
  const cfg = CATALOGUE_CONFIG[tab];
  const [v, setV] = useState<FormValues>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const id = (n: string) => `cat-${tab}-${mode}-${n}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const b = buildCatalogueRow(tab, v, mode);
    if (!b.ok) { setErr(b.message); return; }
    setBusy(true); setErr(null);
    const problem = await onSubmit(b.row);
    setBusy(false);
    if (problem) setErr(problem);
  }

  const input = (f: CatalogueField) => {
    const disabled = mode === 'update' && f.createOnly;
    const val = v[f.name];
    const set = (x: string | boolean) => setV(p => ({ ...p, [f.name]: x }));
    if (f.kind === 'bool') {
      return (
        <label key={f.name} className="flex items-center gap-2 text-sm self-end pb-2" style={{ color: 'var(--ink-soft)' }}>
          <input type="checkbox" checked={val === true} onChange={e => set(e.target.checked)} /> {f.label}
        </label>
      );
    }
    return (
      <div key={f.name} className={f.kind === 'textarea' ? 'sm:col-span-2 lg:col-span-3' : undefined}>
        <label className="label" htmlFor={id(f.name)}>{f.label}{f.required ? ' (required)' : ''}</label>
        {f.kind === 'textarea' ? (
          <textarea id={id(f.name)} className="input" rows={3} maxLength={f.max} value={String(val ?? '')} onChange={e => set(e.target.value)} />
        ) : f.kind === 'select' ? (
          <select id={id(f.name)} className="input" disabled={disabled} value={String(val ?? '')} onChange={e => set(e.target.value)}>
            {!f.required && <option value="">Not set</option>}
            {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : f.kind === 'site' ? (
          <select id={id(f.name)} className="input" value={String(val ?? '')} onChange={e => set(e.target.value)}>
            <option value="">Not set</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        ) : f.kind === 'learning_content' ? (
          <select id={id(f.name)} className="input" value={String(val ?? '')} onChange={e => set(e.target.value)}>
            <option value="">Not set</option>
            {learningContent.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : (
          <input id={id(f.name)} className="input" disabled={disabled} inputMode={f.kind === 'number' ? 'numeric' : undefined}
            maxLength={f.kind === 'text' ? f.max : undefined} value={String(val ?? '')} onChange={e => set(e.target.value)} />
        )}
        {disabled && <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>Set when created; cannot be changed.</p>}
        {!disabled && f.patternHint && <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>{f.patternHint}</p>}
      </div>
    );
  };

  return (
    <form onSubmit={submit} className="card p-4 space-y-3" style={{ background: 'var(--surface-soft)' }}>
      <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{mode === 'insert' ? `New ${cfg.label.toLowerCase()} item` : 'Edit'}</p>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">{cfg.fields.map(input)}</div>
      {err && <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>{err}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn-cta btn-sm" disabled={busy}>{busy && <Loader2 size={12} className="animate-spin" />} {mode === 'insert' ? 'Add' : 'Save'}</button>
        <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
