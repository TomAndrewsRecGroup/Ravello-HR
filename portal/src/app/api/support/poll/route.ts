import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ivylensRequest } from '@/lib/ivylens';

// GET /api/support/poll — check for ticket updates and create notifications
export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).single();
  if (!profile?.company_id) return NextResponse.json({ updated: 0 });

  // Get last poll timestamp
  const pollKey = `ticket_poll_${profile.company_id}`;
  const { data: syncRow } = await supabase
    .from('sync_state').select('value').eq('key', pollKey).single();
  const lastPoll = syncRow?.value ? new Date(syncRow.value) : new Date(0);

  // Fetch tickets from IvyLens
  const { data: ticketData, error } = await ivylensRequest<{ tickets: any[] }>('/tickets');
  if (error || !ticketData?.tickets) return NextResponse.json({ updated: 0, error });

  let newNotifications = 0;

  for (const ticket of ticketData.tickets) {
    const updatedAt = new Date(ticket.updated_at);
    if (updatedAt <= lastPoll) continue;

    // Check if this ticket has new admin responses
    const { data: detail } = await ivylensRequest(`/tickets/${ticket.id}`);
    const responses = detail?.responses ?? [];
    const newAdminReplies = responses.filter(
      (r: any) => r.author_type === 'admin' && new Date(r.created_at) > lastPoll,
    );

    if (newAdminReplies.length > 0) {
      await supabase.from('notifications').insert({
        user_id: user.id,
        company_id: profile.company_id,
        type: 'ivylens_ticket_reply',
        title: `New reply on: ${ticket.subject}`,
        body: newAdminReplies[0].message?.slice(0, 200) ?? 'IvyLens support replied to your ticket.',
        link: `/support/ivylens/${ticket.id}`,
      });
      newNotifications++;
    }

    // Check for status changes
    const { data: localTicket } = await supabase
      .from('ivylens_tickets')
      .select('status')
      .eq('ivylens_ticket_id', ticket.id)
      .single();

    if (localTicket && localTicket.status !== ticket.status) {
      await supabase
        .from('ivylens_tickets')
        .update({ status: ticket.status, updated_at: new Date().toISOString() })
        .eq('ivylens_ticket_id', ticket.id);

      if (ticket.status === 'resolved') {
        await supabase.from('notifications').insert({
          user_id: user.id,
          company_id: profile.company_id,
          type: 'ivylens_ticket_resolved',
          title: `Ticket resolved: ${ticket.subject}`,
          body: 'Your support ticket has been resolved by IvyLens.',
          link: `/support/ivylens/${ticket.id}`,
        });
        newNotifications++;
      }
    }
  }

  // Update poll timestamp
  await supabase.from('sync_state').upsert({
    key: pollKey,
    value: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({ updated: newNotifications });
}
