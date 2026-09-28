import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSafetyContext, orgDirectory, orgSitesAndDepartments, param } from '@/lib/hs/safetyContext';
import type { MatrixRow } from '../[id]/raTypes';
import NewRiskAssessmentForm from './NewRiskAssessmentForm';

export const metadata: Metadata = { title: 'New risk assessment' };
export const dynamic = 'force-dynamic';

// Start a risk assessment: blank, or an organisation-owned copy of a
// template (hs_instantiate_template). ?hazard=<id> comes from the
// hazard register: the new assessment opens with that hazard as its
// first risk item. The hazard is read under the caller's RLS and must be
// this organisation's (hs_check_refs refuses it otherwise anyway).
export default async function NewRiskAssessmentPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const ctx = await getSafetyContext();
  const { supabase, companyId } = ctx;
  if (!companyId || !ctx.can('risk.create')) redirect('/protect/risk-assessments');

  const hazardId = param(sp, 'hazard');
  const validHazardId = /^[0-9a-f-]{36}$/i.test(hazardId) ? hazardId : '';

  const [types, matrices, templates, { sites, departments }, dir, hazard] = await Promise.all([
    supabase.from('assessment_types').select('id, name').eq('active', true).order('sort_order').limit(200),
    supabase.from('risk_matrices').select('id, name, company_id, is_default, likelihood_labels, severity_labels, bands').order('name').limit(100),
    supabase.from('hs_templates').select('id, title, description, owner_company_id, visibility, version').eq('kind', 'risk_assessment').eq('active', true).order('title').limit(200),
    orgSitesAndDepartments(supabase, companyId),
    orgDirectory(supabase),
    validHazardId
      ? supabase.from('hazards').select('id, reference, title, site_id, department_id').eq('id', validHazardId).eq('company_id', companyId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const ms = ((matrices.data ?? []) as MatrixRow[]).filter(m => m.company_id === null || m.company_id === companyId);
  // Same rule as hs_ra_defaults: the organisation's default, else the platform's.
  const defaultMatrix = ms.find(m => m.is_default && m.company_id === companyId) ?? ms.find(m => m.is_default && m.company_id === null) ?? ms[0] ?? null;

  const h = hazard.data as { id: string; reference: string; title: string; site_id: string | null; department_id: string | null } | null;

  return (
    <main className="portal-page flex-1 space-y-4">
      <Link href="/protect/risk-assessments" className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--ink-soft)' }}><ArrowLeft size={14} /> Risk assessments</Link>
      {validHazardId && !h && (
        <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>That hazard was not found in this organisation, so it will not be added.</p>
      )}
      {!defaultMatrix ? (
        <p className="card p-4 text-sm" style={{ color: 'var(--red)' }}>No risk matrix is available to this organisation. Ask Core OS 360 to set one up.</p>
      ) : (
        <NewRiskAssessmentForm
          companyId={companyId}
          userId={ctx.userId}
          types={(types.data ?? []) as { id: string; name: string }[]}
          matrices={ms}
          defaultMatrixId={defaultMatrix.id}
          templates={((templates.data ?? []) as { id: string; title: string; description: string | null; owner_company_id: string | null; visibility: string; version: number }[])
            .map(t => ({ ...t, source: t.owner_company_id === null ? 'Platform' : t.owner_company_id === companyId ? 'Your organisation' : 'Your consultancy' }))}
          sites={sites}
          departments={departments}
          people={dir}
          hazard={h}
        />
      )}
    </main>
  );
}
