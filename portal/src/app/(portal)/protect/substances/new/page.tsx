import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSafetyContext } from '@/lib/hs/safetyContext';
import SubstanceForm from './SubstanceForm';

export const metadata: Metadata = { title: 'Add substance' };
export const dynamic = 'force-dynamic';

export default async function NewSubstancePage() {
  const ctx = await getSafetyContext();
  if (!ctx.companyId || !ctx.can('risk.create')) redirect('/protect/coshh');
  return (
    <main className="portal-page flex-1 space-y-3 max-w-3xl">
      <Link href="/protect/coshh" className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--ink-soft)' }}><ArrowLeft size={14} /> COSHH register</Link>
      <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--ink)' }}>Add a substance</h1>
      <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Add the product first, then upload its safety data sheet on the next screen.</p>
      <SubstanceForm companyId={ctx.companyId} />
    </main>
  );
}
