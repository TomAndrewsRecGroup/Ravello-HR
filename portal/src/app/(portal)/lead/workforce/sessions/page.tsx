import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { getWorkforceContext } from '@/lib/workforce/context';
import { param, fmtDateTime } from '@/lib/hs/safetyContext';
import { readAllPages } from '@/lib/supabase/paged';
import { SESSION_STATUSES, WORKFORCE_BASE } from '@/lib/workforce/vocab';
import { SESSION_STATUS_LABELS, type SessionStatus } from '@/lib/workforce/requirements';
import FilterForm from '@/components/safety/FilterForm';
import SafetyEmpty from '@/components/safety/SafetyEmpty';
import Pill, { type Tone } from '@/components/safety/Pill';
import { CreateSessionForm, SessionDetail, type AttendanceRow } from './SessionsClient';

export const metadata: Metadata = { title: 'Training sessions' };
export const dynamic = 'force-dynamic';

const LIMIT = 500;
const BASE = `${WORKFORCE_BASE}/sessions`;
const TONE: Record<SessionStatus, Tone> = { planned: 'info', confirmed: 'good', completed: 'muted', cancelled: 'muted' };

interface Session {
  id: string; course_id: string; provider: string | null; starts_at: string; ends_at: string | null;
  location: string | null; capacity: number | null; status: SessionStatus;
}

