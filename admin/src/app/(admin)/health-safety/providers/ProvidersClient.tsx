'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, HardHat, KeyRound, Loader2, Plus, UserPlus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { useToast } from '@/components/modules/Toast';
import type { HsAssignment, HsProvider, HsProviderLogin } from '@/lib/hs/types';
import {
  HS_ACCESS_LEVEL_LABELS, HS_ACCESS_LEVELS, HS_ASSIGNMENT_STATUS_LABELS, HS_PROVIDER_TYPE_LABELS,
  HS_PROVIDER_TYPES, HS_SCOPE_LABELS, HS_SCOPES,
  type HsAccessLevel, type HsAssignmentStatus, type HsProviderType, type HsScope,
} from '@/lib/hs/vocab';

interface Props {
  providers:   HsProvider[];
  assignments: HsAssignment[];
  logins:      HsProviderLogin[];
  companies:   { id: string; name: string }[];
}

const fmt = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';

export default function ProvidersClient({ providers, assignments, logins, companies }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<string | null>, done: string) {
    setBusy(key);
    try {
      const err = await fn();
      if (err) toast(err, 'error');
      else { toast(done, 'success'); router.refresh(); }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong', 'error');
    } finally {
      setBusy(null);
    }
  }

  // ── provider ────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [type, setType] = useState<HsProviderType>('consultancy');
  const [contactEmail, setContactEmail] = useState('');

  function addProvider(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    run('new-provider', async () => {
      const { error } = await createClient().from('hs_providers')
        .insert({ name: name.trim(), provider_type: type, contact_email: contactEmail.trim() || null })
        .select('id').single();
      if (!error) { setName(''); setContactEmail(''); }
      return error?.message ?? null;
    }, 'Provider added');
  }

  function setActive(p: HsProvider, active: boolean) {
    if (!active && !confirm(`Deactivate ${p.name}? Every login at ${p.name} loses access to every client immediately.`)) return;
    run(`active-${p.id}`, async () => {
      const res = await createClient().from('hs_providers').update({ active, updated_at: new Date().toISOString() }, COUNT_EXACT).eq('id', p.id);
      return judgeWrite(res, 'The provider').message;
    }, active ? 'Provider reactivated' : 'Provider deactivated');
  }

  return (
    <div className="space-y-6">
      <form onSubmit={addProvider} className="card p-5">
        <h2 className="font-display font-semibold text-base mb-1" style={{ color: 'var(--ink)' }}>Add a provider</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--ink-soft)' }}>
          A consultancy, training company or inspection body whose people will record Health &amp; Safety work for your clients.
        </p>
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_2fr_auto] items-end">
          <label className="block">
            <span className="label">Name</span>
            <input className="input" value={name} onChange={e => setName(e.target.value)} maxLength={200} placeholder="Lighthouse Safety" required />
          </label>
          <label className="block">
            <span className="label">Type</span>
            <select className="input" value={type} onChange={e => setType(e.target.value as HsProviderType)}>
              {HS_PROVIDER_TYPES.map(t => <option key={t} value={t}>{HS_PROVIDER_TYPE_LABELS[t]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Contact email (optional)</span>
            <input className="input" type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} maxLength={320} />
          </label>
          <button className="btn-cta" disabled={busy === 'new-provider' || !name.trim()}>
            {busy === 'new-provider' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add
          </button>
        </div>
      </form>

      {providers.length === 0 && (
        <div className="card empty-state p-10">
          <HardHat size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No providers yet.</p>
        </div>
      )}

      {providers.map(p => (
        <ProviderCard
          key={p.id}
          provider={p}
          assignments={assignments.filter(a => a.provider_id === p.id)}
          logins={logins.filter(l => l.hs_provider_id === p.id)}
          companies={companies}
          busy={busy}
          run={run}
          onSetActive={active => setActive(p, active)}
        />
      ))}
    </div>
  );
}

interface CardProps {
  provider:    HsProvider;
  assignments: HsAssignment[];
  logins:      HsProviderLogin[];
  companies:   { id: string; name: string }[];
  busy:        string | null;
  run:         (key: string, fn: () => Promise<string | null>, done: string) => void;
  onSetActive: (active: boolean) => void;
}

function ProviderCard({ provider: p, assignments, logins, companies, busy, run, onSetActive }: CardProps) {
  // ── access to a client ─────────────────────────────────────────
  const assigned = new Set(assignments.map(a => a.company_id));
  const available = companies.filter(c => !assigned.has(c.id));
  const [companyId, setCompanyId] = useState('');
  const [scopes, setScopes] = useState<HsScope[]>(p.provider_type === 'training' ? ['training'] : ['register', 'documents']);
  const [access, setAccess] = useState<HsAccessLevel>('write');
  const [endsOn, setEndsOn] = useState('');
  const [authorisedBy, setAuthorisedBy] = useState('');

  function toggleScope(s: HsScope) {
    setScopes(cur => cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s]);
  }

  function grant(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId || scopes.length === 0) return;
    run(`grant-${p.id}`, async () => {
      const { error } = await createClient().from('hs_provider_companies').insert({
        provider_id: p.id, company_id: companyId, scopes, access_level: access,
        ends_on: endsOn || null, client_authorised_by: authorisedBy.trim() || null,
      }).select('id').single();
      if (!error) { setCompanyId(''); setEndsOn(''); setAuthorisedBy(''); }
      return error?.message ?? null;
    }, 'Access granted');
  }

  function setStatus(a: HsAssignment, status: HsAssignmentStatus) {
    run(`status-${a.id}`, async () => {
      const res = await createClient().from('hs_provider_companies')
        .update({ status, updated_at: new Date().toISOString() }, COUNT_EXACT).eq('id', a.id);
      return judgeWrite(res, 'The access').message;
    }, `Access ${HS_ASSIGNMENT_STATUS_LABELS[status].toLowerCase()}`);
  }

  function removeAccess(a: HsAssignment) {
    if (!confirm(`Remove ${p.name}'s access to ${a.companies?.name ?? 'this client'}? What they recorded stays.`)) return;
    run(`remove-${a.id}`, async () => {
      const { error, count } = await createClient().from('hs_provider_companies').delete(COUNT_EXACT).eq('id', a.id);
      return error?.message ?? (count === 0 ? 'Nothing was removed. You may not have permission.' : null);
    }, 'Access removed');
  }

  // ── logins ─────────────────────────────────────────────────────
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');

  function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    run(`invite-${p.id}`, async () => {
      const res = await fetch(`/api/admin/hs/providers/${p.id}/users`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), full_name: inviteName.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return body.error ?? `Could not add the login (HTTP ${res.status})`;
      setInviteEmail(''); setInviteName('');
      if (body.email_sent === false) {
        return `Login created, but the email did not send: ${body.email_warning}. Send them this link by hand: ${body.activate_url}`;
      }
      return null;
    }, 'Invite sent');
  }

  function revoke(l: HsProviderLogin) {
    if (!confirm(`Revoke ${l.email}'s login? They lose access to every client straight away.`)) return;
    run(`revoke-${l.id}`, async () => {
      const res = await fetch(`/api/admin/hs/providers/${p.id}/users/${l.id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return body.error ?? `Could not revoke (HTTP ${res.status})`;
      return body.warning ?? null;
    }, 'Login revoked');
  }

  return (
    <section className="card p-5" style={{ opacity: p.active ? 1 : 0.7 }}>
      <header className="flex flex-wrap items-center gap-3 mb-4">
        <HardHat size={18} style={{ color: 'var(--purple)' }} />
        <h2 className="font-display font-semibold text-lg" style={{ color: 'var(--ink)' }}>{p.name}</h2>
        <span className="badge">{HS_PROVIDER_TYPE_LABELS[p.provider_type]}</span>
        {!p.active && <span className="badge badge-inactive">Deactivated</span>}
        {p.contact_email && <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{p.contact_email}</span>}
        <button className="btn-ghost btn-sm ml-auto" disabled={busy === `active-${p.id}`} onClick={() => onSetActive(!p.active)}>
          {p.active ? 'Deactivate' : 'Reactivate'}
        </button>
      </header>

      <h3 className="label flex items-center gap-1.5"><Building2 size={13} /> Clients</h3>
      {assignments.length === 0 ? (
        <p className="text-sm mb-3" style={{ color: 'var(--ink-faint)' }}>Not assigned to any client yet.</p>
      ) : (
        <div className="table-wrapper mb-3">
          <table className="table">
            <thead><tr><th>Client</th><th>Can see</th><th>Access</th><th>Window</th><th>Status</th><th /></tr></thead>
            <tbody>
              {assignments.map(a => (
                <tr key={a.id}>
                  <td>
                    {a.companies?.name ?? a.company_id}
                    {a.client_authorised_by && <div className="text-xs" style={{ color: 'var(--ink-faint)' }}>Agreed by {a.client_authorised_by}</div>}
                  </td>
                  <td className="text-sm">{a.scopes.map(s => HS_SCOPE_LABELS[s]).join(', ')}</td>
                  <td className="text-sm">{HS_ACCESS_LEVEL_LABELS[a.access_level]}</td>
                  <td className="text-sm">{fmt(a.starts_on)}{a.ends_on ? ` to ${fmt(a.ends_on)}` : ' onwards'}</td>
                  <td><span className={`badge ${a.status === 'active' ? 'badge-resolved' : 'badge-inactive'}`}>{HS_ASSIGNMENT_STATUS_LABELS[a.status]}</span></td>
                  <td className="text-right whitespace-nowrap">
                    {a.status === 'active'
                      ? <button className="btn-ghost btn-sm" disabled={busy === `status-${a.id}`} onClick={() => setStatus(a, 'suspended')}>Suspend</button>
                      : <button className="btn-ghost btn-sm" disabled={busy === `status-${a.id}`} onClick={() => setStatus(a, 'active')}>Resume</button>}
                    <button className="btn-icon btn-sm" aria-label={`Remove access to ${a.companies?.name ?? 'client'}`} disabled={busy === `remove-${a.id}`} onClick={() => removeAccess(a)}><X size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {p.active && available.length > 0 && (
        <form onSubmit={grant} className="rounded-lg p-3 mb-5" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1.5fr_auto] items-end">
            <label className="block">
              <span className="label">Give access to</span>
              <select className="input" value={companyId} onChange={e => setCompanyId(e.target.value)} required>
                <option value="">Choose a client…</option>
                {available.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label">Access</span>
              <select className="input" value={access} onChange={e => setAccess(e.target.value as HsAccessLevel)}>
                {HS_ACCESS_LEVELS.map(l => <option key={l} value={l}>{HS_ACCESS_LEVEL_LABELS[l]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label">Until (optional)</span>
              <input className="input" type="date" value={endsOn} onChange={e => setEndsOn(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">Agreed by (client contact)</span>
              <input className="input" value={authorisedBy} onChange={e => setAuthorisedBy(e.target.value)} maxLength={200} placeholder="Name at the client" />
            </label>
            <button className="btn-secondary" disabled={busy === `grant-${p.id}` || !companyId || scopes.length === 0}>
              {busy === `grant-${p.id}` ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Grant
            </button>
          </div>
          <fieldset className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <legend className="label">Can see and record</legend>
            {HS_SCOPES.map(s => (
              <label key={s} className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--ink-soft)' }}>
                <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} /> {HS_SCOPE_LABELS[s]}
              </label>
            ))}
          </fieldset>
        </form>
      )}

      <h3 className="label flex items-center gap-1.5"><KeyRound size={13} /> Logins</h3>
      {logins.length === 0 ? (
        <p className="text-sm mb-3" style={{ color: 'var(--ink-faint)' }}>Nobody at {p.name} has a login yet.</p>
      ) : (
        <ul className="mb-3 divide-y" style={{ borderColor: 'var(--line)' }}>
          {logins.map(l => (
            <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
              <span style={{ color: 'var(--ink)' }}>{l.full_name || l.email}</span>
              {l.full_name && <span style={{ color: 'var(--ink-faint)' }}>{l.email}</span>}
              <button className="btn-ghost btn-sm ml-auto" disabled={busy === `revoke-${l.id}`} onClick={() => revoke(l)}>Revoke</button>
            </li>
          ))}
        </ul>
      )}
      {p.active && (
        <form onSubmit={invite} className="grid gap-3 md:grid-cols-[2fr_2fr_auto] items-end">
          <label className="block">
            <span className="label">Email</span>
            <input className="input" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} maxLength={320} required />
          </label>
          <label className="block">
            <span className="label">Name (optional)</span>
            <input className="input" value={inviteName} onChange={e => setInviteName(e.target.value)} maxLength={120} />
          </label>
          <button className="btn-secondary" disabled={busy === `invite-${p.id}` || !inviteEmail.trim()}>
            {busy === `invite-${p.id}` ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Send login
          </button>
        </form>
      )}
    </section>
  );
}
