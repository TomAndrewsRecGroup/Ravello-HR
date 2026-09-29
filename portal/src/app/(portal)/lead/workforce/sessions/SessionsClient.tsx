'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { SESSION_STATUSES, ATTENDANCE_STATUSES, ATTENDANCE_LABELS, workforcePersonPath, WORKFORCE_BASE, type AttendanceStatus } from '@/lib/workforce/vocab';
import { validateSession, attendanceSummary, SESSION_STATUS_LABELS, type SessionStatus, dbMessage } from '@/lib/workforce/requirements';
import Link from 'next/link';
import Pill, { type Tone } from '@/components/safety/Pill';

const ATT_TONE: Record<AttendanceStatus, Tone> = {
  invited: 'neutral', attended: 'info', no_show: 'bad', passed: 'good', failed: 'bad', reschedule_required: 'warn',
};

interface CourseOpt { id: string; title: string; provider: string | null }
type Msg = { ok: boolean; text: string } | null;

/** datetime-local value (viewer's local time) → ISO timestamp, or '' */
const toIso = (local: string) => (local ? new Date(local).toISOString() : '');

// Schedule a session (training.manage).
export function CreateSessionForm({ companyId, courses }: { companyId: string; courses: CourseOpt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ course_id: '', starts: '', ends: '', capacity: '', location: '', provider: '', status: 'planned' as SessionStatus });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV(p => ({ ...p, [k]: x }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = validateSession({ course_id: v.course_id, starts_at: toIso(v.starts), ends_at: toIso(v.ends), capacity: v.capacity, location: v.location, provider: v.provider });
    if (!r.ok) { setErr(r.message); return; }
    if (v.status !== 'planned' && v.status !== 'confirmed') { setErr('A new session is planned or confirmed.'); return; }
    setBusy(true); setErr(null);
    const { data, error } = await createClient().from('training_sessions')
      .insert({ company_id: companyId, ...r.row, status: v.status }).select('id').single();
    setBusy(false);
    if (error) { setErr(dbMessage(error)); return; }
    setOpen(false);
    router.push(`${WORKFORCE_BASE}/sessions?session=${(data as { id: string }).id}`);
  }

  if (!open) return <button type="button" className="btn-cta btn-sm" style={{ minHeight: 40 }} onClick={() => setOpen(true)}><Plus size={14} /> Schedule a session</button>;
  return (
    <form onSubmit={submit} className="card p-4 space-y-3 w-full">
      <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Schedule a session</h2>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="label" htmlFor="ns-course">Course (required)</label>
          <select id="ns-course" className="input" value={v.course_id}
            onChange={e => { const c = courses.find(x => x.id === e.target.value); setV(p => ({ ...p, course_id: e.target.value, provider: p.provider || c?.provider || '' })); }}>
            <option value="">Choose…</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          {courses.length === 0 && <p className="text-xs mt-1" style={{ color: 'var(--gold)' }}>Add a course to the catalogue first.</p>}
        </div>
        <div>
          <label className="label" htmlFor="ns-start">Starts (required)</label>
          <input id="ns-start" type="datetime-local" className="input" value={v.starts} onChange={e => set('starts', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="ns-end">Ends</label>
          <input id="ns-end" type="datetime-local" className="input" value={v.ends} onChange={e => set('ends', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="ns-loc">Location</label>
          <input id="ns-loc" className="input" maxLength={300} value={v.location} onChange={e => set('location', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="ns-prov">Provider / trainer</label>
          <input id="ns-prov" className="input" maxLength={200} value={v.provider} onChange={e => set('provider', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="ns-cap">Capacity</label>
          <input id="ns-cap" className="input" inputMode="numeric" value={v.capacity} onChange={e => set('capacity', e.target.value)} placeholder="No limit" />
        </div>
        <div>
          <label className="label" htmlFor="ns-status">Status</label>
          <select id="ns-status" className="input" value={v.status} onChange={e => set('status', e.target.value as SessionStatus)}>
            <option value="planned">Planned</option><option value="confirmed">Confirmed</option>
          </select>
        </div>
      </div>
      {err && <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>{err}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn-cta btn-sm" disabled={busy}>{busy && <Loader2 size={12} className="animate-spin" />} Schedule</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

export interface AttendanceRow { id: string; person_id: string; status: AttendanceStatus; training_record_id: string | null }

// One session: its status, attendees and outcomes (spec 52-53).
export function SessionDetail({ session, companyId, attendance, people, names, canManage }: {
  session: { id: string; status: SessionStatus; capacity: number | null };
  companyId: string;
  attendance: AttendanceRow[];
  people: { id: string; full_name: string }[];
  names: Record<string, string>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [adding, setAdding] = useState('');
  const summary = attendanceSummary(attendance);
  const closed = session.status === 'cancelled';
  const already = new Set(attendance.map(a => a.person_id));
  const available = people.filter(p => !already.has(p.id));
  const full = session.capacity != null && attendance.length >= session.capacity;

  async function setSessionStatus(next: SessionStatus) {
    if (next === 'cancelled' && !window.confirm('Cancel this session? Outcomes can no longer be recorded for it.')) return;
    setBusy('status'); setMsg(null);
    const res = await createClient().from('training_sessions').update({ status: next }, COUNT_EXACT).eq('id', session.id);
    setBusy(null);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The session');
    if (!out.ok) { setMsg({ ok: false, text: out.message! }); return; }
    router.refresh();
  }

  async function addAttendee(e: React.FormEvent) {
    e.preventDefault();
    if (!adding) { setMsg({ ok: false, text: 'Choose a person to add.' }); return; }
    if (full) { setMsg({ ok: false, text: `The session is full (capacity ${session.capacity}).` }); return; }
    setBusy('add'); setMsg(null);
    const res = await createClient().from('training_attendance').insert({ company_id: companyId, session_id: session.id, person_id: adding });
    setBusy(null);
    if (res.error) { setMsg({ ok: false, text: dbMessage(res.error) }); return; }
    setAdding('');
    router.refresh();
  }

  async function setAttendance(a: AttendanceRow, next: AttendanceStatus) {
    setBusy(a.id); setMsg(null);
    const res = await createClient().from('training_attendance').update({ status: next }, COUNT_EXACT).eq('id', a.id);
    setBusy(null);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The attendance');
    if (!out.ok) { setMsg({ ok: false, text: out.message! }); return; }
    router.refresh();
  }

  async function removeAttendee(a: AttendanceRow) {
    if (!window.confirm(`Remove ${names[a.person_id] ?? 'this person'} from the session?`)) return;
    setBusy(a.id); setMsg(null);
    const res = await createClient().from('training_attendance').delete(COUNT_EXACT).eq('id', a.id);
    setBusy(null);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The removal');
    if (!out.ok) { setMsg({ ok: false, text: out.message! }); return; }
    router.refresh();
  }

  async function recordOutcomes() {
    if (!window.confirm(`Record outcomes? A training record will be created for each of the ${summary.passedWithoutRecord} people marked Passed. Nobody else gets a record.`)) return;
    setBusy('outcomes'); setMsg(null);
    const { data, error } = await createClient().rpc('training_session_record_outcomes', { p_session: session.id });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: dbMessage(error) }); return; }
    const n = Number(data ?? 0);
    setMsg({ ok: true, text: `${n} training record${n === 1 ? '' : 's'} created, awaiting verification. The session is marked completed.` });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex flex-wrap items-end gap-2 no-print">
          <div>
            <label className="label" htmlFor="sess-status">Session status</label>
            <select id="sess-status" className="input" value={session.status} disabled={busy === 'status' || closed}
              onChange={e => setSessionStatus(e.target.value as SessionStatus)}>
              {SESSION_STATUSES.map(s => <option key={s} value={s}>{SESSION_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
        </div>
      )}

      <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
        {summary.total} {summary.total === 1 ? 'attendee' : 'attendees'}{session.capacity ? ` of ${session.capacity} places` : ''}
        {ATTENDANCE_STATUSES.filter(s => summary.counts[s]).map(s => ` · ${ATTENDANCE_LABELS[s]}: ${summary.counts[s]}`).join('')}
      </p>
      {msg && <p role="status" className="text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</p>}

      {canManage && !closed && (
        <form onSubmit={addAttendee} className="flex flex-wrap items-end gap-2 no-print">
          <div className="min-w-[220px] flex-1 sm:flex-none">
            <label className="label" htmlFor="add-att">Add an attendee</label>
            <select id="add-att" className="input" value={adding} onChange={e => setAdding(e.target.value)}>
              <option value="">Choose a person…</option>
              {available.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <button type="submit" className="btn-secondary btn-sm" style={{ minHeight: 38 }} disabled={busy === 'add' || full}>
            {busy === 'add' && <Loader2 size={12} className="animate-spin" />} Add
          </button>
          {full && <span className="text-xs" style={{ color: 'var(--gold)' }}>Full</span>}
        </form>
      )}

      {attendance.length === 0 ? (
        <p className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
          Nobody is booked on this session yet. {canManage ? 'Add attendees above.' : ''}
        </p>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <caption className="sr-only">Attendance</caption>
            <thead><tr><th scope="col">Person</th><th scope="col">Attendance</th><th scope="col">Training record</th>{canManage && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>
              {attendance.map(a => (
                <tr key={a.id}>
                  <td><Link href={workforcePersonPath(a.person_id)} style={{ color: 'var(--ink)' }}>{names[a.person_id] ?? 'Person'}</Link></td>
                  <td>
                    {canManage && !closed && !a.training_record_id ? (
                      <>
                        <label className="sr-only" htmlFor={`att-${a.id}`}>Attendance for {names[a.person_id] ?? 'person'}</label>
                        <select id={`att-${a.id}`} className="input" style={{ minWidth: 150 }} value={a.status} disabled={busy === a.id}
                          onChange={e => setAttendance(a, e.target.value as AttendanceStatus)}>
                          {ATTENDANCE_STATUSES.map(s => <option key={s} value={s}>{ATTENDANCE_LABELS[s]}</option>)}
                        </select>
                      </>
                    ) : <Pill tone={ATT_TONE[a.status]}>{ATTENDANCE_LABELS[a.status]}</Pill>}
                  </td>
                  <td>{a.training_record_id ? 'Created — awaiting verification on the person\'s profile' : a.status === 'passed' ? 'Created when outcomes are recorded' : 'None (only a pass creates a record)'}</td>
                  {canManage && (
                    <td>
                      {!a.training_record_id && !closed && (
                        <button type="button" className="btn-ghost btn-sm" disabled={busy === a.id} onClick={() => removeAttendee(a)}>Remove</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && !closed && (
        <div className="card p-4 space-y-2 no-print">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Record outcomes</h3>
          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
            Creates a training record only for people marked <strong>Passed</strong>. Attending, failing, not showing or
            needing to reschedule creates no record — attendance is not completion. New records start unverified, and
            training on its own never makes anyone competent.
          </p>
          <button type="button" className="btn-cta btn-sm" disabled={busy === 'outcomes' || summary.passedWithoutRecord === 0} onClick={recordOutcomes}>
            {busy === 'outcomes' && <Loader2 size={12} className="animate-spin" />}
            Record outcomes ({summary.passedWithoutRecord} passed without a record)
          </button>
        </div>
      )}
    </div>
  );
}
