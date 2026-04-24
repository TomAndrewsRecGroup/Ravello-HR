import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { getPublicSupabase } from '@/lib/supabase/server';
import FeaturedCarousel from './FeaturedCarousel';
import UpdateCard, { type UpdateItem } from './UpdateCard';

export const metadata: Metadata = {
  title: 'Latest Updates | HR News and Insight | The People System',
  description:
    'A live feed of HR news, policy updates, workforce data and practical guidance from across the industry, curated by The People System.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/latest-updates' },
};

export const revalidate = 300;

const SELECT = 'id, source_url, title, description, image_url, site_name, published_at, created_at, source_type, render_mode, embed_html';

export default async function LatestUpdatesPage() {
  const supabase = getPublicSupabase();

  const [featuredRes, mainRes] = supabase
    ? await Promise.all([
        supabase
          .from('latest_updates')
          .select(SELECT)
          .eq('status', 'published')
          .eq('featured', true)
          .order('featured_order', { ascending: true, nullsFirst: false })
          .order('published_at', { ascending: false, nullsFirst: false })
          .limit(12),
        supabase
          .from('latest_updates')
          .select(SELECT)
          .eq('status', 'published')
          .order('published_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(60),
      ])
    : [{ data: [] }, { data: [] }];

  const featured = (featuredRes?.data ?? []) as UpdateItem[];
  const main = (mainRes?.data ?? []) as UpdateItem[];

  return (
    <div className="pt-28">

      {/* Hero */}
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '5rem', paddingBottom: '3rem' }}>
        <div className="max-w-4xl mx-auto">
          <p className="eyebrow mb-5">
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
            Latest Updates
          </p>
          <h1
            className="font-display mb-5"
            style={{
              fontSize: 'clamp(2.8rem, 5.5vw, 5rem)',
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: '-0.04em',
              color: 'var(--ink)',
            }}
          >
            HR news that actually <span className="text-gradient">matters</span>
          </h1>
          <p className="text-lg leading-relaxed max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
            A curated live feed of HR news, policy changes, workforce data and practical guidance. Pulled from the sources we actually read.
          </p>
        </div>
      </section>

      {/* Featured carousel */}
      {featured.length > 0 && <FeaturedCarousel items={featured} />}

      {/* Main feed */}
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: featured.length > 0 ? '2rem' : '3rem' }}>
        <div className="container-wide">

          {main.length > 0 ? (
            <>
              <div className="mb-8">
                <h2 className="font-display section-title" style={{ marginBottom: 0 }}>All updates</h2>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {main.map(item => <UpdateCard key={item.id} item={item} variant="grid" />)}
              </div>
            </>
          ) : (
            <div className="card max-w-xl mx-auto text-center py-10">
              <BookOpen className="mx-auto mb-3" size={32} style={{ color: 'var(--ink-faint)' }} />
              <p className="font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>
                Nothing here yet
              </p>
              <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                New entries will appear here as they&apos;re published.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="section-padding" style={{ background: 'var(--brand-navy)' }}>
        <div className="container-narrow text-center">
          <h2 className="text-3xl font-bold mb-4">
            Want advice tailored to your business?
          </h2>
          <p className="text-white/70 text-lg mb-8 max-w-lg mx-auto">
            Book 15 minutes with Lucy. Bring your specific situation and leave with a clear, practical path forward.
          </p>
          <Link href="/book" className="btn-primary">
            Book the HR Hotline <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
