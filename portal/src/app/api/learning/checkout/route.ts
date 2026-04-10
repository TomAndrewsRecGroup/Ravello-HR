import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createRateLimiter, getRateLimitKey } from '@/lib/rateLimit';

const limiter = createRateLimiter({ windowMs: 60_000, max: 10 }); // 10 checkouts per minute

export async function POST(req: NextRequest) {
  const { allowed } = limiter.check(getRateLimitKey(req));
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  try {
    const { contentId } = await req.json();

    if (!contentId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Derive userId and companyId from the authenticated session — never trust the client
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (!profile?.company_id) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
    }

    const userId = user.id;
    const companyId = profile.company_id;

    // Verify content exists and is published
    const { data: content } = await supabase
      .from('learning_content')
      .select('id, title, price_pence, stripe_price_id')
      .eq('id', contentId)
      .eq('is_published', true)
      .single();

    if (!content) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    // Free content — shouldn't reach here but handle gracefully
    if (content.price_pence === 0 || !content.stripe_price_id) {
      return NextResponse.json({ error: 'Use direct access for free content' }, { status: 400 });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3001';

    // Create Stripe Checkout session
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'payment',
        'line_items[0][price]': content.stripe_price_id,
        'line_items[0][quantity]': '1',
        'success_url': `${baseUrl}/learning/${contentId}?session_id={CHECKOUT_SESSION_ID}`,
        'cancel_url': `${baseUrl}/learning/${contentId}`,
        'metadata[content_id]': contentId,
        'metadata[company_id]': companyId,
        'metadata[user_id]': userId,
        'payment_intent_data[metadata][content_id]': contentId,
        'payment_intent_data[metadata][company_id]': companyId,
      }),
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error('Stripe error:', session);
      return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 502 });
    }

    // Create a pending purchase record
    await supabase.from('learning_purchases').insert({
      content_id:       contentId,
      company_id:       companyId,
      purchased_by:     userId,
      stripe_session_id: session.id,
      amount_pence:     content.price_pence,
      status:           'pending',
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
