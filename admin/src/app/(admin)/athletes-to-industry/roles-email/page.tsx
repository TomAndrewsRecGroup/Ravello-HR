import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { nextSendLabel } from '@/lib/a2iRoles/schedule';
import RolesEmailClient, { type RolesEmailData } from './RolesEmailClient';

export const metadata: Metadata = { title: 'Thursday roles email' };
export const dynamic = 'force-dynamic';

// The Athletes To Industry Thursday 3pm "live roles" email: switch it
// on, choose who gets it, preview this week's roles, send a test to
// yourself, and see what went out and who pressed Match me.
// Everything here is staff-only RLS (migration 217).

export default async function RolesEmailPage() {
  const supabase = await createServerSupabaseClient();

  const [configRes, athletesRes, selectedRes, optoutsRes, sendsRes, interestsRes, sendersRes] = await Promise.all([
    supabase.from('a2i_role_alert_config')
      .select('enabled, recipient_mode, sender_profile_id, role_url_template, notify_email, updated_at')
      .eq('singleton', true).maybeSingle(),
    readAllPages<any>((from, to) => supabase.from('athletes')
      .select('id, full_name, email, company_id, companies(name)')
      .order('full_name').order('id').range(from, to)),
    readAllPages<{ id: string; athlete_id: string }>((from, to) => supabase.from('a2i_role_alert_recipients')
      .select('id, athlete_id').order('id').range(from, to)),
    readAllPages<{ id: string; email_lower: string; source: string; created_at: string }>((from, to) => supabase.from('a2i_role_alert_optouts')
      .select('id, email_lower, source, created_at').order('id').range(from, to)),
    supabase.from('a2i_role_alert_sends')
      .select('id, week_key, status, trigger, job_count, recipient_count, sent_count, failed_count, sender_email, error, started_at, completed_at, created_at')
      .order('week_key', { ascending: false }).limit(12),
    supabase.from('a2i_role_interests')
      .select('id, manatal_job_id, position_name, note, notified_at, notify_error, created_at, athletes(full_name, email)')
      .order('created_at', { ascending: false }).limit(100),
    supabase.from('profiles')
      .select('id, full_name, email, smtp_from_email, smtp_host, smtp_last_verified_at')
      .eq('role', 'tps_admin').not('smtp_from_email', 'is', null).limit(50),
  ]);

  const data: RolesEmailData = {
    config: configRes.data ?? null,
    nextSend: nextSendLabel(new Date()),
    athletes: (athletesRes.rows ?? []).map((a: any) => {
      const c = Array.isArray(a.companies) ? a.companies[0] : a.companies;
      return { id: a.id, full_name: a.full_name, email: a.email, company_name: c?.name ?? null };
    }),
    selectedIds: selectedRes.rows.map(r => r.athlete_id),
    optouts: optoutsRes.rows.map(o => ({ email_lower: o.email_lower, source: o.source, created_at: o.created_at })),
    sends: (sendsRes.data ?? []) as RolesEmailData['sends'],
    interests: ((interestsRes.data ?? []) as any[]).map(i => {
      const a = Array.isArray(i.athletes) ? i.athletes[0] : i.athletes;
      return {
        id: i.id, manatal_job_id: i.manatal_job_id, position_name: i.position_name, note: i.note,
        notified_at: i.notified_at, notify_error: i.notify_error, created_at: i.created_at,
        athlete_name: a?.full_name ?? null, athlete_email: a?.email ?? null,
      };
    }),
    senders: (sendersRes.data ?? []).map(p => ({
      id: p.id, label: `${p.full_name ?? p.email} <${p.smtp_from_email}>`,
      configured: Boolean(p.smtp_host), last_verified_at: p.smtp_last_verified_at,
    })),
    loadError: configRes.error?.message ?? athletesRes.error ?? sendsRes.error?.message ?? null,
  };

  return (
    <>
      <AdminTopbar
        title="Thursday roles email"
        subtitle="Every live Manatal role, emailed to Athletes To Industry athletes every Thursday at 3pm."
      />
      <main className="admin-page flex-1 space-y-6">
        <Link href="/athletes-to-industry" className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--ink-soft)' }}>
          <ArrowLeft size={14} /> Athletes To Industry
        </Link>
        <RolesEmailClient data={data} />
      </main>
    </>
  );
}
