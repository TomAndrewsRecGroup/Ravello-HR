import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ivylensRequest } from '@/lib/ivylens';

// GET /api/support/tickets/:id — get ticket with conversation
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await ivylensRequest(`/tickets/${params.id}`);
  if (error) return NextResponse.json({ error }, { status: 502 });

  return NextResponse.json(data);
}

// POST /api/support/tickets/:id — reply to a ticket
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.message?.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  const { data, error } = await ivylensRequest(`/tickets/${params.id}/respond`, {
    method: 'POST',
    body: { message: body.message.trim() },
  });

  if (error) return NextResponse.json({ error }, { status: 502 });

  return NextResponse.json(data);
}
