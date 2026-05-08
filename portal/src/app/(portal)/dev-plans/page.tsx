import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ClipboardList } from 'lucide-react';

export const metadata: Metadata = { title: 'Development Plans' };
export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  active: 'Active', completed: 'Completed',
};

export default async function DevPlansPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: plans } = await supabase
    .from('dev_plans')
    .select('id, title, summary, status, assigned_at, athlete:athlete_id (full_name)')
    .in('status', ['active', 'completed'])
    .order('assigned_at', { ascending: false, nullsFirst: false });

  type Row = {
    id: string; title: string; summary: string | null; status: keyof typeof STATUS_LABELS;
    assigned_at: string | null;
    athlete: { full_name: string } | { full_name: string }[] | null;
  };
  const rows = ((plans ?? []) as unknown as Row[]).map(r => ({
    ...r,
    athlete_name: Array.isArray(r.athlete) ? r.athlete[0]?.full_name : r.athlete?.full_name,
  }));

  return (
    <main className="portal-page">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold">Development Plans</h1>
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          Branded development plans assigned by The People System.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="card p-8 text-center">
          <ClipboardList size={32} className="mx-auto mb-3" style={{ color: 'var(--ink-faint)' }} />
          <p className="font-semibold">No development plans yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>
            Your account manager will share plans here once they&apos;re ready.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map(r => (
            <Link key={r.id} href={`/dev-plans/${r.id}`} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display font-semibold text-lg">{r.title}</h3>
                  {r.athlete_name && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>For {r.athlete_name}</p>
                  )}
                  {r.summary && (
                    <p className="text-sm mt-2" style={{ color: 'var(--ink-soft)' }}>{r.summary}</p>
                  )}
                </div>
                <span className="badge">{STATUS_LABELS[r.status] ?? r.status}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
