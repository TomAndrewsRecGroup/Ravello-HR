import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { isManatalConfigured, lastManatalError, createManatalOrganization } from '@/lib/manatal';

export const runtime = 'nodejs';

// GET /api/manatal/diag
// Staff-only smoke endpoint so we can verify, from a browser, that
// the running deployment includes the Manatal write surface and
// that MANATAL_API_KEY is actually reaching the function. Also
// returns the commit SHA Vercel built from so we can confirm
// which deploy is answering.
//
// ?test=1 additionally fires a throwaway POST /organizations/ to
// Manatal with a junk name + an immediate cleanup hint, so we see
// the real status code + error message from Manatal in the
// response. Use sparingly — it creates a real org in Manatal that
// you'll want to delete manually.
export async function GET(req: Request) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const doTest = url.searchParams.get('test') === '1';

  const base = {
    ok:                  true,
    commit:              process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    commit_message:      process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    vercel_env:          process.env.VERCEL_ENV ?? null,
    api_key_present:     Boolean(process.env.MANATAL_API_KEY),
    api_key_length:      (process.env.MANATAL_API_KEY ?? '').length,
    api_url_env:         process.env.MANATAL_API_URL ?? null,
    is_manatal_configured: isManatalConfigured(),
  };

  if (!doTest) return NextResponse.json(base);

  // Live test path: actually call POST /organizations/.
  const stamp = `TPS-DIAG-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`;
  const result = await createManatalOrganization({
    name:        stamp,
    externalId:  'tps-diag',
    description: 'TPS-DIAG — safe to delete',
  });
  return NextResponse.json({
    ...base,
    test_run:        true,
    test_org_name:   stamp,
    created_org_id:  result?.id ?? null,
    last_error:      lastManatalError(),
  });
}
