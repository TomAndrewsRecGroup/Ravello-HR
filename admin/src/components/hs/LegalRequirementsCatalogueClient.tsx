'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Scale, Megaphone } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/modules/Toast';
import { LEGAL_REQUIREMENT_CATEGORIES, LEGAL_REQUIREMENT_CATEGORY_LABELS, type LegalRequirementCategory } from '@/lib/hs/vocab';
import type { LegalRequirement } from '@/lib/hs/types';

interface Props {
  requirements: LegalRequirement[];
  loadError: string | null;
}

// Staff-only reference catalogue — a title, category, jurisdiction and
// a short internal summary staff write themselves, never the actual
// statute text (migration 159's own rule 4). Applicability and
// evaluation live per client on /health-safety/<companyId>/legal.
export default function LegalRequirementsCatalogueClient({ requirements, loadError }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<LegalRequirementCategory>('general');
  const [jurisdiction, setJurisdiction] = useState('UK');
  const [summary, setSummary] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('legal_requirements').insert({
      title: title.trim(), category, jurisdiction: jurisdiction.trim() || 'UK',
      summary: summary.trim() || null, source_url: sourceUrl.trim() || null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Legal requirement added', 'success');
    setTitle(''); setSummary(''); setSourceUrl(''); setOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>{loadError}</p>}
      <div className="flex justify-end">
        <button type="button" className="btn-cta btn-sm" onClick={() => setOpen(o => !o)}><Plus size={14} className="mr-1" /> Add legal requirement</button>
      </div>
      {open && (
        <form onSubmit={submit} className="card p-4 grid grid-cols-2 gap-3 items-end">
          <div className="col-span-2">
            <label className="label">Title</label>
            <input className="input" required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Health and Safety at Work etc. Act 1974" />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={category} onChange={e => setCategory(e.target.value as LegalRequirementCategory)}>
              {LEGAL_REQUIREMENT_CATEGORIES.map(c => <option key={c} value={c}>{LEGAL_REQUIREMENT_CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Jurisdiction</label>
            <input className="input" value={jurisdiction} onChange={e => setJurisdiction(e.target.value)} placeholder="UK" />
          </div>
          <div className="col-span-2">
            <label className="label">Internal summary (never the statute text itself)</label>
            <textarea className="input" rows={2} value={summary} onChange={e => setSummary(e.target.value)} placeholder="A short, staff-written paraphrase of what this requirement covers." />
          </div>
          <div className="col-span-2">
            <label className="label">Source link (optional)</label>
            <input className="input" type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://www.legislation.gov.uk/..." />
          </div>
          <button type="submit" className="btn-cta btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </form>
      )}
      {requirements.length === 0 ? (
        <div className="card p-12"><div className="empty-state"><Scale size={28} style={{ color: 'var(--blue)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No legal requirements on file yet</p></div></div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Title</th><th>Category</th><th>Jurisdiction</th><th>Source</th><th></th></tr></thead>
            <tbody>
              {requirements.map(r => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.title}</strong>
                    {r.summary && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{r.summary}</p>}
                  </td>
                  <td><span className="badge">{LEGAL_REQUIREMENT_CATEGORY_LABELS[r.category] ?? r.category}</span></td>
                  <td>{r.jurisdiction}</td>
                  <td>
                    {r.source_url
                      ? <a href={r.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--purple)' }}>Source</a>
                      : <span style={{ color: 'var(--ink-faint)' }}>—</span>}
                  </td>
                  <td>
                    {/* Prefills the Broadcast compose form and pre-selects every
                        client whose own register already holds this requirement
                        as 'applicable' — the same reviewed-before-sending confirm
                        modal as any other broadcast; nothing sends automatically. */}
                    <Link
                      href={`/broadcast?legal=${r.id}`}
                      className="btn-ghost btn-sm flex items-center gap-1.5 whitespace-nowrap"
                      title="Broadcast an update about this requirement to affected clients"
                    >
                      <Megaphone size={13} /> Broadcast
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
