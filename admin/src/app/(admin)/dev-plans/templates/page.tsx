import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import TemplatesClient from './TemplatesClient';

export const metadata: Metadata = { title: 'Dev Plan Templates' };
export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('dev_plan_templates')
    .select('id, name, description, milestones, updated_at')
    .order('name');
  return (
    <>
      <AdminTopbar title="Dev Plan Templates" subtitle="Reusable milestone sets for new development plans." />
      <main className="admin-page flex-1">
        <TemplatesClient initial={data ?? []} />
      </main>
    </>
  );
}
