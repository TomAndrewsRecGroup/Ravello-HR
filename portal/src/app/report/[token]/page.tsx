import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { ExternalLink } from 'lucide-react';

// Public, anonymous shared-report viewing page (go-live gap list, item
// 7). Recognises the report from the token in the URL — no login, no
// portal seat. This page is OUTSIDE the (portal) route group, so the
// sidebar, onboarding redirect and auth layout do not run. Same shape
// as /policy/[token] and /test/[token].

export const dynamic = 'force-dynamic';

interface Props { params: Promise<{ token: string }> }

interface PreflightOk {
  ok: true;
  company: { name: string };
  report: { title: string; period: string | null; narrative: string | null; url: string | null };
  recipientNote: string | null;
}
interface PreflightError { ok: false; error: string; status: number }

async function preflight(token: string): Promise<PreflightOk | PreflightError> {
  const h = await headers();
  const host = h.get('host') ?? 'localhost:3001';
  const proto = h.get('x-forwarded-proto') ?? 'http';
  try {
    const res = await fetch(`${proto}://${host}/api/report/${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Invalid link' }));
      return { ok: false, error: data.error ?? 'Invalid link', status: res.status };
    }
    return { ok: true, ...(await res.json()) };
  } catch {
    return { ok: false, error: 'Could not reach the server', status: 500 };
  }
}

export default async function PublicReportPage(props: Props) {
  const params = await props.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.token)) notFound();
  const result = await preflight(params.token);

  if (!result.ok) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4" style={{ background: '#FAFAF8' }}>
        <div className="w-full max-w-[420px] text-center rounded-[20px] p-8" style={{ background: '#fff', border: '1px solid var(--line)' }}>
          <h1 className="font-display font-bold text-xl mb-2" style={{ color: '#0A0F1E' }}>Link not valid</h1>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{result.error}. Ask whoever shared this link to send a new one.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: '#FAFAF8' }}>
      <div className="w-full max-w-[560px] rounded-[20px] p-8" style={{ background: '#fff', border: '1px solid var(--line)' }}>
        <p className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--ink-faint)' }}>
          Shared by {result.company.name}
        </p>
        <h1 className="font-display font-bold text-xl mb-1" style={{ color: '#0A0F1E' }}>{result.report.title}</h1>
        {result.report.period && (
          <p className="text-sm mb-4" style={{ color: 'var(--ink-soft)' }}>{result.report.period}</p>
        )}
        {result.recipientNote && (
          <p className="text-xs mb-4" style={{ color: 'var(--ink-faint)' }}>Shared with: {result.recipientNote}</p>
        )}
        {result.report.narrative && (
          <p className="text-sm mb-6 whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{result.report.narrative}</p>
        )}
        {result.report.url ? (
          <a
            href={result.report.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-cta flex items-center justify-center gap-1.5 w-fit"
          >
            Open report <ExternalLink size={14} />
          </a>
        ) : (
          <p className="text-sm" style={{ color: 'var(--red)' }}>This report has no file attached.</p>
        )}
      </div>
    </main>
  );
}
