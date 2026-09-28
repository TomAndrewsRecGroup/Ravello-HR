import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import { getSafetyContext, orgDirectory, nameOf, fmtDate, fmtDateTime, todayIso } from '@/lib/hs/safetyContext';
import { DOC_STATUS_LABELS, GHS_PICTOGRAM_LABELS, docPath, humanise, type DocStatus, type GhsPictogram } from '@/lib/hs/safetyVocab';
import Pill, { toneFor } from '@/components/safety/Pill';
import EvidencePanel, { type EvidenceFile } from '@/components/safety/EvidencePanel';
import { Meta, Prose } from '@/components/safety/RamsCoshhDocMeta';
import SubstanceForm, { type SubstanceValues } from '../new/SubstanceForm';
import SdsAdd from './SdsAdd';

export const metadata: Metadata = { title: 'Substance' };
export const dynamic = 'force-dynamic';

const empty = { data: [] as Record<string, unknown>[] };

export default async function SubstancePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const ctx = await getSafetyContext();
  const { supabase, companyId } = ctx;
  if (!companyId) notFound();

  const { data: s } = await supabase.from('substances')
    .select('id, reference, product_name, manufacturer, supplier, product_code, substance_type, sds_version, sds_date, hazard_statements, precautionary_statements, pictograms, pictograms_confirmed_by, pictograms_confirmed_at, storage_requirements, disposal_requirements, emergency_information, active_status, row_version, created_by, created_at')
    .eq('id', id).eq('company_id', companyId).maybeSingle();
  if (!s) notFound();

  const [dir, sds, assessments, files] = await Promise.all([
    orgDirectory(supabase),
    supabase.from('sds_versions').select('id, version_label, issue_date, notes, uploaded_by, uploaded_at, superseded_at, superseded_by_id').eq('substance_id', id).order('issue_date', { ascending: false }).order('created_at', { ascending: false }).limit(200),
    supabase.from('coshh_assessments').select('id, reference, version, title, status, review_date, review_reason').eq('substance_id', id).order('reference').order('version', { ascending: false }).limit(500),
    supabase.from('hs_files').select('id, storage_path, file_name, evidence_type, description').eq('entity_type', 'substance').eq('entity_id', id).order('created_at').limit(200),
  ]);
  const sdsRows = (sds.data ?? []) as { id: string; version_label: string; issue_date: string; notes: string | null; uploaded_by: string | null;
    uploaded_at: string; superseded_at: string | null; superseded_by_id: string | null }[];
  const sdsFiles = sdsRows.length
    ? await supabase.from('hs_files').select('id, entity_id, storage_path, file_name, evidence_type, description').eq('entity_type', 'sds').in('entity_id', sdsRows.map(r => r.id)).order('created_at').limit(500)
    : empty;
  const filesBySds: Record<string, EvidenceFile[]> = {};
  for (const f of (sdsFiles.data ?? []) as (EvidenceFile & { entity_id: string })[]) (filesBySds[f.entity_id] ??= []).push(f);

  const assess = (assessments.data ?? []) as { id: string; reference: string; version: number; title: string; status: DocStatus;
    review_date: string | null; review_reason: string | null }[];
  const liveCount = assess.filter(a => a.status === 'approved' || a.status === 'active').length;
  const canCreate = ctx.can('risk.create');
  const pictograms = (s.pictograms ?? []) as GhsPictogram[];
  const today = todayIso();
  const values: SubstanceValues = {
    product_name: s.product_name, manufacturer: s.manufacturer, supplier: s.supplier, product_code: s.product_code,
    substance_type: s.substance_type, hazard_statements: s.hazard_statements ?? [], precautionary_statements: s.precautionary_statements ?? [],
    pictograms, storage_requirements: s.storage_requirements, disposal_requirements: s.disposal_requirements,
    emergency_information: s.emergency_information, active_status: s.active_status,
  };

  return (
    <main className="portal-page flex-1 space-y-4">
      <Link href="/protect/coshh" className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--ink-soft)' }}><ArrowLeft size={14} /> COSHH register</Link>

      <section className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{s.reference}</span>
          <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--ink)' }}>{s.product_name}</h1>
          <Pill tone={s.active_status === 'active' ? 'good' : 'muted'}>{humanise(s.active_status)}</Pill>
          {!s.sds_version && <Pill tone="warn">No safety data sheet</Pill>}
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Meta label="Manufacturer" value={s.manufacturer ?? '—'} />
          <Meta label="Supplier" value={s.supplier ?? '—'} />
          <Meta label="Product code" value={s.product_code ?? '—'} />
          <Meta label="Type" value={s.substance_type ? humanise(s.substance_type) : '—'} />
          <Meta label="Current SDS" value={s.sds_version ? `${s.sds_version} · issued ${fmtDate(s.sds_date)}` : '—'} />
          <Meta label="Added" value={`${fmtDate(s.created_at)} by ${nameOf(dir, s.created_by)}`} />
        </dl>
        <div className="space-y-1">
          <h3 className="text-xs font-semibold uppercase" style={{ color: 'var(--ink-faint)' }}>Pictograms</h3>
          {pictograms.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>None recorded.</p> : (
            <>
              <div className="flex flex-wrap gap-1">{pictograms.map(p => <Pill key={p} tone="warn">{p} {GHS_PICTOGRAM_LABELS[p]}</Pill>)}</div>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                Confirmed against the SDS by {nameOf(dir, s.pictograms_confirmed_by)} on {fmtDateTime(s.pictograms_confirmed_at)}.
              </p>
            </>
          )}
        </div>
        {(s.hazard_statements ?? []).length > 0 && (
          <div><h3 className="text-xs font-semibold uppercase" style={{ color: 'var(--ink-faint)' }}>Hazard statements</h3>
            <ul className="text-sm list-disc pl-5" style={{ color: 'var(--ink-soft)' }}>{(s.hazard_statements as string[]).map((h, i) => <li key={i}>{h}</li>)}</ul></div>
        )}
        {(s.precautionary_statements ?? []).length > 0 && (
          <div><h3 className="text-xs font-semibold uppercase" style={{ color: 'var(--ink-faint)' }}>Precautionary statements</h3>
            <ul className="text-sm list-disc pl-5" style={{ color: 'var(--ink-soft)' }}>{(s.precautionary_statements as string[]).map((h, i) => <li key={i}>{h}</li>)}</ul></div>
        )}
        {s.storage_requirements && <Prose title="Storage">{s.storage_requirements}</Prose>}
        {s.disposal_requirements && <Prose title="Disposal">{s.disposal_requirements}</Prose>}
        {s.emergency_information && <Prose title="Emergency information">{s.emergency_information}</Prose>}
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Safety data sheets</h2>
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Every SDS is kept. The newest by issue date is current; earlier ones are marked superseded.</p>
        {canCreate && <SdsAdd substanceId={id} companyId={companyId} currentIssueDate={s.sds_date} liveAssessments={liveCount} />}
        {sdsRows.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No safety data sheet uploaded yet. Ask the supplier for the current SDS and add it here.</p> : (
          <ul className="space-y-2">
            {sdsRows.map(r => (
              <li key={r.id} className="p-3 rounded" style={{ border: '1px solid var(--line)' }}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium" style={{ color: 'var(--ink)' }}>{r.version_label}</span>
                  <span style={{ color: 'var(--ink-soft)' }}>issued {fmtDate(r.issue_date)}</span>
                  {r.superseded_at ? <Pill tone="muted">Superseded {fmtDate(r.superseded_at)}</Pill> : <Pill tone="good">Current</Pill>}
                  <span className="text-xs ml-auto" style={{ color: 'var(--ink-faint)' }}>uploaded {fmtDateTime(r.uploaded_at)} by {nameOf(dir, r.uploaded_by)}</span>
                </div>
                {r.notes && <p className="text-xs mt-1" style={{ color: 'var(--ink-soft)' }}>{r.notes}</p>}
                <EvidencePanel companyId={companyId} entityType="sds" entityId={r.id} files={filesBySds[r.id] ?? []}
                  canUpload={canCreate && (filesBySds[r.id] ?? []).length === 0} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>COSHH assessments</h2>
          {canCreate && s.active_status === 'active' && (
            <Link href={`/protect/coshh/new?substance=${id}`} className="btn-secondary btn-sm ml-auto"><Plus size={14} /> New COSHH assessment</Link>
          )}
        </div>
        {assess.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>Not yet assessed. Assess how this substance is used before it is relied on at work.</p> : (
          <ul className="text-sm space-y-1">
            {assess.map(a => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                <Link href={docPath('coshh_assessment', a.id)}>{a.reference} v{a.version} — {a.title}</Link>
                <Pill tone={toneFor(a.status)}>{DOC_STATUS_LABELS[a.status]}</Pill>
                {a.status === 'review_due' && a.review_reason === 'sds_change' && <span className="text-xs" style={{ color: 'var(--red)' }}>New SDS — review needed</span>}
                {a.review_date && a.review_date < today && ['approved', 'active', 'review_due'].includes(a.status) && <Pill tone="bad">Review overdue</Pill>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5 space-y-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Other documents and photos</h2>
        <EvidencePanel companyId={companyId} entityType="substance" entityId={id} files={(files.data ?? []) as EvidenceFile[]} canUpload={canCreate} />
      </section>

      {canCreate && (
        <section className="space-y-2">
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Edit substance</h2>
          <SubstanceForm companyId={companyId} substance={{ id, row_version: s.row_version, ...values }} />
        </section>
      )}
    </main>
  );
}
