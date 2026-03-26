'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  Clock, Users, Tag, Play, FileText, Link as LinkIcon, BookOpen,
  Lock, CheckCircle2, Loader2, Share2, ChevronRight, Star,
  AlertTriangle,
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
  stripe_price_id: string | null;
  is_featured: boolean;
  view_count: number;
}

interface Purchase {
  id: string;
  status: string;
  access_expires_at: string | null;
  created_at: string;
}

interface Props {
  content: Content;
  related: Content[];
  byCreator: Content[];
  purchase: Purchase | null;
  hasAccess: boolean;
  companyId: string;
  userId: string;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  video: Play, pdf: FileText, pptx: FileText, link: LinkIcon, scorm: BookOpen,
};
const TYPE_COLORS: Record<string, string> = {
  video: '#8B5CF6', pdf: '#3B82F6', pptx: '#F59E0B', link: '#10B981', scorm: '#EC4899',
};

function fmtPrice(pence: number): string {
  if (pence === 0) return 'Free';
  return `£${(pence / 100).toFixed(2)}`;
}

// Live countdown timer
function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState('');
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    function update() {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining('Expired'); return; }
      const days = Math.floor(diff / 86400000);
      const hrs  = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      setUrgent(days === 0);
      if (days > 0) setRemaining(`${days}d ${hrs}h remaining`);
      else if (hrs > 0) setRemaining(`${hrs}h ${mins}m remaining`);
      else setRemaining(`${mins}m remaining`);
    }
    update();
    const t = setInterval(update, 60000);
    return () => clearInterval(t);
  }, [expiresAt]);

  return (
    <span
      className="text-xs font-semibold"
      style={{ color: urgent ? '#DC2626' : '#16A34A' }}
    >
      {urgent && <AlertTriangle size={11} className="inline mr-1" />}
      {remaining}
    </span>
  );
}

// Small related card
function RelatedCard({ item }: { item: Content }) {
  const typeColor = TYPE_COLORS[item.content_type] ?? '#8B5CF6';
  return (
    <Link
      href={`/learning/${item.id}`}
      className="flex items-center gap-3 p-3 rounded-lg transition-colors group"
      style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)' }}
    >
      <div
        className="w-14 h-14 rounded-lg flex-shrink-0 flex items-center justify-center"
        style={{
          background: item.thumbnail_url
            ? `url(${item.thumbnail_url}) center/cover`
            : `${typeColor}20`,
        }}
      >
        {!item.thumbnail_url && (() => {
          const Icon = TYPE_ICONS[item.content_type] ?? BookOpen;
          return <Icon size={18} style={{ color: typeColor }} />;
        })()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold line-clamp-2 leading-snug group-hover:text-purple-400 transition-colors" style={{ color: 'var(--ink)' }}>
          {item.title}
        </p>
        {item.creator_name && (
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>{item.creator_name}</p>
        )}
        <p className="text-[10px] font-bold mt-1" style={{ color: item.price_pence === 0 ? '#16A34A' : typeColor }}>
          {fmtPrice(item.price_pence)}
        </p>
      </div>
      <ChevronRight size={12} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
    </Link>
  );
}

