import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Preview | Athletes To Industry', robots: { index: false, follow: false } };

// Where the Match me and unsubscribe links in a TEST or preview of the
// Thursday roles email point. A real email carries a personal link
// instead; this page exists so a test email's buttons go somewhere
// harmless rather than acting on anyone's behalf.

export default function RolesPreviewPage() {
  return (
    <section className="px-6 md:px-12 pb-16 pt-4">
      <div className="mx-auto a2i-panel" style={{ maxWidth: 640, padding: 'clamp(24px, 4vw, 40px)' }}>
        <p className="a2i-section-label">Preview</p>
        <h1 className="a2i-display mt-3" style={{ fontSize: 28 }}>This is a test email.</h1>
        <p className="a2i-prose mt-4" style={{ fontSize: 15 }}>
          In the real email each athlete gets their own link here, which opens the Match me page for the role
          they tapped. Nothing has been recorded.
        </p>
      </div>
    </section>
  );
}
