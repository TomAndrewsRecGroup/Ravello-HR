'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send, Ban } from 'lucide-react';
import FileLink from '@/components/modules/FileLink';
import { DOCUMENT_INSTANCE_STATUS_LABELS, type DocumentInstance } from '@/lib/documentTemplates/types';

// HR Documents tab (Part 2, Group 6). Only ever rendered when the
// viewer is a company super-user — document_instances' own client
// RLS already restricts reads/writes to one, and this tab's job is
// to let that person track, resend or void what has been generated
// for this employee, not to expose it to every signed-in colleague.

interface Props { instances: DocumentInstance[] }

const STATUS_TONE: Record<string, string> = {
  draft: 'var(--ink-faint)', sent_for_signature: 'var(--gold)', signed: 'var(--teal)',
  declined: 'var(--red)', voided: 'var(--ink-faint)',
};

function fmt(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function DocumentsTab({ instances }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: 'resend' | 'void') {
    setBusy(`${action}:${id}`);
    setError(null);
    try {
      const res = await fetch(`/api/lead/document-templates/${id}/${action}`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? `Could not ${action} this document.`); return; }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (instances.length === 0) {
    return (
      <div className="card p-5">
        <h2 className="font-display text-base font-semibold mb-1" style={{ color: 'var(--ink)' }}>HR Documents</h2>
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No documents have been generated for this person yet.</p>
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-3">
      <h2 className="font-display text-base font-semibold" style={{ color: 'var(--ink)' }}>HR Documents</h2>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
        {instances.map(i => {
          const resendBusy = busy === `resend:${i.id}`;
          const voidBusy = busy === `void:${i.id}`;
          return (
            <li key={i.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{i.rendered_title}</p>
                <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                  <span style={{ color: STATUS_TONE[i.status] }}>{DOCUMENT_INSTANCE_STATUS_LABELS[i.status]}</span>
                  {' · '}{fmt(i.declined_at ?? i.signed_at ?? i.voided_at ?? i.sent_for_signature_at ?? i.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {i.storage_path && (
                  <FileLink kind="document_instance" id={i.id} storagePath={i.storage_path} className="btn-ghost btn-sm">
                    View PDF
                  </FileLink>
                )}
                {i.status === 'sent_for_signature' && (
                  <button type="button" className="btn-secondary btn-sm" disabled={resendBusy} onClick={() => act(i.id, 'resend')}>
                    {resendBusy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Resend
                  </button>
                )}
                {(i.status === 'draft' || i.status === 'sent_for_signature') && (
                  <button
                    type="button" className="btn-icon btn-sm" disabled={voidBusy} title="Void" aria-label="Void"
                    style={{ color: 'var(--red)' }} onClick={() => act(i.id, 'void')}
                  >
                    {voidBusy ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
