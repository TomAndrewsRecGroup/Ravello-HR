import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requirePortfolioSession, portfolioIncludes } from '@/lib/consultancy/portfolioAccess';
import type { ConsultancyVisitTemplate } from '@/lib/consultancy/types';
import BookVisitForm from './BookVisitForm';

export const metadata: Metadata = { title: 'Book a Visit' };
export const dynamic = 'force-dynamic';

export default async function BookVisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const portfolio = await requirePortfolioSession();
  if (!portfolio) redirect('/dashboard');
  if (!portfolioIncludes(portfolio.organisations, id)) notFound();

  const org = portfolio.organisations.find(o => o.organisation_id === id)!;
  const supabase = await createServerSupabaseClient();
  const { data: templates } = await supabase.from('consultancy_visit_templates')
    .select('*').eq('is_active', true).order('name').limit(200);

  return <BookVisitForm clientId={id} clientName={org.name} templates={(templates ?? []) as ConsultancyVisitTemplate[]} />;
}
