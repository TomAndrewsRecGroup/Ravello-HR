'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle2, AlertCircle, XCircle, AlertTriangle, HelpCircle,
         MapPin, PoundSterling, Layers, Monitor, Clock } from 'lucide-react';

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
  location: MapPin, salary: PoundSterling, skills: Layers, working_model: Monitor, process: Clock,
};
const DIM_LABELS: Record<string, string> = {
  location: 'Location', salary: 'Salary', skills: 'Skills', working_model: 'Working Model', process: 'Process',
};

function FrictionCard({ frictionScore }: { frictionScore: any }) {
  const level = (frictionScore?.overall_level ?? 'Unknown') as FrictionLevel;
  const cfg   = LEVEL_CONFIG[level];
  const Icon  = cfg.icon;
  const dims  = frictionScore?.dimensions
    ? Object.entries(frictionScore.dimensions) as [string, { score: number; label: FrictionLevel; explanation: string }][]
    : [];

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
                    {dim.label}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
                  <div className="h-full rounded-full" style={{ width: `${dim.score}%`, background: dc.badge }} />
                </div>
                <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--ink-faint)' }}>{dim.explanation}</p>
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

/* ── Main panel ───────────────────────────────────────────── */

const STAGES = ['submitted', 'in_progress', 'shortlist_ready', 'interview', 'offer', 'filled', 'cancelled'] as const;

interface Props {
  req: any;
}

export default function RequisitionPanel({ req }: Props) {
  const supabase = createClient();
  const router   = useRouter();

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
    router.refresh();
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
    </div>
  );
}
