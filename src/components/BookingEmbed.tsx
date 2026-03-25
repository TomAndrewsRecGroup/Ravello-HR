'use client';
// Isolated client component so the iframe never runs during SSR/static generation
export default function BookingEmbed({ src }: { src: string }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-line)', background: 'var(--surface-alt)' }}>
      <iframe
        src={src}
        style={{ border: 0, width: '100%', height: 520 }}
        title="Book a free call with The People Office"
      />
    </div>
  );
}
