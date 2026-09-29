'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, ClipboardCheck, Loader2, Plus, UserPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { useToast } from '@/components/modules/Toast';
import {
  PERMIT_TYPES, PERMIT_TYPE_LABELS, PERMIT_STATUS_LABELS, type PermitType, type PermitStatus,
} from '@/lib/hs/vocab';
import type { Permit, PermitPerson, PermitTemplate } from '@/lib/hs/types';

interface PickOption { id: string; name: string }
interface AuthOption { id: string; title: string }

interface Props {
  companyId: string;
  templates: PermitTemplate[];
  permits: Permit[];
  permitPeople: PermitPerson[];
  sites: PickOption[];
  equipment: PickOption[];
  people: PickOption[];
  authorisationTypes: AuthOption[];
  loadError: string | null;
}

const fmtDt = (d: string | null) =>
  d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const STATUS_COLOUR: Record<PermitStatus, string> = {
  draft: 'var(--ink-faint)', issued: 'var(--teal)', suspended: 'var(--gold)', closed: 'var(--ink-faint)', revoked: 'var(--red)',
};

export default function PermitsClient({
  companyId, templates, permits, permitPeople, sites, equipment, people, authorisationTypes, loadError,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [showTemplates, setShowTemplates] = useState(false);
  const [showNewPermit, setShowNewPermit] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const nameFor = (id: string | null) => (id ? people.find(p => p.id === id)?.name ?? 'Unknown' : '—');
  const siteFor = (id: string) => sites.find(s => s.id === id)?.name ?? 'Unknown site';
  const templateFor = (id: string) => templates.find(t => t.id === id) ?? null;
  const peopleFor = (permitId: string) => permitPeople.filter(pp => pp.permit_id === permitId);

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load permits: {loadError}</p>}

      <div className="flex gap-2">
        <button className="btn-secondary btn-sm" onClick={() => setShowTemplates(o => !o)}>
          {showTemplates ? 'Hide templates' : 'Manage templates'}
        </button>
        <button className="btn-cta btn-sm ml-auto" onClick={() => setShowNewPermit(o => !o)}><Plus size={14} /> New permit</button>
      </div>

      {showTemplates && (
        <TemplatesPanel companyId={companyId} templates={templates} authorisationTypes={authorisationTypes} />
      )}

      {showNewPermit && (
        <NewPermitForm
          companyId={companyId} templates={templates.filter(t => t.active)} sites={sites} equipment={equipment}
          onDone={() => { setShowNewPermit(false); router.refresh(); }}
        />
      )}

      {permits.length === 0 ? (
        <div className="card empty-state p-10">
          <ClipboardCheck size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No permits to work recorded.</p>
        </div>
      ) : (
        <ul className="card divide-y" style={{ borderColor: 'var(--line)' }}>
          {permits.map(p => {
            const isOpen = expanded === p.id;
            const tmpl = templateFor(p.template_id);
            return (
              <li key={p.id}>
                <button className="w-full flex items-center gap-3 p-4 text-left" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : p.id)}>
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{p.permit_number ?? 'draft'}</span>
                      <strong style={{ color: 'var(--ink)' }}>{tmpl ? PERMIT_TYPE_LABELS[tmpl.permit_type] : 'Permit'}</strong>
                      <span className="badge">{siteFor(p.site_id)}</span>
                    </span>
                    <span className="block text-xs truncate" style={{ color: 'var(--ink-faint)' }}>{p.scope_of_work}</span>
                  </span>
                  <span className="text-right text-sm whitespace-nowrap font-medium" style={{ color: STATUS_COLOUR[p.status] }}>
                    {PERMIT_STATUS_LABELS[p.status]}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pl-11 space-y-4">
                    <div className="grid gap-2 text-xs sm:grid-cols-2" style={{ color: 'var(--ink-faint)' }}>
                      {p.issued_at && <span>Issued {fmtDt(p.issued_at)} by {nameFor(p.authorised_person_id)}</span>}
                      {p.valid_until && <span>Valid until {fmtDt(p.valid_until)}</span>}
                      {p.suspended_reason && <span style={{ color: 'var(--gold)' }}>Suspended: {p.suspended_reason}</span>}
                      {p.closeout_notes && <span>Closed: {p.closeout_notes}</span>}
                      {p.revoked_reason && <span style={{ color: 'var(--red)' }}>Revoked: {p.revoked_reason}</span>}
                    </div>

                    <div>
                      <h3 className="label">People covered</h3>
                      {peopleFor(p.id).length === 0 ? (
                        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>Nobody added yet.</p>
                      ) : (
                        <ul className="flex flex-wrap gap-2">
                          {peopleFor(p.id).map(pp => (
                            <li key={pp.id} className="badge">{nameFor(pp.person_id)}</li>
                          ))}
                        </ul>
                      )}
                      {p.status === 'draft' && (
                        <AddPersonForm companyId={companyId} permitId={p.id} people={people} already={peopleFor(p.id).map(pp => pp.person_id)} />
                      )}
                    </div>

                    <PermitActions permit={p} people={people} onDone={() => router.refresh()} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TemplatesPanel({ companyId, templates, authorisationTypes }: { companyId: string; templates: PermitTemplate[]; authorisationTypes: AuthOption[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState<PermitType>('hot_work');
  const [authId, setAuthId] = useState('');
  const [hours, setHours] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('permit_templates').insert({
      company_id: companyId, name: name.trim(), permit_type: type,
      required_authorisation_type_id: authId || null,
      default_validity_hours: hours ? Number(hours) : null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Template added', 'success');
    setName(''); setAuthId(''); setHours('');
    router.refresh();
  }

  return (
    <div className="card p-4 space-y-3">
      <h3 className="label">Permit templates</h3>
      {templates.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No templates yet — add one below.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {templates.map(t => (
            <li key={t.id} className="badge" style={{ opacity: t.active ? 1 : 0.5 }}>
              {t.name} · {PERMIT_TYPE_LABELS[t.permit_type]}{!t.active && ' (inactive)'}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-4">
        <label className="block sm:col-span-2">
          <span className="label">Template name</span>
          <input className="input" value={name} onChange={e => setName(e.target.value)} maxLength={200} required placeholder="Roof hot work" />
        </label>
        <label className="block">
          <span className="label">Type</span>
          <select className="input" value={type} onChange={e => setType(e.target.value as PermitType)}>
            {PERMIT_TYPES.map(t => <option key={t} value={t}>{PERMIT_TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Default hours (optional)</span>
          <input className="input" type="number" min={1} max={8760} value={hours} onChange={e => setHours(e.target.value)} />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Required authorisation (optional)</span>
          <select className="input" value={authId} onChange={e => setAuthId(e.target.value)}>
            <option value="">None required</option>
            {authorisationTypes.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </label>
        <div className="sm:col-span-4 flex justify-end">
          <button className="btn-cta btn-sm" disabled={busy || !name.trim()}>{busy && <Loader2 size={14} className="animate-spin" />} Add template</button>
        </div>
      </form>
    </div>
  );
}

function NewPermitForm({ companyId, templates, sites, equipment, onDone }: {
  companyId: string; templates: PermitTemplate[]; sites: PickOption[]; equipment: PickOption[]; onDone: () => void;
}) {
  const { toast } = useToast();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const [assetId, setAssetId] = useState('');
  const [scope, setScope] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!templateId || !siteId) { toast('A template and a site are required.', 'error'); return; }
    setBusy(true);
    const { error } = await createClient().from('permits').insert({
      company_id: companyId, template_id: templateId, site_id: siteId,
      asset_id: assetId || null, scope_of_work: scope.trim(),
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Permit created as a draft', 'success');
    onDone();
  }

  if (templates.length === 0) {
    return <p className="card p-4 text-sm" style={{ color: 'var(--ink-faint)' }}>Add an active permit template first.</p>;
  }
  if (sites.length === 0) {
    return <p className="card p-4 text-sm" style={{ color: 'var(--ink-faint)' }}>This client has no active sites to issue a permit against.</p>;
  }

  return (
    <form onSubmit={submit} className="card p-4 grid gap-3 md:grid-cols-2">
      <label className="block">
        <span className="label">Template</span>
        <select className="input" value={templateId} onChange={e => setTemplateId(e.target.value)}>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({PERMIT_TYPE_LABELS[t.permit_type]})</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">Site</span>
        <select className="input" value={siteId} onChange={e => setSiteId(e.target.value)}>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="block md:col-span-2">
        <span className="label">Asset (optional)</span>
        <select className="input" value={assetId} onChange={e => setAssetId(e.target.value)}>
          <option value="">No specific asset</option>
          {equipment.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label className="block md:col-span-2">
        <span className="label">Scope of work</span>
        <textarea className="input" rows={3} value={scope} onChange={e => setScope(e.target.value)} maxLength={4000} required />
      </label>
      <div className="md:col-span-2 flex justify-end">
        <button className="btn-cta" disabled={busy || !scope.trim()}>{busy && <Loader2 size={15} className="animate-spin" />} Create draft</button>
      </div>
    </form>
  );
}

function AddPersonForm({ companyId, permitId, people, already }: { companyId: string; permitId: string; people: PickOption[]; already: string[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [personId, setPersonId] = useState('');
  const [busy, setBusy] = useState(false);
  const options = people.filter(p => !already.includes(p.id));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!personId) return;
    setBusy(true);
    const { error } = await createClient().from('permit_people').insert({ permit_id: permitId, company_id: companyId, person_id: personId });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    setPersonId('');
    router.refresh();
  }

  if (options.length === 0) return null;
  return (
    <form onSubmit={add} className="mt-2 flex items-center gap-2">
      <select className="input input-sm" value={personId} onChange={e => setPersonId(e.target.value)}>
        <option value="">Add a person…</option>
        {options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button className="btn-secondary btn-sm" disabled={busy || !personId}><UserPlus size={13} /> Add</button>
    </form>
  );
}

function PermitActions({ permit, people, onDone }: { permit: Permit; people: PickOption[]; onDone: () => void }) {
  const { toast } = useToast();
  const [authorisedPerson, setAuthorisedPerson] = useState(permit.authorised_person_id ?? '');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<'suspend' | 'close' | 'revoke' | null>(null);
  const [busy, setBusy] = useState(false);

  async function issue() {
    setBusy(true);
    const res = await createClient().from('permits')
      .update({ status: 'issued', authorised_person_id: authorisedPerson || null }, COUNT_EXACT).eq('id', permit.id);
    setBusy(false);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Could not issue the permit.', 'error'); return; }
    toast(permit.status === 'draft' ? 'Permit issued' : 'Permit revalidated and reissued', 'success');
    onDone();
  }

  async function apply(status: 'suspended' | 'closed' | 'revoked', field: 'suspended_reason' | 'closeout_notes' | 'revoked_reason') {
    if (!reason.trim()) { toast('That needs a reason first.', 'error'); return; }
    setBusy(true);
    const res = await createClient().from('permits').update({ status, [field]: reason.trim() }, COUNT_EXACT).eq('id', permit.id);
    setBusy(false);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Could not update the permit.', 'error'); return; }
    toast('Permit updated', 'success');
    setReason(''); setPending(null);
    onDone();
  }

  if (permit.status === 'draft' || permit.status === 'suspended') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {permit.status === 'draft' && (
          <label className="flex items-center gap-1.5 text-xs">
            <span style={{ color: 'var(--ink-faint)' }}>Authorising person</span>
            <select className="input input-sm" value={authorisedPerson} onChange={e => setAuthorisedPerson(e.target.value)}>
              <option value="">—</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <button className="btn-cta btn-sm" disabled={busy} onClick={issue}>
          {busy && <Loader2 size={14} className="animate-spin" />} {permit.status === 'draft' ? 'Issue' : 'Revalidate & reissue'}
        </button>
        {permit.status === 'suspended' && <RevokeInline reason={reason} setReason={setReason} pending={pending} setPending={setPending} busy={busy} onApply={() => apply('revoked', 'revoked_reason')} />}
      </div>
    );
  }

  if (permit.status === 'issued') {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary btn-sm" onClick={() => setPending(pending === 'suspend' ? null : 'suspend')}>Suspend</button>
          <button className="btn-secondary btn-sm" onClick={() => setPending(pending === 'close' ? null : 'close')}>Close</button>
          <button className="btn-secondary btn-sm" style={{ color: 'var(--red)' }} onClick={() => setPending(pending === 'revoke' ? null : 'revoke')}>Revoke</button>
        </div>
        {pending && (
          <div className="flex items-center gap-2">
            <input className="input input-sm flex-1" placeholder={pending === 'close' ? 'Closeout notes' : 'Reason'}
              value={reason} onChange={e => setReason(e.target.value)} />
            <button className="btn-cta btn-sm" disabled={busy || !reason.trim()}
              onClick={() => apply(
                pending === 'suspend' ? 'suspended' : pending === 'close' ? 'closed' : 'revoked',
                pending === 'suspend' ? 'suspended_reason' : pending === 'close' ? 'closeout_notes' : 'revoked_reason',
              )}>
              {busy && <Loader2 size={14} className="animate-spin" />} Confirm
            </button>
          </div>
        )}
      </div>
    );
  }

  return null; // closed / revoked — terminal, nothing to do
}

function RevokeInline({ reason, setReason, pending, setPending, busy, onApply }: {
  reason: string; setReason: (v: string) => void; pending: string | null; setPending: (v: 'revoke' | null) => void; busy: boolean; onApply: () => void;
}) {
  return (
    <>
      <button className="btn-secondary btn-sm" style={{ color: 'var(--red)' }} onClick={() => setPending(pending === 'revoke' ? null : 'revoke')}>Revoke</button>
      {pending === 'revoke' && (
        <div className="flex items-center gap-2">
          <input className="input input-sm" placeholder="Reason" value={reason} onChange={e => setReason(e.target.value)} />
          <button className="btn-cta btn-sm" disabled={busy || !reason.trim()} onClick={onApply}>Confirm</button>
        </div>
      )}
    </>
  );
}
