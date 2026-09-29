'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Link2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/modules/Toast';
import { STANDARD_EVIDENCE_ENTITY_TYPES, STANDARD_EVIDENCE_ENTITY_TYPE_LABELS, type StandardEvidenceEntityType } from '@/lib/hs/vocab';
import type { RequirementEvidenceLink } from '@/lib/hs/types';

// Core-OS 360 Phase 5, Group 8 (migration 163): the evidence-link
// foundation's one UI — reused, unchanged, across every source page (a
// legal obligation on /health-safety/<companyId>/legal, an objective on
// .../objectives, an audit finding on the audit detail page, and — Phase
// 6, Group 5 (170) — a roadmap milestone in the client Roadmap tab).
// Mirrors IsoClient.tsx's add/list/remove pattern for
// standard_evidence_links exactly, generalised over a caller-supplied
// sourceType/sourceId rather than a fixed clause_id — this is purely an
// explicit human-made link, insert or delete, never an update (the
// same "a wrong link is removed, not edited" rule the sibling table
// already follows). It reuses the SAME entity-type vocabulary the ISO
// evidence picker already uses — the evidence side of both tables is
// the same set of existing record kinds.

interface Props {
  companyId: string;
  sourceType: 'legal_obligation' | 'objective' | 'audit_finding' | 'milestone';
  sourceId: string;
  links: RequirementEvidenceLink[];
  onChange?: () => void;
}

export default function EvidenceLinksPanel({ companyId, sourceType, sourceId, links, onChange }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [entityType, setEntityType] = useState<StandardEvidenceEntityType>('document');
  const [entityId, setEntityId] = useState('');

  const ownLinks = links.filter(l => l.source_type === sourceType && l.source_id === sourceId);

  function refresh() {
    router.refresh();
    onChange?.();
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    if (!entityId.trim()) { toast("Enter the id of the existing record this is evidenced by.", 'error'); return; }
    setBusy(true);
    const { error } = await createClient().from('requirement_evidence_links').insert({
      company_id: companyId, source_type: sourceType, source_id: sourceId,
      entity_type: entityType, entity_id: entityId.trim(),
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Evidence linked', 'success');
    setEntityId(''); setOpen(false);
    refresh();
  }

  async function removeLink(linkId: string) {
    setBusy(true);
    const { error } = await createClient().from('requirement_evidence_links').delete().eq('id', linkId);
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--ink-faint)' }}>
          <Link2 size={12} /> Evidence ({ownLinks.length})
        </p>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(o => !o)}>
          <Plus size={12} className="mr-1" /> Link evidence
        </button>
      </div>

      {ownLinks.length > 0 && (
        <ul className="space-y-1">
          {ownLinks.map(l => (
            <li key={l.id} className="flex items-center justify-between text-sm">
              <span>
                {STANDARD_EVIDENCE_ENTITY_TYPE_LABELS[l.entity_type as StandardEvidenceEntityType] ?? l.entity_type}
                {' — '}
                <span className="font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{l.entity_id}</span>
              </span>
              <button type="button" className="text-xs" style={{ color: 'var(--red)' }} onClick={() => removeLink(l.id)} disabled={busy}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <form onSubmit={addLink} className="flex flex-wrap items-end gap-2">
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
            {busy ? 'Linking…' : 'Link'}
          </button>
        </form>
      )}
    </div>
  );
}
