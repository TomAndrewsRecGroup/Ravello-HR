'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronDown, ChevronRight, HardHat, Loader2, Plus, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { useToast } from '@/components/modules/Toast';
import {
  CONTRACTOR_APPROVAL_STATUSES, CONTRACTOR_APPROVAL_STATUS_LABELS, CONTRACTOR_INSURANCE_TYPES,
  CONTRACTOR_INSURANCE_TYPE_LABELS, CONTRACTOR_RISK_RATINGS, CONTRACTOR_RISK_RATING_LABELS,
  type ContractorApprovalStatus, type ContractorInsuranceType, type ContractorRiskRating,
} from '@/lib/hs/vocab';
import type { Contractor, ContractorInsurance } from '@/lib/hs/types';

interface Props {
  companyId: string;
  contractors: Contractor[];
  insurances: ContractorInsurance[];
  loadError: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

function daysUntil(d: string): number {
  return Math.round((new Date(`${d}T00:00:00Z`).getTime() - new Date(`${today()}T00:00:00Z`).getTime()) / 86400000);
}

const STATUS_COLOUR: Record<ContractorApprovalStatus, string> = {
  pending: 'var(--ink-faint)', approved: 'var(--teal)', suspended: 'var(--gold)', rejected: 'var(--red)',
};

export default function ContractorsClient({ companyId, contractors, insurances, loadError }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('contractors').insert({
      company_id: companyId, name: name.trim(),
      registration_number: regNumber.trim() || null,
      contact_name: contactName.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Contractor added', 'success');
    setName(''); setRegNumber(''); setContactName(''); setContactEmail(''); setContactPhone(''); setOpen(false);
    router.refresh();
  }

  async function setStatus(c: Contractor, approval_status: ContractorApprovalStatus) {
    const res = await createClient().from('contractors').update({ approval_status }, COUNT_EXACT).eq('id', c.id);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Could not update the status.', 'error'); return; }
    router.refresh();
  }

  async function setRisk(c: Contractor, risk_rating: ContractorRiskRating | '') {
    const res = await createClient().from('contractors').update({ risk_rating: risk_rating || null }, COUNT_EXACT).eq('id', c.id);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Could not update the risk rating.', 'error'); return; }
    router.refresh();
  }

  const insurancesFor = (id: string) => insurances.filter(i => i.contractor_id === id);

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load contractors: {loadError}</p>}
      <div className="flex">
        <button className="btn-cta btn-sm ml-auto" onClick={() => setOpen(o => !o)}><Plus size={14} /> Add contractor</button>
      </div>

      {open && (
        <form onSubmit={submit} className="card p-4 grid gap-3 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="label">Company name</span>
            <input className="input" value={name} onChange={e => setName(e.target.value)} maxLength={200} required placeholder="Acme Scaffolding Ltd" />
          </label>
          <label className="block">
            <span className="label">Registration number (optional)</span>
            <input className="input" value={regNumber} onChange={e => setRegNumber(e.target.value)} maxLength={100} />
          </label>
          <label className="block">
            <span className="label">Contact name (optional)</span>
            <input className="input" value={contactName} onChange={e => setContactName(e.target.value)} maxLength={200} />
          </label>
          <label className="block">
            <span className="label">Contact email (optional)</span>
            <input className="input" type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} maxLength={320} />
          </label>
          <label className="block">
            <span className="label">Contact phone (optional)</span>
            <input className="input" value={contactPhone} onChange={e => setContactPhone(e.target.value)} maxLength={50} />
          </label>
          <div className="md:col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-cta" disabled={busy || !name.trim()}>{busy && <Loader2 size={15} className="animate-spin" />} Add</button>
          </div>
        </form>
      )}

