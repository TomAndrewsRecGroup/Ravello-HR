import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import Link from 'next/link';
import { FileText, Calendar, BarChart3, ChevronRight, AlertTriangle } from 'lucide-react';

export const metadata: Metadata = { title: 'PROTECT' };

export default async function ProtectIndexPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).single();
  const companyId = (profile as any)?.company_id;
  if (!companyId) return null;

  const [
    { count: empDocCount },
    { count: expiredDocs },
    { count: absencePending },
    { count: metricsCount },
  ] = await Promise.all([
    supabase.from('employee_documents').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'active'),
    supabase.from('employee_documents').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'expired'),
    supabase.from('absence_records').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'pending'),
    supabase.from('hr_metrics').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
  ]);

  const sections = [
    {
      href: '/protect/employee-docs',
      icon: FileText,
      label: 'Employee Documents',
      description: 'Contracts, right to work, DBS checks, visas and more.',
      stat: empDocCount ?? 0,
      statLabel: 'active documents',
      alert: (expiredDocs ?? 0) > 0,
      alertText: `${expiredDocs} expired`,
      color: 'var(--purple)',
    },
    {
      href: '/protect/absence',
      icon: Calendar,
      label: 'Absence Records',
      description: 'Holiday, sickness, maternity and leave management.',
      stat: absencePending ?? 0,
      statLabel: 'pending approval',
      alert: (absencePending ?? 0) > 0,
      alertText: `${absencePending} pending`,
      color: '#D97706',
    },
    {
      href: '/protect/hr-dashboard',
      icon: BarChart3,
      label: 'HR Dashboard',
      description: 'Headcount, turnover, absence rates and diversity metrics.',
      stat: metricsCount ?? 0,
      statLabel: 'periods tracked',
      alert: false,
      alertText: '',
      color: 'var(--teal)',
    },
  ];

  return (
    <>
      <Topbar title="PROTECT" subtitle="Employee records, absence and HR metrics" />
      <main className="portal-page flex-1">
        <div className="grid sm:grid-cols-3 gap-5">
          {sections.map(({ href, icon: Icon, label, description, stat, statLabel, alert, alertText, color }) => (
            <Link
              key={href}
              href={href}
              className="card p-6 flex flex-col gap-4 hover:shadow-md transition-shadow group"
              style={alert ? { borderLeft: '3px solid #DC2626' } : {}}
            >
              <div className="flex items-start justify-between">
                <div
                  className="w-10 h-10 rounded-[10px] flex items-center justify-center"
                  style={{ background: `${color}18` }}
                >
                  <Icon size={18} style={{ color }} />
                </div>
                <div className="flex items-center gap-2">
                  {alert && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(220,38,38,0.1)', color: '#DC2626' }}>
                      <AlertTriangle size={10} /> {alertText}
                    </span>
                  )}
                  <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--ink-faint)' }} />
                </div>
              </div>
              <div>
                <p className="font-display font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>{label}</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{description}</p>
              </div>
              <div className="mt-auto">
                <span className="text-2xl font-bold" style={{ color }}>{stat}</span>
                <span className="text-xs ml-1.5" style={{ color: 'var(--ink-faint)' }}>{statLabel}</span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
