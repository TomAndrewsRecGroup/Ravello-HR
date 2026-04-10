'use client';
import { revalidatePortalPath } from '@/app/actions';

import { useState, useEffect, useCallback } from 'react';

import {
  Loader2, Users, ChevronRight, ChevronDown, AlertTriangle, CheckCircle2,
} from 'lucide-react';

/* ─── Types ───────────────────────────────────────── */

interface Stage {
  id:   number;
  name: string;
}

interface Match {
  id:           number;
  candidate:    { id: number; first_name: string; last_name: string; email: string };
  job:          { id: number; name: string };
  stage:        Stage;
  is_active:    boolean;
  submitted_at: string | null;
  created_at:   string;
  updated_at:   string;
}

/* ─── Stage colours ───────────────────────────────── */

const STAGE_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  submission:      { bg: 'rgba(148,163,184,0.12)', text: '#475569', dot: '#94A3B8' },
  'phone screen':  { bg: 'rgba(59,111,255,0.10)',  text: '#1D4ED8', dot: '#3B6FFF' },
  interview:       { bg: 'rgba(124,58,237,0.10)',   text: '#6D28D9', dot: '#7C3AED' },
  'final interview': { bg: 'rgba(217,119,6,0.10)',  text: '#92400E', dot: '#D97706' },
  offer:           { bg: 'rgba(20,184,166,0.10)',   text: '#0D9488', dot: '#14B8A6' },
  hired:           { bg: 'rgba(22,163,74,0.10)',    text: '#166534', dot: '#16A34A' },
  rejected:        { bg: 'rgba(220,38,38,0.08)',    text: '#991B1B', dot: '#DC2626' },
};

function stageStyle(name: string) {
  return STAGE_STYLE[name.toLowerCase()] ?? { bg: 'rgba(7,11,29,0.06)', text: 'var(--ink-soft)', dot: 'var(--ink-faint)' };
}

/* ─── Main Component ──────────────────────────────── */

