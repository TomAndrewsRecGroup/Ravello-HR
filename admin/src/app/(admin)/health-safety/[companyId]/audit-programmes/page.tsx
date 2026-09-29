import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { AuditProgramme } from '@/lib/hs/types';
import AuditProgrammesClient from '@/components/hs/AuditProgrammesClient';

export const metadata: Metadata = { title: 'Audit programmes' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 5, Group 7 (migration 162): a planned SCHEDULE of
// audits — extends the existing hs_audits/hs_audit_templates checklist
// engine, never a second audit system.
export default async function AuditProgrammesPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const programmes = await readAllPages<AuditProgramme>((from, to) =>
    supabase.from('audit_programmes')
      .select('id, company_id, name, frequency, standard_id, template_id, next_due_date, active, notes, created_by, created_at, updated_at')
      .eq('company_id', params.companyId)
      .order('next_due_date', { ascending: true }).order('id')
      .range(from, to));

  return (
    <AuditProgrammesClient
      companyId={params.companyId}
      programmes={programmes.rows}
      loadError={programmes.error ?? (programmes.truncated ? 'Showing the first part of a long list.' : null)}
    />
  );
}
