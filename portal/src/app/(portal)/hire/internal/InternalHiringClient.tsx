'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidatePortalPath } from '@/app/actions';
import {
  Plus, X, Loader2, Briefcase, ArrowRight,
  Clock, ChevronDown, ChevronRight,
  UserPlus, Sparkles, Globe, Search as SearchIcon,
  Users, GripVertical, FileCheck,
} from 'lucide-react';
import Link from 'next/link';

/* ─── Types ─────────────────────────────────────────── */
interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  stage: string; // applied, screening, interview, offer, hired, rejected
  applied_at: string;
  notes: string;
}

interface InternalRole {
  id: string; title: string; department: string | null;
  location: string | null; working_model: string | null;
  salary_min: number | null; salary_max: number | null;
  stage: string; created_at: string; managed_by: string;
  internal_applicants: Candidate[] | null;
  description: string | null;
}

interface Props {
  companyId: string; userId: string; isAdmin: boolean;
  internalRoles: InternalRole[];
  tpoFilledCount: number; tpoAvgDays: number;
}

const CANDIDATE_STAGES = [
  { key: 'applied',    label: 'Applied',    bg: 'rgba(59,111,255,0.10)',  color: 'var(--blue)' },
  { key: 'screening',  label: 'Screening',  bg: 'rgba(124,58,237,0.10)',  color: '#5A1EC0' },
  { key: 'interview',  label: 'Interview',  bg: 'rgba(245,158,11,0.12)',  color: '#92400E' },
  { key: 'offer',      label: 'Offer',      bg: 'rgba(52,211,153,0.12)',  color: 'var(--emerald)' },
  { key: 'hired',      label: 'Hired',      bg: 'rgba(52,211,153,0.20)',  color: '#065F46' },
  { key: 'rejected',   label: 'Rejected',   bg: 'rgba(217,68,68,0.08)',   color: 'var(--rose)' },
];

function stageConfig(stage: string) {
  return CANDIDATE_STAGES.find(s => s.key === stage) ?? CANDIDATE_STAGES[0];
}