export default function ManatalPipeline() {

  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [matches,  setMatches]  = useState<Match[]>([]);
  const [stages,   setStages]   = useState<Stage[]>([]);
  const [configured, setConfigured] = useState(false);
  const [moving,   setMoving]   = useState<number | null>(null); // matchId being moved
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/manatal/matches');
      if (!res.ok) throw new Error('Failed to load pipeline');
      const data = await res.json();
      setMatches(data.matches ?? []);
      setStages(data.stages ?? []);
      setConfigured(data.configured);
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function moveStage(match: Match, newStage: Stage) {
    if (match.stage.id === newStage.id) return;
    setMoving(match.id);

    try {
      const res = await fetch('/api/manatal/matches/move-stage', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId:       match.id,
          stageId:       newStage.id,
          stageName:     newStage.name,
          candidateName: `${match.candidate.first_name} ${match.candidate.last_name}`,
          jobName:       match.job.name,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to move candidate');
      }

      // Optimistic update
      setMatches(prev =>
        prev.map(m => m.id === match.id ? { ...m, stage: newStage, updated_at: new Date().toISOString() } : m)
      );

      setToast({
        msg: `${match.candidate.first_name} ${match.candidate.last_name} moved to ${newStage.name}`,
        ok: true,
      });

      revalidatePortalPath('/hire/hiring');
    } catch (err: any) {
      setToast({ msg: err.message ?? 'Failed to move candidate', ok: false });
    } finally {
      setMoving(null);
    }
  }

  /* ─── Loading / empty states ────────────────────── */

  if (loading) {
    return (
      <div className="card p-8 flex items-center justify-center gap-2">
        <Loader2 size={18} className="animate-spin" style={{ color: 'var(--purple)' }} />
        <span className="text-sm" style={{ color: 'var(--ink-faint)' }}>Loading pipeline from Manatal...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 flex items-center gap-2" style={{ background: 'rgba(217,68,68,0.04)' }}>
        <AlertTriangle size={16} style={{ color: 'var(--red)' }} />
        <span className="text-sm" style={{ color: 'var(--red)' }}>{error}</span>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="card p-8 text-center">
        <div className="empty-state">
          <Users size={24} />
          <p className="text-sm font-medium" style={{ color: 'var(--ink-soft)' }}>ATS not connected</p>
          <p className="text-xs max-w-[320px]" style={{ color: 'var(--ink-faint)' }}>
            Your Manatal ATS is not linked yet. The People Office will set this up for you.
          </p>
        </div>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="card p-8 text-center">
        <div className="empty-state">
          <Users size={24} />
          <p className="text-sm font-medium" style={{ color: 'var(--ink-soft)' }}>No candidates in pipeline</p>
          <p className="text-xs max-w-[320px]" style={{ color: 'var(--ink-faint)' }}>
            When candidates are added to your roles in Manatal they will appear here.
          </p>
        </div>
      </div>
    );
  }

  /* ─── Group by job ──────────────────────────────── */

  const jobMap = new Map<number, { name: string; matches: Match[] }>();
  for (const m of matches) {
    if (!m.is_active) continue;
    const existing = jobMap.get(m.job.id);
    if (existing) {
      existing.matches.push(m);
    } else {
      jobMap.set(m.job.id, { name: m.job.name, matches: [m] });
    }
  }

  // Stage summary for header badges
  const activeMatches = matches.filter(m => m.is_active);
  const stageSummary = stages
    .map(s => ({ ...s, count: activeMatches.filter(m => m.stage.id === s.id).length }))
    .filter(s => s.count > 0);

  return (
    <div className="space-y-6">

      {/* Toast notification */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-[10px] shadow-lg text-sm font-medium animate-in slide-in-from-bottom-4"
          style={{
            background: toast.ok ? 'var(--emerald)' : 'var(--danger)',
            color: '#fff',
          }}
        >
          {toast.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Stage summary pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>
          Pipeline
        </span>
        {stageSummary.map(s => {
          const st = stageStyle(s.name);
          return (
            <span
              key={s.id}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
              style={{ background: st.bg, color: st.text }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
              {s.name} ({s.count})
            </span>
          );
        })}
        <span className="text-xs ml-auto" style={{ color: 'var(--ink-faint)' }}>
          {activeMatches.length} candidate{activeMatches.length !== 1 ? 's' : ''} total
        </span>
      </div>

      {/* Per-job sections */}
      {Array.from(jobMap.entries()).map(([jobId, { name, matches: jobMatches }]) => (
        <JobSection
          key={jobId}
          jobName={name}
          matches={jobMatches}
          stages={stages}
          movingId={moving}
          onMoveStage={moveStage}
        />
      ))}
    </div>
  );
}

/* ─── Job Section (collapsible) ───────────────────── */

function JobSection({
  jobName, matches, stages, movingId, onMoveStage,
}: {
  jobName:     string;
  matches:     Match[];
  stages:      Stage[];
  movingId:    number | null;
  onMoveStage: (match: Match, stage: Stage) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="card p-0 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-5 py-4 text-left"
        style={{ background: 'var(--surface-soft)', borderBottom: open ? '1px solid var(--line)' : 'none' }}
      >
        {open ? <ChevronDown size={14} style={{ color: 'var(--ink-faint)' }} /> : <ChevronRight size={14} style={{ color: 'var(--ink-faint)' }} />}
        <span className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
          {jobName}
        </span>
        <span className="text-xs ml-1" style={{ color: 'var(--ink-faint)' }}>
          ({matches.length} candidate{matches.length !== 1 ? 's' : ''})
        </span>
      </button>

      {open && (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Email</th>
                <th>Current Stage</th>
                <th>Move To</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {matches.map(m => {
                const st = stageStyle(m.stage.name);
                const isMoving = movingId === m.id;
                return (
                  <tr key={m.id} style={isMoving ? { opacity: 0.6 } : undefined}>
                    <td>
                      <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>
                        {m.candidate.first_name} {m.candidate.last_name}
                      </p>
                    </td>
                    <td>
                      <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                        {m.candidate.email ?? '—'}
                      </span>
                    </td>
                    <td>
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: st.bg, color: st.text }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
                        {m.stage.name}
                      </span>
                    </td>
                    <td>
                      {isMoving ? (
                        <Loader2 size={14} className="animate-spin" style={{ color: 'var(--purple)' }} />
                      ) : (
                        <select
                          className="input text-xs py-1 px-2"
                          style={{ minWidth: 140 }}
                          value={m.stage.id}
                          onChange={(e) => {
                            const newStageId = Number(e.target.value);
                            const newStage = stages.find(s => s.id === newStageId);
                            if (newStage) onMoveStage(m, newStage);
                          }}
                        >
                          {stages.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                        {m.submitted_at
                          ? new Date(m.submitted_at).toLocaleDateString('en-GB')
                          : new Date(m.created_at).toLocaleDateString('en-GB')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
