import type { Metadata } from 'next';
import { ivylensRequest, IVYLENS_TAGS } from '@/lib/ivylens';
import IvyLensTicketClient from './IvyLensTicketClient';

export const metadata: Metadata = { title: 'IvyLens Ticket' };
// Per-user dynamic; underlying IvyLens fetch cached for 60s by ivylensRequest.
export const dynamic = 'force-dynamic';

export default async function IvyLensTicketDetailPage({ params }: { params: { id: string } }) {
  // Fetch ticket detail + responses server-side so the page has data on first paint
  // (was a useEffect post-hydration round-trip).
  const { data, error } = await ivylensRequest<{ ticket: any; responses: any[] }>(
    `/tickets/${params.id}`,
    { tags: [IVYLENS_TAGS.TICKET_DETAIL] },
  );

  return (
    <IvyLensTicketClient
      ticketId={params.id}
      initialTicket={data?.ticket ?? null}
      initialResponses={data?.responses ?? []}
      initialError={error ?? undefined}
    />
  );
}
