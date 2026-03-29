'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Topbar from '@/components/layout/Topbar';
import { createClient } from '@/lib/supabase/client';
import {
  Target, Building2, MapPin, Briefcase, Loader2, AlertTriangle,
  ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react';

interface BDRole {
  role_title: string;
  salary_text: string | null;
  location: string | null;
  working_model: string | null;
  source_board: string | null;
  date_posted: string | null;
}

interface BDLead {
  company_name: string;
  company_location: string | null;
  status: string;
  roles: BDRole[];
  sent_at: string;
}

export default function BDLeadsPage() {
  const [leads, setLeads] = useState<BDLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchLeads() {
      try {
        // Get the partner API key from company settings (stored by admin)
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setError('Not authenticated'); setLoading(false); return; }

        const { data: profile } = await supabase
          .from('profiles').select('company_id').eq('id', user.id).single();
        if (!profile?.company_id) { setError('No company'); setLoading(false); return; }

        const { data: company } = await supabase
          .from('companies').select('partner_api_key').eq('id', profile.company_id).single();

        const apiKey = company?.partner_api_key;
        if (!apiKey) {
          setError('No partner API key configured. Ask your admin to set up a key in the Partners page.');
          setLoading(false);
          return;
        }

        const res = await fetch('/api/partner/bd/leads', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        const data = await res.json();
        setLeads(data.leads ?? []);
      } catch (err: any) {
        setError(err.message ?? 'Failed to load leads');
      }
      setLoading(false);
    }

    fetchLeads();
  }, []);

  const filtered = leads.filter(l =>
    !search || l.company_name.toLowerCase().includes(search.toLowerCase())
      || l.roles.some(r => r.role_title.toLowerCase().includes(search.toLowerCase()))
  );

  const totalRoles = leads.reduce((sum, l) => sum + l.roles.length, 0);

  return (
    <>
      <Topbar title="BD Leads" subtitle="Companies and roles identified through market scanning" />
      <main className="portal-page flex-1 space-y-6">

        {/* Stats */}
        {!loading && !error && (
          <div className="grid grid-cols-3 gap-4">
            <div className="stat-card">
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Companies</p>
              <p className="font-display font-bold text-2xl mt-1" style={{ color: 'var(--ink)' }}>{leads.length}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Active Roles</p>
              <p className="font-display font-bold text-2xl mt-1" style={{ color: 'var(--ink)' }}>{totalRoles}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Latest</p>
              <p className="font-display font-bold text-2xl mt-1" style={{ color: 'var(--ink)' }}>
                {leads.length > 0 ? new Date(leads[0].sent_at).toLocaleDateString() : '—'}
              </p>
            </div>
          </div>
        )}

        {/* Search */}
        {leads.length > 0 && (
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input"
            placeholder="Search companies or roles…"
          />
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--purple)' }} />
          </div>
        ) : error ? (
          <div className="card p-6 flex items-center gap-3">
            <AlertTriangle size={16} style={{ color: 'var(--red)' }} />
            <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <Target size={28} style={{ color: 'var(--ink-faint)' }} />
            <p className="text-sm font-medium mt-3" style={{ color: 'var(--ink)' }}>
              {search ? 'No matching leads' : 'No BD leads yet'}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
              Leads will appear here once your admin pushes companies to the BD pipeline.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((lead, i) => (
              <LeadCard key={i} lead={lead} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function LeadCard({ lead }: { lead: BDLead }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full px-5 py-4 flex items-center gap-4 text-left"
      >
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(124,58,237,0.08)' }}>
          <Building2 size={16} style={{ color: 'var(--purple)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{lead.company_name}</p>
          <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: 'var(--ink-faint)' }}>
            {lead.company_location && (
              <span className="flex items-center gap-1"><MapPin size={10} /> {lead.company_location}</span>
            )}
            <span className="flex items-center gap-1">
              <Briefcase size={10} /> {lead.roles.length} role{lead.roles.length !== 1 ? 's' : ''}
            </span>
            <span>Sent {new Date(lead.sent_at).toLocaleDateString()}</span>
          </div>
        </div>
        <span className="badge text-[10px]" style={{
          background: lead.status === 'contacted' ? 'rgba(59,111,255,0.08)' : 'rgba(124,58,237,0.08)',
          color: lead.status === 'contacted' ? '#2A55CC' : 'var(--purple)',
        }}>
          {lead.status}
        </span>
        {expanded ? <ChevronUp size={14} style={{ color: 'var(--ink-faint)' }} /> : <ChevronDown size={14} style={{ color: 'var(--ink-faint)' }} />}
      </button>

      {expanded && lead.roles.length > 0 && (
        <div className="px-5 pb-4" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="table-wrapper mt-3">
            <table className="table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Location</th>
                  <th>Model</th>
                  <th>Salary</th>
                  <th>Source</th>
                  <th>Posted</th>
                </tr>
              </thead>
              <tbody>
                {lead.roles.map((r, i) => (
                  <tr key={i}>
                    <td className="font-medium">{r.role_title}</td>
                    <td>{r.location ?? '—'}</td>
                    <td>
                      {r.working_model ? (
                        <span className="badge text-[10px]">{r.working_model}</span>
                      ) : '—'}
                    </td>
                    <td>{r.salary_text ?? '—'}</td>
                    <td>{r.source_board ?? '—'}</td>
                    <td>{r.date_posted ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {expanded && lead.roles.length === 0 && (
        <div className="px-5 pb-4 text-xs" style={{ color: 'var(--ink-faint)', borderTop: '1px solid var(--line)' }}>
          <p className="pt-3">No active roles tracked for this company.</p>
        </div>
      )}
    </div>
  );
}
