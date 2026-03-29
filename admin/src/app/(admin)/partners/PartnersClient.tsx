'use client';

import { useState, useEffect } from 'react';
import { Key, Plus, Copy, Check, AlertTriangle, Trash2, Shield } from 'lucide-react';

interface ApiKey {
  id: string;
  label: string;
  key_prefix: string;
  permissions: string[];
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
  raw_key?: string; // only present on creation
}

const ALL_PERMISSIONS = [
  { value: 'bd_pipeline', label: 'BD Pipeline', description: 'Fetch BD leads via GET /api/partner/bd/leads' },
  { value: 'role_analysis', label: 'Role Analysis', description: 'Analyse JDs via POST /api/partner/roles/analyze' },
  { value: 'company_assessment', label: 'Company Assessment', description: 'Submit assessments via POST /api/partner/company/assessment' },
] as const;

export default function PartnersClient() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyRaw, setNewKeyRaw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Create form
  const [label, setLabel] = useState('');
  const [perms, setPerms] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function fetchKeys() {
    setLoading(true);
    try {
      const res = await fetch('/api/partners');
      const data = await res.json();
      setKeys(data.keys ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => { fetchKeys(); }, []);

  function togglePerm(p: string) {
    setPerms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  async function createKey() {
    setCreating(true); setError('');
    try {
      const res = await fetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, permissions: perms }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setNewKeyRaw(data.key.raw_key);
      setShowCreate(false);
      setLabel('');
      setPerms([]);
      fetchKeys();
    } catch (err: any) {
      setError(err.message);
    }
    setCreating(false);
  }

  async function revokeKey(id: string) {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    await fetch('/api/partners', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchKeys();
  }

  function copyKey() {
    if (!newKeyRaw) return;
    navigator.clipboard.writeText(newKeyRaw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const activeKeys = keys.filter(k => k.is_active);
  const revokedKeys = keys.filter(k => !k.is_active);

  return (
    <div className="space-y-6">

      {/* New key reveal banner */}
      {newKeyRaw && (
        <div className="card p-5 space-y-3" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.20)' }}>
          <div className="flex items-center gap-2">
            <Key size={15} style={{ color: '#047857' }} />
            <p className="text-sm font-semibold" style={{ color: '#047857' }}>API Key Created</p>
          </div>
          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
            Copy this key now — it will not be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code
              className="flex-1 text-sm px-3 py-2 rounded-lg font-mono select-all"
              style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
            >
              {newKeyRaw}
            </code>
            <button onClick={copyKey} className="btn-secondary btn-sm flex items-center gap-1.5">
              {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>
          <button onClick={() => setNewKeyRaw(null)} className="text-xs font-medium hover:underline" style={{ color: 'var(--ink-faint)' }}>
            Dismiss
          </button>
        </div>
      )}

      {/* Header + Create */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>API Keys</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
            Partner systems use these keys to call your API endpoints
          </p>
        </div>
        <button onClick={() => setShowCreate(s => !s)} className="btn-cta btn-sm flex items-center gap-1.5">
          <Plus size={13} /> Create Key
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="card p-5 space-y-4">
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>New API Key</p>

          <div>
            <label className="label">Label</label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              className="input"
              placeholder="e.g. IvyLens Production"
            />
          </div>

          <div>
            <label className="label">Permissions</label>
            <div className="space-y-2 mt-2">
              {ALL_PERMISSIONS.map(p => (
                <label key={p.value} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={perms.includes(p.value)}
                    onChange={() => togglePerm(p.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{p.label}</p>
                    <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{p.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.08)', color: '#E05555' }}>{error}</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={createKey}
              disabled={creating || !label.trim() || perms.length === 0}
              className="btn-cta btn-sm flex items-center gap-1.5"
            >
              {creating ? 'Creating…' : 'Create Key'}
            </button>
            <button onClick={() => setShowCreate(false)} className="btn-ghost btn-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Active keys */}
      {loading ? (
        <div className="card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>Loading…</p>
        </div>
      ) : activeKeys.length === 0 && revokedKeys.length === 0 ? (
        <div className="empty-state">
          <Key size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="text-sm font-medium mt-3" style={{ color: 'var(--ink)' }}>No API keys yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
            Create a key to allow partner systems to access your BD leads, role analysis, and assessment APIs.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {activeKeys.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: 'var(--ink-faint)' }}>
                Active Keys ({activeKeys.length})
              </p>
              <div className="space-y-3">
                {activeKeys.map(k => (
                  <KeyRow key={k.id} apiKey={k} onRevoke={() => revokeKey(k.id)} />
                ))}
              </div>
            </div>
          )}

          {revokedKeys.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: 'var(--ink-faint)' }}>
                Revoked Keys ({revokedKeys.length})
              </p>
              <div className="space-y-3">
                {revokedKeys.map(k => (
                  <KeyRow key={k.id} apiKey={k} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* API docs */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Shield size={14} style={{ color: 'var(--purple)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>API Endpoints</p>
        </div>
        <div className="space-y-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
          <div className="flex items-start gap-2">
            <code className="px-2 py-0.5 rounded text-[10px] font-mono font-bold" style={{ background: 'rgba(59,111,255,0.08)', color: '#2A55CC' }}>GET</code>
            <div>
              <code className="font-mono">/api/partner/bd/leads</code>
              <p className="mt-0.5">Fetch BD leads. Requires <strong>bd_pipeline</strong> permission.</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <code className="px-2 py-0.5 rounded text-[10px] font-mono font-bold" style={{ background: 'rgba(124,58,237,0.08)', color: 'var(--purple)' }}>POST</code>
            <div>
              <code className="font-mono">/api/partner/roles/analyze</code>
              <p className="mt-0.5">Analyse a JD. Send <code>{`{ "jd_text": "..." }`}</code>. Requires <strong>role_analysis</strong> permission.</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <code className="px-2 py-0.5 rounded text-[10px] font-mono font-bold" style={{ background: 'rgba(124,58,237,0.08)', color: 'var(--purple)' }}>POST</code>
            <div>
              <code className="font-mono">/api/partner/company/assessment</code>
              <p className="mt-0.5">Submit company assessment. Requires <strong>company_assessment</strong> permission.</p>
            </div>
          </div>
        </div>
        <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
          All endpoints require <code>Authorization: Bearer ivl_...</code> header.
        </p>
      </div>
    </div>
  );
}

function KeyRow({ apiKey, onRevoke }: { apiKey: ApiKey; onRevoke?: () => void }) {
  return (
    <div
      className="card p-4 flex items-center gap-4"
      style={apiKey.is_active ? {} : { opacity: 0.5 }}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: apiKey.is_active ? 'rgba(124,58,237,0.08)' : 'rgba(7,11,29,0.05)' }}>
        <Key size={14} style={{ color: apiKey.is_active ? 'var(--purple)' : 'var(--ink-faint)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{apiKey.label}</p>
        <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: 'var(--ink-faint)' }}>
          <code className="font-mono">{apiKey.key_prefix}…</code>
          <span>Created {new Date(apiKey.created_at).toLocaleDateString()}</span>
          {apiKey.last_used_at && <span>Last used {new Date(apiKey.last_used_at).toLocaleDateString()}</span>}
          {apiKey.revoked_at && <span style={{ color: 'var(--red)' }}>Revoked {new Date(apiKey.revoked_at).toLocaleDateString()}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {apiKey.permissions.map(p => (
          <span key={p} className="badge text-[10px]" style={{ background: 'rgba(124,58,237,0.08)', color: 'var(--purple)' }}>
            {p.replace(/_/g, ' ')}
          </span>
        ))}
        {apiKey.is_active && onRevoke && (
          <button onClick={onRevoke} className="btn-icon btn-sm" title="Revoke key" style={{ color: 'var(--red)' }}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
