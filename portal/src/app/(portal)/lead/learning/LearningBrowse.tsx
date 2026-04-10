'use client';
import { useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Clock, Star, Play, FileText, Link as LinkIcon, BookOpen,
  Lock, CheckCircle2, ChevronLeft, ChevronRight, Search,
  SlidersHorizontal, X,
} from 'lucide-react';

interface Content {
  id: string;
  title: string;
  description: string | null;
  creator_name: string | null;
  category: string | null;
  tags: string[] | null;
  content_type: string;
  file_url: string | null;
  thumbnail_url: string | null;
  duration_mins: number | null;
  price_pence: number;
  is_featured: boolean;
  view_count: number;
}

interface Purchase {
  content_id: string;
  status: string;
  access_expires_at: string | null;
}

interface Props {
  content: Content[];
  purchases: Purchase[];
  companyId: string;
  userId: string;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  video: Play, pdf: FileText, pptx: FileText, link: LinkIcon, scorm: BookOpen,
};

const TYPE_COLORS: Record<string, string> = {
  video: '#8B5CF6', pdf: 'var(--blue)', pptx: 'var(--warning)', link: 'var(--success)', scorm: '#EC4899',
};

function fmtPrice(pence: number): string {
  if (pence === 0) return 'Free';
  return `£${(pence / 100).toFixed(2)}`;
}

function isActive(p: Purchase): boolean {
  if (p.status !== 'active') return false;
  if (p.access_expires_at && new Date(p.access_expires_at) < new Date()) return false;
  return true;
}

function daysLeftFor(p: Purchase | undefined): number | null {
  if (!p?.access_expires_at) return null;
  return Math.max(0, Math.ceil((new Date(p.access_expires_at).getTime() - Date.now()) / 86400000));
}

// Tag-similarity score: count shared tags between two items
function tagScore(a: Content, b: Content): number {
  if (!a.tags || !b.tags) return 0;
  const setB = new Set(b.tags.map(t => t.toLowerCase()));
  return a.tags.filter(t => setB.has(t.toLowerCase())).length;
}

