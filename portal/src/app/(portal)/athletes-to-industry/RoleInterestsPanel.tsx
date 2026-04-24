'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, Trash2, ExternalLink } from 'lucide-react';
import AvatarInitials from '@/components/ui/AvatarInitials';
import { useModalShell } from '@/components/ui/useModalShell';
import { createClient } from '@/lib/supabase/client';
import { makeInterestApi } from './api';
import type { AthleteRow, InterestRow, InterestStatus, PartnerRow, RoleOpportunity } from './types';

interface Props {
  partner: PartnerRow;
  role: RoleOpportunity | null;     // null = "all roles" / general interest
  apiBase: '/api' | '/api/admin';
  /** When true (admin context) the panel may show athletes from any company */
  staffView: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

interface Row {
  interest: InterestRow;
  athlete: AthleteRow;
  companyName: string | null;
}

export default function RoleInterestsPanel({
  partner, role, apiBase, staffView, onClose, onChanged,
}: Props) {
  useModalShell(true, onClose);
  const supabase = createClient();
  const api = makeInterestApi(apiBase);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      let q = supabase
        .from('athlete_partner_interests')
        .select('id, athlete_id, partner_id, role_opportunity_id, status, notes, created_at, athletes(id, company_id, full_name, email, sport, previous_role, bio, linkedin_url, avatar_url, cv_kind, cv_url, cv_filename, cv_mime, cv_text, created_at, companies(name))')
        .eq('partner_id', partner.id)
        .order('created_at', { ascending: false });
      if (role) q = q.eq('role_opportunity_id', role.id);
      else q = q.is('role_opportunity_id', null);

      const { data, error } = await q;
      if (cancelled) return;
      if (error) { setError(error.message); setLoading(false); return; }
      type Joined = InterestRow & {
        athletes: AthleteRow & { companies?: { name: string } | null };
      };
      const next = (data ?? []).map(d => {
        const j = d as unknown as Joined;
        return {
          interest: {
            id: j.id, athlete_id: j.athlete_id, partner_id: j.partner_id,
            role_opportunity_id: j.role_opportunity_id, status: j.status,
            notes: j.notes, created_at: j.created_at,
          },
          athlete: j.athletes,
          companyName: j.athletes?.companies?.name ?? null,
        };
      });
      setRows(next);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [supabase, partner.id, role]);

  async function changeStatus(id: string, status: InterestStatus) {
    const prev = rows.find(r => r.interest.id === id);
    if (!prev || prev.interest.status === status) return;
    setRows(curr => curr.map(r => r.interest.id === id ? { ...r, interest: { ...r.interest, status } } : r));
    try {
      await api.patch(id, { status });
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
      setRows(curr => curr.map(r => r.interest.id === id ? prev : r));
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this match?')) return;
    const prev = rows.find(r => r.interest.id === id);
    if (!prev) return;
    setRows(curr => curr.filter(r => r.interest.id !== id));
    try {
      await api.remove(id);
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
      setRows(curr => [...curr, prev]);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end"
      style={{ background: 'rgba(7,11,29,0.45)' }}
      onClick={onClose}
    >
      <div
        className="card h-full w-full max-w-[520px] overflow-hidden flex flex-col p-0"
        style={{ borderRadius: 0, boxShadow: '-12px 0 32px rgba(7,11,29,0.18)' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="px-6 py-5 flex items-start gap-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
              Interested athletes
            </p>
            <h2 className="font-display text-base font-semibold mt-1" style={{ color: 'var(--ink)' }}>
              {role ? role.title : 'General interest'}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>
              {partner.company_name}{role?.location ? ` · ${role.location}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="btn-icon btn-ghost" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12" style={{ color: 'var(--ink-faint)' }}>
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : error ? (
            <div className="px-6 py-6 text-sm" style={{ color: 'var(--red)' }}>{error}</div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm" style={{ color: 'var(--ink-faint)' }}>
              No athletes have shown interest yet.
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
              {rows.map(({ interest, athlete, companyName }) => (
                <li key={interest.id} className="px-6 py-4 flex gap-3 items-start">
                  <AvatarInitials name={athlete.full_name} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate" style={{ color: 'var(--ink)' }}>
                        {athlete.full_name}
                      </span>
                      {staffView && companyName && (
                        <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                          {companyName}
                        </span>
                      )}
                    </div>
                    {(athlete.sport || athlete.previous_role) && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>
                        {[athlete.sport, athlete.previous_role].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {athlete.cv_url && (
                      <a
                        href={athlete.cv_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] mt-1.5 hover:underline"
                        style={{ color: 'var(--purple)' }}
                      >
                        CV: {athlete.cv_filename ?? 'view'} <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <select
                      value={interest.status}
                      onChange={e => changeStatus(interest.id, e.target.value as InterestStatus)}
                      className="input"
                      style={{ padding: '3px 22px 3px 8px', fontSize: 11, width: 'auto' }}
                    >
                      <option value="interested">Interested</option>
                      <option value="introduced">Introduced</option>
                      <option value="passed">Passed</option>
                    </select>
                    <button
                      onClick={() => remove(interest.id)}
                      className="btn-icon btn-ghost"
                      style={{ width: 24, height: 24, color: 'var(--red)' }}
                      aria-label="Remove"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
