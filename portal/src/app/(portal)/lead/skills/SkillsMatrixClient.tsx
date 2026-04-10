'use client';
import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidatePortalPath } from '@/app/actions';
import { Plus, X, Loader2, Grid3X3 } from 'lucide-react';

interface Skill {
  id: string;
  employee_name: string;
  department: string | null;
  role_title: string | null;
  skill_name: string;
  skill_category: string | null;
  current_level: number | null;
  target_level: number | null;
  last_assessed: string | null;
  notes: string | null;
}

interface Props { companyId: string; initialSkills: Skill[]; }

const LEVEL_LABELS = ['None', 'Awareness', 'Developing', 'Competent', 'Proficient', 'Expert'];
const LEVEL_COLORS = ['#94A3B8', '#60A5FA', '#34D399', '#FBBF24', '#F97316', '#8B5CF6'];
const CATEGORIES = ['Technical', 'Leadership', 'Communication', 'Commercial', 'Operational', 'Other'];

function LevelDot({ level, size = 16 }: { level: number | null; size?: number }) {
  const l = level ?? 0;
  return (
    <div
      className="rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
      style={{ width: size, height: size, background: LEVEL_COLORS[l] ?? '#94A3B8' }}
      title={LEVEL_LABELS[l]}
    >
      {l}
    </div>
  );
}

function GapBar({ current, target }: { current: number | null; target: number | null }) {
  const c = current ?? 0;
  const t = target ?? 0;
  const gap = Math.max(0, t - c);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className="w-3 h-3 rounded-sm"
            style={{
              background: i <= c ? LEVEL_COLORS[c] : i <= t ? 'rgba(139,92,246,0.25)' : 'rgba(148,163,184,0.15)',
            }}
          />
        ))}
      </div>
      {gap > 0 && (
        <span className="text-[10px]" style={{ color: '#8B5CF6' }}>+{gap}</span>
      )}
    </div>
  );
}