// ── Card component ────────────────────────────────────────────
function ContentCard({
  item,
  purchase,
  compact = false,
}: {
  item: Content;
  purchase?: Purchase;
  compact?: boolean;
}) {
  const Icon = TYPE_ICONS[item.content_type] ?? BookOpen;
  const typeColor = TYPE_COLORS[item.content_type] ?? '#8B5CF6';
  const purchased = purchase ? isActive(purchase) : false;
  const days = purchased ? daysLeftFor(purchase) : null;

  return (
    <Link
      href={`/learning/${item.id}`}
      className="group flex-shrink-0 flex flex-col overflow-hidden rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
      style={{
        width: compact ? 200 : 260,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Thumbnail */}
      <div
        className="relative flex items-center justify-center overflow-hidden"
        style={{
          height: compact ? 110 : 148,
          background: item.thumbnail_url
            ? `url(${item.thumbnail_url}) center/cover no-repeat`
            : `linear-gradient(135deg, ${typeColor}22 0%, ${typeColor}08 100%)`,
        }}
      >
        {!item.thumbnail_url && (
          <Icon size={compact ? 28 : 36} style={{ color: `${typeColor}60` }} />
        )}

        {/* Overlay on hover */}
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(7,11,29,0.55)' }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: typeColor }}
          >
            <Play size={16} fill="white" color="white" />
          </div>
        </div>

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {item.is_featured && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: 'rgba(245,158,11,0.92)', color: '#fff' }}>
              <Star size={8} /> Featured
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase" style={{ background: `${typeColor}dd`, color: '#fff' }}>
            {item.content_type}
          </span>
        </div>

        <div className="absolute top-2 right-2">
          {purchased ? (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: 'rgba(22,163,74,0.92)', color: '#fff' }}>
              <CheckCircle2 size={8} /> {days !== null ? `${days}d left` : 'Active'}
            </span>
          ) : item.price_pence > 0 ? (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: 'rgba(7,11,29,0.75)', color: '#fff' }}>
              <Lock size={8} /> {fmtPrice(item.price_pence)}
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: 'rgba(22,163,74,0.85)', color: '#fff' }}>
              Free
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col flex-1">
        <p
          className="font-semibold leading-snug mb-1 line-clamp-2"
          style={{ fontSize: compact ? 12 : 13, color: 'var(--ink)' }}
        >
          {item.title}
        </p>
        {item.creator_name && (
          <p className="text-[11px] mb-1.5" style={{ color: 'var(--ink-faint)' }}>{item.creator_name}</p>
        )}
        {!compact && item.description && (
          <p className="text-[11px] leading-relaxed line-clamp-2 mb-2" style={{ color: 'var(--ink-soft)' }}>{item.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between">
          {item.duration_mins ? (
            <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--ink-faint)' }}>
              <Clock size={10} /> {item.duration_mins}m
            </span>
          ) : <span />}
          <span
            className="text-[11px] font-bold"
            style={{ color: item.price_pence === 0 ? 'var(--success)' : typeColor }}
          >
            {fmtPrice(item.price_pence)}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── Horizontal carousel row ───────────────────────────────────
function Carousel({
  title,
  items,
  purchaseMap,
  icon,
  compact = false,
}: {
  title: string;
  items: Content[];
  purchaseMap: Map<string, Purchase>;
  icon?: React.ReactNode;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 'l' | 'r') => {
    if (!ref.current) return;
    ref.current.scrollBy({ left: dir === 'l' ? -320 : 320, behavior: 'smooth' });
  };

  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--ink)' }}>
          {icon} {title}
        </h2>
        <div className="flex gap-1">
          <button onClick={() => scroll('l')} className="w-7 h-7 rounded-full flex items-center justify-center transition-colors" style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}>
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => scroll('r')} className="w-7 h-7 rounded-full flex items-center justify-center transition-colors" style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <div
        ref={ref}
        className="flex gap-3 overflow-x-auto pb-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {items.map(c => (
          <ContentCard key={c.id} item={c} purchase={purchaseMap.get(c.id)} compact={compact} />
        ))}
      </div>
    </section>
  );
}

