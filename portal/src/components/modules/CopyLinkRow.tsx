'use client';

import { useEffect, useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface Props {
  label: string;
  /** Absolute URL, or a path beginning with "/" (resolved against the current origin). */
  url: string;
  hint?: string;
}

export default function CopyLinkRow({ label, url, hint }: Props) {
  const [copied, setCopied] = useState(false);
  // Render the given value on the server and first client paint to avoid a
  // hydration mismatch; upgrade a relative path to absolute after mount.
  const [display, setDisplay] = useState(url);

  useEffect(() => {
    if (url.startsWith('/')) setDisplay(window.location.origin + url);
    else setDisplay(url);
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(display);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — user can still select the text */
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="label" style={{ marginBottom: 0 }}>{label}</span>
        {hint && <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>{hint}</span>}
      </div>
      <div className="flex items-center gap-2">
        <input className="input flex-1" readOnly value={display} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" onClick={copy} className="btn-secondary btn-sm flex items-center gap-1.5 whitespace-nowrap">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
