'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, ChevronDown, ChevronRight, Search, Upload, Download,
  GripVertical, X, Save, ArrowUp, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/* ─── Types ─────────────────────────────────────────── */
interface Employee {
  id:               string;
  full_name:        string;
  job_title:        string;
  department:       string | null;
  line_manager:     string | null;
  status:           string;
  employment_type:  string;
}

interface TreeNode { employee: Employee; children: TreeNode[]; }

interface Props {
  employees: Employee[];
  canEdit:   boolean;
  companyId: string;
}

const STATUS_DOT: Record<string, string> = {
  active:    'var(--success)',
  probation: 'var(--warning)',
  on_leave:  '#3B6FFF',
};

const DEPT_COLORS = [
  'var(--purple)', 'var(--blue)', 'var(--teal)', '#EA3DC4', 'var(--amber)',
  'var(--success)', 'var(--danger)', '#6366F1', '#0891B2', '#CA8A04',
];

function getDeptColor(dept: string | null, allDepts: string[]): string {
  if (!dept) return 'var(--ink-faint)';
  const idx = allDepts.indexOf(dept);
  return DEPT_COLORS[idx % DEPT_COLORS.length];
}

function buildTree(employees: Employee[]): TreeNode[] {
  const byName = new Map<string, Employee>();
  employees.forEach((e) => byName.set(e.full_name.toLowerCase(), e));
  const childrenMap = new Map<string, Employee[]>();
  const roots: Employee[] = [];

  employees.forEach((emp) => {
    const mgr = emp.line_manager?.toLowerCase();
    if (mgr && byName.has(mgr) && mgr !== emp.full_name.toLowerCase()) {
      const existing = childrenMap.get(mgr) ?? [];
      existing.push(emp);
      childrenMap.set(mgr, existing);
    } else {
      roots.push(emp);
    }
  });

  function buildNode(emp: Employee): TreeNode {
    const key = emp.full_name.toLowerCase();
    const children = (childrenMap.get(key) ?? [])
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
      .map((c) => buildNode(c));
    return { employee: emp, children };
  }

  return roots
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .map((r) => buildNode(r));
}

/* Detect a cycle: would moving `dragged` under `target` create a loop? */
function wouldCreateCycle(dragged: Employee, target: Employee, all: Employee[]): boolean {
  if (dragged.id === target.id) return true;
  const byName = new Map<string, Employee>();
  all.forEach((e) => byName.set(e.full_name.toLowerCase(), e));
  let cursor: Employee | undefined = target;
  const seen = new Set<string>();
  while (cursor) {
    if (seen.has(cursor.id)) return true;
    seen.add(cursor.id);
    if (cursor.id === dragged.id) return true;
    const mgrName: string | undefined = cursor.line_manager
      ? cursor.line_manager.toLowerCase()
      : undefined;
    cursor = mgrName ? byName.get(mgrName) : undefined;
  }
  return false;
}

