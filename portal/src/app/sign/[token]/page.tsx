import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import SignClient from './SignClient';

// Public, anonymous e-signature page. Recognises the employee from the
// token in the URL — no login, no portal seat. Outside the (portal)
// route group, the exact /policy/[token] shape.

export const dynamic = 'force-dynamic';

interface Props { params: Promise<{ token: string }> }

interface PreflightOk {
  ok: true;
  employee: { name: string };
  company: { name: string };
  document: { title: string; body: string };
  status: string;
  signed_at: string | null;
  signed_by_name: string | null;
  declined_at: string | null;
}
interface PreflightError { ok: false; error: string; status: number }

async function preflight(token: string): Promise<PreflightOk | PreflightError> {
  const h = await headers();
  const host = h.get('host') ?? 'localhost:3001';
  const proto = h.get('x-forwarded-proto') ?? 'http';
  try {
    const res = await fetch(`${proto}://${host}/api/sign/${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Invalid link' }));
      return { ok: false, error: data.error ?? 'Invalid link', status: res.status };
    }
    return { ok: true, ...(await res.json()) };
  } catch {
    return { ok: false, error: 'Could not reach the server', status: 500 };
  }
}

export default async function PublicSignPage(props: Props) {
  const params = await props.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.token)) notFound();
  const result = await preflight(params.token);

  if (!result.ok) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4" style={{ background: '#FAFAF8' }}>
        <div className="w-full max-w-[420px] text-center rounded-[20px] p-8" style={{ background: '#fff', border: '1px solid var(--line)' }}>
          <h1 className="font-display font-bold text-xl mb-2" style={{ color: '#0A0F1E' }}>Link not valid</h1>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{result.error}. If you were sent a new link, please use that one.</p>
        </div>
      </main>
    );
  }

  return (
    <SignClient
      token={params.token}
      employeeName={result.employee.name}
      companyName={result.company.name}
      document={result.document}
      status={result.status}
      signedAt={result.signed_at}
      signedByName={result.signed_by_name}
      declinedAt={result.declined_at}
    />
  );
}
