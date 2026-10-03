'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, ClipboardCheck, Loader2, Plus, UserPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { useToast } from '@/components/modules/Toast';
import {
  PERMIT_TYPES, PERMIT_TYPE_LABELS, PERMIT_STATUS_LABELS, type PermitType, type PermitStatus,
} from '@/lib/hs/vocab';
import type { Permit, PermitChecklistResponse, PermitPerson, PermitTemplate, PermitTemplateItem } from '@/lib/hs/types';

interface PickOption { id: string; name: string }
interface AuthOption { id: string; title: string }

interface Props {
  companyId: string;
  templates: PermitTemplate[];
  templateItems: PermitTemplateItem[];
  permits: Permit[];
  permitPeople: PermitPerson[];
  checklistResponses: PermitChecklistResponse[];
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
  companyId, templates, templateItems, permits, permitPeople, checklistResponses, sites, equipment, people, authorisationTypes, loadError,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [showTemplates, setShowTemplates] = useState(false);
  const [showNewPermit, setShowNewPermit] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const nameFor = (id: string | null) => (id ? people.find(p => p.id === id)?.name ?? 'Unknown' : '—');
  const siteFor = (id: string) => sites.find(s => s.id === id)?.name ?? 'Unknown site';
  const equipmentFor = (id: string | null) => (id ? equipment.find(e => e.id === id)?.name ?? null : null);
  const templateFor = (id: string) => templates.find(t => t.id === id) ?? null;
  const peopleFor = (permitId: string) => permitPeople.filter(pp => pp.permit_id === permitId);
  const itemsForTemplate = (templateId: string) => templateItems.filter(i => i.template_id === templateId);
  const responsesFor = (permitId: string) => checklistResponses.filter(r => r.permit_id === permitId);

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
        <TemplatesPanel companyId={companyId} templates={templates} templateItems={templateItems} authorisationTypes={authorisationTypes} />
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
                      {equipmentFor(p.asset_id) && <span className="badge">{equipmentFor(p.asset_id)}</span>}
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
                      {p.asset_id && equipmentFor(p.asset_id) && (
                        <Link href={`/health-safety/${companyId}/equipment#eq-${p.asset_id}`} style={{ color: 'var(--purple)' }}>
                          View {equipmentFor(p.asset_id)} on the Equipment tab
                        </Link>
                      )}
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

