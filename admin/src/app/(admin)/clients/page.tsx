import type { Metadata } from 'next';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import ClientsFetcher from './ClientsFetcher';

export const metadata: Metadata = { title: 'Clients' };
// Removed 'edge' runtime: Vercel serverless (Node) runs in dub1, same
// AWS region as Supabase eu-west-1 — drops Supabase RTT from ~120ms
// (transatlantic from a US edge node) to ~5ms per query.
export const revalidate = 60;

// Shell-only server component. All list data now loads client-side from
// /api/clients/summary with browser-level stale-while-revalidate, so the
// HTML streams with the topbar ready in <30ms and the table fills in
// from the HTTP cache on subsequent visits.
export default function ClientsPage() {
  return (
    <>
      <AdminTopbar
        title="Clients"
        subtitle="Live client roster"
        actions={<Link href="/clients/onboard" prefetch={false} className="btn-cta btn-sm flex items-center gap-1.5"><Plus size={13} />New Client</Link>}
      />
      <main className="admin-page flex-1">
        <ClientsFetcher />
      </main>
    </>
  );
}
