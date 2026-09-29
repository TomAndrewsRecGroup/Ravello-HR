'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { useToast } from '@/components/modules/Toast';
import { evidenceUrl } from '@/lib/hs/evidence';
import { HS_AUDIT_RATING_LABELS, HS_REGISTER_CATEGORY_LABELS, AUDIT_FINDING_SEVERITY_LABELS, type HsRegisterCategory } from '@/lib/hs/vocab';
import type { HsAudit, HsAuditResponse, HsFile, AuditFinding, RequirementEvidenceLink } from '@/lib/hs/types';
import EvidenceLinksPanel from './EvidenceLinksPanel';

interface Props {
  audit:     HsAudit;
  responses: HsAuditResponse[];
  files:     HsFile[];
  findings:  AuditFinding[];
  evidenceLinks: RequirementEvidenceLink[];
  loadError: string | null;
}

const SEVERITY_COLOUR: Record<string, string> = { minor: 'var(--ink-faint)', major: 'var(--gold)', critical: 'var(--red)' };

// Core-OS 360 Phase 5, Group 7 (162): the closure gate is enforced
// entirely by the database (audit_findings_closure_guard()) — this
// component never pre-validates the close attempt, and surfaces
// whatever the trigger refuses verbatim via the toast.
function FindingPanel({ finding, evidenceLinks }: { finding: AuditFinding; evidenceLinks: RequirementEvidenceLink[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [rootCause, setRootCause] = useState(finding.root_cause ?? '');
  const [actionId, setActionId] = useState(finding.corrective_action_id ?? '');
  const [busy, setBusy] = useState(false);

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    const res = await createClient().from('audit_findings').update(patch, COUNT_EXACT).eq('id', finding.id);
    setBusy(false);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Could not update the finding.', 'error'); return; }
    router.refresh();
  }

  return (
    <div className="mt-3 p-3 rounded-[8px]" style={{ background: 'var(--surface-alt)' }}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: SEVERITY_COLOUR[finding.severity] }}>
          {AUDIT_FINDING_SEVERITY_LABELS[finding.severity]} finding
        </span>
        {finding.closed_at ? (
          <span className="badge" style={{ color: 'var(--success)' }}>Closed</span>
        ) : (
          <span className="badge" style={{ color: 'var(--ink-faint)' }}>Open</span>
        )}
      </div>
      {!finding.closed_at && (
        <div className="mt-2 space-y-2">
          <label className="block">
            <span className="label">Root cause</span>
            <textarea className="input" rows={2} value={rootCause} maxLength={2000}
              onChange={e => setRootCause(e.target.value)} onBlur={() => rootCause !== (finding.root_cause ?? '') && save({ root_cause: rootCause.trim() || null })} />
          </label>
          <label className="block">
            <span className="label">Linked corrective action id</span>
            <input className="input" value={actionId} placeholder="Paste the corrective action's id"
              onChange={e => setActionId(e.target.value)} onBlur={() => actionId !== (finding.corrective_action_id ?? '') && save({ corrective_action_id: actionId.trim() || null })} />
          </label>
          <button className="btn-secondary btn-sm" disabled={busy} onClick={() => save({ closed_at: new Date().toISOString() })}>
            Close finding
          </button>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            A major or critical finding cannot be closed until it has a root cause, a linked corrective action, and that
            action has been completed, verified and confirmed effective.
          </p>
        </div>
      )}
      <div className="mt-3">
        <EvidenceLinksPanel companyId={finding.company_id} sourceType="audit_finding" sourceId={finding.id} links={evidenceLinks} />
      </div>
    </div>
  );
}

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const RATING_COLOUR: Record<string, string> = { pass: 'var(--teal)', fail: 'var(--red)', na: 'var(--ink-faint)' };

export default function AuditDetailClient({ audit, responses, files, findings, evidenceLinks, loadError }: Props) {
  const { toast } = useToast();

  async function openFile(f: HsFile) {
    const url = await evidenceUrl(createClient(), f.storage_path);
    if (url) window.open(url, '_blank', 'noopener');
    else toast('Could not open that file.', 'error');
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h1 className="font-display font-semibold" style={{ color: 'var(--ink)' }}>{audit.title}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--ink-faint)' }}>
          {fmt(audit.conducted_on)} · {audit.score == null ? 'no score' : `${Math.round(audit.score)}%`} · recorded by {audit.recorded_by_kind}
        </p>
        {audit.notes && <p className="text-sm mt-2 whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{audit.notes}</p>}
      </div>

      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load responses: {loadError}</p>}

      <ul className="card divide-y" style={{ borderColor: 'var(--line)' }}>
        {responses.map(r => {
          const attached = files.filter(f => f.entity_id === r.id);
          return (
            <li key={r.id} className="p-4">
              <div className="flex items-start gap-3">
                <span
                  className="px-2 py-0.5 rounded-[6px] text-xs font-semibold uppercase tracking-wide shrink-0"
                  style={{ background: 'var(--surface-alt)', color: RATING_COLOUR[r.rating] }}
                >
                  {HS_AUDIT_RATING_LABELS[r.rating]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{r.prompt}</p>
                  {r.category && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                      {(HS_REGISTER_CATEGORY_LABELS as Record<string, string>)[r.category as HsRegisterCategory] ?? r.category}
                    </p>
                  )}
                  {r.comment && <p className="text-sm mt-1.5 whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{r.comment}</p>}
                  {attached.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {attached.map(f => (
                        <li key={f.id}>
                          <button className="btn-ghost btn-sm" onClick={() => openFile(f)}><FileText size={13} /> {f.file_name}</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {findings.filter(fd => fd.hs_audit_response_id === r.id).map(fd => (
                    <FindingPanel key={fd.id} finding={fd} evidenceLinks={evidenceLinks} />
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
