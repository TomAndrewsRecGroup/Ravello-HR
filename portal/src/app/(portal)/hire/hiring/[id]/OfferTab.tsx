'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidatePortalPath } from '@/app/actions';
import { Loader2, Plus, X, CheckCircle2, Clock, AlertTriangle, FileText } from 'lucide-react';

interface Offer {
  id: string;
  candidate_id: string;
  status: string;
  base_salary: number | null;
  bonus: string | null;
  benefits: string | null;
  start_date: string | null;
  notice_period: string | null;
  contract_type: string | null;
  working_model: string | null;
  location: string | null;
  sent_at: string | null;
  verbal_accepted_at: string | null;
  written_accepted_at: string | null;
  declined_at: string | null;
  deadline: string | null;
  notes: string | null;
  created_at: string;
  candidates?: { full_name: string };
}

interface Props {
  requisitionId: string;
  companyId: string;
  candidates: { id: string; full_name: string; client_status: string }[];
  initialOffers: Offer[];
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  draft:            { label: 'Draft',            bg: 'rgba(148,163,184,0.12)', color: 'var(--slate)' },
  sent:             { label: 'Sent',             bg: 'rgba(59,111,255,0.12)',  color: 'var(--blue)' },
  verbal_accepted:  { label: 'Verbal Accepted',  bg: 'rgba(245,158,11,0.12)', color: '#92400E' },
  written_accepted: { label: 'Written Accepted', bg: 'rgba(22,163,74,0.12)',  color: 'var(--emerald)' },
  declined:         { label: 'Declined',         bg: 'rgba(220,38,38,0.10)',  color: 'var(--rose)' },
  withdrawn:        { label: 'Withdrawn',        bg: 'rgba(220,38,38,0.10)',  color: 'var(--rose)' },
  lapsed:           { label: 'Lapsed',           bg: 'rgba(148,163,184,0.12)', color: 'var(--slate)' },
};

const OFFER_STATUSES = ['draft', 'sent', 'verbal_accepted', 'written_accepted', 'declined', 'withdrawn', 'lapsed'];
const CONTRACT_TYPES = ['permanent', 'fixed_term', 'contract', 'interim'];
const WORKING_MODELS = ['office', 'hybrid', 'remote'];

function fmtSalary(pence: number | null): string {
  if (!pence) return '—';
  return `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 0 })}`;
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function OfferCard({ offer, onStatusChange }: { offer: Offer; onStatusChange: (id: string, status: string) => void }) {
  const cfg = STATUS_CONFIG[offer.status] ?? STATUS_CONFIG.draft;
  const [updating, setUpdating] = useState(false);
  const supabase = createClient();

  async function updateStatus(newStatus: string) {
    setUpdating(true);
    const now = new Date().toISOString();
    const extra: Record<string, string> = {};
    if (newStatus === 'sent')             extra.sent_at = now;
    if (newStatus === 'verbal_accepted')  extra.verbal_accepted_at = now;
    if (newStatus === 'written_accepted') extra.written_accepted_at = now;
    if (newStatus === 'declined')         extra.declined_at = now;
    const { error } = await supabase.from('offers').update({ status: newStatus, ...extra }).eq('id', offer.id);
    if (!error) {
      onStatusChange(offer.id, newStatus);
      revalidatePortalPath('/hiring');
    }
    setUpdating(false);
  }

  return (
    <div className="card p-5" style={{ borderLeft: `3px solid ${cfg.color}` }}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
            {offer.candidates?.full_name ?? 'Candidate'}
          </p>
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full mt-1"
            style={{ background: cfg.bg, color: cfg.color }}
          >
            {cfg.label}
          </span>
        </div>
        <div className="text-right">
          {offer.base_salary && (
            <p className="font-bold text-lg" style={{ color: 'var(--ink)' }}>{fmtSalary(offer.base_salary)}</p>
          )}
          {offer.deadline && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
              Deadline: {fmtDate(offer.deadline)}
            </p>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        {([
          ['Contract', offer.contract_type?.replace(/_/g, ' ')],
          ['Working Model', offer.working_model],
          ['Location', offer.location],
          ['Start Date', fmtDate(offer.start_date)],
          ['Notice Period', offer.notice_period],
          ['Bonus', offer.bonus],
        ] as [string, string | null | undefined][]).filter(([, v]) => v && v !== '—').map(([label, val]) => (
          <div key={label}>
            <dt className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>{label}</dt>
            <dd className="text-sm mt-0.5" style={{ color: 'var(--ink-soft)' }}>{val}</dd>
          </div>
        ))}
      </dl>

      {offer.benefits && (
        <div className="mb-4 p-3 rounded-[8px]" style={{ background: 'var(--surface-alt)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--ink-faint)' }}>Benefits</p>
          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{offer.benefits}</p>
        </div>
      )}

      {offer.notes && (
        <p className="text-xs mb-4 italic" style={{ color: 'var(--ink-faint)' }}>{offer.notes}</p>
      )}

      <div className="flex flex-wrap gap-3 mb-4 text-xs" style={{ color: 'var(--ink-faint)' }}>
        {offer.sent_at && <span>Sent: {fmtDate(offer.sent_at)}</span>}
        {offer.verbal_accepted_at && <span>Verbal: {fmtDate(offer.verbal_accepted_at)}</span>}
        {offer.written_accepted_at && <span>Written: {fmtDate(offer.written_accepted_at)}</span>}
        {offer.declined_at && <span>Declined: {fmtDate(offer.declined_at)}</span>}
      </div>

      {!['written_accepted', 'declined', 'withdrawn'].includes(offer.status) && (
        <div className="flex items-center gap-2">
          <select
            className="input text-xs py-1.5 flex-1"
            defaultValue={offer.status}
            onChange={e => updateStatus(e.target.value)}
            disabled={updating}
          >
            {OFFER_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>
            ))}
          </select>
          {updating && <Loader2 size={13} className="animate-spin flex-shrink-0" style={{ color: 'var(--purple)' }} />}
        </div>
      )}
    </div>
  );
}

