'use client';

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, FileText, FlaskConical, X } from 'lucide-react';
import {
  ALL_STATUSES,
  MANUAL_STATUSES,
  SCAN_SOURCE_LABEL,
  STATUS_META,
  statusColour,
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
}

const REVIEW = 'review_pending';

export default function ReferralsClient({ rows, configs, dryRunCount }: Props) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter,   setRoleFilter]   = useState<string>('all');
  const [busy,         setBusy]         = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [expanded,     setExpanded]     = useState<string | null>(null);

  const queueCount = rows.filter(r => r.status === REVIEW).length;

  const filtered = useMemo(() => rows.filter(r => {
    if (statusFilter === 'queue' && r.status !== REVIEW) return false;
    if (statusFilter !== 'all' && statusFilter !== 'queue' && r.status !== statusFilter) return false;
    if (roleFilter !== 'all' && r.requisition?.id !== roleFilter) return false;
    return true;
  }), [rows, statusFilter, roleFilter]);

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

        <span className="text-sm" style={{ color: 'var(--ink-faint)' }}>
          {filtered.length} shown
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p style={{ color: 'var(--ink-soft)' }}>
            {rows.length === 0
              ? 'No applicants have been processed yet. The pipeline runs hourly once a role has a referral configuration and has been published to Manatal.'
              : 'No applications match these filters.'}
          </p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Role</th>
                <th>Score</th>
                <th>Scanned from</th>
                <th>Location</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const isOpen  = expanded === r.id;
                const isQueue = r.status === REVIEW;
                const thin    = r.scan_source === 'manatal_parsed';
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
                      <td>
                        {r.match_score === null
                          ? <span style={{ color: 'var(--ink-faint)' }}>—</span>
                          : <strong style={{ color: 'var(--ink)' }}>{r.match_score}%</strong>}
                      </td>
                      <td>
                        {r.scan_source ? (
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
                        ) : <span style={{ color: 'var(--ink-faint)' }}>—</span>}
                      </td>
                      <td style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
                        {r.country_detected ?? '—'}
                        {/* `unknown` is not a rejection under the block list —
                            it is the reason someone scoring above the bar is
                            sitting in this queue instead of being emailed, so
                            the label says that rather than just "unresolved". */}
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
                      </td>
                      <td>
                        <span className="badge" style={{ color: statusColour(r.status) }}>
                          {statusLabel(r.status)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {isQueue ? (
                          <div className="flex gap-2 justify-end">
                            <button
                              className="btn-cta btn-sm"
                              disabled={busy === r.id}
                              onClick={() => act(r.id, { action: 'approve' })}
                            >
                              <Check size={13} /> Approve
                            </button>
                            <button
                              className="btn-secondary btn-sm"
                              disabled={busy === r.id}
                              onClick={() => act(r.id, { action: 'reject' })}
                            >
                              <X size={13} /> Reject
                            </button>
                          </div>
                        ) : (
                          <select
                            className="input btn-sm"
                            style={{ maxWidth: 190 }}
                            value=""
                            disabled={busy === r.id}
                            onChange={e => e.target.value && act(r.id, { status: e.target.value })}
                          >
                            <option value="">Advance to…</option>
                            {MANUAL_STATUSES.map(s => (
                              <option key={s} value={s}>{STATUS_META[s].label}</option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr>
                        <td colSpan={7} style={{ background: 'var(--surface-soft)' }}>
                          <div className="p-4 space-y-3 text-sm">
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
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
