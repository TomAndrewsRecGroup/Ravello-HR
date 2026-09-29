import type { Metadata } from 'next';
import { CheckCircle2, Circle, ShieldCheck } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { ISO_STANDARD_CODE_LABELS, STANDARD_EVIDENCE_ENTITY_TYPE_LABELS, type StandardEvidenceEntityType } from '@/lib/hs/vocab';
import type { ManagementSystemStandard, StandardClause, StandardEvidenceLink, IsoCertification } from '@/lib/hs/types';

export const metadata: Metadata = { title: 'ISO Readiness' };
export const dynamic = 'force-dynamic';

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// Read-only (migration 158's own posture, the same as Register /
// Documents / Audits / Equipment / Emergency Plans — nothing here is
// self-certified). Purely factual: a clause either has recorded
// evidence linked to it or it doesn't — never a percentage, never a
// score, never "compliant"/"certified" anywhere on this page. A
// certification is shown ONLY when staff have entered a real one below.
export default async function ProtectIsoReadinessPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const [{ data: standards, error: stdError }, { data: clauses, error: clauseError }, { data: links, error: linkError }, { data: certs, error: certError }] =
    await Promise.all([
      supabase.from('management_system_standards').select('id, code, name, created_at').order('code'),
      supabase.from('standard_clauses').select('id, standard_id, clause_number, title, maps_to_hint, display_order, created_at').order('display_order'),
      supabase.from('standard_evidence_links').select('id, company_id, clause_id, entity_type, entity_id, added_by, created_at').eq('company_id', companyId).limit(500),
      supabase.from('iso_certifications').select('id, company_id, standard_id, certificate_number, certifying_body, issued_on, expires_on, created_by, created_at, updated_at').eq('company_id', companyId).order('expires_on').limit(500),
    ]);

  const error = stdError?.message ?? clauseError?.message ?? linkError?.message ?? certError?.message ?? null;
  const standardList = (standards ?? []) as ManagementSystemStandard[];
  const clauseList = (clauses ?? []) as StandardClause[];
  const linkList = (links ?? []) as StandardEvidenceLink[];
  const certList = (certs ?? []) as IsoCertification[];

  return (
    <main className="portal-page flex-1 space-y-4">
      {error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>ISO readiness could not be loaded. Refresh to try again.</p>}

      <div className="card p-4">
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          Recorded evidence mapped to applicable management-system requirements. This is a count of what has
          been linked on your behalf, not an assessment of compliance or certification status.
        </p>
      </div>

      {standardList.map(std => {
        const stdClauses = clauseList.filter(c => c.standard_id === std.id).sort((a, b) => a.display_order - b.display_order);
        const withEvidence = stdClauses.filter(c => linkList.some(l => l.clause_id === c.id)).length;
        return (
          <div key={std.id} className="card p-0 overflow-hidden">
            <div className="p-4 flex flex-wrap items-baseline justify-between gap-2" style={{ borderBottom: '1px solid var(--line)' }}>
              <div>
                <strong style={{ color: 'var(--ink)' }}>{std.name}</strong>
                <span className="ml-2 text-xs" style={{ color: 'var(--ink-faint)' }}>{ISO_STANDARD_CODE_LABELS[std.code] ?? std.code}</span>
              </div>
              <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{withEvidence} of {stdClauses.length} clauses have recorded evidence</span>
            </div>
            <ul>
              {stdClauses.map(clause => {
                const clauseLinks = linkList.filter(l => l.clause_id === clause.id);
                return (
                  <li key={clause.id} className="flex items-start gap-3 p-3" style={{ borderBottom: '1px solid var(--line)' }}>
                    {clauseLinks.length > 0
                      ? <CheckCircle2 size={14} className="mt-0.5" style={{ color: 'var(--teal)' }} />
                      : <Circle size={14} className="mt-0.5" style={{ color: 'var(--ink-faint)' }} />}
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-medium" style={{ color: 'var(--ink-faint)' }}>{clause.clause_number}</span>
                        <span className="text-sm" style={{ color: 'var(--ink)' }}>{clause.title}</span>
                      </div>
                      {clauseLinks.length > 0 && (
                        <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
                          {clauseLinks.map(l => STANDARD_EVIDENCE_ENTITY_TYPE_LABELS[l.entity_type as StandardEvidenceEntityType] ?? l.entity_type).join(', ')}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <div className="card p-5">
        <h2 className="font-display font-semibold flex items-center gap-2 mb-3" style={{ color: 'var(--ink)' }}>
          <ShieldCheck size={16} /> Certifications
        </h2>
        {certList.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No certifications on file.</p>
        ) : (
          <ul className="space-y-2">
            {certList.map(c => {
              const std = standardList.find(s => s.id === c.standard_id);
              return (
                <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                  <strong>{std?.name ?? 'Unknown standard'}</strong>
                  {c.certificate_number && <span>{c.certificate_number}</span>}
                  {c.certifying_body && <span style={{ color: 'var(--ink-faint)' }}>{c.certifying_body}</span>}
                  <span style={{ color: 'var(--ink-faint)' }}>
                    {c.issued_on ? `issued ${fmt(c.issued_on)}` : ''} {c.expires_on ? `· expires ${fmt(c.expires_on)}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
