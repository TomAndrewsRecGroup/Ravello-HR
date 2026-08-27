'use client';

/**
 * Open a stored file, whatever kind of reference the row carries.
 *
 * `file_url` means two different things across these tables and always
 * has: on some rows it is a link the operator pasted (Drive, YouTube, a
 * Vercel blob), on others it was a `getPublicUrl()` against the PRIVATE
 * `documents` bucket — a URL that cannot resolve. So this cannot simply
 * be swapped for a signed URL everywhere; it has to pick:
 *
 *   storagePath present → sign it at click time (the stored-file case)
 *   otherwise           → render fileUrl as an ordinary link (external)
 *
 * Signing on CLICK rather than at render means no signed URL is ever
 * baked into server-rendered HTML, nothing expires while the page sits
 * open, and a list of fifty documents costs zero signing calls until
 * somebody actually opens one.
 *
 * The blank window is opened BEFORE the await, as in `openAthleteCv` —
 * a `window.open` after an async gap is a popup the browser blocks.
 */

import { useState } from 'react';
import type { FileKindName } from '@/lib/storage/fileKinds';

interface Props {
  kind:         FileKindName;
  id:           string;
  /** The row's storage_path. Null/absent means fall back to fileUrl. */
  storagePath?: string | null;
  /** Legacy or operator-pasted URL. */
  fileUrl?:     string | null;
  className?:   string;
  style?:       React.CSSProperties;
  children:     React.ReactNode;
  /** Hint the browser to download rather than navigate (external only). */
  download?:    boolean;
  'aria-label'?: string;
}

export default function FileLink({
  kind, id, storagePath, fileUrl, className, style, children, download, ...rest
}: Props) {
  const [busy, setBusy] = useState(false);

  // No stored object: this is an external link the operator supplied.
  // Render it as a plain anchor — signing it would be meaningless.
  if (!storagePath) {
    if (!fileUrl) return null;
    return (
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        style={style}
        download={download}
        aria-label={rest['aria-label']}
      >
        {children}
      </a>
    );
  }

  async function open() {
    if (busy) return;
    setBusy(true);
    const w = window.open('about:blank', '_blank');
    try {
      const res = await fetch(`/api/files/sign?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (w) w.close();
        alert(`Couldn't open this file: ${j.error ?? res.statusText}`);
        return;
      }
      const { url } = await res.json() as { url: string };
      if (w) w.location.href = url;
    } catch (e) {
      if (w) w.close();
      alert(`Couldn't open this file: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className={className}
      style={style}
      aria-label={rest['aria-label']}
    >
      {children}
    </button>
  );
}
