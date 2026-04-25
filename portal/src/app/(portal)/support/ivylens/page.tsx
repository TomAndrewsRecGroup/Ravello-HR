import type { Metadata } from 'next';
import IvyLensSupportClient from './IvyLensSupportClient';
import { listCompanyTickets } from '@/lib/support/tickets';

export const metadata: Metadata = { title: 'IvyLens Support' };
// Per-user dynamic via cookies; underlying IvyLens fetch is cached for 60s
// inside ivylensRequest. Refresh-on-focus in the client picks up updates.
export const dynamic = 'force-dynamic';

export default async function IvyLensSupportPage() {
  const { tickets } = await listCompanyTickets();
  return <IvyLensSupportClient initialTickets={tickets} />;
}
