// Group Roll-Up Reporting (go-live gap list, item 6, 2026-10-02).
//
// companies.parent_organisation_id (117) has existed since Phase 1, but
// before this the only place it was read or written anywhere in either
// app was the Organisations page's own plain reassignment dropdown —
// no report, snapshot or dashboard ever grouped or summed sibling
// companies. This is pure composition: reuses the SAME daily
// client_health_snapshots row (107/168) and the SAME assembleDailyBriefing
// bucketing (lib/briefing/compute.ts) that already drives the Daily
// Briefing — just scoped to one parent's own group of companies instead
// of the whole portfolio, plus the one genuinely commercial figure
// (monthly retainer) a roll-up specifically needs that a daily
// operational briefing does not.

import { assembleDailyBriefing, type BriefingSnapshotRow, type DailyBriefing } from '@/lib/briefing/compute';

export interface GroupCompanyRow {
  id: string;
  name: string;
  parent_organisation_id: string | null;
  monthly_retainer_pence: number | null;
  active: boolean;
}

export interface GroupRollupMember {
  companyId: string;
  companyName: string;
  monthlyRetainerPence: number;
  isParent: boolean;
}

export interface GroupRollup {
  parentId: string;
  parentName: string;
  members: GroupRollupMember[];
  totalMonthlyRetainerPence: number;
  briefing: DailyBriefing;
}

/** The parent itself plus every company whose own parent_organisation_id
 *  points at it — a group is exactly one level deep, matching the
 *  column's own single-parent shape (117's CHECK refuses a self-parent,
 *  but says nothing about chains; this reads only the direct children,
 *  the only relationship the Organisations page's own UI ever creates). */
export function groupMemberIds(companies: readonly GroupCompanyRow[], parentId: string): string[] {
  const ids = new Set<string>([parentId]);
  for (const c of companies) if (c.parent_organisation_id === parentId) ids.add(c.id);
  return [...ids];
}

/** Every company that is a group parent — has at least one other
 *  company naming it as parent_organisation_id — for a group index page. */
export function groupParents(companies: readonly GroupCompanyRow[]): { id: string; name: string; memberCount: number }[] {
  const childCount = new Map<string, number>();
  for (const c of companies) {
    if (!c.parent_organisation_id) continue;
    childCount.set(c.parent_organisation_id, (childCount.get(c.parent_organisation_id) ?? 0) + 1);
  }
  return companies
    .filter(c => childCount.has(c.id))
    .map(c => ({ id: c.id, name: c.name, memberCount: (childCount.get(c.id) ?? 0) + 1 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function computeGroupRollup(
  parentId: string,
  companies: readonly GroupCompanyRow[],
  snapshotDate: string,
  snapshotRows: readonly BriefingSnapshotRow[],
): GroupRollup | null {
  const byId = new Map(companies.map(c => [c.id, c]));
  const parent = byId.get(parentId);
  if (!parent) return null;

  const memberIds = groupMemberIds(companies, parentId);
  const members: GroupRollupMember[] = memberIds
    .map(id => byId.get(id))
    .filter((c): c is GroupCompanyRow => !!c)
    .map(c => ({
      companyId: c.id,
      companyName: c.name,
      monthlyRetainerPence: c.monthly_retainer_pence ?? 0,
      isParent: c.id === parentId,
    }))
    .sort((a, b) => (b.isParent ? 1 : 0) - (a.isParent ? 1 : 0) || a.companyName.localeCompare(b.companyName));

  const totalMonthlyRetainerPence = members.reduce((sum, m) => sum + m.monthlyRetainerPence, 0);
  const memberIdSet = new Set(memberIds);
  const names = new Map(members.map(m => [m.companyId, m.companyName]));
  const briefing = assembleDailyBriefing(snapshotDate, snapshotRows.filter(r => memberIdSet.has(r.company_id)), names);

  return { parentId, parentName: parent.name, members, totalMonthlyRetainerPence, briefing };
}
