'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { ACCESS_ROLE_LABELS, ORGANISATION_ROLES, isAccessRole, type AccessRole } from '@/lib/auth/capabilities';

const ORG_TYPES = ['direct_client', 'consultancy', 'subsidiary', 'group_company', 'business_unit', 'platform_owner'] as const;
const ORG_TYPE_LABELS: Record<string, string> = {
  direct_client: 'Direct client', consultancy: 'Consultancy', subsidiary: 'Subsidiary',
  group_company: 'Group company', business_unit: 'Business unit', platform_owner: 'Platform owner',
};
const REL_TYPES = ['consultancy_client', 'group_parent', 'subsidiary', 'service_provider', 'partner'] as const;
const REL_LABELS: Record<string, string> = {
  consultancy_client: 'serves (consultancy → client)', group_parent: 'is group parent of',
  subsidiary: 'has subsidiary', service_provider: 'provides services to', partner: 'partners with',
};

interface Org { id: string; name: string; organisation_type: string; parent_organisation_id: string | null; active: boolean; archived_at: string | null }
interface Rel { id: string; source_organisation_id: string; target_organisation_id: string; relationship_type: string; status: string; valid_from: string; valid_until: string | null }
interface Grant { id: string; user_id: string; organisation_id: string; role_key: string; access_scope: string; valid_from: string; valid_until: string | null; active_status: string; revoked_at: string | null }
interface Person { id: string; full_name: string | null; email: string | null; company_id: string; role: string }

