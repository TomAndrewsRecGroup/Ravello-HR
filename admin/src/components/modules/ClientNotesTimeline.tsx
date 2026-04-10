'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';
import {
  Plus, X, Loader2, Pin, Phone, Mail, Users as UsersIcon,
  MessageSquare, AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react';

interface Note {
  id: string;
  company_id: string;
  author_id: string;
  note_type: string;
  title: string | null;
  body: string;
  pinned: boolean;
  created_at: string;
  profiles?: { full_name: string } | null;
}

interface Props {
  companyId: string;
  companyName: string;
  userId: string;
  initialNotes: Note[];
}

const NOTE_TYPES = [
  { key: 'general',    label: 'Note',       icon: MessageSquare, color: 'var(--blue)' },
  { key: 'call',       label: 'Call',        icon: Phone,         color: 'var(--teal)' },
  { key: 'meeting',    label: 'Meeting',     icon: UsersIcon,     color: 'var(--purple)' },
  { key: 'email',      label: 'Email',       icon: Mail,          color: 'var(--amber)' },
  { key: 'task',       label: 'Task',        icon: CheckCircle2,  color: 'var(--success)' },
  { key: 'escalation', label: 'Escalation',  icon: AlertTriangle, color: 'var(--danger)' },
];

function typeConfig(type: string) {
  return NOTE_TYPES.find(t => t.key === type) ?? NOTE_TYPES[0];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function ClientNotesTimeline({ companyId, companyName, userId, initialNotes }: Props) {
  const supabase = createClient();
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ note_type: 'general', title: '', body: '' });

  const pinned = notes.filter(n => n.pinned);
  const unpinned = notes.filter(n => !n.pinned);

  async function saveNote() {
    if (!form.body.trim()) return;
    setSaving(true);
    const { data } = await supabase
      .from('client_notes')
      .insert({
        company_id: companyId,
        author_id: userId,
        note_type: form.note_type,
        title: form.title || null,
        body: form.body.trim(),
      })
      .select('*, profiles(full_name)')
      .single();
    if (data) setNotes(prev => [data as Note, ...prev]);
    setSaving(false);
    setShowForm(false);
    setForm({ note_type: 'general', title: '', body: '' });
    revalidateAdminPath('/clients');
  }

  async function togglePin(noteId: string, currentPinned: boolean) {
    await supabase.from('client_notes').update({ pinned: !currentPinned }).eq('id', noteId);
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, pinned: !currentPinned } : n));
  }

  async function deleteNote(noteId: string) {
    await supabase.from('client_notes').delete().eq('id', noteId);
    setNotes(prev => prev.filter(n => n.id !== noteId));
  }

  function renderNote(note: Note) {
    const tc = typeConfig(note.note_type);
    const Icon = tc.icon;
    return (
      <div key={note.id} className="flex gap-3 group">
        {/* Timeline dot */}
        <div className="flex flex-col items-center flex-shrink-0">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: `${tc.color}15`, color: tc.color }}
          >
            <Icon size={13} />
          </div>
          <div className="w-px flex-1 mt-1" style={{ background: 'var(--line)' }} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pb-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${tc.color}12`, color: tc.color }}>
                  {tc.label}
                </span>
                {note.title && (
                  <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{note.title}</span>
                )}
                {note.pinned && <Pin size={10} style={{ color: 'var(--purple)' }} />}
              </div>
              <p className="text-sm mt-1 leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>
                {note.body}
              </p>
              <p className="text-[10px] mt-1.5" style={{ color: 'var(--ink-faint)' }}>
                {(note.profiles as any)?.full_name ?? 'Unknown'} · {timeAgo(note.created_at)}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button onClick={() => togglePin(note.id, note.pinned)} className="btn-icon" style={{ width: 24, height: 24 }} title={note.pinned ? 'Unpin' : 'Pin'}>
                <Pin size={11} style={{ color: note.pinned ? 'var(--purple)' : 'var(--ink-faint)' }} />
              </button>
              <button onClick={() => deleteNote(note.id)} className="btn-icon" style={{ width: 24, height: 24 }} title="Delete">
                <X size={11} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>
          Notes & Activity
        </p>
        <button onClick={() => setShowForm(!showForm)} className="btn-secondary btn-sm">
          <Plus size={12} /> Add Note
        </button>
      </div>

      {/* Quick add form */}
      {showForm && (
        <div className="card p-4 mb-4" style={{ border: '1px solid rgba(124,58,237,0.15)' }}>
          <div className="flex items-center gap-2 mb-3">
            {NOTE_TYPES.map(t => (
              <button
                key={t.key}
                onClick={() => setForm(f => ({ ...f, note_type: t.key }))}
                className="text-[10px] font-bold px-2 py-1 rounded-md transition-colors"
                style={{
                  background: form.note_type === t.key ? `${t.color}15` : 'transparent',
                  color: form.note_type === t.key ? t.color : 'var(--ink-faint)',
                  border: `1px solid ${form.note_type === t.key ? `${t.color}30` : 'transparent'}`,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            className="input mb-2"
            placeholder="Title (optional)"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
          <textarea
            className="input mb-3"
            rows={3}
            placeholder={`Add a note about ${companyName}...`}
            value={form.body}
            onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="btn-ghost btn-sm">Cancel</button>
            <button onClick={saveNote} disabled={saving || !form.body.trim()} className="btn-cta btn-sm">
              {saving ? <Loader2 size={12} className="animate-spin" /> : null} Save
            </button>
          </div>
        </div>
      )}

      {/* Pinned notes */}
      {pinned.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: 'var(--purple)' }}>
            <Pin size={9} /> Pinned
          </p>
          {pinned.map(renderNote)}
        </div>
      )}

      {/* Timeline */}
      {unpinned.length === 0 && pinned.length === 0 ? (
        <p className="text-xs text-center py-6" style={{ color: 'var(--ink-faint)' }}>
          No notes yet. Add a note to start tracking activity.
        </p>
      ) : (
        unpinned.map(renderNote)
      )}
    </div>
  );
}
