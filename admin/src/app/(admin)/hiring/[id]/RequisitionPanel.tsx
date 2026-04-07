'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';
import { Loader2, CheckCircle2, AlertCircle, XCircle, AlertTriangle, HelpCircle,
         MapPin, PoundSterling, Layers, Monitor, Clock, Plus, FileText } from 'lucide-react';

/* ── Friction display helpers ─────────────────────────────── */

type FrictionLevel = 'Low' | 'Medium' | 'High' | 'Critical' | 'Unknown';

const LEVEL_CONFIG: Record<FrictionLevel, { bg: string; border: string; text: string; badge: string; badgeText: string; icon: React.ElementType }> = {
  Low:      { bg: 'rgba(22,163,74,0.06)',   border: 'rgba(22,163,74,0.2)',   text: '#166534', badge: '#16A34A', badgeText: '#fff', icon: CheckCircle2 },
  Medium:   { bg: 'rgba(217,119,6,0.06)',   border: 'rgba(217,119,6,0.2)',   text: '#92400E', badge: '#D97706', badgeText: '#fff', icon: AlertCircle },
  High:     { bg: 'rgba(220,38,38,0.06)',   border: 'rgba(220,38,38,0.2)',   text: '#991B1B', badge: '#DC2626', badgeText: '#fff', icon: XCircle },
  Critical: { bg: 'rgba(127,29,29,0.08)',   border: 'rgba(127,29,29,0.25)',  text: '#7F1D1D', badge: '#7F1D1D', badgeText: '#fff', icon: AlertTriangle },
  Unknown:  { bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.2)', text: '#64748B', badge: '#94A3B8', badgeText: '#fff', icon: HelpCircle },
};

const DIM_ICONS: Record<string, React.ElementType> = {
  friction_score: MapPin, clarity_score: FileText, overload_score: Layers,
  location: MapPin, salary: PoundSterling, skills: Layers, working_model: Monitor, process: Clock,
};
const DIM_LABELS: Record<string, string> = {
  friction_score: 'Market Friction', clarity_score: 'JD Clarity', overload_score: 'Requirement Overload',
  location: 'Location', salary: 'Salary', skills: 'Skills', working_model: 'Working Model', process: 'Process',
};

