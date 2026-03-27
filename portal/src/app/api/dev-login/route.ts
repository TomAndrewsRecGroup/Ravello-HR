import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { email, password } = await request.json();

  if (
    process.env.DEV_ADMIN_EMAIL &&
    process.env.DEV_ADMIN_PASSWORD &&
    email    === process.env.DEV_ADMIN_EMAIL &&
    password === process.env.DEV_ADMIN_PASSWORD
  ) {
    const res = NextResponse.json({ ok: true });
    res.cookies.set('dev_session', '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });
    return res;
  }

  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
}
