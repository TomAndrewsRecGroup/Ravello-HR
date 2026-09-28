'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ACTION_CLASSES, ACTION_CLASS_LABELS, type ActionClass } from '@/lib/hs/safetyVocab';
import { ACTION_PRIORITIES, ACTION_PRIORITY_LABELS, type ActionPriority } from '@/lib/ui/statusMaps';

// Raise a corrective action from any safety record, on the ONE universal
// action table (119/125) — never a second action system. The database
// forces verification on for actions from major/critical/fatal incidents
// whatever is sent here, and checks the source is this organisation's.
export default function RaiseAction({ companyId, sourceType, sourceId, siteId, people, defaultTitle = '', defaultClass = 'corrective' }: {
  companyId: string; sourceType: string; sourceId: string; siteId?: string | null;
  people: { user_id: string; full_name: string }[]; defaultTitle?: string; defaultClass?: ActionClass;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState('');
  const [cls, setCls] = useState<ActionClass>(defaultClass);
  const [priority, setPriority] = useState<ActionPriority>('normal');
  const [assignee, setAssignee] = useState('');
  const [verifier, setVerifier] = useState('');
  const [due, setDue] = useState('');
  const [verify, setVerify] = useState(false);
  const [evidence, setEvidence] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error: err } = await createClient().from('actions').insert({
      company_id: companyId, action_type: 'hs_corrective', title: title.trim(), description: description.trim() || null,
      priority, status: 'active', source_type: sourceType, source_id: sourceId, site_id: siteId ?? null, action_class: cls,
      assigned_to: assignee || null, verifier_id: verifier || null, due_date: due || null,
      verification_required: verify, evidence_required: evidence,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setOpen(false); setDescription(''); setAssignee(''); setVerifier(''); setDue('');
    router.refresh();
  }

  if (!open) return <button className="btn-secondary btn-sm no-print" onClick={() => setOpen(true)}><Plus size={14} /> Raise action</button>;
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 pt-2 no-print" style={{ borderTop: '1px solid var(--line)' }}>
      <label className="block sm:col-span-2"><span className="label">Action</span>
        <input className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required /></label>
      <label className="block sm:col-span-2"><span className="label">Detail (optional)</span>
        <textarea className="input" rows={2} value={description} onChange={e => setDescription(e.target.value)} maxLength={4000} /></label>
      <label className="block"><span className="label">Type</span>
        <select className="input" value={cls} onChange={e => setCls(e.target.value as ActionClass)}>
          {ACTION_CLASSES.map(c => <option key={c} value={c}>{ACTION_CLASS_LABELS[c]}</option>)}</select></label>
      <label className="block"><span className="label">Priority</span>
        <select className="input" value={priority} onChange={e => setPriority(e.target.value as ActionPriority)}>
          {ACTION_PRIORITIES.map(p => <option key={p} value={p}>{ACTION_PRIORITY_LABELS[p]}</option>)}</select></label>
      <label className="block"><span className="label">Owner</span>
        <select className="input" value={assignee} onChange={e => setAssignee(e.target.value)}>
          <option value="">Unassigned</option>{people.map(p => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}</select></label>
      <label className="block"><span className="label">Due</span>
        <input className="input" type="date" value={due} onChange={e => setDue(e.target.value)} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={verify} onChange={e => setVerify(e.target.checked)} /> Must be verified by someone else</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={evidence} onChange={e => setEvidence(e.target.checked)} /> Evidence required to complete</label>
      {verify && (
        <label className="block"><span className="label">Verifier (optional)</span>
          <select className="input" value={verifier} onChange={e => setVerifier(e.target.value)}>
            <option value="">Anyone who assigns actions</option>{people.filter(p => p.user_id !== assignee).map(p => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}</select></label>
      )}
      {error && <p className="sm:col-span-2 text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <div className="sm:col-span-2 flex gap-2">
        <button className="btn-cta btn-sm" disabled={busy || !title.trim()}>{busy && <Loader2 size={14} className="animate-spin" />} Raise action</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
