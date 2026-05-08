import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { assertBodySize } from '@/lib/http/bodySize';
import { extractBrand } from '@/lib/brand/extract';

// POST /api/brand-extract
// Body: { url?: string, github_css_url?: string }
// Returns a draft BrandExtraction the admin can edit before save.
// Staff only — calls outbound HTTP, SSRF-guarded by assertPublicHost.
export async function POST(req: NextRequest) {
  const tooBig = assertBodySize(req, 16 * 1024);
  if (tooBig) return tooBig;

  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  let body: { url?: string; github_css_url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const url = typeof body.url === 'string' && body.url.trim() ? body.url.trim() : null;
  const githubCssUrl = typeof body.github_css_url === 'string' && body.github_css_url.trim()
    ? body.github_css_url.trim() : null;
  if (!url && !githubCssUrl) {
    return NextResponse.json({ error: 'Provide url or github_css_url' }, { status: 400 });
  }

  try {
    const result = await extractBrand({ url, githubCssUrl });
    return NextResponse.json({ brand: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Extraction failed';
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
