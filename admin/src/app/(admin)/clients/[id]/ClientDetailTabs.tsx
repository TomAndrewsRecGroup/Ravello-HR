'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';
import { Loader2, Download, Check, Plus, X, User, ExternalLink, CheckCircle2, Bell } from 'lucide-react';
import InviteUserPanel from '@/components/modules/InviteUserPanel';

/* ─── Helpers ─────────────────────────────────────── */

const FLAG_LABELS: Record<string, string> = {
  hiring:     'Hiring Module',
  lead:       'LEAD Module',
  protect:    'PROTECT Module',
  documents:  'Document Management',
  reports:    'Reports',
  support:    'HR Support Requests',
  metrics:    'Metrics Dashboard',
  compliance: 'Compliance Tracking',
  learning:      'E-Learning Marketplace',
  benchmarks:    'Salary Benchmarks',
  friction_lens: 'Friction Lens',
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
    const { error } = await supabase
      .from('companies')
      .update({ feature_flags: { ...localFlags, [key]: newVal } })
      .eq('id', companyId);
    if (!error) {
      setLocalFlags(prev => ({ ...prev, [key]: newVal }));
      revalidateAdminPath('/clients');
    }
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

function ManatalIdField({ companyId, currentId }: { companyId: string; currentId: string }) {
  const supabase = createClient();
  const [value,  setValue]  = useState(currentId);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from('companies').update({ manatal_client_id: value || null }).eq('id', companyId);
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      revalidateAdminPath('/clients');
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-faint)' }}>Manatal Client ID</p>
      <div className="flex gap-2">
        <input
          className="input flex-1 text-sm"
          placeholder="e.g. 12345"
          value={value}
          onChange={e => setValue(e.target.value)}
        />
        <button onClick={save} disabled={saving} className="btn-secondary btn-sm flex-shrink-0">
          {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} /> : 'Save'}
        </button>
      </div>
      <p className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }}>
        Link this client to their Manatal department/account to enable live pipeline in the portal.
      </p>
    </div>
  );
}

