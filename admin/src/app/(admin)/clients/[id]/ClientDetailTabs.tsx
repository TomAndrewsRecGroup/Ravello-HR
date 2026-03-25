'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Loader2, Download, Check, Plus, X } from 'lucide-react';

/* ─── Helpers ─────────────────────────────────────── */

const FLAG_LABELS: Record<string, string> = {
  hiring:     'Hiring Module',
  documents:  'Document Management',
  reports:    'Reports',
  support:    'HR Support Requests',
  metrics:    'Metrics Dashboard',
  compliance: 'Compliance Tracking',
};

const STAGE_BADGE: Record<string, string> = {
  submitted:       'badge-submitted',
  in_progress:     'badge-inprogress',
  shortlist_ready: 'badge-shortlist',
  interview:       'badge-interview',
  offer:           'badge-offer',
  filled:          'badge-filled',
  cancelled:       'badge-cancelled',
};

function frictionBadgeStyle(level: string): React.CSSProperties {
  switch (level) {
    case 'Low':      return { background: 'rgba(52,211,153,0.14)', color: '#047857' };
    case 'Medium':   return { background: 'rgba(245,158,11,0.15)', color: '#8A5500' };
    case 'High':     return { background: 'rgba(217,68,68,0.10)',  color: '#B02020' };
    case 'Critical': return { background: 'rgba(127,17,17,0.14)',  color: '#7F1111' };
    default:         return { background: 'rgba(7,11,29,0.07)',    color: '#38436A' };
  }
}

