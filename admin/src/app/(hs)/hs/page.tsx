import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Building2, Clock, ShieldCheck } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import { HS_SCOPE_LABELS } from '@/lib/hs/vocab';
import { daysUntil } from '@/lib/hs/recurrence';
import type { HsMyCompany } from '@/lib/hs/types';

export const metadata: Metadata = { title: 'Health & Safety workspace' };
export const dynamic = 'force-dynamic';

// My clients, with what is overdue or due in the next 30 days on each
// one's H&S register. Every read is the user's own session: RLS returns
// only register rows of clients this user may see (hs_can_access, 094).
export default async function HsHome() {
  const supabase = createServerSupabaseClient();
  const horizon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const [{ data: companies }, due] = await Promise.all([
    supabase.rpc('hs_my_companies'),
    readAllPages<{ id: string; company_id: string; due_date: string }>((from, to) =>
      supabase.from('compliance_items')
        .select('id, company_id, due_date')
        .eq('domain', 'hs')
        .neq('status', 'complete')
        .lte('due_date', horizon)
        .order('due_date').order('id')
        .range(from, to)),
  ]);

  const list = (companies ?? []) as HsMyCompany[];
  const counts = new Map<string, { overdue: number; soon: number }>();
  for (const r of due.rows) {
    const c = counts.get(r.company_id) ?? { overdue: 0, soon: 0 };
    if (daysUntil(r.due_date) < 0) c.overdue++; else c.soon++;
    counts.set(r.company_id, c);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display font-bold text-2xl" style={{ color: 'var(--ink)' }}>My clients</h1>
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          Everything you record here appears on the client&apos;s Safety Timeline.
        </p>
      </div>

      {due.error && (
        <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load due dates: {due.error}</p>
      )}

      {list.length === 0 ? (
        <div className="card empty-state p-10">
          <Building2 size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
            You have not been given access to any clients yet. Core OS 360 will assign them.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(c => {
            const n = counts.get(c.company_id) ?? { overdue: 0, soon: 0 };
            const canRegister = c.scopes.includes('register');
            return (
              <Link key={c.company_id} href={`/hs/c/${c.company_id}`} className="card p-5 block hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-display font-semibold" style={{ color: 'var(--ink)' }}>{c.name}</h2>
                  {c.access_level === 'read' && <span className="badge">View only</span>}
                </div>
                {c.sector && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{c.sector}</p>}
                {canRegister ? (
                  <div className="mt-4 flex gap-4 text-sm">
                    <span className="flex items-center gap-1.5" style={{ color: n.overdue ? 'var(--red)' : 'var(--ink-faint)' }}>
                      <AlertTriangle size={14} /> {n.overdue} overdue
                    </span>
                    <span className="flex items-center gap-1.5" style={{ color: n.soon ? 'var(--gold)' : 'var(--ink-faint)' }}>
                      <Clock size={14} /> {n.soon} due in 30 days
                    </span>
                  </div>
                ) : (
                  <p className="mt-4 text-sm flex items-center gap-1.5" style={{ color: 'var(--ink-soft)' }}>
                    <ShieldCheck size={14} /> {c.scopes.map(s => HS_SCOPE_LABELS[s]).join(', ')}
                  </p>
                )}
                {c.ends_on && <p className="mt-2 text-xs" style={{ color: 'var(--ink-faint)' }}>Access until {c.ends_on}</p>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