export default function OfferTab({ requisitionId, companyId, candidates, initialOffers }: Props) {
  const supabase = createClient();
  const [offers, setOffers] = useState<Offer[]>(initialOffers);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    candidate_id: '',
    base_salary: '',
    bonus: '',
    benefits: '',
    start_date: '',
    notice_period: '',
    contract_type: 'permanent',
    working_model: 'hybrid',
    location: '',
    deadline: '',
    notes: '',
    status: 'draft',
  });

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function saveOffer() {
    if (!form.candidate_id) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('offers')
      .insert({
        requisition_id: requisitionId,
        company_id:     companyId,
        candidate_id:   form.candidate_id,
        base_salary:    form.base_salary ? Math.round(parseFloat(form.base_salary) * 100) : null,
        bonus:          form.bonus || null,
        benefits:       form.benefits || null,
        start_date:     form.start_date || null,
        notice_period:  form.notice_period || null,
        contract_type:  form.contract_type || null,
        working_model:  form.working_model || null,
        location:       form.location || null,
        deadline:       form.deadline || null,
        notes:          form.notes || null,
        status:         form.status,
      })
      .select('*, candidates(full_name)')
      .single();

    if (!error && data) {
      setOffers(prev => [data as Offer, ...prev]);
      setShowForm(false);
      setForm({ candidate_id: '', base_salary: '', bonus: '', benefits: '', start_date: '', notice_period: '', contract_type: 'permanent', working_model: 'hybrid', location: '', deadline: '', notes: '', status: 'draft' });
      revalidatePortalPath('/hiring');
    }
    setSaving(false);
  }

  function handleStatusChange(id: string, status: string) {
    setOffers(prev => prev.map(o => o.id === id ? { ...o, status } : o));
  }

  const approvedCandidates = candidates.filter(c => ['approved', 'pending'].includes(c.client_status));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
            Offers ({offers.length})
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
            Track offer terms and acceptance status
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="btn-cta btn-sm flex items-center gap-1.5"
        >
          <Plus size={13} /> Create Offer
        </button>
      </div>

      {showForm && (
        <div className="card p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>New Offer</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Candidate *</label>
              <select className="input" value={form.candidate_id} onChange={e => set('candidate_id', e.target.value)}>
                <option value="">Select candidate…</option>
                {approvedCandidates.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Base Salary (£/year)</label>
              <input type="number" className="input" placeholder="e.g. 55000" value={form.base_salary} onChange={e => set('base_salary', e.target.value)} />
            </div>
            <div>
              <label className="label">Bonus</label>
              <input className="input" placeholder="e.g. 10% discretionary" value={form.bonus} onChange={e => set('bonus', e.target.value)} />
            </div>
            <div>
              <label className="label">Contract Type</label>
              <select className="input" value={form.contract_type} onChange={e => set('contract_type', e.target.value)}>
                {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Working Model</label>
              <select className="input" value={form.working_model} onChange={e => set('working_model', e.target.value)}>
                {WORKING_MODELS.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Location</label>
              <input className="input" placeholder="e.g. London" value={form.location} onChange={e => set('location', e.target.value)} />
            </div>
            <div>
              <label className="label">Notice Period</label>
              <input className="input" placeholder="e.g. 1 month" value={form.notice_period} onChange={e => set('notice_period', e.target.value)} />
            </div>
            <div>
              <label className="label">Start Date</label>
              <input type="date" className="input" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Offer Deadline</label>
              <input type="date" className="input" value={form.deadline} onChange={e => set('deadline', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Benefits Summary</label>
              <textarea className="input h-16 resize-none" placeholder="Pension, healthcare, 25 days holiday…" value={form.benefits} onChange={e => set('benefits', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <textarea className="input h-16 resize-none" placeholder="Internal notes…" value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
            <div>
              <label className="label">Initial Status</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                {OFFER_STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveOffer}
              disabled={saving || !form.candidate_id}
              className="btn-cta btn-sm flex items-center gap-1.5"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : null}
              Save Offer
            </button>
            <button onClick={() => setShowForm(false)} className="btn-ghost btn-sm flex items-center gap-1">
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      )}

      {offers.length === 0 && !showForm ? (
        <div className="card p-10">
          <div className="empty-state py-4">
            <FileText size={24} />
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>No offers yet</p>
            <p className="text-xs max-w-[280px]" style={{ color: 'var(--ink-faint)' }}>
              Create an offer once a candidate has been approved and you&apos;re ready to move forward.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {offers.map(o => (
            <OfferCard key={o.id} offer={o} onStatusChange={handleStatusChange} />
          ))}
        </div>
      )}
    </div>
  );
}
