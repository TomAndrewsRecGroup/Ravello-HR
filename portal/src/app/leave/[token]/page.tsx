import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import LeaveRequestForm from './LeaveRequestForm';

// Public, anonymous leave-request page. Recognises the staff member
// from the token in the URL — no login, no portal seat consumed. The
// company's Admin or Editor reviews submissions in the portal.
//
// This page is OUTSIDE the (portal) route group, so the portal sidebar,
// onboarding redirect, and auth layout don't run.

export const dynamic = 'force-dynamic';

interface Props {
  params: { token: string };
}

interface PreflightOk {
  ok: true;
  employee:    { name: string };
  company:     { name: string };
  leave_types: string[];
}
interface PreflightError {
  ok: false;
  error: string;
  status: number;
}
type Preflight = PreflightOk | PreflightError;

async function preflight(token: string): Promise<Preflight> {
  // Hit our own GET /api/leave/[token] to validate the token + fetch
  // the minimal payload needed to render the form. Server-side fetch
  // here so we can render the form on first paint (no client-side
  // round-trip on load).
  const h = headers();
  const host = h.get('host') ?? 'localhost:3001';
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const url = `${proto}://${host}/api/leave/${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Invalid link' }));
      return { ok: false, error: data.error ?? 'Invalid link', status: res.status };
    }
    const data = await res.json();
    return { ok: true, ...data };
  } catch {
    return { ok: false, error: 'Could not reach the server', status: 500 };
  }
}

export default async function PublicLeavePage({ params }: Props) {
  // Token shape check happens in the API layer too, but bail early if
  // it's obviously wrong so we render a 404 page instead of fetching.
  if (!/^[a-f0-9]{32}$/.test(params.token)) {
    notFound();
  }

  const result = await preflight(params.token);

  if (!result.ok) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4" style={{ background: '#FAFAF8' }}>
        <div className="w-full max-w-[420px] text-center rounded-[20px] p-8" style={{ background: '#fff', border: '1px solid var(--line)' }}>
          <h1 className="font-display font-bold text-xl mb-2" style={{ color: '#0A0F1E' }}>
            Link not valid
          </h1>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            {result.error}. If your employer sent you a new link, please use that one.
          </p>
        </div>
      </main>
    );
  }

  return (
    <LeaveRequestForm
      token={params.token}
      employeeName={result.employee.name}
      companyName={result.company.name}
      leaveTypes={result.leave_types}
    />
  );
}
