import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ClientDetailTabs from './ClientDetailTabs';

export const metadata: Metadata = { title: 'Client Detail' };

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();

  const [
    { data: company },
    { data: users },
    { data: reqs },
    { data: documents },
    { data: milestones },
    { data: services },
    { data: tickets },
    { data: actions },
    { data: candidates },
    { data: compliance },
    { data: trainingNeeds },
    { data: perfReviews },
    { data: absenceRecords },
    { data: empDocs },
    { data: frictionAssessment },
    { data: frictionItems },
  ] = await Promise.all([
    supabase.from('companies').select('id,name,slug,sector,size_band,contact_email,active,feature_flags,manatal_client_id,account_owner,open_days,open_hours,timezone,currency').eq('id', params.id).single(),
    supabase.from('profiles').select('id,email,full_name,role,created_at').eq('company_id', params.id).order('created_at'),
    supabase.from('requisitions').select('id,title,department,seniority,stage,salary_range,location,employment_type,friction_score,friction_level,assigned_recruiter,created_at').eq('company_id', params.id).order('created_at', { ascending: false }),
    supabase.from('documents').select('id,name,category,file_url,file_size,version,review_due_at,created_at').eq('company_id', params.id).order('created_at', { ascending: false }),
    supabase.from('milestones').select('id,pillar,title,status,quarter,due_date').eq('company_id', params.id).order('due_date', { ascending: true }),
    supabase.from('client_services').select('id,service_name,service_tier,start_date,monthly_fee,status').eq('company_id', params.id).order('start_date', { ascending: false }),
    supabase.from('tickets').select('id,subject,status,priority').eq('company_id', params.id).neq('status', 'closed'),
    supabase.from('actions').select('id,action_type,title,priority,status,due_date,completed_at,created_at,created_by_admin').eq('company_id', params.id).order('created_at', { ascending: false }),
    supabase.from('candidates').select('id,full_name,email,cv_url,summary,client_status,client_feedback,requisition_id,approved_for_client,created_at').eq('company_id', params.id).order('created_at', { ascending: false }),
    supabase.from('compliance_items').select('id,title,category,status,due_date,notes').eq('company_id', params.id).order('due_date', { ascending: true }),
    supabase.from('training_needs').select('id,employee_name,topic,priority,status,due_date,created_at').eq('company_id', params.id).order('created_at', { ascending: false }),
    supabase.from('performance_reviews').select('id,employee_name,reviewer_name,review_type,status,scheduled_date,completed_date,overall_rating,created_at').eq('company_id', params.id).order('created_at', { ascending: false }),
    supabase.from('absence_records').select('id,employee_name,absence_type,start_date,end_date,status,days_taken,created_at').eq('company_id', params.id).order('start_date', { ascending: false }),
    supabase.from('employee_documents').select('id,employee_name,document_type,expiry_date,status,created_at').eq('company_id', params.id).order('created_at', { ascending: false }),
    supabase.from('company_assessments').select('id,overall_score,overall_band,dimension_scores,created_at').eq('company_id', params.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('company_friction_items').select('id,dimension,score,label,recommendation').eq('company_id', params.id).order('dimension', { ascending: true }),
  ]);

  if (!company) notFound();

  const c = company as any;

  const activeRoles = (reqs ?? []).filter((r: any) => !['filled', 'cancelled'].includes(r.stage)).length;
  const docsCount   = (documents ?? []).length;
  const ticketCount = (tickets ?? []).length;

  return (
    <>
      <AdminTopbar
        title={c.name}
        subtitle={[c.sector, c.size_band].filter(Boolean).join(' · ')}
        actions={<Link href="/clients" className="btn-secondary btn-sm">← All Clients</Link>}
      />
      <main className="admin-page flex-1">
        <ClientDetailTabs
          company={c}
          users={users ?? []}
          reqs={reqs ?? []}
          documents={documents ?? []}
          milestones={milestones ?? []}
          services={services ?? []}
          actions={actions ?? []}
          candidates={candidates ?? []}
          compliance={compliance ?? []}
          trainingNeeds={trainingNeeds ?? []}
          perfReviews={perfReviews ?? []}
          absenceRecords={absenceRecords ?? []}
          empDocs={empDocs ?? []}
          frictionAssessment={frictionAssessment ?? null}
          frictionItems={frictionItems ?? []}
          stats={{ activeRoles, docsCount, ticketCount }}
        />
      </main>
    </>
  );
}
