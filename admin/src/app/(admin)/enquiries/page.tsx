import AdminTopbar from '@/components/layout/AdminTopbar';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import EnquiriesClient, { type Enquiry } from './EnquiriesClient';

export const dynamic = 'force-dynamic';

export default async function EnquiriesPage() {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('enquiries')
    .select('id, full_name, email, phone, company_name, source, result, status, notes, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  const enquiries = (data ?? []) as Enquiry[];

  return (
    <>
      <AdminTopbar title="Enquiries" subtitle="Marketing site form submissions" />
      <main className="p-6 lg:p-8">
        <EnquiriesClient initial={enquiries} />
      </main>
    </>
  );
}
