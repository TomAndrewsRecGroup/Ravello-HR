import { NextRequest, NextResponse } from 'next/server';

// Generic lead capture — used by tools that don't have their own endpoint
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, name, source, company, problemType } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    // Log lead (console in dev; replace with CRM/Supabase/Resend in prod)
    console.log('[Lead]', { email, name, source, company, problemType, ts: new Date().toISOString() });

    // TODO: Insert into Supabase leads table or send via Resend
    // const supabase = createServerSupabaseClient();
    // await supabase.from('leads').insert({ email, name, source, company, problem_type: problemType });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
