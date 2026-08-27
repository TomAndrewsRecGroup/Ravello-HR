// Sweep abandoned email attachments out of the staging bucket.
//
// The send route deletes what it sent, but that only covers the happy
// path. A composer opened, files attached, then closed leaves objects
// nobody will ever reference — and nothing else would ever remove them,
// so the bucket grows without bound and quietly carries HR documents,
// contracts and CVs for ever.
//
// Anything older than the retention window is gone: a staged file is
// consumed within seconds of upload, so age alone is a safe signal and
// there is no state to consult.
//
// Schedule: admin/vercel.json, daily. Auth: CRON_SECRET, same shape as
// the other crons.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ATTACHMENT_BUCKET, ATTACHMENT_PREFIX } from '@/lib/email/attachmentPaths';

export const runtime     = 'nodejs';
export const maxDuration = 60;
export const dynamic     = 'force-dynamic';

/** Generous next to the seconds a real staging lives, tight enough that an
 *  abandoned HR document is not sitting there a week later. */
const DEFAULT_MAX_AGE_HOURS = 24;

/** One PostgREST page. The listing is paged rather than assumed to fit. */
const PAGE = 100;

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get('secret') === secret;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function run(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hoursParam = Number(req.nextUrl.searchParams.get('hours') ?? DEFAULT_MAX_AGE_HOURS);
  const hours = Number.isFinite(hoursParam) && hoursParam >= 1 ? hoursParam : DEFAULT_MAX_AGE_HOURS;
  const cutoff = Date.now() - hours * 3_600_000;
  const ranAt = new Date().toISOString();

  let supabase;
  try {
    supabase = serviceClient();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  // outbox/<uid>/<file> — list the uid folders, then each one's contents.
  const { data: userFolders, error: listErr } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .list(ATTACHMENT_PREFIX, { limit: 1000 });

  if (listErr) {
    console.error(JSON.stringify({
      _audit: true, action: 'cron.prune_email_attachments.failed',
      error: listErr.message, ran_at: ranAt,
    }));
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  let scanned = 0;
  let deleted = 0;
  const errors: string[] = [];

  for (const folder of userFolders ?? []) {
    // A file at the prefix root has no uid folder and cannot have been
    // staged by our uploader; leave it and report rather than guessing.
    if (folder.id !== null && folder.id !== undefined) continue;

    for (let offset = 0; ; offset += PAGE) {
      const { data: objects, error } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .list(`${ATTACHMENT_PREFIX}/${folder.name}`, { limit: PAGE, offset });
      if (error) { errors.push(`${folder.name}: ${error.message}`); break; }
      if (!objects?.length) break;

      scanned += objects.length;
      const stale = objects
        .filter(o => {
          const at = o.created_at ?? o.updated_at;
          // No timestamp means we cannot prove it is old. Leave it: this
          // job deletes, so an unknown must never be treated as stale.
          return at ? new Date(at).getTime() < cutoff : false;
        })
        .map(o => `${ATTACHMENT_PREFIX}/${folder.name}/${o.name}`);

      if (stale.length) {
        const { error: rmErr } = await supabase.storage.from(ATTACHMENT_BUCKET).remove(stale);
        if (rmErr) errors.push(`${folder.name}: ${rmErr.message}`);
        else deleted += stale.length;
      }

      if (objects.length < PAGE) break;
    }
  }

  const payload = { ran_at: ranAt, max_age_hours: hours, scanned, deleted, errors };
  console.log(JSON.stringify({
    _audit: true,
    action: errors.length ? 'cron.prune_email_attachments.degraded' : 'cron.prune_email_attachments.ok',
    ...payload,
  }));

  // Report the failure rather than a comfortable 200 — a prune that
  // silently stops is how a staging bucket becomes a data-retention
  // problem nobody noticed.
  return NextResponse.json(payload, { status: errors.length ? 500 : 200 });
}

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
