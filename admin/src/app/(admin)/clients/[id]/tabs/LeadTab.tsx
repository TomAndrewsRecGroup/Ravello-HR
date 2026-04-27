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
  initialTrainingNeeds: any[];
  initialPerfReviews: any[];
}

export default function LeadTab({ initialTrainingNeeds, initialPerfReviews }: Props) {
  const supabase = createClient();
  const [trainingNeeds, setTrainingNeeds] = useState<any[]>(initialTrainingNeeds);
  const [perfReviews,   setPerfReviews]   = useState<any[]>(initialPerfReviews);

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
        <h2 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>
          Training Needs
          <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: 'rgba(217,119,6,0.1)', color: 'var(--amber)' }}>
            {trainingNeeds.filter(n => n.status === 'open').length} open
          </span>
        </h2>
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
        <h2 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>
          Performance Reviews
          <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: 'rgba(124,58,237,0.1)', color: 'var(--purple)' }}>
            {perfReviews.filter(r => ['pending', 'in_progress'].includes(r.status)).length} pending
          </span>
        </h2>
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
