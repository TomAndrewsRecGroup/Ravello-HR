'use client';

import { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import UpdateCard, { type UpdateItem } from './UpdateCard';

interface Props {
  items: UpdateItem[];
}

export default function FeaturedCarousel({ items }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;

    function update() {
      if (!el) return;
      setCanLeft(el.scrollLeft > 4);
      setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    }

    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [items.length]);

  function scrollBy(dir: 1 | -1) {
    const el = scroller.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>('[data-carousel-card]');
    const step = first ? first.offsetWidth + 20 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  }

  if (items.length === 0) return null;

  return (
    <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '2.5rem', paddingBottom: '2.5rem' }}>
      <div className="container-wide">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <p className="eyebrow mb-3">
              <span className="w-1.5 h-1.5 rounded-full inline-block mr-2" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
              Featured
            </p>
            <h2 className="font-display section-title" style={{ marginBottom: 0 }}>Editor&apos;s picks</h2>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <button
              aria-label="Scroll featured left"
              onClick={() => scrollBy(-1)}
              disabled={!canLeft}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: '#fff', border: '1px solid var(--brand-line)', color: 'var(--ink)' }}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              aria-label="Scroll featured right"
              onClick={() => scrollBy(1)}
              disabled={!canRight}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: '#fff', border: '1px solid var(--brand-line)', color: 'var(--ink)' }}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div
          ref={scroller}
          className="featured-scroller flex gap-5 overflow-x-auto pb-4 -mx-4 px-4"
          style={{
            scrollSnapType: 'x mandatory',
            scrollPadding: '0 16px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {items.map(item => (
            <div key={item.id} data-carousel-card className="flex-shrink-0">
              <UpdateCard item={item} variant="carousel" />
            </div>
          ))}
        </div>
      </div>
      <style jsx>{`
        .featured-scroller::-webkit-scrollbar { display: none; }
      `}</style>
    </section>
  );
}
