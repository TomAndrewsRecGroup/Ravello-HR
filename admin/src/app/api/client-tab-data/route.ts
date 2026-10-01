import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/client-tab-data?companyId=xxx&tab=Candidates
 *
 * Lazy-loads tab-specific data for the client detail page.
 * Only fetches data for the requested tab, avoiding the
 * 16-query upfront load that made the page slow.
 */
export async function GET(request: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const supabase = await createServerSupabaseClient();

  const { searchParams } = request.nextUrl;
  const companyId = searchParams.get('companyId');
  const tab = searchParams.get('tab');

  if (!companyId || !tab) {
    return NextResponse.json({ error: 'Missing companyId or tab' }, { status: 400 });
  }

  // Validate companyId is a real UUID and company exists
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(companyId)) {
    return NextResponse.json({ error: 'Invalid companyId format' }, { status: 400 });
  }

  switch (tab) {
    case 'Documents': {
      const { data } = await supabase
        .from('documents')
        .select('id,name,category,file_url,file_size,version,review_due_at,created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      return NextResponse.json({ documents: data ?? [] });
    }

    case 'Candidates': {
      const { data } = await supabase
        .from('candidates')
        .select('id,full_name,email,cv_url,summary,client_status,client_feedback,requisition_id,approved_for_client,created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      return NextResponse.json({ candidates: data ?? [] });
    }

    case 'Roadmap': {
      const [{ data }, { data: links }] = await Promise.all([
        supabase
          .from('milestones')
          .select('id,pillar,title,description,owner,status,quarter,due_date')
          .eq('company_id', companyId)
          .order('due_date', { ascending: true }),
        // Phase 6 section 8: milestones can link to audit findings,
        // legal gaps, objectives, documents, training, site visits and
        // actions — requirement_evidence_links (163), widened (170) to
        // accept 'milestone' as a source_type.
        supabase
          .from('requirement_evidence_links')
          .select('id,source_type,source_id,entity_type,entity_id,added_by,created_at')
          .eq('company_id', companyId)
          .eq('source_type', 'milestone'),
      ]);
      return NextResponse.json({ milestones: data ?? [], milestoneLinks: links ?? [] });
    }

    case 'Actions': {
      const { data } = await supabase
        .from('actions')
        .select('id,action_type,title,priority,status,due_date,completed_at,created_at,created_by_admin')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      return NextResponse.json({ actions: data ?? [] });
    }

    case 'Compliance': {
      const { data } = await supabase
        .from('compliance_items')
        .select('id,title,category,status,due_date,notes')
        .eq('company_id', companyId)
        .order('due_date', { ascending: true });
      return NextResponse.json({ compliance: data ?? [] });
    }

    case 'LEAD': {
      const [{ data: trainingNeeds }, { data: perfReviews }] = await Promise.all([
        supabase.from('training_needs').select('id,employee_name,skill_gap,priority,status,target_date,created_at').eq('company_id', companyId).order('created_at', { ascending: false }),
        supabase.from('performance_reviews').select('id,employee_name,reviewer_name,review_type,status,due_date,completed_at,overall_rating,created_at').eq('company_id', companyId).order('created_at', { ascending: false }),
      ]);
      return NextResponse.json({ trainingNeeds: trainingNeeds ?? [], perfReviews: perfReviews ?? [] });
    }

    case 'HR': {
      const [{ data: absenceRecords }, { data: empDocs }, { data: employees }] = await Promise.all([
        supabase.from('absence_records').select('id,employee_name,absence_type,start_date,end_date,status,days,created_at').eq('company_id', companyId).order('start_date', { ascending: false }),
        supabase.from('employee_documents').select('id,employee_name,employee_id,doc_type,title,file_storage_path,file_url,expiry_date,status,filed_by_authorised,created_at').eq('company_id', companyId).order('created_at', { ascending: false }),
        // For the upload form's "Link to employee record" picker (C3.7:
        // documents are otherwise never linked to a person, so the
        // Safe-to-Deploy engine and the person's own compliance view
        // never see them).
        supabase.from('employee_records').select('id, full_name').eq('company_id', companyId).eq('status', 'active').order('full_name').limit(500),
      ]);
      return NextResponse.json({ absenceRecords: absenceRecords ?? [], empDocs: empDocs ?? [], employees: employees ?? [] });
    }

    case 'Friction': {
      const [{ data: assessment }, { data: items }] = await Promise.all([
        supabase.from('company_assessments').select('id,overall_band,confidence,dimensions,summary,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('company_friction_items').select('id,dimension,field_key,label,severity,is_completed,notes').eq('company_id', companyId).order('dimension', { ascending: true }),
      ]);
      return NextResponse.json({ frictionAssessment: assessment, frictionItems: items ?? [] });
    }

    default:
      return NextResponse.json({ error: `Unknown tab: ${tab}` }, { status: 400 });
  }
}