function ClientStatusToggle({ companyId, currentActive }: { companyId: string; currentActive: boolean }) {
  const supabase = createClient();
  const [active,  setActive]  = useState(currentActive);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const newVal = !active;
    const { error } = await supabase.from('companies').update({ active: newVal }).eq('id', companyId);
    if (!error) {
      setActive(newVal);
      revalidateAdminPath('/clients');
    }
    setLoading(false);
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

const TABS = ['Overview', 'Roles', 'Candidates', 'Documents', 'Roadmap', 'Actions', 'Compliance', 'LEAD', 'PROTECT', 'Services', 'Friction'] as const;
type Tab = typeof TABS[number];

const QUARTERS = ['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026'];
const PILLARS  = ['HIRE', 'LEAD', 'PROTECT'];
const OWNERS   = ['Lucy', 'Tom'];
const MS_STATUSES = ['Not Started', 'In Progress', 'Complete', 'Blocked'];

const PRIORITIES = ['high', 'medium', 'low'] as const;
const ACTION_STATUSES = ['active', 'complete', 'dismissed'] as const;

const COMP_CATEGORIES = ['general', 'contracts', 'policies', 'health_safety', 'data_protection', 'employment_law', 'other'];
const COMP_STATUSES   = ['pending', 'in_review', 'complete', 'overdue'] as const;

const COMP_STATUS_STYLE: Record<string, React.CSSProperties> = {
  pending:   { background: 'rgba(148,163,184,0.12)', color: '#475569' },
  in_review: { background: 'rgba(245,158,11,0.12)',  color: '#92400E' },
  complete:  { background: 'rgba(22,163,74,0.12)',   color: '#166534' },
  overdue:   { background: 'rgba(220,38,38,0.12)',   color: '#991B1B' },
};

const PRIORITY_STYLE: Record<string, React.CSSProperties> = {
  high:   { background: 'rgba(220,38,38,0.1)',   color: '#991B1B' },
  medium: { background: 'rgba(217,119,6,0.1)',   color: '#92400E' },
  low:    { background: 'rgba(148,163,184,0.1)', color: '#64748B' },
};

const CLIENT_STATUS_STYLE: Record<string, React.CSSProperties> = {
  pending:        { background: 'rgba(148,163,184,0.1)', color: '#64748B' },
  approved:       { background: 'rgba(22,163,74,0.1)',   color: '#166534' },
  rejected:       { background: 'rgba(220,38,38,0.1)',   color: '#991B1B' },
  info_requested: { background: 'rgba(217,119,6,0.1)',   color: '#92400E' },
};

interface Props {
  company: any;
  users: any[];
  reqs: any[];
  stats: { activeRoles: number; docsCount: number; ticketCount: number };
}

export default function ClientDetailTabs({ company, users, reqs, stats }: Props) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>('Overview');

  /* ── Lazy-loaded tab data ── */
  const [tabData, setTabData] = useState<Record<string, any>>({});
  const [tabLoading, setTabLoading] = useState<string | null>(null);
  const fetchedTabs = useRef(new Set<string>());

  const loadTabData = useCallback(async (tabName: string) => {
    // Skip tabs that don't need lazy loading or are already loaded
    if (['Overview', 'Roles'].includes(tabName)) return;
    if (fetchedTabs.current.has(tabName)) return;
    fetchedTabs.current.add(tabName);
    setTabLoading(tabName);
    try {
      const res = await fetch(`/api/client-tab-data?companyId=${company.id}&tab=${tabName}`);
      const data = await res.json();
      setTabData(prev => ({ ...prev, [tabName]: data }));
    } catch (err) {
      console.error(`Failed to load ${tabName} data:`, err);
      fetchedTabs.current.delete(tabName);
    }
    setTabLoading(null);
  }, [company.id]);

  function handleTabChange(newTab: Tab) {
    setTab(newTab);
    loadTabData(newTab);
  }

  /* ── Lazy-loaded state (populated when tab data arrives) ── */
  const [documents,    setDocuments]    = useState<any[]>([]);

  /* ── Actions state ── */
  const [actions,      setActions]      = useState<any[]>([]);
  const [showActForm,  setShowActForm]  = useState(false);
  const [actForm,      setActForm]      = useState({ title: '', description: '', priority: 'medium', due_date: '' });
  const [savingAct,    setSavingAct]    = useState(false);

  async function saveAction() {
    if (!actForm.title) return;
    setSavingAct(true);
    const { data, error } = await supabase
      .from('actions')
      .insert({ ...actForm, company_id: company.id, status: 'active', due_date: actForm.due_date || null })
      .select()
      .single();
    if (!error && data) {
      setActions(prev => [data, ...prev]);
      revalidateAdminPath('/clients');
    }
    setSavingAct(false);
    setShowActForm(false);
    setActForm({ title: '', description: '', priority: 'medium', due_date: '' });
  }

  async function completeAction(id: string) {
    const { error } = await supabase.from('actions').update({ status: 'complete', completed_at: new Date().toISOString() }).eq('id', id);
    if (!error) {
      setActions(prev => prev.map(a => a.id === id ? { ...a, status: 'complete' } : a));
      revalidateAdminPath('/clients');
    }
  }

  /* ── Candidates state ── */
  const [candidates,    setCandidates]   = useState<any[]>([]);
  const [showCandForm,  setShowCandForm] = useState(false);
  const [candForm,      setCandForm]     = useState({ full_name: '', email: '', phone: '', summary: '', cv_url: '', recruiter_notes: '', requisition_id: '', approved_for_client: false });
  const [savingCand,    setSavingCand]   = useState(false);
  const [togglingCand,  setTogglingCand] = useState<string | null>(null);

  async function saveCandidate() {
    if (!candForm.full_name || !candForm.requisition_id) return;
    setSavingCand(true);
    const { data, error } = await supabase
      .from('candidates')
      .insert({ ...candForm, company_id: company.id })
      .select()
      .single();
    if (!error && data) {
      setCandidates(prev => [data, ...prev]);
      revalidateAdminPath('/clients');
    }
    setSavingCand(false);
    setShowCandForm(false);
    setCandForm({ full_name: '', email: '', phone: '', summary: '', cv_url: '', recruiter_notes: '', requisition_id: '', approved_for_client: false });
  }

  async function toggleApproved(id: string, current: boolean) {
    setTogglingCand(id);
    const { error } = await supabase.from('candidates').update({ approved_for_client: !current }).eq('id', id);
    if (!error) {
      setCandidates(prev => prev.map(c => c.id === id ? { ...c, approved_for_client: !current } : c));
      revalidateAdminPath('/clients');
    }
    setTogglingCand(null);
  }

  /* ── Compliance state ── */
  const [compliance,    setCompliance]   = useState<any[]>([]);
  const [showCompForm,  setShowCompForm] = useState(false);
  const [compForm,      setCompForm]     = useState({ title: '', description: '', category: 'general', due_date: '', status: 'pending' });
  const [savingComp,    setSavingComp]   = useState(false);

  async function saveCompliance() {
    if (!compForm.title || !compForm.due_date) return;
    setSavingComp(true);
    const { data, error } = await supabase
      .from('compliance_items')
      .insert({ ...compForm, company_id: company.id })
      .select()
      .single();
    if (!error && data) {
      setCompliance(prev => [...prev, data].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()));
      revalidateAdminPath('/clients');
    }
    setSavingComp(false);
    setShowCompForm(false);
    setCompForm({ title: '', description: '', category: 'general', due_date: '', status: 'pending' });
  }

  async function updateComplianceStatus(id: string, status: string) {
    const { error } = await supabase.from('compliance_items').update({ status }).eq('id', id);
    if (!error) {
      setCompliance(prev => prev.map(c => c.id === id ? { ...c, status } : c));
      revalidateAdminPath('/clients');
    }
  }

  /* ── Roadmap state ── */
  const [milestones, setMilestones]   = useState<any[]>([]);
  const [showMSForm,  setShowMSForm]  = useState(false);
  const [msForm,      setMSForm]      = useState({ pillar: 'HIRE', title: '', description: '', owner: 'Lucy', due_date: '', quarter: 'Q2 2026', status: 'Not Started' });
  const [savingMS,    setSavingMS]    = useState(false);

  /* ── Services state ── */
  const [services,      setServices]      = useState<any[]>([]);
  const [showSvcForm,   setShowSvcForm]   = useState(false);
  const [svcForm,       setSvcForm]       = useState({ service_name: '', service_tier: '', start_date: '', status: 'Active', monthly_fee: '' });
  const [savingSvc,     setSavingSvc]     = useState(false);

  /* ── LEAD state ── */
  const [trainingNeeds, setTrainingNeeds] = useState<any[]>([]);
  const [perfReviews,   setPerfReviews]   = useState<any[]>([]);

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

  /* ── PROTECT state ── */
  const [absenceRecords, setAbsenceRecords] = useState<any[]>([]);
  const [empDocs,        setEmpDocs]        = useState<any[]>([]);

  // Sync lazy-loaded tab data into component state
  useEffect(() => {
    if (tabData['Candidates']?.candidates) setCandidates(tabData['Candidates'].candidates);
  }, [tabData['Candidates']]);
  useEffect(() => {
    if (tabData['Documents']?.documents) setDocuments(tabData['Documents'].documents);
  }, [tabData['Documents']]);
  useEffect(() => {
    if (tabData['Roadmap']?.milestones) setMilestones(tabData['Roadmap'].milestones);
  }, [tabData['Roadmap']]);
  useEffect(() => {
    if (tabData['Actions']?.actions) setActions(tabData['Actions'].actions);
  }, [tabData['Actions']]);
  useEffect(() => {
    if (tabData['Compliance']?.compliance) setCompliance(tabData['Compliance'].compliance);
  }, [tabData['Compliance']]);
  useEffect(() => {
    if (tabData['LEAD']) {
      setTrainingNeeds(tabData['LEAD'].trainingNeeds ?? []);
      setPerfReviews(tabData['LEAD'].perfReviews ?? []);
    }
  }, [tabData['LEAD']]);
  useEffect(() => {
    if (tabData['PROTECT']) {
      setAbsenceRecords(tabData['PROTECT'].absenceRecords ?? []);
      setEmpDocs(tabData['PROTECT'].empDocs ?? []);
    }
  }, [tabData['PROTECT']]);
  useEffect(() => {
    if (tabData['Services']?.services) setServices(tabData['Services'].services);
  }, [tabData['Services']]);

  async function updateAbsenceStatus(id: string, status: string) {
    const { error } = await supabase.from('absence_records').update({ status }).eq('id', id);
    if (!error) {
      setAbsenceRecords(prev => prev.map(a => a.id === id ? { ...a, status } : a));
      revalidateAdminPath('/clients');
    }
  }

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
            onClick={() => handleTabChange(t)}
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

      {/* Loading indicator for lazy-loaded tabs */}
      {tabLoading && tabLoading !== 'Friction' && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--purple)' }} />
        </div>
      )}

      {/* ─── OVERVIEW ─────────────────────────────────── */}
      {tab === 'Overview' && (
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-6">

            {/* Stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
              <div className="mt-5 pt-5 border-t" style={{ borderColor: 'var(--line)' }}>
                <ManatalIdField companyId={company.id} currentId={company.manatal_client_id ?? ''} />
              </div>
            </div>

            {/* Users */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Users ({users.length})</h2>
                <InviteUserPanel companyId={company.id} />
              </div>
              {users.length === 0 ? (
                <p className="text-sm mb-4" style={{ color: 'var(--ink-faint)' }}>No users assigned yet.</p>
              ) : (
                <div className="table-wrapper mb-4">
                  <table className="table">
                    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
                    <tbody>
                      {users.map((u: any) => (
                        <tr key={u.id}>
                          <td className="font-medium">{u.full_name ?? '—'}</td>
                          <td style={{ color: 'var(--ink-soft)' }}>{u.email}</td>
                          <td><span className={`badge badge-${u.role?.includes('admin') ? 'admin' : u.role?.includes('staff') ? 'staff' : 'client'}`}>{u.role?.replace(/_/g,' ')}</span></td>
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
                        <td className="font-medium">
                          <a href={`/hiring/${r.id}`} className="hover:underline" style={{ color: 'var(--purple)' }}>{r.title}</a>
                        </td>
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
                            onClick={() => { handleTabChange('Candidates'); setCandForm(f => ({ ...f, requisition_id: r.id })); setShowCandForm(true); }}
                          >
                            <Plus size={12} /> Add Candidate
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

      {/* ─── CANDIDATES ───────────────────────────────── */}
      {tab === 'Candidates' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
              Candidates ({candidates.length})
            </h2>
            <button onClick={() => setShowCandForm(v => !v)} className="btn-cta btn-sm flex items-center gap-1.5">
              <Plus size={13} /> Add Candidate
            </button>
          </div>

          {/* Add candidate form */}
          {showCandForm && (
            <div className="card p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Full name *</label>
                  <input className="input" placeholder="Jane Smith" value={candForm.full_name} onChange={e => setCandForm(f => ({ ...f, full_name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Role *</label>
                  <select className="input" value={candForm.requisition_id} onChange={e => setCandForm(f => ({ ...f, requisition_id: e.target.value }))}>
                    <option value="">Select role…</option>
                    {reqs.filter((r: any) => !['filled','cancelled'].includes(r.stage)).map((r: any) => (
                      <option key={r.id} value={r.id}>{r.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Email</label>
                  <input type="email" className="input" placeholder="jane@example.com" value={candForm.email} onChange={e => setCandForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input className="input" placeholder="+44 7700 000000" value={candForm.phone} onChange={e => setCandForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Summary</label>
                  <textarea className="input h-20 resize-none" placeholder="Brief candidate overview…" value={candForm.summary} onChange={e => setCandForm(f => ({ ...f, summary: e.target.value }))} />
                </div>
                <div>
                  <label className="label">CV / LinkedIn URL</label>
                  <input type="url" className="input" placeholder="https://…" value={candForm.cv_url} onChange={e => setCandForm(f => ({ ...f, cv_url: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Recruiter notes</label>
                  <input className="input" placeholder="Internal notes (not shown to client)" value={candForm.recruiter_notes} onChange={e => setCandForm(f => ({ ...f, recruiter_notes: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={candForm.approved_for_client} onChange={e => setCandForm(f => ({ ...f, approved_for_client: e.target.checked }))} className="w-4 h-4 accent-purple-600" />
                    <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Share with client immediately</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveCandidate} disabled={savingCand || !candForm.full_name || !candForm.requisition_id} className="btn-cta btn-sm flex items-center gap-1.5">
                  {savingCand ? <Loader2 size={12} className="animate-spin" /> : null} Save Candidate
                </button>
                <button onClick={() => setShowCandForm(false)} className="btn-ghost btn-sm flex items-center gap-1"><X size={12} /> Cancel</button>
              </div>
            </div>
          )}

          {/* Candidate list grouped by role */}
          {candidates.length === 0 && !showCandForm ? (
            <div className="card empty-state">No candidates added yet.</div>
          ) : (
            <div className="space-y-6">
              {reqs.map((r: any) => {
                const rCands = candidates.filter((c: any) => c.requisition_id === r.id);
                if (rCands.length === 0) return null;
                return (
                  <div key={r.id}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-faint)' }}>
                      {r.title} — {rCands.length} candidate{rCands.length !== 1 ? 's' : ''}
                    </p>
                    <div className="card overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--surface-alt)' }}>
                            {['Name', 'Summary', 'CV', 'Client Status', 'Feedback', 'Share'].map(h => (
                              <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rCands.map((c: any) => (
                            <tr key={c.id} style={{ borderBottom: '1px solid var(--line)' }}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(124,58,237,0.1)' }}>
                                    <User size={13} style={{ color: 'var(--purple)' }} />
                                  </div>
                                  <div>
                                    <p className="font-medium text-xs" style={{ color: 'var(--ink)' }}>{c.full_name}</p>
                                    {c.email && <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>{c.email}</p>}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 max-w-[200px]">
                                <p className="text-xs truncate" style={{ color: 'var(--ink-soft)' }}>{c.summary ?? '—'}</p>
                              </td>
                              <td className="px-4 py-3">
                                {c.cv_url ? (
                                  <a href={c.cv_url} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm flex items-center gap-1 w-fit">
                                    <ExternalLink size={11} /> CV
                                  </a>
                                ) : <span style={{ color: 'var(--ink-faint)' }}>—</span>}
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={CLIENT_STATUS_STYLE[c.client_status] ?? CLIENT_STATUS_STYLE.pending}>
                                  {c.client_status?.replace(/_/g, ' ') ?? 'pending'}
                                </span>
                              </td>
                              <td className="px-4 py-3 max-w-[160px]">
                                <p className="text-xs truncate" style={{ color: 'var(--ink-faint)' }}>{c.client_feedback ?? '—'}</p>
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => toggleApproved(c.id, c.approved_for_client)}
                                  disabled={togglingCand === c.id}
                                  className={`text-[11px] font-semibold px-2 py-1 rounded-full transition-all ${c.approved_for_client ? 'btn-secondary' : 'btn-cta'} btn-sm`}
                                >
                                  {togglingCand === c.id ? <Loader2 size={10} className="animate-spin" /> : c.approved_for_client ? 'Unshare' : 'Share'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
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

      {/* ─── ACTIONS ──────────────────────────────────── */}
      {tab === 'Actions' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
              Client Actions
            </h2>
            <button onClick={() => setShowActForm(v => !v)} className="btn-cta btn-sm flex items-center gap-1.5">
              <Plus size={13} /> Add Action
            </button>
          </div>

          {/* Add action form */}
          {showActForm && (
            <div className="card p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">Title *</label>
                  <input className="input" placeholder="e.g. Review updated employment contract" value={actForm.title} onChange={e => setActForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Description</label>
                  <textarea className="input h-20 resize-none" placeholder="Context or instructions for the client…" value={actForm.description} onChange={e => setActForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Priority</label>
                  <select className="input" value={actForm.priority} onChange={e => setActForm(f => ({ ...f, priority: e.target.value }))}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Due date</label>
                  <input type="date" className="input" value={actForm.due_date} onChange={e => setActForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveAction} disabled={savingAct || !actForm.title} className="btn-cta btn-sm flex items-center gap-1.5">
                  {savingAct ? <Loader2 size={12} className="animate-spin" /> : null} Save Action
                </button>
                <button onClick={() => setShowActForm(false)} className="btn-ghost btn-sm flex items-center gap-1"><X size={12} /> Cancel</button>
              </div>
            </div>
          )}

          {/* Action list */}
          {actions.length === 0 && !showActForm ? (
            <div className="card empty-state">No actions created for this client.</div>
          ) : (
            <div className="space-y-2">
              {actions.map((a: any) => {
                const isDone = a.status === 'complete';
                return (
                  <div
                    key={a.id}
                    className="card px-4 py-3 flex items-start justify-between gap-4"
                    style={{ opacity: isDone ? 0.55 : 1 }}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <Bell size={14} className="flex-shrink-0 mt-0.5" style={{ color: isDone ? 'var(--ink-faint)' : 'var(--purple)' }} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium" style={{ color: 'var(--ink)', textDecoration: isDone ? 'line-through' : undefined }}>{a.title}</p>
                        {a.description && <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--ink-faint)' }}>{a.description}</p>}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full" style={PRIORITY_STYLE[a.priority] ?? PRIORITY_STYLE.low}>
                            {a.priority}
                          </span>
                          {a.due_date && (
                            <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                              Due {new Date(a.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {!isDone && (
                      <button
                        onClick={() => completeAction(a.id)}
                        className="flex-shrink-0 btn-secondary btn-sm flex items-center gap-1.5"
                      >
                        <CheckCircle2 size={12} /> Complete
                      </button>
                    )}
                    {isDone && (
                      <span className="flex-shrink-0 text-[11px] font-medium flex items-center gap-1" style={{ color: 'var(--teal)' }}>
                        <CheckCircle2 size={12} /> Done
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── COMPLIANCE ───────────────────────────────── */}
      {tab === 'Compliance' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
              Compliance Items ({compliance.length})
            </h2>
            <button onClick={() => setShowCompForm(v => !v)} className="btn-cta btn-sm flex items-center gap-1.5">
              <Plus size={13} /> Add Item
            </button>
          </div>

          {/* Add compliance form */}
          {showCompForm && (
            <div className="card p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">Title *</label>
                  <input className="input" placeholder="e.g. Renew employer liability insurance" value={compForm.title} onChange={e => setCompForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Description</label>
                  <textarea className="input h-16 resize-none" placeholder="Additional context…" value={compForm.description} onChange={e => setCompForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Category</label>
                  <select className="input" value={compForm.category} onChange={e => setCompForm(f => ({ ...f, category: e.target.value }))}>
                    {COMP_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Due Date *</label>
                  <input type="date" className="input" value={compForm.due_date} onChange={e => setCompForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Initial Status</label>
                  <select className="input" value={compForm.status} onChange={e => setCompForm(f => ({ ...f, status: e.target.value }))}>
                    {COMP_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveCompliance} disabled={savingComp || !compForm.title || !compForm.due_date} className="btn-cta btn-sm flex items-center gap-1.5">
                  {savingComp ? <Loader2 size={12} className="animate-spin" /> : null} Save Item
                </button>
                <button onClick={() => setShowCompForm(false)} className="btn-ghost btn-sm flex items-center gap-1"><X size={12} /> Cancel</button>
              </div>
            </div>
          )}

          {/* Compliance list */}
          {compliance.length === 0 && !showCompForm ? (
            <div className="card empty-state">No compliance items for this client.</div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Category</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th>Update</th>
                  </tr>
                </thead>
                <tbody>
                  {compliance.map((ci: any) => {
                    const isOverdue = ci.status !== 'complete' && new Date(ci.due_date) < new Date();
                    return (
                      <tr key={ci.id}>
                        <td>
                          <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{ci.title}</p>
                          {ci.description && <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{ci.description}</p>}
                        </td>
                        <td style={{ color: 'var(--ink-soft)' }}>{ci.category?.replace(/_/g, ' ')}</td>
                        <td style={{ color: isOverdue ? '#991B1B' : 'var(--ink-soft)', fontWeight: isOverdue ? 600 : undefined }}>
                          {new Date(ci.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {isOverdue && <span className="ml-1 text-[10px]">OVERDUE</span>}
                        </td>
                        <td>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={COMP_STATUS_STYLE[ci.status] ?? COMP_STATUS_STYLE.pending}>
                            {ci.status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>
                          <select
                            className="text-xs rounded-[6px] px-2 py-1 border"
                            style={{ borderColor: 'var(--line)', color: 'var(--ink-soft)', fontSize: '11px' }}
                            value={ci.status ?? 'pending'}
                            onChange={e => updateComplianceStatus(ci.id, e.target.value)}
                          >
                            {COMP_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                          </select>
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

      {/* ─── LEAD ─────────────────────────────────────── */}
      {tab === 'LEAD' && (
        <div className="space-y-8">
          {/* Training Needs */}
          <div>
            <h2 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>
              Training Needs
              <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: 'rgba(217,119,6,0.1)', color: '#92400E' }}>
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
                        <td style={{ color: 'var(--ink-soft)' }}>{[n.employee_name, n.department].filter(Boolean).join(' · ') || '—'}</td>
                        <td>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={PRIORITY_STYLE[n.priority] ?? PRIORITY_STYLE.medium}>
                            {n.priority}
                          </span>
                        </td>
                        <td style={{ color: 'var(--ink-soft)' }}>{n.target_date ? new Date(n.target_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
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
              <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: 'rgba(124,58,237,0.1)', color: '#5B21B6' }}>
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
                        <td style={{ color: 'var(--ink-soft)' }} className="capitalize">{r.review_type?.replace(/_/g, ' ')}</td>
                        <td style={{ color: 'var(--ink-soft)' }}>{r.due_date ? new Date(r.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                        <td style={{ color: 'var(--ink-soft)' }}>{r.overall_rating ?? '—'}</td>
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
      )}

      {/* ─── PROTECT ───────────────────────────────────── */}
      {tab === 'PROTECT' && (
        <div className="space-y-8">
          {/* Absence Records */}
          <div>
            <h2 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>
              Absence Records
              <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: 'rgba(217,119,6,0.1)', color: '#92400E' }}>
                {absenceRecords.filter(a => a.status === 'pending').length} pending approval
              </span>
            </h2>
            {absenceRecords.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No absence records.</p>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Type</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Days</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {absenceRecords.map((a: any) => (
                      <tr key={a.id}>
                        <td>
                          <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{a.employee_name}</p>
                          {a.department && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{a.department}</p>}
                        </td>
                        <td style={{ color: 'var(--ink-soft)' }} className="capitalize">{a.absence_type?.replace(/_/g, ' ')}</td>
                        <td style={{ color: 'var(--ink-soft)' }}>{a.start_date ? new Date(a.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                        <td style={{ color: 'var(--ink-soft)' }}>{a.end_date ? new Date(a.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                        <td style={{ color: 'var(--ink-soft)' }}>{a.days ?? '—'}</td>
                        <td>
                          {a.status === 'pending' ? (
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => updateAbsenceStatus(a.id, 'approved')}
                                className="btn-sm btn-secondary text-[11px] flex items-center gap-1"
                                style={{ color: '#166534' }}
                              >
                                <Check size={11} /> Approve
                              </button>
                              <button
                                onClick={() => updateAbsenceStatus(a.id, 'rejected')}
                                className="btn-sm btn-ghost text-[11px]"
                                style={{ color: '#991B1B' }}
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span
                              className="text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize"
                              style={
                                a.status === 'approved' ? { background: 'rgba(22,163,74,0.1)', color: '#166534' } :
                                a.status === 'rejected' ? { background: 'rgba(220,38,38,0.1)', color: '#991B1B' } :
                                { background: 'rgba(148,163,184,0.1)', color: '#64748B' }
                              }
                            >
                              {a.status}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Employee Documents */}
          <div>
            <h2 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>
              Employee Documents
              {empDocs.filter(d => d.status === 'expired').length > 0 && (
                <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: 'rgba(220,38,38,0.1)', color: '#991B1B' }}>
                  {empDocs.filter(d => d.status === 'expired').length} expired
                </span>
              )}
            </h2>
            {empDocs.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No employee documents uploaded.</p>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Document</th>
                      <th>Type</th>
                      <th>Expiry</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empDocs.map((d: any) => {
                      const isExpired = d.status === 'expired' || (d.expiry_date && new Date(d.expiry_date) < new Date());
                      return (
                        <tr key={d.id}>
                          <td>
                            <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{d.employee_name}</p>
                            {d.department && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{d.department}</p>}
                          </td>
                          <td>
                            {d.file_url ? (
                              <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm" style={{ color: 'var(--purple)' }}>
                                {d.title} <ExternalLink size={11} />
                              </a>
                            ) : (
                              <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{d.title}</span>
                            )}
                          </td>
                          <td style={{ color: 'var(--ink-soft)' }} className="capitalize">{d.doc_type?.replace(/_/g, ' ')}</td>
                          <td style={{ color: isExpired ? '#991B1B' : 'var(--ink-soft)', fontWeight: isExpired ? 600 : undefined }}>
                            {d.expiry_date ? new Date(d.expiry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                            {isExpired && d.expiry_date && <span className="ml-1 text-[10px]">EXPIRED</span>}
                          </td>
                          <td>
                            <span
                              className="text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize"
                              style={
                                d.status === 'active'           ? { background: 'rgba(22,163,74,0.1)',    color: '#166534' } :
                                d.status === 'expired'          ? { background: 'rgba(220,38,38,0.1)',   color: '#991B1B' } :
                                d.status === 'pending_renewal'  ? { background: 'rgba(217,119,6,0.1)',   color: '#92400E' } :
                                { background: 'rgba(148,163,184,0.1)', color: '#64748B' }
                              }
                            >
                              {d.status?.replace(/_/g, ' ')}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── SERVICES ─────────────────────────────────── */}
      {tab === 'Friction' && (
        tabLoading === 'Friction' ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--purple)' }} />
          </div>
        ) : (
          <FrictionTab
            company={company}
            assessment={tabData['Friction']?.frictionAssessment ?? null}
            items={tabData['Friction']?.frictionItems ?? []}
            users={users}
            documents={documents}
          />
        )
      )}

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

/* ─── Friction Tab ──────────────────────────────────── */

const BAND_STYLE: Record<string, React.CSSProperties> = {
  'Low Friction':      { background: 'rgba(52,211,153,0.14)', color: '#047857' },
  'Moderate Friction': { background: 'rgba(245,158,11,0.15)', color: '#8A5500' },
  'High Friction':     { background: 'rgba(217,68,68,0.10)',  color: '#B02020' },
};

const SEV_STYLE: Record<string, React.CSSProperties> = {
  critical: { background: 'rgba(217,68,68,0.10)',  color: '#B02020' },
  high:     { background: 'rgba(245,130,11,0.12)', color: '#A45500' },
  medium:   { background: 'rgba(245,158,11,0.10)', color: '#8A5500' },
  low:      { background: 'rgba(59,111,255,0.10)', color: '#2A55CC' },
};

function FrictionTab({ company, assessment, items: initItems, users, documents }: {
  company: any;
  assessment: any | null;
  items: any[];
  users: any[];
  documents: any[];
}) {
  const supabase = createClient();
  const [items,  setItems]  = useState<any[]>(initItems);
  const [saving, setSaving] = useState<string | null>(null);

  async function toggleItem(item: any) {
    const newCompleted = !item.is_completed;
    setSaving(item.id);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from('company_friction_items')
      .update({
        is_completed: newCompleted,
        completed_at: newCompleted ? new Date().toISOString() : null,
        completed_by: newCompleted ? user?.id : null,
      })
      .eq('id', item.id);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_completed: newCompleted } : i));
    setSaving(null);
    revalidateAdminPath(`/clients/${company.id}`);
  }

  if (!assessment) {
    return (
      <div className="space-y-4">
        <div className="empty-state">
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
            No Friction Lens assessment yet. The client can complete their assessment from the portal.
          </p>
        </div>
      </div>
    );
  }

  const dims = assessment.dimensions ?? [];
  const completedCount = items.filter((i: any) => i.is_completed).length;
  const totalItems     = items.length;

  // Group items by dimension
  const itemsByDim: Record<string, any[]> = {};
  for (const item of items) {
    if (!itemsByDim[item.dimension]) itemsByDim[item.dimension] = [];
    itemsByDim[item.dimension].push(item);
  }

  return (
    <div className="space-y-6">
      {/* Score overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <span className="badge text-sm px-3 py-1" style={BAND_STYLE[assessment.overall_band] ?? {}}>
            {assessment.overall_band ?? 'Not Scored'}
          </span>
          <p className="text-[10px] mt-2 uppercase tracking-wider font-semibold" style={{ color: 'var(--ink-faint)' }}>Overall Band</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{assessment.employee_count}</p>
          <p className="text-[10px] mt-1 uppercase tracking-wider font-semibold" style={{ color: 'var(--ink-faint)' }}>Employees</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{completedCount}/{totalItems}</p>
          <p className="text-[10px] mt-1 uppercase tracking-wider font-semibold" style={{ color: 'var(--ink-faint)' }}>Items Resolved</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-sm font-medium capitalize" style={{ color: 'var(--ink)' }}>{assessment.confidence ?? '—'}</p>
          <p className="text-[10px] mt-1 uppercase tracking-wider font-semibold" style={{ color: 'var(--ink-faint)' }}>Confidence</p>
        </div>
      </div>

      {/* Top signals */}
      {assessment.top_signals?.length > 0 && (
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-2" style={{ color: 'var(--ink-faint)' }}>Top Signals</p>
          <ul className="space-y-1">
            {assessment.top_signals.map((s: string, i: number) => (
              <li key={i} className="text-sm flex items-start gap-2" style={{ color: 'var(--ink-soft)' }}>
                <span style={{ color: 'var(--gold)' }}>•</span> {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dimension grid */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: 'var(--ink-faint)' }}>Dimensions</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {dims.map((dim: any, i: number) => (
            <div key={i} className="card p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{dim.name}</p>
                <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>{dim.signal_count} signal{dim.signal_count !== 1 ? 's' : ''}</p>
              </div>
              <span className="badge text-xs" style={BAND_STYLE[dim.band] ?? {}}>{dim.band}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Checklist */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: 'var(--ink-faint)' }}>
          Friction Checklist — tick items as you resolve them
        </p>
        {Object.entries(itemsByDim).map(([dim, dimItems]) => (
          <div key={dim} className="mb-4">
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-soft)' }}>{dim}</p>
            <div className="space-y-1">
              {dimItems.map((item: any) => (
                <div key={item.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[var(--surface-soft)] transition-colors">
                  <button
                    onClick={() => toggleItem(item)}
                    disabled={saving === item.id}
                    className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{
                      borderColor: item.is_completed ? '#16A34A' : 'var(--line)',
                      background: item.is_completed ? 'rgba(22,163,74,0.1)' : 'transparent',
                    }}
                  >
                    {saving === item.id ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : item.is_completed ? (
                      <Check size={10} style={{ color: '#16A34A' }} />
                    ) : null}
                  </button>
                  <span
                    className="text-sm flex-1"
                    style={{
                      color: item.is_completed ? 'var(--ink-faint)' : 'var(--ink)',
                      textDecoration: item.is_completed ? 'line-through' : 'none',
                    }}
                  >
                    {item.label}
                  </span>
                  {item.severity && (
                    <span className="badge text-[10px]" style={SEV_STYLE[item.severity] ?? {}}>{item.severity}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No friction items identified.</p>
        )}
      </div>

      {/* Users */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: 'var(--ink-faint)' }}>Company Users</p>
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.full_name ?? '—'}</td>
                  <td style={{ color: 'var(--ink-soft)' }}>{u.email}</td>
                  <td><span className="badge">{u.role}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Documents */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: 'var(--ink-faint)' }}>Uploaded Documents</p>
        {documents.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No documents uploaded.</p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Name</th><th>Category</th><th>Size</th><th>Uploaded</th></tr></thead>
              <tbody>
                {documents.map((d: any) => (
                  <tr key={d.id}>
                    <td className="font-medium">{d.name}</td>
                    <td><span className="badge">{d.category}</span></td>
                    <td style={{ color: 'var(--ink-soft)' }}>{fmtBytes(d.file_size)}</td>
                    <td style={{ color: 'var(--ink-soft)' }}>{new Date(d.created_at).toLocaleDateString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assessment date */}
      <p className="text-xs text-right" style={{ color: 'var(--ink-faint)' }}>
        Last assessed: {new Date(assessment.created_at).toLocaleDateString('en-GB')}
      </p>
    </div>
  );
}
