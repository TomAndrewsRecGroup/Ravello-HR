import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Building2, Clock } from 'lucide-react';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import { daysUntil } from '@/lib/hs/recurrence';

export const metadata: Metadata = { title: 'Health & Safety' };
export const dynamic = 'force-dynamic';

// Every active client, with what is overdue or due in the next 30 days
// on each one's H&S register. Core OS 360 staff deliver H&S directly
// (2026-09-25 — there is no external provider workspace any more), so
// this reads exactly the way /hiring and /clients do: every active
// company, a normal staff-session query, no grant/scope concept.
export default async function HealthSafetyPage() {
  const supabase = createServerSupabaseClient();
  const horizon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const [{ data: companies }, due] = await Promise.all([
    supabase.from('companies').select('id, name, sector').eq('active', true).order('name'),
    readAllPages<{ id: string; company_id: string; due_date: string }>((from, to) =>
      supabase.from('compliance_items')
        .select('id, company_id, due_date')
        .eq('domain', 'hs')
        .neq('status', 'complete')
        .lte('due_date', horizon)
        .order('due_date').order('id')
        .range(from, to)),
  ]);

  const list = (companies ?? []) as { id: string; name: string; sector: string | null }[];
  const counts = new Map<string, { overdue: number; soon: number }>();
  for (const r of due.rows) {
    const c = counts.get(r.company_id) ?? { overdue: 0, soon: 0 };
    if (daysUntil(r.due_date) < 0) c.overdue++; else c.soon++;
    counts.set(r.company_id, c);
  }

  return (
    <>
      <AdminTopbar title="Health & Safety" subtitle="Every client's register, activities and Safety Timeline" />
      <main className="admin-page flex-1 space-y-5">
        {due.error && (
          <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load due dates: {due.error}</p>
        )}

        {list.length === 0 ? (
          <div className="card empty-state p-10">
            <Building2 size={28} style={{ color: 'var(--ink-faint)' }} />
            <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No active clients yet.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map(c => {
              const n = counts.get(c.id) ?? { overdue: 0, soon: 0 };
              return (
                <Link key={c.id} href={`/health-safety/${c.id}`} className="card p-5 block hover:shadow-md transition-shadow">
                  <h2 className="font-display font-semibold" style={{ color: 'var(--ink)' }}>{c.name}</h2>
                  {c.sector && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{c.sector}</p>}
                  <div className="mt-4 flex gap-4 text-sm">
                    <span className="flex items-center gap-1.5" style={{ color: n.overdue ? 'var(--red)' : 'var(--ink-faint)' }}>
                      <AlertTriangle size={14} /> {n.overdue} overdue
                    </span>
                    <span className="flex items-center gap-1.5" style={{ color: n.soon ? 'var(--gold)' : 'var(--ink-faint)' }}>
                      <Clock size={14} /> {n.soon} due in 30 days
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
