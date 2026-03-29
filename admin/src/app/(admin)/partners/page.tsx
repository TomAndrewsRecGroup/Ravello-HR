import type { Metadata } from 'next';
import AdminTopbar from '@/components/layout/AdminTopbar';
import PartnersClient from './PartnersClient';

export const metadata: Metadata = { title: 'Partners — API Keys' };

export default function PartnersPage() {
  return (
    <>
      <AdminTopbar
        title="Partners"
        subtitle="Manage API keys for partner integrations (IvyLens, BD pipeline)"
      />
      <main className="admin-page flex-1">
        <PartnersClient />
      </main>
    </>
  );
}
