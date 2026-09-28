import Link from 'next/link';
import { DOC_STATUS_LABELS, type DocStatus } from '@/lib/hs/safetyVocab';
import { fmtDate, fmtDateTime } from '@/lib/hs/safetyContext';
import Pill, { toneFor } from './Pill';

export interface VersionRow { id: string; version: number; status: DocStatus; created_at: string; approved_at: string | null }

// Approval stamps and the version history of a controlled document
// (RAMS / COSHH). Every row with the same reference is a version; the
// stamps are the database's (hs_doc_guard), shown as recorded.
export function DocStamps({ stamps }: { stamps: { label: string; who: string | null; when: string | null }[] }) {
  const shown = stamps.filter(s => s.when);
  if (shown.length === 0) return <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>Not yet submitted or approved.</p>;
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {shown.map(s => (
        <div key={s.label}>
          <dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>{s.label}</dt>
          <dd style={{ color: 'var(--ink)' }}>{s.who ?? '—'} · {fmtDateTime(s.when)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function VersionHistory({ versions, currentId, hrefFor }: { versions: VersionRow[]; currentId: string; hrefFor: (id: string) => string }) {
  return (
    <ul className="text-sm space-y-1">
      {versions.map(v => (
        <li key={v.id} className="flex flex-wrap items-center gap-2">
          {v.id === currentId
            ? <span className="font-semibold" style={{ color: 'var(--ink)' }}>Version {v.version} (this one)</span>
            : <Link href={hrefFor(v.id)}>Version {v.version}</Link>}
          <Pill tone={toneFor(v.status)}>{DOC_STATUS_LABELS[v.status]}</Pill>
          <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            created {fmtDate(v.created_at)}{v.approved_at ? ` · approved ${fmtDate(v.approved_at)}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Notice({ tone, children }: { tone: 'warn' | 'bad' | 'info'; children: React.ReactNode }) {
  const c = tone === 'bad' ? 'var(--red)' : tone === 'warn' ? 'var(--gold)' : 'var(--blue)';
  return (
    <div className="card p-3 text-sm" style={{ borderLeft: `4px solid ${c}`, color: 'var(--ink-soft)' }}>{children}</div>
  );
}

export function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>{label}</dt><dd style={{ color: 'var(--ink)' }}>{value}</dd></div>;
}

export function Prose({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase" style={{ color: 'var(--ink-faint)' }}>{title}</h3>
      <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{children}</p>
    </div>
  );
}
