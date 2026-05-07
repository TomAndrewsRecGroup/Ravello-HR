'use client';

import { useState, useEffect } from 'react';
import { Loader2, FileText, ExternalLink, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const PACKAGES = ['HIRE', 'LEAD', 'PROTECT', 'OTHER'] as const;
type PackageLabel = typeof PACKAGES[number];

interface User {
  id:         string;
  email:      string | null;
  full_name:  string | null;
  role:       string | null;
}

interface Invoice {
  id:                    string;
  package:               PackageLabel;
  description:           string;
  amount_net_pence:      number;
  tax_pence:             number;
  total_pence:           number;
  payment_terms_days:    number;
  invoice_date:          string;
  due_date:              string;
  recipient_email:       string;
  status:                string;
  stripe_invoice_number: string | null;
  stripe_hosted_url:     string | null;
  created_at:            string;
  paid_at:               string | null;
}

interface Props {
  companyId: string;
  users:     User[];
}

function statusBadge(status: string): React.CSSProperties {
  switch (status) {
    case 'paid':         return { background: 'rgba(52,211,153,0.14)', color: 'var(--emerald)' };
    case 'open':         return { background: 'rgba(59,111,255,0.10)', color: 'var(--blue)' };
    case 'void':         return { background: 'rgba(7,11,29,0.07)',    color: 'var(--ink-soft)' };
    case 'uncollectible':return { background: 'rgba(217,68,68,0.10)',  color: 'var(--rose)' };
    default:             return { background: 'rgba(245,158,11,0.15)', color: 'var(--amber)' };
  }
}

function fmtGbp(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function InvoicesTab({ companyId, users }: Props) {
  const sb = createClient();

  const [invoices,    setInvoices]    = useState<Invoice[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [success,     setSuccess]     = useState<string | null>(null);

  // Form state
  const [pkg,             setPkg]             = useState<PackageLabel>('HIRE');
  const [description,     setDescription]     = useState('');
  const [amountNet,       setAmountNet]       = useState('');
  const [terms,           setTerms]           = useState<14 | 30>(14);
  const [invoiceDate,     setInvoiceDate]     = useState(todayIso());
  const [recipientUserId, setRecipientUserId] = useState(users[0]?.id ?? '');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await sb
        .from('one_off_invoices')
        .select('id,package,description,amount_net_pence,tax_pence,total_pence,payment_terms_days,invoice_date,due_date,recipient_email,status,stripe_invoice_number,stripe_hosted_url,created_at,paid_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (!cancelled) {
        setInvoices((data as Invoice[]) ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, sb]);

  // Derived: due date preview
  const dueDatePreview = (() => {
    const d = new Date(invoiceDate);
    if (Number.isNaN(d.getTime())) return '—';
    d.setDate(d.getDate() + terms);
    return d.toISOString().slice(0, 10);
  })();

  // Derived: VAT preview
  const netNumber = Number(amountNet);
  const vatPreview  = Number.isFinite(netNumber) && netNumber > 0 ? netNumber * 0.20 : 0;
  const totalPreview = (Number.isFinite(netNumber) ? netNumber : 0) + vatPreview;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/admin/clients/${companyId}/raise-invoice`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          package:            pkg,
          description,
          amount_net:         netNumber,
          payment_terms_days: terms,
          invoice_date:       invoiceDate,
          recipient_user_id:  recipientUserId,
        }),
      });
      const json = await res.json();
      if (!res.ok && res.status !== 207) {
        throw new Error(json.error ?? 'Failed to raise invoice.');
      }
      setSuccess(`Invoice ${json.invoice_number ?? ''} sent to ${users.find(u => u.id === recipientUserId)?.email ?? 'client'}.`);
      setShowForm(false);
      setDescription('');
      setAmountNet('');

      // Refresh list
      const { data } = await sb
        .from('one_off_invoices')
        .select('id,package,description,amount_net_pence,tax_pence,total_pence,payment_terms_days,invoice_date,due_date,recipient_email,status,stripe_invoice_number,stripe_hosted_url,created_at,paid_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      setInvoices((data as Invoice[]) ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Failed to raise invoice.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-semibold" style={{ color: 'var(--ink)' }}>One-off invoices</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
            Raised separately from the monthly retainer. 20% VAT added automatically.
          </p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn-cta btn-sm flex items-center gap-1.5">
            <Plus size={13} /> Raise Invoice
          </button>
        )}
      </div>

      {success && (
        <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(52,211,153,0.10)', color: 'var(--emerald)', border: '1px solid rgba(52,211,153,0.20)' }}>
          {success}
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Package</label>
              <select className="input" value={pkg} onChange={e => setPkg(e.target.value as PackageLabel)} required>
                {PACKAGES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Recipient</label>
              <select
                className="input"
                value={recipientUserId}
                onChange={e => setRecipientUserId(e.target.value)}
                required
              >
                {users.length === 0 && <option value="">No users on this client</option>}
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.full_name ?? u.email ?? u.id} {u.email ? `· ${u.email}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Description</label>
            <textarea
              className="input"
              rows={3}
              maxLength={500}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Senior Account Manager — one-off hire fee"
              required
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Amount net (£)</label>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={amountNet}
                onChange={e => setAmountNet(e.target.value)}
                placeholder="1000.00"
                required
              />
            </div>
            <div>
              <label className="label">VAT (20%)</label>
              <input className="input" value={fmtGbp(Math.round(vatPreview * 100))} disabled />
            </div>
            <div>
              <label className="label">Total</label>
              <input className="input" value={fmtGbp(Math.round(totalPreview * 100))} disabled style={{ fontWeight: 600 }} />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Invoice date</label>
              <input
                className="input"
                type="date"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Payment terms</label>
              <select className="input" value={terms} onChange={e => setTerms(Number(e.target.value) as 14 | 30)} required>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
            </div>
            <div>
              <label className="label">Due date</label>
              <input className="input" value={dueDatePreview} disabled />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(217,68,68,0.08)', color: 'var(--rose)', border: '1px solid rgba(217,68,68,0.20)' }}>
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
            <button type="button" onClick={() => { setShowForm(false); setError(null); }} className="btn-ghost btn-sm" disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-cta btn-sm flex items-center gap-1.5" disabled={submitting || users.length === 0}>
              {submitting && <Loader2 size={13} className="animate-spin" />}
              Send invoice via Stripe
            </button>
          </div>
        </form>
      )}

      {/* Invoice list */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--ink-faint)' }}>
            <Loader2 size={16} className="animate-spin inline mr-2" /> Loading invoices…
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center">
            <FileText size={24} className="mx-auto mb-2" style={{ color: 'var(--ink-faint)' }} />
            <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No invoices raised yet.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Package</th>
                  <th>Description</th>
                  <th>Recipient</th>
                  <th>Invoice date</th>
                  <th>Due</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{inv.stripe_invoice_number ?? '—'}</td>
                    <td><span className="badge">{inv.package}</span></td>
                    <td style={{ maxWidth: 240 }}>
                      <div className="truncate text-sm">{inv.description}</div>
                    </td>
                    <td className="text-xs">{inv.recipient_email}</td>
                    <td className="text-xs">{inv.invoice_date}</td>
                    <td className="text-xs">{inv.due_date}</td>
                    <td style={{ fontWeight: 600 }}>{fmtGbp(inv.total_pence)}</td>
                    <td><span className="badge" style={statusBadge(inv.status)}>{inv.status}</span></td>
                    <td>
                      {inv.stripe_hosted_url && (
                        <a
                          href={inv.stripe_hosted_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs flex items-center gap-1"
                          style={{ color: 'var(--purple)' }}
                        >
                          View <ExternalLink size={11} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
