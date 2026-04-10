'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import type { Milestone } from '@/lib/supabase/types';

// ── Quarter helpers ────────────────────────────────────────────────────────────

function quarterFromDate(d: Date): string {
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `Q${q}-${d.getFullYear()}`;
}

function parseQuarter(q: string): { quarter: number; year: number } {
  const [qPart, yearPart] = q.split('-');
  return { quarter: parseInt(qPart.replace('Q', ''), 10), year: parseInt(yearPart, 10) };
}

function offsetQuarter(q: string, delta: number): string {
  let { quarter, year } = parseQuarter(q);
  quarter += delta;
  if (quarter > 4) { quarter -= 4; year += 1; }
  if (quarter < 1) { quarter += 4; year -= 1; }
  return `Q${quarter}-${year}`;
}

function quarterLabel(q: string): string {
  const { quarter, year } = parseQuarter(q);
  return `Q${quarter} ${year}`;
}

// ── Status helpers ─────────────────────────────────────────────────────────────

function statusBadge(status: Milestone['status']): React.ReactNode {
  switch (status) {
    case 'not_started': return <span className="badge badge-normal">Not started</span>;
    case 'in_progress': return <span className="badge badge-inprogress">In progress</span>;
    case 'complete':    return <span className="badge badge-filled" style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}>Complete</span>;
    case 'at_risk':     return <span className="badge badge-urgent">At risk</span>;
  }
}

// ── Pillar config ──────────────────────────────────────────────────────────────

const PILLARS: { key: Milestone['pillar']; label: string; color: string }[] = [
  { key: 'hire',    label: 'HIRE',    color: 'var(--purple)' },
  { key: 'lead',    label: 'LEAD',    color: 'var(--teal)' },
  { key: 'protect', label: 'PROTECT', color: 'var(--blue)' },
];

// ── Milestone card ─────────────────────────────────────────────────────────────

interface CardProps {
  milestone: Milestone;
}

function MilestoneCard({ milestone: m }: CardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      className="w-full text-left card p-4 transition-shadow hover:shadow-md"
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-start gap-2">
        {m.status === 'complete' && (
          <CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" style={{ color: '#059669' }} />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-snug" style={{ color: 'var(--ink)' }}>
            {m.title}
          </p>
          {m.description && (
            <p
              className="text-xs mt-1 leading-relaxed"
              style={{
                color: 'var(--ink-faint)',
                display: expanded ? 'block' : '-webkit-box',
                WebkitLineClamp: expanded ? undefined : 2,
                WebkitBoxOrient: 'vertical',
                overflow: expanded ? 'visible' : 'hidden',
              } as React.CSSProperties}
            >
              {m.description}
            </p>
          )}
          <div className="flex items-center flex-wrap gap-2 mt-2">
            {statusBadge(m.status)}
            {m.owner && (
              <span
                className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}
              >
                {m.owner}
              </span>
            )}
            {m.due_date && (
              <span className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                Due {new Date(m.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ complete, total, color }: { complete: number; total: number; color: string }) {
  const pct = total === 0 ? 0 : Math.round((complete / total) * 100);
  return (
    <div className="mb-4">
      <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--ink-faint)' }}>
        <span>{complete}/{total} complete</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: 'var(--surface-alt)' }}>
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────

interface Props {
  milestones: Milestone[];
  initialQuarter: string;
}

export default function RoadmapView({ milestones, initialQuarter }: Props) {
  const [quarter, setQuarter] = useState(initialQuarter);

  const filtered = milestones.filter(m => m.quarter === quarter);

  return (
    <div>
      {/* Quarter navigation */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => setQuarter(q => offsetQuarter(q, -1))}
          className="btn-icon"
          aria-label="Previous quarter"
        >
          <ChevronLeft size={16} />
        </button>
        <h2
          className="font-display font-bold text-xl w-[120px] text-center"
          style={{ color: 'var(--ink)' }}
        >
          {quarterLabel(quarter)}
        </h2>
        <button
          type="button"
          onClick={() => setQuarter(q => offsetQuarter(q, 1))}
          className="btn-icon"
          aria-label="Next quarter"
        >
          <ChevronRight size={16} />
        </button>
        {quarter !== initialQuarter && (
          <button
            type="button"
            onClick={() => setQuarter(initialQuarter)}
            className="btn-secondary btn-sm ml-2"
          >
            Today
          </button>
        )}
      </div>

      {/* Three columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {PILLARS.map(pillar => {
          const pillarMilestones = filtered
            .filter(m => m.pillar === pillar.key)
            .sort((a, b) => a.sort_order - b.sort_order);

          const completedCount = pillarMilestones.filter(m => m.status === 'complete').length;

          return (
            <div key={pillar.key}>
              {/* Column header */}
              <div
                className="rounded-t-[12px] px-4 py-2.5 flex items-center gap-2 mb-0"
                style={{ background: pillar.color }}
              >
                <span className="font-display font-bold text-sm tracking-wider text-white">
                  {pillar.label}
                </span>
              </div>

              <div
                className="rounded-b-[12px] p-4 space-y-3 min-h-[200px]"
                style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderTop: 'none' }}
              >
                {pillarMilestones.length > 0 ? (
                  <>
                    <ProgressBar
                      complete={completedCount}
                      total={pillarMilestones.length}
                      color={pillar.color}
                    />
                    {pillarMilestones.map(m => (
                      <MilestoneCard key={m.id} milestone={m} />
                    ))}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                    <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                      No milestones for this quarter. Your roadmap will be set up during your onboarding call.
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
