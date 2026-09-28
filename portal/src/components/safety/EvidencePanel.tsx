'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Loader2, Paperclip } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { uploadEvidence, HS_EVIDENCE_ACCEPT } from '@/lib/hs/evidence';
import EvidenceLinks from '@/components/hs/EvidenceLinks';

export interface EvidenceFile { id: string; storage_path: string; file_name: string; evidence_type?: string | null; description?: string | null }

const TYPES: { value: string; label: string; sensitive?: boolean }[] = [
  { value: 'photo', label: 'Photograph' }, { value: 'document', label: 'Document' },
  { value: 'witness_statement', label: 'Witness statement', sensitive: true }, { value: 'medical', label: 'Medical', sensitive: true },
  { value: 'sketch', label: 'Sketch / plan' }, { value: 'cctv_reference', label: 'CCTV reference' }, { value: 'permit', label: 'Permit' },
  { value: 'rams', label: 'RAMS' }, { value: 'training_evidence', label: 'Training evidence' },
  { value: 'maintenance_record', label: 'Maintenance record' }, { value: 'equipment_evidence', label: 'Equipment evidence' },
  { value: 'sds', label: 'Safety data sheet' }, { value: 'certificate', label: 'Certificate' }, { value: 'other', label: 'Other' },
];

// Private evidence on any safety record. Files go straight from the
// browser to the private hs-evidence bucket under the user's own
// session; the storage policy and hs_files RLS (122) decide who may
// upload and who may read. Witness statements and medical evidence are
// readable only with incident.sensitive.read — the list the server
// passes in is already filtered by that rule.
export default function EvidencePanel({ companyId, entityType, entityId, files, canUpload, sensitiveTypes = false }: {
  companyId: string; entityType: string; entityId: string; files: EvidenceFile[]; canUpload: boolean;
  /** Offer witness statement / medical (incident records only). */
  sensitiveTypes?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState('photo');
  const [description, setDescription] = useState('');

  async function onFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true); setError(null);
    const sb = createClient();
    const problems: string[] = [];
    for (const file of Array.from(list)) {
      const p = await uploadEvidence(sb, { companyId, entityType, entityId, file, evidenceType: type, description: description.trim() || null });
      if (p) problems.push(p);
    }
    setBusy(false);
    if (problems.length) setError(problems.join(' '));
    setDescription('');
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {files.length === 0
        ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No evidence attached yet.</p>
        : <EvidenceLinks files={files} />}
      {canUpload && (
        <div className="flex flex-wrap items-end gap-2 no-print">
          <label className="block">
            <span className="label">Kind</span>
            <select className="input" value={type} onChange={e => setType(e.target.value)}>
              {TYPES.filter(t => sensitiveTypes || !t.sensitive).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="block flex-1 min-w-[180px]">
            <span className="label">Note (optional)</span>
            <input className="input" value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} />
          </label>
          <label className="btn-secondary btn-sm cursor-pointer" style={{ minHeight: 44 }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} Take photo
            <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={e => onFiles(e.target.files)} />
          </label>
          <label className="btn-ghost btn-sm cursor-pointer" style={{ minHeight: 44 }}>
            <Paperclip size={14} /> Attach file
            <input type="file" multiple accept={HS_EVIDENCE_ACCEPT.join(',')} className="sr-only" disabled={busy} onChange={e => onFiles(e.target.files)} />
          </label>
        </div>
      )}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  );
}
