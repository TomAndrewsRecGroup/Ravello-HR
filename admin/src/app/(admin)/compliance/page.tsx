import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, ShieldCheck, FileText, ExternalLink } from 'lucide-react';

export const metadata: Metadata = { title: 'Compliance Dashboard' };
export const revalidate = 30;

function ragFromDays(daysUntil: number, status: string): 'red' | 'amber' | 'green' | 'complete' {
  if (status === 'complete') return 'complete';
  if (daysUntil < 0) return 'red';
  if (daysUntil <= 30) return 'amber';
  return 'green';
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const RAG_STYLE = {
  red:      { bg: 'rgba(220,38,38,0.08)',  border: 'rgba(220,38,38,0.2)',  badge: 'var(--danger)', badgeBg: 'rgba(220,38,38,0.1)',  icon: AlertTriangle, label: 'Overdue'       },
  amber:    { bg: 'rgba(217,119,6,0.06)',  border: 'rgba(217,119,6,0.2)',  badge: 'var(--amber)', badgeBg: 'rgba(217,119,6,0.1)',  icon: Clock,         label: 'Due Soon'      },
  green:    { bg: 'rgba(22,163,74,0.05)',  border: 'rgba(22,163,74,0.15)', badge: 'var(--success)', badgeBg: 'rgba(22,163,74,0.1)',  icon: ShieldCheck,   label: 'On Track'      },
  complete: { bg: 'rgba(148,163,184,0.04)',border: 'rgba(148,163,184,0.1)',badge: '#94A3B8', badgeBg: 'rgba(148,163,184,0.1)',icon: CheckCircle2,  label: 'Complete'      },
};

export default async function AdminComplianceDashboard() {
  const supabase = createServerSupabaseClient();

  const [
    { data: rawItems },
    { data: rawEmpDocs },
    { data: companies },
  ] = await Promise.all([
    supabase
      .from('compliance_items')
      .select('*, companies(id, name)')
      .order('due_date', { ascending: true }),
    supabase
      .from('employee_documents')
      .select('*, companies(id, name)')
      .not('expiry_date', 'is', null)
      .in('status', ['active', 'expired', 'pending_renewal'])
      .order('expiry_date', { ascending: true }),
    supabase
      .from('companies')
      .select('id, name')
      .eq('active', true)
      .order('name'),
  ]);

  const now = Date.now();

  const items = (rawItems ?? []).map((ci: any) => {
    const daysUntil = ci.due_date
      ? Math.ceil((new Date(ci.due_date).getTime() - now) / 86400000)
      : 0;
    return {
      ...ci,
      daysUntil,
      rag: ragFromDays(daysUntil, ci.status),
      companyName: ci.companies?.name ?? '—',
      companyId:   ci.companies?.id ?? '',
    };
  });

  const empDocs = (rawEmpDocs ?? []).map((d: any) => {
    const daysUntil = d.expiry_date
      ? Math.ceil((new Date(d.expiry_date).getTime() - now) / 86400000)
      : 0;
    const docStatus = daysUntil < 0 ? 'complete' : ragFromDays(daysUntil, '');
    return {
      ...d,
      daysUntil,
      rag: d.status === 'expired' ? 'red' : docStatus,
      companyName: d.companies?.name ?? '—',
      companyId:   d.companies?.id ?? '',
    };
  });

  // Stats
  const compItems = {
    red:      items.filter(i => i.rag === 'red').length,
    amber:    items.filter(i => i.rag === 'amber').length,
    green:    items.filter(i => i.rag === 'green').length,
    complete: items.filter(i => i.rag === 'complete').length,
  };
  const docItems = {
    red:   empDocs.filter(d => d.rag === 'red').length,
    amber: empDocs.filter(d => d.rag === 'amber').length,
  };

  // Priority: red first, then amber, then green, then complete
  const ragOrder = { red: 0, amber: 1, green: 2, complete: 3 };
  const sortedItems   = [...items].sort((a, b) => (ragOrder[a.rag as keyof typeof ragOrder] ?? 9) - (ragOrder[b.rag as keyof typeof ragOrder] ?? 9));
  const sortedEmpDocs = [...empDocs].sort((a, b) => (ragOrder[a.rag as keyof typeof ragOrder] ?? 9) - (ragOrder[b.rag as keyof typeof ragOrder] ?? 9));

  return (
    <>
      <AdminTopbar
        title="Compliance Dashboard"
        subtitle="RAG status across all active clients"
      />
      <main className="admin-page flex-1 space-y-8">

        {/* ── Summary cards ──────────────────────────────── */}
        <div className="grid sm:grid-cols-4 gap-4">
          {[
            { ...RAG_STYLE.red,      label: 'Overdue',    value: compItems.red      },
            { ...RAG_STYLE.amber,    label: 'Due ≤30d',   value: compItems.amber    },
            { ...RAG_STYLE.green,    label: 'On Track',   value: compItems.green    },
            { ...RAG_STYLE.complete, label: 'Complete',   value: compItems.complete },
          ].map(({ label, value, bg, border, badge, icon: Icon }) => (
            <div key={label} className="rounded-[12px] p-5" style={{ background: bg, border: `1px solid ${border}` }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>{label}</p>
                <Icon size={14} style={{ color: badge }} />
              </div>
              <p className="text-3xl font-bold" style={{ color: badge }}>{value}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>compliance items</p>
            </div>
          ))}
        </div>

        {/* ── Document expiry alerts ─────────────────────── */}
        {(docItems.red + docItems.amber) > 0 && (
          <div>
            <h2 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>
              Employee Document Expiry Alerts
              <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: 'rgba(220,38,38,0.1)', color: 'var(--rose)' }}>
                {docItems.red} expired · {docItems.amber} expiring soon
              </span>
            </h2>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Employee</th>
                    <th>Document</th>
                    <th>Type</th>
                    <th>Expiry Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEmpDocs.filter(d => d.rag === 'red' || d.rag === 'amber').map((d: any) => {
                    const ragCfg = RAG_STYLE[d.rag as keyof typeof RAG_STYLE];
                    const RagIcon = ragCfg.icon;
                    return (
                      <tr key={d.id}>
                        <td>
                          <Link href={`/clients/${d.companyId}`} className="font-medium text-sm hover:underline" style={{ color: 'var(--purple)' }}>
                            {d.companyName}
                          </Link>
                        </td>
                        <td>
                          <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{d.employee_name}</p>
                          {d.department && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{d.department}</p>}
                        </td>
                        <td>
                          {d.file_url ? (
                            <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--purple)' }}>
                              {d.title} <ExternalLink size={10} />
                            </a>
                          ) : (
                            <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{d.title}</span>
                          )}
                        </td>
                        <td style={{ color: 'var(--ink-soft)' }} className="capitalize text-sm">{d.doc_type?.replace(/_/g, ' ')}</td>
                        <td>
                          <p className="text-sm" style={{ color: d.rag === 'red' ? 'var(--rose)' : 'var(--amber)', fontWeight: 600 }}>
                            {fmtDate(d.expiry_date)}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                            {d.daysUntil < 0 ? `${Math.abs(d.daysUntil)}d overdue` : `${d.daysUntil}d remaining`}
                          </p>
                        </td>
                        <td>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: ragCfg.badgeBg, color: ragCfg.badge }}>
                            <RagIcon size={10} /> {ragCfg.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Compliance items table ─────────────────────── */}
        <div>
          <h2 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>
            All Compliance Items
            <span className="ml-2 text-xs font-normal" style={{ color: 'var(--ink-faint)' }}>({items.length} total)</span>
          </h2>

          {items.length === 0 ? (
            <div className="card empty-state">
              <ShieldCheck size={24} />
              <p className="text-sm">No compliance items found.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th>RAG</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((ci: any) => {
                    const ragCfg = RAG_STYLE[ci.rag as keyof typeof RAG_STYLE];
                    const RagIcon = ragCfg.icon;
                    return (
                      <tr key={ci.id}>
                        <td>
                          <Link href={`/clients/${ci.companyId}`} className="font-medium text-sm hover:underline" style={{ color: 'var(--purple)' }}>
                            {ci.companyName}
                          </Link>
                        </td>
                        <td>
                          <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{ci.title}</p>
                          {ci.description && <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{ci.description}</p>}
                        </td>
                        <td style={{ color: 'var(--ink-soft)' }} className="capitalize text-sm">{ci.category?.replace(/_/g, ' ')}</td>
                        <td>
                          <p className="text-sm" style={{ color: ci.rag === 'red' ? 'var(--rose)' : ci.rag === 'amber' ? 'var(--amber)' : 'var(--ink-soft)', fontWeight: ci.rag === 'red' || ci.rag === 'amber' ? 600 : 400 }}>
                            {fmtDate(ci.due_date)}
                          </p>
                          {ci.rag !== 'complete' && (
                            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                              {ci.daysUntil < 0 ? `${Math.abs(ci.daysUntil)}d overdue` : `${ci.daysUntil}d`}
                            </p>
                          )}
                        </td>
                        <td>
                          <span
                            className="text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize"
                            style={
                              ci.status === 'complete'  ? { background: 'rgba(148,163,184,0.1)', color: 'var(--slate)' } :
                              ci.status === 'overdue'   ? { background: 'rgba(220,38,38,0.1)',   color: 'var(--rose)' } :
                              ci.status === 'in_review' ? { background: 'rgba(217,119,6,0.1)',   color: 'var(--amber)' } :
                              { background: 'rgba(59,111,255,0.1)', color: 'var(--blue)' }
                            }
                          >
                            {ci.status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: ragCfg.badgeBg, color: ragCfg.badge }}>
                            <RagIcon size={10} /> {ragCfg.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </main>
    </>
  );
}
