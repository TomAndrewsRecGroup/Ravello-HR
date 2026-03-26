import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { contentId, companyId, userId } = await req.json();

    if (!contentId || !companyId || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

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
      return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
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
