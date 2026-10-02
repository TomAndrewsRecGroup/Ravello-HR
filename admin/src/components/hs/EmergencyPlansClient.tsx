'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Plus, Siren } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { useToast } from '@/components/modules/Toast';
import {
  EMERGENCY_PLAN_TYPES, EMERGENCY_PLAN_TYPE_LABELS, EMERGENCY_DRILL_OUTCOMES, EMERGENCY_DRILL_OUTCOME_LABELS,
  type EmergencyPlanType, type EmergencyDrillOutcome,
} from '@/lib/hs/vocab';
import type { EmergencyDrill, EmergencyPlan, EmergencyPlanEquipment, EmergencyPlanRole } from '@/lib/hs/types';
import type { PlanReadiness } from '@/lib/emergencyReadiness/compute';

interface PickOption { id: string; name: string }
interface AuthOption { id: string; title: string }

interface Props {
  companyId: string;
  plans: EmergencyPlan[];
  roles: EmergencyPlanRole[];
  planEquipment: EmergencyPlanEquipment[];
  drills: EmergencyDrill[];
  sites: PickOption[];
  equipment: PickOption[];
  people: PickOption[];
  authorisationTypes: AuthOption[];
  loadError: string | null;
  /** Emergency Readiness live-check (go-live gap list, item 3) — one
   *  entry per ACTIVE plan, computed server-side from today's live
   *  person_authorisations/hs_equipment state. Empty/missing for a
   *  superseded plan, which this page already excludes by default. */
  readiness: PlanReadiness[];
}

const READINESS_COLOUR: Record<PlanReadiness['band'], string> = { ready: 'var(--teal)', attention: 'var(--gold)', critical: 'var(--red)' };
const READINESS_LABEL: Record<PlanReadiness['band'], string> = { ready: 'Ready', attention: 'Needs attention', critical: 'Critical gap' };

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

const DRILL_COLOUR: Record<EmergencyDrillOutcome, string> = {
  successful: 'var(--teal)', issues_found: 'var(--gold)', failed: 'var(--red)',
};

