'use client';
import { FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/modules/Toast';
import { evidenceUrl } from '@/lib/hs/evidence';
import { HS_AUDIT_RATING_LABELS, HS_REGISTER_CATEGORY_LABELS, type HsRegisterCategory } from '@/lib/hs/vocab';
import type { HsAudit, HsAuditResponse, HsFile } from '@/lib/hs/types';

interface Props {
  audit:     HsAudit;
  responses: HsAuditResponse[];
  files:     HsFile[];
  loadError: string | null;
}

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const RATING_COLOUR: Record<string, string> = { pass: 'var(--teal)', fail: 'var(--red)', na: 'var(--ink-faint)' };

export default function AuditDetailClient({ audit, responses, files, loadError }: Props) {
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
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
