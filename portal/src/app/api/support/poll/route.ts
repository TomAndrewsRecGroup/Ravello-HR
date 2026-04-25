import { NextResponse } from 'next/server';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { ivylensRequest } from '@/lib/ivylens';

// GET /api/support/poll: check for ticket updates and create notifications.
//
// Was: per-ticket loop with ~4 sequential round-trips each (1 IvyLens detail
// fetch, 1 local status select, 1 update, 1-2 notification inserts).
// Now: 4 parallel waves total regardless of ticket count.
export async function GET() {
  const { user, companyId } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!companyId) return NextResponse.json({ updated: 0 });

  const supabase = createServerSupabaseClient();
  // ── Step 1: ticket list + last-poll timestamp + owned ticket ids in parallel.
  const pollKey = `ticket_poll_${companyId}`;
  const [{ data: syncRow }, ticketsResult, { data: companyTickets }] = await Promise.all([
    supabase.from('sync_state').select('value').eq('key', pollKey).single(),
    // Poll wants the freshest data — opt out of the 60s default cache.
    ivylensRequest<{ tickets: any[] }>('/tickets', { revalidate: 0 }),
    supabase.from('ivylens_tickets')
      .select('ivylens_ticket_id, status')
      .eq('company_id', companyId),
  ]);

  if (ticketsResult.error || !ticketsResult.data?.tickets) {
    return NextResponse.json({ updated: 0, error: ticketsResult.error });
  }
  const lastPoll = syncRow?.value ? new Date(syncRow.value) : new Date(0);
  const localStatusByTicketId = new Map(
    (companyTickets ?? []).map(t => [t.ivylens_ticket_id, t.status as string]),
  );

  // Filter to tickets that belong to this company and changed since last poll.
  const candidates = ticketsResult.data.tickets.filter(t =>
    localStatusByTicketId.has(t.id) && new Date(t.updated_at) > lastPoll,
  );

  // ── Step 2: claim this poll window (race-condition fix from previous version).
  // If we crash after this, the next poll picks up from this timestamp.
  const pollTimestamp = new Date().toISOString();
  await supabase.from('sync_state').upsert({
    key: pollKey,
    value: pollTimestamp,
    updated_at: pollTimestamp,
  });

  if (candidates.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  // ── Step 3: fetch all ticket details in parallel.
  const detailResults = await Promise.all(
    candidates.map(t => ivylensRequest<{ responses?: any[] }>(`/tickets/${t.id}`, { revalidate: 0 })),
  );

  // ── Step 4: compute updates + notifications client-side, then bulk write.
  const statusUpdates: { id: string; status: string }[] = [];
  const notifications: Array<Record<string, unknown>> = [];

  for (let i = 0; i < candidates.length; i++) {
    const ticket = candidates[i];
    const responses = detailResults[i].data?.responses ?? [];
    const newAdminReplies = responses.filter(
      (r: any) => r.author_type === 'admin' && new Date(r.created_at) > lastPoll,
    );

    if (newAdminReplies.length > 0) {
      notifications.push({
        user_id: user.id,
        company_id: companyId,
        type: 'ivylens_ticket_reply',
        title: `New reply on: ${ticket.subject}`,
        body: newAdminReplies[0].message?.slice(0, 200) ?? 'IvyLens support replied to your ticket.',
        link: `/support/ivylens/${ticket.id}`,
      });
    }

    const localStatus = localStatusByTicketId.get(ticket.id);
    if (localStatus && localStatus !== ticket.status) {
      statusUpdates.push({ id: ticket.id, status: ticket.status });
      if (ticket.status === 'resolved') {
        notifications.push({
          user_id: user.id,
          company_id: companyId,
          type: 'ivylens_ticket_resolved',
          title: `Ticket resolved: ${ticket.subject}`,
          body: 'Your support ticket has been resolved by IvyLens.',
          link: `/support/ivylens/${ticket.id}`,
        });
      }
    }
  }

  // ── Step 5: bulk write notifications + bulk update ivylens_tickets in parallel.
  const updateNow = new Date().toISOString();
  await Promise.all([
    notifications.length > 0
      ? supabase.from('notifications').insert(notifications)
      : Promise.resolve(),
    ...statusUpdates.map(u =>
      supabase.from('ivylens_tickets')
        .update({ status: u.status, updated_at: updateNow })
        .eq('ivylens_ticket_id', u.id),
    ),
  ]);

  return NextResponse.json({ updated: notifications.length });
}
