import type { Metadata } from 'next';
import Link from 'next/link';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import { ISO_STANDARD_CODE_LABELS } from '@/lib/hs/vocab';
import type { ManagementSystemStandard, StandardClause, StandardEvidenceLink } from '@/lib/hs/types';

export const metadata: Metadata = { title: 'ISO readiness' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 5, Group 3 (158): every client, per standard, clause
// count / clauses-with-evidence count / clauses-with-no-evidence (gap)
// count. Purely factual (migration 158's own rule 4) — no percentage,
// no score, no significance judgement. The same "cross-client dashboard,
// computed in TypeScript from plain reads" shape /health-safety's own
// index page and /compliance's cross-client RAG dashboard already use.
export default async function HealthSafetyIsoReadinessPage() {
  const supabase = await createServerSupabaseClient();

  const [{ data: companies }, { data: standards }, { data: clauses }, links] = await Promise.all([
    supabase.from('companies').select('id, name').eq('active', true).order('name'),
    supabase.from('management_system_standards').select('id, code, name, created_at').order('code'),
    supabase.from('standard_clauses').select('id, standard_id, clause_number, title, maps_to_hint, display_order, created_at'),
    readAllPages<StandardEvidenceLink>((from, to) =>
      supabase.from('standard_evidence_links')
        .select('id, company_id, clause_id, entity_type, entity_id, added_by, created_at')
        .order('id').range(from, to)),
  ]);

  const companyList = (companies ?? []) as { id: string; name: string }[];
  const standardList = (standards ?? []) as ManagementSystemStandard[];
  const clauseList = (clauses ?? []) as StandardClause[];
  const clausesByStandard = new Map<string, StandardClause[]>();
  for (const c of clauseList) clausesByStandard.set(c.standard_id, [...(clausesByStandard.get(c.standard_id) ?? []), c]);

  const linkedClauseIdsByCompany = new Map<string, Set<string>>();
  for (const l of links.rows) {
    const set = linkedClauseIdsByCompany.get(l.company_id) ?? new Set<string>();
    set.add(l.clause_id);
    linkedClauseIdsByCompany.set(l.company_id, set);
  }

  return (
    <>
      <AdminTopbar title="ISO readiness" subtitle="Recorded evidence mapped to applicable management-system requirements — counts only, never a score" />
      <main className="admin-page flex-1 space-y-5">
        {links.error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load evidence links: {links.error}</p>}
        {links.truncated && <p className="card p-3 text-sm" style={{ color: 'var(--gold)' }}>Showing the first part of a long evidence-link list.</p>}

        <div className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
          This shows, per client and standard, how many clauses have at least one piece of linked evidence on
          file and how many do not — a purely factual count, never a compliance percentage or certification
          status.
        </div>

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                {standardList.map(s => <th key={s.id}>{ISO_STANDARD_CODE_LABELS[s.code] ?? s.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {companyList.map(co => {
                const linked = linkedClauseIdsByCompany.get(co.id) ?? new Set<string>();
                return (
                  <tr key={co.id}>
                    <td>
                      <Link href={`/health-safety/${co.id}/iso`} style={{ color: 'var(--purple)' }}>{co.name}</Link>
                    </td>
                    {standardList.map(std => {
                      const total = (clausesByStandard.get(std.id) ?? []).length;
                      const withEvidence = (clausesByStandard.get(std.id) ?? []).filter(c => linked.has(c.id)).length;
                      return (
                        <td key={std.id}>
                          <span>{withEvidence} with evidence</span>{' · '}
                          <span style={{ color: total - withEvidence > 0 ? 'var(--gold)' : 'var(--ink-faint)' }}>{total - withEvidence} gap</span>{' '}
                          <span style={{ color: 'var(--ink-faint)' }}>({total} clauses)</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