// ── Hero banner (first featured item) ────────────────────────
function HeroBanner({ item, purchase }: { item: Content; purchase?: Purchase }) {
  const purchased = purchase ? isActive(purchase) : false;
  const days = purchased ? daysLeftFor(purchase) : null;
  const Icon = TYPE_ICONS[item.content_type] ?? BookOpen;
  const typeColor = TYPE_COLORS[item.content_type] ?? '#8B5CF6';

  return (
    <Link href={`/learning/${item.id}`} className="block group">
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          height: 320,
          background: item.thumbnail_url
            ? `url(${item.thumbnail_url}) center/cover no-repeat`
            : `linear-gradient(135deg, ${typeColor}30 0%, rgba(7,11,29,0.8) 100%)`,
        }}
      >
        {/* Dark gradient overlay */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to right, rgba(7,11,29,0.85) 0%, rgba(7,11,29,0.3) 60%, transparent 100%)' }}
        />

        {/* Content */}
        <div className="absolute inset-0 flex flex-col justify-end p-8">
          <div className="max-w-lg">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(245,158,11,0.9)', color: '#fff' }}>
                <Star size={9} /> Featured
              </span>
              {item.category && (
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>{item.category}</span>
              )}
            </div>
            <h1 className="font-display font-bold text-2xl mb-2 leading-tight" style={{ color: '#fff' }}>
              {item.title}
            </h1>
            {item.creator_name && (
              <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.75)' }}>By {item.creator_name}</p>
            )}
            {item.description && (
              <p className="text-sm leading-relaxed line-clamp-2 mb-4" style={{ color: 'rgba(255,255,255,0.65)' }}>
                {item.description}
              </p>
            )}
            <div className="flex items-center gap-3">
              <div
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all group-hover:scale-105"
                style={{ background: typeColor, color: '#fff' }}
              >
                <Play size={14} fill="white" />
                {purchased ? 'Continue' : item.price_pence === 0 ? 'Get Free Access' : `Buy — ${fmtPrice(item.price_pence)}`}
              </div>
              {purchased && days !== null && (
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {days === 0 ? 'Expires today' : `${days} day${days !== 1 ? 's' : ''} remaining`}
                </span>
              )}
              {item.duration_mins && (
                <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  <Clock size={11} /> {item.duration_mins}m
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Main component ────────────────────────────────────────────
export default function LearningBrowse({ content, purchases, companyId, userId }: Props) {
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterCat, setFilterCat] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterPrice, setFilterPrice] = useState('all'); // all | free | paid

  // Build purchase map
  const purchaseMap = useMemo(() => {
    const m = new Map<string, Purchase>();
    for (const p of purchases) m.set(p.content_id, p);
    return m;
  }, [purchases]);

  const purchasedIds = useMemo(
    () => new Set(purchases.filter(isActive).map(p => p.content_id)),
    [purchases]
  );

  const categories = useMemo(() => ['all', ...Array.from(new Set(content.map(c => c.category).filter(Boolean) as string[]))], [content]);
  const types = useMemo(() => ['all', ...Array.from(new Set(content.map(c => c.content_type)))], [content]);

  // Search + filter
  const filtered = useMemo(() => content.filter(c => {
    if (filterCat !== 'all' && c.category !== filterCat) return false;
    if (filterType !== 'all' && c.content_type !== filterType) return false;
    if (filterPrice === 'free' && c.price_pence !== 0) return false;
    if (filterPrice === 'paid' && c.price_pence === 0) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.title.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.creator_name?.toLowerCase().includes(q) ||
        c.tags?.some(t => t.toLowerCase().includes(q))
      );
    }
    return true;
  }), [content, filterCat, filterType, filterPrice, search]);

  const isFiltering = search || filterCat !== 'all' || filterType !== 'all' || filterPrice !== 'all';

  // Sections
  const featured = useMemo(() => content.filter(c => c.is_featured), [content]);
  const heroBanner = featured[0];
  const featuredRest = featured.slice(1);

  const purchased = useMemo(() => content.filter(c => purchasedIds.has(c.id)), [content, purchasedIds]);

  // "You May Like" — tag similarity against purchased content
  const youMayLike = useMemo(() => {
    if (purchasedIds.size === 0) return [];
    const purchasedContent = content.filter(c => purchasedIds.has(c.id));
    return content
      .filter(c => !purchasedIds.has(c.id))
      .map(c => ({ c, score: purchasedContent.reduce((sum, p) => sum + tagScore(c, p), 0) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(({ c }) => c);
  }, [content, purchasedIds]);

  // "More From This Coach" — group by creator
  const byCreator = useMemo(() => {
    const map: Record<string, Content[]> = {};
    for (const c of content) {
      if (!c.creator_name) continue;
      if (!map[c.creator_name]) map[c.creator_name] = [];
      map[c.creator_name].push(c);
    }
    // Only show creators with 2+ items
    return Object.entries(map).filter(([, items]) => items.length >= 2);
  }, [content]);

  // By category (excluding featured)
  const byCategory = useMemo(() => {
    const map: Record<string, Content[]> = {};
    for (const c of content.filter(c => !c.is_featured)) {
      const cat = c.category ?? 'Other';
      if (!map[cat]) map[cat] = [];
      map[cat].push(c);
    }
    return Object.entries(map);
  }, [content]);

  return (
    <div className="space-y-8 -mx-1">
      {/* Search bar */}
      <div className="flex gap-2 items-center px-1">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
          <input
            className="input pl-9 w-full"
            placeholder="Search content, coaches, topics…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X size={13} style={{ color: 'var(--ink-faint)' }} />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
          style={{
            background: showFilters ? 'var(--purple)' : 'var(--surface-alt)',
            color: showFilters ? '#fff' : 'var(--ink-soft)',
            border: '1px solid var(--border)',
          }}
        >
          <SlidersHorizontal size={13} /> Filters
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 px-1 p-4 rounded-xl" style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
          <div>
            <label className="label mb-1">Category</label>
            <select className="input text-xs py-1.5 w-auto" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
            </select>
          </div>
          <div>
            <label className="label mb-1">Type</label>
            <select className="input text-xs py-1.5 w-auto" value={filterType} onChange={e => setFilterType(e.target.value)}>
              {types.map(t => <option key={t} value={t}>{t === 'all' ? 'All Types' : t.toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <label className="label mb-1">Price</label>
            <select className="input text-xs py-1.5 w-auto" value={filterPrice} onChange={e => setFilterPrice(e.target.value)}>
              <option value="all">All</option>
              <option value="free">Free only</option>
              <option value="paid">Paid only</option>
            </select>
          </div>
          {isFiltering && (
            <div className="flex items-end">
              <button
                onClick={() => { setSearch(''); setFilterCat('all'); setFilterType('all'); setFilterPrice('all'); }}
                className="btn-ghost btn-sm flex items-center gap-1"
              >
                <X size={12} /> Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* Search results */}
      {isFiltering ? (
        <div className="px-1">
          <p className="text-xs mb-4" style={{ color: 'var(--ink-faint)' }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
          {filtered.length === 0 ? (
            <div className="card p-12">
              <div className="empty-state py-4">
                <BookOpen size={24} />
                <p className="text-sm">No content found</p>
                <p className="text-xs max-w-[280px]">Try adjusting your search or filters.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filtered.map(c => (
                <ContentCard key={c.id} item={c} purchase={purchaseMap.get(c.id)} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Hero banner */}
          {heroBanner && (
            <div className="px-1">
              <HeroBanner item={heroBanner} purchase={purchaseMap.get(heroBanner.id)} />
            </div>
          )}

          {/* Your purchases */}
          {purchased.length > 0 && (
            <div className="px-1">
              <Carousel
                title="Your Purchases"
                items={purchased}
                purchaseMap={purchaseMap}
                icon={<CheckCircle2 size={14} style={{ color: 'var(--success)' }} />}
              />
            </div>
          )}

          {/* You May Like */}
          {youMayLike.length > 0 && (
            <div className="px-1">
              <Carousel
                title="You May Like"
                items={youMayLike}
                purchaseMap={purchaseMap}
                icon={<Star size={14} style={{ color: 'var(--warning)' }} />}
              />
            </div>
          )}

          {/* Featured (rest after hero) */}
          {featuredRest.length > 0 && (
            <div className="px-1">
              <Carousel
                title="Featured"
                items={featuredRest}
                purchaseMap={purchaseMap}
                icon={<Star size={14} style={{ color: 'var(--warning)' }} />}
              />
            </div>
          )}

          {/* By category */}
          {byCategory.map(([cat, items]) => (
            <div key={cat} className="px-1">
              <Carousel title={cat} items={items} purchaseMap={purchaseMap} />
            </div>
          ))}

          {/* More From This Coach */}
          {byCreator.map(([creator, items]) => (
            <div key={creator} className="px-1">
              <Carousel
                title={`More from ${creator}`}
                items={items}
                purchaseMap={purchaseMap}
                compact
              />
            </div>
          ))}

          {/* Empty state */}
          {content.length === 0 && (
            <div className="card p-12 mx-1">
              <div className="empty-state py-4">
                <BookOpen size={24} />
                <p className="text-sm">No content available yet</p>
                <p className="text-xs max-w-[280px]">Your consultant will add learning content here. Check back soon.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
