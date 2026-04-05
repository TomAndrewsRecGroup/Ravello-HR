import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import TaskBoardClient from './TaskBoardClient';

export const metadata: Metadata = { title: 'Tasks' };

export default async function TasksPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [tasksRes, staffRes, companiesRes] = await Promise.all([
    supabase.from('internal_tasks')
      .select('*, profiles!internal_tasks_assigned_to_fkey(full_name), companies(name)')
      .order('created_at', { ascending: false }),
    supabase.from('profiles')
      .select('id, full_name, role')
      .in('role', ['tps_admin', 'tps_client'])
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
          tasks={tasksRes.data ?? []}
          staff={staffRes.data ?? []}
          companies={companiesRes.data ?? []}
        />
      </main>
    </>
  );
}
