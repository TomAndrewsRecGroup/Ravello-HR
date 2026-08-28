'use client';

/**
 * The Manatal applicants on one role, inside the admin app.
 *
 * The portal has had a pipeline view since Phase 31 and admin had none,
 * so staff could publish a role and then had no way to see who applied
 * without opening Manatal. This is the admin half of that flow.
 *
 * Two things it does that the portal's version does not, both because
 * the audience is different:
 *
 *  - It labels who APPLIED versus who a recruiter attached. Only
 *    applicants are ever referred on to a partner, so without the label
 *    a name that never reaches the referral funnel looks like a bug.
 *  - It reports a truncated read. The portal's version presents whatever
 *    came back; here, "some applicants could not be read" has to be
 *    distinguishable from "that is everyone".
 *
 * Names are hydrated best-effort server-side. A candidate whose name
 * could not be resolved is shown by id rather than dropped — an
 * applicant missing from this list is the failure worth avoiding.
 */

import { useCallback, useEffect, useState } from 'react';
import { revalidateAdminPath } from '@/app/actions';
import { Loader2, Users, AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';

interface Stage { id: number; name: string }

interface Row {
  id:           number;
  candidate_id: string;
  full_name:    string | null;
  email:        string | null;
  stage:        Stage;
  is_active:    boolean;
  applied:      boolean;
  created_at:   string;
}

type State = 'ok' | 'not_configured' | 'not_published';

const STAGE_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  'new candidates':  { bg: 'rgba(116,128,153,0.12)', text: 'var(--ink-soft)', dot: 'var(--ink-faint)' },
  submission:        { bg: 'rgba(116,128,153,0.12)', text: 'var(--ink-soft)', dot: 'var(--ink-faint)' },
  'phone screen':    { bg: 'rgba(59,111,255,0.10)',  text: '#1D4ED8',         dot: 'var(--blue)' },
  interview:         { bg: 'rgba(124,58,237,0.10)',  text: '#6D28D9',         dot: 'var(--purple)' },
  'final interview': { bg: 'rgba(191,143,40,0.12)',  text: 'var(--gold)',     dot: 'var(--gold)' },
  offer:             { bg: 'rgba(20,184,166,0.10)',  text: '#0D9488',         dot: 'var(--teal)' },
  hired:             { bg: 'rgba(20,184,166,0.14)',  text: '#0D9488',         dot: 'var(--teal)' },
  rejected:          { bg: 'rgba(217,68,68,0.08)',   text: 'var(--red)',      dot: 'var(--red)' },
};

function stageStyle(name: string) {
  return STAGE_STYLE[(name ?? '').toLowerCase()]
    ?? { bg: 'rgba(7,11,29,0.06)', text: 'var(--ink-soft)', dot: 'var(--ink-faint)' };
}

