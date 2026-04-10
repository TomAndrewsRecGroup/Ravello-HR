import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, company, checkedItems } = body;

    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

    const supabase = getSupabase();
    if (supabase) {
      await supabase.from('leads').insert({
        email,
        name: name ?? null,
        company: company ?? null,
        source: 'dd_checklist',
        metadata: { checkedItems },
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
