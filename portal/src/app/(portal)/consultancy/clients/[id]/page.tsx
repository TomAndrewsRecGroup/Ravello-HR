import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePortfolioSession, portfolioIncludes, createServiceSupabaseClient } from '@/lib/consultancy/portfolioAccess';
import { SERVICE_LEDGER_ENTRY_TYPE_LABELS, SERVICE_TYPE_LABELS, VISIT_STATUS_LABELS } from '@/lib/consultancy/vocab';
import type { ConsultancyServiceLedgerEntry, ConsultancyServiceScope, ConsultancyVisit } from '@/lib/consultancy/types';
import { buildCommunicationTimeline, type CommunicationVisibility } from '@/lib/consultancy/communicationTimeline';
import ClientActionForms from './ClientActionForms';
import { auditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Client 360 — ${id.slice(0, 8)}` };
}

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Core-OS 360 Phase 6, section 4: the Client 360 view — a consultant
// cockpit for ONE authorised client, reachable without switching the
// active organisation (portfolio-wide, the exact pattern 168/169's own
// probes established). Internal-only consultancy notes never appear
// here: nothing this page reads is a client-authored free-text field
// beyond what the client's own portal pages already show them.
export default async function ClientCockpitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
    { data: valueReports }, { data: emails }, { data: broadcasts },
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
  ]);

  const s = snapshot as any;

  // The manual ledger entries feed the timeline too — reusing the
  // already-fetched `ledger` rows rather than a second query.
  const manualLedgerNotes = ((ledger ?? []) as ConsultancyServiceLedgerEntry[])
    .filter(l => l.entry_type === 'manual')
    .map(l => ({ id: l.id, summary: l.summary, occurred_at: l.occurred_at }));

  const timeline = buildCommunicationTimeline({
    emails: (emails ?? []) as any[],
    broadcasts: (broadcasts ?? []) as any[],
    serviceRequests: (serviceRequests ?? []) as any[],
    reports: (valueReports ?? []) as any[],
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

      <section className="card p-4 space-y-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Communication timeline</h2>
        {timeline.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No communications recorded yet.</p>
        ) : (
          <ul className="text-sm space-y-2" style={{ color: 'var(--ink-soft)' }}>
            {timeline.slice(0, 30).map(entry => (
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
        )}
      </section>
    </main>
  );
}
