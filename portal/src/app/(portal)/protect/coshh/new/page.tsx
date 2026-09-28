import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSafetyContext, orgSitesAndDepartments, param } from '@/lib/hs/safetyContext';
import RamsCoshhNewForm, { type TemplateOption } from '@/components/safety/RamsCoshhNewForm';

export const metadata: Metadata = { title: 'New COSHH assessment' };
export const dynamic = 'force-dynamic';

export default async function NewCoshhPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const ctx = await getSafetyContext();
  if (!ctx.companyId || !ctx.can('risk.create')) redirect('/protect/coshh');
  const [{ sites }, tpls, subs] = await Promise.all([
    orgSitesAndDepartments(ctx.supabase, ctx.companyId),
    ctx.supabase.from('hs_templates').select('id, title, description, visibility')
      .eq('kind', 'coshh_assessment').eq('active', true).order('title').limit(200),
    ctx.supabase.from('substances').select('id, reference, product_name').eq('company_id', ctx.companyId)
      .eq('active_status', 'active').order('product_name').limit(500),
  ]);
  const substances = (subs.data ?? []).map(s => ({ id: s.id as string, label: `${s.product_name as string} (${s.reference as string})` }));
  const pre = param(sp, 'substance');
  return (
    <main className="portal-page flex-1 space-y-3">
      <Link href="/protect/coshh" className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--ink-soft)' }}><ArrowLeft size={14} /> COSHH register</Link>
      <RamsCoshhNewForm kind="coshh_assessment" companyId={ctx.companyId} userId={ctx.userId} sites={sites}
        templates={(tpls.data ?? []) as TemplateOption[]} substances={substances}
        preselectSubstance={substances.some(s => s.id === pre) ? pre : ''} />
    </main>
  );
}
