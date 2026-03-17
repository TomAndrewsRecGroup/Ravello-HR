import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const supabase  = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile }  = await supabase
    .from('profiles')
    .select('*, companies(*)')
    .eq('id', user?.id ?? '')
    .single();

  const p = profile as any;

  return (
    <>
      <Topbar title="Settings" />
      <main className="portal-page flex-1 max-w-[640px]">

        <div className="card p-7 space-y-6">
          <div>
            <p className="eyebrow mb-3">Your account</p>
            <div className="space-y-4">
              <div className="form-group">
                <label className="label">Full name</label>
                <input className="input" defaultValue={p?.full_name ?? ''} readOnly style={{ cursor: 'default', background: 'var(--surface-alt)' }} />
              </div>
              <div className="form-group">
                <label className="label">Email</label>
                <input className="input" defaultValue={user?.email ?? ''} readOnly style={{ cursor: 'default', background: 'var(--surface-alt)' }} />
              </div>
              <div className="form-group">
                <label className="label">Role</label>
                <input className="input" defaultValue={p?.role ?? ''} readOnly style={{ cursor: 'default', background: 'var(--surface-alt)' }} />
              </div>
            </div>
          </div>

          <div className="divider" />

          <div>
            <p className="eyebrow mb-3">Company</p>
            <div className="space-y-4">
              <div className="form-group">
                <label className="label">Company name</label>
                <input className="input" defaultValue={p?.companies?.name ?? ''} readOnly style={{ cursor: 'default', background: 'var(--surface-alt)' }} />
              </div>
              <div className="form-group">
                <label className="label">Sector</label>
                <input className="input" defaultValue={p?.companies?.sector ?? ''} readOnly style={{ cursor: 'default', background: 'var(--surface-alt)' }} />
              </div>
              <div className="form-group">
                <label className="label">Team size</label>
                <input className="input" defaultValue={p?.companies?.size_band ?? ''} readOnly style={{ cursor: 'default', background: 'var(--surface-alt)' }} />
              </div>
            </div>
          </div>

          <div className="divider" />

          <div>
            <p className="eyebrow mb-3">Password</p>
            <p className="text-sm mb-4" style={{ color: 'var(--ink-faint)' }}>
              Use the link below to receive a password reset email.
            </p>
            <a href="/auth/reset-password" className="btn-secondary btn-sm">Send reset link</a>
          </div>
        </div>

        <p className="text-xs mt-6 text-center" style={{ color: 'var(--ink-faint)' }}>
          To update your name, company details, or access level — contact{' '}
          <a href="mailto:hello@ravellohr.co.uk" className="underline" style={{ color: 'var(--purple)' }}>
            hello@ravellohr.co.uk
          </a>
        </p>
      </main>
    </>
  );
}