export default function EmergencyPlansClient({
  companyId, plans, roles, planEquipment, drills, sites, equipment, people, authorisationTypes, loadError, readiness,
}: Props) {
  const readinessFor = (id: string) => readiness.find(r => r.planId === id) ?? null;
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const visible = plans.filter(p => showSuperseded || p.status === 'active');
  const siteFor = (id: string | null) => (id ? sites.find(s => s.id === id)?.name ?? 'Unknown site' : 'All sites');
  const rolesFor = (id: string) => roles.filter(r => r.plan_id === id);
  const equipFor = (id: string) => planEquipment.filter(e => e.plan_id === id);
  const drillsFor = (id: string) => drills.filter(d => d.plan_id === id);
  const authTitle = (id: string) => authorisationTypes.find(a => a.id === id)?.title ?? 'Unknown';
  const assetName = (id: string) => equipment.find(a => a.id === id)?.name ?? 'Unknown asset';
  const personName = (id: string | null) => (id ? people.find(p => p.id === id)?.name ?? 'Unknown' : '—');

  async function newVersion(plan: EmergencyPlan) {
    const supabase = createClient();
    const { data, error: insertError } = await supabase.from('emergency_plans').insert({
      company_id: companyId, site_id: plan.site_id, plan_type: plan.plan_type,
      title: plan.title, description: plan.description, version: plan.version + 1, supersedes_id: plan.id,
    }).select('id').single();
    if (insertError || !data) { toast(insertError?.message ?? 'Could not create a new version.', 'error'); return; }
    const res = await supabase.from('emergency_plans').update({ status: 'superseded' }, COUNT_EXACT).eq('id', plan.id);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'New version created, but the old one could not be marked superseded.', 'error'); }
    else toast('New version created', 'success');
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load emergency plans: {loadError}</p>}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink-faint)' }}>
          <input type="checkbox" checked={showSuperseded} onChange={e => setShowSuperseded(e.target.checked)} /> Show superseded
        </label>
        <button className="btn-cta btn-sm ml-auto" onClick={() => setOpen(o => !o)}><Plus size={14} /> New plan</button>
      </div>

      {open && (
        <NewPlanForm companyId={companyId} sites={sites} onDone={() => { setOpen(false); router.refresh(); }} />
      )}

      {visible.length === 0 ? (
        <div className="card empty-state p-10">
          <Siren size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No emergency plans recorded.</p>
        </div>
      ) : (
        <ul className="card divide-y" style={{ borderColor: 'var(--line)' }}>
          {visible.map(plan => {
            const isOpen = expanded === plan.id;
            const overdue = plan.status === 'active' && plan.review_due_at && plan.review_due_at < today();
            const r = readinessFor(plan.id);
            return (
              <li key={plan.id}>
                <button className="w-full flex items-center gap-3 p-4 text-left" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : plan.id)}>
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <strong style={{ color: 'var(--ink)' }}>{plan.title}</strong>
                      <span className="badge">{EMERGENCY_PLAN_TYPE_LABELS[plan.plan_type]}</span>
                      <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>v{plan.version}</span>
                      {plan.status === 'superseded' && <span className="badge" style={{ opacity: 0.6 }}>Superseded</span>}
                      {r && <span className="badge" style={{ background: READINESS_COLOUR[r.band], color: 'white' }}>{READINESS_LABEL[r.band]}</span>}
                    </span>
                    <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>{siteFor(plan.site_id)}</span>
                  </span>
                  {plan.review_due_at && (
                    <span className="text-right text-sm whitespace-nowrap" style={{ color: overdue ? 'var(--red)' : 'var(--ink-faint)' }}>
                      {overdue && <AlertTriangle size={12} className="inline mr-1" />}
                      review {fmt(plan.review_due_at)}
                    </span>
                  )}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pl-11 space-y-4">
                    {plan.description && <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{plan.description}</p>}
                    {plan.status === 'active' && (
                      <button className="btn-secondary btn-sm" onClick={() => newVersion(plan)}>New version</button>
                    )}

                    {r && (
                      <div className="rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
                        <h3 className="label flex items-center gap-2">
                          <span className="badge" style={{ background: READINESS_COLOUR[r.band], color: 'white' }}>{READINESS_LABEL[r.band]}</span>
                          Live readiness, right now
                        </h3>
                        <ul className="text-sm space-y-0.5 mt-1">
                          {r.reasons.map((reason, i) => <li key={i} style={{ color: 'var(--ink-soft)' }}>{reason}</li>)}
                        </ul>
                      </div>
                    )}

                    <div>
                      <h3 className="label">Required roles on site</h3>
                      {rolesFor(plan.id).length === 0 ? (
                        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>None recorded.</p>
                      ) : (
                        <ul className="flex flex-wrap gap-2">
                          {rolesFor(plan.id).map(role => {
                            const cov = r?.roles.find(x => x.authorisationTypeId === role.authorisation_type_id);
                            return (
                              <li key={role.id} className="badge" style={cov && !cov.met ? { color: 'var(--red)' } : undefined}>
                                {authTitle(role.authorisation_type_id)} &times; {role.min_count}
                                {cov && ` (${cov.holding} currently held)`}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {plan.status === 'active' && (
                        <AddRoleForm planId={plan.id} authorisationTypes={authorisationTypes} onDone={() => router.refresh()} />
                      )}
                    </div>

                    <div>
                      <h3 className="label">Linked equipment</h3>
                      {equipFor(plan.id).length === 0 ? (
                        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>None recorded.</p>
                      ) : (
                        <ul className="flex flex-wrap gap-2">
                          {equipFor(plan.id).map(e => <li key={e.id} className="badge">{assetName(e.asset_id)}</li>)}
                        </ul>
                      )}
                      {plan.status === 'active' && (
                        <AddEquipmentForm planId={plan.id} equipment={equipment} onDone={() => router.refresh()} />
                      )}
                    </div>

                    <div>
                      <h3 className="label">Drill history</h3>
                      {drillsFor(plan.id).length === 0 ? (
                        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No drills recorded yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {drillsFor(plan.id).map(d => (
                            <li key={d.id} className="text-sm rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
                              <div className="flex flex-wrap gap-x-3">
                                <strong style={{ color: 'var(--ink)' }}>{fmt(d.drill_date)}</strong>
                                <span style={{ color: DRILL_COLOUR[d.outcome] }}>{EMERGENCY_DRILL_OUTCOME_LABELS[d.outcome]}</span>
                                {d.conducted_by && <span style={{ color: 'var(--ink-faint)' }}>by {personName(d.conducted_by)}</span>}
                                {d.evacuation_time_seconds != null && <span style={{ color: 'var(--ink-faint)' }}>{d.evacuation_time_seconds}s to evacuate</span>}
                              </div>
                              {d.findings && <p className="mt-1 whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{d.findings}</p>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {plan.status === 'active' && (
                        <RecordDrillForm companyId={companyId} planId={plan.id} siteId={plan.site_id} people={people} onDone={() => router.refresh()} />
                      )}
                    </div>
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

function NewPlanForm({ companyId, sites, onDone }: { companyId: string; sites: PickOption[]; onDone: () => void }) {
  const { toast } = useToast();
  const [siteId, setSiteId] = useState('');
  const [type, setType] = useState<EmergencyPlanType>('fire');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reviewDue, setReviewDue] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('emergency_plans').insert({
      company_id: companyId, site_id: siteId || null, plan_type: type,
      title: title.trim(), description: description.trim() || null, review_due_at: reviewDue || null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Emergency plan created', 'success');
    onDone();
  }

  return (
    <form onSubmit={submit} className="card p-4 grid gap-3 md:grid-cols-2">
      <label className="block md:col-span-2">
        <span className="label">Title</span>
        <input className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required placeholder="Site fire evacuation plan" />
      </label>
      <label className="block">
        <span className="label">Type</span>
        <select className="input" value={type} onChange={e => setType(e.target.value as EmergencyPlanType)}>
          {EMERGENCY_PLAN_TYPES.map(t => <option key={t} value={t}>{EMERGENCY_PLAN_TYPE_LABELS[t]}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">Site (optional)</span>
        <select className="input" value={siteId} onChange={e => setSiteId(e.target.value)}>
          <option value="">All sites</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">Review due (optional)</span>
        <input className="input" type="date" value={reviewDue} onChange={e => setReviewDue(e.target.value)} />
      </label>
      <label className="block md:col-span-2">
        <span className="label">Description (optional)</span>
        <textarea className="input" rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={4000} />
      </label>
      <div className="md:col-span-2 flex justify-end">
        <button className="btn-cta" disabled={busy || !title.trim()}>{busy && <Loader2 size={15} className="animate-spin" />} Create</button>
      </div>
    </form>
  );
}

function AddRoleForm({ planId, authorisationTypes, onDone }: { planId: string; authorisationTypes: AuthOption[]; onDone: () => void }) {
  const { toast } = useToast();
  const [authId, setAuthId] = useState('');
  const [minCount, setMinCount] = useState('1');
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!authId) return;
    setBusy(true);
    const { error } = await createClient().from('emergency_plan_roles').insert({
      plan_id: planId, authorisation_type_id: authId, min_count: Number(minCount) || 1,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    setAuthId(''); setMinCount('1');
    onDone();
  }

  if (authorisationTypes.length === 0) return null;
  return (
    <form onSubmit={add} className="mt-2 flex items-center gap-2">
      <select className="input input-sm" value={authId} onChange={e => setAuthId(e.target.value)}>
        <option value="">Add a required role…</option>
        {authorisationTypes.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
      </select>
      <input className="input input-sm" type="number" min={1} value={minCount} onChange={e => setMinCount(e.target.value)} style={{ width: '5rem' }} />
      <button className="btn-secondary btn-sm" disabled={busy || !authId}>{busy && <Loader2 size={13} className="animate-spin" />} Add</button>
    </form>
  );
}

function AddEquipmentForm({ planId, equipment, onDone }: { planId: string; equipment: PickOption[]; onDone: () => void }) {
  const { toast } = useToast();
  const [assetId, setAssetId] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!assetId) return;
    setBusy(true);
    const { error } = await createClient().from('emergency_plan_equipment').insert({ plan_id: planId, asset_id: assetId });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    setAssetId('');
    onDone();
  }

  if (equipment.length === 0) return null;
  return (
    <form onSubmit={add} className="mt-2 flex items-center gap-2">
      <select className="input input-sm" value={assetId} onChange={e => setAssetId(e.target.value)}>
        <option value="">Link equipment…</option>
        {equipment.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <button className="btn-secondary btn-sm" disabled={busy || !assetId}>{busy && <Loader2 size={13} className="animate-spin" />} Add</button>
    </form>
  );
}

function RecordDrillForm({ companyId, planId, siteId, people, onDone }: {
  companyId: string; planId: string; siteId: string | null; people: PickOption[]; onDone: () => void;
}) {
  const { toast } = useToast();
  const [date, setDate] = useState(today());
  const [conductedBy, setConductedBy] = useState('');
  const [seconds, setSeconds] = useState('');
  const [outcome, setOutcome] = useState<EmergencyDrillOutcome>('successful');
  const [findings, setFindings] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('emergency_drills').insert({
      company_id: companyId, plan_id: planId, site_id: siteId,
      drill_date: date, conducted_by: conductedBy || null,
      evacuation_time_seconds: seconds ? Number(seconds) : null,
      outcome, findings: findings.trim() || null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Drill recorded', 'success');
    setSeconds(''); setFindings('');
    onDone();
  }

  return (
    <form onSubmit={submit} className="mt-2 rounded-lg p-3 space-y-2" style={{ border: '1px solid var(--line)' }}>
      <h4 className="label">Record a drill</h4>
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="block">
          <span className="label">Date</span>
          <input className="input" type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} required />
        </label>
        <label className="block">
          <span className="label">Conducted by (optional)</span>
          <select className="input" value={conductedBy} onChange={e => setConductedBy(e.target.value)}>
            <option value="">—</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Evacuation time (s, optional)</span>
          <input className="input" type="number" min={0} value={seconds} onChange={e => setSeconds(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Outcome</span>
          <select className="input" value={outcome} onChange={e => setOutcome(e.target.value as EmergencyDrillOutcome)}>
            {EMERGENCY_DRILL_OUTCOMES.map(o => <option key={o} value={o}>{EMERGENCY_DRILL_OUTCOME_LABELS[o]}</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">Findings (optional)</span>
        <textarea className="input" rows={2} value={findings} onChange={e => setFindings(e.target.value)} maxLength={4000} />
      </label>
      <button className="btn-cta btn-sm" disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />} Record drill</button>
    </form>
  );
}
