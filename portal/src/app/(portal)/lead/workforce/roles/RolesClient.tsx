'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { fmtDate } from '@/lib/hs/safetyFormat';
import { workforceRolePath, type RoleStatus } from '@/lib/workforce/vocab';
import { roleFields, EMPTY_ROLE, type RoleFormValues, dbMessage } from '@/lib/workforce/requirements';

interface Opt { id: string; name: string }

export function RoleFields({ v, set, sites, departments, idPrefix }: {
  v: RoleFormValues; set: <K extends keyof RoleFormValues>(k: K, val: RoleFormValues[K]) => void;
  sites: Opt[]; departments: Opt[]; idPrefix: string;
}) {
  const id = (s: string) => `${idPrefix}-${s}`;
  return (
    <>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={id('title')}>Title</label>
          <input id={id('title')} className="input" required maxLength={200} value={v.title} onChange={e => set('title', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor={id('cat')}>Category</label>
          <input id={id('cat')} className="input" maxLength={100} value={v.role_category} onChange={e => set('role_category', e.target.value)}
            placeholder="For example: Operations" />
        </div>
        <div>
          <label className="label" htmlFor={id('dept')}>Department</label>
          <select id={id('dept')} className="input" value={v.department_id} onChange={e => set('department_id', e.target.value)}>
            <option value="">Not set</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={id('site')}>Default site</label>
          <select id={id('site')} className="input" value={v.default_site_id} onChange={e => set('default_site_id', e.target.value)}>
            <option value="">Not set</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor={id('desc')}>Description</label>
        <textarea id={id('desc')} className="input" rows={2} maxLength={4000} value={v.description} onChange={e => set('description', e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
        <input type="checkbox" checked={v.safety_critical} onChange={e => set('safety_critical', e.target.checked)} />
        Safety-critical role (every mandatory requirement on it is treated as safety-critical)
      </label>
    </>
  );
}

// Create a role (workforce.manage). A new role starts ACTIVE with no
// requirements; add them on the role's page.
export function CreateRoleForm({ companyId, sites, departments }: { companyId: string; sites: Opt[]; departments: Opt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<RoleFormValues>(EMPTY_ROLE);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof RoleFormValues>(k: K, val: RoleFormValues[K]) => setV(p => ({ ...p, [k]: val }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const f = roleFields(v);
    if (!f.ok) { setErr(f.message); return; }
    setBusy(true); setErr(null);
    const { data, error } = await createClient().from('job_roles').insert({ company_id: companyId, ...f.row }).select('id').single();
    setBusy(false);
    if (error) { setErr(dbMessage(error)); return; }
    router.push(workforceRolePath((data as { id: string }).id));
  }

  if (!open) {
    return <button type="button" className="btn-cta btn-sm" style={{ minHeight: 40 }} onClick={() => setOpen(true)}><Plus size={14} /> New role</button>;
  }
  return (
    <form onSubmit={submit} className="card p-4 space-y-3 w-full">
      <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>New role</h2>
      <RoleFields v={v} set={set} sites={sites} departments={departments} idPrefix="new-role" />
      {err && <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>{err}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn-cta btn-sm" disabled={busy}>{busy && <Loader2 size={12} className="animate-spin" />} Create role</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => { setOpen(false); setErr(null); }}>Cancel</button>
      </div>
    </form>
  );
}

// Clone / activate / deactivate for one role (workforce.manage).
export function RoleActions({ role, today, draftCount, assignedCount }: {
  role: { id: string; title: string; active_status: RoleStatus };
  today: string; draftCount: number; assignedCount: number;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<'clone' | 'activate' | null>(null);
  const [title, setTitle] = useState(`${role.title} (copy)`);
  const [from, setFrom] = useState(today);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function clone(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || t.length > 200) { setMsg({ ok: false, text: 'Give the copy a title of 1 to 200 characters.' }); return; }
    setBusy(true); setMsg(null);
    const { data, error } = await createClient().rpc('job_role_clone', { p_role: role.id, p_title: t });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: dbMessage(error) }); return; }
    router.push(`${workforceRolePath(data as string)}?cloned=1`);
  }

  async function activate(e: React.FormEvent) {
    e.preventDefault();
    if (!from || from < today) { setMsg({ ok: false, text: 'Activate from today or a later date.' }); return; }
    setBusy(true); setMsg(null);
    const { data, error } = await createClient().rpc('job_role_activate', { p_role: role.id, p_from: from });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: dbMessage(error) }); return; }
    setPanel(null);
    setMsg({ ok: true, text: `Role active. ${Number(data ?? 0)} draft requirement${Number(data) === 1 ? '' : 's'} in force from ${fmtDate(from)}.` });
    router.refresh();
  }

  async function setStatus(next: 'active' | 'inactive') {
    if (next === 'inactive' && !window.confirm(
      `Deactivate "${role.title}"? It will no longer be offered for new assignments.`
      + (assignedCount > 0 ? ` ${assignedCount} ${assignedCount === 1 ? 'person is' : 'people are'} still assigned and must still meet its requirements until their assignment is ended.` : ''))) return;
    setBusy(true); setMsg(null);
    const res = await createClient().from('job_roles').update({ active_status: next }, COUNT_EXACT).eq('id', role.id);
    setBusy(false);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The role');
    if (!out.ok) { setMsg({ ok: false, text: out.message! }); return; }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        <button type="button" className="btn-secondary btn-sm" onClick={() => { setPanel(panel === 'clone' ? null : 'clone'); setMsg(null); }}>Clone</button>
        {role.active_status === 'draft' && (
          <button type="button" className="btn-cta btn-sm" onClick={() => { setPanel(panel === 'activate' ? null : 'activate'); setMsg(null); }}>Activate</button>
        )}
        {role.active_status === 'active' && (
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setStatus('inactive')}>Deactivate</button>
        )}
        {role.active_status === 'inactive' && (
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setStatus('active')}>Reactivate</button>
        )}
      </div>
      {panel === 'clone' && (
        <form onSubmit={clone} className="space-y-2 p-3 rounded-lg" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
          <label className="label" htmlFor={`clone-${role.id}`}>Title for the copy</label>
          <input id={`clone-${role.id}`} className="input" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} />
          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
            The copy starts as a DRAFT role with draft copies of the requirements in force today. Nothing applies to anyone
            until you review them and activate the role.
          </p>
          <div className="flex gap-2">
            <button type="submit" className="btn-cta btn-sm" disabled={busy}>{busy && <Loader2 size={12} className="animate-spin" />} Clone and review</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setPanel(null)}>Cancel</button>
          </div>
        </form>
      )}
      {panel === 'activate' && (
        <form onSubmit={activate} className="space-y-2 p-3 rounded-lg" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
          <label className="label" htmlFor={`act-${role.id}`}>Requirements in force from</label>
          <input id={`act-${role.id}`} type="date" className="input" min={today} value={from} onChange={e => setFrom(e.target.value)} />
          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
            Activating the role brings all {draftCount} draft requirement{draftCount === 1 ? '' : 's'} into force from this date.
            Review them on the role&apos;s page first.
          </p>
          <div className="flex gap-2">
            <button type="submit" className="btn-cta btn-sm" disabled={busy}>{busy && <Loader2 size={12} className="animate-spin" />} Activate role</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setPanel(null)}>Cancel</button>
          </div>
        </form>
      )}
      {msg && <p role="status" className="text-xs" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</p>}
    </div>
  );
}

