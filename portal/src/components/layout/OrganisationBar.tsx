'use client';

// Core-OS 360 consultancy mode: which organisation you are working in,
// always on screen, and the one place to change it.
//
// Renders nothing for a single-organisation user, so every existing
// client sees exactly the portal they saw before.
//
// Switching is a POST followed by a FULL navigation (window.location),
// never router.push/refresh: the React tree, the router cache, any open
// dialog and any half-typed form belong to the previous organisation and
// must not survive into the next one.

import { useState } from 'react';
import { Building2, ArrowLeftRight } from 'lucide-react';
import type { OrganisationOption } from '@/lib/auth/activeOrganisation';

interface Props {
  organisations: OrganisationOption[];
  activeCompanyName: string | null;
}

export default function OrganisationBar({ organisations, activeCompanyName }: Props) {
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');

  if (organisations.length < 2) return null;

  const home = organisations.find(o => o.is_home) ?? null;
  const active = organisations.find(o => o.is_active) ?? home;
  const actingForClient = !!active && !active.is_home;

  async function switchTo(id: string) {
    if (!id || id === active?.organisation_id) return;
    setSwitching(true);
    setError('');
    try {
      const target = organisations.find(o => o.organisation_id === id);
      const res = await fetch('/api/organisation/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organisationId: target?.is_home ? null : id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Could not switch organisation');
        setSwitching(false);
        return;
      }
      window.location.assign('/dashboard');
    } catch {
      setError('Could not switch organisation. Check your connection and try again.');
      setSwitching(false);
    }
  }

  return (
    <div
      role="region"
      aria-label="Organisation you are working in"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-6 py-2 text-sm"
      style={{
        background: actingForClient ? 'var(--surface-soft)' : 'var(--surface)',
        borderBottom: '1px solid var(--line)',
        borderLeft: actingForClient ? '4px solid var(--gold)' : '4px solid transparent',
      }}
    >
      <div className="flex items-center gap-2 min-w-0" style={{ color: 'var(--ink-soft)' }}>
        <Building2 size={16} aria-hidden="true" />
        {home && <span className="truncate">{home.name}</span>}
        {actingForClient && (
          <>
            <span aria-hidden="true">·</span>
            <span className="truncate" style={{ color: 'var(--ink)' }}>
              Viewing: <strong>{active?.name ?? activeCompanyName}</strong>
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <ArrowLeftRight size={14} aria-hidden="true" style={{ color: 'var(--ink-faint)' }} />
        <label htmlFor="org-switcher" className="sr-only">Switch organisation</label>
        <select
          id="org-switcher"
          className="input"
          style={{ minWidth: 200, maxWidth: '100%', paddingTop: 4, paddingBottom: 4 }}
          value={active?.organisation_id ?? ''}
          disabled={switching}
          aria-busy={switching}
          onChange={e => switchTo(e.target.value)}
        >
          {organisations.map(o => (
            <option key={o.organisation_id} value={o.organisation_id}>
              {o.name}{o.is_home ? ' (your organisation)' : ''}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p role="alert" className="w-full text-xs" style={{ color: 'var(--red)' }}>{error}</p>
      )}
    </div>
  );
}
