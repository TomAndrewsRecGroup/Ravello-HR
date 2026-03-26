'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Clock, Star, Play, FileText, Link as LinkIcon, BookOpen, Lock, CheckCircle2 } from 'lucide-react';

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

function fmtPrice(pence: number): string {
  if (pence === 0) return 'Free';
  return `£${(pence / 100).toFixed(2)}`;
}

function hasAccess(contentId: string, purchases: Purchase[]): boolean {
  const p = purchases.find(p => p.content_id === contentId);
  if (!p) return false;
  if (p.status !== 'active') return false;
  if (p.access_expires_at && new Date(p.access_expires_at) < new Date()) return false;
  return true;
}

function daysLeft(contentId: string, purchases: Purchase[]): number | null {
  const p = purchases.find(p => p.content_id === contentId && p.status === 'active');
  if (!p?.access_expires_at) return null;
  return Math.max(0, Math.ceil((new Date(p.access_expires_at).getTime() - Date.now()) / 86400000));
}

function ContentCard({ item, purchased }: { item: Content; purchased: boolean }) {
  const Icon = TYPE_ICONS[item.content_type] ?? BookOpen;
  const days = purchased ? daysLeft(item.id, []) : null;

  return (
    <Link
      href={`/learning/${item.id}`}
      className="card flex flex-col overflow-hidden hover:shadow-md transition-shadow group"
    >
      {/* Thumbnail */}
      <div
        className="relative h-36 flex items-center justify-center"
        style={{
          background: item.thumbnail_url
            ? `url(${item.thumbnail_url}) center/cover`
            : 'linear-gradient(135deg, rgba(143,114,246,0.15) 0%, rgba(59,111,255,0.1) 100%)',
        }}
      >
        {!item.thumbnail_url && (
          <Icon size={32} style={{ color: 'rgba(143,114,246,0.5)' }} />
        )}
        {item.is_featured && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(245,158,11,0.9)', color: '#fff' }}>
            <Star size={9} /> Featured
          </div>
        )}
        {purchased && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(22,163,74,0.9)', color: '#fff' }}>
            <CheckCircle2 size={9} /> Purchased
          </div>
        )}
        {!purchased && item.price_pence > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(7,11,29,0.7)', color: '#fff' }}>
            <Lock size={9} /> {fmtPrice(item.price_pence)}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-center gap-1.5 mb-2">
          <Icon size={11} style={{ color: 'var(--ink-faint)' }} />
          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--ink-faint)' }}>{item.content_type}</span>
          {item.category && (
            <>
              <span style={{ color: 'var(--ink-faint)' }}>·</span>
              <span className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>{item.category}</span>
            </>
          )}
        </div>
        <p className="font-semibold text-sm leading-snug mb-1 group-hover:text-purple-400 transition-colors" style={{ color: 'var(--ink)' }}>
          {item.title}
        </p>
        {item.creator_name && (
          <p className="text-xs mb-2" style={{ color: 'var(--ink-faint)' }}>{item.creator_name}</p>
        )}
        {item.description && (
          <p className="text-xs leading-relaxed line-clamp-2 mb-3" style={{ color: 'var(--ink-soft)' }}>{item.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {item.duration_mins && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--ink-faint)' }}>
                <Clock size={11} /> {item.duration_mins}m
              </span>
            )}
          </div>
          <span className="text-sm font-bold" style={{ color: item.price_pence === 0 ? '#16A34A' : 'var(--purple)' }}>
            {fmtPrice(item.price_pence)}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function LearningBrowse({ content, purchases, companyId, userId }: Props) {
  const [filterCat, setFilterCat] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [search, setSearch] = useState('');

  const categories = useMemo(() => ['all', ...Array.from(new Set(content.map(c => c.category).filter(Boolean) as string[]))], [content]);
  const types = useMemo(() => ['all', ...Array.from(new Set(content.map(c => c.content_type)))], [content]);

  const filtered = content.filter(c =>
    (filterCat === 'all' || c.category === filterCat) &&
    (filterType === 'all' || c.content_type === filterType) &&
    (!search || c.title.toLowerCase().includes(search.toLowerCase()) || c.description?.toLowerCase().includes(search.toLowerCase()) || c.creator_name?.toLowerCase().includes(search.toLowerCase()))
  );

  const featured = filtered.filter(c => c.is_featured);
  const rest = filtered.filter(c => !c.is_featured);

  // Group rest by category for Netflix-style rows
  const byCategory = useMemo(() => {
    const map: Record<string, Content[]> = {};
    for (const c of rest) {
      const cat = c.category ?? 'Other';
      if (!map[cat]) map[cat] = [];
      map[cat].push(c);
    }
    return map;
  }, [rest]);

  const purchasedIds = new Set(purchases.filter(p => p.status === 'active').map(p => p.content_id));

  return (
    <div className="space-y-8">
      {/* Search + filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          className="input flex-1 min-w-[200px]"
          placeholder="Search content…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="input text-xs py-2 w-auto" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
        </select>
        <select className="input text-xs py-2 w-auto" value={filterType} onChange={e => setFilterType(e.target.value)}>
          {types.map(t => <option key={t} value={t}>{t === 'all' ? 'All Types' : t.toUpperCase()}</option>)}
        </select>
      </div>

      {/* Featured row */}
      {featured.length > 0 && (
        <section>
          <h2 className="font-display font-semibold text-sm mb-4 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
            <Star size={14} style={{ color: '#F59E0B' }} /> Featured
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featured.map(c => (
              <ContentCard key={c.id} item={c} purchased={purchasedIds.has(c.id)} />
            ))}
          </div>
        </section>
      )}

      {/* Purchased row */}
      {purchasedIds.size > 0 && (
        <section>
          <h2 className="font-display font-semibold text-sm mb-4 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
            <CheckCircle2 size={14} style={{ color: '#16A34A' }} /> Your Purchases
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {content.filter(c => purchasedIds.has(c.id)).map(c => (
              <ContentCard key={c.id} item={c} purchased={true} />
            ))}
          </div>
        </section>
      )}

      {/* Category rows */}
      {Object.entries(byCategory).map(([cat, items]) => (
        <section key={cat}>
          <h2 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>{cat}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map(c => (
              <ContentCard key={c.id} item={c} purchased={purchasedIds.has(c.id)} />
            ))}
          </div>
        </section>
      ))}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="card p-12">
          <div className="empty-state py-4">
            <BookOpen size={24} />
            <p className="text-sm">No content found</p>
            <p className="text-xs max-w-[280px]">Try adjusting your filters or search term.</p>
          </div>
        </div>
      )}
    </div>
  );
}
