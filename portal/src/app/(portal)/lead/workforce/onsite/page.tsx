import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Users, ShieldAlert } from 'lucide-react';
import { getWorkforceContext } from '@/lib/workforce/context';
import { WORKFORCE_BASE, workforcePersonPath } from '@/lib/workforce/vocab';
import ManualCheckinForm from './ManualCheckinForm';
import CheckoutButton from './CheckoutButton';

export const metadata: Metadata = { title: 'On site' };
export const dynamic = 'force-dynamic';

interface CheckinRow { id: string; person_id: string; site_id: string | null; checked_in_at: string }

const fmt = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Core-OS 360 Phase 14, Group 2. Attendance, not compliance — a
// NOT_READY worker can still be checked in here (see site_checkins'
// own header comment, migration 179).
//
// Core-OS 360 Completion Programme, Phase 26, Group 2 (C14.7). Until
// now the only way a row appeared or disappeared was the public
// /w/[token] scan page — deliberately flagged debt in the original
// plan doc. A worker with no badge, a lost badge, or a staffed kiosk
// had no way onto the roster at all. `ManualCheckinForm`/
// `CheckoutButton` close that, gated on workforce.manage: migration
// 195's own RLS policies and its new site_checkins_manual_guard()
// trigger are the real gate (own company, an EXPLICIT site, never a
// guessed default, and a non-staff session may only ever change
// checked_out_at once a row exists) — these components are a plain
// session insert/update under that RLS, never a bespoke API route.
export default async function OnSitePage() {
  const ctx = await getWorkforceContext();
  const { supabase, companyId } = ctx;
  if (!companyId || !ctx.can('workforce.read')) return <CannotSee />;
  const canManage = ctx.can('workforce.manage');

  const { data: checkinsRaw, error } = await supabase
    .from('site_checkins')
    .select('id, person_id, site_id, checked_in_at')
    .eq('company_id', companyId)
    .is('checked_out_at', null)
    .order('checked_in_at', { ascending: false })
    .limit(500);

  const checkins = (checkinsRaw ?? []) as CheckinRow[];
  const personIds = [...new Set(checkins.map(c => c.person_id))];
  const siteIds = [...new Set(checkins.map(c => c.site_id).filter((v): v is string => !!v))];

  const [{ data: peopleRaw }, { data: sitesRaw }, { data: allPeopleRaw }, { data: allSitesRaw }] = await Promise.all([
    personIds.length > 0
      ? supabase.from('people').select('id, full_name').in('id', personIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    siteIds.length > 0
      ? supabase.from('hs_sites').select('id, name').in('id', siteIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    canManage
      ? supabase.from('people').select('id, full_name').eq('company_id', companyId).eq('active_status', 'active').order('full_name').limit(500)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    canManage
      ? supabase.from('hs_sites').select('id, name').eq('company_id', companyId).eq('active', true).order('name').limit(500)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const nameByPerson = new Map((peopleRaw ?? []).map(p => [p.id, p.full_name] as const));
  const nameBySite = new Map((sitesRaw ?? []).map(s => [s.id, s.name] as const));

  const bySite = new Map<string, CheckinRow[]>();
  for (const c of checkins) {
    const key = c.site_id ?? '__none__';
    const list = bySite.get(key) ?? [];
    list.push(c);
    bySite.set(key, list);
  }

  return (
    <main className="portal-page flex-1 space-y-4">
      <Link href={WORKFORCE_BASE} className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--ink-soft)' }}>
        <ArrowLeft size={14} /> Safe to Deploy
      </Link>

      <div className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
        Who a worker QR badge scan has checked in and not yet checked out — attendance only, this never reflects
        Safe to Deploy status. Check-in and check-out happen by scanning the worker&rsquo;s own badge{canManage ? ', or manually below' : '.'}
      </div>

      {canManage && (
        <ManualCheckinForm
          people={(allPeopleRaw ?? []) as { id: string; full_name: string }[]}
          sites={(allSitesRaw ?? []) as { id: string; name: string }[]}
        />
      )}

      {error && (
        <p className="card p-3 text-sm" role="alert" style={{ color: 'var(--red)' }}>
          The on-site roster could not be loaded.
        </p>
      )}

      {checkins.length === 0 && !error ? (
        <div className="card p-12">
          <div className="empty-state">
            <Users size={28} style={{ color: 'var(--blue)' }} />
            <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>Nobody is currently checked in</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {[...bySite.entries()].map(([siteKey, rows]) => (
            <section key={siteKey} className="card p-4 space-y-2">
              <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                {siteKey === '__none__' ? 'No site recorded' : nameBySite.get(siteKey) ?? 'Unknown site'}
                <span className="ml-2 text-xs font-normal" style={{ color: 'var(--ink-faint)' }}>{rows.length} on site</span>
              </h2>
              <ul className="space-y-1">
                {rows.map(c => (
                  <li key={c.id} className="flex items-center justify-between text-sm gap-2">
                    <Link href={workforcePersonPath(c.person_id)} style={{ color: 'var(--ink)' }}>
                      {nameByPerson.get(c.person_id) ?? 'Unknown person'}
                    </Link>
                    <span className="flex items-center gap-2">
                      <span style={{ color: 'var(--ink-faint)' }}>Since {fmt(c.checked_in_at)}</span>
                      {canManage && <CheckoutButton checkinId={c.id} />}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function CannotSee() {
  return (
    <main className="portal-page flex-1 space-y-4">
      <Link href={WORKFORCE_BASE} className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--ink-soft)' }}>
        <ArrowLeft size={14} /> Safe to Deploy
      </Link>
      <div className="card p-10">
        <div className="empty-state">
          <ShieldAlert size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>You cannot see the on-site roster</p>
        </div>
      </div>
    </main>
  );
}
