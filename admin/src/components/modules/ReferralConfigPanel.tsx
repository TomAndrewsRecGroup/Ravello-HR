'use client';

// Referral configuration for one requisition.
//
// Saving this row is what turns a requisition into a referral role —
// the hourly pipeline only ever looks at requisitions that have one.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, FlaskConical, Plus, Trash2 } from 'lucide-react';
import type { MandatoryCriterion } from '@/lib/referral/types';
import {
  REFERRAL_URL_TOKENS,
  REFERRAL_URL_SAMPLE,
  buildReferralUrl,
  findUnknownTokens,
  hasTokens,
} from '@/lib/referral/referralUrl';

interface Props {
  requisitionId:  string;
  hasManatalJob:  boolean;
  existing?: {
    enabled:             boolean;
    dry_run:             boolean;
    partner_name:        string;
    referral_url:        string;
    email_process_note:  string | null;
    auto_send_threshold: number;
    review_threshold:    number;
    approved_countries:  string[];
    mandatory_criteria:  MandatoryCriterion[];
  } | null;
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

export default function ReferralConfigPanel({ requisitionId, hasManatalJob, existing }: Props) {
  const router = useRouter();

  const [enabled,   setEnabled]   = useState(existing?.enabled ?? false);
  const [dryRun,    setDryRun]    = useState(existing?.dry_run ?? true);
  const [partner,   setPartner]   = useState(existing?.partner_name ?? '');
  const [url,       setUrl]       = useState(existing?.referral_url ?? '');
  const [note,      setNote]      = useState(existing?.email_process_note ?? '');
  const [autoSend,  setAutoSend]  = useState(existing?.auto_send_threshold ?? 85);
  const [review,    setReview]    = useState(existing?.review_threshold ?? 75);
  const [countries, setCountries] = useState((existing?.approved_countries ?? []).join(', '));
  const [criteria,  setCriteria]  = useState<MandatoryCriterion[]>(existing?.mandatory_criteria ?? []);

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [saved,  setSaved]  = useState(false);

  function addCriterion() {
    setCriteria([...criteria, { key: '', label: '', match_terms: [] }]);
  }
  function updateCriterion(i: number, patch: Partial<MandatoryCriterion>) {
    setCriteria(criteria.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  }

  async function save() {
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch('/api/admin/referrals/config', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requisition_id:      requisitionId,
          enabled,
          dry_run:             dryRun,
          partner_name:        partner,
          referral_url:        url,
          email_process_note:  note,
          auto_send_threshold: Number(autoSend),
          review_threshold:    Number(review),
          approved_countries:  countries.split(',').map(s => s.trim()).filter(Boolean),
          mandatory_criteria:  criteria.map(c => ({
            key:         c.key || slugify(c.label),
            label:       c.label,
            match_terms: c.match_terms,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? `Save failed (${res.status})`); return; }
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display" style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
            Referral pipeline
          </h3>
          <p className="text-sm" style={{ color: 'var(--ink-soft)', margin: '4px 0 0' }}>
            Score job-board applicants against this role automatically and email the ones that qualify.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          Enabled
        </label>
      </div>

      {!hasManatalJob && (
        <div className="flex items-start gap-2 text-sm" style={{ color: 'var(--gold)' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>This role has not been published to Manatal, so no applicants can reach it yet. Publish it before enabling.</span>
        </div>
      )}

      <div className="flex items-start gap-2 p-3" style={{ background: 'var(--surface-soft)', borderRadius: 8 }}>
        <FlaskConical size={15} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 2 }} />
        <label className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          <input
            type="checkbox"
            checked={dryRun}
            onChange={e => setDryRun(e.target.checked)}
            style={{ marginRight: 8 }}
          />
          <strong style={{ color: 'var(--ink)' }}>Dry run</strong> — score and record every applicant, but send no emails.
          Leave this on until you have seen how the scores actually distribute; the thresholds below are starting
          guesses, not calibrated numbers.
        </label>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div>
          <label className="label">Partner name</label>
          <input className="input" value={partner} onChange={e => setPartner(e.target.value)} placeholder="Micro1" />
          <p className="text-xs" style={{ color: 'var(--ink-faint)', marginTop: 4 }}>Named in the candidate email.</p>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="label" htmlFor="referral-url">Referral URL</label>
          <input
            id="referral-url"
            className="input"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://apply.partner.com/roles?ref=arg&cid={ref}"
          />
          <ReferralUrlHelp url={url} />
        </div>
        <div>
          <label className="label">Auto-send at or above (%)</label>
          <input className="input" type="number" min={0} max={100} value={autoSend} onChange={e => setAutoSend(Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Review queue at or above (%)</label>
          <input className="input" type="number" min={0} max={100} value={review} onChange={e => setReview(Number(e.target.value))} />
        </div>
      </div>

      <div>
        <label className="label">Approved countries</label>
        <input
          className="input"
          value={countries}
          onChange={e => setCountries(e.target.value)}
          placeholder="United Kingdom, Ireland"
        />
        <p className="text-xs" style={{ color: 'var(--ink-faint)', marginTop: 4 }}>
          Comma separated. Checked before any AI is spent. An empty list refuses every applicant, so the role
          cannot be enabled without one.
        </p>
      </div>

      <div>
        <label className="label">Email note (optional)</label>
        <input
          className="input"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Leave blank to use the default wording about their application and AI interview."
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="label" style={{ margin: 0 }}>Mandatory criteria</label>
          <button type="button" className="btn-ghost btn-sm" onClick={addCriterion}>
            <Plus size={13} /> Add
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--ink-faint)', margin: '4px 0 8px' }}>
          A candidate must show positive evidence of every one of these or they are rejected, whatever their score.
          If the scan never mentions a criterion, that counts as a fail — not a pass.
        </p>

        {criteria.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
            None. Scoring alone will decide.
          </p>
        ) : (
          <div className="space-y-2">
            {criteria.map((c, i) => (
              <div key={i} className="flex gap-2 items-start">
                <input
                  className="input"
                  style={{ flex: 1 }}
                  value={c.label}
                  onChange={e => updateCriterion(i, { label: e.target.value, key: c.key || slugify(e.target.value) })}
                  placeholder="MCP implementation experience"
                />
                <input
                  className="input"
                  style={{ flex: 1 }}
                  value={c.match_terms.join(', ')}
                  onChange={e => updateCriterion(i, { match_terms: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  placeholder="MCP, Model Context Protocol"
                />
                <button
                  type="button"
                  className="btn-icon btn-sm"
                  onClick={() => setCriteria(criteria.filter((_, idx) => idx !== i))}
                  aria-label="Remove criterion"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm" style={{ color: 'var(--red)', margin: 0 }}>{error}</p>
      )}
      {saved && !error && (
        <p className="text-sm" style={{ color: 'var(--teal)', margin: 0 }}>Saved.</p>
      )}

      <button className="btn-cta" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save referral configuration'}
      </button>
    </div>
  );
}

/* ─── Per-candidate parameters ────────────────────────────── */

/**
 * Shows what the pasted URL becomes for one candidate.
 *
 * The preview is not decoration. The sample values carry a space, an
 * apostrophe and a plus-address precisely because those are what break
 * a hand-built query string, and seeing them encoded is the only way an
 * operator can tell that the link they are about to send 200 people is
 * actually well-formed.
 */
function ReferralUrlHelp({ url }: { url: string }) {
  const unknown = findUnknownTokens(url);
  const preview = buildReferralUrl(url, REFERRAL_URL_SAMPLE);

  return (
    <div className="space-y-2" style={{ marginTop: 6 }}>
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
        Sent to the candidate as the “Complete your application” button. Add any of these in the URL and they are
        filled in per candidate, URL-encoded:
      </p>

      <div className="flex flex-wrap gap-1.5">
        {Object.entries(REFERRAL_URL_TOKENS).map(([token, description]) => (
          <span
            key={token}
            title={description}
            className="text-[11px] px-1.5 py-0.5 rounded-[6px] font-mono"
            style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}
          >
            {`{${token}}`}
          </span>
        ))}
      </div>

      {unknown.length > 0 && (
        <p className="text-xs" style={{ color: 'var(--red)' }}>
          {unknown.map(t => `{${t}}`).join(', ')} {unknown.length > 1 ? 'are not' : 'is not'} a parameter we can fill —
          it would be sent to the candidate exactly as written. Saving will be refused.
        </p>
      )}

      {hasTokens(url) && unknown.length === 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>
            Example for one candidate
          </p>
          <p
            className="text-[11px] font-mono break-all"
            style={{ color: 'var(--ink-soft)', background: 'var(--surface-soft)', padding: '6px 8px', borderRadius: 8 }}
          >
            {preview}
          </p>
        </div>
      )}

      {!hasTokens(url) && url.trim() !== '' && (
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          No per-candidate parameters — every applicant for this role receives an identical link, so the partner
          cannot tell them apart. Fine if they only need to know the traffic came from you.
        </p>
      )}
    </div>
  );
}
