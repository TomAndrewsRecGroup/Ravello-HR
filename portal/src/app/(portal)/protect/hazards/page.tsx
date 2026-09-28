import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Plus } from 'lucide-react';
import { getSafetyContext, orgDirectory, orgSitesAndDepartments, nameOf, param, fmtDate } from '@/lib/hs/safetyContext';
import {
  HAZARD_STATUSES, HAZARD_STATUS_LABELS, HAZARD_SOURCE_LABELS, RISK_LEVELS, RISK_LEVEL_LABELS, hazardPath,
  type HazardSource, type HazardStatus, type RiskLevel,
} from '@/lib/hs/safetyVocab';
import FilterForm from '@/components/safety/FilterForm';
import CsvButton from '@/components/safety/CsvButton';
import SafetyEmpty from '@/components/safety/SafetyEmpty';
import Pill, { toneFor } from '@/components/safety/Pill';

export const metadata: Metadata = { title: 'Hazards' };
export const dynamic = 'force-dynamic';

const LIMIT = 500;

// The Hazard Register (123). A hazard is a source of harm, not an
// assessment of it. People who manage risk see the organisation's
// register; anyone else sees only what they reported (RLS).
export default async function HazardsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const ctx = await getSafetyContext();
  const { supabase, companyId } = ctx;
  if (!companyId) return <main className="portal-page flex-1"><p className="card p-4 text-sm">No organisation is selected.</p></main>;

  const f = { q: param(sp, 'q'), status: param(sp, 'status'), category: param(sp, 'category'), site: param(sp, 'site'),
    owner: param(sp, 'owner'), seriousness: param(sp, 'seriousness') };

  let q = supabase.from('hazards')
    .select('id, reference, title, status, source, perceived_seriousness, site_id, linked_location, hazard_category_id, owner_id, identified_at', { count: 'exact' })
    .eq('company_id', companyId);
  if (f.status) q = q.eq('status', f.status); else q = q.neq('status', 'archived');
  if (f.category) q = q.eq('hazard_category_id', f.category);
  if (f.site) q = q.eq('site_id', f.site);
  if (f.owner) q = f.owner === 'none' ? q.is('owner_id', null) : q.eq('owner_id', f.owner);
  if (f.seriousness) q = q.eq('perceived_seriousness', f.seriousness);
  if (f.q) {
    const pat = `%${f.q.replace(/[%_\\,()]/g, ' ')}%`;
    q = q.or(`reference.ilike.${pat},title.ilike.${pat}`);
  }

  const [{ data, count, error }, cats, { sites }, dir] = await Promise.all([
    q.order('identified_at', { ascending: false }).limit(LIMIT),
    supabase.from('hazard_categories').select('id, name, company_id').eq('active', true).order('sort_order').limit(200),
    orgSitesAndDepartments(supabase, companyId),
    orgDirectory(supabase),
  ]);
  const rows = (data ?? []) as { id: string; reference: string; title: string; status: HazardStatus; source: HazardSource;
    perceived_seriousness: RiskLevel | null; site_id: string | null; linked_location: string | null; hazard_category_id: string | null;
    owner_id: string | null; identified_at: string }[];
  const catName = new Map((cats.data ?? []).map(c => [c.id as string, c.name as string]));
  const siteName = new Map(sites.map(s => [s.id, s.name]));
  const manage = ctx.can('hazard.manage') || ctx.can('risk.read');

  const csvRows = rows.map(r => ({
    reference: r.reference, title: r.title, status: HAZARD_STATUS_LABELS[r.status], category: catName.get(r.hazard_category_id ?? '') ?? '',
    site: r.site_id ? siteName.get(r.site_id) ?? '' : r.linked_location ?? '', seriousness: r.perceived_seriousness ?? '',
    owner: r.owner_id ? nameOf(dir, r.owner_id) : '', identified: r.identified_at.slice(0, 10), source: HAZARD_SOURCE_LABELS[r.source],
  }));

  return (
    <main className="portal-page flex-1 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          {manage ? 'Every hazard identified in this organisation.' : 'The hazards you have reported. The H&S team reviews each one.'}
        </p>
        <div className="ml-auto flex gap-2">
          <CsvButton filename="hazards.csv" rows={csvRows} columns={[
            { key: 'reference', label: 'Reference' }, { key: 'title', label: 'Hazard' }, { key: 'status', label: 'Status' },
            { key: 'category', label: 'Category' }, { key: 'site', label: 'Site / location' }, { key: 'seriousness', label: 'Perceived seriousness' },
            { key: 'owner', label: 'Owner' }, { key: 'identified', label: 'Identified' }, { key: 'source', label: 'Source' },
          ]} />
          {ctx.can('hazard.report') && (
            <Link href="/protect/hazards/new" className="btn-cta btn-sm" style={{ minHeight: 40 }}><Plus size={14} /> Report a hazard</Link>
          )}
        </div>
      </div>

      {manage && (
        <FilterForm fields={[
          { name: 'q', label: 'Search', type: 'search', value: f.q },
          { name: 'status', label: 'Status', value: f.status, options: HAZARD_STATUSES.map(s => ({ value: s, label: HAZARD_STATUS_LABELS[s] })) },
          { name: 'category', label: 'Category', value: f.category, options: (cats.data ?? []).map(c => ({ value: c.id as string, label: c.name as string })) },
          { name: 'site', label: 'Site', value: f.site, options: sites.map(s => ({ value: s.id, label: s.name })) },
          { name: 'owner', label: 'Owner', value: f.owner, options: [{ value: 'none', label: 'No owner yet' }, ...dir.map(p => ({ value: p.user_id, label: p.full_name }))] },
          { name: 'seriousness', label: 'Seriousness', value: f.seriousness, options: RISK_LEVELS.map(l => ({ value: l, label: RISK_LEVEL_LABELS[l] })) },
        ]} />
      )}

      {error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Hazards could not be loaded. Refresh to try again.</p>}
      {(count ?? 0) > LIMIT && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Showing the {LIMIT} most recent of {count}. Narrow the filters to see the rest.</p>}

      {rows.length === 0 ? (
        <SafetyEmpty icon={AlertTriangle} title="No hazards recorded"
          text={Object.values(f).some(Boolean) ? 'Nothing matches these filters.' : 'When someone spots something that could cause harm, report it here. It takes under a minute on a phone.'} />
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Ref</th><th>Hazard</th><th>Status</th><th>Category</th><th>Site / location</th><th>Seriousness</th><th>Owner</th><th>Identified</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="font-mono text-xs whitespace-nowrap"><Link href={hazardPath(r.id)}>{r.reference}</Link></td>
                  <td><Link href={hazardPath(r.id)} style={{ color: 'var(--ink)' }}>{r.title}</Link></td>
                  <td><Pill tone={toneFor(r.status)}>{HAZARD_STATUS_LABELS[r.status]}</Pill></td>
                  <td>{catName.get(r.hazard_category_id ?? '') ?? '—'}</td>
                  <td>{r.site_id ? siteName.get(r.site_id) ?? '—' : r.linked_location ?? '—'}</td>
                  <td>{r.perceived_seriousness ? RISK_LEVEL_LABELS[r.perceived_seriousness] : '—'}</td>
                  <td>{r.owner_id ? nameOf(dir, r.owner_id) : <span style={{ color: 'var(--gold)' }}>Unassigned</span>}</td>
                  <td className="whitespace-nowrap">{fmtDate(r.identified_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
