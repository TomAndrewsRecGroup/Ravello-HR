'use client';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface FaqItem {
  q: string;
  a: string;
}

interface FaqBlockProps {
  title?: string;
  items: FaqItem[];
  dark?: boolean;
}

export default function FaqBlock({ title = 'Frequently asked questions', items, dark = false }: FaqBlockProps) {
  const [open, setOpen] = useState<number | null>(null);

  const ink     = dark ? 'rgba(255,255,255,0.92)' : 'var(--ink)';
  const inkSoft = dark ? 'rgba(255,255,255,0.58)' : 'var(--ink-soft)';
  const line    = dark ? 'rgba(255,255,255,0.08)' : 'var(--brand-line)';
  const bg      = dark ? 'rgba(255,255,255,0.04)' : 'var(--surface-alt)';

  return (
    <section
      className="section-padding"
      style={{ background: dark ? 'var(--brand-navy)' : 'var(--bg)' }}
      itemScope
      itemType="https://schema.org/FAQPage"
    >
      <div className="container-narrow">
        {title && (
          <h2 className="font-display section-title mb-10" style={{ color: ink }}>
            {title}
          </h2>
        )}

        <div className="space-y-2">
          {items.map((item, i) => (
            <div
              key={i}
              className="rounded-[14px] overflow-hidden"
              style={{ border: `1px solid ${line}` }}
              itemScope
              itemProp="mainEntity"
              itemType="https://schema.org/Question"
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left transition-colors"
                style={{ background: open === i ? bg : 'transparent' }}
                aria-expanded={open === i}
              >
                <span
                  className="font-semibold text-sm leading-snug"
                  style={{ color: ink }}
                  itemProp="name"
                >
                  {item.q}
                </span>
                <ChevronDown
                  size={16}
                  style={{
                    color: inkSoft,
                    flexShrink: 0,
                    transform: open === i ? 'rotate(180deg)' : 'rotate(0)',
                    transition: 'transform 0.2s ease',
                  }}
                />
              </button>

              {open === i && (
                <div
                  className="px-6 pb-5 text-sm leading-relaxed"
                  style={{ color: inkSoft }}
                  itemScope
                  itemProp="acceptedAnswer"
                  itemType="https://schema.org/Answer"
                >
                  <p itemProp="text">{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
