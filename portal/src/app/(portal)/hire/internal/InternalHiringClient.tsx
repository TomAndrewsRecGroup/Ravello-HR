'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  Plus, X, Loader2, Briefcase, ArrowRight, Zap,
  Users, Clock, CheckCircle2, ChevronDown, ChevronRight,
  UserPlus, Sparkles,
} from 'lucide-react';
import Link from 'next/link';

/* ─── Types ─────────────────────────────────────────── */
interface Applicant {
  name: string; email: string; status: string;
  applied_at: string; notes: string;
}
interface InternalRole {
  id: string; title: string; department: string | null;
  location: string | null; working_model: string | null;
  stage: string; created_at: string; managed_by: string;
  internal_applicants: Applicant[] | null;
  description: string | null;
}

interface Props {
  companyId: string; userId: string; isAdmin: boolean;
  internalRoles: InternalRole[];
  tpoFilledCount: number; tpoAvgDays: number;
}

const STAGE_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  submitted:        { label: 'Open',        bg: 'rgba(59,111,255,0.10)',  color: '#1848CC' },
  pending_approval: { label: 'Draft',       bg: 'rgba(148,163,184,0.10)', color: '#475569' },
  sourcing:         { label: 'Sourcing',    bg: 'rgba(124,58,237,0.10)',  color: '#5A1EC0' },
  screening:        { label: 'Screening',   bg: 'rgba(245,158,11,0.12)',  color: '#92400E' },
  interviewing:     { label: 'Interviewing',bg: 'rgba(20,184,166,0.10)',  color: '#0E7A6A' },
  offer:            { label: 'Offer',       bg: 'rgba(52,211,153,0.12)',  color: '#047857' },
  filled:           { label: 'Filled',      bg: 'rgba(52,211,153,0.20)',  color: '#065F46' },
  cancelled:        { label: 'Cancelled',   bg: 'rgba(217,68,68,0.08)',   color: '#B02020' },
};

function daysOpen(created: string): number {
  return Math.floor((Date.now() - new Date(created).getTime()) / 86400000);
}

