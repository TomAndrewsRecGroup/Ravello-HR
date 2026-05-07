import { promises as dns } from 'dns';

// IP ranges that should never be reachable from a server-side fetch
// triggered by user-supplied URLs. RFC1918 + loopback + link-local +
// CGNAT (100.64/10) + reserved + IPv6 equivalents.
const PRIVATE_IP_RE = [
  /^10\./,
  /^127\./,
  /^169\.254\./,                    // link-local + AWS / GCP metadata
  /^172\.(1[6-9]|2\d|3[0-1])\./,    // RFC1918
  /^192\.168\./,                    // RFC1918
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT 100.64/10
  /^0\./,                           // 'this network'
  /^224\./,                         // multicast
  /^240\./,                         // reserved
  // IPv6
  /^::1$/,
  /^::$/,
  /^fe80:/i,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^ff[0-9a-f]{2}:/i,               // multicast v6
];

const BLOCKED_HOSTS = new Set([
  'localhost', 'localhost.localdomain', '0.0.0.0', '0',
  'metadata.google.internal',
  'metadata',
  'ip6-localhost', 'ip6-loopback',
]);

const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);

/**
 * Throws if the URL is not safe for server-side fetch:
 *   - non-http(s) protocols (ftp, gopher, file, data, …)
 *   - non-default ports (block SMTP/DB/Redis/etc.)
 *   - host that resolves to a private / loopback / metadata IP
 *
 * NOTE: this is a TOCTOU check — between this call and the actual
 * TCP connect, DNS could change. For absolute safety, hand the
 * resolved IP to fetch and Host-header the original. We accept the
 * residual risk because the URLs are admin-supplied (low volume,
 * audited) and the worst-case post-rebind target is still just
 * whatever we exposed publicly.
 *
 * Backwards-compatible signature: `assertPublicHost(hostname)` still
 * works. Callers can opt into the stricter port/protocol checks by
 * passing them too.
 */
export async function assertPublicHost(hostname: string, port?: number, protocol?: string): Promise<void> {
  if (protocol && protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`Refusing fetch with unsupported scheme: ${protocol}`);
  }
  if (port && !ALLOWED_PORTS.has(port)) {
    throw new Error(`Refusing fetch on non-standard port: ${port}`);
  }

  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(lower)) {
    throw new Error(`Refusing to fetch blocked host: ${lower}`);
  }
  if (lower.endsWith('.local') || lower.endsWith('.internal')) {
    throw new Error(`Refusing to fetch local TLD: ${lower}`);
  }

  // Numeric IPs: check the literal directly (skip DNS).
  const literal = hostname.replace(/^\[|\]$/g, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(literal) || /^[0-9a-f:]+$/i.test(literal)) {
    if (PRIVATE_IP_RE.some((re) => re.test(literal))) {
      throw new Error(`Refusing to fetch private IP literal: ${hostname}`);
    }
    return;
  }

  const addresses = await dns.lookup(hostname, { all: true });
  if (!addresses.length) {
    throw new Error(`Refusing to fetch unresolvable host: ${hostname}`);
  }
  for (const a of addresses) {
    if (PRIVATE_IP_RE.some((re) => re.test(a.address))) {
      throw new Error(`Refusing to fetch private IP ${a.address} (${hostname})`);
    }
  }
}

/**
 * Fetch wrapper that re-validates the host after each redirect and
 * caps the response size. Use this whenever a user-supplied URL is
 * fetched server-side. The 30x dance prevents an attacker from
 * pointing a public URL at a 302 to localhost.
 */
export async function safeFetch(url: string, opts: {
  headers?:      Record<string, string>;
  timeoutMs?:    number;
  maxBytes?:     number;
  maxRedirects?: number;
} = {}): Promise<Response> {
  const { timeoutMs = 10_000, maxBytes = 10_000_000, maxRedirects = 3 } = opts;

  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const u = new URL(current);
    await assertPublicHost(u.hostname, u.port ? Number(u.port) : undefined, u.protocol);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(current, {
        headers:  opts.headers,
        redirect: 'manual',
        signal:   ctrl.signal,
      });
    } finally { clearTimeout(timer); }

    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      if (!next) return res;
      current = new URL(next, current).toString();
      continue;
    }

    const cl = Number(res.headers.get('content-length') ?? '0');
    if (cl && cl > maxBytes) {
      throw new Error(`Refusing oversized response (${cl} bytes, cap ${maxBytes})`);
    }
    return res;
  }
  throw new Error(`Too many redirects (>${maxRedirects})`);
}