export default function OrganisationsClient({ organisations, relationships, grants, people }: {
  organisations: Org[]; relationships: Rel[]; grants: Grant[]; people: Person[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const orgName = useMemo(() => new Map(organisations.map(o => [o.id, o.name])), [organisations]);
  const personName = useMemo(() => new Map(people.map(p => [p.id, p.full_name || p.email || p.id])), [people]);

  const [rel, setRel] = useState({ source: '', target: '', type: 'consultancy_client' });
  const [grant, setGrant] = useState({ user: '', org: '', role: 'consultant' as AccessRole, until: '' });

  async function run(label: string, fn: () => Promise<string | null>) {
    setBusy(true); setMsg(null);
    try {
      const err = await fn();
      setMsg(err ? { ok: false, text: err } : { ok: true, text: `${label} saved.` });
      if (!err) router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong' });
    } finally { setBusy(false); }
  }

  const setType = (id: string, organisation_type: string) => run('Organisation type', async () => {
    const res = await supabase.from('companies').update({ organisation_type }, COUNT_EXACT).eq('id', id);
    return judgeWrite(res, 'The organisation type').message;
  });
  const setParent = (id: string, parent: string) => run('Parent organisation', async () => {
    const res = await supabase.from('companies').update({ parent_organisation_id: parent || null }, COUNT_EXACT).eq('id', id);
    return judgeWrite(res, 'The parent organisation').message;
  });
  const addRel = () => run('Relationship', async () => {
    if (!rel.source || !rel.target) return 'Choose both organisations.';
    if (rel.source === rel.target) return 'An organisation cannot have a relationship with itself.';
    const { error } = await supabase.from('organisation_relationships').insert({
      source_organisation_id: rel.source, target_organisation_id: rel.target, relationship_type: rel.type,
    });
    return error?.message ?? null;
  });
  const endRel = (id: string) => run('Relationship', async () => {
    const res = await supabase.from('organisation_relationships')
      .update({ status: 'ended', valid_until: new Date().toISOString().slice(0, 10) }, COUNT_EXACT).eq('id', id);
    return judgeWrite(res, 'Ending the relationship').message;
  });
  const addGrant = () => run('Access', async () => {
    if (!grant.user || !grant.org) return 'Choose a person and an organisation.';
    const { error } = await supabase.rpc('grant_organisation_access', {
      p_user: grant.user, p_org: grant.org, p_role: grant.role,
      p_valid_until: grant.until ? new Date(`${grant.until}T23:59:59Z`).toISOString() : null, p_scope: 'full',
    });
    return error?.message ?? null;
  });
  const revoke = (id: string) => run('Revocation', async () => {
    if (!window.confirm('Revoke this access now? It stops working on the person\'s next request.')) return 'Cancelled.';
    const { error } = await supabase.rpc('revoke_organisation_access', { p_grant: id });
    return error?.message ?? null;
  });

  const liveOrgs = organisations.filter(o => !o.archived_at);

  return (
    <div className="space-y-6">
      {msg && (
        <div role={msg.ok ? 'status' : 'alert'} className="card p-3 text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>
          {msg.text}
        </div>
      )}

      <section className="card p-5" aria-labelledby="orgs-h">
        <h2 id="orgs-h" className="font-display font-semibold mb-3">Organisations</h2>
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th scope="col">Organisation</th><th scope="col">Type</th><th scope="col">Parent (legal group)</th></tr></thead>
            <tbody>
              {organisations.map(o => (
                <tr key={o.id}>
                  <td>{o.name}{o.archived_at ? ' (archived)' : ''}</td>
                  <td>
                    <label className="sr-only" htmlFor={`type-${o.id}`}>Type of {o.name}</label>
                    <select id={`type-${o.id}`} className="input" value={o.organisation_type} disabled={busy}
                      onChange={e => setType(o.id, e.target.value)}>
                      {ORG_TYPES.map(t => <option key={t} value={t}>{ORG_TYPE_LABELS[t]}</option>)}
                    </select>
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`parent-${o.id}`}>Parent of {o.name}</label>
                    <select id={`parent-${o.id}`} className="input" value={o.parent_organisation_id ?? ''} disabled={busy}
                      onChange={e => setParent(o.id, e.target.value)}>
                      <option value="">— none —</option>
                      {liveOrgs.filter(p => p.id !== o.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5" aria-labelledby="rels-h">
        <h2 id="rels-h" className="font-display font-semibold mb-1">Relationships</h2>
        <p className="text-sm mb-3" style={{ color: 'var(--ink-soft)' }}>
          A consultancy serving a client does not own it. A consultancy owner can only grant their people access to clients they serve.
        </p>
        <div className="flex flex-wrap gap-2 items-end mb-4">
          <div><label className="label" htmlFor="rel-src">Organisation</label>
            <select id="rel-src" className="input" value={rel.source} onChange={e => setRel({ ...rel, source: e.target.value })}>
              <option value="">Choose…</option>{liveOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select></div>
          <div><label className="label" htmlFor="rel-type">Relationship</label>
            <select id="rel-type" className="input" value={rel.type} onChange={e => setRel({ ...rel, type: e.target.value })}>
              {REL_TYPES.map(t => <option key={t} value={t}>{REL_LABELS[t]}</option>)}
            </select></div>
          <div><label className="label" htmlFor="rel-tgt">Organisation</label>
            <select id="rel-tgt" className="input" value={rel.target} onChange={e => setRel({ ...rel, target: e.target.value })}>
              <option value="">Choose…</option>{liveOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select></div>
          <button type="button" className="btn-cta btn-sm" disabled={busy} onClick={addRel}>Add relationship</button>
        </div>
        {relationships.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No relationships yet.</p> : (
          <div className="table-wrapper"><table className="table">
            <thead><tr><th scope="col">From</th><th scope="col">Relationship</th><th scope="col">To</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{relationships.map(r => (
              <tr key={r.id}>
                <td>{orgName.get(r.source_organisation_id) ?? '—'}</td>
                <td>{REL_LABELS[r.relationship_type] ?? r.relationship_type}</td>
                <td>{orgName.get(r.target_organisation_id) ?? '—'}</td>
                <td><span className={`badge ${r.status === 'active' ? 'badge-open' : 'badge-inactive'}`}>{r.status}</span></td>
                <td>{r.status === 'active' && <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => endRel(r.id)}>End</button>}</td>
              </tr>))}
            </tbody></table></div>
        )}
      </section>

      <section className="card p-5" aria-labelledby="grants-h">
        <h2 id="grants-h" className="font-display font-semibold mb-1">Access to other organisations</h2>
        <p className="text-sm mb-3" style={{ color: 'var(--ink-soft)' }}>
          A person always works in their own organisation. A grant lets them switch into another one — one at a time, with the organisation named on screen. Revocation and expiry take effect on their next request.
        </p>
        <div className="flex flex-wrap gap-2 items-end mb-4">
          <div><label className="label" htmlFor="g-user">Person</label>
            <select id="g-user" className="input" value={grant.user} onChange={e => setGrant({ ...grant, user: e.target.value })}>
              <option value="">Choose…</option>
              {people.filter(p => !['tps_admin', 'tps_client', 'hs_provider'].includes(p.role)).map(p => (
                <option key={p.id} value={p.id}>{p.full_name || p.email} — {orgName.get(p.company_id) ?? ''}</option>
              ))}
            </select></div>
          <div><label className="label" htmlFor="g-org">Organisation</label>
            <select id="g-org" className="input" value={grant.org} onChange={e => setGrant({ ...grant, org: e.target.value })}>
              <option value="">Choose…</option>{liveOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select></div>
          <div><label className="label" htmlFor="g-role">Role</label>
            <select id="g-role" className="input" value={grant.role}
              onChange={e => isAccessRole(e.target.value) && setGrant({ ...grant, role: e.target.value })}>
              {ORGANISATION_ROLES.map(r => <option key={r} value={r}>{ACCESS_ROLE_LABELS[r]}</option>)}
            </select></div>
          <div><label className="label" htmlFor="g-until">Until (optional)</label>
            <input id="g-until" type="date" className="input" value={grant.until} onChange={e => setGrant({ ...grant, until: e.target.value })} /></div>
          <button type="button" className="btn-cta btn-sm" disabled={busy} onClick={addGrant}>Grant access</button>
        </div>
        {grants.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No cross-organisation access granted.</p> : (
          <div className="table-wrapper"><table className="table">
            <thead><tr><th scope="col">Person</th><th scope="col">Organisation</th><th scope="col">Role</th><th scope="col">Until</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{grants.map(g => {
              const expired = !!g.valid_until && new Date(g.valid_until) <= new Date();
              const status = g.active_status === 'active' && expired ? 'expired' : g.active_status;
              return (
                <tr key={g.id}>
                  <td>{personName.get(g.user_id) ?? g.user_id}</td>
                  <td>{orgName.get(g.organisation_id) ?? '—'}</td>
                  <td>{isAccessRole(g.role_key) ? ACCESS_ROLE_LABELS[g.role_key] : g.role_key}</td>
                  <td>{g.valid_until ? new Date(g.valid_until).toLocaleDateString('en-GB') : 'No end date'}</td>
                  <td><span className={`badge ${status === 'active' ? 'badge-open' : 'badge-inactive'}`}>{status}</span></td>
                  <td>{g.active_status === 'active' && <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => revoke(g.id)}>Revoke</button>}</td>
                </tr>);
            })}</tbody></table></div>
        )}
      </section>
    </div>
  );
}
