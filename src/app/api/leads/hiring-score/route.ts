import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, score, maxScore, percentage, weakAreas, answers } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    console.log('[Hiring Score Lead]', {
      email, name, score, maxScore, percentage, weakAreas,
      ts: new Date().toISOString(),
    });

    // TODO: Supabase insert + Resend email
    // const supabase = createServerSupabaseClient();
    // await supabase.from('leads').insert({
    //   email, name, source: 'hiring-score',
    //   metadata: { score, maxScore, percentage, weakAreas, answers }
    // });
    //
    // await resend.emails.send({
    //   from: 'Ravello HR <hello@thepeoplesystem.co.uk>',
    //   to: email,
    //   subject: `Your Smart Hiring Score: ${percentage}%`,
    //   html: `<p>Hi ${name},</p><p>Your hiring score is <strong>${percentage}%</strong>...</p>`
    // });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
