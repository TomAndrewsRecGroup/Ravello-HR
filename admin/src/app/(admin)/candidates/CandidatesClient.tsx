'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';
import { ExternalLink, ChevronDown, Star, Loader2 } from 'lucide-react';

interface Candidate {
  id: string;
  full_name: string;
  email: string | null;
  cv_url: string | null;
  cv_file_path: string | null;
  cv_file_name: string | null;
  source: string | null;
  pipeline_stage: string | null;
  screening_score: number | null;
  client_status: string;
  approved_for_client: boolean;
  created_at: string;
  requisition_id: string;
  requisitions: { title: string; companies: { name: string } | null } | null;
}

interface Props {
  initialCandidates: Candidate[];
  companies: { id: string; name: string }[];
}

const STAGE_BADGE: Record<string, string> = {
  applied: 'badge-normal', screening: 'badge-inprogress', interviewing: 'badge-interview',
  offer: 'badge-offer', hired: 'badge-active', rejected: 'badge-cancelled',
};

const SOURCE_LABELS: Record<string, string> = {
  direct: 'Direct', linkedin: 'LinkedIn', referral: 'Referral',
  agency: 'Agency', job_board: 'Job Board',
};

const CLIENT_STATUS_STYLE: Record<string, React.CSSProperties> = {
  pending:  { background: 'rgba(148,163,184,0.1)', color: 'var(--slate)' },
  shared:   { background: 'rgba(59,111,255,0.1)',   color: 'var(--blue)' },
  approved: { background: 'rgba(22,163,74,0.1)',    color: 'var(--emerald)' },
  rejected: { background: 'rgba(220,38,38,0.1)',    color: 'var(--rose)' },
};

function Stars({ score }: { score: number | null }) {
  if (!score) return <span style={{ color: 'var(--ink-faint)' }}>—</span>;
  return (
    <span className="inline-flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={11} fill={i <= Math.round(score / 2) ? 'var(--gold)' : 'none'} style={{ color: 'var(--gold)' }} />
      ))}
      <span className="ml-1 text-xs" style={{ color: 'var(--ink-faint)' }}>{score}/10</span>
    </span>
  );
}

export default function CandidatesClient({ initialCandidates, companies }: Props) {
  const supabase = createClient();
  const [candidates, setCandidates] = useState<Candidate[]>(initialCandidates);
  const [search, setSearch]         = useState('');
  const [filterStage, setFilterStage] = useState('all');
  const [filterCompany, setFilterCompany] = useState('all');
  const [updatingScore, setUpdatingScore] = useState<string | null>(null);

  async function updateScore(id: string, score: number) {
    setUpdatingScore(id);
    const { data, error } = await supabase.from('candidates').update({ screening_score: score }).eq('id', id).select().single();
    if (!error && data) {
      setCandidates(cs => cs.map(c => c.id === id ? { ...c, screening_score: score } : c));
      revalidateAdminPath('/candidates');
    }
    setUpdatingScore(null);
  }

  async function updatePipelineStage(id: string, stage: string) {
    const { error } = await supabase.from('candidates').update({ pipeline_stage: stage }).eq('id', id);
    if (!error) {
      setCandidates(cs => cs.map(c => c.id === id ? { ...c, pipeline_stage: stage } : c));
      revalidateAdminPath('/candidates');
    }
  }

  const filtered = candidates.filter(c => {
    const companyName = c.requisitions?.companies?.name ?? '';
    if (filterCompany !== 'all' && companyName !== filterCompany) return false;
    if (filterStage !== 'all' && c.pipeline_stage !== filterStage) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!c.full_name.toLowerCase().includes(q) &&
          !c.email?.toLowerCase().includes(q) &&
          !c.requisitions?.title.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <input
          className="input h-9 text-sm w-full max-w-[240px]"
          placeholder="Search candidates…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="input h-9 text-sm w-full max-w-[160px]" value={filterStage} onChange={e => setFilterStage(e.target.value)}>
          <option value="all">All stages</option>
          {['applied','screening','interviewing','offer','hired','rejected'].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <select className="input h-9 text-sm w-full max-w-[180px]" value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
          <option value="all">All companies</option>
          {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <span className="text-sm ml-auto" style={{ color: 'var(--ink-faint)' }}>{filtered.length} candidate{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Role</th>
              <th>Company</th>
              <th>Source</th>
              <th>Pipeline Stage</th>
              <th>Score</th>
              <th>Client Status</th>
              <th>CV</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="py-10 text-center text-sm" style={{ color: 'var(--ink-faint)' }}>
                    No candidates match the filters.
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map(c => (
                <tr key={c.id}>
                  <td>
                    <p className="font-medium" style={{ color: 'var(--ink)' }}>{c.full_name}</p>
                    {c.email && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{c.email}</p>}
                  </td>
                  <td>
                    <a
                      href={`/hiring/${c.requisition_id}`}
                      className="text-sm hover:underline"
                      style={{ color: 'var(--purple)' }}
                    >
                      {c.requisitions?.title ?? '—'}
                    </a>
                  </td>
                  <td style={{ color: 'var(--ink-soft)' }}>
                    {c.requisitions?.companies?.name ?? '—'}
                  </td>
                  <td style={{ color: 'var(--ink-soft)' }}>
                    {SOURCE_LABELS[c.source ?? ''] ?? c.source ?? '—'}
                  </td>
                  <td>
                    <select
                      className="text-xs border-0 bg-transparent font-medium cursor-pointer rounded px-1 py-0.5"
                      style={{ color: 'var(--ink-soft)' }}
                      value={c.pipeline_stage ?? 'applied'}
                      onChange={e => updatePipelineStage(c.id, e.target.value)}
                    >
                      {['applied','screening','interviewing','offer','hired','rejected'].map(s => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <Stars score={c.screening_score} />
                      {updatingScore === c.id && <Loader2 size={10} className="animate-spin" style={{ color: 'var(--ink-faint)' }} />}
                      <select
                        className="text-xs border rounded px-1 py-0.5 ml-1"
                        style={{ borderColor: 'var(--line)', color: 'var(--ink-faint)', background: 'var(--surface)' }}
                        value={c.screening_score ?? ''}
                        onChange={e => e.target.value && updateScore(c.id, Number(e.target.value))}
                      >
                        <option value="">—</option>
                        {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </td>
                  <td>
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                      style={CLIENT_STATUS_STYLE[c.client_status] ?? CLIENT_STATUS_STYLE.pending}
                    >
                      {c.client_status?.replace(/_/g, ' ') ?? 'pending'}
                    </span>
                  </td>
                  <td>
                    {(c.cv_url || c.cv_file_path) ? (
                      <a
                        href={c.cv_url ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs"
                        style={{ color: 'var(--purple)' }}
                      >
                        CV <ExternalLink size={10} />
                      </a>
                    ) : (
                      <span style={{ color: 'var(--ink-faint)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
