import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <p style={{ fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '0 0 8px' }}>404</p>
        <h1 className="font-display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', margin: '0 0 8px' }}>Page not found</h1>
        <p style={{ fontSize: 14, color: 'var(--ink-soft)', margin: '0 0 20px', lineHeight: 1.6 }}>
          That page does not exist, or it may have been renamed.
        </p>
        <Link href="/dashboard" className="btn-cta btn-sm">Back to dashboard</Link>
      </div>
    </main>
  );
}
