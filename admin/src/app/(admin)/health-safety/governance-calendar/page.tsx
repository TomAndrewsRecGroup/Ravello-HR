import type { Metadata } from 'next';
import Link from 'next/link';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { governanceCalendarEvents, groupByMonth, type GovernanceCalendarEventType } from '@/lib/governance/calendar';

export const metadata: Metadata = { title: 'Governance calendar' };
export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<GovernanceCalendarEventType, string> = {
  audit_programme:            'Planned audit',
  management_review:          'Management review',
  objective_target:           'Objective target',
  legal_obligation_review:    'Legal register review',
  hs_document_review:         'Document review',
  environmental_permit_expiry:'Environmental permit expiry',
  permit_condition_review:    'Permit condition review',
  iso_certification_expiry:   'ISO certificate expiry',
};

const fmtMonth = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// Core-OS 360 Phase 5, Group 7 (migration 162): a READ-TIME AGGREGATE
// over several existing dated tables — never a new events/scheduling
// table. See lib/governance/calendar.ts for the full list of sources
// and why this is computed in TypeScript rather than one SQL view. A
// simple month-grouped list is sufficient — no interactive calendar
// widget needed.
export default async function GovernanceCalendarPage() {
  const supabase = await createServerSupabaseClient();
  const [{ data: companies }] = await Promise.all([
    supabase.from('companies').select('id, name').eq('active', true).order('name'),
  ]);
  const companyNames = new Map(((companies ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]));

  const today = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 180 * 86_400_000).toISOString().slice(0, 10);
  const events = await governanceCalendarEvents(supabase, { from: today, to });
  const months = groupByMonth(events);

  return (
    <>
      <AdminTopbar title="Governance calendar" subtitle="Every planned audit, review, target and expiry across every client, in one place — the next 6 months" />
      <main className="admin-page flex-1 space-y-5">
        {events.length === 0 ? (
          <div className="card p-12"><div className="empty-state"><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>Nothing due in the next 6 months across any client.</p></div></div>
        ) : (
          months.map(({ month, events: monthEvents }) => (
            <div key={month} className="card p-4">
              <h2 className="font-display font-semibold mb-3" style={{ color: 'var(--ink)' }}>{fmtMonth(month)}</h2>
              <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
                {monthEvents.map((e, i) => (
                  <li key={`${e.type}-${e.company_id}-${i}`} className="py-2.5 flex items-center gap-3">
                    <span className="text-xs w-28 shrink-0" style={{ color: 'var(--ink-faint)' }}>{fmtDay(e.date)}</span>
                    <span className="badge shrink-0" style={{ color: 'var(--ink-soft)' }}>{TYPE_LABEL[e.type]}</span>
                    <span className="flex-1 text-sm" style={{ color: 'var(--ink)' }}>{e.title}</span>
                    <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{companyNames.get(e.company_id) ?? e.company_id}</span>
                    <Link href={e.adminLink} className="text-xs font-medium" style={{ color: 'var(--purple)' }}>Open</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </main>
    </>
  );
}
