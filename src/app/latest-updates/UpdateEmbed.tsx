// Renders third-party embeds from a typed kind + ref rather than
// free-form HTML. Admin never writes <iframe> text to the DB —
// this component holds the canonical template for each kind.

interface Props {
  kind: 'linkedin';
  ref: string;
}

export default function UpdateEmbed({ kind, ref }: Props) {
  if (kind === 'linkedin') {
    // Numeric activity ID guaranteed by admin ingest regex; we still
    // defensively reject non-digits so a malformed DB row cannot
    // inject into the iframe src.
    if (!/^\d+$/.test(ref)) return null;
    const src = `https://www.linkedin.com/embed/feed/update/urn:li:activity:${ref}`;
    return (
      <div className="card p-0 overflow-hidden" style={{ minHeight: 600 }}>
        <iframe
          src={src}
          width="100%"
          height="600"
          frameBorder="0"
          allowFullScreen
          title="Embedded LinkedIn post"
        />
      </div>
    );
  }
  return null;
}
