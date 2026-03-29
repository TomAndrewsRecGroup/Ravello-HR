'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Topbar from '@/components/layout/Topbar';
import { createClient } from '@/lib/supabase/client';
import {
  Key, Plus, Trash2, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff,
} from 'lucide-react';

interface PartnerKey {
  id: string;
  name: string;
  key_value: string;
  permissions: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export default function PartnersPage() {
  const supabase = createClient();
  const [keys, setKeys]         = useState<PartnerKey[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName]         = useState('');
  const [keyValue, setKeyValue] = useState('');
  const [bdPipeline, setBdPipeline] = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const [revealId, setRevealId] = useState<string | null>(null);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from('profiles').select('company_id').eq('id', user.id).single();
    if (!profile?.company_id) return;
    const { data } = await supabase
      .from('partner_api_keys')
      .select('*')
      .eq('company_id', profile.company_id)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });
    setKeys((data ?? []) as PartnerKey[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    if (!keyValue.trim().startsWith('ivl_')) {
      setError('Key must start with ivl_');
      return;
    }
    setSaving(true); setError(''); setSuccess('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: profile } = await supabase
        .from('profiles').select('company_id').eq('id', user.id).single();
      if (!profile?.company_id) throw new Error('No company');

      const permissions: string[] = [];
      if (bdPipeline) permissions.push('bd_pipeline');

      const { error: err } = await supabase.from('partner_api_keys').insert({
        company_id: profile.company_id,
        name: name.trim() || 'IvyLens Partner Key',
        key_value: keyValue.trim(),
        permissions,
        created_by: user.id,
      });
      if (err) throw new Error(err.message);

      setSuccess('API key saved.');
      setShowForm(false);
      setName(''); setKeyValue(''); setBdPipeline(true);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Failed to save key');
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(id: string) {
    await supabase
      .from('partner_api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    await load();
  }

  function maskKey(key: string, id: string) {
    if (revealId === id) return key;
    return key.slice(0, 8) + '••••••••••••••••••••';
  }

  return (
    <>
      <Topbar title="Partners" subtitle="Manage your IvyLens integration keys" />
      <main className="portal-page flex-1 max-w-[720px] space-y-6">

        <div className="card p-6">
          <div className="flex items-start gap-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(124,58,237,0.08)' }}
            >
              <Key size={18} style={{ color: 'var(--purple)' }} />
            </div>
            <div>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>IvyLens Partner API Key</p>
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                Add your{' '}
                <code className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-alt)', color: 'var(--purple)' }}>ivl_</code>
                {' '}key from IvyLens to enable BD lead delivery to this portal.
                Keys with the <strong>bd_pipeline</strong> permission allow the BD Leads page
                to pull companies and roles directly from your IvyLens pipeline.
              </p>
            </div>
          </div>
        </div>

        {success && (
          <div className="flex items-center gap-2 p-3 rounded-[10px]" style={{ background: 'rgba(52,211,153,0.08)', color: '#047857' }}>
            <CheckCircle2 size={14} />
            <span className="text-sm">{success}</span>
          </div>
        )}

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="eyebrow">API Keys</p>
            {!showForm && (
              <button
                onClick={() => { setShowForm(true); setSuccess(''); }}
                className="btn-secondary btn-sm flex items-center gap-1.5"
              >
                <Plus size={13} /> Add Key
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-4" style={{ color: 'var(--ink-faint)' }}>
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : keys.length === 0 && !showForm ? (
            <div className="empty-state py-8">
              <Key size={22} style={{ color: 'var(--ink-faint)' }} />
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>No API keys yet. Add your IvyLens key to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {keys.map(k => (
                <div
                  key={k.id}
                  className="flex items-center justify-between gap-4 px-4 py-3 rounded-[10px]"
                  style={{ border: '1px solid var(--line)' }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{k.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs" style={{ color: 'var(--ink-faint)', fontFamily: 'monospace' }}>
                        {maskKey(k.key_value, k.id)}
                      </code>
                      <button
                        onClick={() => setRevealId(revealId === k.id ? null : k.id)}
                        style={{ color: 'var(--ink-faint)' }}
                      >
                        {revealId === k.id ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {k.permissions.map(p => (
                        <span
                          key={p}
                          className="badge text-[10px]"
                          style={{ background: 'rgba(124,58,237,0.08)', color: 'var(--purple)' }}
                        >
                          {p}
                        </span>
                      ))}
                      <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                        Added {new Date(k.created_at).toLocaleDateString()}
                      </span>
                      {k.last_used_at && (
                        <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                          · Last used {new Date(k.last_used_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevoke(k.id)}
                    className="flex-shrink-0 p-1.5 rounded-lg transition-colors"
                    style={{ color: 'var(--ink-faint)' }}
                    title="Revoke key"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {showForm && (
            <div className="mt-4 space-y-4 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Add API Key</p>

              <div className="space-y-1">
                <label className="label">Label</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. IvyLens Partner Key"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="label">
                  API Key <span style={{ color: 'var(--ink-faint)' }}>(starts with ivl_)</span>
                </label>
                <input
                  type="text"
                  className="input font-mono text-sm"
                  placeholder="ivl_xxxxxxxxxxxxxxxxxxxxxxxx"
                  value={keyValue}
                  onChange={e => setKeyValue(e.target.value)}
                />
              </div>

              <div>
                <p className="label mb-2">Permissions</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bdPipeline}
                    onChange={e => setBdPipeline(e.target.checked)}
                  />
                  <span className="text-sm" style={{ color: 'var(--ink)' }}>bd_pipeline</span>
                  <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                    — receive BD leads via the BD Leads page
                  </span>
                </label>
              </div>

              {error && (
                <div
                  className="flex items-center gap-2 p-3 rounded-[10px] text-sm"
                  style={{ background: 'rgba(217,68,68,0.06)', color: '#B02020' }}
                >
                  <AlertCircle size={13} /> {error}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleAdd}
                  disabled={saving || !keyValue.trim()}
                  className="btn-cta btn-sm flex items-center gap-1.5"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Save Key
                </button>
                <button
                  onClick={() => { setShowForm(false); setError(''); setName(''); setKeyValue(''); }}
                  className="btn-secondary btn-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

      </main>
    </>
  );
}
