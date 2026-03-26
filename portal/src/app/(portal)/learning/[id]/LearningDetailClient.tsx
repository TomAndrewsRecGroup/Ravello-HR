'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Clock, Users, Tag, Play, FileText, Link as LinkIcon, BookOpen, Lock, CheckCircle2, Loader2, ExternalLink, Share2 } from 'lucide-react';

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
  purchase: Purchase | null;
  hasAccess: boolean;
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

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function LearningDetailClient({ content, purchase, hasAccess, companyId, userId }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const Icon = TYPE_ICONS[content.content_type] ?? BookOpen;

  const daysLeft = purchase?.access_expires_at
    ? Math.max(0, Math.ceil((new Date(purchase.access_expires_at).getTime() - Date.now()) / 86400000))
    : null;

  async function handleCheckout() {
    if (!content.stripe_price_id) {
      // Free content — create purchase directly
      setLoading(true);
      await supabase.from('learning_purchases').insert({
        content_id:       content.id,
        company_id:       companyId,
        purchased_by:     userId,
        amount_pence:     0,
        status:           'active',
        access_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      });
      setLoading(false);
      window.location.reload();
      return;
    }

    // Paid content — redirect to Stripe Checkout
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
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Hero */}
      <div className="card overflow-hidden">
        {content.thumbnail_url && (
          <div
            className="h-48 w-full"
            style={{ background: `url(${content.thumbnail_url}) center/cover` }}
          />
        )}
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Icon size={14} style={{ color: 'var(--ink-faint)' }} />
                <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--ink-faint)' }}>{content.content_type}</span>
                {content.category && (
                  <>
                    <span style={{ color: 'var(--ink-faint)' }}>·</span>
                    <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{content.category}</span>
                  </>
                )}
              </div>
              <h1 className="font-display font-bold text-xl mb-1" style={{ color: 'var(--ink)' }}>{content.title}</h1>
              {content.creator_name && (
                <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>By {content.creator_name}</p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-2xl font-bold" style={{ color: content.price_pence === 0 ? '#16A34A' : 'var(--purple)' }}>
                {fmtPrice(content.price_pence)}
              </p>
              {content.price_pence > 0 && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>7-day team access</p>
              )}
            </div>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap gap-4 mb-4">
            {content.duration_mins && (
              <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink-faint)' }}>
                <Clock size={12} /> {content.duration_mins} mins
              </span>
            )}
            <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink-faint)' }}>
              <Users size={12} /> {content.view_count} views
            </span>
            {content.tags && content.tags.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Tag size={12} style={{ color: 'var(--ink-faint)' }} />
                {content.tags.map(t => (
                  <span key={t} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-alt)', color: 'var(--ink-faint)' }}>{t}</span>
                ))}
              </div>
            )}
          </div>

          {content.description && (
            <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--ink-soft)' }}>{content.description}</p>
          )}

          {/* Access state */}
          {hasAccess ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)' }}>
                <CheckCircle2 size={16} style={{ color: '#16A34A' }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#166534' }}>You have access</p>
                  {daysLeft !== null && (
                    <p className="text-xs" style={{ color: '#166534' }}>
                      {daysLeft === 0 ? 'Expires today' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`} · Share with your team
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {content.file_url && (
                  <a
                    href={content.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-cta flex items-center gap-2"
                  >
                    <Icon size={14} /> Open Content
                  </a>
                )}
                <button onClick={copyShareLink} className="btn-secondary flex items-center gap-2">
                  <Share2 size={14} /> {copied ? 'Copied!' : 'Share with team'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: 'rgba(143,114,246,0.06)', border: '1px solid rgba(143,114,246,0.15)' }}>
                <Lock size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--purple)' }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    {content.price_pence === 0 ? 'Free access' : `${fmtPrice(content.price_pence)} — 7-day team access`}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>
                    {content.price_pence === 0
                      ? 'Click below to get instant access for your whole team.'
                      : 'Your whole team can access this content for 7 days after purchase.'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCheckout}
                disabled={loading}
                className="btn-cta flex items-center gap-2"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                {content.price_pence === 0 ? 'Get Free Access' : `Buy for ${fmtPrice(content.price_pence)}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
