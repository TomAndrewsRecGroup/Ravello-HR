import type { Metadata } from 'next';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import ClientDetailTabs from './ClientDetailTabs';
import { getCachedClientDetail } from '@/lib/cache/clientDetail';

export const metadata: Metadata = { title: 'Client Detail' };
export const revalidate = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The route segment is still called [id] for backwards compat, but
// the param is now expected to be a slug. We accept UUIDs too —
// old links / bookmarks redirect to the canonical slug URL.
export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const detail = await getCachedClientDetail(params.id);
  if (!detail) notFound();

  // Canonical URL = slug. If the user arrived via UUID and a slug
  // exists, redirect so the address bar shows the readable form.
  if (UUID_RE.test(params.id) && detail.company.slug && detail.company.slug !== params.id) {
    redirect(`/clients/${detail.company.slug}`);
  }

  const { company: c, users, reqs, tickets, docsCount } = detail;
  const activeRoles = reqs.filter((r: any) => !['filled', 'cancelled'].includes(r.stage)).length;
  const ticketCount = tickets.length;

  return (
    <>
      <AdminTopbar
        title={c.name}
        subtitle={[c.sector, c.size_band].filter(Boolean).join(' · ')}
        actions={<Link href="/clients" prefetch={false} className="btn-secondary btn-sm">← All Clients</Link>}
      />
      <main className="admin-page flex-1">
        <ClientDetailTabs
          company={c}
          users={users}
          reqs={reqs}
          stats={{ activeRoles, docsCount, ticketCount }}
        />
      </main>
    </>
  );
}
