import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import Link from 'next/link';
import { BookOpen, ClipboardList, Grid3X3, ChevronRight } from 'lucide-react';

export const metadata: Metadata = { title: 'LEAD' };

export default async function LeadIndexPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).single();
  const companyId = (profile as any)?.company_id;
  if (!companyId) return null;

  const [
    { count: openNeeds },
    { count: pendingReviews },
    { count: skillGaps },
  ] = await Promise.all([
    supabase.from('training_needs').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'open'),
    supabase.from('performance_reviews').select('*', { count: 'exact', head: true }).eq('company_id', companyId).in('status', ['pending', 'in_progress']),
    supabase.from('skills_matrix').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
  ]);

  const sections = [
    {
      href: '/lead/training',
      icon: BookOpen,
      label: 'Training Needs',
      description: 'Flag skill gaps and track L&D plans for your team.',
      stat: openNeeds ?? 0,
      statLabel: 'open needs',
      color: '#D97706',
    },
    {
      href: '/lead/reviews',
      icon: ClipboardList,
      label: 'Performance Reviews',
      description: 'Manage review cycles, track completion and ratings.',
      stat: pendingReviews ?? 0,
      statLabel: 'pending reviews',
      color: 'var(--purple)',
    },
    {
      href: '/lead/skills',
      icon: Grid3X3,
      label: 'Skills Matrix',
      description: 'Map team capabilities and identify development gaps.',
      stat: skillGaps ?? 0,
      statLabel: 'skills tracked',
      color: 'var(--teal)',
    },
  ];

  return (
    <>
      <Topbar title="LEAD" subtitle="People development, performance and capability" />
      <main className="portal-page flex-1">
        <div className="grid sm:grid-cols-3 gap-5">
          {sections.map(({ href, icon: Icon, label, description, stat, statLabel, color }) => (
            <Link
              key={href}
              href={href}
              className="card p-6 flex flex-col gap-4 hover:shadow-md transition-shadow group"
            >
              <div className="flex items-start justify-between">
                <div
                  className="w-10 h-10 rounded-[10px] flex items-center justify-center"
                  style={{ background: `${color}18` }}
                >
                  <Icon size={18} style={{ color }} />
                </div>
                <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--ink-faint)' }} />
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
