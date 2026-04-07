import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import FeatureFlagToggles from '@/components/modules/FeatureFlagToggles';

export const metadata: Metadata = { title: 'Feature Flags' };
export const revalidate = 60;

export default async function FeatureFlagsPage() {
  const supabase = createServerSupabaseClient();
  const { data: companies } = await supabase
    .from('companies')
    .select('id,name,active,feature_flags')
    .eq('active', true)
    .order('name');

  const all = companies ?? [];

  return (
    <>
      <AdminTopbar title="Feature Flags" subtitle="Control which modules are enabled per client" />
      <main className="admin-page flex-1">
        {all.length === 0 ? (
          <div className="card p-12 empty-state">
            No active clients. <Link href="/clients/new" className="btn-cta mt-2">Add a client</Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-5">
            {all.map((c: any) => (
              <div key={c.id} className="card p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <Link href={`/clients/${c.id}`} className="font-display font-semibold text-sm hover:underline" style={{ color: 'var(--ink)' }}>
                      {c.name}
                    </Link>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                      {Object.values(c.feature_flags ?? {}).filter(Boolean).length} modules active
                    </p>
                  </div>
                  <span className="badge badge-active">Active</span>
                </div>
                <FeatureFlagToggles companyId={c.id} flags={c.feature_flags ?? {}} />
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
