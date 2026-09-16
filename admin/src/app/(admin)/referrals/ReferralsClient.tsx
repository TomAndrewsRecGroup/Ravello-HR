'use client';

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Check, FileText, FlaskConical, X } from 'lucide-react';
import {
  ALL_STATUSES,
  MANUAL_STATUSES,
  SCAN_SOURCE_LABEL,
  STATUS_META,
  statusColour,
  statusGroup,
  statusLabel,
} from '@/lib/referral/statusMeta';

interface Row {
  id:                  string;
  status:              string;
  match_score:         number | null;
  scan_source:         string | null;
  country_detected:    string | null;
  country_gate_result: string | null;
  failed_criteria:     { key: string; label: string; reason: string }[] | null;
  matched_skills:      { skill?: string; found?: boolean }[] | null;
  gaps:                string[] | null;
  scan_error:          string | null;
  email_sent_at:       string | null;
  created_at:          string;
  manatal_candidate_id: string;
  candidate:           { id: string; full_name: string; email: string | null } | null;
  requisition:         { id: string; title: string } | null;
}

interface Config {
  requisition_id: string;
  enabled:        boolean;
  dry_run:        boolean;
  partner_name:   string;
  requisition:    { id: string; title: string } | null;
}

interface Props {
  rows:        Row[];
  configs:     Config[];
  dryRunCount: number;
  /** Server-side pagination — the page this `rows` slice came from. */
  page:        number;
  pageSize:    number;
  /** Total rows across every page, not just this one. */
  total:       number;
}

const REVIEW = 'review_pending';

type SortKey = 'candidate' | 'role' | 'score' | 'location' | 'status';

const SORT_LABEL: Record<SortKey, string> = {
  candidate: 'Candidate',
  role:      'Role',
  score:     'Score',
  location:  'Location',
  status:    'Status',
};

function sortValue(r: Row, key: SortKey): string | number | null {
  switch (key) {
    case 'candidate': return r.candidate?.full_name ?? '';
    case 'role':      return r.requisition?.title ?? '';
    case 'score':     return r.match_score;
    case 'location':  return r.country_detected ?? '';
    case 'status':    return statusLabel(r.status);
  }
}

// Both a row waiting on a human call (review_pending — a mandatory
// criterion or country came back `unknown`) and a row that already
// cleared the bar but was HELD by dry_run (qualified, never sent) need
// the same two actions: send it, or don't. The API route has always
// accepted `approve`/`reject` for both statuses — see
// admin/src/app/api/admin/referrals/[id]/route.ts — but this table used
// to gate the buttons on review_pending alone, so a qualified-but-dry-run
// candidate had no way to be sent at all: the "Advance to…" dropdown only
// offers downstream stages (applied_to_partner, accepted, …), none of
// which call sendReferralInvite.
const ACTIONABLE = new Set(['review_pending', 'qualified']);

