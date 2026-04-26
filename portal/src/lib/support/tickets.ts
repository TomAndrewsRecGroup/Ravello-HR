import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { ivylensRequest, IVYLENS_TAGS } from '@/lib/ivylens';

export interface IvyLensTicket {
  id: string;
  subject: string;
  status: string;
  priority?: string;
  category?: string;
  created_at: string;
  updated_at?: string;
}

/**
 * Returns IvyLens tickets owned by the calling user's company.
 * Used by both /api/support/tickets (client refresh path) and the
 * support pages (server-rendered initial fetch).
 */
export async function listCompanyTickets(): Promise<{
  tickets: IvyLensTicket[];
  error: string | null;
}> {
  const { user, companyId } = await getSessionProfile();
  if (!user) return { tickets: [], error: 'Unauthorized' };
  if (!companyId) return { tickets: [], error: null };

  const supabase = createServerSupabaseClient();
  const [{ data: companyTicketRows }, ivylensRes] = await Promise.all([
    supabase
      .from('ivylens_tickets')
      .select('ivylens_ticket_id')
      .eq('company_id', companyId),
    ivylensRequest<{ tickets: IvyLensTicket[] }>('/tickets', { tags: [IVYLENS_TAGS.TICKETS] }),
  ]);

  if (ivylensRes.error) return { tickets: [], error: ivylensRes.error };

  const ownedTicketIds = new Set((companyTicketRows ?? []).map(t => t.ivylens_ticket_id));
  const filtered = (ivylensRes.data?.tickets ?? []).filter(t => ownedTicketIds.has(t.id));
  return { tickets: filtered, error: null };
}