export default function RoleApplicants({
  requisitionId, manatalJobId,
}: {
  requisitionId: string;
  manatalJobId:  string | null;
}) {
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [rows,      setRows]      = useState<Row[]>([]);
  const [stages,    setStages]    = useState<Stage[]>([]);
  const [state,     setState]     = useState<State>('ok');
  const [truncated, setTruncated] = useState(false);
  const [unnamed,   setUnnamed]   = useState(0);
  const [moving,    setMoving]    = useState<number | null>(null);
  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/admin/manatal/matches?requisition_id=${encodeURIComponent(requisitionId)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Could not load applicants (${res.status})`);
      setRows(json.rows ?? []);
      setStages(json.stages ?? []);
      setState(json.state ?? 'ok');
      setTruncated(Boolean(json.truncated));
      setUnnamed(Number(json.unresolved_names ?? 0));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [requisitionId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function moveStage(row: Row, stage: Stage) {
    if (row.stage.id === stage.id) return;
    setMoving(row.id);
    try {
      const res = await fetch('/api/admin/manatal/matches/move-stage', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ requisition_id: requisitionId, matchId: row.id, stageId: stage.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Manatal rejected the change');

      setRows(prev => prev.map(r => r.id === row.id ? { ...r, stage } : r));
      setToast({ msg: `${row.full_name ?? 'Candidate'} moved to ${stage.name}`, ok: true });
      revalidateAdminPath(`/hiring/${requisitionId}`);
    } catch (e) {
      setToast({ msg: (e as Error).message, ok: false });
    } finally {
      setMoving(null);
    }
  }

  const applied = rows.filter(r => r.applied);

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display text-lg font-semibold" style={{ color: 'var(--ink)' }}>Applicants</h3>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            Live from Manatal for this role. {applied.length} applied
            {rows.length !== applied.length && ` · ${rows.length - applied.length} added by a recruiter`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {manatalJobId && (
            <a
              href={`https://app.manatal.com/jobs/${manatalJobId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost btn-sm"
            >
              <ExternalLink size={12} /> Open in Manatal
            </a>
          )}
          <button type="button" className="btn-secondary btn-sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 size={12} className="animate-spin" /> : null} Refresh
          </button>
        </div>
      </div>

      {truncated && (
        <p className="text-xs p-2 rounded-[8px]" style={{ background: 'rgba(191,143,40,0.10)', color: 'var(--gold)' }}>
          Manatal did not return every applicant for this role — this list is incomplete.
        </p>
      )}

      {unnamed > 0 && (
        <p className="text-xs p-2 rounded-[8px]" style={{ background: 'rgba(191,143,40,0.10)', color: 'var(--gold)' }}>
          {unnamed} applicant{unnamed === 1 ? '' : 's'} could not be named — shown by candidate id below. They are still
          on the role and are still scanned; only the name lookup failed.
        </p>
      )}

      {error && (
        <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--red)' }}>
          <AlertTriangle size={12} /> {error}
        </p>
      )}

      {loading && rows.length === 0 && !error && (
        <div className="flex items-center gap-2 py-6 justify-center">
          <Loader2 size={16} className="animate-spin" style={{ color: 'var(--purple)' }} />
          <span className="text-sm" style={{ color: 'var(--ink-faint)' }}>Loading from Manatal…</span>
        </div>
      )}

      {!loading && !error && state === 'not_configured' && (
        <div className="empty-state">
          <Users size={22} />
          <p className="text-sm font-medium" style={{ color: 'var(--ink-soft)' }}>Manatal is not configured</p>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>MANATAL_API_KEY is not set on this deployment.</p>
        </div>
      )}

      {!loading && !error && state === 'not_published' && (
        <div className="empty-state">
          <Users size={22} />
          <p className="text-sm font-medium" style={{ color: 'var(--ink-soft)' }}>Not published to Manatal yet</p>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            Publish this role above and applicants will appear here as they come in.
          </p>
        </div>
      )}

      {!loading && !error && state === 'ok' && rows.length === 0 && (
        <div className="empty-state">
          <Users size={22} />
          <p className="text-sm font-medium" style={{ color: 'var(--ink-soft)' }}>No applicants yet</p>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            The role is live on Manatal. Anyone who applies through the job boards will show here.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Email</th>
                <th>Source</th>
                <th>Stage</th>
                <th>Move to</th>
                <th>Applied</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const st = stageStyle(r.stage.name);
                const isMoving = moving === r.id;
                return (
                  <tr key={r.id} style={isMoving ? { opacity: 0.6 } : undefined}>
                    <td>
                      <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>
                        {r.full_name ?? `Candidate #${r.candidate_id}`}
                      </p>
                      {!r.is_active && (
                        <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>Dropped</span>
                      )}
                    </td>
                    <td><span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{r.email ?? '—'}</span></td>
                    <td>
                      <span className="text-xs" style={{ color: r.applied ? 'var(--teal)' : 'var(--ink-faint)' }}>
                        {r.applied ? 'Applied' : 'Recruiter added'}
                      </span>
                    </td>
                    <td>
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: st.bg, color: st.text }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
                        {r.stage.name}
                      </span>
                    </td>
                    <td>
                      {isMoving ? (
                        <Loader2 size={14} className="animate-spin" style={{ color: 'var(--purple)' }} />
                      ) : (
                        <select
                          className="input text-xs py-1 px-2"
                          style={{ minWidth: 140 }}
                          value={r.stage.id}
                          aria-label={`Move ${r.full_name ?? 'candidate'} to a different stage`}
                          onChange={e => {
                            const next = stages.find(s => s.id === Number(e.target.value));
                            if (next) moveStage(r, next);
                          }}
                        >
                          {stages.length === 0 && <option value={r.stage.id}>{r.stage.name}</option>}
                          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      )}
                    </td>
                    <td>
                      <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                        {r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB') : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-[10px] shadow-lg text-sm font-medium"
          style={{ background: toast.ok ? 'var(--teal)' : 'var(--red)', color: '#fff' }}
          role="status"
        >
          {toast.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
