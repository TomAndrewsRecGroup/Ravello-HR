import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { ivylensRequest, IVYLENS_TAGS } from '@/lib/ivylens';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Confirm the ticket id belongs to the caller's company before
 * forwarding to IvyLens. Without this, any authed user could
 * /api/support/tickets/<any-id> their way into another tenant's
 * conversation. RLS on ivylens_tickets gives us the scope filter
 * for free — if the row isn't visible to this caller, they don't
 * own it.
 *
 * tps_admin staff can act on any ticket (treated as a per-company
 * support context elsewhere via the client switcher); we still
 * verify the row exists so a typo'd id 404s cleanly.
 */
async function assertOwnsTicket(ticketId: string): Promise<NextResponse | null> {
  if (!UUID_RE.test(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket id' }, { status: 400 });
  }

  const { user, companyId, isTpsStaff } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServerSupabaseClient();
  let query = supabase
    .from('ivylens_tickets')
    .select('ivylens_ticket_id, company_id')
    .eq('ivylens_ticket_id', ticketId)
    .limit(1);

  if (!isTpsStaff) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query.maybeSingle();
  if (error)  return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  return null;
}

// GET /api/support/tickets/:id: get ticket with conversation
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await assertOwnsTicket(params.id);
  if (denied) return denied;

  const { data, error } = await ivylensRequest(`/tickets/${params.id}`, {
    tags: [IVYLENS_TAGS.TICKET_DETAIL],
  });
  if (error) return NextResponse.json({ error }, { status: 502 });

  return NextResponse.json(data);
}

// POST /api/support/tickets/:id: reply to a ticket
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await assertOwnsTicket(params.id);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  if (!body.message?.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }
  if (typeof body.message !== 'string' || body.message.length > 10_000) {
    return NextResponse.json({ error: 'Message too long' }, { status: 413 });
  }

  const { data, error } = await ivylensRequest(`/tickets/${params.id}/respond`, {
    method: 'POST',
    body: { message: body.message.trim() },
  });

  if (error) return NextResponse.json({ error }, { status: 502 });

  // A new reply changes the detail (responses array) and the list
  // (updated_at). Bust both so subsequent reads see fresh data.
  revalidateTag(IVYLENS_TAGS.TICKET_DETAIL);
  revalidateTag(IVYLENS_TAGS.TICKETS);

  return NextResponse.json(data);
}
