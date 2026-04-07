import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import RequisitionPanel from './RequisitionPanel';
import InterviewSchedulePanel from './InterviewSchedulePanel';
import { User, ExternalLink } from 'lucide-react';

export const metadata: Metadata = { title: 'Requisition Detail' };

const STAGE_BADGE: Record<string, string> = {
  submitted:       'badge-submitted',
  in_progress:     'badge-inprogress',
  shortlist_ready: 'badge-shortlist',
  interview:       'badge-interview',
  offer:           'badge-offer',
  filled:          'badge-filled',
  cancelled:       'badge-cancelled',
};

const FRICTION_STYLE: Record<string, React.CSSProperties> = {
  Low:      { background: 'rgba(22,163,74,0.1)',   color: '#166534' },
  Medium:   { background: 'rgba(217,119,6,0.1)',   color: '#92400E' },
  High:     { background: 'rgba(220,38,38,0.1)',   color: '#991B1B' },
  Critical: { background: 'rgba(127,29,29,0.12)',  color: '#7F1D1D' },
};

const CLIENT_STATUS_STYLE: Record<string, React.CSSProperties> = {
  pending:        { background: 'rgba(148,163,184,0.1)', color: '#64748B' },
  approved:       { background: 'rgba(22,163,74,0.1)',   color: '#166534' },
  rejected:       { background: 'rgba(220,38,38,0.1)',   color: '#991B1B' },
  info_requested: { background: 'rgba(217,119,6,0.1)',   color: '#92400E' },
};

function daysOpen(createdAt: string) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

