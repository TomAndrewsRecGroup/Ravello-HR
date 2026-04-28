'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';

import { REVIEW_TYPE_LABELS, labelFor } from '@/lib/ui/statusMaps';
const PRIORITY_STYLE: Record<string, React.CSSProperties> = {
  high:   { background: 'rgba(220,38,38,0.1)',   color: 'var(--rose)' },
  medium: { background: 'rgba(217,119,6,0.1)',   color: 'var(--amber)' },
  low:    { background: 'rgba(148,163,184,0.1)', color: 'var(--slate)' },
};

interface Props {
  companyId: string;
  initialTrainingNeeds: any[];
  initialPerfReviews: any[];
}

export default function LeadTab({ companyId, initialTrainingNeeds, initialPerfReviews }: Props) {
  const supabase = createClient();
  const [trainingNeeds, setTrainingNeeds] = useState<any[]>(initialTrainingNeeds);
  const [perfReviews,   setPerfReviews]   = useState<any[]>(initialPerfReviews);

  // Inline "Add training need" and "Add review reminder" state.
  const [showTrainingForm, setShowTrainingForm] = useState(false);
  const [trainingForm, setTrainingForm] = useState({ employee_name: '', skill: '', priority: 'medium' });
  const [savingTraining, setSavingTraining] = useState(false);

  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewForm, setReviewForm] = useState({ employee_name: '', review_type: 'annual', scheduled_date: '' });
  const [savingReview, setSavingReview] = useState(false);

  async function addTrainingNeed(e: React.FormEvent) {
    e.preventDefault();
    if (!trainingForm.employee_name.trim() || !trainingForm.skill.trim()) return;
    setSavingTraining(true);
    const { data, error } = await supabase.from('training_needs').insert({
      company_id:    companyId,
      employee_name: trainingForm.employee_name.trim(),
      skill:         trainingForm.skill.trim(),
      priority:      trainingForm.priority,
      status:        'open',
    }).select('*').single();
    setSavingTraining(false);
    if (!error && data) {
      setTrainingNeeds(prev => [data, ...prev]);
      setTrainingForm({ employee_name: '', skill: '', priority: 'medium' });
      setShowTrainingForm(false);
      revalidateAdminPath(`/clients/${companyId}`);
    }
  }

  async function addReviewReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewForm.employee_name.trim() || !reviewForm.scheduled_date) return;
    setSavingReview(true);
    const { data, error } = await supabase.from('performance_reviews').insert({
      company_id:     companyId,
      employee_name:  reviewForm.employee_name.trim(),
      review_type:    reviewForm.review_type,
      scheduled_date: reviewForm.scheduled_date,
      status:         'scheduled',
    }).select('*').single();
    setSavingReview(false);
    if (!error && data) {
      setPerfReviews(prev => [data, ...prev]);
      setReviewForm({ employee_name: '', review_type: 'annual', scheduled_date: '' });
      setShowReviewForm(false);
      revalidateAdminPath(`/clients/${companyId}`);
    }
  }

  async function updateTrainingStatus(id: string, status: string) {
    const { error } = await supabase.from('training_needs').update({ status }).eq('id', id);
    if (!error) {
      setTrainingNeeds(prev => prev.map(n => n.id === id ? { ...n, status } : n));
      revalidateAdminPath('/clients');
    }
  }

  async function updateReviewStatus(id: string, status: string) {
    const extra: Record<string, string> = {};
    if (status === 'completed') extra.completed_at = new Date().toISOString();
    const { error } = await supabase.from('performance_reviews').update({ status, ...extra }).eq('id', id);
    if (!error) {
      setPerfReviews(prev => prev.map(r => r.id === id ? { ...r, status, ...extra } : r));
      revalidateAdminPath('/clients');
    }
  }

  return (
    <div className="space-y-8">
      {/* Training Needs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
            Training Needs
            <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: 'rgba(217,119,6,0.1)', color: 'var(--amber)' }}>
              {trainingNeeds.filter(n => n.status === 'open').length} open
            </span>
          </h2>
          {!showTrainingForm && (
            <button onClick={() => setShowTrainingForm(true)} className="btn-cta btn-sm">+ Add training need</button>
          )}
        </div>
        {showTrainingForm && (
          <form onSubmit={addTrainingNeed} className="card p-4 mb-4 grid sm:grid-cols-3 gap-2">
            <input className="input" placeholder="Employee name" value={trainingForm.employee_name} onChange={e => setTrainingForm(f => ({ ...f, employee_name: e.target.value }))} required />
            <input className="input" placeholder="Skill / topic" value={trainingForm.skill} onChange={e => setTrainingForm(f => ({ ...f, skill: e.target.value }))} required />
            <select className="input" value={trainingForm.priority} onChange={e => setTrainingForm(f => ({ ...f, priority: e.target.value }))}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <div className="sm:col-span-3 flex justify-end gap-2">
              <button type="button" onClick={() => setShowTrainingForm(false)} className="btn-secondary btn-sm" disabled={savingTraining}>Cancel</button>
              <button type="submit" className="btn-cta btn-sm" disabled={savingTraining}>{savingTraining ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        )}
        {trainingNeeds.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No training needs flagged.</p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Skill Gap</th>
                  <th>Employee</th>
                  <th>Priority</th>
                  <th>Target Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {trainingNeeds.map((n: any) => (
                  <tr key={n.id}>
                    <td>
                      <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{n.skill_gap}</p>
                      {n.notes && <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{n.notes}</p>}
                    </td>
                    <td style={{ color: 'var(--ink-soft)' }}>{[n.employee_name, n.department].filter(Boolean).join(' · ') || '-'}</td>
                    <td>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={PRIORITY_STYLE[n.priority] ?? PRIORITY_STYLE.medium}>
                        {n.priority}
                      </span>
                    </td>
                    <td style={{ color: 'var(--ink-soft)' }}>{n.target_date ? new Date(n.target_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</td>
                    <td>
                      <select
                        className="text-xs rounded-[6px] px-2 py-1 border"
                        style={{ borderColor: 'var(--line)', color: 'var(--ink-soft)', fontSize: '11px' }}
                        value={n.status}
                        onChange={e => updateTrainingStatus(n.id, e.target.value)}
                      >
                        {['open', 'in_progress', 'resolved', 'deferred'].map(s => (
                          <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Performance Reviews */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
            Performance Reviews
            <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: 'rgba(124,58,237,0.1)', color: 'var(--purple)' }}>
              {perfReviews.filter(r => ['pending', 'in_progress', 'scheduled'].includes(r.status)).length} pending
            </span>
          </h2>
          {!showReviewForm && (
            <button onClick={() => setShowReviewForm(true)} className="btn-cta btn-sm">+ Schedule review</button>
          )}
        </div>
        {showReviewForm && (
          <form onSubmit={addReviewReminder} className="card p-4 mb-4 grid sm:grid-cols-3 gap-2">
            <input className="input" placeholder="Employee name" value={reviewForm.employee_name} onChange={e => setReviewForm(f => ({ ...f, employee_name: e.target.value }))} required />
            <select className="input" value={reviewForm.review_type} onChange={e => setReviewForm(f => ({ ...f, review_type: e.target.value }))}>
              <option value="annual">Annual</option>
              <option value="quarterly">Quarterly</option>
              <option value="probation">Probation</option>
              <option value="ad_hoc">Ad-hoc</option>
            </select>
            <input type="date" className="input" value={reviewForm.scheduled_date} onChange={e => setReviewForm(f => ({ ...f, scheduled_date: e.target.value }))} required />
            <div className="sm:col-span-3 flex justify-end gap-2">
              <button type="button" onClick={() => setShowReviewForm(false)} className="btn-secondary btn-sm" disabled={savingReview}>Cancel</button>
              <button type="submit" className="btn-cta btn-sm" disabled={savingReview}>{savingReview ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        )}
        {perfReviews.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No performance reviews recorded.</p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Period</th>
                  <th>Type</th>
                  <th>Due Date</th>
                  <th>Rating</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {perfReviews.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{r.employee_name}</p>
                      {r.department && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{r.department}</p>}
                    </td>
                    <td style={{ color: 'var(--ink-soft)' }}>{r.review_period}</td>
                    <td style={{ color: 'var(--ink-soft)' }} className="capitalize">{labelFor(REVIEW_TYPE_LABELS, r.review_type)}</td>
                    <td style={{ color: 'var(--ink-soft)' }}>{r.due_date ? new Date(r.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</td>
                    <td style={{ color: 'var(--ink-soft)' }}>{r.overall_rating ?? '-'}</td>
                    <td>
                      <select
                        className="text-xs rounded-[6px] px-2 py-1 border"
                        style={{ borderColor: 'var(--line)', color: 'var(--ink-soft)', fontSize: '11px' }}
                        value={r.status}
                        onChange={e => updateReviewStatus(r.id, e.target.value)}
                      >
                        {['pending', 'in_progress', 'completed', 'cancelled'].map(s => (
                          <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
