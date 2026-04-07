import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/client-tab-data?companyId=xxx&tab=Candidates
 *
 * Lazy-loads tab-specific data for the client detail page.
 * Only fetches data for the requested tab, avoiding the
 * 16-query upfront load that made the page slow.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const companyId = searchParams.get('companyId');
  const tab = searchParams.get('tab');

  if (!companyId || !tab) {
    return NextResponse.json({ error: 'Missing companyId or tab' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

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
      const { data } = await supabase
        .from('milestones')
        .select('id,pillar,title,status,quarter,due_date')
        .eq('company_id', companyId)
        .order('due_date', { ascending: true });
      return NextResponse.json({ milestones: data ?? [] });
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
        supabase.from('training_needs').select('id,employee_name,topic,priority,status,due_date,created_at').eq('company_id', companyId).order('created_at', { ascending: false }),
        supabase.from('performance_reviews').select('id,employee_name,reviewer_name,review_type,status,scheduled_date,completed_date,overall_rating,created_at').eq('company_id', companyId).order('created_at', { ascending: false }),
      ]);
      return NextResponse.json({ trainingNeeds: trainingNeeds ?? [], perfReviews: perfReviews ?? [] });
    }

    case 'PROTECT': {
      const [{ data: absenceRecords }, { data: empDocs }] = await Promise.all([
        supabase.from('absence_records').select('id,employee_name,absence_type,start_date,end_date,status,days_taken,created_at').eq('company_id', companyId).order('start_date', { ascending: false }),
        supabase.from('employee_documents').select('id,employee_name,document_type,expiry_date,status,created_at').eq('company_id', companyId).order('created_at', { ascending: false }),
      ]);
      return NextResponse.json({ absenceRecords: absenceRecords ?? [], empDocs: empDocs ?? [] });
    }

    case 'Services': {
      const { data } = await supabase
        .from('client_services')
        .select('id,service_name,service_tier,start_date,monthly_fee,status')
        .eq('company_id', companyId)
        .order('start_date', { ascending: false });
      return NextResponse.json({ services: data ?? [] });
    }

    case 'Friction': {
      const [{ data: assessment }, { data: items }] = await Promise.all([
        supabase.from('company_assessments').select('id,overall_score,overall_band,dimension_scores,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('company_friction_items').select('id,dimension,score,label,recommendation').eq('company_id', companyId).order('dimension', { ascending: true }),
      ]);
      return NextResponse.json({ frictionAssessment: assessment, frictionItems: items ?? [] });
    }

    default:
      return NextResponse.json({ error: `Unknown tab: ${tab}` }, { status: 400 });
  }
}
