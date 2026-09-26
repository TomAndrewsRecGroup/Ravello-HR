'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, CheckCircle2, Loader2, Mail, Send, X, XCircle } from 'lucide-react';
import { useToast } from '@/components/modules/Toast';
import { HS_TEST_SOURCE_TYPE_LABELS } from '@/lib/hs/vocab';
import type { HsTest, HsTestAssignment, HsTestSession, HsTestSubmission } from '@/lib/hs/testTypes';

interface CompanyRef { id: string; name: string }
interface EmployeeRef { id: string; company_id: string; full_name: string }

interface Props {
  test: HsTest;
  companies: CompanyRef[];
  employees: EmployeeRef[];
  sessions: HsTestSession[];
  assignments: HsTestAssignment[];
  submissions: HsTestSubmission[];
}

export default function TestDetailClient({ test, companies, employees, sessions, assignments, submissions }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [sessionOpen, setSessionOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [logFor, setLogFor] = useState<HsTestAssignment | null>(null);

  const [sTitle, setSTitle] = useState(`${test.title} — ${new Date().toLocaleDateString('en-GB')}`);
  const [sDate, setSDate] = useState('');
  const [sNotes, setSNotes] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openCompany, setOpenCompany] = useState<string | null>(companies[0]?.id ?? null);

  const employeesByCompany = useMemo(() => {
    const m = new Map<string, EmployeeRef[]>();
    for (const e of employees) m.set(e.company_id, [...(m.get(e.company_id) ?? []), e]);
    return m;
  }, [employees]);
  const employeeById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const companyById = useMemo(() => new Map(companies.map(c => [c.id, c])), [companies]);
  const submissionByAssignment = useMemo(() => new Map(submissions.map(s => [s.assignment_id, s])), [submissions]);
  const sessionById = useMemo(() => new Map(sessions.map(s => [s.id, s])), [sessions]);

  function toggleEmployee(id: string) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function createSession() {
    if (!sTitle.trim() || selected.size === 0) { toast('Pick a session title and at least one person', 'error'); return; }
    setBusy(true);
    const cohort = [...selected].map(id => ({ company_id: employeeById.get(id)!.company_id, employee_id: id }));
    const res = await fetch(`/api/admin/hs/tests/${test.id}/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: sTitle.trim(), scheduled_on: sDate || null, notes: sNotes.trim() || null, cohort }),
    });
    setBusy(false);
    const json = await res.json();
    if (!res.ok) { toast(json.error ?? 'Failed to create session', 'error'); return; }
    const t = json.tally as Record<string, number>;
    toast(`Sent ${t.sent} invite${t.sent === 1 ? '' : 's'}${t.no_email ? `, ${t.no_email} had no email on file` : ''}${t.failed ? `, ${t.failed} failed to send` : ''}`, t.sent > 0 ? 'success' : 'error');
    setSessionOpen(false); setSelected(new Set()); setSNotes(''); setSDate('');
    router.refresh();
  }

  async function resend(a: HsTestAssignment) {
    setBusyId(a.id);
    const res = await fetch(`/api/admin/hs/test-assignments/${a.id}/resend`, { method: 'POST' });
    setBusyId(null);
    const json = await res.json();
    if (!res.ok) { toast(json.error ?? 'Could not resend', 'error'); return; }
    toast('Link resent', 'success');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="card p-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{test.description || 'No description.'}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="badge">{HS_TEST_SOURCE_TYPE_LABELS[test.source_type]}</span>
            {test.category && <span className="badge">{test.category}</span>}
            {test.source_type === 'built_in' && <span className="badge">Pass mark {test.pass_mark}%</span>}
            {test.certifies_training && <span className="badge">Logs training record{test.recert_months ? ` · ${test.recert_months}mo` : ''}</span>}
          </div>
        </div>
        <button className="btn-cta btn-sm flex items-center gap-1.5" onClick={() => setSessionOpen(true)}>
          <CalendarPlus size={14} /> New session
        </button>
      </div>

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th><th>Client</th><th>Session</th><th>Status</th><th>Result</th><th></th>
            </tr>
          </thead>
          <tbody>
            {assignments.map(a => {
              const emp = employeeById.get(a.employee_id);
              const co = companyById.get(a.company_id);
              const sub = submissionByAssignment.get(a.id);
              const sess = a.session_id ? sessionById.get(a.session_id) : null;
              return (
                <tr key={a.id}>
                  <td>{emp?.full_name ?? 'Unknown'}</td>
                  <td>{co?.name ?? '—'}</td>
                  <td>{sess?.title ?? '—'}</td>
                  <td><span className="badge">{a.status === 'completed' ? 'Completed' : 'Pending'}</span></td>
                  <td>
                    {sub ? (
                      <span className="flex items-center gap-1.5" style={{ color: sub.passed ? 'var(--success)' : 'var(--danger)' }}>
                        {sub.passed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                        {sub.passed ? 'Passed' : 'Failed'}{sub.score != null ? ` (${sub.score}%)` : ''}
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    {a.status === 'pending' && (
                      <div className="flex items-center gap-2 justify-end">
                        <button className="btn-secondary btn-sm flex items-center gap-1" disabled={busyId === a.id} onClick={() => resend(a)}>
                          {busyId === a.id ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} Resend
                        </button>
                        {test.source_type !== 'built_in' && (
                          <button className="btn-cta btn-sm" onClick={() => setLogFor(a)}>Log result</button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {assignments.length === 0 && (
              <tr><td colSpan={6} className="empty-state">No one has been invited to this test yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {sessionOpen && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(7,11,32,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget && !busy) setSessionOpen(false); }}>
          <div className="card p-0 w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ background: 'var(--surface)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
              <h3 className="font-display font-semibold text-base" style={{ color: 'var(--ink)' }}>New test session</h3>
              <button className="btn-icon" onClick={() => !busy && setSessionOpen(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Session title *</label>
                <input className="input" value={sTitle} onChange={e => setSTitle(e.target.value)} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Date</label>
                  <input className="input" type="date" value={sDate} onChange={e => setSDate(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input" rows={2} value={sNotes} onChange={e => setSNotes(e.target.value)} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Cohort — {selected.size} selected</label>
                </div>
                <div className="rounded-lg max-h-72 overflow-y-auto" style={{ border: '1px solid var(--line)' }}>
                  {companies.map(c => {
                    const emps = employeesByCompany.get(c.id) ?? [];
                    return (
                      <div key={c.id} style={{ borderBottom: '1px solid var(--line)' }}>
                        <button
                          className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-left"
                          style={{ color: 'var(--ink)', background: 'var(--surface-soft)' }}
                          onClick={() => setOpenCompany(openCompany === c.id ? null : c.id)}
                        >
                          {c.name} ({emps.length})
                        </button>
                        {openCompany === c.id && (
                          <div className="p-2 space-y-1">
                            {emps.map(e => (
                              <label key={e.id} className="flex items-center gap-2 px-2 py-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
                                <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleEmployee(e.id)} />
                                {e.full_name}
                              </label>
                            ))}
                            {emps.length === 0 && <p className="text-xs px-2 py-1" style={{ color: 'var(--ink-faint)' }}>No employees on record.</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--line)' }}>
              <button className="btn-secondary btn-sm" onClick={() => setSessionOpen(false)} disabled={busy}>Cancel</button>
              <button className="btn-cta btn-sm flex items-center gap-2" onClick={createSession} disabled={busy}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send {selected.size || ''} invite{selected.size === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}

      {logFor && (
        <LogResultModal
          assignment={logFor}
          employeeName={employeeById.get(logFor.employee_id)?.full_name ?? 'this person'}
          onClose={() => setLogFor(null)}
          onSaved={() => { setLogFor(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function LogResultModal({ assignment, employeeName, onClose, onSaved }: {
  assignment: HsTestAssignment; employeeName: string; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [passed, setPassed] = useState<'pass' | 'fail' | ''>('');
  const [score, setScore] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!passed) { toast('Choose pass or fail', 'error'); return; }
    setBusy(true);
    const res = await fetch(`/api/admin/hs/test-assignments/${assignment.id}/log`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passed: passed === 'pass', score: score ? Number(score) : null, notes: notes.trim() || null }),
    });
    setBusy(false);
    const json = await res.json();
    if (!res.ok) { toast(json.error ?? 'Could not save', 'error'); return; }
    toast('Result logged', 'success');
    onSaved();
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[210] flex items-center justify-center p-4"
      style={{ background: 'rgba(7,11,32,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="card p-6 w-full max-w-md" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-base" style={{ color: 'var(--ink)' }}>Log result — {employeeName}</h3>
          <button className="btn-icon" onClick={() => !busy && onClose()} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 text-sm"><input type="radio" name="passed" checked={passed === 'pass'} onChange={() => setPassed('pass')} /> Pass</label>
            <label className="flex items-center gap-1.5 text-sm"><input type="radio" name="passed" checked={passed === 'fail'} onChange={() => setPassed('fail')} /> Fail</label>
          </div>
          <div>
            <label className="label">Score % (optional)</label>
            <input className="input" type="number" min={0} max={100} value={score} onChange={e => setScore(e.target.value)} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-5">
          <button className="btn-secondary btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-cta btn-sm flex items-center gap-2" onClick={save} disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Save
          </button>
        </div>
      </div>
    </div>
  );
}
