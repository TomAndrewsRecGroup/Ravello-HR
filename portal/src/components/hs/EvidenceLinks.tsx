'use client';
import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { evidenceUrl } from '@/lib/hs/evidence';

// Opens an H&S evidence file with a short-lived link signed under the
// client's own session: the hs-evidence storage policy (095) lets a
// client read only its own company's folder.
export default function EvidenceLinks({ files }: { files: { id: string; storage_path: string; file_name: string }[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  if (files.length === 0) return null;

  async function open(f: { id: string; storage_path: string }) {
    setBusy(f.id); setFailed(null);
    const url = await evidenceUrl(createClient(), f.storage_path);
    setBusy(null);
    if (url) window.open(url, '_blank', 'noopener');
    else setFailed(f.id);
  }

  return (
    <ul className="flex flex-wrap gap-2 mt-2">
      {files.map(f => (
        <li key={f.id}>
          <button type="button" className="btn-ghost btn-sm" onClick={() => open(f)} disabled={busy === f.id}>
            {busy === f.id ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} {f.file_name}
          </button>
          {failed === f.id && <span className="text-xs ml-1" style={{ color: 'var(--danger)' }}>Could not open</span>}
        </li>
      ))}
    </ul>
  );
}
