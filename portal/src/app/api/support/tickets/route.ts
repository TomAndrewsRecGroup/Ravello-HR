import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { ivylensRequest } from '@/lib/ivylens';
import { listCompanyTickets } from '@/lib/support/tickets';

/** Strip HTML tags and script content to prevent stored XSS */
function sanitize(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, '')  // remove script blocks
    .replace(/<[^>]*>/g, '')                       // strip remaining HTML tags
    .replace(/on\w+\s*=/gi, '')                    // remove inline event handlers
    .trim();
}

// GET /api/support/tickets: list IvyLens tickets (company-scoped)
export async function GET() {
  const { tickets, error } = await listCompanyTickets();
  if (error === 'Unauthorized') {
    return NextResponse.json({ error }, { status: 401 });
  }
  if (error) return NextResponse.json({ error }, { status: 502 });
  return NextResponse.json({ tickets });
}

// POST /api/support/tickets: create an IvyLens ticket
export async function POST(req: NextRequest) {
  const { user, companyId } = await getSessionProfile();
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

  const supabase = createServerSupabaseClient();
  // full_name isn't in the session cookie — still need a profiles lookup for it.
  // company_id and user.email come from the cookie.
  const { data: profile } = await supabase
    .from('profiles').select('full_name').eq('id', user.id).single();

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
        user_email: user.email,
        user_name: profile?.full_name,
      },
    },
  });

  if (error) return NextResponse.json({ error }, { status: 502 });

  // Store local mapping
  if (data?.ticket_id && companyId) {
    await supabase.from('ivylens_tickets').insert({
      company_id: companyId,
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
