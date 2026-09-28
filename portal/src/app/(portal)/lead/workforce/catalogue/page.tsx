import type { Metadata } from 'next';
import Link from 'next/link';
import { getWorkforceContext } from '@/lib/workforce/context';
import { orgSitesAndDepartments, param, todayIso } from '@/lib/hs/safetyContext';
import { WORKFORCE_BASE } from '@/lib/workforce/vocab';
import {
  CATALOGUE_TABS, CATALOGUE_CONFIG, RULE_COLUMNS, isCatalogueTab, type CatalogueTab, type RuleRow,
} from '@/lib/workforce/requirements';
import CatalogueClient from './CatalogueClient';
import RequirementsEditor from '../roles/RequirementsEditor';
import { loadRuleCatalogues } from '../roles/loadCatalogues';

export const metadata: Metadata = { title: 'Workforce catalogue' };
export const dynamic = 'force-dynamic';

const LIMIT = 500;
const BASE = `${WORKFORCE_BASE}/catalogue`;
const TAB_LABEL: Record<CatalogueTab, string> = {
  courses: 'Courses', competencies: 'Competencies', credentials: 'Qualifications & licences', inductions: 'Inductions',
  health: 'Occupational health', authorisations: 'Authorisation types', ppe: 'PPE types', checks: 'Pre-employment checks',
  sites: 'Site requirements',
};

type Row = Record<string, unknown> & { id: string; company_id: string | null; active_status: string };

// The catalogues requirements point at, and the requirements attached to
// each SITE (spec 10). Standard (global) items are read-only; the
// organisation's own items and site requirements need workforce.manage.
export default async function CataloguePage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const ctx = await getWorkforceContext();
  const { supabase, companyId } = ctx;
  if (!companyId) return <main className="portal-page flex-1"><p className="card p-4 text-sm">No organisation is selected.</p></main>;
  const raw = param(sp, 'tab');
  const tab: CatalogueTab = isCatalogueTab(raw) ? raw : 'courses';
  const manage = ctx.can('workforce.manage');
  const { sites } = await orgSitesAndDepartments(supabase, companyId);

  let body: React.ReactNode;
  if (tab === 'sites') {
    const siteId = param(sp, 'site');
    const site = sites.find(s => s.id === siteId) ?? null;
    let editor: React.ReactNode = null;
    if (site) {
      const today = todayIso();
      const [rulesRes, cat] = await Promise.all([
        supabase.from('site_requirements').select(RULE_COLUMNS).eq('site_id', site.id).eq('company_id', companyId).order('created_at').limit(LIMIT),
        loadRuleCatalogues(supabase, companyId),
      ]);
      editor = (
        <>
          {(rulesRes.error || cat.error) && <p role="alert" className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Some requirements could not be loaded. Refresh to try again.</p>}
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            Everyone assigned to <strong>{site.name}</strong> must meet these, in addition to the requirements of their role.
          </p>
          <RequirementsEditor table="site_requirements" scopeId={site.id} companyId={companyId} rules={(rulesRes.data ?? []) as RuleRow[]}
            byTable={cat.byTable} levels={cat.levels} canManage={manage} today={today} scopeNoun="site" />
        </>
      );
    }
    body = (
      <div className="space-y-3">
        {sites.length === 0 ? (
          <div className="card p-6 text-sm" style={{ color: 'var(--ink-soft)' }}>
            This organisation has no sites yet. Add sites in Health &amp; Safety, then come back to set what each site requires.
          </div>
        ) : (
          <form method="get" className="card p-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="tab" value="sites" />
            <div className="min-w-[200px] flex-1 sm:flex-none">
              <label className="label" htmlFor="site-pick">Site</label>
              <select id="site-pick" name="site" className="input" defaultValue={site?.id ?? ''}>
                <option value="">Choose a site…</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <button type="submit" className="btn-secondary btn-sm" style={{ minHeight: 38 }}>Show requirements</button>
          </form>
        )}
        {editor}
      </div>
    );
  } else {
    const cfg = CATALOGUE_CONFIG[tab];
    let q = supabase.from(cfg.table).select(cfg.select);
    q = cfg.hasGlobal ? q.or(`company_id.is.null,company_id.eq.${companyId}`) : q.eq('company_id', companyId);
    const [{ data, error }, levelsRes] = await Promise.all([
      q.order('title').limit(LIMIT),
      tab === 'competencies'
        ? supabase.from('competency_levels').select('id, company_id, key, label, rank, description')
            .or(`company_id.is.null,company_id.eq.${companyId}`).order('rank').limit(100)
        : Promise.resolve({ data: null, error: null }),
    ]);
    const rows = ((data ?? []) as unknown as Row[])
      .sort((a, b) => Number(a.active_status !== 'active') - Number(b.active_status !== 'active'));
    const levels = (levelsRes.data ?? []) as { id: string; company_id: string | null; key: string; label: string; rank: number; description: string | null }[];
    body = (
      <div className="space-y-4">
        {error && <p role="alert" className="card p-3 text-sm" style={{ color: 'var(--red)' }}>This catalogue could not be loaded. Refresh to try again.</p>}
        <CatalogueClient tab={tab} rows={rows} companyId={companyId} canManage={manage} sites={sites} />
        {tab === 'competencies' && (
          <section className="card p-5 space-y-2" aria-labelledby="levels-h">
            <h2 id="levels-h" className="font-semibold" style={{ color: 'var(--ink)' }}>Competency levels</h2>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
              A competency requirement names a minimum level. A person meets it only with a verified assessment at that level or above.
            </p>
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th scope="col">Order</th><th scope="col">Level</th><th scope="col">Meaning</th><th scope="col">Owner</th></tr></thead>
                <tbody>
                  {levels.map(l => (
                    <tr key={l.id}>
                      <td>{l.rank}</td><td style={{ color: 'var(--ink)' }}>{l.label}</td><td>{l.description ?? '—'}</td>
                      <td>{l.company_id ? 'Your organisation' : 'Standard'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <main className="portal-page flex-1 space-y-4">
      <nav aria-label="Catalogue sections" className="flex flex-wrap gap-2">
        {CATALOGUE_TABS.map(t => (
          <Link key={t} href={`${BASE}?tab=${t}`} aria-current={t === tab ? 'page' : undefined}
            className={t === tab ? 'btn-cta btn-sm' : 'btn-secondary btn-sm'}>{TAB_LABEL[t]}</Link>
        ))}
      </nav>
      {!manage && (
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>You can view the catalogue. Changing it needs workforce management access.</p>
      )}
      {body}
    </main>
  );
}
