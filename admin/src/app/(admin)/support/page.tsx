import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import SupportClient from './SupportClient';

export const metadata: Metadata = { title: 'Support' };
export const revalidate = 30;

export default async function AdminSupportPage() {
  const supabase = createServerSupabaseClient();
  const { data: tickets } = await supabase
    .from('tickets')
    .select('*, companies(name)')
    .order('created_at', { ascending: false });

  const all  = tickets ?? [];
  const open = all.filter((t: any) => !['resolved', 'closed'].includes(t.status));

  return (
    <>
      <AdminTopbar
        title="Support"
        subtitle={`${open.length} open ticket${open.length !== 1 ? 's' : ''}`}
      />
      <main className="admin-page flex-1">
        <SupportClient tickets={all} />
      </main>
    </>
  );
}
