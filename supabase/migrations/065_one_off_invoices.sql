-- One-off invoices: separate from monthly retainer subscriptions.
-- Used when a free or paid client buys a single hire (or any
-- ad-hoc fee) outside their package. Issued via Stripe with
-- collection_method=send_invoice; webhook flips status to 'paid'.

create table if not exists one_off_invoices (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid not null references companies(id) on delete cascade,
  package                  text not null check (package in ('HIRE','LEAD','PROTECT','OTHER')),
  description              text not null,
  amount_net_pence         integer not null check (amount_net_pence > 0),
  tax_pence                integer not null default 0 check (tax_pence >= 0),
  total_pence              integer generated always as (amount_net_pence + tax_pence) stored,
  currency                 text not null default 'gbp',
  payment_terms_days       integer not null check (payment_terms_days in (14, 30)),
  invoice_date             date not null,
  due_date                 date not null,
  recipient_user_id        uuid references profiles(id) on delete set null,
  recipient_email          text not null,
  stripe_invoice_id        text unique,
  stripe_invoice_number    text,
  stripe_hosted_url        text,
  stripe_pdf_url           text,
  status                   text not null default 'draft'
    check (status in ('draft','open','paid','void','uncollectible')),
  created_by               uuid references profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  sent_at                  timestamptz,
  paid_at                  timestamptz
);

create index if not exists one_off_invoices_company_idx
  on one_off_invoices (company_id, created_at desc);

create index if not exists one_off_invoices_status_idx
  on one_off_invoices (status);

create index if not exists one_off_invoices_stripe_id_idx
  on one_off_invoices (stripe_invoice_id)
  where stripe_invoice_id is not null;

alter table one_off_invoices enable row level security;

-- Only TPS staff manage these directly; clients see their own row
-- via API routes that use service-role, not direct PostgREST. Keep
-- RLS strict so a leaked anon key can't enumerate billing data.
drop policy if exists one_off_invoices_staff_all on one_off_invoices;
create policy one_off_invoices_staff_all on one_off_invoices
  for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'tps_admin'
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'tps_admin'
    )
  );

drop policy if exists one_off_invoices_client_read on one_off_invoices;
create policy one_off_invoices_client_read on one_off_invoices
  for select
  using (
    company_id in (
      select company_id from profiles where id = auth.uid()
    )
  );
