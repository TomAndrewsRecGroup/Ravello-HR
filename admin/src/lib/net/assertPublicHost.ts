import { promises as dns } from 'dns';

const PRIVATE_IP_RE = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^::1$/,
  /^fe80:/i,
  /^f[cd][0-9a-f]{2}:/i,
];

export async function assertPublicHost(hostname: string): Promise<void> {
  if (hostname === 'localhost' || hostname === '0.0.0.0') {
    throw new Error('Refusing to fetch local host');
  }
  const addresses = await dns.lookup(hostname, { all: true });
  for (const a of addresses) {
    if (PRIVATE_IP_RE.some(re => re.test(a.address))) {
      throw new Error(`Refusing to fetch private IP ${a.address}`);
    }
  }
}