// Training sessions (spec 52-53): scheduling, attendance, and outcomes.
// Reading needs nothing beyond the organisation; every write needs
// training.manage (RLS + 134's guard decide). Only a PASS creates a
// training record, through training_session_record_outcomes().
export default async function SessionsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const ctx = await getWorkforceContext();
  const { supabase, companyId } = ctx;
  if (!companyId) return <main className="portal-page flex-1"><p className="card p-4 text-sm">No organisation is selected.</p></main>;
  const f = { status: param(sp, 'status'), course: param(sp, 'course') };
  const sessionId = param(sp, 'session');
  const manage = ctx.can('training.manage');

  let q = supabase.from('training_sessions')
    .select('id, course_id, provider, starts_at, ends_at, location, capacity, status', { count: 'exact' })
    .eq('company_id', companyId);
  if (f.status && (SESSION_STATUSES as readonly string[]).includes(f.status)) q = q.eq('status', f.status);
  if (f.course) q = q.eq('course_id', f.course);

  const [{ data, count, error }, coursesRes, attCounts] = await Promise.all([
    q.order('starts_at', { ascending: false }).limit(LIMIT),
    supabase.from('training_courses').select('id, title, provider, active_status')
      .or(`company_id.is.null,company_id.eq.${companyId}`).order('title').limit(999),
    readAllPages<{ session_id: string }>((from, to) =>
      supabase.from('training_attendance').select('id, session_id').eq('company_id', companyId).order('id').range(from, to)),
  ]);
  const sessions = (data ?? []) as Session[];
  const courses = (coursesRes.data ?? []) as { id: string; title: string; provider: string | null; active_status: string }[];
  const courseName = new Map(courses.map(c => [c.id, c.title]));
  const booked = new Map<string, number>();
  for (const a of attCounts.rows) booked.set(a.session_id, (booked.get(a.session_id) ?? 0) + 1);

  // The selected session, loaded separately so it shows even when filtered out of the list.
  let detail: React.ReactNode = null;
  if (/^[0-9a-f-]{36}$/i.test(sessionId)) {
    const [sRes, aRes, pRes] = await Promise.all([
      supabase.from('training_sessions').select('id, course_id, provider, starts_at, ends_at, location, capacity, status')
        .eq('id', sessionId).eq('company_id', companyId).maybeSingle(),
      supabase.from('training_attendance').select('id, person_id, status, training_record_id')
        .eq('session_id', sessionId).eq('company_id', companyId).order('created_at').limit(999),
      supabase.from('people').select('id, full_name').eq('company_id', companyId).eq('active_status', 'active').order('full_name').limit(999),
    ]);
    const s = sRes.data as Session | null;
    const attendance = (aRes.data ?? []) as AttendanceRow[];
    const people = (pRes.data ?? []) as { id: string; full_name: string }[];
    const names: Record<string, string> = Object.fromEntries(people.map(p => [p.id, p.full_name]));
    const missing = attendance.map(a => a.person_id).filter(id => !names[id]);
    if (missing.length) {
      const { data: extra } = await supabase.from('people').select('id, full_name').in('id', missing).limit(999);
      for (const p of (extra ?? []) as { id: string; full_name: string }[]) names[p.id] = p.full_name;
    }
    detail = !s ? (
      <p className="card p-4 text-sm" role="alert" style={{ color: 'var(--red)' }}>That session was not found in this organisation.</p>
    ) : (
      <section className="card p-5 space-y-4" aria-labelledby="session-h">
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex-1 min-w-[220px]">
            <h2 id="session-h" className="font-semibold" style={{ color: 'var(--ink)' }}>{courseName.get(s.course_id) ?? 'Course'}</h2>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              {fmtDateTime(s.starts_at)}{s.ends_at ? ` – ${fmtDateTime(s.ends_at)}` : ''}
              {s.location ? ` · ${s.location}` : ''}{s.provider ? ` · ${s.provider}` : ''}
            </p>
          </div>
          <Pill tone={TONE[s.status]}>{SESSION_STATUS_LABELS[s.status]}</Pill>
          <Link href={BASE} className="btn-ghost btn-sm">Close</Link>
        </div>
        {(aRes.error || pRes.error) && <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>Attendance could not be fully loaded. Refresh to try again.</p>}
        <SessionDetail session={{ id: s.id, status: s.status, capacity: s.capacity }} companyId={companyId}
          attendance={attendance} people={people} names={names} canManage={manage} />
      </section>
    );
  }

  return (
    <main className="portal-page flex-1 space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <p className="text-sm flex-1 min-w-[240px]" style={{ color: 'var(--ink-soft)' }}>
          Scheduled training: who is booked, who attended, and who passed. A pass creates a training record; nothing else does.
        </p>
        {manage && <CreateSessionForm companyId={companyId} courses={courses.filter(c => c.active_status === 'active').map(c => ({ id: c.id, title: c.title, provider: c.provider }))} />}
      </div>

      {detail}

      <FilterForm fields={[
        { name: 'status', label: 'Status', value: f.status, options: SESSION_STATUSES.map(s => ({ value: s, label: SESSION_STATUS_LABELS[s] })) },
        { name: 'course', label: 'Course', value: f.course, options: courses.map(c => ({ value: c.id, label: c.title })) },
      ]} />

      {(error || attCounts.error) && <p role="alert" className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Sessions could not be fully loaded. Refresh to try again.</p>}
      {(count ?? 0) > LIMIT && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Showing the {LIMIT} most recent of {count}. Narrow the filters to see the rest.</p>}

      {sessions.length === 0 ? (
        <SafetyEmpty icon={CalendarDays} title="No training sessions"
          text={f.status || f.course ? 'Nothing matches these filters.' : manage ? 'Schedule a session for a course in the catalogue, then book people onto it.' : 'Sessions scheduled for this organisation appear here.'} />
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <caption className="sr-only">Training sessions</caption>
            <thead>
              <tr><th scope="col">Course</th><th scope="col">When</th><th scope="col">Location</th><th scope="col">Provider / trainer</th>
                <th scope="col">Booked</th><th scope="col">Status</th></tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id} aria-current={s.id === sessionId ? 'true' : undefined}>
                  <td><Link href={`${BASE}?session=${s.id}`} style={{ color: 'var(--ink)' }} className="font-medium">{courseName.get(s.course_id) ?? 'Course'}</Link></td>
                  <td className="whitespace-nowrap">{fmtDateTime(s.starts_at)}</td>
                  <td>{s.location ?? '—'}</td>
                  <td>{s.provider ?? '—'}</td>
                  <td>{booked.get(s.id) ?? 0}{s.capacity ? ` / ${s.capacity}` : ''}</td>
                  <td><Pill tone={TONE[s.status]}>{SESSION_STATUS_LABELS[s.status]}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
