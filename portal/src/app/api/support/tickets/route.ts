import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ivylensRequest } from '@/lib/ivylens';

// GET /api/support/tickets — list IvyLens tickets
export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await ivylensRequest<{ tickets: any[] }>('/tickets');
  if (error) return NextResponse.json({ error }, { status: 502 });

  return NextResponse.json(data);
}

// POST /api/support/tickets — create an IvyLens ticket
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { subject, message, category, priority, reference_id, metadata } = body;

  if (!subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 });
  }
  if (message.trim().length < 20) {
    return NextResponse.json({ error: 'Message must be at least 20 characters' }, { status: 400 });
  }

  // Get user context for metadata
  const { data: profile } = await supabase
    .from('profiles').select('company_id, email, full_name').eq('id', user.id).single();

  const { data, error } = await ivylensRequest('/ticket', {
    method: 'POST',
    body: {
      subject: subject.trim(),
      message: message.trim(),
      category,
      priority: priority || 'normal',
      reference_id: reference_id || undefined,
      metadata: {
        ...metadata,
        user_email: profile?.email ?? user.email,
        user_name: profile?.full_name,
      },
    },
  });

  if (error) return NextResponse.json({ error }, { status: 502 });

  // Store local mapping
  if (data?.ticket_id && profile?.company_id) {
    await supabase.from('ivylens_tickets').insert({
      company_id: profile.company_id,
      ivylens_ticket_id: data.ticket_id,
      category,
      subject: subject.trim(),
      priority: priority || 'normal',
      reference_id: reference_id || null,
      created_by: user.id,
    });
  }

  return NextResponse.json(data, { status: 201 });
}
