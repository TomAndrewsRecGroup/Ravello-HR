import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import FrictionAlert from '@/components/FrictionAlert';
import Link from 'next/link';
import { Briefcase, Plus, ChevronDown, ExternalLink } from 'lucide-react';
import { getManatalJobs, getManatalApplications, isManatalConfigured } from '@/lib/manatal';

export const metadata: Metadata = { title: 'Hiring' };

const stageBadge: Record<string, string> = {
  submitted:       'badge-submitted',
  in_progress:     'badge-inprogress',
  shortlist_ready: 'badge-shortlist',
  interview:       'badge-interview',
  offer:           'badge-offer',
  filled:          'badge-filled',
  cancelled:       'badge-cancelled',
};

const STAGE_FILTERS = [
  { key: 'all',            label: 'All' },
  { key: 'submitted',      label: 'Draft' },
  { key: 'in_progress',    label: 'In Progress' },
  { key: 'shortlist_ready',label: 'Shortlisting' },
  { key: 'interview',      label: 'Interview' },
  { key: 'offer',          label: 'Offer' },
];

const MODEL_PILL: Record<string, { label: string; dot: string }> = {
  office: { label: 'Office', dot: '#3B6FFF' },
  hybrid: { label: 'Hybrid', dot: '#14B8A6' },
  remote: { label: 'Remote', dot: '#16A34A' },
};

function daysOpen(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

function WorkingModelPill({ model }: { model: string | null }) {
  if (!model) return <span style={{ color: 'var(--ink-faint)' }}>—</span>;
  const cfg = MODEL_PILL[model.toLowerCase()] ?? { label: model, dot: 'var(--ink-faint)' };
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
      style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}
    >
      <span className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: cfg.dot }} />
      {cfg.label}
    </span>
  );
}

