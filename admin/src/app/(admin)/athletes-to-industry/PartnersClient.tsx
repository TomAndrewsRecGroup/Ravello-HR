'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, Plus, Pencil, Trash2, Loader2, Power, PowerOff, Globe, MapPin, Save, X,
} from 'lucide-react';
import AvatarInitials from '@/components/ui/AvatarInitials';
import RoleOpportunitiesEditor from './RoleOpportunitiesEditor';
import type { InterestRow, PartnerRow, RoleOpportunity } from './types';

interface Props {
  initial: PartnerRow[];
  interests: InterestRow[];
}

interface Draft {
  company_name: string;
  locations: string;
  industry: string;
  website: string;
  role_opportunities: RoleOpportunity[];
}

const EMPTY_DRAFT: Draft = {
  company_name: '', locations: '', industry: '', website: '', role_opportunities: [],
};

export default function PartnersClient({ initial, interests }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null); // partner id, or 'new'
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Local mirror so single-row patch + delete update instantly without
  // re-running the server component. Save (create/edit) still calls
  // refresh() because the new row needs server-generated id + timestamps.
  const [partners, setPartners] = useState<PartnerRow[]>(initial);
  const refresh = () => startTransition(() => router.refresh());

  function setBusyFor(id: string, on: boolean) {
    setBusy(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }

  function startNew() {
    setDraft(EMPTY_DRAFT);
    setEditing('new');
    setError('');
  }

  function startEdit(p: PartnerRow) {
    setDraft({
      company_name: p.company_name,
      locations: p.locations ?? '',
      industry: p.industry ?? '',
      website: p.website ?? '',
      role_opportunities: p.role_opportunities,
    });
    setEditing(p.id);
    setError('');
  }

  function cancel() {
    setEditing(null);
    setError('');
  }

  async function save() {
    if (!draft.company_name.trim()) {
      setError('Company name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const isNew = editing === 'new';
      const res = await fetch(
        isNew ? '/api/admin/partners' : `/api/admin/partners/${editing}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_name: draft.company_name.trim(),
            locations: draft.locations.trim() || null,
            industry: draft.industry.trim() || null,
            website: draft.website.trim() || null,
            role_opportunities: draft.role_opportunities,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setEditing(null);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyFor(id, true);
    const prev = partners.find(p => p.id === id);
    if (prev) {
      setPartners(curr => curr.map(p => p.id === id ? { ...p, ...body } as PartnerRow : p));
    }
    try {
      const res = await fetch(`/api/admin/partners/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (prev) setPartners(curr => curr.map(p => p.id === id ? prev : p));
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Update failed');
        return;
      }
    } finally {
      setBusyFor(id, false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this partner? Existing matches will be removed too.')) return;
    setBusyFor(id, true);
    const prev = partners;
    setPartners(curr => curr.filter(p => p.id !== id));
    try {
      const res = await fetch(`/api/admin/partners/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setPartners(prev);
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Delete failed');
        return;
      }
    } finally {
      setBusyFor(id, false);
    }
  }

  function interestCount(partnerId: string): number {
    return interests.filter(i => i.partner_id === partnerId).length;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Building2 size={15} style={{ color: 'var(--purple)' }} />
        <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
          Partners
        </h2>
        <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          Platform-wide pool. Visible to every client with the Athletes To Industry channel enabled.
        </span>
        {editing === null && (
          <button onClick={startNew} className="btn-cta btn-sm ml-auto flex items-center gap-1.5">
            <Plus size={13} /> Add partner
          </button>
        )}
      </div>

      {/* Edit / new form */}
      {editing !== null && (
        <div className="card p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Company name *</label>
              <input className="input" value={draft.company_name}
                     onChange={e => setDraft({ ...draft, company_name: e.target.value })}
                     placeholder="Acme Manufacturing" />
            </div>
            <div>
              <label className="label">Industry</label>
              <input className="input" value={draft.industry}
                     onChange={e => setDraft({ ...draft, industry: e.target.value })}
                     placeholder="Manufacturing" />
            </div>
            <div>
              <label className="label">Locations</label>
              <input className="input" value={draft.locations}
                     onChange={e => setDraft({ ...draft, locations: e.target.value })}
                     placeholder="London, Manchester, Remote" />
            </div>
            <div>
              <label className="label">Website</label>
              <input className="input" value={draft.website}
                     onChange={e => setDraft({ ...draft, website: e.target.value })}
                     placeholder="acme.com" />
            </div>
          </div>

          <div>
            <p className="label">Role opportunities</p>
            <RoleOpportunitiesEditor
              value={draft.role_opportunities}
              onChange={next => setDraft({ ...draft, role_opportunities: next })}
            />
          </div>

          {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
            <button onClick={cancel} className="btn-secondary btn-sm flex items-center gap-1.5">
              <X size={12} /> Cancel
            </button>
            <button onClick={save} disabled={saving} className="btn-cta btn-sm flex items-center gap-1.5">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {editing === 'new' ? 'Create partner' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
            All partners <span style={{ color: 'var(--ink-faint)' }}>({partners.length})</span>
          </h3>
        </div>

        {partners.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm" style={{ color: 'var(--ink-faint)' }}>
            No partners yet. Add the first one above.
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
            {partners.map(p => {
              const isBusy = busy.has(p.id);
              const matched = interestCount(p.id);
              return (
                <li key={p.id} className="px-5 py-4 flex gap-4 items-start">
                  <AvatarInitials name={p.company_name} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                        {p.company_name}
                      </span>
                      {p.industry && (
                        <span className="badge" style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}>
                          {p.industry}
                        </span>
                      )}
                      {!p.active && (
                        <span className="badge" style={{ background: 'rgba(116,128,153,0.10)', color: 'var(--ink-faint)' }}>
                          paused
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs flex-wrap" style={{ color: 'var(--ink-faint)' }}>
                      {p.locations && (
                        <span className="inline-flex items-center gap-0.5"><MapPin size={11} /> {p.locations}</span>
                      )}
                      {p.website && (
                        <a href={p.website} target="_blank" rel="noopener noreferrer"
                           className="inline-flex items-center gap-0.5 hover:underline" style={{ color: 'var(--purple)' }}>
                          <Globe size={11} /> {p.website.replace(/^https?:\/\//, '').slice(0, 40)}
                        </a>
                      )}
                      <span>{p.role_opportunities.length} role{p.role_opportunities.length === 1 ? '' : 's'}</span>
                      {matched > 0 && (
                        <span style={{ color: 'var(--purple)', fontWeight: 600 }}>{matched} matched</span>
                      )}
                    </div>
                    {p.role_opportunities.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {p.role_opportunities.map(role => (
                          <li key={role.id} className="text-[11px] px-2 py-0.5 rounded-full"
                              style={{ background: 'var(--surface-soft)', color: 'var(--ink-soft)' }}>
                            {role.title}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => startEdit(p)} disabled={isBusy} className="btn-icon btn-sm" title="Edit">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => patch(p.id, { active: !p.active })} disabled={isBusy} className="btn-icon btn-sm"
                            title={p.active ? 'Pause' : 'Resume'}>
                      {p.active ? <Power size={13} /> : <PowerOff size={13} />}
                    </button>
                    <button onClick={() => remove(p.id)} disabled={isBusy} className="btn-icon btn-sm"
                            style={{ color: 'var(--red)' }} title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
