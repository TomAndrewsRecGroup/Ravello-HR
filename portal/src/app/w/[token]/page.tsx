import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import WorkerScanView from './WorkerScanView';

// Public, anonymous worker QR badge scan. Recognises the worker from
// the token in the URL — no login, no portal seat, the same shape as
// /test/[token], /policy/[token] and /leave/[token]. Outside the
// (portal) route group for the same reason.

export const dynamic = 'force-dynamic';

interface Props { params: Promise<{ token: string }> }

interface PreflightOk {
  ok: true;
  fullName: string;
  jobTitle: string | null;
  companyName: string | null;
  siteName: string | null;
  status: string;
  checkedIn: boolean;
}
interface PreflightError { ok: false; error: string }

async function preflight(token: string): Promise<PreflightOk | PreflightError> {
  const h = await headers();
  const host = h.get('host') ?? 'localhost:3001';
  const proto = h.get('x-forwarded-proto') ?? 'http';
  try {
    const res = await fetch(`${proto}://${host}/api/w/${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Invalid link' }));
      return { ok: false, error: data.error ?? 'Invalid link' };
    }
    return await res.json();
  } catch {
    return { ok: false, error: 'Could not reach the server' };
  }
}

export default async function WorkerQrScanPage(props: Props) {
  const params = await props.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.token)) notFound();
  const result = await preflight(params.token);

  if (!result.ok) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4" style={{ background: '#FAFAF8' }}>
        <div className="w-full max-w-[420px] text-center rounded-[20px] p-8" style={{ background: '#fff', border: '1px solid var(--line)' }}>
          <h1 className="font-display font-bold text-xl mb-2" style={{ color: '#0A0F1E' }}>Badge not recognised</h1>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            {result.error}. If this badge was reissued, ask for the new one.
          </p>
        </div>
      </main>
    );
  }

  return (
    <WorkerScanView
      token={params.token}
      fullName={result.fullName}
      jobTitle={result.jobTitle}
      companyName={result.companyName}
      siteName={result.siteName}
      status={result.status}
      initialCheckedIn={result.checkedIn}
    />
  );
}
