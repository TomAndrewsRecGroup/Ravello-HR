import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ivylensRequest } from '@/lib/ivylens';

/** Strip HTML tags and script content to prevent stored XSS */
function sanitize(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, '')  // remove script blocks
    .replace(/<[^>]*>/g, '')                       // strip remaining HTML tags
    .replace(/on\w+\s*=/gi, '')                    // remove inline event handlers
    .trim();
}

// GET /api/support/tickets — list IvyLens tickets (company-scoped)
export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // ── Company isolation: only return tickets belonging to this user's company ──
  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).single();
  if (!profile?.company_id) {
    return NextResponse.json({ tickets: [] });
  }

  const { data: companyTicketRows } = await supabase
    .from('ivylens_tickets')
    .select('ivylens_ticket_id')
    .eq('company_id', profile.company_id);
  const ownedTicketIds = new Set((companyTicketRows ?? []).map(t => t.ivylens_ticket_id));

  const { data, error } = await ivylensRequest<{ tickets: any[] }>('/tickets');
  if (error) return NextResponse.json({ error }, { status: 502 });

  // Filter to only this company's tickets
  const filtered = (data?.tickets ?? []).filter((t: any) => ownedTicketIds.has(t.id));
  return NextResponse.json({ tickets: filtered });
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

  const cleanSubject = sanitize(subject);
  const cleanMessage = sanitize(message);

  if (cleanMessage.length < 20) {
    return NextResponse.json({ error: 'Message must be at least 20 characters' }, { status: 400 });
  }

  // Get user context for metadata
  const { data: profile } = await supabase
    .from('profiles').select('company_id, email, full_name').eq('id', user.id).single();

  const { data, error } = await ivylensRequest('/ticket', {
    method: 'POST',
    body: {
      subject: cleanSubject,
      message: cleanMessage,
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
      subject: cleanSubject,
      priority: priority || 'normal',
      reference_id: reference_id || null,
      created_by: user.id,
    });
  }

  return NextResponse.json(data, { status: 201 });
}
