import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import BroadcastClient from './BroadcastClient';

export const metadata: Metadata = { title: 'Broadcast' };

export default async function BroadcastPage() {
  const supabase = createServerSupabaseClient();

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, active')
    .order('name');

  return (
    <>
      <AdminTopbar
        title="Broadcast"
        subtitle="Send an action item to multiple clients at once"
      />
      <main className="admin-page flex-1">
        <BroadcastClient companies={companies ?? []} />
      </main>
    </>
  );
}
