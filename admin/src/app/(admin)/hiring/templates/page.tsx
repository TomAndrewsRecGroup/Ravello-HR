import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import TemplatesClient from './TemplatesClient';
import Link from 'next/link';

export const metadata: Metadata = { title: 'JD Templates' };
export const revalidate = 60;

export default async function JDTemplatesPage() {
  const supabase = createServerSupabaseClient();

  const { data } = await supabase
    .from('jd_templates')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <>
      <AdminTopbar
        title="JD Templates"
        subtitle="Reusable job description templates for faster role creation"
        actions={
          <Link href="/hiring" className="btn-ghost btn-sm">← All Roles</Link>
        }
      />
      <main className="admin-page flex-1">
        <TemplatesClient initialTemplates={data ?? []} />
      </main>
    </>
  );
}
