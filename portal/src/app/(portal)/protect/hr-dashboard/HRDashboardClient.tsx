'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, X, Loader2, Users, TrendingDown, AlertTriangle, CheckCircle2, FileText, BookOpen, ClipboardList } from 'lucide-react';
import Link from 'next/link';

interface HRMetric {
  id: string;
  period: string;
  headcount: number | null;
  headcount_target: number | null;
  turnover_rate: number | null;
  absence_rate: number | null;
  gender_m_pct: number | null;
  gender_f_pct: number | null;
  gender_other_pct: number | null;
  avg_tenure_months: number | null;
  notes: string | null;
}

interface Props {
  companyId: string;
  initialMetrics: HRMetric[];
  empDocCount: number;
  expiredDocs: number;
  absencePending: number;
  openTraining: number;
  pendingReviews: number;
}

function RAGBadge({ value, thresholds, label, suffix = '' }: { value: number | null; thresholds: [number, number]; label: string; suffix?: string }) {
  if (value === null) return <span className="text-sm" style={{ color: 'var(--ink-faint)' }}>—</span>;
  const [warn, danger] = thresholds;
  const color = value >= danger ? '#DC2626' : value >= warn ? '#D97706' : '#16A34A';
  const bg = value >= danger ? 'rgba(220,38,38,0.08)' : value >= warn ? 'rgba(217,119,6,0.08)' : 'rgba(22,163,74,0.08)';
  return (
    <span className="text-sm font-semibold px-2 py-0.5 rounded-full" style={{ background: bg, color }}>
      {value}{suffix}
    </span>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(7,11,29,0.07)' }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  );
}

export default function HRDashboardClient({ companyId, initialMetrics, empDocCount, expiredDocs, absencePending, openTraining, pendingReviews }: Props) {
  const supabase = createClient();
  const [metrics, setMetrics] = useState<HRMetric[]>(initialMetrics);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    period: '', headcount: '', headcount_target: '',
    turnover_rate: '', absence_rate: '',
    gender_m_pct: '', gender_f_pct: '', gender_other_pct: '',
    avg_tenure_months: '', notes: '',
  });

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.period.trim()) return;
    setSaving(true);
    const { data } = await supabase.from('hr_metrics').upsert({
      company_id:        companyId,
      period:            form.period,
      headcount:         form.headcount ? parseInt(form.headcount) : null,
      headcount_target:  form.headcount_target ? parseInt(form.headcount_target) : null,
      turnover_rate:     form.turnover_rate ? parseFloat(form.turnover_rate) : null,
      absence_rate:      form.absence_rate ? parseFloat(form.absence_rate) : null,
      gender_m_pct:      form.gender_m_pct ? parseFloat(form.gender_m_pct) : null,
      gender_f_pct:      form.gender_f_pct ? parseFloat(form.gender_f_pct) : null,
      gender_other_pct:  form.gender_other_pct ? parseFloat(form.gender_other_pct) : null,
      avg_tenure_months: form.avg_tenure_months ? parseInt(form.avg_tenure_months) : null,
      notes:             form.notes || null,
    }, { onConflict: 'company_id,period' }).select().single();
    if (data) {
      setMetrics(prev => {
        const existing = prev.findIndex(m => m.period === (data as HRMetric).period);
        if (existing >= 0) { const n = [...prev]; n[existing] = data as HRMetric; return n; }
        return [data as HRMetric, ...prev].sort((a, b) => b.period.localeCompare(a.period));
      });
    }
    setSaving(false);
    setShowForm(false);
    setForm({ period: '', headcount: '', headcount_target: '', turnover_rate: '', absence_rate: '', gender_m_pct: '', gender_f_pct: '', gender_other_pct: '', avg_tenure_months: '', notes: '' });
  }

  const latest = metrics[0];

  const quickLinks = [
    { href: '/protect/employee-docs', icon: FileText,     label: 'Employee Docs',  stat: empDocCount,    alert: expiredDocs > 0,    alertText: `${expiredDocs} expired` },
    { href: '/protect/absence',       icon: CheckCircle2, label: 'Absence',        stat: absencePending, alert: absencePending > 0, alertText: `${absencePending} pending` },
    { href: '/lead/training',         icon: BookOpen,     label: 'Training Needs', stat: openTraining,   alert: openTraining > 0,   alertText: `${openTraining} open` },
    { href: '/lead/reviews',          icon: ClipboardList,label: 'Reviews',        stat: pendingReviews, alert: pendingReviews > 0, alertText: `${pendingReviews} pending` },
  ];

  return (
    <div className="space-y-6">
      {/* Quick links */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {quickLinks.map(({ href, icon: Icon, label, stat, alert, alertText }) => (
          <Link key={href} href={href} className="card p-4 flex flex-col gap-2 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <Icon size={16} style={{ color: alert ? '#DC2626' : 'var(--purple)' }} />
              {alert && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(220,38,38,0.1)', color: '#DC2626' }}>
                  {alertText}
                </span>
              )}
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{stat}</p>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{label}</p>
          </Link>
        ))}
      </div>

      {/* Latest period snapshot */}
      {latest && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Latest Period: {latest.period}</h2>
              {latest.notes && <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{latest.notes}</p>}
            </div>
            <button onClick={() => setShowForm(v => !v)} className="btn-secondary btn-sm flex items-center gap-1.5">
              <Plus size={12} /> Update
            </button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Headcount */}
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--ink-faint)' }}>Headcount</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{latest.headcount ?? '—'}</span>
                {latest.headcount_target && <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>/ {latest.headcount_target} target</span>}
              </div>
              {latest.headcount && latest.headcount_target && (
                <Bar pct={(latest.headcount / latest.headcount_target) * 100} color="var(--purple)" />
              )}
            </div>
            {/* Turnover */}
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--ink-faint)' }}>Turnover Rate</p>
              <RAGBadge value={latest.turnover_rate} thresholds={[10, 20]} label="Turnover" suffix="%" />
              {latest.turnover_rate !== null && (
                <div className="mt-1.5">
                  <Bar pct={latest.turnover_rate} color={latest.turnover_rate >= 20 ? '#DC2626' : latest.turnover_rate >= 10 ? '#D97706' : '#16A34A'} />
                </div>
              )}
            </div>
            {/* Absence */}
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--ink-faint)' }}>Absence Rate</p>
              <RAGBadge value={latest.absence_rate} thresholds={[3, 6]} label="Absence" suffix="%" />
              {latest.absence_rate !== null && (
                <div className="mt-1.5">
                  <Bar pct={latest.absence_rate * 10} color={latest.absence_rate >= 6 ? '#DC2626' : latest.absence_rate >= 3 ? '#D97706' : '#16A34A'} />
                </div>
              )}
            </div>
            {/* Avg tenure */}
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--ink-faint)' }}>Avg Tenure</p>
              <span className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>
                {latest.avg_tenure_months ? `${Math.floor(latest.avg_tenure_months / 12)}y ${latest.avg_tenure_months % 12}m` : '—'}
              </span>
            </div>
          </div>

          {/* Gender diversity */}
          {(latest.gender_m_pct !== null || latest.gender_f_pct !== null) && (
            <>
              <div className="divider my-5" />
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--ink-faint)' }}>Gender Diversity</p>
              <div className="space-y-2">
                {[
                  { label: 'Male',   pct: latest.gender_m_pct,     color: '#60A5FA' },
                  { label: 'Female', pct: latest.gender_f_pct,     color: '#F472B6' },
                  { label: 'Other',  pct: latest.gender_other_pct, color: '#A78BFA' },
                ].filter(g => g.pct !== null).map(g => (
                  <div key={g.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{g.label}</span>
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{g.pct}%</span>
                    </div>
                    <Bar pct={g.pct!} color={g.color} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Add/update form */}
      {showForm && (
        <div className="card p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Add / Update Period Data</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Period * (e.g. 2026-Q1)</label>
              <input className="input" placeholder="2026-Q1" value={form.period} onChange={e => set('period', e.target.value)} />
            </div>
            <div>
              <label className="label">Headcount</label>
              <input type="number" className="input" placeholder="45" value={form.headcount} onChange={e => set('headcount', e.target.value)} />
            </div>
            <div>
              <label className="label">Headcount Target</label>
              <input type="number" className="input" placeholder="50" value={form.headcount_target} onChange={e => set('headcount_target', e.target.value)} />
            </div>
            <div>
              <label className="label">Turnover Rate (%)</label>
              <input type="number" step="0.1" className="input" placeholder="8.5" value={form.turnover_rate} onChange={e => set('turnover_rate', e.target.value)} />
            </div>
            <div>
              <label className="label">Absence Rate (%)</label>
              <input type="number" step="0.1" className="input" placeholder="2.3" value={form.absence_rate} onChange={e => set('absence_rate', e.target.value)} />
            </div>
            <div>
              <label className="label">Avg Tenure (months)</label>
              <input type="number" className="input" placeholder="24" value={form.avg_tenure_months} onChange={e => set('avg_tenure_months', e.target.value)} />
            </div>
            <div>
              <label className="label">Gender Male (%)</label>
              <input type="number" step="0.1" className="input" placeholder="55" value={form.gender_m_pct} onChange={e => set('gender_m_pct', e.target.value)} />
            </div>
            <div>
              <label className="label">Gender Female (%)</label>
              <input type="number" step="0.1" className="input" placeholder="43" value={form.gender_f_pct} onChange={e => set('gender_f_pct', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <textarea className="input h-14 resize-none" value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.period.trim()} className="btn-cta btn-sm flex items-center gap-1.5">
              {saving && <Loader2 size={12} className="animate-spin" />} Save
            </button>
            <button onClick={() => setShowForm(false)} className="btn-ghost btn-sm flex items-center gap-1">
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Historical periods */}
      {metrics.length > 1 && (
        <div className="card p-6">
          <h2 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>Historical Data</h2>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  {['Period', 'Headcount', 'Turnover', 'Absence', 'Avg Tenure'].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {metrics.map(m => (
                  <tr key={m.id}>
                    <td className="font-medium text-sm">{m.period}</td>
                    <td className="text-sm">{m.headcount ?? '—'}{m.headcount_target ? ` / ${m.headcount_target}` : ''}</td>
                    <td><RAGBadge value={m.turnover_rate} thresholds={[10, 20]} label="" suffix="%" /></td>
                    <td><RAGBadge value={m.absence_rate} thresholds={[3, 6]} label="" suffix="%" /></td>
                    <td className="text-sm">{m.avg_tenure_months ? `${Math.floor(m.avg_tenure_months / 12)}y ${m.avg_tenure_months % 12}m` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {metrics.length === 0 && !showForm && (
        <div className="card p-12">
          <div className="empty-state py-4">
            <Users size={24} />
            <p className="text-sm">No HR metrics yet</p>
            <p className="text-xs max-w-[280px]">Add period data to track headcount, turnover, absence rates and diversity metrics over time.</p>
            <button onClick={() => setShowForm(true)} className="btn-cta btn-sm mt-2">Add First Period</button>
          </div>
        </div>
      )}
    </div>
  );
}
