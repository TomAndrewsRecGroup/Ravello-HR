import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, company, checkedItems } = body;
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });
    console.log('[DD Checklist Lead]', { email, name, company, checkedItems, ts: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