/* ─── Tree Node ─────────────────────────────────────── */
function OrgNode({
  node, depth, allDepts, expanded, toggleExpand, search, dnd,
}: {
  node: TreeNode; depth: number; allDepts: string[];
  expanded: Set<string>; toggleExpand: (id: string) => void;
  search: string;
  dnd: ReturnType<typeof useDnd>;
}) {
  const emp = node.employee;
  const hasChildren = node.children.length > 0;
  const isExpanded  = expanded.has(emp.id);
  const deptColor   = getDeptColor(emp.department, allDepts);
  const matchesSearch = search && (
    emp.full_name.toLowerCase().includes(search) ||
    emp.job_title.toLowerCase().includes(search) ||
    (emp.department?.toLowerCase().includes(search))
  );

  const isDragging = dnd.draggingId === emp.id;
  const isDropTarget = dnd.dropTargetId === emp.id;
  const isInvalidTarget = dnd.invalidTargetId === emp.id;

  return (
    <div>
      <div
        draggable={dnd.canEdit}
        onDragStart={(e) => dnd.onDragStart(e, emp)}
        onDragOver={(e)  => dnd.onDragOver(e,  emp)}
        onDragLeave={()  => dnd.onDragLeave(emp)}
        onDrop={(e)      => dnd.onDrop(e,      emp)}
        onDragEnd={()    => dnd.onDragEnd()}
        className="flex items-center gap-3 py-2 px-3 rounded-lg transition-colors"
        style={{
          marginLeft: depth * 28,
          background:
            isDropTarget    ? 'rgba(20,184,166,0.10)'
          : isInvalidTarget ? 'rgba(220,38,38,0.08)'
          : matchesSearch   ? 'rgba(124,58,237,0.06)'
          :                   undefined,
          border: isDropTarget
            ? '1px dashed var(--teal)'
            : isInvalidTarget
            ? '1px dashed var(--danger)'
            : '1px solid transparent',
          opacity: isDragging ? 0.4 : 1,
          cursor:  dnd.canEdit ? 'grab' : 'default',
        }}
      >
        {dnd.canEdit && (
          <span style={{ color: 'var(--ink-faint)', cursor: 'grab' }}>
            <GripVertical size={12} />
          </span>
        )}

        {/* Expand/collapse */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (hasChildren) toggleExpand(emp.id); }}
          className="w-4 flex-shrink-0"
          aria-label={hasChildren ? (isExpanded ? 'Collapse' : 'Expand') : undefined}
        >
          {hasChildren ? (
            isExpanded
              ? <ChevronDown  size={13} style={{ color: 'var(--ink-faint)' }} />
              : <ChevronRight size={13} style={{ color: 'var(--ink-faint)' }} />
          ) : (
            <span className="block w-1.5 h-1.5 rounded-full ml-1" style={{ background: 'var(--line)' }} />
          )}
        </button>

        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
          style={{ background: `${deptColor}15`, color: deptColor }}
        >
          {emp.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{emp.full_name}</p>
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: STATUS_DOT[emp.status] ?? 'var(--ink-faint)' }} title={emp.status} />
          </div>
          <p className="text-[11px] truncate" style={{ color: 'var(--ink-faint)' }}>{emp.job_title}</p>
        </div>

        {emp.department && (
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 hidden sm:inline"
            style={{ background: `${deptColor}12`, color: deptColor }}
          >
            {emp.department}
          </span>
        )}

        {dnd.canEdit && emp.line_manager && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); dnd.promoteToRoot(emp); }}
            className="text-[10px] font-medium flex items-center gap-1 px-2 py-0.5 rounded"
            style={{ color: 'var(--ink-faint)', background: 'transparent' }}
            title="Make top-level"
          >
            <ArrowUp size={11} /> top
          </button>
        )}

        {hasChildren && (
          <span className="text-[10px] font-medium flex-shrink-0" style={{ color: 'var(--ink-faint)' }}>
            {node.children.length} report{node.children.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className="relative">
          <div
            className="absolute top-0 bottom-0 w-px"
            style={{ left: depth * 28 + 22, background: 'var(--line)' }}
          />
          {node.children.map((child) => (
            <OrgNode
              key={child.employee.id}
              node={child}
              depth={depth + 1}
              allDepts={allDepts}
              expanded={expanded}
              toggleExpand={toggleExpand}
              search={search}
              dnd={dnd}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Drag-and-drop hook ────────────────────────────── */
function useDnd({
  canEdit, employees, onChange,
}: {
  canEdit:   boolean;
  employees: Employee[];
  onChange:  (id: string, patch: Partial<Employee>) => Promise<void>;
}) {
  const [draggingId,      setDraggingId]      = useState<string | null>(null);
  const [dropTargetId,    setDropTargetId]    = useState<string | null>(null);
  const [invalidTargetId, setInvalidTargetId] = useState<string | null>(null);

  function onDragStart(e: React.DragEvent, emp: Employee) {
    if (!canEdit) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', emp.id);
    setDraggingId(emp.id);
  }

  function onDragOver(e: React.DragEvent, target: Employee) {
    if (!canEdit || !draggingId) return;
    e.preventDefault();
    const dragged = employees.find((x) => x.id === draggingId);
    if (!dragged) return;
    if (wouldCreateCycle(dragged, target, employees)) {
      e.dataTransfer.dropEffect = 'none';
      setInvalidTargetId(target.id);
      setDropTargetId(null);
      return;
    }
    e.dataTransfer.dropEffect = 'move';
    setDropTargetId(target.id);
    setInvalidTargetId(null);
  }

  function onDragLeave(target: Employee) {
    if (dropTargetId    === target.id) setDropTargetId(null);
    if (invalidTargetId === target.id) setInvalidTargetId(null);
  }

  async function onDrop(e: React.DragEvent, target: Employee) {
    if (!canEdit) return;
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    setDropTargetId(null);
    setInvalidTargetId(null);
    setDraggingId(null);
    if (!id || id === target.id) return;
    const dragged = employees.find((x) => x.id === id);
    if (!dragged) return;
    if (wouldCreateCycle(dragged, target, employees)) return;
    if ((dragged.line_manager ?? '').toLowerCase() === target.full_name.toLowerCase()) return;
    await onChange(id, { line_manager: target.full_name });
  }

  function onDragEnd() {
    setDraggingId(null);
    setDropTargetId(null);
    setInvalidTargetId(null);
  }

  async function promoteToRoot(emp: Employee) {
    if (!canEdit) return;
    await onChange(emp.id, { line_manager: null });
  }

  return {
    canEdit,
    draggingId, dropTargetId, invalidTargetId,
    onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
    promoteToRoot,
  };
}

/* ─── CSV helpers ───────────────────────────────────── */
interface CsvRow {
  full_name:    string;
  job_title:    string;
  department:   string;
  line_manager: string;
  email:        string;
}

function parseCsv(text: string): { rows: CsvRow[]; warnings: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], warnings: ['CSV is empty or missing rows.'] };

  // Naive CSV: split on comma, support quoted fields with embedded commas.
  const split = (line: string): string[] => {
    const out: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === ',' && !inQ) {
        out.push(cur.trim()); cur = '';
      } else {
        cur += c;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const header = split(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const ix = (key: string) => header.indexOf(key);
  const cols = {
    name:    ix('full_name')    !== -1 ? ix('full_name')    : ix('name'),
    title:   ix('job_title')    !== -1 ? ix('job_title')    : ix('title'),
    dept:    ix('department')   !== -1 ? ix('department')   : ix('team'),
    mgr:     ix('line_manager') !== -1 ? ix('line_manager') : ix('manager'),
    email:   ix('email'),
  };
  const warnings: string[] = [];
  if (cols.name === -1) warnings.push('No "full_name" or "name" column found. Required.');

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = split(lines[i]);
    const full_name    = (cells[cols.name]  ?? '').trim();
    if (!full_name) continue;
    rows.push({
      full_name,
      job_title:    (cols.title  >= 0 ? cells[cols.title]  : '').trim() || 'TBD',
      department:   (cols.dept   >= 0 ? cells[cols.dept]   : '').trim(),
      line_manager: (cols.mgr    >= 0 ? cells[cols.mgr]    : '').trim(),
      email:        (cols.email  >= 0 ? cells[cols.email]  : '').trim(),
    });
  }

  return { rows, warnings };
}

function downloadCsvTemplate() {
  const sample =
`full_name,job_title,department,line_manager,email
Jane Smith,CEO,Leadership,,jane@example.com
Mark Patel,Head of Sales,Sales,Jane Smith,mark@example.com
Priya Lo,Account Executive,Sales,Mark Patel,priya@example.com
Alex Chen,Head of Engineering,Engineering,Jane Smith,alex@example.com
`;
  const blob = new Blob([sample], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'org-chart-template.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ─── Main Component ────────────────────────────────── */
export default function OrgChartClient({ employees: initial, canEdit, companyId }: Props) {
  const supabase = createClient();
  const router   = useRouter();

  const [employees, setEmployees] = useState<Employee[]>(initial);
  const [search,    setSearch]    = useState('');
  const [toast,     setToast]     = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Re-sync if server props change (e.g. after router.refresh()).
  useEffect(() => { setEmployees(initial); }, [initial]);

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const tree = buildTree(initial);
    const ids = new Set<string>();
    tree.forEach((n) => {
      ids.add(n.employee.id);
      n.children.forEach((c) => ids.add(c.employee.id));
    });
    return ids;
  });

  const tree     = useMemo(() => buildTree(employees), [employees]);
  const allDepts = useMemo(() => {
    const depts = new Set(employees.map((e) => e.department).filter(Boolean) as string[]);
    return Array.from(depts).sort();
  }, [employees]);
  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    employees.forEach((e) => {
      const d = e.department || 'Unassigned';
      counts[d] = (counts[d] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [employees]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  const expandAll   = () => setExpanded(new Set(employees.map((e) => e.id)));
  const collapseAll = () => setExpanded(new Set());

  function showToast(kind: 'ok' | 'err', text: string) {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 3500);
  }

  async function persistChange(id: string, patch: Partial<Employee>) {
    // Optimistic update
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    const { error } = await supabase
      .from('employee_records')
      .update(patch)
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) {
      showToast('err', `Could not save: ${error.message}`);
      // Roll back by re-fetching
      router.refresh();
    } else {
      showToast('ok', 'Saved');
    }
  }

  const dnd = useDnd({ canEdit, employees, onChange: persistChange });

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg"
          style={{
            background: toast.kind === 'ok' ? 'var(--success)' : 'var(--danger)',
            color: '#fff',
          }}
          role="status"
        >
          {toast.kind === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          <span className="text-xs font-medium">{toast.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="section-title text-xl">Organisation Chart</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
            {employees.length} {employees.length === 1 ? 'person' : 'people'} · {allDepts.length} department{allDepts.length !== 1 ? 's' : ''}
            {canEdit && <span> · drag a person onto another to reassign their manager</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={expandAll}   className="btn-ghost btn-sm text-xs">Expand all</button>
          <button onClick={collapseAll} className="btn-ghost btn-sm text-xs">Collapse all</button>
          {canEdit && (
            <>
              <button onClick={() => setShowImport(true)} className="btn-secondary btn-sm text-xs">
                <Upload size={12} /> Upload chart
              </button>
              <button onClick={downloadCsvTemplate} className="btn-ghost btn-sm text-xs" title="Download CSV template">
                <Download size={12} /> Template
              </button>
            </>
          )}
        </div>
      </div>

      {/* Department legend */}
      <div className="flex flex-wrap gap-2 mb-4">
        {deptCounts.map(([dept, count]) => (
          <span
            key={dept}
            className="text-[10px] font-medium px-2 py-1 rounded-full"
            style={{
              background: `${getDeptColor(dept === 'Unassigned' ? null : dept, allDepts)}10`,
              color:      getDeptColor(dept === 'Unassigned' ? null : dept, allDepts),
              border:     `1px solid ${getDeptColor(dept === 'Unassigned' ? null : dept, allDepts)}25`,
            }}
          >
            {dept} ({count})
          </span>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
        <input
          type="text"
          placeholder="Search by name, title, department..."
          className="input pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tree */}
      {employees.length === 0 ? (
        <div className="empty-state">
          <Users size={28} />
          <p className="text-sm font-medium">No one on the chart yet</p>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            {canEdit
              ? 'Upload your existing chart as CSV, or add employees in Employee Records.'
              : 'Ask your account admin to upload your team.'}
          </p>
        </div>
      ) : (
        <div className="card p-4">
          {tree.map((node) => (
            <OrgNode
              key={node.employee.id}
              node={node}
              depth={0}
              allDepts={allDepts}
              expanded={expanded}
              toggleExpand={toggleExpand}
              search={search.toLowerCase()}
              dnd={dnd}
            />
          ))}
        </div>
      )}

      {showImport && canEdit && (
        <ImportModal
          companyId={companyId}
          existing={employees}
          onClose={() => setShowImport(false)}
          onDone={(msg) => { showToast('ok', msg); setShowImport(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

/* ─── Import Modal ─────────────────────────────────── */
function ImportModal({
  companyId, existing, onClose, onDone,
}: {
  companyId: string;
  existing:  Employee[];
  onClose:   () => void;
  onDone:    (msg: string) => void;
}) {
  const supabase = createClient();
  const [text,     setText]     = useState('');
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (text ? parseCsv(text) : { rows: [], warnings: [] }), [text]);
  const existingByName = useMemo(() => {
    const m = new Map<string, Employee>();
    existing.forEach((e) => m.set(e.full_name.toLowerCase(), e));
    return m;
  }, [existing]);

  async function handleFile(f: File) {
    if (f.size > 1_000_000) { setError('File too large (1MB max).'); return; }
    const t = await f.text();
    setText(t); setError(null);
  }

  async function handleImport() {
    setBusy(true); setError(null);
    try {
      // Insert new rows first; updates for existing rows by name.
      const newRows  = parsed.rows.filter((r) => !existingByName.has(r.full_name.toLowerCase()));
      const updRows  = parsed.rows.filter((r) =>  existingByName.has(r.full_name.toLowerCase()));

      if (newRows.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const { error } = await supabase.from('employee_records').insert(
          newRows.map((r) => ({
            company_id:      companyId,
            full_name:       r.full_name,
            email:           r.email || null,
            job_title:       r.job_title || 'TBD',
            department:      r.department || null,
            line_manager:    r.line_manager || null,
            employment_type: 'full_time',
            status:          'active',
            start_date:      today,
          })),
        );
        if (error) throw new Error(error.message);
      }

      for (const r of updRows) {
        const target = existingByName.get(r.full_name.toLowerCase())!;
        const patch: Partial<Employee> = {
          job_title:    r.job_title || target.job_title,
          department:   r.department || target.department,
          line_manager: r.line_manager || target.line_manager,
        };
        const { error } = await supabase
          .from('employee_records')
          .update(patch)
          .eq('id', target.id)
          .eq('company_id', companyId);
        if (error) throw new Error(error.message);
      }

      onDone(`Imported ${newRows.length} new, updated ${updRows.length}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(7,11,29,0.55)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-5" style={{ borderBottom: '1px solid var(--line)' }}>
          <div>
            <h3 className="font-display text-lg font-bold">Upload your org chart</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
              Paste CSV or upload a .csv file. Columns: full_name, job_title, department, line_manager, email.
            </p>
          </div>
          <button onClick={onClose} className="btn-icon btn-sm"><X size={14} /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          <div className="flex flex-wrap gap-2 mb-4">
            <button onClick={() => fileRef.current?.click()} className="btn-secondary btn-sm">
              <Upload size={12} /> Choose .csv file
            </button>
            <button onClick={downloadCsvTemplate} className="btn-ghost btn-sm">
              <Download size={12} /> Download template
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="input w-full font-mono text-xs"
            rows={10}
            placeholder={'full_name,job_title,department,line_manager,email\nJane Smith,CEO,Leadership,,jane@example.com'}
          />

          {parsed.warnings.length > 0 && (
            <div className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>
              {parsed.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
            </div>
          )}

          {parsed.rows.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink)' }}>
                Preview ({parsed.rows.length} row{parsed.rows.length !== 1 ? 's' : ''})
              </p>
              <div className="rounded-md overflow-hidden" style={{ border: '1px solid var(--line)' }}>
                <table className="w-full text-xs">
                  <thead style={{ background: 'var(--surface-soft)' }}>
                    <tr>
                      {['Name', 'Title', 'Department', 'Reports to', 'Status'].map((h) => (
                        <th key={h} className="text-left px-2 py-1.5 font-semibold" style={{ color: 'var(--ink-faint)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 50).map((r, i) => {
                      const isExisting = existingByName.has(r.full_name.toLowerCase());
                      return (
                        <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                          <td className="px-2 py-1.5 font-medium">{r.full_name}</td>
                          <td className="px-2 py-1.5">{r.job_title}</td>
                          <td className="px-2 py-1.5">{r.department || <span style={{ color: 'var(--ink-faint)' }}>—</span>}</td>
                          <td className="px-2 py-1.5">{r.line_manager || <span style={{ color: 'var(--ink-faint)' }}>—</span>}</td>
                          <td className="px-2 py-1.5" style={{ color: isExisting ? 'var(--blue)' : 'var(--success)' }}>
                            {isExisting ? 'Update' : 'Add'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {parsed.rows.length > 50 && (
                  <p className="text-[11px] px-2 py-1.5" style={{ color: 'var(--ink-faint)' }}>
                    +{parsed.rows.length - 50} more rows…
                  </p>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>{error}</p>
          )}
        </div>

        <div className="p-5 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--line)' }}>
          <button onClick={onClose} className="btn-ghost btn-sm" disabled={busy}>Cancel</button>
          <button
            onClick={handleImport}
            disabled={busy || parsed.rows.length === 0 || parsed.warnings.length > 0}
            className="btn-cta btn-sm"
          >
            <Save size={12} /> {busy ? 'Importing…' : `Import ${parsed.rows.length || ''} row${parsed.rows.length === 1 ? '' : 's'}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
