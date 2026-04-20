import type { Metadata } from 'next';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ClientDetailTabs from './ClientDetailTabs';
import { getCachedClientDetail } from '@/lib/cache/clientDetail';

export const metadata: Metadata = { title: 'Client Detail' };
export const runtime    = 'edge';
export const revalidate = 60;

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const detail = await getCachedClientDetail(params.id);
  if (!detail) notFound();

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