function daysOpen(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

function fmtBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/* ─── Sub-components ─────────────────────────────── */

function FeatureFlagToggles({ companyId, flags }: { companyId: string; flags: Record<string, boolean> }) {
  const supabase = createClient();
  const [localFlags, setLocalFlags] = useState<Record<string, boolean>>(flags);
  const [saving, setSaving] = useState<string | null>(null);

  async function toggle(key: string) {
    const newVal = !localFlags[key];
    setSaving(key);
    setLocalFlags(prev => ({ ...prev, [key]: newVal }));
    await supabase
      .from('companies')
      .update({ feature_flags: { ...localFlags, [key]: newVal } })
      .eq('id', companyId);
    setSaving(null);
  }

  return (
    <div className="space-y-3">
      {Object.keys(FLAG_LABELS).map((key) => {
        const on = !!localFlags[key];
        return (
          <div key={key} className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{FLAG_LABELS[key]}</p>
              <span className={`badge mt-0.5 ${on ? 'badge-on' : 'badge-off'}`}>{on ? 'On' : 'Off'}</span>
            </div>
            <button
              onClick={() => toggle(key)}
              disabled={saving === key}
              aria-label={`Toggle ${FLAG_LABELS[key]}`}
            >
              {saving === key ? (
                <Loader2 size={16} className="animate-spin" style={{ color: 'var(--purple)' }} />
              ) : (
                <div className={`toggle ${on ? 'toggle-on' : 'toggle-off'}`}>
                  <div className={`toggle-knob ${on ? 'toggle-knob-on' : 'toggle-knob-off'}`} />
                </div>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ClientStatusToggle({ companyId, currentActive }: { companyId: string; currentActive: boolean }) {
  const supabase = createClient();
  const router   = useRouter();
  const [active,  setActive]  = useState(currentActive);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const newVal = !active;
    await supabase.from('companies').update({ active: newVal }).eq('id', companyId);
    setActive(newVal);
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`badge ${active ? 'badge-active' : 'badge-inactive'} cursor-pointer hover:opacity-80 transition-opacity`}
    >
      {loading ? '…' : active ? 'Active' : 'Inactive'}
    </button>
  );
}

/* ─── Main tabs component ────────────────────────── */

const TABS = ['Overview', 'Roles', 'Documents', 'Roadmap', 'Services'] as const;
type Tab = typeof TABS[number];

const QUARTERS = ['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026'];
const PILLARS  = ['HIRE', 'LEAD', 'PROTECT'];
const OWNERS   = ['Lucy', 'Tom'];
const MS_STATUSES = ['Not Started', 'In Progress', 'Complete', 'Blocked'];

interface Props {
  company: any;
  users: any[];
  reqs: any[];
  documents: any[];
  milestones: any[];
  services: any[];
  stats: { activeRoles: number; docsCount: number; ticketCount: number };
}

export default function ClientDetailTabs({ company, users, reqs, documents, milestones: initMilestones, services: initServices, stats }: Props) {
  const supabase = createClient();
  const router   = useRouter();
  const [tab, setTab] = useState<Tab>('Overview');

  /* ── Roadmap state ── */
  const [milestones, setMilestones]   = useState<any[]>(initMilestones);
  const [showMSForm,  setShowMSForm]  = useState(false);
  const [msForm,      setMSForm]      = useState({ pillar: 'HIRE', title: '', description: '', owner: 'Lucy', due_date: '', quarter: 'Q2 2026', status: 'Not Started' });
  const [savingMS,    setSavingMS]    = useState(false);

  /* ── Services state ── */
  const [services,      setServices]      = useState<any[]>(initServices);
  const [showSvcForm,   setShowSvcForm]   = useState(false);
  const [svcForm,       setSvcForm]       = useState({ service_name: '', service_tier: '', start_date: '', status: 'Active', monthly_fee: '' });
  const [savingSvc,     setSavingSvc]     = useState(false);

  /* ── Doc approve ── */
  const [approvingDoc,  setApprovingDoc]  = useState<string | null>(null);
  const [approvedDocs,  setApprovedDocs]  = useState<Record<string, boolean>>({});

  async function approveDoc(docId: string) {
    setApprovingDoc(docId);
    await supabase
      .from('documents')
      .update({ approved_at: new Date().toISOString() })
      .eq('id', docId);
    setApprovedDocs(prev => ({ ...prev, [docId]: true }));
    setApprovingDoc(null);
  }

  async function saveMilestone() {
    if (!msForm.title) return;
    setSavingMS(true);
    const { data } = await supabase
      .from('milestones')
      .insert({ ...msForm, company_id: company.id })
      .select()
      .single();
    if (data) setMilestones(prev => [...prev, data]);
    setSavingMS(false);
    setShowMSForm(false);
    setMSForm({ pillar: 'HIRE', title: '', description: '', owner: 'Lucy', due_date: '', quarter: 'Q2 2026', status: 'Not Started' });
  }

  async function updateMilestoneStatus(id: string, status: string) {
    await supabase.from('milestones').update({ status }).eq('id', id);
    setMilestones(prev => prev.map(m => m.id === id ? { ...m, status } : m));
  }

  async function saveService() {
    if (!svcForm.service_name) return;
    setSavingSvc(true);
    const { data } = await supabase
      .from('client_services')
      .insert({ ...svcForm, company_id: company.id, monthly_fee: svcForm.monthly_fee ? parseFloat(svcForm.monthly_fee) : null })
      .select()
      .single();
    if (data) setServices(prev => [data, ...prev]);
    setSavingSvc(false);
    setShowSvcForm(false);
    setSvcForm({ service_name: '', service_tier: '', start_date: '', status: 'Active', monthly_fee: '' });
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b" style={{ borderColor: 'var(--line)' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2.5 text-sm font-semibold transition-all duration-150 relative"
            style={{
              color: tab === t ? 'var(--purple)' : 'var(--ink-soft)',
              borderBottom: tab === t ? '2px solid var(--purple)' : '2px solid transparent',
              marginBottom: '-1px',
              fontFamily: "'Plus Jakarta Sans', Inter, sans-serif",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ─── OVERVIEW ─────────────────────────────────── */}
      {tab === 'Overview' && (
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-6">

            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Active Roles',   value: stats.activeRoles },
                { label: 'Documents',      value: stats.docsCount },
                { label: 'Open Tickets',   value: stats.ticketCount },
              ].map(s => (
                <div key={s.label} className="stat-card">
                  <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{s.label}</p>
                  <p className="font-display font-bold text-3xl mt-1" style={{ color: 'var(--ink)' }}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Company details */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Company Details</h2>
                <ClientStatusToggle companyId={company.id} currentActive={company.active} />
              </div>
              <dl className="grid sm:grid-cols-2 gap-4">
                {[
                  ['Contact email', company.contact_email],
                  ['Sector',        company.sector],
                  ['Size',          company.size_band],
                  ['Created',       new Date(company.created_at).toLocaleDateString('en-GB')],
                ].map(([l, v]) => (
                  <div key={l as string}>
                    <dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>{l}</dt>
                    <dd className="text-sm font-medium mt-0.5" style={{ color: v ? 'var(--ink)' : 'var(--ink-faint)' }}>{v || '—'}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Users */}
            <div className="card p-6">
              <h2 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>Users ({users.length})</h2>
              {users.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No users assigned.</p>
              ) : (
                <div className="table-wrapper">
                  <table className="table">
                    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
                    <tbody>
                      {users.map((u: any) => (
                        <tr key={u.id}>
                          <td className="font-medium">{u.full_name ?? '—'}</td>
                          <td style={{ color: 'var(--ink-soft)' }}>{u.email}</td>
                          <td><span className={`badge badge-${u.role?.includes('admin') ? 'admin' : u.role?.includes('staff') ? 'staff' : 'client'}`}>{u.role}</span></td>
                          <td style={{ color: 'var(--ink-faint)' }}>{new Date(u.created_at).toLocaleDateString('en-GB')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Feature flags sidebar */}
          <div className="card p-6 h-fit">
            <h2 className="font-display font-semibold text-sm mb-5" style={{ color: 'var(--ink)' }}>Feature Flags</h2>
            <FeatureFlagToggles companyId={company.id} flags={company.feature_flags ?? {}} />
          </div>
        </div>
      )}

      {/* ─── ROLES ────────────────────────────────────── */}
      {tab === 'Roles' && (
        <div>
          {reqs.length === 0 ? (
            <div className="card empty-state">No roles for this client.</div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Role Title</th>
                    <th>Stage</th>
                    <th>Friction</th>
                    <th>Days Open</th>
                    <th>Portal Link</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reqs.map((r: any) => {
                    const days     = daysOpen(r.created_at);
                    const friction = r.friction_level ?? 'Unknown';
                    return (
                      <tr key={r.id}>
                        <td className="font-medium">{r.title}</td>
                        <td>
                          <span className={`badge ${STAGE_BADGE[r.stage] ?? 'badge-normal'}`}>
                            {r.stage?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>
                          <span className="badge" style={frictionBadgeStyle(friction)}>{friction}</span>
                        </td>
                        <td style={{ color: days >= 30 ? '#B02020' : 'var(--ink-soft)' }}>{days}d</td>
                        <td>
                          <span className="text-xs font-mono" style={{ color: 'var(--ink-faint)' }}>
                            /hiring/{r.id}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn-ghost btn-sm"
                            onClick={() => alert('Contact The People Office to manage candidates.')}
                          >
                            Upload Candidate
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── DOCUMENTS ────────────────────────────────── */}
      {tab === 'Documents' && (
        <div>
          {documents.length === 0 ? (
            <div className="card empty-state">No documents uploaded for this client.</div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Version</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d: any) => {
                    const isApproved = approvedDocs[d.id] || !!d.approved_at;
                    return (
                      <tr key={d.id}>
                        <td className="font-medium">{d.name ?? d.file_name ?? '—'}</td>
                        <td style={{ color: 'var(--ink-soft)' }}>{d.category ?? '—'}</td>
                        <td style={{ color: 'var(--ink-faint)' }}>{d.version ?? '—'}</td>
                        <td style={{ color: 'var(--ink-faint)' }}>{fmtBytes(d.file_size)}</td>
                        <td style={{ color: 'var(--ink-faint)' }}>{new Date(d.created_at).toLocaleDateString('en-GB')}</td>
                        <td>
                          <span className={`badge ${isApproved ? 'badge-active' : 'badge-normal'}`}>
                            {isApproved ? 'Approved' : 'Pending'}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            {d.file_url && (
                              <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm flex items-center gap-1">
                                <Download size={12} /> Download
                              </a>
                            )}
                            {!isApproved && (
                              <button
                                onClick={() => approveDoc(d.id)}
                                disabled={approvingDoc === d.id}
                                className="btn-cta btn-sm flex items-center gap-1"
                              >
                                {approvingDoc === d.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                                Approve
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── ROADMAP ──────────────────────────────────── */}
      {tab === 'Roadmap' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Milestones</h2>
            <button onClick={() => setShowMSForm(v => !v)} className="btn-cta btn-sm flex items-center gap-1.5">
              <Plus size={13} /> Add Milestone
            </button>
          </div>

          {/* Add milestone form */}
          {showMSForm && (
            <div className="card p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Pillar</label>
                  <select className="input" value={msForm.pillar} onChange={e => setMSForm(f => ({ ...f, pillar: e.target.value }))}>
                    {PILLARS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Quarter</label>
                  <select className="input" value={msForm.quarter} onChange={e => setMSForm(f => ({ ...f, quarter: e.target.value }))}>
                    {QUARTERS.map(q => <option key={q}>{q}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Title</label>
                  <input className="input" placeholder="Milestone title" value={msForm.title} onChange={e => setMSForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Description</label>
                  <textarea className="input h-20 resize-none" placeholder="Description…" value={msForm.description} onChange={e => setMSForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Owner</label>
                  <select className="input" value={msForm.owner} onChange={e => setMSForm(f => ({ ...f, owner: e.target.value }))}>
                    {OWNERS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Due Date</label>
                  <input type="date" className="input" value={msForm.due_date} onChange={e => setMSForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={msForm.status} onChange={e => setMSForm(f => ({ ...f, status: e.target.value }))}>
                    {MS_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveMilestone} disabled={savingMS || !msForm.title} className="btn-cta btn-sm flex items-center gap-1.5">
                  {savingMS ? <Loader2 size={12} className="animate-spin" /> : null} Save Milestone
                </button>
                <button onClick={() => setShowMSForm(false)} className="btn-ghost btn-sm flex items-center gap-1"><X size={12} /> Cancel</button>
              </div>
            </div>
          )}

          {/* Quarterly view — three columns per quarter */}
          {milestones.length === 0 ? (
            <div className="card empty-state">No milestones yet. Add the first one above.</div>
          ) : (
            <div className="space-y-8">
              {[...new Set(milestones.map((m: any) => m.quarter).filter(Boolean))].map((quarter: any) => {
                const qMs = milestones.filter((m: any) => m.quarter === quarter);
                return (
                  <div key={quarter}>
                    <h3 className="font-display font-bold text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--purple)' }}>{quarter}</h3>
                    <div className="grid md:grid-cols-3 gap-4">
                      {PILLARS.map(pillar => {
                        const pMs = qMs.filter((m: any) => m.pillar === pillar);
                        return (
                          <div key={pillar} className="card p-4">
                            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--ink-faint)' }}>{pillar}</p>
                            {pMs.length === 0 ? (
                              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>No milestones</p>
                            ) : (
                              <div className="space-y-3">
                                {pMs.map((m: any) => (
                                  <div key={m.id} className="p-3 rounded-[8px]" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
                                    <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>{m.title}</p>
                                    {m.description && <p className="text-xs mb-2" style={{ color: 'var(--ink-soft)' }}>{m.description}</p>}
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{m.owner} {m.due_date ? `· ${new Date(m.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</span>
                                      <select
                                        className="text-xs rounded-[6px] px-2 py-1 border"
                                        style={{ borderColor: 'var(--line)', color: 'var(--ink-soft)', fontSize: '11px' }}
                                        value={m.status ?? 'Not Started'}
                                        onChange={e => updateMilestoneStatus(m.id, e.target.value)}
                                      >
                                        {MS_STATUSES.map(s => <option key={s}>{s}</option>)}
                                      </select>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── SERVICES ─────────────────────────────────── */}
      {tab === 'Services' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Active Services</h2>
            <button onClick={() => setShowSvcForm(v => !v)} className="btn-cta btn-sm flex items-center gap-1.5">
              <Plus size={13} /> Add Service
            </button>
          </div>

          {/* Add service form */}
          {showSvcForm && (
            <div className="card p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Service Name</label>
                  <input className="input" placeholder="e.g. HIRE Foundations" value={svcForm.service_name} onChange={e => setSvcForm(f => ({ ...f, service_name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Tier</label>
                  <input className="input" placeholder="e.g. Standard" value={svcForm.service_tier} onChange={e => setSvcForm(f => ({ ...f, service_tier: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Start Date</label>
                  <input type="date" className="input" value={svcForm.start_date} onChange={e => setSvcForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Monthly Fee (£)</label>
                  <input type="number" className="input" placeholder="0.00" value={svcForm.monthly_fee} onChange={e => setSvcForm(f => ({ ...f, monthly_fee: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={svcForm.status} onChange={e => setSvcForm(f => ({ ...f, status: e.target.value }))}>
                    {['Active', 'Paused', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveService} disabled={savingSvc || !svcForm.service_name} className="btn-cta btn-sm flex items-center gap-1.5">
                  {savingSvc ? <Loader2 size={12} className="animate-spin" /> : null} Save Service
                </button>
                <button onClick={() => setShowSvcForm(false)} className="btn-ghost btn-sm flex items-center gap-1"><X size={12} /> Cancel</button>
              </div>
            </div>
          )}

          {services.length === 0 ? (
            <div className="card empty-state">No services configured for this client.</div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Tier</th>
                    <th>Start Date</th>
                    <th>Status</th>
                    <th>Monthly Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s: any) => (
                    <tr key={s.id}>
                      <td className="font-medium">{s.service_name}</td>
                      <td style={{ color: 'var(--ink-soft)' }}>{s.service_tier ?? '—'}</td>
                      <td style={{ color: 'var(--ink-soft)' }}>{s.start_date ? new Date(s.start_date).toLocaleDateString('en-GB') : '—'}</td>
                      <td>
                        <span className={`badge ${s.status === 'Active' ? 'badge-active' : s.status === 'Paused' ? 'badge-high' : 'badge-inactive'}`}>
                          {s.status}
                        </span>
                      </td>
                      <td style={{ color: 'var(--ink-soft)' }}>{s.monthly_fee != null ? `£${Number(s.monthly_fee).toLocaleString()}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
