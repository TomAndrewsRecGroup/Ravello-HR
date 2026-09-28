import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSafetyContext, orgSitesAndDepartments } from '@/lib/hs/safetyContext';
import RamsCoshhNewForm, { type TemplateOption } from '@/components/safety/RamsCoshhNewForm';

export const metadata: Metadata = { title: 'New RAMS' };
export const dynamic = 'force-dynamic';

export default async function NewRamsPage() {
  const ctx = await getSafetyContext();
  if (!ctx.companyId || !ctx.can('risk.create')) redirect('/protect/rams');
  const [{ sites }, tpls] = await Promise.all([
    orgSitesAndDepartments(ctx.supabase, ctx.companyId),
    ctx.supabase.from('hs_templates').select('id, title, description, visibility')
      .eq('kind', 'method_statement').eq('active', true).order('title').limit(200),
  ]);
  return (
    <main className="portal-page flex-1 space-y-3">
      <Link href="/protect/rams" className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--ink-soft)' }}><ArrowLeft size={14} /> RAMS</Link>
      <RamsCoshhNewForm kind="method_statement" companyId={ctx.companyId} userId={ctx.userId} sites={sites}
        templates={(tpls.data ?? []) as TemplateOption[]} />
    </main>
  );
}
