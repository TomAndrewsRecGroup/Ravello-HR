import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { createBillingPortalSession, stripeConfigured } from '@/lib/stripe';

export const runtime = 'nodejs';

// POST /api/billing/portal-session
//
// Mints a Stripe-hosted Billing Portal session for the caller's company
// and returns the URL. The client redirects the browser to it. Stripe
// handles card updates, invoice list, receipt download, etc., and
// returns the user back to /billing afterwards.
//
// Auth: super-user only (role === 'client_admin'). Editors and viewers
// don't get a portal session — they can't change payment state.

export async function POST(request: NextRequest) {
  const { user, role, companyId, isTpsStaff } = await getSessionProfile();

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  if (!isTpsStaff && role !== 'client_admin') {
    return NextResponse.json(
      { error: 'Only the company Admin can manage billing.' },
      { status: 403 },
    );
  }
  if (!companyId) {
    return NextResponse.json(
      { error: 'Your account is not linked to a company.' },
      { status: 400 },
    );
  }
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: 'Billing is not configured on the server.' },
      { status: 500 },
    );
  }

  const supabase = createServerSupabaseClient();
  const { data: company, error } = await supabase
    .from('companies')
    .select('stripe_customer_id')
    .eq('id', companyId)
    .single();

  if (error || !company) {
    return NextResponse.json({ error: 'Could not load company.' }, { status: 500 });
  }
  if (!company.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No Stripe customer is linked to this company yet. Please contact your account manager.' },
      { status: 400 },
    );
  }

  // Build an absolute return URL that points back at /billing.
  // request.nextUrl.origin gives the right host for both preview + prod.
  const returnUrl = `${request.nextUrl.origin}/billing`;

  try {
    const url = await createBillingPortalSession(company.stripe_customer_id, returnUrl);
    return NextResponse.json({ url });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Stripe portal session failed: ${e?.message ?? 'unknown error'}` },
      { status: 500 },
    );
  }
}
