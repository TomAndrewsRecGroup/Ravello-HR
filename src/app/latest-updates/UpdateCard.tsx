import Link from 'next/link';
import { ArrowUpRight, Clock } from 'lucide-react';

export interface UpdateItem {
  id: string;
  source_url: string;
  title: string;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  published_at: string | null;
  created_at: string;
  source_type: 'manual' | 'rss' | 'html';
  render_mode: 'card' | 'embed';
  embed_kind: 'linkedin' | null;
  embed_ref: string | null;
}

interface Props {
  item: UpdateItem;
  variant?: 'grid' | 'carousel';
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Brand fallback rendered when an article doesn't carry its own
// cover image. Uses the TPS logo on a soft tinted backdrop so the
// card still has visual weight and the grid stays uniform height.
const FALLBACK_LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

export default function UpdateCard({ item, variant = 'grid' }: Props) {
  const dateString = formatDate(item.published_at ?? item.created_at);
  const isCarousel = variant === 'carousel';
  const hasImage   = !!item.image_url;

  return (
    <Link
      href={item.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group card flex flex-col transition-all duration-200 hover:-translate-y-0.5 ${
        isCarousel ? 'w-[320px] sm:w-[360px] flex-shrink-0 snap-start' : ''
      }`}
      style={{ scrollSnapAlign: isCarousel ? 'start' : undefined }}
    >
      <div
        className="-mx-8 -mt-8 mb-5 overflow-hidden rounded-t-[24px] flex items-center justify-center"
        style={{
          aspectRatio: isCarousel ? '16 / 9' : '5 / 3',
          background: hasImage
            ? 'var(--surface-alt, rgba(10,15,30,0.04))'
            : 'linear-gradient(135deg, rgba(124,58,237,0.10) 0%, rgba(59,111,255,0.08) 100%)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={hasImage ? item.image_url! : FALLBACK_LOGO}
          alt=""
          className={
            hasImage
              ? 'w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]'
              : 'h-12 w-auto opacity-80 transition-transform duration-300 group-hover:scale-[1.04]'
          }
          loading="lazy"
        />
      </div>

      <div className="flex items-center justify-between mb-3 gap-3">
        {item.site_name && (
          <span className="pill pill-purple truncate max-w-[200px]">
            {item.site_name}
          </span>
        )}
        {dateString && (
          <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
            <Clock size={11} /> {dateString}
          </span>
        )}
      </div>

      <h3
        className={`font-bold leading-snug mb-2 flex-1 ${isCarousel ? 'text-[1.05rem]' : 'text-lg'}`}
        style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
      >
        {item.title}
      </h3>

      {item.description && (
        <p
          className="text-sm leading-relaxed mb-4 line-clamp-3"
          style={{ color: 'var(--ink-soft)' }}
        >
          {item.description}
        </p>
      )}

      <div
        className="mt-auto pt-4 flex items-center gap-1.5 text-xs font-semibold"
        style={{ color: 'var(--brand-purple)', borderTop: '1px solid var(--line)' }}
      >
        Read more
        <ArrowUpRight
          size={13}
          className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        />
      </div>
    </Link>
  );
}
