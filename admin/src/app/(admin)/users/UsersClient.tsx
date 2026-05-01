'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';
import Link from 'next/link';
import { Loader2, MailPlus, KeyRound, Trash2 } from 'lucide-react';
import { PORTAL_INVITE_ROLES, ROLE_LABELS, labelFor } from '@/lib/ui/statusMaps';

const ROLE_BADGE: Record<string, string> = {
  tps_admin:     'badge-admin',
  client_admin:  'badge-admin',
  client_editor: 'badge-client',
};

function RoleCell({ userId, initialRole }: { userId: string; initialRole: string }) {
  const supabase = createClient();
  const [role,    setRole]    = useState(initialRole);
  const [saving,  setSaving]  = useState(false);
  const isInternal = role.startsWith('tps_');

  if (isInternal) {
    return <span className={`badge ${ROLE_BADGE[role] ?? 'badge-client'}`}>{labelFor(ROLE_LABELS, role)}</span>;
  }

  async function change(newRole: string) {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    if (!error) {
      setRole(newRole);
      revalidateAdminPath('/users');
    }
    setSaving(false);
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className="text-xs rounded-[6px] px-2 py-1 border"
        style={{ borderColor: 'var(--line)', color: 'var(--ink-soft)', fontSize: '11px' }}
        value={role}
        disabled={saving}
        onChange={e => change(e.target.value)}
      >
        {PORTAL_INVITE_ROLES.map(r => (
          <option key={r} value={r}>{labelFor(ROLE_LABELS, r)}</option>
        ))}
      </select>
      {saving && <Loader2 size={11} className="animate-spin" style={{ color: 'var(--purple)' }} />}
    </div>
  );
}

type ActionKind = 'resend' | 'reset' | 'delete' | null;

function UserActions({ user, onChanged }: { user: any; onChanged: () => void }) {
  const isInternal = (user.role as string)?.startsWith('tps_');
  const [busy,    setBusy]    = useState<ActionKind>(null);
  const [feedback,setFeedback]= useState<{ kind: 'ok' | 'err' | 'warn'; text: string } | null>(null);

  if (isInternal) {
    return <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>—</span>;
  }

  function flash(kind: 'ok' | 'err' | 'warn', text: string) {
    setFeedback({ kind, text });
    window.setTimeout(() => setFeedback(null), 7000);
  }

  async function resendInvite() {
    setBusy('resend');
    try {
      const res = await fetch(`/api/users/${user.id}/resend-invite`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash('err', body.error ?? 'Failed to resend invite.');
      } else if (body.email_sent === false) {
        flash('warn', `${body.email_warning ?? 'Email did not send.'} Activation link: ${body.activate_url}`);
      } else {
        flash('ok', `Invite email resent to ${user.email}.`);
      }
    } catch (e) {
      flash('err', e instanceof Error ? e.message : 'Network error.');
    } finally {
      setBusy(null);
    }
  }

  async function resetPassword() {
    if (!confirm(`Send a password-reset email to ${user.email}?`)) return;
    setBusy('reset');
    try {
      const res = await fetch(`/api/users/${user.id}/reset-password`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash('err', body.error ?? 'Failed to send reset.');
      } else if (body.email_sent === false) {
        flash('warn', `${body.email_warning ?? 'Email did not send.'} Reset link: ${body.reset_url}`);
      } else {
        flash('ok', `Password-reset email sent to ${user.email}.`);
      }
    } catch (e) {
      flash('err', e instanceof Error ? e.message : 'Network error.');
    } finally {
      setBusy(null);
    }
  }

  async function deleteUser() {
    if (!confirm(
      `Permanently delete ${user.full_name ?? user.email}? This signs them out, removes their login, ` +
      `and deletes their profile. Their authored records (tickets, comments, etc.) stay as audit history. ` +
      `This cannot be undone.`,
    )) return;
    setBusy('delete');
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash('err', body.error ?? 'Failed to delete.');
      } else {
        flash('ok', `${user.email} deleted.`);
        onChanged();
      }
    } catch (e) {
      flash('err', e instanceof Error ? e.message : 'Network error.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <button
          onClick={resendInvite}
          disabled={busy !== null}
          className="btn-ghost btn-sm"
          title="Resend the activation email"
        >
          {busy === 'resend' ? <Loader2 size={11} className="animate-spin" /> : <MailPlus size={11} />}
          <span className="text-[11px]">Resend</span>
        </button>
        <button
          onClick={resetPassword}
          disabled={busy !== null}
          className="btn-ghost btn-sm"
          title="Send a password-reset email"
        >
          {busy === 'reset' ? <Loader2 size={11} className="animate-spin" /> : <KeyRound size={11} />}
          <span className="text-[11px]">Reset</span>
        </button>
        <button
          onClick={deleteUser}
          disabled={busy !== null}
          className="btn-ghost btn-sm"
          title="Delete this user permanently"
          style={{ color: 'var(--danger, #DC2626)' }}
        >
          {busy === 'delete' ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
          <span className="text-[11px]">Delete</span>
        </button>
      </div>
      {feedback && (
        <p
          className="text-[10px] leading-snug max-w-[320px] break-words"
          style={{
            color:
              feedback.kind === 'ok'   ? 'var(--success, #16A34A)' :
              feedback.kind === 'warn' ? 'var(--amber,   #B45309)' :
                                         'var(--danger,  #DC2626)',
          }}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}

export default function UsersClient({ users: initial }: { users: any[] }) {
  const [users,  setUsers]  = useState(initial);
  const [search, setSearch] = useState('');

  const filtered = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.companies?.name?.toLowerCase().includes(q)
    );
  });

  function removeUser(id: string) {
    setUsers((prev) => prev.filter((u) => u.id !== id));
  }

  if (users.length === 0) {
    return <div className="card p-12 empty-state">No users yet.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          className="input max-w-xs"
          placeholder="Search by name, email or company…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          {filtered.length} of {users.length}
        </p>
      </div>
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Company</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u: any) => (
              <tr key={u.id}>
                <td className="font-medium">{u.full_name ?? '-'}</td>
                <td style={{ color: 'var(--ink-soft)' }}>{u.email}</td>
                <td>
                  <RoleCell userId={u.id} initialRole={u.role ?? 'client_editor'} />
                </td>
                <td>
                  {u.companies?.id ? (
                    <Link prefetch={false}
                      href={`/clients/${u.companies.slug ?? u.companies.id}`}
                      className="hover:underline"
                      style={{ color: 'var(--purple)' }}
                    >
                      {u.companies.name}
                    </Link>
                  ) : (
                    <span style={{ color: 'var(--ink-faint)' }}>-</span>
                  )}
                </td>
                <td style={{ color: 'var(--ink-faint)' }}>{new Date(u.created_at).toLocaleDateString('en-GB')}</td>
                <td>
                  <UserActions user={u} onChanged={() => removeUser(u.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
