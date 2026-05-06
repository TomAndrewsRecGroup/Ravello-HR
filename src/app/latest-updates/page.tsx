import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, BookOpen } from 'lucide-react';
import { getPublicSupabase } from '@/lib/supabase/server';
import FeaturedCarousel from './FeaturedCarousel';
import UpdateCard, { type UpdateItem } from './UpdateCard';
import UpdateEmbed from './UpdateEmbed';
import FeedFilters, { type FilterOption } from './FeedFilters';
import Pagination from './Pagination';

export const metadata: Metadata = {
  title: 'Latest Updates | HR News and Insight | The People System',
  description:
    'A live feed of HR news, policy updates, workforce data and practical guidance from across the industry, curated by The People System.',
  alternates: {
    canonical: 'https://thepeoplesystem.co.uk/latest-updates',
    types: {
      'application/rss+xml': 'https://thepeoplesystem.co.uk/latest-updates/rss.xml',
    },
  },
};

export const revalidate = 300;

const SELECT = 'id, source_url, title, description, image_url, site_name, published_at, created_at, source_type, render_mode, embed_kind, embed_ref';
const PAGE_SIZE = 24;

interface SearchParams {
  category?: string;
  source?: string;
  q?: string;
  page?: string;
}

export default async function LatestUpdatesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = getPublicSupabase();

  const category = searchParams.category?.trim() || null;
  const source = searchParams.source?.trim() || null;
  const query = searchParams.q?.trim() || '';
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);
  const hasFilters = Boolean(category || source || query);

  if (!supabase) {
    return <EmptyState />;
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  // Strip chars that would break postgrest's .or() filter syntax, then
  // escape ilike wildcards.
  const sanitisedQuery = query.replace(/[,()"*]/g, ' ').trim();
  const like = sanitisedQuery ? `%${sanitisedQuery.replace(/[%_]/g, '\\$&')}%` : null;

  let mainQuery = supabase
    .from('latest_updates')
    .select(SELECT)
    .eq('status', 'published');
  if (category) mainQuery = mainQuery.eq('category', category);
  if (source) mainQuery = mainQuery.eq('feed_source_id', source);
  if (like) mainQuery = mainQuery.or(`title.ilike.${like},description.ilike.${like}`);

  let countQuery = supabase
    .from('latest_updates')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published');
  if (category) countQuery = countQuery.eq('category', category);
  if (source) countQuery = countQuery.eq('feed_source_id', source);
  if (like) countQuery = countQuery.or(`title.ilike.${like},description.ilike.${like}`);

  const [featuredRes, mainRes, countRes, catsRes, sourcesRes] = await Promise.all([
    // Carousel only shown when there are no active filters
    hasFilters
      ? Promise.resolve({ data: [] as UpdateItem[] })
      : supabase
          .from('latest_updates')
          .select(SELECT)
          .eq('status', 'published')
          .eq('featured', true)
          .order('featured_order', { ascending: true, nullsFirst: false })
          .order('published_at', { ascending: false, nullsFirst: false })
          .limit(12),

    mainQuery
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, to),

    countQuery,

    supabase.rpc('latest_updates_category_counts'),

    supabase
      .from('feed_sources')
      .select('id, display_name')
      .eq('active', true)
      .order('display_name', { ascending: true }),
  ]);

  const featured = (featuredRes?.data ?? []) as UpdateItem[];
  const main = (mainRes?.data ?? []) as UpdateItem[];
  const totalCount = countRes?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const categories: FilterOption[] = ((catsRes?.data ?? []) as { category: string; count: number | string }[])
    .map(c => ({ value: c.category, label: c.category, count: Number(c.count) }));
  const sources: FilterOption[] = ((sourcesRes?.data ?? []) as { id: string; display_name: string }[])
    .map(s => ({ value: s.id, label: s.display_name }));

  return (
    <div className="pt-28">

      {/* Hero — matches the homepage hero background (var(--bg) plus
          ambient radial gradients) and the /hire / /protect layout
          (left-aligned text on the left, image on the right). */}
      <section className="relative overflow-hidden" style={{ background: 'var(--bg)', padding: '3rem 1.5rem 2.5rem' }}>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: [
              'radial-gradient(ellipse at 72% 18%, rgba(124,58,237,0.07) 0%, transparent 55%)',
              'radial-gradient(ellipse at 12% 80%, rgba(234,61,196,0.05) 0%, transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative z-10 container-wide lg:px-10">
          <div className="grid lg:grid-cols-[1fr_420px] gap-12 items-center">
            <div>
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
              <p className="text-lg leading-relaxed max-w-2xl mb-4" style={{ color: 'var(--ink-soft)' }}>
                A curated live feed of HR news, policy changes, workforce data and practical guidance. Pulled from the sources we actually read.
              </p>
              <a
                href="/latest-updates/rss.xml"
                className="inline-flex items-center gap-2 text-xs font-semibold"
                style={{ color: 'var(--brand-purple)' }}
              >
                Subscribe via RSS
              </a>
              <p
                className="text-[11px] leading-relaxed mt-6 max-w-2xl"
                style={{ color: 'var(--ink-faint)', fontStyle: 'italic' }}
              >
                Articles are sourced from third-party publishers. The views and opinions expressed by their authors are their own and do not necessarily reflect those of The People System, unless an item is published directly by us.
              </p>
            </div>
            <div className="hidden lg:block">
              <div className="relative rounded-[24px] overflow-hidden" style={{ height: 480 }}>
                <Image
                  src="https://images.unsplash.com/photo-1495020689067-958852a7765e?w=960&h=960&fit=crop"
                  alt="Newspapers and notebooks on a desk"
                  fill
                  className="object-cover"
                  sizes="420px"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured carousel: only on page 1 with no filters */}
      {!hasFilters && page === 1 && featured.length > 0 && (
        <FeaturedCarousel items={featured} />
      )}

      {/* Filters + main feed */}
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '2rem' }}>
        <div className="container-wide space-y-8">

          <div>
            <div className="flex items-baseline justify-between gap-4 mb-6">
              <h2 className="font-display section-title" style={{ marginBottom: 0 }}>
                {hasFilters ? 'Filtered updates' : 'All updates'}
              </h2>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                {totalCount === 1 ? '1 result' : `${totalCount.toLocaleString()} results`}
              </p>
            </div>

            <FeedFilters
              categories={categories}
              sources={sources}
              activeCategory={category}
              activeSource={source}
              activeQuery={query}
            />
          </div>

          {main.length > 0 ? (
            <>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {main.map(item =>
                  item.render_mode === 'embed' && item.embed_kind && item.embed_ref
                    ? <UpdateEmbed key={item.id} kind={item.embed_kind} ref={item.embed_ref} />
                    : <UpdateCard key={item.id} item={item} variant="grid" />
                )}
              </div>
              <Pagination page={page} totalPages={totalPages} />
            </>
          ) : (
            <div className="card max-w-xl mx-auto text-center py-10">
              <BookOpen className="mx-auto mb-3" size={32} style={{ color: 'var(--ink-faint)' }} />
              <p className="font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>
                {hasFilters ? 'No matches' : 'Nothing here yet'}
              </p>
              <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                {hasFilters
                  ? 'Try clearing a filter or broadening your search.'
                  : "New entries will appear here as they're published."}
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
            Book a call with Lucy. Bring your specific situation and leave with a clear, practical path forward.
          </p>
          <Link href="/book" className="btn-primary">Book a Call</Link>
        </div>
      </section>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="pt-28 pb-24">
      <div className="container-narrow text-center">
        <BookOpen className="mx-auto mb-3" size={32} style={{ color: 'var(--ink-faint)' }} />
        <p className="font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>
          Feed temporarily unavailable
        </p>
        <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
          Check back in a moment.
        </p>
      </div>
    </div>
  );
}
