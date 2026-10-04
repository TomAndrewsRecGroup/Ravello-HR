'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/modules/Toast';
import { ACCESS_SCOPES, ACCESS_SCOPE_LABELS, type AccessScope } from '@/lib/consultancy/vocab';
import type { AccessGrant, AccessRole, Colleague, ConsultancyClientRelationship } from './types';

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No expiry');

// Every write here is the RPC itself doing the deciding
// (grant_organisation_access/revoke_organisation_access, 117) — this
// component never pre-validates who may grant what beyond narrowing
// the pickers to the lists the server-rendered page already resolved
// under RLS. A refusal (self-grant, a role that isn't
// consultancy_grantable, a client with no live relationship, a
// colleague outside your own organisation) surfaces as the RPC's own
// error message, verbatim.
export default function AccessGrantClient({ colleagues, relationships, roles, grants }: {
  colleagues: Colleague[];
  relationships: ConsultancyClientRelationship[];
  roles: AccessRole[];
  grants: AccessGrant[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [userId, setUserId] = useState('');
  const [orgId, setOrgId] = useState('');
  const [roleKey, setRoleKey] = useState('');
  const [scope, setScope] = useState<AccessScope>('full');
  const [validUntil, setValidUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !orgId || !roleKey) return;
    setBusy(true);
    const { error } = await createClient().rpc('grant_organisation_access', {
      p_user: userId, p_org: orgId, p_role: roleKey,
      p_valid_until: validUntil || null, p_scope: scope,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Access granted', 'success');
    setUserId(''); setOrgId(''); setRoleKey(''); setScope('full'); setValidUntil('');
    router.refresh();
  }

  async function revoke(grantId: string) {
    setRevokingId(grantId);
    const { error } = await createClient().rpc('revoke_organisation_access', { p_grant: grantId });
    setRevokingId(null);
    if (error) { toast(error.message, 'error'); return; }
    toast('Access revoked', 'success');
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={grant} className="card p-4 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
          <ShieldCheck size={16} /> New grant
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="label text-xs">Person (your own organisation)</span>
            <select className="input" value={userId} onChange={e => setUserId(e.target.value)} required>
              <option value="">Select a person…</option>
              {colleagues.map(c => <option key={c.id} value={c.id}>{c.full_name || c.email}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label text-xs">Client</span>
            <select className="input" value={orgId} onChange={e => setOrgId(e.target.value)} required>
              <option value="">Select a client…</option>
              {relationships.map(r => <option key={r.id} value={r.targetOrganisationId}>{r.targetOrganisationName}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label text-xs">Role</span>
            <select className="input" value={roleKey} onChange={e => setRoleKey(e.target.value)} required>
              <option value="">Select a role…</option>
              {roles.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label text-xs">Scope</span>
            <select className="input" value={scope} onChange={e => setScope(e.target.value as AccessScope)}>
              {ACCESS_SCOPES.map(s => <option key={s} value={s}>{ACCESS_SCOPE_LABELS[s]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label text-xs">Expires (optional)</span>
            <input type="date" className="input" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
          </label>
        </div>
        <button type="submit" className="btn-cta btn-sm" disabled={busy}>
          {busy && <Loader2 size={14} className="animate-spin" />} Grant access
        </button>
      </form>

      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--ink)' }}>Current grants</h2>
        {relationships.length === 0 && (
          <p className="text-xs mb-2" style={{ color: 'var(--ink-faint)' }}>
            No live client relationships — you have nobody to grant access to yet.
          </p>
        )}
        {grants.length === 0 ? (
          <div className="empty-state p-6"><p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No grants yet.</p></div>
        ) : (
          <>
            {/* Desktop / tablet table, hidden below md — the phone card
                list beside it puts Revoke within thumb reach instead of
                a sideways scroll. */}
            <div className="hidden md:block table-wrapper">
              <table className="table">
                <thead><tr><th>Person</th><th>Client</th><th>Role</th><th>Scope</th><th>Expires</th><th /></tr></thead>
                <tbody>
                  {grants.map(g => (
                    <tr key={g.id}>
                      <td>{g.userName}</td>
                      <td>{g.organisationName}</td>
                      <td>{g.roleKey}</td>
                      <td>{ACCESS_SCOPE_LABELS[g.accessScope as AccessScope] ?? g.accessScope}</td>
                      <td>{fmt(g.validUntil)}</td>
                      <td>
                        <button type="button" className="btn-icon btn-sm" aria-label="Revoke access" disabled={revokingId === g.id}
                          onClick={() => revoke(g.id)}>
                          {revokingId === g.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone: one card per grant, Revoke reachable with a thumb. */}
            <div className="mobile-card-list">
              {grants.map(g => (
                <div key={g.id} className="mobile-card">
                  <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{g.userName}</p>
                  <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{g.organisationName}</p>
                  <div className="mt-3">
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Role</span>
                      <span className="mobile-card-value">{g.roleKey}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Scope</span>
                      <span className="mobile-card-value">{ACCESS_SCOPE_LABELS[g.accessScope as AccessScope] ?? g.accessScope}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Expires</span>
                      <span className="mobile-card-value">{fmt(g.validUntil)}</span>
                    </div>
                  </div>
                  <div className="mobile-card-actions">
                    <button type="button" className="btn-secondary btn-sm" disabled={revokingId === g.id}
                      onClick={() => revoke(g.id)}>
                      {revokingId === g.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} Revoke access
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
