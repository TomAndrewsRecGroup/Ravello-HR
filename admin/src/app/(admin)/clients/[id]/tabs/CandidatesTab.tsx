'use client';

import { useState } from 'react';
import { Loader2, Plus, X, User, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';

import { CANDIDATE_CLIENT_STATUS_LABELS, labelFor } from '@/lib/ui/statusMaps';
const CLIENT_STATUS_STYLE: Record<string, React.CSSProperties> = {
  pending:        { background: 'rgba(148,163,184,0.1)', color: 'var(--slate)' },
  approved:       { background: 'rgba(22,163,74,0.1)',   color: 'var(--emerald)' },
  rejected:       { background: 'rgba(220,38,38,0.1)',   color: 'var(--rose)' },
  info_requested: { background: 'rgba(217,119,6,0.1)',   color: 'var(--amber)' },
};

interface Props {
  companyId: string;
  initialCandidates: any[];
  reqs: any[];
}

export default function CandidatesTab({ companyId, initialCandidates, reqs }: Props) {
  const supabase = createClient();
  const [candidates,    setCandidates]   = useState<any[]>(initialCandidates);
  const [showCandForm,  setShowCandForm] = useState(false);
  const [candForm,      setCandForm]     = useState({
    full_name: '', email: '', phone: '', summary: '', cv_url: '',
    recruiter_notes: '', requisition_id: '', approved_for_client: false,
  });
  const [savingCand,    setSavingCand]   = useState(false);
  const [togglingCand,  setTogglingCand] = useState<string | null>(null);

  async function saveCandidate() {
    if (!candForm.full_name || !candForm.requisition_id) return;
    setSavingCand(true);
    const { data, error } = await supabase
      .from('candidates')
      .insert({ ...candForm, company_id: companyId })
      .select()
      .single();
    if (!error && data) {
      setCandidates(prev => [data, ...prev]);
      revalidateAdminPath('/clients');
    }
    setSavingCand(false);
    setShowCandForm(false);
    setCandForm({ full_name: '', email: '', phone: '', summary: '', cv_url: '', recruiter_notes: '', requisition_id: '', approved_for_client: false });
  }

  async function toggleApproved(id: string, current: boolean) {
    setTogglingCand(id);
    const { error } = await supabase.from('candidates').update({ approved_for_client: !current }).eq('id', id);
    if (!error) {
      setCandidates(prev => prev.map(c => c.id === id ? { ...c, approved_for_client: !current } : c));
      revalidateAdminPath('/clients');
    }
    setTogglingCand(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
          Candidates ({candidates.length})
        </h2>
        <button onClick={() => setShowCandForm(v => !v)} className="btn-cta btn-sm flex items-center gap-1.5">
          <Plus size={13} /> Add Candidate
        </button>
      </div>

      {showCandForm && (
        <div className="card p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Full name *</label>
              <input className="input" placeholder="Jane Smith" value={candForm.full_name} onChange={e => setCandForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Role *</label>
              <select className="input" value={candForm.requisition_id} onChange={e => setCandForm(f => ({ ...f, requisition_id: e.target.value }))}>
                <option value="">Select role…</option>
                {reqs.filter((r: any) => !['filled','cancelled'].includes(r.stage)).map((r: any) => (
                  <option key={r.id} value={r.id}>{r.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" placeholder="jane@example.com" value={candForm.email} onChange={e => setCandForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" placeholder="+44 7700 000000" value={candForm.phone} onChange={e => setCandForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Summary</label>
              <textarea className="input h-20 resize-none" placeholder="Brief candidate overview…" value={candForm.summary} onChange={e => setCandForm(f => ({ ...f, summary: e.target.value }))} />
            </div>
            <div>
              <label className="label">CV / LinkedIn URL</label>
              <input type="url" className="input" placeholder="https://…" value={candForm.cv_url} onChange={e => setCandForm(f => ({ ...f, cv_url: e.target.value }))} />
            </div>
            <div>
              <label className="label">Recruiter notes</label>
              <input className="input" placeholder="Internal notes (not shown to client)" value={candForm.recruiter_notes} onChange={e => setCandForm(f => ({ ...f, recruiter_notes: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={candForm.approved_for_client} onChange={e => setCandForm(f => ({ ...f, approved_for_client: e.target.checked }))} className="w-4 h-4 accent-purple-600" />
                <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Share with client immediately</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveCandidate} disabled={savingCand || !candForm.full_name || !candForm.requisition_id} className="btn-cta btn-sm flex items-center gap-1.5">
              {savingCand ? <Loader2 size={12} className="animate-spin" /> : null} Save Candidate
            </button>
            <button onClick={() => setShowCandForm(false)} className="btn-ghost btn-sm flex items-center gap-1"><X size={12} /> Cancel</button>
          </div>
        </div>
      )}

      {candidates.length === 0 && !showCandForm ? (
        <div className="card empty-state">No candidates added yet.</div>
      ) : (
        <div className="space-y-6">
          {reqs.map((r: any) => {
            const rCands = candidates.filter((c: any) => c.requisition_id === r.id);
            if (rCands.length === 0) return null;
            return (
              <div key={r.id}>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-faint)' }}>
                  {r.title}: {rCands.length} candidate{rCands.length !== 1 ? 's' : ''}
                </p>
                <div className="card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--surface-alt)' }}>
                        {['Name', 'Summary', 'CV', 'Client Status', 'Feedback', 'Share'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rCands.map((c: any) => (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--line)' }}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(124,58,237,0.1)' }}>
                                <User size={13} style={{ color: 'var(--purple)' }} />
                              </div>
                              <div>
                                <p className="font-medium text-xs" style={{ color: 'var(--ink)' }}>{c.full_name}</p>
                                {c.email && <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>{c.email}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 max-w-[200px]">
                            <p className="text-xs truncate" style={{ color: 'var(--ink-soft)' }}>{c.summary ?? '-'}</p>
                          </td>
                          <td className="px-4 py-3">
                            {c.cv_url ? (
                              <a href={c.cv_url} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm flex items-center gap-1 w-fit">
                                <ExternalLink size={11} /> CV
                              </a>
                            ) : <span style={{ color: 'var(--ink-faint)' }}>-</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={CLIENT_STATUS_STYLE[c.client_status] ?? CLIENT_STATUS_STYLE.pending}>
                              {labelFor(CANDIDATE_CLIENT_STATUS_LABELS, c.client_status, 'pending')}
                            </span>
                          </td>
                          <td className="px-4 py-3 max-w-[160px]">
                            <p className="text-xs truncate" style={{ color: 'var(--ink-faint)' }}>{c.client_feedback ?? '-'}</p>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => toggleApproved(c.id, c.approved_for_client)}
                              disabled={togglingCand === c.id}
                              className={`text-[11px] font-semibold px-2 py-1 rounded-full transition-all ${c.approved_for_client ? 'btn-secondary' : 'btn-cta'} btn-sm`}
                            >
                              {togglingCand === c.id ? <Loader2 size={10} className="animate-spin" /> : c.approved_for_client ? 'Unshare' : 'Share'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