export default async function RequisitionDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();

  const [{ data: req }, { data: candidates }, { data: interviews }] = await Promise.all([
    supabase
      .from('requisitions')
      .select('id,title,department,seniority,stage,salary_range,location,employment_type,working_model,description,must_haves,friction_score,friction_level,friction_recommendations,jd_text,assigned_recruiter,created_at,companies(id,name)')
      .eq('id', params.id)
      .single(),
    supabase
      .from('candidates')
      .select('id,full_name,email,cv_url,summary,approved_for_client,client_status,client_feedback,screening_score,created_at')
      .eq('requisition_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('interview_schedules')
      .select('id,candidate_id,stage_number,stage_label,interview_type,scheduled_at,duration_mins,status,outcome,notes')
      .eq('requisition_id', params.id)
      .order('scheduled_at', { ascending: true }),
  ]);

  if (!req) notFound();

  const r        = req as any;
  const company  = r.companies as any;
  const cands    = candidates ?? [];
  const days     = daysOpen(r.created_at);
  const friction = r.friction_level ?? 'Unknown';

  const meta = [
    { label: 'Department',       value: r.department },
    { label: 'Seniority',        value: r.seniority },
    { label: 'Location',         value: r.location },
    { label: 'Working Model',    value: r.working_model },
    { label: 'Employment Type',  value: r.employment_type },
    { label: 'Salary Range',     value: r.salary_range },
    { label: 'Days Open',        value: `${days}d` },
    { label: 'Assigned Recruiter', value: r.assigned_recruiter },
  ];

  return (
    <>
      <AdminTopbar
        title={r.title}
        subtitle={company?.name ?? 'Unknown client'}
        actions={
          <div className="flex items-center gap-2">
            {company?.id && (
              <Link href={`/clients/${company.id}`} className="btn-secondary btn-sm">
                View Client →
              </Link>
            )}
            <Link href="/hiring" className="btn-ghost btn-sm">← All Roles</Link>
          </div>
        }
      />
      <main className="admin-page flex-1">
        <div className="grid lg:grid-cols-[1fr_340px] gap-6">

          {/* ── Left: details ─────────────────────────────── */}
          <div className="space-y-5">

            {/* Status row */}
            <div className="card p-5 flex flex-wrap gap-5 items-center">
              <div>
                <p className="text-xs mb-1" style={{ color: 'var(--ink-faint)' }}>Stage</p>
                <span className={`badge ${STAGE_BADGE[r.stage] ?? 'badge-normal'}`}>
                  {r.stage?.replace(/_/g, ' ')}
                </span>
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: 'var(--ink-faint)' }}>Friction</p>
                <span className="badge" style={FRICTION_STYLE[friction] ?? {}}>
                  {friction}
                </span>
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: 'var(--ink-faint)' }}>Days Open</p>
                <p className="text-sm font-semibold" style={{ color: days >= 30 ? '#991B1B' : 'var(--ink)' }}>{days}d</p>
              </div>
              {r.assigned_recruiter && (
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--ink-faint)' }}>Recruiter</p>
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{r.assigned_recruiter}</p>
                </div>
              )}
              <div>
                <p className="text-xs mb-1" style={{ color: 'var(--ink-faint)' }}>Client</p>
                {company?.id
                  ? <Link href={`/clients/${company.id}`} className="text-sm font-medium hover:underline" style={{ color: 'var(--purple)' }}>{company.name}</Link>
                  : <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{company?.name ?? '—'}</p>
                }
              </div>
            </div>

            {/* Role details */}
            <div className="card p-5">
              <h3 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>Role Details</h3>
              <dl className="grid sm:grid-cols-2 gap-4 mb-5">
                {meta.filter(m => m.value).map(m => (
                  <div key={m.label}>
                    <dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>{m.label}</dt>
                    <dd className="text-sm font-medium mt-0.5" style={{ color: 'var(--ink)' }}>{m.value}</dd>
                  </div>
                ))}
              </dl>
              {r.description && (
                <div className="mb-4">
                  <p className="text-xs mb-1.5" style={{ color: 'var(--ink-faint)' }}>Description</p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{r.description}</p>
                </div>
              )}
              {r.must_haves?.length > 0 && (
                <div>
                  <p className="text-xs mb-1.5" style={{ color: 'var(--ink-faint)' }}>Must-haves</p>
                  <ul className="space-y-1">
                    {r.must_haves.map((item: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: 'var(--purple)' }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Candidates */}
            <div className="card p-5">
              <h3 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>
                Candidates ({cands.length})
              </h3>
              {cands.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No candidates added yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--line)' }}>
                        {['Name', 'Email', 'Summary', 'Client Status', 'Shared'].map(h => (
                          <th key={h} className="pb-2.5 text-left text-[11px] font-semibold uppercase tracking-wide pr-4" style={{ color: 'var(--ink-faint)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cands.map((c: any) => (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--line)' }}>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(124,58,237,0.1)' }}>
                                <User size={12} style={{ color: 'var(--purple)' }} />
                              </div>
                              <span className="font-medium" style={{ color: 'var(--ink)' }}>{c.full_name}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-4" style={{ color: 'var(--ink-soft)' }}>{c.email ?? '—'}</td>
                          <td className="py-3 pr-4 max-w-[180px]">
                            <p className="text-xs truncate" style={{ color: 'var(--ink-soft)' }}>{c.summary ?? '—'}</p>
                            {c.cv_url && (
                              <a href={c.cv_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] mt-0.5" style={{ color: 'var(--purple)' }}>
                                CV <ExternalLink size={9} />
                              </a>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={CLIENT_STATUS_STYLE[c.client_status] ?? CLIENT_STATUS_STYLE.pending}>
                              {c.client_status?.replace(/_/g, ' ') ?? 'pending'}
                            </span>
                          </td>
                          <td className="py-3">
                            <span className={`badge ${c.approved_for_client ? 'badge-active' : 'badge-normal'}`}>
                              {c.approved_for_client ? 'Yes' : 'No'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-3">
                <Link
                  href={`/clients/${company?.id}?tab=Candidates`}
                  className="text-xs font-medium"
                  style={{ color: 'var(--purple)' }}
                >
                  Manage candidates in client profile →
                </Link>
              </div>
            </div>

            {/* Interview Schedule */}
            <InterviewSchedulePanel
              requisitionId={r.id}
              companyId={r.company_id}
              candidates={cands.map((c: any) => ({ id: c.id, full_name: c.full_name }))}
              initialInterviews={(interviews ?? []) as any[]}
            />
          </div>

          {/* ── Right: updater + friction ─────────────────── */}
          <div>
            <RequisitionPanel req={r} />
          </div>
        </div>
      </main>
    </>
  );
}
