'use client';
import type { FrictionScore, FrictionLevel } from '@/lib/supabase/types';
import { CheckCircle2, AlertTriangle, XCircle, AlertCircle, HelpCircle,
         Flame, Eye, Layers } from 'lucide-react';

const LEVEL_CONFIG: Record<FrictionLevel, {
  bg: string; border: string; badgeBg: string; badgeText: string; icon: React.ElementType;
}> = {
  Low:      { bg: 'rgba(22,163,74,0.06)',   border: 'rgba(22,163,74,0.2)',   badgeBg: 'var(--success)', badgeText: '#fff', icon: CheckCircle2 },
  Medium:   { bg: 'rgba(217,119,6,0.06)',   border: 'rgba(217,119,6,0.2)',   badgeBg: 'var(--amber)', badgeText: '#fff', icon: AlertCircle  },
  High:     { bg: 'rgba(220,38,38,0.06)',   border: 'rgba(220,38,38,0.2)',   badgeBg: 'var(--danger)', badgeText: '#fff', icon: XCircle      },
  Critical: { bg: 'rgba(127,29,29,0.08)',   border: 'rgba(127,29,29,0.25)',  badgeBg: '#7F1D1D', badgeText: '#fff', icon: AlertTriangle },
  Unknown:  { bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.2)', badgeBg: '#94A3B8', badgeText: '#fff', icon: HelpCircle   },
};

interface DimBar {
  key:   string;
  label: string;
  score: number;
  icon:  React.ElementType;
  tip:   string;
}

interface Props {
  score:    FrictionScore;
  compact?: boolean;
}

export default function FrictionScoreCard({ score, compact = false }: Props) {
  const cfg       = LEVEL_CONFIG[score.overall_level ?? 'Unknown'];
  const LevelIcon = cfg.icon;

  // Build 3-dimension bars from IvyLens scores
  const dims: DimBar[] = [
    {
      key:   'friction',
      label: 'Market Friction',
      score: score.friction_score ?? score.overall_score ?? 0,
      icon:  Flame,
      tip:   'Hiring demand and competition for this role type in the market.',
    },
    {
      key:   'clarity',
      label: 'JD Clarity',
      score: score.clarity_score ?? 0,
      icon:  Eye,
      tip:   'How clearly the job description communicates the role requirements.',
    },
    {
      key:   'overload',
      label: 'Requirement Overload',
      score: score.overload_score ?? 0,
      icon:  Layers,
      tip:   `${score.required_skills_count ?? 0} required skills detected. High overload narrows your candidate pool.`,
    },
  ];

  return (
    <div
      className="rounded-[16px] p-5"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--ink-faint)' }}>
            Friction Lens
          </p>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold"
              style={{ background: cfg.badgeBg, color: cfg.badgeText }}
            >
              <LevelIcon size={13} />
              {score.overall_level ?? 'Unknown'} Friction
            </span>
            <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
              {score.overall_score ?? 0}/100
            </span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Est. time to fill</p>
          <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--ink)' }}>
            {score.time_to_fill_estimate ?? '—'}
          </p>
        </div>
      </div>

      {/* 3-dimension bars */}
      <div className="space-y-3 mb-4">
        {dims.map(dim => {
          const pct     = Math.min(Math.max(dim.score, 0), 100);
          const barLevel: FrictionLevel = pct < 25 ? 'Low' : pct < 50 ? 'Medium' : pct < 75 ? 'High' : 'Critical';
          const barCfg  = LEVEL_CONFIG[barLevel];
          return (
            <div key={dim.key}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <dim.icon size={12} style={{ color: 'var(--ink-faint)' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--ink-soft)' }}>{dim.label}</span>
                </div>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: barCfg.badgeBg, color: barCfg.badgeText }}
                >
                  {pct}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-alt)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: barCfg.badgeBg }}
                />
              </div>
              {!compact && (
                <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
                  {dim.tip}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Recommendations */}
      {(score.recommendations ?? []).length > 0 && (
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
