import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSafetyContext, orgDirectory, orgSitesAndDepartments, nameOf, fmtDate, fmtDateTime } from '@/lib/hs/safetyContext';
import { HAZARD_SOURCE_LABELS, HAZARD_STATUS_LABELS, RISK_LEVEL_LABELS, docPath, type HazardSource, type HazardStatus, type RiskLevel } from '@/lib/hs/safetyVocab';
import { ACTION_STATUS_LABELS } from '@/lib/ui/statusMaps';
import Pill, { toneFor } from '@/components/safety/Pill';
import EvidencePanel, { type EvidenceFile } from '@/components/safety/EvidencePanel';
import HazardManage from './HazardManage';
import RaiseAction from '@/components/safety/RaiseAction';

export const metadata: Metadata = { title: 'Hazard' };
export const dynamic = 'force-dynamic';

export default async function HazardPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const ctx = await getSafetyContext();
  const { supabase, companyId } = ctx;
  if (!companyId) notFound();

  const { data: h } = await supabase.from('hazards')
    .select('id, company_id, reference, title, description, status, source, perceived_seriousness, immediate_action_taken, site_id, department_id, linked_location, linked_process, hazard_category_id, owner_id, identified_by, identified_at, reviewed_at, closed_at, notes, row_version, linked_asset_id')
    .eq('id', id).eq('company_id', companyId).maybeSingle();
  if (!h) notFound();

  const [dir, { sites, departments }, cats, files, items, links, actions, linkedAsset] = await Promise.all([
    orgDirectory(supabase),
    orgSitesAndDepartments(supabase, companyId),
    supabase.from('hazard_categories').select('id, name').eq('active', true).order('sort_order').limit(200),
    supabase.from('hs_files').select('id, storage_path, file_name, evidence_type, description').eq('entity_type', 'hazard').eq('entity_id', id).order('created_at').limit(200),
    supabase.from('risk_assessment_items').select('risk_assessment_id').eq('hazard_id', id).limit(200),
    supabase.from('hs_links').select('from_type, from_id, to_type, to_id, relation').or(`and(from_type.eq.hazard,from_id.eq.${id}),and(to_type.eq.hazard,to_id.eq.${id})`).limit(200),
    supabase.from('actions').select('id, title, status, due_date, assigned_to').eq('source_type', 'hazard').eq('source_id', id).order('created_at').limit(200),
    // Only set when this hazard came in via the item's own entity QR
    // scan (/e/[token] -> report-hazard, 201) with linked_asset_id —
    // the reverse of the equipment page's own "reports from this
    // item's QR code" list.
    h.linked_asset_id
      ? supabase.from('hs_equipment').select('id, name').eq('id', h.linked_asset_id).maybeSingle()
      : Promise.resolve({ data: null as { id: string; name: string } | null }),
  ]);
  const raIds = [...new Set([
    ...(items.data ?? []).map(i => i.risk_assessment_id as string),
    ...(links.data ?? []).flatMap(l => [l.from_type === 'risk_assessment' ? l.from_id : null, l.to_type === 'risk_assessment' ? l.to_id : null]).filter(Boolean) as string[],
  ])];
  const incIds = (links.data ?? []).flatMap(l => [l.from_type === 'incident' ? l.from_id : null, l.to_type === 'incident' ? l.to_id : null]).filter(Boolean) as string[];
  const [ras, incs] = await Promise.all([
    raIds.length ? supabase.from('risk_assessments').select('id, reference, version, title, status').in('id', raIds).limit(200) : Promise.resolve({ data: [] }),
    incIds.length ? supabase.from('hs_incidents').select('id, incident_number, incident_type, status').in('id', incIds).limit(200) : Promise.resolve({ data: [] }),
  ]);

  const status = h.status as HazardStatus;
  const manage = ctx.can('hazard.manage');
  const catName = (cats.data ?? []).find(c => c.id === h.hazard_category_id)?.name as string | undefined;

  return (
    <main className="portal-page flex-1 space-y-4">
      <Link href="/protect/hazards" className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--ink-soft)' }}><ArrowLeft size={14} /> Hazard register</Link>
      <section className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{h.reference}</span>
          <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--ink)' }}>{h.title}</h1>
          <Pill tone={toneFor(status)}>{HAZARD_STATUS_LABELS[status]}</Pill>
          {h.perceived_seriousness && <Pill tone="warn">Seriousness: {RISK_LEVEL_LABELS[h.perceived_seriousness as RiskLevel]}</Pill>}
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Meta label="Category" value={catName ?? '—'} />
          <Meta label="Site" value={sites.find(s => s.id === h.site_id)?.name ?? '—'} />
          <Meta label="Location" value={h.linked_location ?? '—'} />
          <Meta label="Process" value={h.linked_process ?? '—'} />
          <Meta label="Owner" value={h.owner_id ? nameOf(dir, h.owner_id) : 'Unassigned'} />
          <Meta label="Reported by" value={nameOf(dir, h.identified_by)} />
          <Meta label="Reported" value={fmtDateTime(h.identified_at)} />
          <Meta label="Source" value={HAZARD_SOURCE_LABELS[h.source as HazardSource]} />
          <Meta label="Reviewed" value={h.reviewed_at ? fmtDate(h.reviewed_at) : 'Not yet'} />
          {linkedAsset.data && (
            <Meta label="Reported against" value={<Link href={`/protect/equipment#eq-${linkedAsset.data.id}`} style={{ color: 'var(--purple)' }}>{linkedAsset.data.name}</Link>} />
          )}
        </dl>
        {h.description && <Block title="What was seen">{h.description}</Block>}
        {h.immediate_action_taken && <Block title="Immediate action taken">{h.immediate_action_taken}</Block>}
        {h.notes && <Block title="Notes">{h.notes}</Block>}
      </section>

      {manage && (
        <HazardManage hazard={{ id: h.id, status, owner_id: h.owner_id, hazard_category_id: h.hazard_category_id, site_id: h.site_id,
          department_id: h.department_id, notes: h.notes, row_version: h.row_version }}
          people={dir} sites={sites} departments={departments} categories={(cats.data ?? []) as { id: string; name: string }[]} />
      )}

      <section className="card p-5 space-y-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Evidence</h2>
        <EvidencePanel companyId={companyId} entityType="hazard" entityId={h.id} files={(files.data ?? []) as EvidenceFile[]}
          canUpload={manage || h.identified_by === ctx.userId} />
      </section>

      <section className="card p-5 space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Risk assessments</h2>
          {ctx.can('risk.create') && (
            <Link href={`/protect/risk-assessments/new?hazard=${h.id}`} className="btn-secondary btn-sm ml-auto">Start a risk assessment</Link>
          )}
        </div>
        {(ras.data ?? []).length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>Not yet covered by a risk assessment.</p> : (
          <ul className="text-sm space-y-1">
            {(ras.data ?? []).map(r => (
              <li key={r.id as string}><Link href={docPath('risk_assessment', r.id as string)}>{r.reference as string} v{r.version as number} — {r.title as string}</Link>{' '}
                <Pill tone={toneFor(r.status as string)}>{String(r.status).replace(/_/g, ' ')}</Pill></li>
            ))}
          </ul>
        )}
        {(incs.data ?? []).length > 0 && (
          <>
            <h3 className="text-sm font-semibold pt-2" style={{ color: 'var(--ink-soft)' }}>Linked incidents</h3>
            <ul className="text-sm space-y-1">
              {(incs.data ?? []).map(i => <li key={i.id as string}><Link href={`/protect/incidents/${i.id}`}>{i.incident_number as string}</Link> · {String(i.incident_type).replace(/_/g, ' ')}</li>)}
            </ul>
          </>
        )}
      </section>

      <section className="card p-5 space-y-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Actions</h2>
        {(actions.data ?? []).length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No actions raised from this hazard.</p> : (
          <ul className="text-sm space-y-1">
            {(actions.data ?? []).map(a => (
              <li key={a.id as string} className="flex flex-wrap gap-2 items-center">
                <span style={{ color: 'var(--ink)' }}>{a.title as string}</span>
                <Pill tone={toneFor(a.status as string)}>{ACTION_STATUS_LABELS[a.status as string] ?? String(a.status)}</Pill>
                <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{a.assigned_to ? nameOf(dir, a.assigned_to as string) : 'Unassigned'} · due {fmtDate(a.due_date as string | null)}</span>
              </li>
            ))}
          </ul>
        )}
        {ctx.can('actions.assign') && <RaiseAction companyId={companyId} sourceType="hazard" sourceId={h.id} siteId={h.site_id} people={dir} defaultTitle={`Control hazard ${h.reference}: ${h.title}`.slice(0, 200)} />}
      </section>
    </main>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>{label}</dt><dd style={{ color: 'var(--ink)' }}>{value}</dd></div>;
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h3 className="text-xs font-semibold uppercase" style={{ color: 'var(--ink-faint)' }}>{title}</h3><p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{children}</p></div>;
}