export default function LearningDetailClient({
  content, related, byCreator, purchase, hasAccess, companyId, userId,
}: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const Icon = TYPE_ICONS[content.content_type] ?? BookOpen;
  const typeColor = TYPE_COLORS[content.content_type] ?? '#8B5CF6';

  // Increment view count on mount
  useEffect(() => {
    supabase.from('learning_content')
      .update({ view_count: content.view_count + 1 })
      .eq('id', content.id)
      .then(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content.id]);

  async function handleCheckout() {
    if (!content.stripe_price_id) {
      setLoading(true);
      await supabase.from('learning_purchases').insert({
        content_id:        content.id,
        company_id:        companyId,
        purchased_by:      userId,
        amount_pence:      0,
        status:            'active',
        access_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      });
      setLoading(false);
      window.location.reload();
      return;
    }
    setLoading(true);
    const res = await fetch('/api/learning/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentId: content.id, companyId, userId }),
    });
    const { url } = await res.json();
    if (url) window.location.href = url;
    else setLoading(false);
  }

  async function copyShareLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* ── Left column ── */}
        <div className="space-y-5">
          {/* Hero */}
          <div className="card overflow-hidden">
            {/* Thumbnail / banner */}
            <div
              className="relative flex items-center justify-center"
              style={{
                height: 240,
                background: content.thumbnail_url
                  ? `url(${content.thumbnail_url}) center/cover no-repeat`
                  : `linear-gradient(135deg, ${typeColor}25 0%, ${typeColor}08 100%)`,
              }}
            >
              {!content.thumbnail_url && (
                <Icon size={56} style={{ color: `${typeColor}50` }} />
              )}
              {/* Type badge */}
              <div className="absolute top-3 left-3">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: `${typeColor}ee`, color: '#fff' }}>
                  {content.content_type}
                </span>
              </div>
              {content.is_featured && (
                <div className="absolute top-3 right-3">
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(245,158,11,0.9)', color: '#fff' }}>
                    <Star size={9} /> Featured
                  </span>
                </div>
              )}
            </div>

            <div className="p-6">
              {/* Title + price */}
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1">
                  <h1 className="font-display font-bold text-xl leading-tight mb-1" style={{ color: 'var(--ink)' }}>
                    {content.title}
                  </h1>
                  {content.creator_name && (
                    <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>By {content.creator_name}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-2xl font-bold" style={{ color: content.price_pence === 0 ? '#16A34A' : typeColor }}>
                    {fmtPrice(content.price_pence)}
                  </p>
                  {content.price_pence > 0 && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>7-day team access</p>
                  )}
                </div>
              </div>

              {/* Meta */}
              <div className="flex flex-wrap gap-4 mb-4">
                {content.duration_mins && (
                  <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink-faint)' }}>
                    <Clock size={12} /> {content.duration_mins} mins
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink-faint)' }}>
                  <Users size={12} /> {content.view_count} views
                </span>
                {content.category && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${typeColor}15`, color: typeColor }}>
                    {content.category}
                  </span>
                )}
              </div>

              {/* Tags */}
              {content.tags && content.tags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap mb-4">
                  <Tag size={11} style={{ color: 'var(--ink-faint)' }} />
                  {content.tags.map(t => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)', border: '1px solid var(--border)' }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {/* Description */}
              {content.description && (
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{content.description}</p>
              )}
            </div>
          </div>

          {/* Related content */}
          {related.length > 0 && (
            <div className="card p-5">
              <h2 className="font-display font-semibold text-sm mb-4 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                <Star size={13} style={{ color: '#F59E0B' }} /> You May Like
              </h2>
              <div className="space-y-2">
                {related.map(r => <RelatedCard key={r.id} item={r} />)}
              </div>
            </div>
          )}

          {/* More from this coach */}
          {byCreator.length > 0 && content.creator_name && (
            <div className="card p-5">
              <h2 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>
                More from {content.creator_name}
              </h2>
              <div className="space-y-2">
                {byCreator.map(r => <RelatedCard key={r.id} item={r} />)}
              </div>
            </div>
          )}
        </div>

        {/* ── Right column — access panel ── */}
        <div className="space-y-4">
          <div className="card p-5 sticky top-6">
            {hasAccess ? (
              <div className="space-y-4">
                {/* Access confirmed */}
                <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)' }}>
                  <CheckCircle2 size={18} style={{ color: '#16A34A', flexShrink: 0 }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#166534' }}>You have access</p>
                    {purchase?.access_expires_at && (
                      <CountdownTimer expiresAt={purchase.access_expires_at} />
                    )}
                  </div>
                </div>

                {/* Team sharing note */}
                <div className="p-3 rounded-lg text-xs leading-relaxed" style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}>
                  <strong style={{ color: 'var(--ink)' }}>Team access:</strong> Anyone at your company can access this content during the active window. Share the link below.
                </div>

                {/* CTAs */}
                {content.file_url && (
                  <a
                    href={content.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-cta w-full flex items-center justify-center gap-2"
                    style={{ background: typeColor, borderColor: typeColor }}
                  >
                    <Icon size={15} /> Open Content
                  </a>
                )}
                <button
                  onClick={copyShareLink}
                  className="btn-secondary w-full flex items-center justify-center gap-2"
                >
                  <Share2 size={14} /> {copied ? '✓ Link copied!' : 'Copy share link'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Price + lock */}
                <div className="text-center py-2">
                  <p className="text-3xl font-bold mb-1" style={{ color: content.price_pence === 0 ? '#16A34A' : typeColor }}>
                    {fmtPrice(content.price_pence)}
                  </p>
                  {content.price_pence > 0 && (
                    <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>One-time · 7-day team access</p>
                  )}
                </div>

                {/* What you get */}
                <div className="space-y-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
                  {[
                    'Instant access for your whole team',
                    '7 days from purchase date',
                    'Share the link with any colleague',
                    content.content_type === 'video' ? 'Stream directly in browser' : 'Download and keep',
                  ].map(f => (
                    <div key={f} className="flex items-center gap-2">
                      <CheckCircle2 size={12} style={{ color: '#16A34A', flexShrink: 0 }} />
                      {f}
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleCheckout}
                  disabled={loading}
                  className="btn-cta w-full flex items-center justify-center gap-2"
                  style={{ background: typeColor, borderColor: typeColor }}
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  {content.price_pence === 0 ? 'Get Free Access' : `Buy for ${fmtPrice(content.price_pence)}`}
                </button>

                {content.price_pence > 0 && (
                  <p className="text-[10px] text-center" style={{ color: 'var(--ink-faint)' }}>
                    Secure checkout via Stripe
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Back to library */}
          <Link href="/learning" className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink-faint)' }}>
            <ChevronRight size={12} className="rotate-180" /> Back to Learning Library
          </Link>
        </div>
      </div>
    </div>
  );
}
