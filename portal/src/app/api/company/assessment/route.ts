import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ivylensRequest } from '@/lib/ivylens';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createRateLimiter, getRateLimitKey } from '@/lib/rateLimit';

const limiter = createRateLimiter({ windowMs: 60_000, max: 5 }); // 5 assessments per minute

const AssessmentSchema = z.object({
  company_id: z.string().uuid().optional(),
  form_responses: z.record(z.unknown()).refine(obj => Object.keys(obj).length > 0, {
    message: 'form_responses must be a non-empty object',
  }),
  employee_count: z.number().int().min(0).max(100_000).optional(),
});

// POST /api/company/assessment
// Submits assessment to IvyLens, stores results locally in company_assessments.

function employeeBand(count: number): string {
  if (count <= 10) return 'micro';
  if (count <= 50) return 'small';
  if (count <= 250) return 'mid';
  return 'large';
}

export async function POST(req: NextRequest) {
  const { allowed, remaining } = limiter.check(getRateLimitKey(req));
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const parsed = AssessmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues.map(i => i.message).join('; ') }, { status: 400 });
    }
    const { company_id: ivylensCompanyId, form_responses, employee_count } = parsed.data;

    // Get user's company
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
    if (!profile?.company_id) {
      return NextResponse.json({ error: 'No company associated' }, { status: 400 });
    }

    // Submit to IvyLens
    const { data: result, error: apiError } = await ivylensRequest('/company/assessment', {
      method: 'POST',
      body: { company_id: ivylensCompanyId, form_responses },
      timeout: 30_000,
    });

    if (apiError) {
      return NextResponse.json({ error: `IvyLens error: ${apiError}` }, { status: 502 });
    }

    // Store assessment locally
    const empCount = employee_count ?? (typeof form_responses?.employee_count === 'number' ? form_responses.employee_count : 0);
    const band = employeeBand(empCount);
    const { data: assessment, error: dbErr } = await supabase
      .from('company_assessments')
      .insert({
        company_id:         profile.company_id,
        ivylens_company_id: ivylensCompanyId ?? null,
        employee_count:     empCount || null,
        employee_band:      band,
        form_responses,
        overall_band:       result?.overall?.band ?? null,
        confidence:         result?.confidence ?? null,
        dimensions:         result?.dimensions ?? [],
        top_signals:        result?.top_signals ?? [],
        summary:            result?.summary ?? null,
      })
      .select()
      .single();

    if (dbErr) {
      console.error('[assessment] DB insert error:', dbErr);
      return NextResponse.json({ error: dbErr.message }, { status: 500 });
    }

    // Update company friction_band
    await supabase
      .from('companies')
      .update({
        friction_band: result?.overall?.band ?? null,
        friction_assessment_id: assessment?.id ?? null,
      })
      .eq('id', profile.company_id);

    // Generate friction items (things they don't have) for admin checklist
    if (result?.dimensions) {
      const items: any[] = [];
      for (const dim of result.dimensions) {
        for (const signal of dim.signals ?? []) {
          items.push({
            company_id:    profile.company_id,
            assessment_id: assessment?.id,
            dimension:     dim.name,
            field_key:     signal.signal_type?.toLowerCase().replace(/\s+/g, '_') ?? 'unknown',
            label:         signal.detail ?? signal.signal_type,
            severity:      signal.severity ?? 'medium',
          });
        }
      }
      if (items.length) {
        // Clear old items for this company, insert new ones
        await supabase.from('company_friction_items').delete().eq('company_id', profile.company_id);
        await supabase.from('company_friction_items').insert(items);
      }
    }

    return NextResponse.json({ assessment, result });
  } catch (err) {
    console.error('[/api/company/assessment]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
