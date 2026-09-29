import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePortfolioSession, portfolioIncludes, createServiceSupabaseClient } from '@/lib/consultancy/portfolioAccess';
import { loadPreVisitBrief } from '@/lib/consultancy/loadPreVisitBrief';
import { loadVisitCapture } from '@/lib/consultancy/loadVisitCapture';
import { VISIT_STATUS_LABELS, VISIT_TYPE_LABELS } from '@/lib/consultancy/vocab';
import type { ConsultancyVisit } from '@/lib/consultancy/types';
import VisitCaptureClient from './VisitCaptureClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ visitId: string }> }): Promise<Metadata> {
  const { visitId } = await params;
  return { title: `Visit — ${visitId.slice(0, 8)}` };
}

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Core-OS 360 Phase 7. For a visit that has not yet started
// (planned/confirmed), this page IS the brief (Group 2, section 2:
// Pre-Visit Brief) — "understand current context" before arriving on
// site. Group 3 (section 4/5: Mobile/Tablet Visit Mode, Structured
// Observations) adds VisitCaptureClient, which takes over as the
// primary interaction once status reaches in_progress. Group 5 will
// extend this same page again with the report builder — one visit,
// one page, not a page per lifecycle stage.
export default async function VisitDetailPage({ params }: { params: Promise<{ id: string; visitId: string }> }) {
  const { id, visitId } = await params;
  const portfolio = await requirePortfolioSession();
  if (!portfolio) redirect('/dashboard');
  if (!portfolioIncludes(portfolio.organisations, id)) notFound();

  const sb = createServiceSupabaseClient();
  const { data: visit } = await sb.from('consultancy_visits').select('*').eq('id', visitId).maybeSingle();
  if (!visit || (visit as ConsultancyVisit).client_organisation_id !== id) notFound();
  const v = visit as ConsultancyVisit;

  const org = portfolio.organisations.find(o => o.organisation_id === id)!;
  const [brief, capture] = await Promise.all([
    loadPreVisitBrief(portfolio, id, visitId),
    loadVisitCapture(id, visitId, v.template_id),
  ]);

  return (
    <main className="portal-page flex-1 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-display font-semibold" style={{ color: 'var(--ink)' }}>
            {VISIT_TYPE_LABELS[v.visit_type]} — {org.name}
          </h1>
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
            {fmt(v.scheduled_date)} · <span className="badge">{VISIT_STATUS_LABELS[v.status]}</span>
          </p>
        </div>
        <Link href={`/consultancy/clients/${id}`} className="btn-secondary btn-sm">Back to Client 360</Link>
      </div>

      {v.status !== 'cancelled' && (
        <VisitCaptureClient
          visitId={visitId}
          clientOrganisationId={id}
          status={v.status}
          observations={capture.observations}
          evidenceByObservation={capture.evidenceByObservation}
          templateItems={capture.templateItems}
          linkableAssets={capture.linkableAssets}
          linkableContractors={capture.linkableContractors}
          linkablePeople={capture.linkablePeople}
          linkableDocuments={capture.linkableDocuments}
        />
      )}

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Pre-visit brief</h2>
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          Factual aggregation of current evidence — no prediction.
        </p>

        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Previous visit</h3>
          {brief.previousVisit ? (
            <div className="text-sm space-y-1" style={{ color: 'var(--ink-soft)' }}>
              <p>{fmt(brief.previousVisit.scheduled_date)} — {VISIT_STATUS_LABELS[brief.previousVisit.status as keyof typeof VISIT_STATUS_LABELS] ?? brief.previousVisit.status}</p>
              {brief.previousVisit.shared_summary && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{brief.previousVisit.shared_summary}</p>}
              {brief.previousVisitActions.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>No actions raised from that visit.</p>
              ) : (
                <ul className="text-xs space-y-0.5">
                  {brief.previousVisitActions.map(a => (
                    <li key={a.id}>{a.title} — <strong>{a.status}</strong>{a.due_date ? ` (due ${fmt(a.due_date)})` : ''}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No previous visit on record — this is the first.</p>}
        </div>

        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Open items ({brief.openItems.length})</h3>
          {brief.openItems.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>None.</p> : (
            <ul className="text-xs space-y-0.5" style={{ color: 'var(--ink-soft)' }}>
              {brief.openItems.map(i => (
                <li key={i.key}>
                  <span className="badge" style={{ marginRight: 4 }}>{i.severity}</span>
                  {i.issueType}: {i.state}{i.dueDate ? ` (due ${fmt(i.dueDate)})` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Incidents since last visit ({brief.incidentsSinceLastVisit.length})</h3>
          {brief.incidentsSinceLastVisit.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>None.</p> : (
            <ul className="text-xs space-y-0.5" style={{ color: 'var(--ink-soft)' }}>
              {brief.incidentsSinceLastVisit.map(inc => (
                <li key={inc.id}>{fmt(inc.created_at)} — {inc.incident_type ?? 'Incident'} ({inc.severity ?? 'unclassified'})</li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Roadmap items in progress ({brief.roadmapItems.length})</h3>
          {brief.roadmapItems.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>None.</p> : (
            <ul className="text-xs space-y-0.5" style={{ color: 'var(--ink-soft)' }}>
              {brief.roadmapItems.map(m => (
                <li key={m.id}>{m.title} ({m.pillar}) — {m.status}{m.due_date ? `, due ${fmt(m.due_date)}` : ''}</li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
