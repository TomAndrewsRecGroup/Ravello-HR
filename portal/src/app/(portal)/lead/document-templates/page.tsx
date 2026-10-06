import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { FileSignature, Sparkles } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { isCompanySuperUser } from '@/lib/auth/companyAdmin';
import { DOC_CATEGORY_LABELS, type DocCategory } from '@/lib/ui/statusMaps';

export const metadata: Metadata = { title: 'Document Templates' };
export const revalidate = 60;

export default async function DocumentTemplatesPage() {
  const supabase = await createServerSupabaseClient();
  const { user, companyId, role, isTpsStaff } = await getSessionProfile();
  if (!user) redirect('/auth/login');

  // Generating an HR document is an account-admin-level act — the same
  // line employee_records' own sensitive columns draw. document_templates_
  // client_read (213) already enforces this at the database; this check
  // only avoids showing a confusing empty list to a plain client_user.
  if (!isCompanySuperUser({ role, isTpsStaff })) {
    return (
      <main className="portal-page flex-1">
        <div className="card p-12 text-center empty-state">
          <p className="text-sm font-medium" style={{ color: 'var(--ink-soft)' }}>
            Only account administrators can generate HR documents.
          </p>
        </div>
      </main>
    );
  }

  const { data: templates } = await supabase
    .from('document_templates')
    .select('id,title,category,description,requires_signature,is_example')
    .eq('status', 'active')
    .order('title')
    .limit(500);

  const all = templates ?? [];

  return (
    <main className="portal-page flex-1">
      <div className="mb-5">
        <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--ink)' }}>Document Templates</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--ink-faint)' }}>
          Generate an employment document for one of your employees from a staff-authored template, with native e-signing.
        </p>
      </div>

      {all.length === 0 ? (
        <div className="card empty-state p-10">
          <FileSignature size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No templates are available yet.</p>
        </div>
      ) : (
        <ul className="card divide-y" style={{ borderColor: 'var(--line)' }}>
          {all.map(t => (
            <li key={t.id} className="p-4 flex items-start gap-3">
              <FileSignature size={16} style={{ color: 'var(--ink-faint)', flexShrink: 0, marginTop: 2 }} aria-hidden />
              <div className="flex-1 min-w-0">
                <p className="font-medium flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                  {t.title}
                  {t.is_example && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: 'rgba(191,143,40,0.12)', color: 'var(--gold)' }}>
                      <Sparkles size={10} /> Example — review before real use
                    </span>
                  )}
                </p>
                <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                  {DOC_CATEGORY_LABELS[t.category as DocCategory] ?? t.category}
                  {t.requires_signature ? ' · requires signature' : ' · no signature required'}
                </p>
                {t.description && <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>{t.description}</p>}
              </div>
              <Link prefetch={false} href={`/lead/document-templates/generate?template=${t.id}`} className="btn-cta btn-sm flex-shrink-0">
                Generate
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
