// ═══════════════════════════════════════════════════════════
// Minimal allow-list HTML sanitiser for dev-plan rich text.
//
// Content is authored only by TPS staff through the constrained
// Tiptap toolbar (bold / italic / H2-H3 / lists / links), so the
// realistic XSS surface is tiny — but this output is rendered to
// clients in the portal, so we sanitise as defence in depth
// before dangerouslySetInnerHTML.
//
// Runs with no DOM dependency (server components), so it is a
// conservative regex/allow-list pass rather than a full parser.
// Duplicated verbatim in admin/ and portal/.
// ═══════════════════════════════════════════════════════════

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
  'h2', 'h3', 'ul', 'ol', 'li', 'a', 'blockquote', 'code', 'pre', 'span',
]);

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return '';
  let html = String(input);

  // Drop entire script/style blocks (content included).
  html = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');

  // Walk every tag; strip disallowed tags and unsafe attributes.
  html = html.replace(/<(\/?)([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (_m, slash, rawName, rawAttrs) => {
    const name = String(rawName).toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return '';
    if (slash) return `</${name}>`;

    // Only <a> keeps attributes (href/target/rel); everything else is stripped bare.
    if (name === 'a') {
      const href = extractAttr(rawAttrs, 'href');
      const safeHref = href && isSafeUrl(href) ? href : null;
      return safeHref
        ? `<a href="${escapeAttr(safeHref)}" target="_blank" rel="noopener noreferrer nofollow">`
        : '<a>';
    }
    return `<${name}>`;
  });

  return html;
}

function extractAttr(attrs: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = re.exec(attrs);
  if (!m) return null;
  return (m[2] ?? m[3] ?? m[4] ?? '').trim();
}

function isSafeUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (u.startsWith('javascript:') || u.startsWith('data:') || u.startsWith('vbscript:')) return false;
  return /^(https?:\/\/|mailto:|tel:|\/|#)/.test(u);
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
