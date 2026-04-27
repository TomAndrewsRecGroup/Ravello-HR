import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import TaskBoardClient from './TaskBoardClient';

export const metadata: Metadata = { title: 'Tasks' };
export const revalidate = 30;

export default async function TasksPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [tasksRes, staffRes, companiesRes] = await Promise.all([
    supabase.from('internal_tasks')
      .select('id,title,description,priority,status,due_date,company_id,assigned_to,completed_at,created_at,profiles!internal_tasks_assigned_to_fkey(full_name),companies(name)')
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase.from('profiles')
      .select('id, full_name, role')
      .eq('role', 'tps_admin')
      .order('full_name'),
    supabase.from('companies')
      .select('id, name')
      .eq('active', true)
      .order('name'),
  ]);

  return (
    <>
      <AdminTopbar title="Tasks" subtitle="Internal TPS to-do board" />
      <main className="admin-page flex-1">
        <TaskBoardClient
          userId={user?.id ?? ''}
          tasks={(tasksRes.data ?? []) as any}
          staff={staffRes.data ?? []}
          companies={companiesRes.data ?? []}
        />
      </main>
    </>
  );
}
