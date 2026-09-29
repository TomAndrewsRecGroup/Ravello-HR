import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { redirect } from 'next/navigation';
import { requirePortfolioSession } from '@/lib/consultancy/portfolioAccess';
import { loadPortfolioCalendar } from '@/lib/consultancy/loadPortfolioCalendar';
import type { PortfolioCalendarEventType } from '@/lib/consultancy/portfolioCalendar';

export const metadata: Metadata = { title: 'Cross-Client Calendar' };
export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<PortfolioCalendarEventType, string> = {
  visit: 'Visit', audit: 'Audit', legal_review: 'Legal review', management_review: 'Management review',
  training_expiry: 'Training expiry', document_review: 'Document review', roadmap_milestone: 'Roadmap milestone',
  material_expiry: 'Material expiry',
};

const monthKey = (d: string) => d.slice(0, 7);
const monthLabel = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

// Core-OS 360 Phase 6, section 7. A month-grouped list, the same
// posture admin's own Governance Calendar takes ("no interactive
// calendar widget needed, per the task's own scope note") — the eight
// source tables have genuinely different shapes, and nothing here
// needs to run inside a policy or a trigger, where only SQL would do.
export default async function PortfolioCalendarPage() {
  const portfolio = await requirePortfolioSession();
  if (!portfolio) redirect('/dashboard');

  const events = await loadPortfolioCalendar(portfolio);
  const byMonth = new Map<string, typeof events>();
  for (const e of events) {
    const k = monthKey(e.date);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k)!.push(e);
  }
  const months = [...byMonth.keys()].sort();

  return (
    <main className="portal-page flex-1 space-y-4">
      <div>
        <h1 className="text-xl font-display font-semibold" style={{ color: 'var(--ink)' }}>Cross-Client Calendar</h1>
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>{events.length} upcoming item{events.length === 1 ? '' : 's'} across your authorised clients</p>
      </div>

      {months.length === 0 ? (
        <div className="card p-12"><div className="empty-state"><CalendarDays size={28} style={{ color: 'var(--blue)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>Nothing scheduled.</p></div></div>
      ) : (
        months.map(m => (
          <section key={m} className="card p-4 space-y-2">
            <h2 className="font-display font-bold text-xs uppercase tracking-widest" style={{ color: 'var(--purple)' }}>{monthLabel(m)}</h2>
            <ul className="text-sm space-y-1" style={{ color: 'var(--ink-soft)' }}>
              {byMonth.get(m)!.map((e, i) => (
                <li key={i} className="flex items-center gap-2 flex-wrap">
                  <span className="badge">{TYPE_LABEL[e.type]}</span>
                  <span>{new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                  <span>—</span>
                  <span>{e.clientName}</span>
                  <span>—</span>
                  <span>{e.title}</span>
                  <Link href={`/open-workspace?org=${e.clientOrganisationId}&next=${encodeURIComponent(e.link)}`} className="underline ml-auto">Open</Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