/* ─── Component ─────────────────────────────────────── */
export default function InternalHiringClient({ companyId, userId, isAdmin, internalRoles, tpoFilledCount, tpoAvgDays }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  // New role form
  const [form, setForm] = useState({
    title: '', department: '', location: '', working_model: '', description: '',
  });

  // Add applicant form
  const [showApplicantForm, setShowApplicantForm] = useState<string | null>(null);
  const [applicantForm, setApplicantForm] = useState({ name: '', email: '', notes: '' });

  const activeRoles = internalRoles.filter(r => !['filled', 'cancelled'].includes(r.stage));
  const staleRoles = activeRoles.filter(r => daysOpen(r.created_at) > 21);

  async function createRole() {
    if (!form.title.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('requisitions').insert({
      company_id: companyId,
      title: form.title.trim(),
      department: form.department || null,
      location: form.location || null,
      working_model: form.working_model || null,
      description: form.description || null,
      managed_by: 'internal',
      stage: 'submitted',
      submitted_by: user?.id,
    });
    setSaving(false);
    setShowForm(false);
    setForm({ title: '', department: '', location: '', working_model: '', description: '' });
    router.refresh();
  }

  async function addApplicant(roleId: string) {
    if (!applicantForm.name.trim()) return;
    const role = internalRoles.find(r => r.id === roleId);
    const current = role?.internal_applicants ?? [];
    const updated = [...current, {
      name: applicantForm.name.trim(),
      email: applicantForm.email || '',
      status: 'applied',
      applied_at: new Date().toISOString(),
      notes: applicantForm.notes || '',
    }];
    await supabase.from('requisitions').update({ internal_applicants: updated }).eq('id', roleId);
    setShowApplicantForm(null);
    setApplicantForm({ name: '', email: '', notes: '' });
    router.refresh();
  }

  async function upgradeToTPO(roleId: string) {
    await supabase.from('requisitions').update({ managed_by: 'tpo' }).eq('id', roleId);
    router.refresh();
  }

  return (
    <div>
      {/* TPO upsell banner — always visible */}
      <div
        className="card p-5 mb-6 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(124,58,237,0.04) 0%, rgba(59,111,255,0.04) 100%)',
          borderLeft: '3px solid var(--purple)',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(124,58,237,0.10)' }}>
              <Sparkles size={18} style={{ color: 'var(--purple)' }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                Let The People System handle your recruitment
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                {tpoFilledCount > 0
                  ? `We've filled ${tpoFilledCount} role${tpoFilledCount !== 1 ? 's' : ''} for you${tpoAvgDays > 0 ? ` in an average of ${tpoAvgDays} days` : ''}. `
                  : ''}
                TPO-managed roles include friction scoring, candidate pipeline, interview scheduling, and dedicated recruiter support.
              </p>
            </div>
          </div>
          <Link href="/hire/hiring/new" className="btn-cta btn-sm flex-shrink-0">
            <Briefcase size={13} /> Raise a TPO-Managed Role
          </Link>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="section-title text-xl">Internal Roles</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
            Self-managed hiring — basic tracking for roles you recruit directly
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowForm(true)} className="btn-secondary btn-sm">
            <Plus size={13} /> Add Internal Role
          </button>
        )}
      </div>

      {/* Stale role nudge */}
      {staleRoles.length > 0 && (
        <div
          className="card p-4 mb-5 flex flex-col sm:flex-row sm:items-center gap-3"
          style={{ borderLeft: '3px solid #D97706', background: 'rgba(245,158,11,0.04)' }}
        >
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Clock size={16} style={{ color: '#D97706', flexShrink: 0, marginTop: 2 }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {staleRoles.length} role{staleRoles.length !== 1 ? 's have' : ' has'} been open for 21+ days
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                Struggling to fill? Hand {staleRoles.length === 1 ? 'it' : 'them'} to The People System — we'll take it from here with full recruiter support.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Roles list */}
      {internalRoles.length === 0 ? (
        <div className="empty-state">
          <Briefcase size={28} />
          <p className="text-sm font-medium">No internal roles</p>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            For the best results, we recommend raising roles through The People System.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <Link href="/hire/hiring/new" className="btn-cta btn-sm">
              <Sparkles size={13} /> Raise TPO-Managed Role
            </Link>
            <button onClick={() => setShowForm(true)} className="btn-ghost btn-sm">
              or manage internally
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {internalRoles.map(role => {
            const st = STAGE_CONFIG[role.stage] ?? STAGE_CONFIG.submitted;
            const days = daysOpen(role.created_at);
            const applicants = role.internal_applicants ?? [];
            const isExpanded = expandedRole === role.id;
            const isStale = days > 21 && !['filled', 'cancelled'].includes(role.stage);

            return (
              <div
                key={role.id}
                className="card"
                style={isStale ? { borderLeft: '3px solid #D97706' } : undefined}
              >
                <div
                  className="p-4 flex items-center gap-4 cursor-pointer"
                  onClick={() => setExpandedRole(isExpanded ? null : role.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{role.title}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: st.bg, color: st.color }}>
                        {st.label}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                      {role.department ?? '—'}
                      {role.location ? ` · ${role.location}` : ''}
                      {' · '}{days}d open
                      {applicants.length > 0 ? ` · ${applicants.length} applicant${applicants.length !== 1 ? 's' : ''}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isStale && !['filled', 'cancelled'].includes(role.stage) && (
                      <button
                        onClick={e => { e.stopPropagation(); upgradeToTPO(role.id); }}
                        className="text-[10px] font-bold px-2.5 py-1 rounded-md hidden sm:inline-flex items-center gap-1"
                        style={{ background: 'rgba(124,58,237,0.08)', color: 'var(--purple)' }}
                      >
                        <Sparkles size={10} /> Hand to TPO
                      </button>
                    )}
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--line)' }}>
                    {role.description && (
                      <p className="text-xs mt-3 mb-3" style={{ color: 'var(--ink-soft)' }}>{role.description}</p>
                    )}

                    {/* Applicants */}
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold" style={{ color: 'var(--ink-faint)' }}>
                          Applicants ({applicants.length})
                        </p>
                        {isAdmin && (
                          <button
                            onClick={() => setShowApplicantForm(showApplicantForm === role.id ? null : role.id)}
                            className="btn-secondary btn-sm"
                          >
                            <UserPlus size={11} /> Add
                          </button>
                        )}
                      </div>

                      {applicants.length === 0 ? (
                        <p className="text-xs py-4 text-center" style={{ color: 'var(--ink-faint)' }}>
                          No applicants yet.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {applicants.map((app, i) => (
                            <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--surface-soft)' }}>
                              <div>
                                <p className="text-xs font-medium" style={{ color: 'var(--ink)' }}>{app.name}</p>
                                <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                                  {app.email}{app.notes ? ` · ${app.notes}` : ''}
                                </p>
                              </div>
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,111,255,0.08)', color: '#1848CC' }}>
                                {app.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Inline applicant form */}
                      {showApplicantForm === role.id && (
                        <div className="mt-3 p-3 rounded-lg" style={{ border: '1px solid var(--line)' }}>
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <input className="input py-1.5 text-xs" placeholder="Name *" value={applicantForm.name} onChange={e => setApplicantForm(f => ({ ...f, name: e.target.value }))} />
                            <input className="input py-1.5 text-xs" placeholder="Email" value={applicantForm.email} onChange={e => setApplicantForm(f => ({ ...f, email: e.target.value }))} />
                          </div>
                          <input className="input py-1.5 text-xs mb-2" placeholder="Notes (optional)" value={applicantForm.notes} onChange={e => setApplicantForm(f => ({ ...f, notes: e.target.value }))} />
                          <div className="flex gap-2">
                            <button onClick={() => addApplicant(role.id)} disabled={!applicantForm.name.trim()} className="btn-cta btn-sm text-xs">Add</button>
                            <button onClick={() => setShowApplicantForm(null)} className="btn-ghost btn-sm text-xs">Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* TPO upgrade nudge inside expanded role */}
                    {!['filled', 'cancelled'].includes(role.stage) && (
                      <div className="mt-4 pt-3 flex items-center gap-3" style={{ borderTop: '1px solid var(--line)' }}>
                        <Sparkles size={13} style={{ color: 'var(--purple)', flexShrink: 0 }} />
                        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                          Want expert recruiter support for this role?
                        </p>
                        <button
                          onClick={() => upgradeToTPO(role.id)}
                          className="text-xs font-bold flex items-center gap-1 ml-auto"
                          style={{ color: 'var(--purple)' }}
                        >
                          Hand to TPO <ArrowRight size={11} />
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
          <div className="relative card p-6 w-full max-w-md" style={{ animation: 'fadeUp 0.2s ease' }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg" style={{ color: 'var(--ink)' }}>Add Internal Role</h3>
              <button onClick={() => setShowForm(false)} className="btn-icon"><X size={16} /></button>
            </div>

            {/* TPO suggestion at top of form */}
            <div className="rounded-lg p-3 mb-4" style={{ background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.12)' }}>
              <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                <span className="font-bold" style={{ color: 'var(--purple)' }}>Tip:</span> For the best outcome,{' '}
                <Link href="/hire/hiring/new" className="font-bold underline" style={{ color: 'var(--purple)' }}>
                  raise this as a TPO-managed role
                </Link>
                {' '}— includes friction scoring, dedicated recruiter, and full candidate pipeline.
              </p>
            </div>

            <div className="space-y-4">
              <div className="form-group">
                <label className="label">Role Title *</label>
                <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Marketing Manager" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="label">Department</label>
                  <input className="input" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="label">Location</label>
                  <input className="input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="label">Description</label>
                <textarea className="input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief role description..." />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowForm(false)} className="btn-secondary btn-sm">Cancel</button>
              <button onClick={createRole} disabled={saving || !form.title.trim()} className="btn-secondary btn-sm">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Save as Internal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
