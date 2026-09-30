import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePortfolioSession } from '@/lib/consultancy/portfolioAccess';
import { loadBoardAssuranceStatus } from '@/lib/consultancy/loadBoardAssuranceStatus';
import type { BoardAssuranceBucket, ClientBoardAssuranceStatus } from '@/lib/consultancy/boardAssuranceStatus';

export const metadata: Metadata = { title: 'Board Assurance — Command Centre' };
export const dynamic = 'force-dynamic';

const BUCKET_LABEL: Record<BoardAssuranceBucket, string> = { current: 'Current', overdue: 'Overdue', missing: 'Missing' };
const BUCKET_COLOR: Record<BoardAssuranceBucket, string> = { current: 'var(--teal)', overdue: 'var(--gold)', missing: 'var(--red)' };
const BUCKET_ORDER: BoardAssuranceBucket[] = ['missing', 'overdue', 'current'];

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Core-OS 360 Completion Programme, Phase 27, Group 2 (gap-ledger row
// C13.6). A cross-client consultant view of Board Assurance posture —
// no consultancy surface reads board_assurance_reports anywhere else
// in the product today (checked live before building this: zero
// references in portal/src/app/(portal)/consultancy/ or
// portal/src/lib/consultancy/). Drilldown is Client 360, which itself
// gains its own per-client summary card in this same group.
export default async function ConsultancyBoardAssurancePage() {
  const portfolio = await requirePortfolioSession();
  if (!portfolio) redirect('/dashboard');

  let statuses: ClientBoardAssuranceStatus[];
  let loadError: string | null = null;
  try {
    statuses = await loadBoardAssuranceStatus(portfolio);
  } catch (e) {
    statuses = [];
    loadError = e instanceof Error ? e.message : 'Could not load board assurance status.';
  }

  const byBucket = new Map<BoardAssuranceBucket, typeof statuses>();
  for (const b of BUCKET_ORDER) byBucket.set(b, []);
  for (const s of statuses) byBucket.get(s.bucket)!.push(s);

  return (
    <main className="portal-page flex-1 space-y-4">
      <div>
        <h1 className="text-xl font-display font-semibold" style={{ color: 'var(--ink)' }}>Board Assurance</h1>
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
          {statuses.length} authorised client{statuses.length === 1 ? '' : 's'} — which boards are current, overdue, or have never had a report.
        </p>
      </div>

      {loadError && <p className="card p-4 text-sm" style={{ color: 'var(--red)' }}>{loadError}</p>}

      {!loadError && statuses.length === 0 && (
        <div className="card empty-state p-10"><p style={{ color: 'var(--ink-faint)' }}>No authorised clients yet.</p></div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {BUCKET_ORDER.map(bucket => (
          <section key={bucket} className="card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>{BUCKET_LABEL[bucket]}</h2>
              <span className="badge" style={{ background: BUCKET_COLOR[bucket], color: 'white' }}>{byBucket.get(bucket)!.length}</span>
            </div>
            {byBucket.get(bucket)!.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>None.</p>
            ) : (
              <ul className="text-sm space-y-1.5">
                {byBucket.get(bucket)!.map(s => (
                  <li key={s.organisationId}>
                    <Link href={`/consultancy/clients/${s.organisationId}`} className="underline" style={{ color: 'var(--ink)' }}>
                      {s.organisationName}
                    </Link>
                    {s.deteriorating && (
                      <span className="text-xs ml-2" style={{ color: 'var(--red)' }}>deteriorating</span>
                    )}
                    {s.latestIssued && (
                      <span className="text-xs ml-2" style={{ color: 'var(--ink-faint)' }}>
                        last issued Q{s.latestIssued.quarter} {s.latestIssued.year} ({fmt(s.latestIssued.issuedAt)})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
