import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import {
  isManatalConfigured,
  createManatalJob,
  publishManatalJob,
  lastManatalError,
} from '@/lib/manatal';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Map "£40k-£60k" style strings to { min, max } in pence-free integers.
// Keeps the wrapper simple: anything we can't parse stays null.
function parseSalaryRange(s: string | null): { min: number | null; max: number | null } {
  if (!s) return { min: null, max: null };
  const nums = s.replace(/[£,]/g, '').match(/(\d+)(k)?/gi) ?? [];
  const vals = nums.map(n => {
    const k = /k$/i.test(n);
    const v = parseInt(n.replace(/k$/i, ''), 10);
    return k ? v * 1000 : v;
  }).filter(n => !isNaN(n) && n > 0);
  if (vals.length === 0) return { min: null, max: null };
  if (vals.length === 1) return { min: vals[0], max: vals[0] };
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

// POST /api/admin/requisitions/[id]/manatal-publish
// Pushes a requisition to Manatal: creates the job under the client's
// Manatal organization, then publishes it (Careers page + free job
// boards). Writes manatal_job_id + manatal_published_at back on the
// requisition. Idempotent re-publish is supported — if a job id
// already exists the route just toggles publish on it again.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  if (!isManatalConfigured()) {
    return NextResponse.json({ error: 'Manatal is not configured on this environment.' }, { status: 503 });
  }

  const supabase = createServerSupabaseClient();
  const { data: req, error: loadErr } = await supabase
    .from('requisitions')
    .select('id,title,description,location,employment_type,seniority,salary_range,manatal_job_id,companies(manatal_client_id)')
    .eq('id', params.id)
    .single();
  if (loadErr || !req) {
    return NextResponse.json({ error: loadErr?.message ?? 'Requisition not found' }, { status: 404 });
  }

  // The PostgREST embed returns the FK relation as an object or, in
  // older typings, an array. Handle both shapes defensively.
  const companyRel = (req as any).companies;
  const organizationId: string | null = Array.isArray(companyRel)
    ? companyRel[0]?.manatal_client_id ?? null
    : companyRel?.manatal_client_id ?? null;
  if (!organizationId) {
    return NextResponse.json({
      error: "This client isn't linked to Manatal yet — set manatal_client_id on the client profile.",
    }, { status: 400 });
  }

  // Reuse an existing job id if the requisition was already pushed,
  // otherwise create a new one. The publish step runs in both branches
  // so admins can re-publish if Manatal lost the toggle.
  let jobId: string | null = req.manatal_job_id ?? null;

  if (!jobId) {
    const { min, max } = parseSalaryRange(req.salary_range ?? null);
    const created = await createManatalJob({
      organizationId,
      title:           req.title,
      description:     req.description ?? null,
      location:        req.location ?? null,
      employmentType:  req.employment_type ?? null,
      salaryMin:       min,
      salaryMax:       max,
      salaryCurrency:  'GBP',
      seniority:       req.seniority ?? null,
    });
    if (!created?.id) {
      const err = lastManatalError();
      return NextResponse.json({ error: err?.message ?? 'Manatal job create failed.' }, { status: 502 });
    }
    jobId = created.id;
  }

  const published = await publishManatalJob(jobId);
  if (!published) {
    const err = lastManatalError();
    return NextResponse.json({ error: err?.message ?? 'Manatal job publish failed.' }, { status: 502 });
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('requisitions')
    .update({ manatal_job_id: jobId, manatal_published_at: now })
    .eq('id', req.id);
  if (updErr) {
    return NextResponse.json({
      error: `Published in Manatal but local update failed: ${updErr.message}`,
      manatal_job_id: jobId,
    }, { status: 500 });
  }

  return NextResponse.json({ ok: true, manatal_job_id: jobId, manatal_published_at: now });
}
