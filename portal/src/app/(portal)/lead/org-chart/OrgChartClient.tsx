'use client';
import { useState, useMemo } from 'react';
import { Users, ChevronDown, ChevronRight, Building2, Search } from 'lucide-react';

/* ─── Types ─────────────────────────────────────────── */
interface Employee {
  id: string;
  full_name: string;
  job_title: string;
  department: string | null;
  line_manager: string | null;
  status: string;
  employment_type: string;
}

interface TreeNode {
  employee: Employee;
  children: TreeNode[];
}

interface Props {
  employees: Employee[];
}

const STATUS_DOT: Record<string, string> = {
  active: 'var(--success)',
  probation: 'var(--warning)',
  on_leave: '#3B6FFF',
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

/* ─── Build tree from flat list ─────────────────────── */
function buildTree(employees: Employee[]): TreeNode[] {
  // Map by name (case-insensitive) for manager matching
  const byName = new Map<string, Employee>();
  employees.forEach(e => byName.set(e.full_name.toLowerCase(), e));

  // Find who reports to whom
  const childrenMap = new Map<string, Employee[]>();
  const roots: Employee[] = [];

  employees.forEach(emp => {
    const mgr = emp.line_manager?.toLowerCase();
    if (mgr && byName.has(mgr)) {
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
      .map(c => buildNode(c));
    return { employee: emp, children };
  }

  return roots
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .map(r => buildNode(r));
}

/* ─── Tree Node Component ───────────────────────────── */
function OrgNode({ node, depth, allDepts, expanded, toggleExpand, search }: {
  node: TreeNode; depth: number; allDepts: string[];
  expanded: Set<string>; toggleExpand: (id: string) => void;
  search: string;
}) {
  const emp = node.employee;
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(emp.id);
  const deptColor = getDeptColor(emp.department, allDepts);
  const matchesSearch = search && (
    emp.full_name.toLowerCase().includes(search) ||
    emp.job_title.toLowerCase().includes(search) ||
    (emp.department?.toLowerCase().includes(search))
  );

  return (
    <div>
      <div
        className="flex items-center gap-3 py-2 px-3 rounded-lg transition-colors hover:bg-[var(--surface-soft)] cursor-pointer"
        style={{
          marginLeft: depth * 28,
          background: matchesSearch ? 'rgba(124,58,237,0.06)' : undefined,
        }}
        onClick={() => hasChildren && toggleExpand(emp.id)}
      >
        {/* Expand/collapse */}
        <div className="w-4 flex-shrink-0">
          {hasChildren ? (
            isExpanded
              ? <ChevronDown size={13} style={{ color: 'var(--ink-faint)' }} />
              : <ChevronRight size={13} style={{ color: 'var(--ink-faint)' }} />
          ) : (
            <div className="w-1.5 h-1.5 rounded-full ml-1" style={{ background: 'var(--line)' }} />
          )}
        </div>

        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
          style={{ background: `${deptColor}15`, color: deptColor }}
        >
          {emp.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{emp.full_name}</p>
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: STATUS_DOT[emp.status] ?? 'var(--ink-faint)' }} title={emp.status} />
          </div>
          <p className="text-[11px] truncate" style={{ color: 'var(--ink-faint)' }}>
            {emp.job_title}
          </p>
        </div>

        {/* Department badge */}
        {emp.department && (
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 hidden sm:inline"
            style={{ background: `${deptColor}12`, color: deptColor }}
          >
            {emp.department}
          </span>
        )}

        {/* Direct reports count */}
        {hasChildren && (
          <span className="text-[10px] font-medium flex-shrink-0" style={{ color: 'var(--ink-faint)' }}>
            {node.children.length} report{node.children.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="relative">
          {/* Vertical connector line */}
          <div
            className="absolute top-0 bottom-0 w-px"
            style={{ left: depth * 28 + 22, background: 'var(--line)' }}
          />
          {node.children.map(child => (
            <OrgNode
              key={child.employee.id}
              node={child}
              depth={depth + 1}
              allDepts={allDepts}
              expanded={expanded}
              toggleExpand={toggleExpand}
              search={search}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ────────────────────────────────── */
export default function OrgChartClient({ employees }: Props) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Auto-expand first two levels
    const tree = buildTree(employees);
    const ids = new Set<string>();
    tree.forEach(n => {
      ids.add(n.employee.id);
      n.children.forEach(c => ids.add(c.employee.id));
    });
    return ids;
  });

  const tree = useMemo(() => buildTree(employees), [employees]);
  const allDepts = useMemo(() => {
    const depts = new Set(employees.map(e => e.department).filter(Boolean) as string[]);
    return Array.from(depts).sort();
  }, [employees]);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(employees.map(e => e.id)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  const searchLower = search.toLowerCase();

  // Department summary
  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    employees.forEach(e => {
      const d = e.department || 'Unassigned';
      counts[d] = (counts[d] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [employees]);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="section-title text-xl">Organisation Chart</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
            {employees.length} people · {allDepts.length} department{allDepts.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={expandAll} className="btn-ghost btn-sm text-xs">Expand All</button>
          <button onClick={collapseAll} className="btn-ghost btn-sm text-xs">Collapse All</button>
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
              color: getDeptColor(dept === 'Unassigned' ? null : dept, allDepts),
              border: `1px solid ${getDeptColor(dept === 'Unassigned' ? null : dept, allDepts)}25`,
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
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Tree */}
      {employees.length === 0 ? (
        <div className="empty-state">
          <Users size={28} />
          <p className="text-sm font-medium">No employees</p>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            Add employees in Employee Records to build your org chart.
          </p>
        </div>
      ) : (
        <div className="card p-4">
          {tree.map(node => (
            <OrgNode
              key={node.employee.id}
              node={node}
              depth={0}
              allDepts={allDepts}
              expanded={expanded}
              toggleExpand={toggleExpand}
              search={searchLower}
            />
          ))}
        </div>
      )}
    </div>
  );
}
