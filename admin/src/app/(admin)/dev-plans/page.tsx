import type { Metadata } from 'next';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { Plus, FileText } from 'lucide-react';
import PlansSearchTable, { type PlanRow } from './PlansSearchTable';

export const metadata: Metadata = { title: 'Development Plans' };
export const dynamic = 'force-dynamic';

export default async function DevPlansPage() {
  const supabase = createServerSupabaseClient();
  const [{ data: plans }, { count: tplCount }] = await Promise.all([
    supabase
      .from('dev_plans')
      .select('id, title, status, assigned_at, created_at, athlete:athlete_id (full_name), company:company_id (name)')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('dev_plan_templates').select('id', { count: 'exact', head: true }),
  ]);

  type Raw = {
    id: string;
    title: string;
    status: string;
    assigned_at: string | null;
    created_at: string;
    athlete: { full_name: string } | { full_name: string }[] | null;
    company: { name: string } | { name: string }[] | null;
  };
  const rows: PlanRow[] = ((plans ?? []) as unknown as Raw[]).map(r => ({
    id: r.id,
    title: r.title,
    status: r.status,
    assigned_at: r.assigned_at,
    athlete_name: Array.isArray(r.athlete) ? r.athlete[0]?.full_name ?? null : r.athlete?.full_name ?? null,
    company_name: Array.isArray(r.company) ? r.company[0]?.name ?? null : r.company?.name ?? null,
  }));

  return (
    <>
      <AdminTopbar
        title="Development Plans"
        subtitle="Reusable, branded development plans for athletes and other client contacts."
      />
      <main className="admin-page flex-1 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dev-plans/new" className="btn-cta">
            <Plus size={14} /> New plan
          </Link>
          <Link href="/dev-plans/templates" className="btn-secondary">
            <FileText size={14} /> Templates ({tplCount ?? 0})
          </Link>
        </div>

        <PlansSearchTable rows={rows} />
      </main>
    </>
  );
}
