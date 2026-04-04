import { NextResponse } from 'next/server';
import { ivylensRequest } from '@/lib/ivylens';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// GET /api/company/form-schema
// Proxy to IvyLens — returns form field definitions, types, and size gating rules.
// Public endpoint on IvyLens side (no auth required), but we proxy to keep URL private.

export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error, status } = await ivylensRequest('/company/form-schema');

  if (error) {
    return NextResponse.json(
      { error: `IvyLens unavailable: ${error}` },
      { status: status || 503 },
    );
  }

  return NextResponse.json(data);
}
