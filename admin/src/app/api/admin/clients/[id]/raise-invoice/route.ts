import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { revalidateTag } from 'next/cache';
import { raiseOneOffInvoice, stripeConfigured, createCustomer } from '@/lib/stripe';
import { assertBodySize } from '@/lib/http/bodySize';

export const runtime = 'nodejs';

const PACKAGES = ['HIRE', 'LEAD', 'PROTECT', 'OTHER'] as const;
const TERMS    = [14, 30] as const;
type PackageLabel = typeof PACKAGES[number];
type TermsDays    = typeof TERMS[number];

function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service-role config missing');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Stripe is not configured on this environment.' }, { status: 503 });
  }

  const tooBig = assertBodySize(req, 16 * 1024);
  if (tooBig) return tooBig;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const pkg              = body.package as PackageLabel;
  const description      = (body.description ?? '').toString().trim();
  const amountNetPounds  = Number(body.amount_net);
  const paymentTermsDays = Number(body.payment_terms_days) as TermsDays;
  const invoiceDateStr   = (body.invoice_date ?? '').toString();
  const recipientUserId  = (body.recipient_user_id ?? '').toString().trim() || null;

  if (!PACKAGES.includes(pkg)) {
    return NextResponse.json({ error: 'Invalid package.' }, { status: 400 });
  }
  if (!description || description.length > 500) {
    return NextResponse.json({ error: 'Description is required (max 500 chars).' }, { status: 400 });
  }
  if (!Number.isFinite(amountNetPounds) || amountNetPounds <= 0 || amountNetPounds > 1_000_000) {
    return NextResponse.json({ error: 'Amount must be a positive number.' }, { status: 400 });
  }
  if (!TERMS.includes(paymentTermsDays)) {
    return NextResponse.json({ error: 'Payment terms must be 14 or 30 days.' }, { status: 400 });
  }
  const invoiceDate = new Date(invoiceDateStr);
  if (Number.isNaN(invoiceDate.getTime())) {
    return NextResponse.json({ error: 'Invoice date is invalid.' }, { status: 400 });
  }
  if (!recipientUserId) {
    return NextResponse.json({ error: 'Pick a recipient.' }, { status: 400 });
  }

  const amountNetPence = Math.round(amountNetPounds * 100);
  const dueDate = new Date(invoiceDate);
  dueDate.setDate(dueDate.getDate() + paymentTermsDays);

  const sb = adminSupabase();

  // Resolve company + recipient.
  const [{ data: company, error: companyErr }, { data: recipient, error: recipientErr }] =
    await Promise.all([
      sb.from('companies')
        .select('id, name, contact_email, stripe_customer_id')
        .eq('id', params.id)
        .single(),
      sb.from('profiles')
        .select('id, email, full_name, company_id')
        .eq('id', recipientUserId)
        .single(),
    ]);

  if (companyErr || !company) {
    return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
  }
  if (recipientErr || !recipient) {
    return NextResponse.json({ error: 'Recipient not found.' }, { status: 404 });
  }
  if (recipient.company_id !== company.id) {
    return NextResponse.json({ error: 'Recipient does not belong to this client.' }, { status: 400 });
  }
  if (!recipient.email) {
    return NextResponse.json({ error: 'Recipient has no email on file.' }, { status: 400 });
  }

  // Ensure a Stripe customer exists. Free clients may not have one.
  let customerId = company.stripe_customer_id as string | null;
  if (!customerId) {
    customerId = await createCustomer({
      companyName:       company.name,
      contactEmail:      recipient.email,
      metadataCompanyId: company.id,
    });
    await sb.from('companies').update({ stripe_customer_id: customerId }).eq('id', company.id);
  }

  // Authenticated admin id (for created_by). The route is gated by
  // the admin app's auth layer; service-role inside the route bypasses
  // RLS but we still want to attribute the row to the operator.
  const createdBy = req.headers.get('x-tps-admin-id') || null;

  let stripeRes: Awaited<ReturnType<typeof raiseOneOffInvoice>>;
  try {
    stripeRes = await raiseOneOffInvoice({
      customerId,
      recipientEmail:   recipient.email,
      description,
      amountNetPence,
      paymentTermsDays,
      invoiceDate,
      dueDate,
      packageLabel:     pkg,
      companyId:        company.id,
    });
  } catch (e: any) {
    console.error('[raise-invoice] Stripe failed:', e?.message);
    return NextResponse.json({ error: `Stripe rejected the invoice: ${e?.message ?? 'unknown error'}` }, { status: 502 });
  }

  const { error: insertErr } = await sb.from('one_off_invoices').insert({
    company_id:            company.id,
    package:               pkg,
    description,
    amount_net_pence:      amountNetPence,
    tax_pence:             stripeRes.taxPence,
    payment_terms_days:    paymentTermsDays,
    invoice_date:          invoiceDate.toISOString().slice(0, 10),
    due_date:              dueDate.toISOString().slice(0, 10),
    recipient_user_id:     recipient.id,
    recipient_email:       recipient.email,
    stripe_invoice_id:     stripeRes.stripeInvoiceId,
    stripe_invoice_number: stripeRes.invoiceNumber,
    stripe_hosted_url:     stripeRes.hostedUrl,
    stripe_pdf_url:        stripeRes.pdfUrl,
    status:                'open',
    created_by:            createdBy,
    sent_at:               new Date().toISOString(),
  });

  if (insertErr) {
    // Stripe invoice is already issued at this point — don't try to
    // void it, just surface the row failure so admin can reconcile
    // manually. The webhook will still flip status on payment.
    console.error('[raise-invoice] DB insert failed (Stripe invoice was sent):', insertErr.message);
    return NextResponse.json({
      error:        `Invoice sent in Stripe but failed to record locally: ${insertErr.message}`,
      stripe_url:   stripeRes.hostedUrl,
      stripe_id:    stripeRes.stripeInvoiceId,
    }, { status: 207 });
  }

  revalidateTag(`client:${company.id}`);

  return NextResponse.json({
    ok:                  true,
    stripe_invoice_id:   stripeRes.stripeInvoiceId,
    stripe_invoice_url:  stripeRes.hostedUrl,
    stripe_pdf_url:      stripeRes.pdfUrl,
    invoice_number:      stripeRes.invoiceNumber,
    tax_pence:           stripeRes.taxPence,
  });
}
