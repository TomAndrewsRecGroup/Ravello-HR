import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ArrowLeft } from 'lucide-react';
import DevPlanDocument from '@/components/dev-plans/DevPlanDocument';
import type { DevPlanContent, DevPlanStrength } from '@/lib/devPlan';
import PrintButton from './PrintButton';

export const metadata: Metadata = { title: 'Development Plan' };
export const dynamic = 'force-dynamic';

export default async function DevPlanDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: plan } = await supabase
    .from('dev_plans')
    .select('id, title, summary, status, assigned_at, brand_profile_id, content, strengths, training_items, roles_items, athlete:athlete_id (full_name)')
    .eq('id', params.id)
    .single();
  if (!plan) notFound();

  const [{ data: milestones }, { data: brand }] = await Promise.all([
    supabase.from('dev_plan_milestones')
      .select('id, title, description, due_date, status, sort_order')
      .eq('plan_id', params.id)
      .order('sort_order'),
    plan.brand_profile_id
      ? supabase.from('brand_profiles').select('*').eq('id', plan.brand_profile_id).single()
      : Promise.resolve({ data: null }),
  ]);

  type AthleteRel = { full_name: string } | { full_name: string }[] | null;
  const athleteRel = plan.athlete as AthleteRel;
  const athleteName = Array.isArray(athleteRel) ? athleteRel[0]?.full_name : athleteRel?.full_name;

  return (
    <main className="dp-print-frame" style={{ background: '#e7e8ef', minHeight: '100vh', padding: '1.25rem 0.75rem' }}>
      <div style={{ maxWidth: 940, margin: '0 auto' }}>
        <div className="flex items-center justify-between mb-4 no-print" style={{ paddingInline: '0.5rem' }}>
          <Link href="/dev-plans" className="inline-flex items-center gap-1 text-sm hover:underline" style={{ color: 'var(--purple)' }}>
            <ArrowLeft size={14} /> Back to plans
          </Link>
          <PrintButton />
        </div>

        <DevPlanDocument
          title={plan.title}
          athleteName={athleteName}
          logoUrl={brand?.logo_url ?? null}
          content={plan.content as DevPlanContent | null}
          strengths={(plan.strengths as DevPlanStrength[]) ?? []}
          summary={plan.summary}
          milestones={milestones ?? []}
          trainingItems={(plan as { training_items?: Array<{ box1: string; box2: string }> }).training_items}
          rolesItems={(plan as { roles_items?: Array<{ box1: string; box2: string }> }).roles_items}
        />
      </div>
    </main>
  );
}