function daysOpen(created: string): number {
  return Math.floor((Date.now() - new Date(created).getTime()) / 86400000);
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/* ─── Component ─────────────────────────────────────── */
export default function InternalHiringClient({ companyId, userId, isAdmin, internalRoles, tpoFilledCount, tpoAvgDays }: Props) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  // New role form
  const [form, setForm] = useState({
    title: '', department: '', location: '', salary_min: '', salary_max: '', description: '',
  });

  // Add candidate form
  const [showCandidateForm, setShowCandidateForm] = useState<string | null>(null);
  const [candidateForm, setCandidateForm] = useState({ name: '', email: '', phone: '', notes: '' });

  const activeRoles = internalRoles.filter(r => !['filled', 'cancelled'].includes(r.stage));
  const staleRoles = activeRoles.filter(r => daysOpen(r.created_at) >= 10);

  /* ─── Role CRUD ──────────────────────────────────── */
  async function createRole() {
    if (!form.title.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('requisitions').insert({
      company_id: companyId,
      title: form.title.trim(),
      department: form.department || null,
      location: form.location || null,
      salary_min: form.salary_min ? parseFloat(form.salary_min) : null,
      salary_max: form.salary_max ? parseFloat(form.salary_max) : null,
      description: form.description || null,
      managed_by: 'internal',
      stage: 'submitted',
      submitted_by: user?.id,
      internal_applicants: [],
    });
    setSaving(false);
    setShowForm(false);
    setForm({ title: '', department: '', location: '', salary_min: '', salary_max: '', description: '' });
    revalidatePortalPath('/hire/internal');
  }

  async function upgradeToTPO(roleId: string) {
    const { error } = await supabase.from('requisitions').update({ managed_by: 'tpo' }).eq('id', roleId);
    if (!error) revalidatePortalPath('/hire/internal');
  }

  /* ─── Candidate CRUD ─────────────────────────────── */
  async function addCandidate(roleId: string) {
    if (!candidateForm.name.trim()) return;
    const role = internalRoles.find(r => r.id === roleId);
    const current = role?.internal_applicants ?? [];
    const updated = [...current, {
      id: genId(),
      name: candidateForm.name.trim(),
      email: candidateForm.email || '',
      phone: candidateForm.phone || '',
      stage: 'applied',
      applied_at: new Date().toISOString(),
      notes: candidateForm.notes || '',
    }];
    await supabase.from('requisitions').update({ internal_applicants: updated }).eq('id', roleId);
    setShowCandidateForm(null);
    setCandidateForm({ name: '', email: '', phone: '', notes: '' });
    revalidatePortalPath('/hire/internal');
  }

  async function moveCandidateStage(roleId: string, candidateId: string, newStage: string) {
    const role = internalRoles.find(r => r.id === roleId);
    if (!role) return;
    const updated = (role.internal_applicants ?? []).map(c =>
      c.id === candidateId ? { ...c, stage: newStage } : c
    );
    await supabase.from('requisitions').update({ internal_applicants: updated }).eq('id', roleId);

    // If moving to 'hired', also mark role as filled
    if (newStage === 'hired') {
      await supabase.from('requisitions').update({ stage: 'filled' }).eq('id', roleId);
    }
    revalidatePortalPath('/hire/internal');
  }

  async function rejectCandidate(roleId: string, candidateId: string) {
    await moveCandidateStage(roleId, candidateId, 'rejected');
  }

  /* ─── Convert offer to employee record ───────────── */
  async function convertToEmployee(roleId: string, candidate: Candidate, role: InternalRole) {
    setSaving(true);
    // Create employee record
    await supabase.from('employee_records').insert({
      company_id: companyId,
      full_name: candidate.name,
      email: candidate.email || null,
      phone: candidate.phone || null,
      job_title: role.title,
      department: role.department || null,
      work_location: role.location || null,
      employment_type: 'full_time',
      status: 'active',
      start_date: new Date().toISOString().split('T')[0],
      salary: role.salary_max || role.salary_min || null,
      annual_leave_allowance: 28,
      leave_year_type: 'fixed',
      leave_year_start_month: 1,
      leave_year_start_day: 1,
    });

    // Mark candidate as hired
    await moveCandidateStage(roleId, candidate.id, 'hired');
    setSaving(false);
    revalidatePortalPath('/hire/internal');
  }

  /* ─── Next stage helper ──────────────────────────── */
  function getNextStage(current: string): string | null {
    const order = ['applied', 'screening', 'interview', 'offer'];
    const idx = order.indexOf(current);
    if (idx >= 0 && idx < order.length - 1) return order[idx + 1];
    return null;
  }

  return (
    <div>
      {/* ── TPO Upsell Banner ─────────────────────────── */}
      <div
        className="card p-5 mb-6 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(124,58,237,0.05) 0%, rgba(59,111,255,0.04) 100%)',
          borderLeft: '3px solid var(--purple)',
        }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(124,58,237,0.10)' }}>
              <Sparkles size={18} style={{ color: 'var(--purple)' }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                Let The People System recruit for you
              </p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
                Your role is managed by experienced recruiters, posted to <strong style={{ color: 'var(--ink-soft)' }}>60+ job boards</strong>, with proactive sourcing across our networks and groups.
                Full friction scoring, candidate pipeline, interview scheduling and dedicated recruiter support included.
                {tpoFilledCount > 0 && (
                  <span style={{ color: 'var(--purple)' }}>
                    {' '}We've already filled {tpoFilledCount} role{tpoFilledCount !== 1 ? 's' : ''} for you
                    {tpoAvgDays > 0 ? ` in an average of ${tpoAvgDays} days` : ''}.
                  </span>
                )}
              </p>
              <div className="flex items-center gap-4 mt-2">
                <span className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: 'var(--ink-soft)' }}>
                  <Globe size={10} style={{ color: 'var(--purple)' }} /> 60+ job boards
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: 'var(--ink-soft)' }}>
                  <SearchIcon size={10} style={{ color: 'var(--purple)' }} /> Proactive sourcing
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: 'var(--ink-soft)' }}>
                  <Users size={10} style={{ color: 'var(--purple)' }} /> Dedicated recruiter
                </span>
              </div>
            </div>
          </div>
          <Link href="/hire/hiring/new" className="btn-cta btn-sm flex-shrink-0">
            <Briefcase size={13} /> Raise a Role with TPS
          </Link>
        </div>
      </div>

      {/* ── Header ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="section-title text-xl">Internal Roles</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
            Self-managed hiring — basic job creation and candidate tracking
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowForm(true)} className="btn-secondary btn-sm">
            <Plus size={13} /> Add Internal Role
          </button>
        )}
      </div>

      {/* ── 10-day Stale Alert ────────────────────────── */}
      {staleRoles.length > 0 && (
        <div
          className="card p-4 mb-5 flex flex-col sm:flex-row sm:items-center gap-3"
          style={{ borderLeft: '3px solid #D97706', background: 'rgba(245,158,11,0.04)' }}
        >
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Clock size={16} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {staleRoles.length} role{staleRoles.length !== 1 ? 's have' : ' has'} been open for 10+ days
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                Transfer to The People System for experienced recruiter support, 60+ job board exposure and proactive candidate sourcing.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Roles List ────────────────────────────────── */}
      {internalRoles.length === 0 ? (
        <div className="empty-state">
          <Briefcase size={28} />
          <p className="text-sm font-medium">No internal roles</p>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            For the best results, we recommend raising roles with The People System.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <Link href="/hire/hiring/new" className="btn-cta btn-sm">
              <Sparkles size={13} /> Raise with TPS
            </Link>
            <button onClick={() => setShowForm(true)} className="btn-ghost btn-sm">
              or manage internally
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {internalRoles.map(role => {
            const days = daysOpen(role.created_at);
            const candidates = role.internal_applicants ?? [];
            const isExpanded = expandedRole === role.id;
            const isStale = days >= 10 && !['filled', 'cancelled'].includes(role.stage);
            const isFilled = role.stage === 'filled';

            return (
              <div key={role.id} className="card" style={isStale ? { borderLeft: '3px solid #D97706' } : undefined}>
                {/* Role header */}
                <div
                  className="p-4 flex items-center gap-4 cursor-pointer"
                  onClick={() => setExpandedRole(isExpanded ? null : role.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{role.title}</p>
                      {isFilled ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(52,211,153,0.15)', color: 'var(--emerald)' }}>Filled</span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,111,255,0.10)', color: 'var(--blue)' }}>Open</span>
                      )}
                      {isStale && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.12)', color: '#92400E' }}>{days}d open</span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                      {role.department ?? '—'}
                      {role.location ? ` · ${role.location}` : ''}
                      {!isStale ? ` · ${days}d open` : ''}
                      {candidates.length > 0 ? ` · ${candidates.length} candidate${candidates.length !== 1 ? 's' : ''}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isStale && (
                      <button
                        onClick={e => { e.stopPropagation(); upgradeToTPO(role.id); }}
                        className="text-[10px] font-bold px-2.5 py-1 rounded-md hidden sm:inline-flex items-center gap-1 transition-colors hover:bg-[rgba(124,58,237,0.12)]"
                        style={{ background: 'rgba(124,58,237,0.08)', color: 'var(--purple)' }}
                      >
                        <Sparkles size={10} /> Transfer to TPS
                      </button>
                    )}
                    {isExpanded ? <ChevronDown size={14} style={{ color: 'var(--ink-faint)' }} /> : <ChevronRight size={14} style={{ color: 'var(--ink-faint)' }} />}
                  </div>
                </div>

                {/* Expanded — Candidate Pipeline */}
                {isExpanded && (
                  <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--line)' }}>
                    {role.description && (
                      <p className="text-xs mt-3 mb-3 leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{role.description}</p>
                    )}

                    {/* Pipeline stage headers */}
                    <div className="flex items-center justify-between mt-3 mb-3">
                      <p className="text-xs font-bold" style={{ color: 'var(--ink)' }}>
                        Candidate Pipeline ({candidates.filter(c => c.stage !== 'rejected').length})
                      </p>
                      {isAdmin && !isFilled && (
                        <button
                          onClick={() => setShowCandidateForm(showCandidateForm === role.id ? null : role.id)}
                          className="btn-secondary btn-sm"
                        >
                          <UserPlus size={11} /> Add Candidate
                        </button>
                      )}
                    </div>

                    {/* Inline candidate form */}
                    {showCandidateForm === role.id && (
                      <div className="mb-4 p-3 rounded-lg" style={{ border: '1px solid var(--line)', background: 'var(--surface-soft)' }}>
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-faint)' }}>New Candidate</p>
                        <div className="grid sm:grid-cols-3 gap-2 mb-2">
                          <input className="input py-1.5 text-xs" placeholder="Full name *" value={candidateForm.name} onChange={e => setCandidateForm(f => ({ ...f, name: e.target.value }))} />
                          <input className="input py-1.5 text-xs" placeholder="Email" value={candidateForm.email} onChange={e => setCandidateForm(f => ({ ...f, email: e.target.value }))} />
                          <input className="input py-1.5 text-xs" placeholder="Phone" value={candidateForm.phone} onChange={e => setCandidateForm(f => ({ ...f, phone: e.target.value }))} />
                        </div>
                        <input className="input py-1.5 text-xs mb-2" placeholder="Notes (optional)" value={candidateForm.notes} onChange={e => setCandidateForm(f => ({ ...f, notes: e.target.value }))} />
                        <div className="flex gap-2">
                          <button onClick={() => addCandidate(role.id)} disabled={!candidateForm.name.trim()} className="btn-cta btn-sm text-xs">Add Candidate</button>
                          <button onClick={() => setShowCandidateForm(null)} className="btn-ghost btn-sm text-xs">Cancel</button>
                        </div>
                      </div>
                    )}

                    {/* Pipeline columns */}
                    {candidates.length === 0 ? (
                      <p className="text-xs py-6 text-center" style={{ color: 'var(--ink-faint)' }}>
                        No candidates yet. Add your first candidate above.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {CANDIDATE_STAGES.filter(s => candidates.some(c => c.stage === s.key)).map(stage => (
                          <div key={stage.key}>
                            <p className="text-[10px] font-bold uppercase tracking-wider px-1 py-1.5" style={{ color: stage.color }}>
                              {stage.label} ({candidates.filter(c => c.stage === stage.key).length})
                            </p>
                            {candidates.filter(c => c.stage === stage.key).map(candidate => {
                              const nextStage = getNextStage(candidate.stage);
                              const isOffer = candidate.stage === 'offer';
                              const isHired = candidate.stage === 'hired';

                              return (
                                <div
                                  key={candidate.id}
                                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors"
                                  style={{ background: stage.bg }}
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{candidate.name}</p>
                                    <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                                      {candidate.email && `${candidate.email} · `}
                                      {candidate.phone && `${candidate.phone} · `}
                                      {new Date(candidate.applied_at).toLocaleDateString('en-GB')}
                                      {candidate.notes && ` · ${candidate.notes}`}
                                    </p>
                                  </div>

                                  {/* Action buttons */}
                                  {isAdmin && !isHired && (
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                      {candidate.stage !== 'rejected' && !isOffer && nextStage && (
                                        <button
                                          onClick={() => moveCandidateStage(role.id, candidate.id, nextStage)}
                                          className="text-[10px] font-bold px-2 py-1 rounded-md transition-colors"
                                          style={{ background: 'rgba(52,211,153,0.12)', color: 'var(--emerald)' }}
                                          title={`Move to ${nextStage}`}
                                        >
                                          {stageConfig(nextStage).label} →
                                        </button>
                                      )}
                                      {isOffer && (
                                        <button
                                          onClick={() => convertToEmployee(role.id, candidate, role)}
                                          disabled={saving}
                                          className="text-[10px] font-bold px-2 py-1 rounded-md transition-colors flex items-center gap-1"
                                          style={{ background: 'var(--gradient)', color: '#fff' }}
                                          title="Accept offer and create employee record"
                                        >
                                          {saving ? <Loader2 size={10} className="animate-spin" /> : <FileCheck size={10} />}
                                          Convert to Employee
                                        </button>
                                      )}
                                      {candidate.stage !== 'rejected' && (
                                        <button
                                          onClick={() => rejectCandidate(role.id, candidate.id)}
                                          className="text-[10px] font-medium px-2 py-1 rounded-md transition-colors"
                                          style={{ color: 'var(--rose)' }}
                                          title="Reject"
                                        >
                                          Reject
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Transfer to TPS nudge */}
                    {!isFilled && (
                      <div className="mt-4 pt-3 flex flex-col sm:flex-row sm:items-center gap-3" style={{ borderTop: '1px solid var(--line)' }}>
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <Sparkles size={13} style={{ color: 'var(--purple)', flexShrink: 0, marginTop: 1 }} />
                          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                            Transfer this role to The People System for 60+ job board exposure, proactive sourcing and dedicated recruiter support.
                          </p>
                        </div>
                        <button
                          onClick={() => upgradeToTPO(role.id)}
                          className="text-xs font-bold flex items-center gap-1 flex-shrink-0 px-3 py-1.5 rounded-md transition-colors"
                          style={{ background: 'rgba(124,58,237,0.08)', color: 'var(--purple)' }}
                        >
                          Transfer to TPS <ArrowRight size={11} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── New Internal Role Modal ───────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative card p-6 w-full max-w-md overflow-y-auto max-h-[calc(100vh-80px)]" style={{ animation: 'fadeUp 0.2s ease' }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg" style={{ color: 'var(--ink)' }}>Add Internal Role</h3>
              <button onClick={() => setShowForm(false)} className="btn-icon"><X size={16} /></button>
            </div>

            {/* TPS suggestion */}
            <div className="rounded-lg p-3 mb-4" style={{ background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.12)' }}>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                <span className="font-bold" style={{ color: 'var(--purple)' }}>Tip:</span> With The People System, your role is managed by experienced recruiters, posted to 60+ job boards with proactive sourcing across our networks.{' '}
                <Link href="/hire/hiring/new" className="font-bold underline" style={{ color: 'var(--purple)' }}>
                  Raise with TPS instead →
                </Link>
              </p>
            </div>

            <div className="space-y-4">
              <div className="form-group">
                <label className="label">Role Title *</label>
                <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Marketing Manager" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="label">Department</label>
                  <input className="input" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="label">Location</label>
                  <input className="input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="label">Salary Min</label>
                  <input className="input" type="number" value={form.salary_min} onChange={e => setForm(f => ({ ...f, salary_min: e.target.value }))} placeholder="e.g. 35000" />
                </div>
                <div className="form-group">
                  <label className="label">Salary Max</label>
                  <input className="input" type="number" value={form.salary_max} onChange={e => setForm(f => ({ ...f, salary_max: e.target.value }))} placeholder="e.g. 45000" />
                </div>
              </div>
              <div className="form-group">
                <label className="label">Role Description</label>
                <textarea className="input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of the role..." />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowForm(false)} className="btn-secondary btn-sm">Cancel</button>
              <button onClick={createRole} disabled={saving || !form.title.trim()} className="btn-secondary btn-sm">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Save Internal Role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
