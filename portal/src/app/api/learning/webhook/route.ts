import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!webhookSecret || !stripeKey) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  // Verify webhook signature using Stripe's raw verification
  let event: any;
  try {
    // Simple HMAC verification without the Stripe SDK
    const crypto = await import('crypto');
    const parts = sig.split(',');
    const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1];
    const v1 = parts.find(p => p.startsWith('v1='))?.split('=')[1];

    if (!timestamp || !v1) {
      return NextResponse.json({ error: 'Invalid signature format' }, { status: 400 });
    }

    const signedPayload = `${timestamp}.${body}`;
    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload)
      .digest('hex');

    if (expectedSig !== v1) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    event = JSON.parse(body);
  } catch (err) {
    return NextResponse.json({ error: 'Webhook verification failed' }, { status: 400 });
  }

  // Use service role for webhook operations
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { content_id, company_id, user_id } = session.metadata ?? {};

    if (!content_id || !company_id) {
      return NextResponse.json({ received: true });
    }

    // Activate the purchase — 7 days from now
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();

    await supabase
      .from('learning_purchases')
      .update({
        status:                'active',
        stripe_payment_intent: session.payment_intent,
        access_expires_at:     expiresAt,
        updated_at:            new Date().toISOString(),
      })
      .eq('stripe_session_id', session.id);
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    const paymentIntent = charge.payment_intent;

    if (paymentIntent) {
      await supabase
        .from('learning_purchases')
        .update({ status: 'refunded', updated_at: new Date().toISOString() })
        .eq('stripe_payment_intent', paymentIntent);
    }
  }

  return NextResponse.json({ received: true });
}
