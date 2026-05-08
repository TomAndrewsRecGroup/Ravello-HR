import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import PlansSearchList, { type PlanItem } from './PlansSearchList';

export const metadata: Metadata = { title: 'Development Plans' };
export const dynamic = 'force-dynamic';

export default async function DevPlansPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: plans } = await supabase
    .from('dev_plans')
    .select('id, title, summary, status, assigned_at, athlete:athlete_id (full_name)')
    .in('status', ['active', 'completed'])
    .order('assigned_at', { ascending: false, nullsFirst: false });

  type Raw = {
    id: string; title: string; summary: string | null; status: string;
    athlete: { full_name: string } | { full_name: string }[] | null;
  };
  const rows: PlanItem[] = ((plans ?? []) as unknown as Raw[]).map(r => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    status: r.status,
    athlete_name: Array.isArray(r.athlete) ? r.athlete[0]?.full_name ?? null : r.athlete?.full_name ?? null,
  }));

  return (
    <main className="portal-page">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold">Development Plans</h1>
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          Branded development plans assigned by The People System.
        </p>
      </header>

      <PlansSearchList rows={rows} />
    </main>
  );
}
