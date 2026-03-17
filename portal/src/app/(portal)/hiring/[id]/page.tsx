import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle, MessageSquare } from 'lucide-react';
import CandidateFeedbackButton from '@/components/modules/CandidateFeedbackButton';

export const metadata: Metadata = { title: 'Role Detail' };

const stageBadge: Record<string, string> = {
  submitted: 'badge-submitted', in_progress: 'badge-inprogress',
  shortlist_ready: 'badge-shortlist', interview: 'badge-interview',
  offer: 'badge-offer', filled: 'badge-filled', cancelled: 'badge-cancelled',
};

export default async function RequisitionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabaseClient();
  const { data: req } = await supabase
    .from('requisitions').select('*').eq('id', params.id).single();

  if (!req) notFound();

  const { data: candidates } = await supabase
    .from('candidates')
    .select('*')
    .eq('requisition_id', params.id)
    .eq('approved_for_client', true)
    .order('created_at', { ascending: false });

  const r    = req as any;
  const cands = candidates ?? [];

  function stageLabel(s: string) { return s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()); }

  return (
    <>
      <Topbar
        title={r.title}
        subtitle={[r.department, r.seniority, r.location].filter(Boolean).join(' · ')}
        actions={
          <Link href="/hiring" className="btn-secondary btn-sm">← All Roles</Link>
        }
      />
      <main className="portal-page flex-1">
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">

          {/* Left */}
          <div className="space-y-6">
            {/* Role details */}
            <div className="card p-6">
              <h2 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>Role Details</h2>
              <dl className="grid sm:grid-cols-2 gap-4">
                {[
                  ['Department',      r.department],
                  ['Seniority',       r.seniority],
                  ['Salary Range',    r.salary_range],
                  ['Location',        r.location],
                  ['Employment Type', r.employment_type],
                  ['Submitted',       new Date(r.created_at).toLocaleDateString('en-GB')],
                ].map(([label, val]) => (
                  <div key={label as string}>
                    <dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>{label}</dt>
                    <dd className="text-sm font-medium mt-0.5" style={{ color: val ? 'var(--ink)' : 'var(--ink-faint)' }}>
                      {val || '—'}
                    </dd>
                  </div>
                ))}
              </dl>
              {r.description && (
                <>
                  <div className="divider my-5" />
                  <p className="text-xs mb-1" style={{ color: 'var(--ink-faint)' }}>Overview</p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{r.description}</p>
                </>
              )}
              {r.must_haves?.length > 0 && (
                <>
                  <div className="divider my-5" />
                  <p className="text-xs mb-3" style={{ color: 'var(--ink-faint)' }}>Must-haves</p>
                  <ul className="space-y-1.5">
                    {r.must_haves.map((m: string) => (
                      <li key={m} className="flex items-start gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
                        <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--teal)' }} />
                        {m}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {/* Candidates */}
            <div className="card p-6">
              <h2 className="font-display font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>
                Candidates ({cands.length})
              </h2>
              <p className="text-xs mb-5" style={{ color: 'var(--ink-faint)' }}>
                Only candidates approved by Ravello are shown here.
              </p>
              {cands.length === 0 ? (
                <div className="empty-state py-10">
                  <p className="text-sm">No candidates yet — Ravello will add them as sourcing progresses.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cands.map((c: any) => (
                    <div
                      key={c.id}
                      className="rounded-[12px] p-5"
                      style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
                    >
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{c.full_name}</p>
                          {c.email && <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{c.email}</p>}
                        </div>
                        <span className={`badge badge-${c.client_status}`}>{c.client_status.replace(/_/g,' ')}</span>
                      </div>
                      {c.summary && (
                        <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--ink-soft)' }}>{c.summary}</p>
                      )}
                      {c.recruiter_notes && (
                        <div className="rounded-[8px] p-3 mb-4" style={{ background: 'var(--surface-alt)' }}>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: 'var(--ink-faint)' }}>Recruiter Notes</p>
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{c.recruiter_notes}</p>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {c.cv_url && (
                          <a href={c.cv_url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
                            View CV
                          </a>
                        )}
                        <CandidateFeedbackButton candidateId={c.id} currentStatus={c.client_status} />
                      </div>
                      {c.client_feedback && (
                        <div className="mt-3 flex items-start gap-2 text-xs p-3 rounded-[8px]" style={{ background: 'rgba(143,114,246,0.06)', border: '1px solid rgba(143,114,246,0.1)' }}>
                          <MessageSquare size={12} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--purple)' }} />
                          <span style={{ color: 'var(--ink-soft)' }}>{c.client_feedback}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right — stage tracker */}
          <div className="card p-6 h-fit">
            <h2 className="font-display font-semibold text-sm mb-5" style={{ color: 'var(--ink)' }}>Pipeline Stage</h2>
            <div className="space-y-2">
              {['submitted','in_progress','shortlist_ready','interview','offer','filled'].map((s) => {
                const stages = ['submitted','in_progress','shortlist_ready','interview','offer','filled'];
                const idx    = stages.indexOf(s);
                const cur    = stages.indexOf(r.stage);
                const done   = idx < cur;
                const active = idx === cur;
                return (
                  <div key={s} className="flex items-center gap-3 py-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                      style={{
                        background: active ? 'var(--purple)' : done ? 'rgba(52,211,153,0.2)' : 'var(--surface-alt)',
                        color: active ? '#fff' : done ? '#059669' : 'var(--ink-faint)',
                        border: `1px solid ${active ? 'var(--purple)' : done ? 'rgba(52,211,153,0.3)' : 'var(--line)'}`,
                      }}
                    >
                      {done ? '✓' : idx + 1}
                    </div>
                    <span
                      className="text-sm"
                      style={{
                        color: active ? 'var(--ink)' : done ? 'var(--ink-soft)' : 'var(--ink-faint)',
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {stageLabel(s)}
                    </span>
                    {active && (
                      <span className={`badge ${stageBadge[s]} ml-auto text-[10px]`}>Current</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
