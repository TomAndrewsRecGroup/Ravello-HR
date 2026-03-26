import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import HiringClient from './HiringClient';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Hiring Overview' };

export default async function AdminHiringPage() {
  const supabase = createServerSupabaseClient();

  const { data } = await supabase
    .from('requisitions')
    .select('*, companies(name, id)')
    .neq('stage', 'filled')
    .neq('stage', 'cancelled')
    .order('created_at', { ascending: false });

  const reqs: any[] = data ?? [];

  // Build list of unique companies for filter dropdown
  const companyMap: Record<string, string> = {};
  for (const r of reqs) {
    if (r.companies?.id && r.companies?.name) {
      companyMap[r.companies.id] = r.companies.name;
    }
  }
  const companies = Object.entries(companyMap).map(([id, name]) => ({ id, name }));

  return (
    <>
      <AdminTopbar
        title="Hiring Overview"
        subtitle="All active roles across all clients"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/hiring/analytics" className="btn-ghost btn-sm">Analytics</Link>
            <Link href="/hiring/templates" className="btn-secondary btn-sm">JD Templates</Link>
            <Link href="/hiring/new" className="btn-cta btn-sm">+ New Role</Link>
          </div>
        }
      />
      <main className="admin-page flex-1">
        <HiringClient reqs={reqs} companies={companies} />
      </main>
    </>
  );
}
