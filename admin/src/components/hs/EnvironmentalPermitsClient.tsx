'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Plus, FileCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/modules/Toast';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import {
  ENVIRONMENTAL_PERMIT_STATUSES, ENVIRONMENTAL_PERMIT_STATUS_LABELS, type EnvironmentalPermitStatus,
  PERMIT_CONDITION_STATUSES, PERMIT_CONDITION_STATUS_LABELS, type PermitConditionStatus,
} from '@/lib/hs/vocab';
import type { EnvironmentalPermit, PermitCondition } from '@/lib/hs/types';

interface Props {
  companyId: string;
  permits: EnvironmentalPermit[];
  conditions: PermitCondition[];
  loadError: string | null;
}

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// A permit's status is a lifecycle fact (active/expired/surrendered/
// revoked); a condition's status is deliberately never a compliance
// verdict — current/evidence_due/overdue/breach_recorded/review_required
// only. See CLAUDE.md's standing rule against certification language.
export default function EnvironmentalPermitsClient({ companyId, permits, conditions, loadError }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [condOpenFor, setCondOpenFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [permitType, setPermitType] = useState('');
  const [permitNumber, setPermitNumber] = useState('');
  const [issuingAuthority, setIssuingAuthority] = useState('');
  const [expiresOn, setExpiresOn] = useState('');

  const [condText, setCondText] = useState('');
  const [condDue, setCondDue] = useState('');

  async function submitPermit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('environmental_permits').insert({
      company_id: companyId, permit_type: permitType.trim(), permit_number: permitNumber.trim() || null,
      issuing_authority: issuingAuthority.trim() || null, expires_on: expiresOn || null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Permit added', 'success');
    setPermitType(''); setPermitNumber(''); setIssuingAuthority(''); setExpiresOn(''); setOpen(false);
    router.refresh();
  }

  async function updatePermitStatus(permit: EnvironmentalPermit, status: EnvironmentalPermitStatus) {
    const res = await createClient().from('environmental_permits').update({ status }, COUNT_EXACT).eq('id', permit.id);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Save failed', 'error'); return; }
    router.refresh();
  }

  async function submitCondition(permitId: string, e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('permit_conditions').insert({
      environmental_permit_id: permitId, condition_text: condText.trim(), next_review_due: condDue || null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Condition added', 'success');
    setCondText(''); setCondDue(''); setCondOpenFor(null);
    router.refresh();
  }

  async function updateConditionStatus(condition: PermitCondition, status: PermitConditionStatus) {
    const res = await createClient().from('permit_conditions').update({ status }, COUNT_EXACT).eq('id', condition.id);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Save failed', 'error'); return; }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>{loadError}</p>}
      <div className="flex justify-end">
        <button type="button" className="btn-cta btn-sm" onClick={() => setOpen(o => !o)}><Plus size={14} className="mr-1" /> Add permit</button>
      </div>
      {open && (
        <form onSubmit={submitPermit} className="card p-4 grid grid-cols-2 gap-3 items-end">
          <div><label className="label">Permit type</label><input className="input" required value={permitType} onChange={e => setPermitType(e.target.value)} placeholder="e.g. Discharge consent" /></div>
          <div><label className="label">Permit number</label><input className="input" value={permitNumber} onChange={e => setPermitNumber(e.target.value)} /></div>
          <div><label className="label">Issuing authority</label><input className="input" value={issuingAuthority} onChange={e => setIssuingAuthority(e.target.value)} /></div>
          <div><label className="label">Expires on</label><input type="date" className="input" value={expiresOn} onChange={e => setExpiresOn(e.target.value)} /></div>
          <button type="submit" className="btn-cta btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save permit'}</button>
        </form>
      )}
      {permits.length === 0 ? (
        <div className="card p-12"><div className="empty-state"><FileCheck size={28} style={{ color: 'var(--blue)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No environmental permits on file</p></div></div>
      ) : (
        <div className="space-y-3">
          {permits.map(p => {
            const isExpanded = expanded === p.id;
            const permitConditions = conditions.filter(c => c.environmental_permit_id === p.id);
            return (
              <div key={p.id} className="card p-0 overflow-hidden">
                <button type="button" className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setExpanded(isExpanded ? null : p.id)}>
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <div className="flex-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <strong>{p.permit_type}</strong>
                    {p.permit_number && <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{p.permit_number}</span>}
                    <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>Expires {fmt(p.expires_on)}</span>
                    <span className="ml-auto badge">{ENVIRONMENTAL_PERMIT_STATUS_LABELS[p.status]}</span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t p-4 space-y-3" style={{ borderColor: 'var(--line)' }}>
                    <div>
                      <label className="label">Status</label>
                      <select className="input" value={p.status} onChange={e => updatePermitStatus(p, e.target.value as EnvironmentalPermitStatus)}>
                        {ENVIRONMENTAL_PERMIT_STATUSES.map(s => <option key={s} value={s}>{ENVIRONMENTAL_PERMIT_STATUS_LABELS[s]}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm">Conditions</h4>
                      <button type="button" className="btn-secondary btn-sm" onClick={() => setCondOpenFor(condOpenFor === p.id ? null : p.id)}>
                        <Plus size={12} className="mr-1" /> Add condition
                      </button>
                    </div>
                    {condOpenFor === p.id && (
                      <form onSubmit={e => submitCondition(p.id, e)} className="grid grid-cols-2 gap-3 items-end">
                        <div className="col-span-2"><label className="label">Condition</label><textarea className="input" required rows={2} value={condText} onChange={e => setCondText(e.target.value)} /></div>
                        <div><label className="label">Next review due</label><input type="date" className="input" value={condDue} onChange={e => setCondDue(e.target.value)} /></div>
                        <button type="submit" className="btn-cta btn-sm" disabled={busy}>Save</button>
                      </form>
                    )}
                    {permitConditions.length === 0 ? (
                      <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No conditions recorded yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {permitConditions.map(c => (
                          <li key={c.id} className="rounded-md p-3 text-sm" style={{ background: 'var(--surface-soft)' }}>
                            <p>{c.condition_text}</p>
                            <div className="flex items-center gap-3 mt-2">
                              <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>Next review: {fmt(c.next_review_due)}</span>
                              <select className="input" style={{ width: 'auto' }} value={c.status} onChange={e => updateConditionStatus(c, e.target.value as PermitConditionStatus)}>
                                {PERMIT_CONDITION_STATUSES.map(s => <option key={s} value={s}>{PERMIT_CONDITION_STATUS_LABELS[s]}</option>)}
                              </select>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