export default function SkillsMatrixClient({ companyId, initialSkills }: Props) {
  const supabase = createClient();
  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterDept, setFilterDept] = useState('all');
  const [filterCat, setFilterCat] = useState('all');
  const [form, setForm] = useState({
    employee_name: '', department: '', role_title: '',
    skill_name: '', skill_category: 'Technical',
    current_level: '0', target_level: '3',
    last_assessed: '', notes: '',
  });

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.employee_name.trim() || !form.skill_name.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from('skills_matrix').insert({
      company_id:     companyId,
      employee_name:  form.employee_name,
      department:     form.department || null,
      role_title:     form.role_title || null,
      skill_name:     form.skill_name,
      skill_category: form.skill_category || null,
      current_level:  parseInt(form.current_level),
      target_level:   parseInt(form.target_level),
      last_assessed:  form.last_assessed || null,
      notes:          form.notes || null,
    }).select().single();
    if (!error && data) {
      setSkills(prev => [...prev, data as Skill].sort((a, b) => a.employee_name.localeCompare(b.employee_name)));
      setShowForm(false);
      setForm({ employee_name: '', department: '', role_title: '', skill_name: '', skill_category: 'Technical', current_level: '0', target_level: '3', last_assessed: '', notes: '' });
      revalidatePortalPath('/lead/skills');
    }
    setSaving(false);
  }

  const departments = useMemo(() => ['all', ...Array.from(new Set(skills.map(s => s.department).filter(Boolean) as string[]))], [skills]);
  const categories  = useMemo(() => ['all', ...Array.from(new Set(skills.map(s => s.skill_category).filter(Boolean) as string[]))], [skills]);

  const filtered = skills.filter(s =>
    (filterDept === 'all' || s.department === filterDept) &&
    (filterCat  === 'all' || s.skill_category === filterCat)
  );

  // Group by employee
  const byEmployee = useMemo(() => {
    const map: Record<string, Skill[]> = {};
    for (const s of filtered) {
      if (!map[s.employee_name]) map[s.employee_name] = [];
      map[s.employee_name].push(s);
    }
    return map;
  }, [filtered]);

  const totalGaps = skills.filter(s => (s.target_level ?? 0) > (s.current_level ?? 0)).length;
  const avgCurrent = skills.length > 0
    ? (skills.reduce((sum, s) => sum + (s.current_level ?? 0), 0) / skills.length).toFixed(1)
    : '—';

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: 'var(--purple)' }}>{Object.keys(byEmployee).length}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>Team Members</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{avgCurrent}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>Avg Skill Level</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: totalGaps > 0 ? 'var(--amber)' : 'var(--success)' }}>{totalGaps}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>Skill Gaps</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <select className="input text-xs py-1.5 w-auto" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
            {departments.map(d => <option key={d} value={d}>{d === 'all' ? 'All Departments' : d}</option>)}
          </select>
          <select className="input text-xs py-1.5 w-auto" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
          </select>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-cta btn-sm flex items-center gap-1.5">
          <Plus size={13} /> Add Skill
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Add Skill Entry</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Employee Name *</label>
              <input className="input" placeholder="e.g. Alex Chen" value={form.employee_name} onChange={e => set('employee_name', e.target.value)} />
            </div>
            <div>
              <label className="label">Role Title</label>
              <input className="input" placeholder="e.g. Senior Developer" value={form.role_title} onChange={e => set('role_title', e.target.value)} />
            </div>
            <div>
              <label className="label">Department</label>
              <input className="input" placeholder="e.g. Engineering" value={form.department} onChange={e => set('department', e.target.value)} />
            </div>
            <div>
              <label className="label">Skill Name *</label>
              <input className="input" placeholder="e.g. Python, Stakeholder Management" value={form.skill_name} onChange={e => set('skill_name', e.target.value)} />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.skill_category} onChange={e => set('skill_category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Last Assessed</label>
              <input type="date" className="input" value={form.last_assessed} onChange={e => set('last_assessed', e.target.value)} />
            </div>
            <div>
              <label className="label">Current Level (0–5)</label>
              <select className="input" value={form.current_level} onChange={e => set('current_level', e.target.value)}>
                {LEVEL_LABELS.map((l, i) => <option key={i} value={i}>{i} – {l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Target Level (0–5)</label>
              <select className="input" value={form.target_level} onChange={e => set('target_level', e.target.value)}>
                {LEVEL_LABELS.map((l, i) => <option key={i} value={i}>{i} – {l}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <textarea className="input h-14 resize-none" value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.employee_name.trim() || !form.skill_name.trim()} className="btn-cta btn-sm flex items-center gap-1.5">
              {saving && <Loader2 size={12} className="animate-spin" />} Save
            </button>
            <button onClick={() => setShowForm(false)} className="btn-ghost btn-sm flex items-center gap-1">
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Level legend */}
      <div className="flex flex-wrap gap-3">
        {LEVEL_LABELS.map((l, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <LevelDot level={i} size={14} />
            <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{i} – {l}</span>
          </div>
        ))}
      </div>

      {/* Matrix */}
      {Object.keys(byEmployee).length === 0 ? (
        <div className="card p-12">
          <div className="empty-state py-4">
            <Grid3X3 size={24} />
            <p className="text-sm">No skills mapped yet</p>
            <p className="text-xs max-w-[280px]">Add skill entries for your team members to build a capability map and identify development gaps.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(byEmployee).map(([employee, empSkills]) => (
            <div key={employee} className="card p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{employee}</p>
                  {empSkills[0].role_title && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                      {[empSkills[0].role_title, empSkills[0].department].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{empSkills.length} skill{empSkills.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-2">
                {empSkills.map(s => (
                  <div key={s.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium truncate" style={{ color: 'var(--ink-soft)' }}>{s.skill_name}</span>
                        {s.skill_category && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-alt)', color: 'var(--ink-faint)' }}>
                            {s.skill_category}
                          </span>
                        )}
                      </div>
                    </div>
                    <GapBar current={s.current_level} target={s.target_level} />
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <LevelDot level={s.current_level} />
                      <span className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>→</span>
                      <LevelDot level={s.target_level} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
