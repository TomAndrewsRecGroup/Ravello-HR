import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, score, percentage, gaps } = body;
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });
    console.log('[Policy Healthcheck Lead]', { email, name, score, percentage, gaps, ts: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
