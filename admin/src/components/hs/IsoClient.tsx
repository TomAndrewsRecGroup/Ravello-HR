'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Plus, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/modules/Toast';
import {
  ISO_STANDARD_CODE_LABELS, STANDARD_EVIDENCE_ENTITY_TYPES, STANDARD_EVIDENCE_ENTITY_TYPE_LABELS,
  type StandardEvidenceEntityType,
} from '@/lib/hs/vocab';
import type { ManagementSystemStandard, StandardClause, StandardEvidenceLink, IsoCertification } from '@/lib/hs/types';

interface Props {
  companyId: string;
  standards: ManagementSystemStandard[];
  clauses: StandardClause[];
  links: StandardEvidenceLink[];
  certifications: IsoCertification[];
  loadError: string | null;
}

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// Purely factual (migration 158, rule 4/5): a count of clauses with
// evidence and a count without — never a percentage, never a score,
// never "compliant"/"certified". A real certificate is shown ONLY when
// a staff member has entered one below; nothing here computes that
// conclusion from the evidence links.
export default function IsoClient({ companyId, standards, clauses, links, certifications, loadError }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [expandedClause, setExpandedClause] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [entityType, setEntityType] = useState<StandardEvidenceEntityType>('document');
  const [entityId, setEntityId] = useState('');

  const [certOpen, setCertOpen] = useState(false);
  const [certStandard, setCertStandard] = useState(standards[0]?.id ?? '');
  const [certNumber, setCertNumber] = useState('');
  const [certBody, setCertBody] = useState('');
  const [certIssued, setCertIssued] = useState('');
  const [certExpires, setCertExpires] = useState('');

  async function addEvidence(clauseId: string, e: React.FormEvent) {
    e.preventDefault();
    if (!entityId.trim()) { toast('Enter the id of the existing record this clause is evidenced by.', 'error'); return; }
    setBusy(true);
    const { error } = await createClient().from('standard_evidence_links').insert({
      company_id: companyId, clause_id: clauseId, entity_type: entityType, entity_id: entityId.trim(),
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Evidence linked', 'success');
    setEntityId(''); setExpandedClause(null);
    router.refresh();
  }

  async function removeLink(linkId: string) {
    setBusy(true);
    const { error } = await createClient().from('standard_evidence_links').delete().eq('id', linkId);
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    router.refresh();
  }

  async function addCertification(e: React.FormEvent) {
    e.preventDefault();
    if (!certStandard) { toast('Choose a standard.', 'error'); return; }
    setBusy(true);
    const { error } = await createClient().from('iso_certifications').insert({
      company_id: companyId, standard_id: certStandard,
      certificate_number: certNumber.trim() || null, certifying_body: certBody.trim() || null,
      issued_on: certIssued || null, expires_on: certExpires || null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Certification recorded', 'success');
    setCertNumber(''); setCertBody(''); setCertIssued(''); setCertExpires(''); setCertOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>{loadError}</p>}

      <div className="card p-4">
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          Recorded evidence mapped to applicable management-system requirements. This is a count of what has
          been linked, not an assessment of compliance or certification status.
        </p>
      </div>

      {standards.map(std => {
        const stdClauses = clauses.filter(c => c.standard_id === std.id).sort((a, b) => a.display_order - b.display_order);
        const withEvidence = stdClauses.filter(c => links.some(l => l.clause_id === c.id)).length;
        return (
          <div key={std.id} className="card p-0 overflow-hidden">
            <div className="p-4 flex flex-wrap items-baseline justify-between gap-2" style={{ borderBottom: '1px solid var(--line)' }}>
              <div>
                <h3 className="font-display font-semibold" style={{ color: 'var(--ink)' }}>{std.name}</h3>
                <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{ISO_STANDARD_CODE_LABELS[std.code] ?? std.code}</span>
              </div>
              <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                {withEvidence} of {stdClauses.length} clauses have recorded evidence
              </span>
            </div>
            <div>
              {stdClauses.map(clause => {
                const clauseLinks = links.filter(l => l.clause_id === clause.id);
                const isExpanded = expandedClause === clause.id;
                return (
                  <div key={clause.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 p-3 text-left"
                      onClick={() => setExpandedClause(isExpanded ? null : clause.id)}
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      {clauseLinks.length > 0
                        ? <CheckCircle2 size={14} style={{ color: 'var(--teal)' }} />
                        : <Circle size={14} style={{ color: 'var(--ink-faint)' }} />}
                      <span className="text-xs font-medium" style={{ color: 'var(--ink-faint)', minWidth: 40 }}>{clause.clause_number}</span>
                      <span className="flex-1 text-sm" style={{ color: 'var(--ink)' }}>{clause.title}</span>
                      <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{clauseLinks.length} evidence</span>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3">
                        {clauseLinks.length === 0 ? (
                          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>No evidence linked to this clause yet.</p>
                        ) : (
                          <ul className="space-y-1">
                            {clauseLinks.map(l => (
                              <li key={l.id} className="flex items-center justify-between text-sm">
                                <span>{STANDARD_EVIDENCE_ENTITY_TYPE_LABELS[l.entity_type as StandardEvidenceEntityType] ?? l.entity_type} — <span className="font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{l.entity_id}</span></span>
                                <button type="button" className="text-xs" style={{ color: 'var(--red)' }} onClick={() => removeLink(l.id)} disabled={busy}>Remove</button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <form onSubmit={e => addEvidence(clause.id, e)} className="flex flex-wrap items-end gap-2">
                          <div>
                            <label className="label">Record type</label>
                            <select className="input" value={entityType} onChange={e => setEntityType(e.target.value as StandardEvidenceEntityType)}>
                              {STANDARD_EVIDENCE_ENTITY_TYPES.map(t => <option key={t} value={t}>{STANDARD_EVIDENCE_ENTITY_TYPE_LABELS[t]}</option>)}
                            </select>
                          </div>
                          <div className="flex-1 min-w-[200px]">
                            <label className="label">Record id</label>
                            <input className="input" value={entityId} onChange={e => setEntityId(e.target.value)} placeholder="Paste the record's id" />
                          </div>
                          <button type="submit" className="btn-secondary btn-sm" disabled={busy}>
                            <Plus size={14} className="mr-1" /> Link evidence
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
            <ShieldCheck size={16} /> Certifications
          </h3>
          <button type="button" className="btn-cta btn-sm" onClick={() => setCertOpen(o => !o)}>
            <Plus size={14} className="mr-1" /> Add certification
          </button>
        </div>

        {certOpen && (
          <form onSubmit={addCertification} className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Standard</label>
              <select className="input" value={certStandard} onChange={e => setCertStandard(e.target.value)}>
                {standards.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Certificate number</label>
              <input className="input" value={certNumber} onChange={e => setCertNumber(e.target.value)} />
            </div>
            <div>
              <label className="label">Certifying body</label>
              <input className="input" value={certBody} onChange={e => setCertBody(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Issued</label>
                <input type="date" className="input" value={certIssued} onChange={e => setCertIssued(e.target.value)} />
              </div>
              <div>
                <label className="label">Expires</label>
                <input type="date" className="input" value={certExpires} onChange={e => setCertExpires(e.target.value)} />
              </div>
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-cta btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save certification'}</button>
            </div>
          </form>
        )}

        {certifications.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No certifications on file.</p>
        ) : (
          <ul className="space-y-2">
            {certifications.map(c => {
              const std = standards.find(s => s.id === c.standard_id);
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
    </div>
  );
}