export default function ReferralsClient({ rows, configs, dryRunCount, page, pageSize, total }: Props) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter,   setRoleFilter]   = useState<string>('all');
  const [busy,         setBusy]         = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [expanded,     setExpanded]     = useState<string | null>(null);
  // Score defaults to descending (top score first) on first click — every
  // other column defaults to ascending (A→Z / earliest first).
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const queueCount = rows.filter(r => r.status === REVIEW).length;

  const filtered = useMemo(() => rows.filter(r => {
    if (statusFilter === 'queue' && r.status !== REVIEW) return false;
    if (statusFilter !== 'all' && statusFilter !== 'queue' && r.status !== statusFilter) return false;
    if (roleFilter !== 'all' && r.requisition?.id !== roleFilter) return false;
    return true;
  }), [rows, statusFilter, roleFilter]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      // A missing score (never scored) sorts to the bottom regardless of
      // direction — "no score" is not a low score, it is an absence.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'score' ? 'desc' : 'asc');
    }
  }

  function sortHeader(sortKeyName: SortKey) {
    const active = sortKey === sortKeyName;
    const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th key={sortKeyName}>
        <button
          type="button"
          onClick={() => toggleSort(sortKeyName)}
          className="inline-flex items-center gap-1"
          style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' }}
        >
          {SORT_LABEL[sortKeyName]}
          <Icon size={11} style={{ opacity: active ? 1 : 0.4 }} />
        </button>
      </th>
    );
  }

  async function act(id: string, payload: Record<string, unknown>) {
    setBusy(id); setError(null);
    try {
      const res  = await fetch(`/api/admin/referrals/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? `Request failed (${res.status})`); return; }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function scoreCell(r: Row) {
    return r.match_score === null
      ? <span style={{ color: 'var(--ink-faint)' }}>—</span>
      : <strong style={{ color: 'var(--ink)' }}>{r.match_score}%</strong>;
  }

  function scanSourceCell(r: Row) {
    if (!r.scan_source) return <span style={{ color: 'var(--ink-faint)' }}>—</span>;
    const thin = r.scan_source === 'manatal_parsed';
    return (
      <span
        className="badge"
        title={thin
          ? 'Scored from Manatal’s parsed fields because the CV PDF could not be read. Thinner evidence than a full CV.'
          : 'Scored from the full CV text.'}
        style={{ color: thin ? 'var(--gold)' : 'var(--ink-soft)' }}
      >
        {thin && <AlertTriangle size={11} style={{ marginRight: 4, display: 'inline' }} />}
        {SCAN_SOURCE_LABEL[r.scan_source] ?? r.scan_source}
      </span>
    );
  }

  function locationCell(r: Row) {
    return (
      <>
        {r.country_detected ?? '—'}
        {/* `unknown` is not a rejection under the block list — it is the
            reason someone scoring above the bar is sitting in this queue
            instead of being emailed, so the label says that rather than
            just "unresolved". */}
        {r.country_gate_result === 'unknown' && (
          <span style={{ color: 'var(--gold)', fontSize: 11, display: 'block' }}>
            no country read — review only
          </span>
        )}
        {r.country_gate_result === 'blocked' && (
          <span style={{ color: 'var(--red)', fontSize: 11, display: 'block' }}>blocked</span>
        )}
        {/* Pre-084 history, written under the old allow list. */}
        {r.country_gate_result === 'rejected' && (
          <span style={{ color: 'var(--ink-faint)', fontSize: 11, display: 'block' }}>
            not on the old allow list
          </span>
        )}
      </>
    );
  }

  function actionControl(r: Row) {
    const isActionable = ACTIONABLE.has(r.status);
    const heldByDryRun = r.status === 'qualified';
    if (isActionable) {
      return (
        <div className="flex gap-2 justify-end w-full">
          <button
            className="btn-cta btn-sm"
            disabled={busy === r.id}
            onClick={() => act(r.id, { action: 'approve' })}
          >
            <Check size={13} /> {heldByDryRun ? 'Send invite' : 'Approve'}
          </button>
          <button
            className="btn-secondary btn-sm"
            disabled={busy === r.id}
            onClick={() => act(r.id, { action: 'reject' })}
          >
            <X size={13} /> Reject
          </button>
        </div>
      );
    }
    // Apply is only offered where it means something — overruling a
    // rejection or a scan fault. It is refused server-side for anything
    // already sent or downstream of that (see route.ts); not offering it
    // there either keeps the dropdown honest about what it can do.
    const canApply = statusGroup(r.status) === 'rejected' || statusGroup(r.status) === 'fault';

    return (
      <select
        className="input btn-sm"
        style={{ maxWidth: 190 }}
        value=""
        disabled={busy === r.id}
        onChange={e => {
          const v = e.target.value;
          if (!v) return;
          if (v === '__apply__') act(r.id, { action: 'apply' });
          else act(r.id, { status: v });
        }}
      >
        <option value="">Advance to…</option>
        {canApply && <option value="__apply__">Apply — send invite anyway</option>}
        {MANUAL_STATUSES.map(s => (
          <option key={s} value={s}>{STATUS_META[s].label}</option>
        ))}
      </select>
    );
  }

  function detailBody(r: Row) {
    return (
      <div className="space-y-3 text-sm">
        {r.scan_error && (
          <p style={{ color: 'var(--red)', margin: 0 }}>
            <strong>Scan error:</strong> {r.scan_error}
          </p>
        )}

        {!!r.failed_criteria?.length && (
          <div>
            <p style={{ color: 'var(--ink)', fontWeight: 600, margin: '0 0 4px' }}>
              Failed mandatory criteria
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-soft)' }}>
              {r.failed_criteria.map(f => (
                <li key={f.key}><strong>{f.label}</strong> — {f.reason}</li>
              ))}
            </ul>
          </div>
        )}

        {!!r.matched_skills?.length && (
          <div>
            <p style={{ color: 'var(--ink)', fontWeight: 600, margin: '0 0 4px' }}>
              Skills the scan evidenced
            </p>
            <p style={{ color: 'var(--ink-soft)', margin: 0 }}>
              {r.matched_skills
                .filter(s => s.found)
                .map(s => s.skill)
                .filter(Boolean)
                .join(', ') || 'None.'}
            </p>
          </div>
        )}

        {!!r.gaps?.length && (
          <div>
            <p style={{ color: 'var(--ink)', fontWeight: 600, margin: '0 0 4px' }}>Gaps</p>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-soft)' }}>
              {r.gaps.map((g, i) => <li key={i}>{g}</li>)}
            </ul>
          </div>
        )}

        <p style={{ color: 'var(--ink-faint)', margin: 0, fontSize: 12 }}>
          <FileText size={11} style={{ display: 'inline', marginRight: 4 }} />
          Manatal candidate {r.manatal_candidate_id}
          {' '}·{' '}
          applied {new Date(r.created_at).toLocaleDateString('en-GB')}
          {r.email_sent_at && ` · emailed ${new Date(r.email_sent_at).toLocaleDateString('en-GB')}`}
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">

      {dryRunCount > 0 && (
        <div className="card flex items-start gap-3 p-4" style={{ borderColor: 'var(--gold)' }}>
          <FlaskConical size={18} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 2 }} />
          <div className="text-sm">
            <p style={{ color: 'var(--ink)', fontWeight: 600, margin: 0 }}>
              {dryRunCount} role{dryRunCount === 1 ? ' is' : 's are'} in dry run
            </p>
            <p style={{ color: 'var(--ink-soft)', margin: '4px 0 0 0' }}>
              Candidates are being scored and recorded, but no referral emails are being sent.
              Turn dry run off on the role once the score distribution looks right.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="card flex items-start gap-3 p-4" style={{ borderColor: 'var(--red)' }}>
          <AlertTriangle size={18} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 2 }} />
          <p className="text-sm" style={{ color: 'var(--ink)', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="input"
          style={{ maxWidth: 260 }}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="queue">Review queue ({queueCount})</option>
          {ALL_STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </select>

        <select
          className="input"
          style={{ maxWidth: 260 }}
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
        >
          <option value="all">All roles</option>
          {configs.map(c => (
            <option key={c.requisition_id} value={c.requisition_id}>
              {c.requisition?.title ?? 'Untitled role'} → {c.partner_name}
            </option>
          ))}
        </select>

        {/* Desktop sorts by clicking a column header; phone has no header
            row to tap, so it gets the same sort as a dropdown instead. */}
        <select
          className="input md:hidden"
          style={{ maxWidth: 220 }}
          value={sortKey ? `${sortKey}:${sortDir}` : ''}
          onChange={e => {
            const v = e.target.value;
            if (!v) { setSortKey(null); return; }
            const [key, dir] = v.split(':') as [SortKey, 'asc' | 'desc'];
            setSortKey(key); setSortDir(dir);
          }}
        >
          <option value="">Sort by…</option>
          <option value="candidate:asc">Candidate (A→Z)</option>
          <option value="candidate:desc">Candidate (Z→A)</option>
          <option value="role:asc">Role (A→Z)</option>
          <option value="role:desc">Role (Z→A)</option>
          <option value="score:desc">Score (high→low)</option>
          <option value="score:asc">Score (low→high)</option>
          <option value="location:asc">Location (A→Z)</option>
          <option value="location:desc">Location (Z→A)</option>
          <option value="status:asc">Status (A→Z)</option>
          <option value="status:desc">Status (Z→A)</option>
        </select>

        <span className="text-sm" style={{ color: 'var(--ink-faint)' }}>
          {sorted.length} of {rows.length} on this page shown
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-state">
          <p style={{ color: 'var(--ink-soft)' }}>
            {rows.length === 0
              ? 'No applicants have been processed yet. The pipeline runs hourly once a role has a referral configuration and has been published to Manatal.'
              : 'No applications match these filters.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop / tablet: the full table, horizontally scrollable if it
              has to be. Hidden below md — see the mobile card list beside it,
              which exists so Approve/Reject/Advance are reachable with a
              thumb instead of a scroll-then-tap. */}
          <div className="table-wrapper hidden md:block">
            <table className="table">
              <thead>
                <tr>
                  {sortHeader('candidate')}
                  {sortHeader('role')}
                  {sortHeader('score')}
                  <th>Scanned from</th>
                  {sortHeader('location')}
                  {sortHeader('status')}
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => {
                  const isOpen = expanded === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr>
                        <td>
                          <button
                            onClick={() => setExpanded(isOpen ? null : r.id)}
                            className="text-left"
                            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
                          >
                            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>
                              {r.candidate?.full_name ?? '—'}
                            </span>
                            <br />
                            <span style={{ color: 'var(--ink-faint)', fontSize: 12 }}>
                              {r.candidate?.email ?? 'no email on file'}
                            </span>
                          </button>
                        </td>
                        <td style={{ color: 'var(--ink-soft)' }}>{r.requisition?.title ?? '—'}</td>
                        <td>{scoreCell(r)}</td>
                        <td>{scanSourceCell(r)}</td>
                        <td style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{locationCell(r)}</td>
                        <td>
                          <span className="badge" style={{ color: statusColour(r.status) }}>
                            {statusLabel(r.status)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="flex justify-end">
                            {actionControl(r)}
                          </div>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr>
                          <td colSpan={7} style={{ background: 'var(--surface-soft)' }}>
                            <div className="p-4">{detailBody(r)}</div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phone: one card per applicant, full-width action controls. */}
          <div className="mobile-card-list">
            {sorted.map(r => {
              const isOpen = expanded === r.id;
              return (
                <div key={r.id} className="mobile-card">
                  <button
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                    className="text-left w-full"
                    style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
                  >
                    <span style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 15 }}>
                      {r.candidate?.full_name ?? '—'}
                    </span>
                    <br />
                    <span style={{ color: 'var(--ink-faint)', fontSize: 12 }}>
                      {r.candidate?.email ?? 'no email on file'}
                    </span>
                  </button>

                  <div className="mt-3">
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Role</span>
                      <span className="mobile-card-value">{r.requisition?.title ?? '—'}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Score</span>
                      <span className="mobile-card-value">{scoreCell(r)}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Scanned from</span>
                      <span className="mobile-card-value">{scanSourceCell(r)}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Location</span>
                      <span className="mobile-card-value">{locationCell(r)}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Status</span>
                      <span className="badge" style={{ color: statusColour(r.status) }}>
                        {statusLabel(r.status)}
                      </span>
                    </div>
                  </div>

                  <div className="mobile-card-actions">
                    {actionControl(r)}
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                    >
                      {isOpen ? 'Hide details' : 'Show details'}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="mt-3 pt-3 text-sm" style={{ borderTop: '1px solid var(--line)' }}>
                      {detailBody(r)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {(() => {
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        if (totalPages <= 1) return null;
        const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
        const to   = Math.min(page * pageSize, total);
        return (
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
              {from}-{to} of {total} applications
            </span>
            <div className="flex items-center gap-2">
              {page <= 1 ? (
                <span className="btn-secondary btn-sm" aria-disabled="true" style={{ opacity: 0.4 }}>← Prev</span>
              ) : (
                <Link prefetch={false} href={`/referrals?page=${page - 1}`} className="btn-secondary btn-sm">← Prev</Link>
              )}
              <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>Page {page} of {totalPages}</span>
              {page >= totalPages ? (
                <span className="btn-secondary btn-sm" aria-disabled="true" style={{ opacity: 0.4 }}>Next →</span>
              ) : (
                <Link prefetch={false} href={`/referrals?page=${page + 1}`} className="btn-secondary btn-sm">Next →</Link>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