      {contractors.length === 0 ? (
        <div className="card empty-state p-10">
          <HardHat size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No contractors recorded.</p>
        </div>
      ) : (
        <ul className="card divide-y" style={{ borderColor: 'var(--line)' }}>
          {contractors.map(c => {
            const isOpen = expanded === c.id;
            const ins = insurancesFor(c.id);
            return (
              <li key={c.id}>
                <button className="w-full flex items-center gap-3 p-4 text-left" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : c.id)}>
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate" style={{ color: 'var(--ink)' }}>{c.name}</span>
                    <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>
                      {c.contact_name ?? 'No contact on file'}{c.registration_number && ` · ${c.registration_number}`}
                    </span>
                  </span>
                  <span className="text-right text-sm whitespace-nowrap">
                    <span className="block font-medium" style={{ color: STATUS_COLOUR[c.approval_status] }}>
                      {CONTRACTOR_APPROVAL_STATUS_LABELS[c.approval_status]}
                    </span>
                    {c.risk_rating && <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>{CONTRACTOR_RISK_RATING_LABELS[c.risk_rating]} risk</span>}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pl-11 space-y-4">
                    <div className="flex flex-wrap gap-3">
                      <label className="flex items-center gap-1.5 text-xs">
                        <span style={{ color: 'var(--ink-faint)' }}>Approval status</span>
                        <select className="input input-sm" value={c.approval_status} onChange={e => setStatus(c, e.target.value as ContractorApprovalStatus)}>
                          {CONTRACTOR_APPROVAL_STATUSES.map(s => <option key={s} value={s}>{CONTRACTOR_APPROVAL_STATUS_LABELS[s]}</option>)}
                        </select>
                      </label>
                      <label className="flex items-center gap-1.5 text-xs">
                        <span style={{ color: 'var(--ink-faint)' }}>Risk rating</span>
                        <select className="input input-sm" value={c.risk_rating ?? ''} onChange={e => setRisk(c, e.target.value as ContractorRiskRating | '')}>
                          <option value="">—</option>
                          {CONTRACTOR_RISK_RATINGS.map(r => <option key={r} value={r}>{CONTRACTOR_RISK_RATING_LABELS[r]}</option>)}
                        </select>
                      </label>
                    </div>

                    <InsuranceForm companyId={companyId} contractorId={c.id} existing={ins} />

                    <div>
                      <h3 className="label">Insurance on file</h3>
                      {ins.length === 0 ? (
                        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>Nothing recorded yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {ins.map(i => {
                            const d = daysUntil(i.expires_on);
                            const colour = d < 0 ? 'var(--red)' : d <= 30 ? 'var(--gold)' : 'var(--teal)';
                            return (
                              <li key={i.id} className="text-sm rounded-lg p-3 flex items-center gap-3" style={{ background: 'var(--surface-soft)' }}>
                                <ShieldCheck size={14} style={{ color: colour }} />
                                <span style={{ color: 'var(--ink)' }}>{CONTRACTOR_INSURANCE_TYPE_LABELS[i.insurance_type]}</span>
                                {i.provider && <span style={{ color: 'var(--ink-faint)' }}>{i.provider}</span>}
                                <span className="ml-auto flex items-center gap-1" style={{ color: colour }}>
                                  {d < 0 && <AlertTriangle size={12} />} expires {fmt(i.expires_on)}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
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

function InsuranceForm({ companyId, contractorId, existing }: { companyId: string; contractorId: string; existing: ContractorInsurance[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [type, setType] = useState<ContractorInsuranceType>('employers_liability');
  const [provider, setProvider] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!expiresOn) return;
    setBusy(true);
    // company_id is overwritten by the database from the contractor row
    // itself (contractor_insurances_fill); sent only because it's NOT NULL.
    const { error } = await createClient().from('contractor_insurances').upsert({
      contractor_id: contractorId, company_id: companyId, insurance_type: type,
      provider: provider.trim() || null, expires_on: expiresOn,
    }, { onConflict: 'contractor_id,insurance_type' });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Insurance recorded', 'success');
    setProvider(''); setExpiresOn('');
    router.refresh();
  }

  const has = new Set(existing.map(i => i.insurance_type));

  return (
    <form onSubmit={submit} className="rounded-lg p-3 space-y-3" style={{ border: '1px solid var(--line)' }}>
      <h3 className="label">Record or renew insurance</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Type</span>
          <select className="input" value={type} onChange={e => setType(e.target.value as ContractorInsuranceType)}>
            {CONTRACTOR_INSURANCE_TYPES.map(t => (
              <option key={t} value={t}>{CONTRACTOR_INSURANCE_TYPE_LABELS[t]}{has.has(t) ? ' (renew)' : ''}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Provider (optional)</span>
          <input className="input" value={provider} onChange={e => setProvider(e.target.value)} maxLength={200} />
        </label>
        <label className="block">
          <span className="label">Expires on</span>
          <input className="input" type="date" value={expiresOn} onChange={e => setExpiresOn(e.target.value)} required />
        </label>
      </div>
      <button className="btn-cta btn-sm" disabled={busy || !expiresOn}>{busy && <Loader2 size={14} className="animate-spin" />} Save</button>
    </form>
  );
}
