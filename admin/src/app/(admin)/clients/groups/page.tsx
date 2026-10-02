// Group Roll-Up Reporting (go-live gap list, item 6, 2026-10-02).
// Index of every company that is a group parent — reusing the same
// companies.parent_organisation_id column the Organisations page's own
// dropdown already writes. Links to the per-group roll-up.
import type { Metadata } from 'next';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import { groupParents, type GroupCompanyRow } from '@/lib/groupRollup/compute';
import { Network } from 'lucide-react';

export const metadata: Metadata = { title: 'Group Roll-Up Reporting' };
export const dynamic = 'force-dynamic';

export default async function GroupRollupIndexPage() {
  const supabase = await createServerSupabaseClient();
  const { rows: companies, error } = await readAllPages<GroupCompanyRow>((from, to) =>
    supabase.from('companies').select('id, name, parent_organisation_id, monthly_retainer_pence, active')
      .order('id').range(from, to));

  const parents = groupParents(companies);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center gap-2">
          <Network size={20} style={{ color: 'var(--purple)' }} />
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>Group Roll-Up Reporting</h1>
        </div>
        <p className="text-sm mt-1" style={{ color: 'var(--ink-faint)' }}>
          A consolidated view across sibling companies under one parent. Set a company&rsquo;s parent on the{' '}
          <Link href="/organisations" className="underline">Organisations &amp; Access</Link> page.
        </p>
      </div>

      {error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load companies.</p>}

      {parents.length === 0 ? (
        <div className="card p-10">
          <div className="empty-state">
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              No company is set as the parent of another yet.
            </p>
          </div>
        </div>
      ) : (
        <div className="card p-5">
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Group</th><th style={{ textAlign: 'right' }}>Members</th></tr></thead>
              <tbody>
                {parents.map(p => (
                  <tr key={p.id}>
                    <td><Link href={`/clients/groups/${p.id}`} style={{ color: 'var(--purple)' }}>{p.name}</Link></td>
                    <td style={{ textAlign: 'right' }}>{p.memberCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