function FrictionCard({ frictionScore }: { frictionScore: any }) {
  const level = (frictionScore?.overall_level ?? 'Unknown') as FrictionLevel;
  const cfg   = LEVEL_CONFIG[level];
  const Icon  = cfg.icon;

  // Support both IvyLens format (flat scores) and legacy format (dimensions object)
  const dims: [string, { score: number; label: FrictionLevel }][] = [];
  if (frictionScore?.dimensions && Object.keys(frictionScore.dimensions).length > 0) {
    // Legacy 5-dimension format
    Object.entries(frictionScore.dimensions).forEach(([k, v]: [string, any]) => {
      dims.push([k, { score: v.score, label: v.label }]);
    });
  } else if (frictionScore?.friction_score != null) {
    // IvyLens 3-dimension format
    dims.push(['friction_score', { score: frictionScore.friction_score, label: levelFromScore(frictionScore.friction_score) }]);
    dims.push(['clarity_score',  { score: frictionScore.clarity_score ?? 0, label: levelFromScore(frictionScore.clarity_score ?? 0) }]);
    dims.push(['overload_score', { score: frictionScore.overload_score ?? 0, label: levelFromScore(frictionScore.overload_score ?? 0) }]);
  }

  function levelFromScore(s: number): FrictionLevel {
    if (s < 35) return 'Low';
    if (s < 65) return 'Medium';
    if (s < 85) return 'High';
    return 'Critical';
  }

  return (
    <div className="card p-5" style={{ background: cfg.bg, borderColor: cfg.border }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--ink-faint)' }}>Friction Lens</p>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold" style={{ background: cfg.badge, color: cfg.badgeText }}>
            <Icon size={13} />
            {level} Friction
          </span>
        </div>
        <div className="text-right">
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Score</p>
          <p className="text-lg font-bold" style={{ color: 'var(--ink)' }}>{frictionScore?.overall_score ?? '—'}/100</p>
          {frictionScore?.time_to_fill_estimate && (
            <>
              <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>Est. time to fill</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{frictionScore.time_to_fill_estimate}</p>
            </>
          )}
        </div>
      </div>

      {dims.length > 0 && (
        <div className="space-y-3">
          {dims.map(([key, dim]) => {
            const DimIcon = DIM_ICONS[key] ?? MapPin;
            const dc = LEVEL_CONFIG[dim.label] ?? LEVEL_CONFIG.Unknown;
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <DimIcon size={11} style={{ color: 'var(--ink-faint)' }} />
                    <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{DIM_LABELS[key] ?? key}</span>
                  </div>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: dc.badge, color: dc.badgeText }}>
                    {dim.score}/100
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
                  <div className="h-full rounded-full" style={{ width: `${dim.score}%`, background: dc.badge }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {frictionScore?.recommendations?.length > 0 && (
        <div className="mt-4 rounded-[10px] p-3" style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(0,0,0,0.06)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-faint)' }}>Recommendations</p>
          <ul className="space-y-1.5">
            {frictionScore.recommendations.map((r: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                <span className="w-1 h-1 rounded-full flex-shrink-0 mt-1.5" style={{ background: cfg.badge }} />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Admin Offer Panel ────────────────────────────────────── */

const OFFER_STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  draft:            { label: 'Draft',            bg: 'rgba(148,163,184,0.12)', color: '#475569' },
  sent:             { label: 'Sent',             bg: 'rgba(59,111,255,0.12)',  color: '#1848CC' },
  verbal_accepted:  { label: 'Verbal Accepted',  bg: 'rgba(245,158,11,0.12)', color: '#92400E' },
  written_accepted: { label: 'Written Accepted', bg: 'rgba(22,163,74,0.12)',  color: '#166534' },
  declined:         { label: 'Declined',         bg: 'rgba(220,38,38,0.10)',  color: '#991B1B' },
  withdrawn:        { label: 'Withdrawn',        bg: 'rgba(220,38,38,0.10)',  color: '#991B1B' },
  lapsed:           { label: 'Lapsed',           bg: 'rgba(148,163,184,0.12)', color: '#475569' },
};
const OFFER_STATUSES = Object.keys(OFFER_STATUS_CONFIG);
const CONTRACT_TYPES = ['permanent', 'fixed_term', 'contract', 'interim'];
const WORKING_MODELS = ['office', 'hybrid', 'remote'];

function fmtSalary(pence: number | null): string {
  if (!pence) return '—';
  return `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 0 })}`;
}

function AdminOfferPanel({ requisitionId, companyId }: { requisitionId: string; companyId: string }) {
  const supabase = createClient();
  const [offers, setOffers] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    candidate_id: '', base_salary: '', bonus: '', benefits: '',
    start_date: '', notice_period: '', contract_type: 'permanent',
    working_model: 'hybrid', location: '', deadline: '', notes: '', status: 'draft',
  });

  useEffect(() => {
    async function load() {
      const [{ data: o }, { data: c }] = await Promise.all([
        supabase.from('offers').select('*, candidates(full_name)').eq('requisition_id', requisitionId).order('created_at', { ascending: false }),
        supabase.from('candidates').select('id, full_name').eq('requisition_id', requisitionId),
      ]);
      setOffers(o ?? []);
      setCandidates(c ?? []);
      setLoading(false);
    }
    load();
  }, [requisitionId]);

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function saveOffer() {
    if (!form.candidate_id) return;
    setSaving(true);
    const { data } = await supabase.from('offers').insert({
      requisition_id: requisitionId, company_id: companyId,
      candidate_id: form.candidate_id,
      base_salary: form.base_salary ? Math.round(parseFloat(form.base_salary) * 100) : null,
      bonus: form.bonus || null, benefits: form.benefits || null,
      start_date: form.start_date || null, notice_period: form.notice_period || null,
      contract_type: form.contract_type || null, working_model: form.working_model || null,
      location: form.location || null, deadline: form.deadline || null,
      notes: form.notes || null, status: form.status,
    }).select('*, candidates(full_name)').single();
    if (data) setOffers(prev => [data, ...prev]);
    setSaving(false);
    setShowForm(false);
    setForm({ candidate_id: '', base_salary: '', bonus: '', benefits: '', start_date: '', notice_period: '', contract_type: 'permanent', working_model: 'hybrid', location: '', deadline: '', notes: '', status: 'draft' });
  }

  async function updateOfferStatus(id: string, status: string) {
    const now = new Date().toISOString();
    const extra: Record<string, string> = {};
    if (status === 'sent')             extra.sent_at = now;
    if (status === 'verbal_accepted')  extra.verbal_accepted_at = now;
    if (status === 'written_accepted') extra.written_accepted_at = now;
    if (status === 'declined')         extra.declined_at = now;
    await supabase.from('offers').update({ status, ...extra }).eq('id', id);
    setOffers(prev => prev.map(o => o.id === id ? { ...o, status } : o));
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
          Offers {loading ? '' : `(${offers.length})`}
        </h3>
        <button onClick={() => setShowForm(v => !v)} className="btn-cta btn-sm flex items-center gap-1.5">
          <Plus size={12} /> New Offer
        </button>
      </div>

      {showForm && (
        <div className="space-y-3 mb-4 p-4 rounded-[10px]" style={{ background: 'var(--surface-alt)' }}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Candidate *</label>
              <select className="input" value={form.candidate_id} onChange={e => set('candidate_id', e.target.value)}>
                <option value="">Select…</option>
                {candidates.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Base Salary (£)</label>
              <input type="number" className="input" placeholder="55000" value={form.base_salary} onChange={e => set('base_salary', e.target.value)} />
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
                {WORKING_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Start Date</label>
              <input type="date" className="input" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Deadline</label>
              <input type="date" className="input" value={form.deadline} onChange={e => set('deadline', e.target.value)} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                {OFFER_STATUSES.map(s => <option key={s} value={s}>{OFFER_STATUS_CONFIG[s].label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Notes</label>
              <textarea className="input h-14 resize-none" value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveOffer} disabled={saving || !form.candidate_id} className="btn-cta btn-sm flex items-center gap-1.5">
              {saving && <Loader2 size={12} className="animate-spin" />} Save
            </button>
            <button onClick={() => setShowForm(false)} className="btn-ghost btn-sm">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={16} className="animate-spin" style={{ color: 'var(--purple)' }} />
        </div>
      ) : offers.length === 0 ? (
        <div className="text-center py-6">
          <FileText size={18} className="mx-auto mb-2" style={{ color: 'var(--ink-faint)' }} />
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>No offers yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {offers.map(o => {
            const cfg = OFFER_STATUS_CONFIG[o.status] ?? OFFER_STATUS_CONFIG.draft;
            return (
              <div key={o.id} className="rounded-[10px] p-3" style={{ border: '1px solid var(--line)', borderLeft: `3px solid ${cfg.color}` }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{o.candidates?.full_name ?? '—'}</p>
                    {o.base_salary && <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{fmtSalary(o.base_salary)}</p>}
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: cfg.bg, color: cfg.color }}>
                    {cfg.label}
                  </span>
                </div>
                {!['written_accepted', 'declined', 'withdrawn'].includes(o.status) && (
                  <select
                    className="input text-xs py-1"
                    defaultValue={o.status}
                    onChange={e => updateOfferStatus(o.id, e.target.value)}
                  >
                    {OFFER_STATUSES.map(s => <option key={s} value={s}>{OFFER_STATUS_CONFIG[s].label}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Main panel ───────────────────────────────────────────── */

const STAGES = ['submitted', 'in_progress', 'shortlist_ready', 'interview', 'offer', 'filled', 'cancelled'] as const;

interface Props {
  req: any;
}

export default function RequisitionPanel({ req }: Props) {
  const supabase = createClient();

  const [stage,     setStage]     = useState<string>(req.stage ?? 'submitted');
  const [recruiter, setRecruiter] = useState<string>(req.assigned_recruiter ?? '');
  const [savingStage,     setSavingStage]     = useState(false);
  const [savingRecruiter, setSavingRecruiter] = useState(false);
  const [recruiterSaved,  setRecruiterSaved]  = useState(false);

  async function updateStage(newStage: string) {
    setSavingStage(true);
    await supabase.from('requisitions').update({ stage: newStage }).eq('id', req.id);
    setStage(newStage);
    setSavingStage(false);
    revalidateAdminPath(`/hiring/${req.id}`);
  }

  async function saveRecruiter() {
    setSavingRecruiter(true);
    await supabase.from('requisitions').update({ assigned_recruiter: recruiter }).eq('id', req.id);
    setSavingRecruiter(false);
    setRecruiterSaved(true);
    setTimeout(() => setRecruiterSaved(false), 2000);
  }

  return (
    <div className="space-y-5">
      {/* Stage + recruiter updater */}
      <div className="card p-5">
        <h3 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>Manage Role</h3>
        <div className="space-y-4">
          <div>
            <label className="label">Hiring Stage</label>
            <div className="flex items-center gap-2">
              <select
                className="input flex-1"
                value={stage}
                onChange={e => updateStage(e.target.value)}
                disabled={savingStage}
              >
                {STAGES.map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                ))}
              </select>
              {savingStage && <Loader2 size={14} className="animate-spin flex-shrink-0" style={{ color: 'var(--purple)' }} />}
            </div>
          </div>
          <div>
            <label className="label">Assigned Recruiter</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="e.g. Lucy"
                value={recruiter}
                onChange={e => { setRecruiter(e.target.value); setRecruiterSaved(false); }}
              />
              <button
                onClick={saveRecruiter}
                disabled={savingRecruiter}
                className="btn-cta btn-sm flex items-center gap-1.5"
              >
                {savingRecruiter
                  ? <Loader2 size={12} className="animate-spin" />
                  : recruiterSaved
                    ? <CheckCircle2 size={12} />
                    : null}
                {recruiterSaved ? 'Saved' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Friction score */}
      {req.friction_score && <FrictionCard frictionScore={req.friction_score} />}

      {/* Offers panel */}
      <AdminOfferPanel requisitionId={req.id} companyId={req.company_id} />
    </div>
  );
}
