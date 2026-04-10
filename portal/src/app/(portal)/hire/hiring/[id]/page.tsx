import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import FrictionScoreCard from '@/components/FrictionScoreCard';
import CandidateFeedbackButton from '@/components/modules/CandidateFeedbackButton';
import OfferTab from './OfferTab';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, MessageSquare, Info, Calendar, Video, Phone, MapPin } from 'lucide-react';
import type { FrictionScore } from '@/lib/supabase/types';

export const metadata: Metadata = { title: 'Role Detail' };
export const revalidate = 30;

const stageBadge: Record<string, string> = {
  submitted:       'badge-submitted',
  in_progress:     'badge-inprogress',
  shortlist_ready: 'badge-shortlist',
  interview:       'badge-interview',
  offer:           'badge-offer',
  filled:          'badge-filled',
  cancelled:       'badge-cancelled',
};

function stageLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default async function RequisitionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabaseClient();
  const { companyId } = await getSessionProfile();
  const { data: req } = await supabase
    .from('requisitions').select('id,title,department,seniority,stage,salary_range,location,employment_type,working_model,description,must_haves,friction_score,friction_level,friction_recommendations,jd_text,created_at').eq('id', params.id).eq('company_id', companyId).single();

  if (!req) notFound();

  const [{ data: candidates }, { data: offers }, { data: interviews }] = await Promise.all([
    supabase
      .from('candidates')
      .select('id,full_name,email,cv_url,summary,client_status,client_feedback,created_at')
      .eq('requisition_id', params.id)
      .eq('approved_for_client', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('offers')
      .select('*, candidates(full_name)')
      .eq('requisition_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('interview_schedules')
      .select('candidate_id, stage_number, stage_label, interview_type, scheduled_at, duration_mins, status, outcome')
      .eq('requisition_id', params.id)
      .neq('status', 'cancelled')
      .order('scheduled_at', { ascending: true }),
  ]);

  const r = req as any;
  const cands = candidates ?? [];
  const ivs   = interviews ?? [];

  // Parse friction_score — may be stored as stringified JSON or as an object
  let frictionScore: FrictionScore | null = null;
  if (r.friction_score) {
    try {
      frictionScore = typeof r.friction_score === 'string'
        ? JSON.parse(r.friction_score)
        : r.friction_score as FrictionScore;
    } catch {
      frictionScore = null;
    }
  }

  return (
    <>
      <main className="portal-page flex-1">
        {/* Back link + title */}
        <div className="flex items-center gap-3 mb-5">
          <Link href="/hire/hiring" className="btn-secondary btn-sm">← All Roles</Link>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate" style={{ color: 'var(--ink)' }}>{r.title}</h2>
            <p className="text-xs truncate" style={{ color: 'var(--ink-faint)' }}>
              {[r.department, r.seniority, r.location].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="grid lg:grid-cols-[1fr_340px] gap-6">

          {/* ── Left column ─────────────────────────────────────────── */}
          <div className="space-y-6">

            {/* 1. Friction Score Card */}
            {frictionScore ? (
              <FrictionScoreCard score={frictionScore} />
            ) : (
              <div
                className="rounded-[16px] p-5 flex items-start gap-4"
                style={{ background: 'rgba(148,163,184,0.06)', border: '1px dashed rgba(148,163,184,0.3)' }}
              >
                <Info size={18} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--ink-faint)' }} />
                <div>
                  <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink-soft)' }}>
                    Friction Lens not yet scored
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
                    Contact your consultant at The People Office to run a Friction Lens score on this role. Scores give you a real-time read on time-to-fill risk and tailored market recommendations.
                  </p>
                </div>
              </div>
            )}

            {/* 2. Role Details */}
            <div className="card p-6">
              <h2 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>Role Details</h2>
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
                {[
                  ['Department',       r.department],
                  ['Seniority',        r.seniority],
                  ['Working Model',    r.working_model ? r.working_model.charAt(0).toUpperCase() + r.working_model.slice(1) : null],
                  ['Location',         r.location],
                  ['Employment Type',  r.employment_type],
                  ['Salary Min',       r.salary_min != null ? `£${r.salary_min.toLocaleString()}` : null],
                  ['Salary Max',       r.salary_max != null ? `£${r.salary_max.toLocaleString()}` : null],
                  ['Urgency',          r.urgency],
                  ['Reason for Hire',  r.reason_for_hire],
                  ['Interview Stages', r.interview_stages != null ? String(r.interview_stages) : null],
                  ['Reporting Line',   r.reporting_line],
                  ['Submitted',        new Date(r.created_at).toLocaleDateString('en-GB')],
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
                  <p className="text-xs mb-1" style={{ color: 'var(--ink-faint)' }}>Role Description</p>
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

              {r.nice_to_haves?.length > 0 && (
                <>
                  <div className="divider my-5" />
                  <p className="text-xs mb-3" style={{ color: 'var(--ink-faint)' }}>Nice-to-haves</p>
                  <ul className="space-y-1.5">
                    {r.nice_to_haves.map((m: string) => (
                      <li key={m} className="flex items-start gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
                        <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--ink-faint)' }} />
                        {m}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {/* 3. Offers */}
            <OfferTab
              requisitionId={r.id}
              companyId={r.company_id}
              candidates={cands.map((c: any) => ({ id: c.id, full_name: c.full_name, client_status: c.client_status }))}
              initialOffers={(offers ?? []) as any[]}
            />

            {/* 4. Candidates */}
            <div className="card p-6">
              <h2 className="font-display font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>
                Candidates ({cands.length})
              </h2>
              <p className="text-xs mb-5" style={{ color: 'var(--ink-faint)' }}>
                Only candidates approved by The People Office are shown here.
              </p>
              {cands.length === 0 ? (
                <div className="empty-state py-10">
                  <p className="text-sm">No candidates yet — The People Office will add them as sourcing progresses.</p>
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
                        <span className={`badge badge-${c.client_status}`}>{c.client_status.replace(/_/g, ' ')}</span>
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
                        <CandidateFeedbackButton
                          candidateId={c.id}
                          candidateName={c.full_name}
                          currentStatus={c.client_status}
                          requisitionId={params.id}
                          companyId={companyId}
                          jobTitle={r.title}
                          department={r.department}
                        />
                      </div>
                      {c.client_feedback && (
                        <div className="mt-3 flex items-start gap-2 text-xs p-3 rounded-[8px]" style={{ background: 'rgba(143,114,246,0.06)', border: '1px solid rgba(143,114,246,0.1)' }}>
                          <MessageSquare size={12} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--purple)' }} />
                          <span style={{ color: 'var(--ink-soft)' }}>{c.client_feedback}</span>
                        </div>
                      )}
                      {/* Interviews for this candidate */}
                      {(() => {
                        const candIvs = ivs.filter((iv: any) => iv.candidate_id === c.id);
                        if (!candIvs.length) return null;
                        return (
                          <div className="mt-3 rounded-[8px] p-3" style={{ background: 'var(--surface-alt)', border: '1px solid var(--line)' }}>
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: 'var(--ink-faint)' }}>Interview Schedule</p>
                            <div className="space-y-1.5">
                              {candIvs.map((iv: any, idx: number) => {
                                const TypeIcon = iv.interview_type === 'video' ? Video : iv.interview_type === 'phone' ? Phone : iv.interview_type === 'in_person' ? MapPin : Calendar;
                                const dt = iv.scheduled_at ? new Date(iv.scheduled_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
                                return (
                                  <div key={idx} className="flex items-center gap-2 text-xs">
                                    <TypeIcon size={11} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
                                    <span style={{ color: 'var(--ink-soft)' }}>
                                      Stage {iv.stage_number}{iv.stage_label ? ` — ${iv.stage_label}` : ''} · {dt}
                                    </span>
                                    {iv.outcome && iv.outcome !== 'pending' && (
                                      <span
                                        className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                        style={iv.outcome === 'pass' ? { background: 'rgba(22,163,74,0.1)', color: 'var(--emerald)' } : iv.outcome === 'fail' ? { background: 'rgba(220,38,38,0.1)', color: 'var(--rose)' } : { background: 'rgba(217,119,6,0.1)', color: '#92400E' }}
                                      >
                                        {iv.outcome}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Right column (sticky) ────────────────────────────────── */}
          <div className="space-y-4 lg:sticky lg:top-6 h-fit">

            {/* Pipeline Stage tracker */}
            <div className="card p-6">
              <h2 className="font-display font-semibold text-sm mb-5" style={{ color: 'var(--ink)' }}>Pipeline Stage</h2>
              <div className="space-y-2">
                {['submitted', 'in_progress', 'shortlist_ready', 'interview', 'offer', 'filled'].map((s) => {
                  const stages = ['submitted', 'in_progress', 'shortlist_ready', 'interview', 'offer', 'filled'];
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
                          color:      active ? '#fff' : done ? '#059669' : 'var(--ink-faint)',
                          border:     `1px solid ${active ? 'var(--purple)' : done ? 'rgba(52,211,153,0.3)' : 'var(--line)'}`,
                        }}
                      >
                        {done ? '✓' : idx + 1}
                      </div>
                      <span
                        className="text-sm"
                        style={{
                          color:      active ? 'var(--ink)' : done ? 'var(--ink-soft)' : 'var(--ink-faint)',
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

            {/* Role actions card */}
            <div className="card p-5">
              <h2 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>Friction Lens</h2>
              {r.friction_scored_at ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Last scored</p>
                    <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--ink)' }}>
                      {new Date(r.friction_scored_at).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </p>
                  </div>
                  <div
                    className="rounded-[8px] p-3 text-xs leading-relaxed"
                    style={{ background: 'var(--surface-alt)', color: 'var(--ink-faint)' }}
                  >
                    To re-score this role against updated market data, contact your consultant at The People Office.
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-[8px] p-3 text-xs leading-relaxed"
                  style={{ background: 'var(--surface-alt)', color: 'var(--ink-faint)' }}
                >
                  This role has not yet been scored. Contact your consultant at The People Office to run Friction Lens.
                </div>
              )}
            </div>

          </div>
        </div>
      </main>
    </>
  );
}