export default async function HiringPage({
  searchParams,
}: {
  searchParams?: { filter?: string };
}) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles').select('company_id, companies(manatal_client_id)').eq('id', user?.id ?? '').single();
  const companyId: string | undefined = (profile as any)?.company_id;
  const manatalClientId: string = (profile as any)?.companies?.manatal_client_id ?? '';

  const [{ data: requisitions }, manatalJobs, manatalApplications] = await Promise.all([
    supabase
      .from('requisitions')
      .select('*')
      .eq('company_id', companyId ?? '')
      .order('created_at', { ascending: false }),
    (isManatalConfigured() && manatalClientId)
      ? getManatalJobs(manatalClientId)
      : Promise.resolve([]),
    (isManatalConfigured() && manatalClientId)
      ? getManatalApplications(manatalClientId, ['Submission', 'Phone Screen', 'Interview', 'Final Interview', 'Offer', 'Hired'])
      : Promise.resolve([]),
  ]);

  const reqs = requisitions ?? [];
  const active   = reqs.filter((r: any) => !['filled', 'cancelled'].includes(r.stage));
  const archived = reqs.filter((r: any) =>  ['filled', 'cancelled'].includes(r.stage));

  const activeFilter = searchParams?.filter ?? 'all';
  const filtered = activeFilter === 'all'
    ? active
    : active.filter((r: any) => r.stage === activeFilter);

  return (
      <main className="portal-page flex-1">
        {/* Header row */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            {active.length} active role{active.length !== 1 ? 's' : ''}
          </p>
          <Link href="/hire/hiring/new" className="btn-cta btn-sm flex items-center gap-1.5">
            <Plus size={14} /> Raise a New Role
          </Link>
        </div>

        {active.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="empty-state">
              <Briefcase size={28} />
              <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No roles yet</p>
              <p className="text-sm max-w-[340px]" style={{ color: 'var(--ink-faint)' }}>
                Raise your first role and run it through Friction Lens before going to market.
              </p>
              <Link href="/hire/hiring/new" className="btn-cta mt-2">Raise a New Role</Link>
            </div>
          </div>
        ) : (
          <>
            {/* Filter row */}
            <div className="flex items-center gap-1 mb-5 flex-wrap">
              {STAGE_FILTERS.map(f => {
                const count = f.key === 'all'
                  ? active.length
                  : active.filter((r: any) => r.stage === f.key).length;
                const isActive = activeFilter === f.key;
                return (
                  <Link
                    key={f.key}
                    href={f.key === 'all' ? '/hire/hiring' : `/hire/hiring?filter=${f.key}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                    style={{
                      background: isActive ? 'var(--purple)' : 'var(--surface-alt)',
                      color:      isActive ? '#fff' : 'var(--ink-soft)',
                    }}
                  >
                    {f.label}
                    <span
                      className="inline-flex items-center justify-center rounded-full text-[10px] font-bold w-4 h-4"
                      style={{
                        background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--line)',
                        color:      isActive ? '#fff' : 'var(--ink-faint)',
                      }}
                    >
                      {count}
                    </span>
                  </Link>
                );
              })}
            </div>

            {/* Active roles table */}
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Role Title</th>
                    <th>Working Model</th>
                    <th>Location</th>
                    <th>Days Open</th>
                    <th>Status</th>
                    <th>Friction</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className="py-8 text-center text-sm" style={{ color: 'var(--ink-faint)' }}>
                          No roles in this stage.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r: any) => (
                      <tr key={r.id}>
                        <td>
                          <Link
                            href={`/hire/hiring/${r.id}`}
                            className="font-semibold hover:underline"
                            style={{ color: 'var(--ink)' }}
                          >
                            {r.title}
                          </Link>
                          {r.department && (
                            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{r.department}</p>
                          )}
                        </td>
                        <td>
                          <WorkingModelPill model={r.working_model} />
                        </td>
                        <td style={{ color: 'var(--ink-soft)' }}>{r.location ?? '—'}</td>
                        <td style={{ color: 'var(--ink-soft)' }}>
                          {daysOpen(r.created_at)}d
                        </td>
                        <td>
                          <span className={`badge ${stageBadge[r.stage] ?? ''}`}>
                            {r.stage.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>
                          <FrictionAlert
                            level={r.friction_level}
                            topRec={r.friction_recommendations?.[0] ?? undefined}
                          />
                        </td>
                        <td>
                          <Link href={`/hiring/${r.id}`} className="btn-secondary btn-sm">
                            View
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Manatal ATS section — only shown when manatal_client_id is configured */}
        {manatalClientId && isManatalConfigured() && (manatalJobs.length > 0 || manatalApplications.length > 0) && (
          <div className="mt-10">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>Live ATS Pipeline</h2>
              <span className="badge" style={{ background: 'rgba(59,111,255,0.1)', color: 'var(--blue)', fontSize: 11 }}>
                Manatal
              </span>
            </div>

            {manatalJobs.length > 0 && (
              <div className="card p-0 overflow-hidden mb-6">
                <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--line)', background: 'var(--surface-soft)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>
                    Open Roles ({manatalJobs.length})
                  </p>
                </div>
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Job Title</th>
                        <th>Department</th>
                        <th>Location</th>
                        <th>Type</th>
                        <th>Posted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manatalJobs.map((job) => (
                        <tr key={job.id}>
                          <td className="font-medium" style={{ color: 'var(--ink)' }}>{job.name}</td>
                          <td style={{ color: 'var(--ink-soft)' }}>{job.department?.name ?? '—'}</td>
                          <td style={{ color: 'var(--ink-soft)' }}>{job.location ?? '—'}</td>
                          <td style={{ color: 'var(--ink-soft)' }}>{job.employment_type ?? '—'}</td>
                          <td style={{ color: 'var(--ink-faint)' }}>
                            {new Date(job.created_at).toLocaleDateString('en-GB')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {manatalApplications.length > 0 && (
              <div className="card p-0 overflow-hidden">
                <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--line)', background: 'var(--surface-soft)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>
                    Candidate Pipeline ({manatalApplications.length})
                  </p>
                </div>
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Candidate</th>
                        <th>Role</th>
                        <th>Stage</th>
                        <th>Applied</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manatalApplications.map((app) => (
                        <tr key={app.id}>
                          <td>
                            <p className="font-medium" style={{ color: 'var(--ink)' }}>
                              {app.candidate.first_name} {app.candidate.last_name}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{app.candidate.email}</p>
                          </td>
                          <td style={{ color: 'var(--ink-soft)' }}>{app.job.name}</td>
                          <td>
                            <span className="badge" style={{ background: 'rgba(59,111,255,0.1)', color: 'var(--blue)' }}>
                              {app.stage}
                            </span>
                          </td>
                          <td style={{ color: 'var(--ink-faint)' }}>
                            {new Date(app.created_at).toLocaleDateString('en-GB')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Archived / collapsible section */}
        {archived.length > 0 && (
          <details className="mt-8 group">
            <summary
              className="flex items-center gap-2 cursor-pointer select-none list-none mb-4"
              style={{ color: 'var(--ink-faint)' }}
            >
              <ChevronDown
                size={14}
                className="transition-transform group-open:rotate-180"
                style={{ color: 'var(--ink-faint)' }}
              />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Archived — Filled &amp; Cancelled ({archived.length})
              </span>
            </summary>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Role Title</th>
                    <th>Working Model</th>
                    <th>Location</th>
                    <th>Status</th>
                    <th>Friction</th>
                    <th>Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {archived.map((r: any) => (
                    <tr key={r.id} style={{ opacity: 0.7 }}>
                      <td>
                        <Link href={`/hiring/${r.id}`} className="hover:underline" style={{ color: 'var(--ink)' }}>
                          {r.title}
                        </Link>
                      </td>
                      <td><WorkingModelPill model={r.working_model} /></td>
                      <td style={{ color: 'var(--ink-soft)' }}>{r.location ?? '—'}</td>
                      <td>
                        <span className={`badge ${stageBadge[r.stage] ?? ''}`}>{r.stage}</span>
                      </td>
                      <td>
                        <FrictionAlert level={r.friction_level} />
                      </td>
                      <td style={{ color: 'var(--ink-faint)' }}>
                        {new Date(r.updated_at).toLocaleDateString('en-GB')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </main>
  );
}