                    <ChecklistPanel
                      companyId={companyId} permit={p} items={itemsForTemplate(p.template_id)}
                      responses={responsesFor(p.id)} onDone={() => router.refresh()}
                    />

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

function TemplatesPanel({ companyId, templates, templateItems, authorisationTypes }: {
  companyId: string; templates: PermitTemplate[]; templateItems: PermitTemplateItem[]; authorisationTypes: AuthOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState<PermitType>('hot_work');
  const [authId, setAuthId] = useState('');
  const [hours, setHours] = useState('');
  const [busy, setBusy] = useState(false);
  const [itemsFor, setItemsFor] = useState<string | null>(null);

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
        <ul className="space-y-2">
          {templates.map(t => {
            const items = templateItems.filter(i => i.template_id === t.id);
            const open = itemsFor === t.id;
            return (
              <li key={t.id} className="rounded-lg p-2" style={{ background: 'var(--surface-soft)' }}>
                <button type="button" className="flex items-center gap-2 text-left" onClick={() => setItemsFor(open ? null : t.id)}>
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span className="badge" style={{ opacity: t.active ? 1 : 0.5 }}>
                    {t.name} · {PERMIT_TYPE_LABELS[t.permit_type]}{!t.active && ' (inactive)'}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{items.length} checklist item{items.length === 1 ? '' : 's'}</span>
                </button>
                {open && <TemplateItemsPanel templateId={t.id} items={items} />}
              </li>
            );
          })}
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

function TemplateItemsPanel({ templateId, items }: { templateId: string; items: PermitTemplateItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [guidance, setGuidance] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true);
    const { error } = await createClient().from('permit_template_items').insert({
      template_id: templateId, prompt: prompt.trim(), guidance: guidance.trim() || null, sort_order: items.length,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    setPrompt(''); setGuidance('');
    router.refresh();
  }

  return (
    <div className="mt-2 ml-6 space-y-2">
      {items.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>No checklist items yet — a permit from this template will have nothing to check off.</p>
      ) : (
        <ol className="space-y-1">
          {items.map((it, i) => (
            <li key={it.id} className="text-xs" style={{ color: 'var(--ink-soft)' }}>
              {i + 1}. {it.prompt}{it.guidance && <span style={{ color: 'var(--ink-faint)' }}> — {it.guidance}</span>}
            </li>
          ))}
        </ol>
      )}
      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <input className="input input-sm flex-1" placeholder="Checklist prompt" value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={500} style={{ minWidth: '14rem' }} />
        <input className="input input-sm" placeholder="Guidance (optional)" value={guidance} onChange={e => setGuidance(e.target.value)} maxLength={1000} style={{ minWidth: '12rem' }} />
        <button className="btn-secondary btn-sm" disabled={busy || !prompt.trim()}>{busy && <Loader2 size={13} className="animate-spin" />} Add item</button>
      </form>
    </div>
  );
}

// Permit checklist response UI (152's own `permit_checklist_responses`
// table, deliberately left unbuilt at ship time — "Phase 4 Group 13's
// own scope note"). Whoever is on site works through the permit's
// template checklist, marking each item confirmed or not applicable
// with an optional comment. Responses are insert-only (never edited),
// the register's own "a correction is a new row" discipline — there is
// no delete/edit control here on purpose.
function ChecklistPanel({ companyId, permit, items, responses, onDone }: {
  companyId: string; permit: Permit; items: PermitTemplateItem[]; responses: PermitChecklistResponse[]; onDone: () => void;
}) {
  const { toast } = useToast();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  if (items.length === 0) return null;

  const respondedFor = (itemId: string) => responses.find(r => r.template_item_id === itemId) ?? null;

  async function respond(item: PermitTemplateItem, rating: 'confirmed' | 'not_applicable') {
    setBusy(item.id);
    const { error } = await createClient().from('permit_checklist_responses').insert({
      permit_id: permit.id, company_id: companyId, template_item_id: item.id,
      prompt: item.prompt, rating, comment: (comments[item.id] ?? '').trim() || null, sort_order: item.sort_order,
    });
    setBusy(null);
    if (error) { toast(error.message, 'error'); return; }
    onDone();
  }

  return (
    <div>
      <h3 className="label">Checklist</h3>
      <ul className="space-y-2">
        {items.map(item => {
          const done = respondedFor(item.id);
          return (
            <li key={item.id} className="text-sm rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
              <div style={{ color: 'var(--ink)' }}>{item.prompt}</div>
              {item.guidance && <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{item.guidance}</p>}
              {done ? (
                <p className="text-xs mt-1" style={{ color: done.rating === 'confirmed' ? 'var(--teal)' : 'var(--ink-faint)' }}>
                  {done.rating === 'confirmed' ? 'Confirmed' : 'Not applicable'}{done.comment && ` — ${done.comment}`}
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input className="input input-sm flex-1" placeholder="Comment (optional)" style={{ minWidth: '10rem' }}
                    value={comments[item.id] ?? ''} onChange={e => setComments(c => ({ ...c, [item.id]: e.target.value }))} />
                  <button className="btn-secondary btn-sm" disabled={busy === item.id} onClick={() => respond(item, 'confirmed')}>
                    {busy === item.id && <Loader2 size={13} className="animate-spin" />} Confirm
                  </button>
                  <button className="btn-ghost btn-sm" disabled={busy === item.id} onClick={() => respond(item, 'not_applicable')}>N/A</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
