import type { Metadata } from 'next';
import Link from 'next/link';
import { getWorkforceContext } from '@/lib/workforce/context';
import { todayIso } from '@/lib/hs/safetyContext';
import { readAllPages } from '@/lib/supabase/paged';
import { WORKFORCE_BASE } from '@/lib/workforce/vocab';
import type { ImportCatalogueItem, ImportKind, ImportLevel, ImportPerson } from '@/lib/workforce/importCsv';
import ImportClient from './ImportClient';

export const metadata: Metadata = { title: 'Import workforce records' };
export const dynamic = 'force-dynamic';

// CSV import (spec 98): training records, competency assessments and
// qualifications / licences, previewed row by row before anything is
// written. Reference data is read from the ACTIVE organisation only and
// under the viewer's own session; the writes are the viewer's own too,
// so RLS and the 134 evidence guard decide every row.
//
// Who may import what follows the tables' write policies (134):
// training records and credentials need training.manage; competency
// assessments need competency.assess.
export default async function WorkforceImportPage() {
  const ctx = await getWorkforceContext();
  const { supabase, companyId } = ctx;
  if (!companyId) return <main className="portal-page flex-1"><p className="card p-4 text-sm">No organisation is selected.</p></main>;

  const kinds: ImportKind[] = [
    ...(ctx.can('training.manage') ? ['training' as const] : []),
    ...(ctx.can('competency.assess') ? ['competency' as const] : []),
    ...(ctx.can('training.manage') ? ['credential' as const] : []),
  ];
  if (kinds.length === 0) {
    return (
      <main className="portal-page flex-1 space-y-4">
        <p className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
          Importing records needs the training management or competency assessment permission in this organisation.
          Ask your administrator. <Link href={`${WORKFORCE_BASE}/matrix`}>Back to the matrix</Link>
        </p>
      </main>
    );
  }

  const orgOrGlobal = `company_id.is.null,company_id.eq.${companyId}`;
  const [people, courses, competencies, levels, credentialTypes] = await Promise.all([
    readAllPages<ImportPerson>((from, to) => supabase.from('people')
      .select('id, company_id, full_name, email, employee_number')
      .eq('company_id', companyId)
      .in('worker_type', ['employee', 'contractor', 'consultant', 'temporary_worker', 'former_employee'])
      .order('id').range(from, to)),
    kinds.includes('training')
      ? readAllPages<ImportCatalogueItem>((from, to) => supabase.from('training_courses')
          .select('id, company_id, title, safety_critical').or(orgOrGlobal).order('id').range(from, to))
      : Promise.resolve({ rows: [] as ImportCatalogueItem[], error: null }),
    kinds.includes('competency')
      ? readAllPages<ImportCatalogueItem>((from, to) => supabase.from('competencies')
          .select('id, company_id, title, safety_critical, assessment_method').or(orgOrGlobal).order('id').range(from, to))
      : Promise.resolve({ rows: [] as ImportCatalogueItem[], error: null }),
    kinds.includes('competency')
      ? supabase.from('competency_levels').select('id, company_id, key, label').or(orgOrGlobal).order('rank').limit(200)
      : Promise.resolve({ data: [] as ImportLevel[], error: null }),
    kinds.includes('credential')
      ? readAllPages<ImportCatalogueItem>((from, to) => supabase.from('credential_types')
          .select('id, company_id, title, kind').or(orgOrGlobal).order('id').range(from, to))
      : Promise.resolve({ rows: [] as ImportCatalogueItem[], error: null }),
  ]);

  const loadError = people.error ?? courses.error ?? competencies.error ?? levels.error?.message ?? credentialTypes.error;

  return (
    <main className="portal-page flex-1 space-y-4">
      <div>
        <h1 className="font-display text-lg font-semibold" style={{ color: 'var(--ink)' }}>Import workforce records</h1>
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          Upload a CSV, check the preview, then import. Nothing is written until you confirm. People are matched by email or
          employee number, and courses, competencies and credentials by their exact title in this organisation&apos;s catalogue.
          Ids are never accepted.
        </p>
      </div>
      {loadError && (
        <p className="card p-3 text-sm" role="alert" style={{ color: 'var(--red)' }}>
          Reference data could not be loaded ({loadError}). Refresh before importing — rows cannot be matched without it.
        </p>
      )}
      <ImportClient
        kinds={kinds}
        reference={{
          companyId, today: todayIso(),
          people: people.rows, courses: courses.rows, competencies: competencies.rows,
          levels: (levels.data ?? []) as ImportLevel[], credentialTypes: credentialTypes.rows,
        }}
      />
    </main>
  );
}
