import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePortfolioSession, portfolioIncludes, createServiceSupabaseClient } from '@/lib/consultancy/portfolioAccess';
import { SERVICE_LEDGER_ENTRY_TYPE_LABELS, SERVICE_TYPE_LABELS, VISIT_STATUS_LABELS } from '@/lib/consultancy/vocab';
import type { ConsultancyServiceLedgerEntry, ConsultancyServiceScope, ConsultancyVisit } from '@/lib/consultancy/types';
import { buildCommunicationTimeline, type CommunicationKind, type CommunicationVisibility } from '@/lib/consultancy/communicationTimeline';
import { classifyBoardAssuranceStatus, type BoardAssuranceBucket, type BoardAssuranceReportSummaryRow } from '@/lib/consultancy/boardAssuranceStatus';
import FilterForm from '@/components/safety/FilterForm';
import ClientActionForms from './ClientActionForms';
import { auditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Client 360 — ${id.slice(0, 8)}` };
}

const TIMELINE_PAGE_SIZE = 20;

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Core-OS 360 Phase 6, section 4: the Client 360 view — a consultant
// cockpit for ONE authorised client, reachable without switching the
// active organisation (portfolio-wide, the exact pattern 168/169's own
// probes established). Internal-only consultancy notes never appear
// here: nothing this page reads is a client-authored free-text field
// beyond what the client's own portal pages already show them.
export default async function ClientCockpitPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string; visibility?: string; page?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const portfolio = await requirePortfolioSession();
  if (!portfolio) redirect('/dashboard');
  if (!portfolioIncludes(portfolio.organisations, id)) notFound();

  const org = portfolio.organisations.find(o => o.organisation_id === id)!;
  const sb = createServiceSupabaseClient();

  // Core-OS 360 Phase 6, Group 7 (section 13): consultancy.client_accessed
  // fires once per Client 360 view — inherently app-level, since a page
  // view is not a database write and has no audit_row trigger to ride.
  // Fire-and-forget, per auditLog()'s own contract: never fail or slow
  // down the page render it records.
  auditLog({
    action: 'consultancy.client_accessed',
    actor_id: portfolio.session.userId,
    target_id: id,
    target_type: 'companies',
    organisation_id: id,
  });

  const [
    { data: company }, { data: snapshot }, { data: scopes }, { data: visits },
    { data: ledger }, { data: milestones }, { data: serviceRequests }, { data: documents },
    { data: valueReports }, { data: emails }, { data: broadcasts }, { data: visitReports },
    { data: boardAssuranceRows },
  ] = await Promise.all([
    sb.from('companies').select('id, name, sector, contact_email, active').eq('id', id).maybeSingle(),
    sb.from('client_health_snapshots').select('*').eq('company_id', id).order('snapshot_date', { ascending: false }).limit(1).maybeSingle(),
    sb.from('consultancy_service_scopes').select('*').eq('client_organisation_id', id).eq('status', 'active').order('start_date', { ascending: false }).limit(20),
    sb.from('consultancy_visits').select('*').eq('client_organisation_id', id).order('scheduled_date', { ascending: false }).limit(10),
    sb.from('consultancy_service_ledger').select('*').eq('client_organisation_id', id).order('occurred_at', { ascending: false }).limit(15),
    sb.from('milestones').select('id, title, status, quarter, due_date, pillar').eq('company_id', id).order('due_date', { ascending: true }).limit(10),
    sb.from('service_requests').select('id, subject, status, priority, created_at, responded_at').eq('company_id', id).order('created_at', { ascending: false }).limit(10),
    sb.from('hs_documents').select('id, title, status, review_due_at').eq('company_id', id).eq('status', 'active').order('review_due_at', { ascending: true }).limit(10),
    // Core-OS 360 Phase 6, section 10: read-only — narrative is
    // written only from admin's /value-reports page (ValueReportClient.tsx);
    // this page never inserts or updates `reports`.
    sb.from('reports').select('id, title, period, narrative, created_at').eq('company_id', id).order('created_at', { ascending: false }).limit(10),
    // Core-OS 360 Phase 6, section 11: Communication Timeline sources.
    // email_log only ever records mail actually sent to a company/
    // candidate/athlete contact (never an internal staff notification,
    // which goes through notify() instead), so target_type='company'
    // scoped to this company_id is exactly the client-facing mail.
    sb.from('email_log').select('id, subject, to_email, sent_at').eq('company_id', id).eq('target_type', 'company').order('sent_at', { ascending: false }).limit(20),
    sb.from('actions').select('id, title, created_at').eq('company_id', id).eq('created_by_admin', true).order('created_at', { ascending: false }).limit(20),
    // Core-OS 360 Completion Programme, Phase 24, Group 5 (C6.15): only
    // ISSUED visit reports are a communication event — a draft sitting
    // unpublished is not something the client has been told about yet.
    sb.from('consultancy_visit_reports').select('id, version, issued_at').eq('client_organisation_id', id).eq('status', 'issued').order('issued_at', { ascending: false }).limit(20),
    // Core-OS 360 Completion Programme, Phase 27, Group 2 (C13.6). One
    // company's own history is always small (quarterly cadence) — no
    // readAllPages needed here the way the cross-client dashboard's
    // own loader needs it for the whole portfolio at once.
    sb.from('board_assurance_reports').select('company_id, year, quarter, status, issued_at, report_data').eq('company_id', id).limit(200),
  ]);

  const s = snapshot as any;

  const boardAssuranceInput: BoardAssuranceReportSummaryRow[] = ((boardAssuranceRows ?? []) as any[]).map(r => ({
    company_id: r.company_id, year: r.year, quarter: r.quarter, status: r.status, issued_at: r.issued_at,
    overall_band: r.report_data?.overallBand ?? 'green', trend: r.report_data?.trend ?? null,
  }));
  const [boardAssurance] = classifyBoardAssuranceStatus([{ organisation_id: id, name: org.name }], boardAssuranceInput, new Date());
  const BUCKET_LABEL: Record<BoardAssuranceBucket, string> = { current: 'Current', overdue: 'Overdue', missing: 'Missing' };
  const BUCKET_COLOR: Record<BoardAssuranceBucket, string> = { current: 'var(--teal)', overdue: 'var(--gold)', missing: 'var(--red)' };

  // The manual ledger entries feed the timeline too — reusing the
  // already-fetched `ledger` rows rather than a second query.
  const manualLedgerNotes = ((ledger ?? []) as ConsultancyServiceLedgerEntry[])
    .filter(l => l.entry_type === 'manual')
    .map(l => ({ id: l.id, summary: l.summary, occurred_at: l.occurred_at }));

  const allTimeline = buildCommunicationTimeline({
    emails: (emails ?? []) as any[],
    broadcasts: (broadcasts ?? []) as any[],
    serviceRequests: (serviceRequests ?? []) as any[],
    reports: (valueReports ?? []) as any[],
    visitReports: (visitReports ?? []) as any[],
    manualLedgerNotes,
  });

  const VISIBILITY_LABEL: Record<CommunicationVisibility, string> = {
    client_originated: 'From client',
    shared_with_client: 'Shared with client',
    internal_consultancy: 'Internal only',
  };
  const VISIBILITY_COLOR: Record<CommunicationVisibility, string> = {
    client_originated: 'var(--blue)',
    shared_with_client: 'var(--teal)',
    internal_consultancy: 'var(--gold)',
  };
  const KIND_LABEL: Record<CommunicationKind, string> = {
    email: 'Email',
    broadcast: 'Broadcast',
    service_request_raised: 'Service request raised',
    service_request_responded: 'Service request responded',
    report_issued: 'Value report issued',
    visit_report_issued: 'Visit report issued',
    consultant_note: 'Consultant note',
  };

  // Core-OS 360 Completion Programme, Phase 24, Group 4 (closes
  // gap-ledger row C6.14 — "pagination/filtering on the Communication
  // Timeline"). The old rendering was a hard `.slice(0, 30)` with no
  // way to see anything older or narrow it down. Filtering runs over
  // the already-built, already-bounded array (every source query is
  // itself capped at 10-20 rows) — no second query, the same "the
  // data is already loaded, filter it in the browser [server render]"
  // posture the Evidence Engine's own client-side filters (Phase 23,
  // Group 3) already established, just server-side here since this
  // page has no 'use client' component of its own to filter in.
  const kindFilter = (sp.kind ?? '') as CommunicationKind | '';
  const visibilityFilter = (sp.visibility ?? '') as CommunicationVisibility | '';
  const filteredTimeline = allTimeline.filter(e =>
    (!kindFilter || e.kind === kindFilter) && (!visibilityFilter || e.visibility === visibilityFilter),
  );
  const timelinePage = Math.max(1, Number(sp.page ?? '1') || 1);
  const timelineFrom = (timelinePage - 1) * TIMELINE_PAGE_SIZE;
  const timelineTotalPages = Math.max(1, Math.ceil(filteredTimeline.length / TIMELINE_PAGE_SIZE));
  const timeline = filteredTimeline.slice(timelineFrom, timelineFrom + TIMELINE_PAGE_SIZE);
  const timelineQuery = (page: number) => {
    const q = new URLSearchParams();
    if (kindFilter) q.set('kind', kindFilter);
    if (visibilityFilter) q.set('visibility', visibilityFilter);
    if (page > 1) q.set('page', String(page));
    const s = q.toString();
    return s ? `?${s}` : '';
  };

  return (
    <main className="portal-page flex-1 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-display font-semibold" style={{ color: 'var(--ink)' }}>{(company as any)?.name ?? org.name}</h1>
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>{(company as any)?.sector ?? '—'} · {(company as any)?.contact_email ?? '—'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/consultancy/clients/${id}/risk-graph`} className="btn-secondary btn-sm">Risk Graph</Link>
          <Link href={`/open-workspace?org=${id}&next=/dashboard`} className="btn-secondary btn-sm">Open full workspace</Link>
        </div>
      </div>

      <ClientActionForms clientId={id} />

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <section className="card p-4 space-y-2">
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>H&S / workforce / asset state</h2>
          {s ? (
            <ul className="text-sm space-y-1" style={{ color: 'var(--ink-soft)' }}>
              <li>Band: <strong>{s.band}</strong> (as of {fmt(s.snapshot_date)})</li>
              <li>Open critical actions: <strong>{s.open_critical_actions}</strong></li>
              <li>Overdue legal reviews: <strong>{s.overdue_legal_evaluations}</strong></li>
              <li>Controlled documents overdue: <strong>{s.overdue_controlled_documents}</strong></li>
              <li>Open incident investigations: <strong>{s.open_incident_investigations}</strong></li>
              <li>Workers not ready: <strong>{s.workers_not_ready}</strong></li>
              <li>Assets unavailable: <strong>{s.assets_unavailable}</strong></li>
              <li>Major audit findings: <strong>{s.major_audit_findings}</strong></li>
              <li>Contractors flagged: <strong>{s.contractor_expiring}</strong></li>
              <li>Environmental permits expiring: <strong>{s.environmental_permits_expiring}</strong></li>
              <li>Management reviews due: <strong>{s.management_reviews_due}</strong></li>
            </ul>
          ) : <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No snapshot yet.</p>}
        </section>

        <section className="card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Board Assurance</h2>
            <Link href={`/consultancy/board-assurance`} className="text-xs underline" style={{ color: 'var(--ink-faint)' }}>Portfolio view</Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge" style={{ background: BUCKET_COLOR[boardAssurance.bucket], color: 'white' }}>{BUCKET_LABEL[boardAssurance.bucket]}</span>
            {boardAssurance.deteriorating && <span className="text-xs" style={{ color: 'var(--red)' }}>deteriorating</span>}
          </div>
          {boardAssurance.latestIssued ? (
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              Last issued Q{boardAssurance.latestIssued.quarter} {boardAssurance.latestIssued.year} ({fmt(boardAssurance.latestIssued.issuedAt)}), band: {boardAssurance.latestIssued.overallBand}
            </p>
          ) : (
            <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No board assurance report has ever been issued for this client.</p>
          )}
        </section>

        <section className="card p-4 space-y-2">
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Service scope</h2>
          {(scopes ?? []).length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No active service scope recorded.</p> : (
            <ul className="text-sm space-y-1" style={{ color: 'var(--ink-soft)' }}>
              {(scopes as ConsultancyServiceScope[]).map(sc => (
                <li key={sc.id}>{SERVICE_TYPE_LABELS[sc.service_type]} — since {fmt(sc.start_date)}{sc.review_frequency ? `, reviewed ${sc.review_frequency}` : ''}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Visits</h2>
            <Link href={`/consultancy/clients/${id}/visits/new`} className="btn-secondary btn-sm">Book a visit</Link>
          </div>
          {(visits ?? []).length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No visits recorded.</p> : (
            <ul className="text-sm space-y-1" style={{ color: 'var(--ink-soft)' }}>
              {(visits as ConsultancyVisit[]).map(v => (
                <li key={v.id}>
                  <Link href={`/consultancy/clients/${id}/visits/${v.id}`} className="underline">
                    {fmt(v.scheduled_date)} — {v.visit_type} ({VISIT_STATUS_LABELS[v.status]})
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4 space-y-2">
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Recent consultant activity (service ledger)</h2>
          {(ledger ?? []).length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No delivered value logged yet.</p> : (
            <ul className="text-sm space-y-1" style={{ color: 'var(--ink-soft)' }}>
              {(ledger as ConsultancyServiceLedgerEntry[]).map(l => (
                <li key={l.id}>{fmt(l.occurred_at)} — <span className="badge">{SERVICE_LEDGER_ENTRY_TYPE_LABELS[l.entry_type]}</span> {l.summary}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4 space-y-2">
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Roadmap</h2>
          {(milestones ?? []).length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No milestones.</p> : (
            <ul className="text-sm space-y-1" style={{ color: 'var(--ink-soft)' }}>
              {(milestones as any[]).map(m => (
                <li key={m.id}>{m.title} — {m.quarter} ({m.status})</li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4 space-y-2">
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Recent service requests</h2>
          {(serviceRequests ?? []).length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>None.</p> : (
            <ul className="text-sm space-y-1" style={{ color: 'var(--ink-soft)' }}>
              {(serviceRequests as any[]).map(r => (
                <li key={r.id}>{r.subject} — {r.status}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4 space-y-2">
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Active documents</h2>
          {(documents ?? []).length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>None.</p> : (
            <ul className="text-sm space-y-1" style={{ color: 'var(--ink-soft)' }}>
              {(documents as any[]).map(d => (
                <li key={d.id}>{d.title} — next review {fmt(d.review_due_at)}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4 space-y-2">
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Value reports</h2>
          {(valueReports ?? []).length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>None issued yet.</p> : (
            <ul className="text-sm space-y-2" style={{ color: 'var(--ink-soft)' }}>
              {(valueReports as any[]).map(r => (
                <li key={r.id}>
                  <div>{r.title} {r.period ? <span style={{ color: 'var(--ink-faint)' }}>({r.period})</span> : null}</div>
                  {r.narrative && <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{r.narrative}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Communication timeline</h2>
          <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            {filteredTimeline.length} communication{filteredTimeline.length === 1 ? '' : 's'}{(kindFilter || visibilityFilter) ? ' (filtered)' : ''}
          </span>
        </div>
        {allTimeline.length > 0 && (
          <FilterForm
            fields={[
              { name: 'kind', label: 'Kind', type: 'select', value: kindFilter, options: (Object.keys(KIND_LABEL) as CommunicationKind[]).map(k => ({ value: k, label: KIND_LABEL[k] })) },
              { name: 'visibility', label: 'Visibility', type: 'select', value: visibilityFilter, options: (Object.keys(VISIBILITY_LABEL) as CommunicationVisibility[]).map(v => ({ value: v, label: VISIBILITY_LABEL[v] })) },
            ]}
          />
        )}
        {timeline.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
            {allTimeline.length === 0 ? 'No communications recorded yet.' : 'No communications match this filter.'}
          </p>
        ) : (
          <>
            <ul className="text-sm space-y-2" style={{ color: 'var(--ink-soft)' }}>
              {timeline.map(entry => (
                <li key={entry.id} className="flex items-start gap-2">
                  <span className="text-xs whitespace-nowrap" style={{ color: 'var(--ink-faint)', minWidth: 90 }}>{fmt(entry.occurredAt)}</span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap"
                    style={{ background: 'rgba(0,0,0,0.04)', color: VISIBILITY_COLOR[entry.visibility] }}
                  >
                    {VISIBILITY_LABEL[entry.visibility]}
                  </span>
                  <span>{entry.summary}</span>
                </li>
              ))}
            </ul>
            {timelineTotalPages > 1 && (
              <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--line)' }}>
                <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                  {timelineFrom + 1}-{Math.min(timelineFrom + TIMELINE_PAGE_SIZE, filteredTimeline.length)} of {filteredTimeline.length}
                </span>
                <div className="flex items-center gap-2">
                  {timelinePage <= 1 ? (
                    <span className="btn-secondary btn-sm" aria-disabled="true" style={{ opacity: 0.4 }}>← Prev</span>
                  ) : (
                    <Link prefetch={false} href={`/consultancy/clients/${id}${timelineQuery(timelinePage - 1)}`} className="btn-secondary btn-sm">← Prev</Link>
                  )}
                  <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>Page {timelinePage} of {timelineTotalPages}</span>
                  {timelinePage >= timelineTotalPages ? (
                    <span className="btn-secondary btn-sm" aria-disabled="true" style={{ opacity: 0.4 }}>Next →</span>
                  ) : (
                    <Link prefetch={false} href={`/consultancy/clients/${id}${timelineQuery(timelinePage + 1)}`} className="btn-secondary btn-sm">Next →</Link>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