// Edit the role's own details (workforce.manage).
export function EditRoleForm({ role, sites, departments }: {
  role: { id: string } & RoleFormValues; sites: Opt[]; departments: Opt[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<RoleFormValues>(role);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof RoleFormValues>(k: K, val: RoleFormValues[K]) => setV(p => ({ ...p, [k]: val }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const f = roleFields(v);
    if (!f.ok) { setMsg({ ok: false, text: f.message }); return; }
    setBusy(true); setMsg(null);
    const res = await createClient().from('job_roles').update(f.row, COUNT_EXACT).eq('id', role.id);
    setBusy(false);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The role');
    if (!out.ok) { setMsg({ ok: false, text: out.message! }); return; }
    setOpen(false); setMsg({ ok: true, text: 'Saved.' });
    router.refresh();
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>Edit role details</button>
        {msg && <span role="status" className="text-xs" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</span>}
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="card p-4 space-y-3">
      <RoleFields v={v} set={set} sites={sites} departments={departments} idPrefix="edit-role" />
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
        Changing the safety-critical flag changes how every mandatory requirement on this role is judged from now on.
      </p>
      {msg && <p role="alert" className="text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn-cta btn-sm" disabled={busy}>{busy && <Loader2 size={12} className="animate-spin" />} Save</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => { setOpen(false); setV(role); }}>Cancel</button>
      </div>
    </form>
  );
}
