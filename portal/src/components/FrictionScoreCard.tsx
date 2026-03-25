'use client';
import type { FrictionScore, FrictionLevel } from '@/lib/supabase/types';
import { CheckCircle2, AlertTriangle, XCircle, AlertCircle, HelpCircle,
         MapPin, PoundSterling, Layers, Monitor, Clock } from 'lucide-react';

const LEVEL_CONFIG: Record<FrictionLevel, {
  bg: string; border: string; text: string; badgeBg: string; badgeText: string; icon: React.ElementType;
}> = {
  Low:      { bg: 'rgba(22,163,74,0.06)',   border: 'rgba(22,163,74,0.2)',   text: '#166534', badgeBg: '#16A34A', badgeText: '#fff', icon: CheckCircle2 },
  Medium:   { bg: 'rgba(217,119,6,0.06)',   border: 'rgba(217,119,6,0.2)',   text: '#92400E', badgeBg: '#D97706', badgeText: '#fff', icon: AlertCircle },
  High:     { bg: 'rgba(220,38,38,0.06)',   border: 'rgba(220,38,38,0.2)',   text: '#991B1B', badgeBg: '#DC2626', badgeText: '#fff', icon: XCircle },
  Critical: { bg: 'rgba(127,29,29,0.08)',   border: 'rgba(127,29,29,0.25)',  text: '#7F1D1D', badgeBg: '#7F1D1D', badgeText: '#fff', icon: AlertTriangle },
  Unknown:  { bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.2)', text: '#64748B', badgeBg: '#94A3B8', badgeText: '#fff', icon: HelpCircle },
};

const DIM_ICONS: Record<string, React.ElementType> = {
  location:      MapPin,
  salary:        PoundSterling,
  skills:        Layers,
  working_model: Monitor,
  process:       Clock,
};

const DIM_LABELS: Record<string, string> = {
  location:      'Location',
  salary:        'Salary',
  skills:        'Skills',
  working_model: 'Working Model',
  process:       'Process',
};

interface Props {
  score:    FrictionScore;
  compact?: boolean;
}

export default function FrictionScoreCard({ score, compact = false }: Props) {
  const cfg         = LEVEL_CONFIG[score.overall_level];
  const LevelIcon   = cfg.icon;
  const dims        = Object.entries(score.dimensions) as [string, { score: number; label: FrictionLevel; explanation: string }][];

  return (
    <div
      className="rounded-[16px] p-5"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--ink-faint)' }}>
            Friction Lens Score
          </p>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold"
              style={{ background: cfg.badgeBg, color: cfg.badgeText }}
            >
              <LevelIcon size={13} />
              {score.overall_level} Friction
            </span>
            <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
              Score: {score.overall_score}/100
            </span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Est. time to fill</p>
          <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--ink)' }}>{score.time_to_fill_estimate}</p>
        </div>
      </div>

      {/* Dimension bars */}
      <div className="space-y-2.5 mb-4">
        {dims.map(([key, dim]) => {
          const Icon  = DIM_ICONS[key] ?? MapPin;
          const dimCfg = LEVEL_CONFIG[dim.label] ?? LEVEL_CONFIG.Unknown;
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Icon size={12} style={{ color: 'var(--ink-faint)' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--ink-soft)' }}>
                    {DIM_LABELS[key] ?? key}
                  </span>
                </div>
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ background: dimCfg.badgeBg, color: dimCfg.badgeText }}
                >
                  {dim.label}
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-alt)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width:      `${dim.score}%`,
                    background: dimCfg.badgeBg,
                  }}
                />
              </div>
              {!compact && (
                <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
                  {dim.explanation}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Recommendations */}
      {score.recommendations.length > 0 && (
        <div
          className="rounded-[10px] p-3"
          style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(0,0,0,0.06)' }}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-faint)' }}>
            Recommendations
          </p>
          <ul className="space-y-1.5">
            {score.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                <span className="w-1 h-1 rounded-full flex-shrink-0 mt-1.5" style={{ background: cfg.badgeBg }} />
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
