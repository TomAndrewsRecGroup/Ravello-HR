'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  Search, X, Building2, Briefcase, Users, LifeBuoy,
  FileText, ShieldCheck, Loader2, UserRound, Trophy, MapPin, Network,
  CheckSquare, AlertTriangle, ClipboardCheck, Wrench,
  Leaf, Scale, Target, Users2, ClipboardList, MessageSquare,
  HardHat, FileSignature, Siren, GraduationCap,
  Shield, Milestone, Lightbulb, TrendingUp, BarChart3, Calendar,
} from 'lucide-react';

// UI/UX cross-linking pass, round 4 (2026-10-04): portal has had no
// search surface at all since the admin app's own GlobalSearch.tsx
// shipped — a real, scoped gap, closed here. This is DELIBERATELY a
// self-contained mirror of admin's component, not a shared import:
// the two apps share no server/client code across the repo boundary
// (the established reason every "role: 'admin' | 'portal'" shared-
// dupe component in this codebase takes an explicit role rather than
// importing from the other app), and admin's own GlobalSearch.tsx
// already keeps its own local hrefFor() rather than importing
// entityLabels.ts's hrefForEntity() for the overlapping types — the
// same precedent, applied here.
//
// search_records() is SECURITY INVOKER (Phase 1's own standing rule):
// it runs under THIS caller's own RLS, so a portal session sees only
// the rows their own company-scoped (or portfolio-scoped, for a
// consultant) policies already allow — identical safety property to
// admin's own call, no new security surface introduced by this file.
//
// Routing differs from admin's by necessity — a client has no
// `/clients/<id>` or `/health-safety/<id>/...` admin workspace, only
// their own `/protect/...`/`/lead/...`/`/hire/...` pages. Every
// destination below was verified against a REAL existing portal route
// before being added (`find src/app/(portal) -iname page.tsx`), never
// guessed from the admin equivalent's path shape.
interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  organisation:    { icon: Building2,   color: 'var(--purple)', label: 'Organisation' },
  person:          { icon: UserRound,   color: 'var(--teal)',   label: 'Person' },
  employee:        { icon: UserRound,   color: 'var(--teal)',   label: 'Employee' },
  candidate:       { icon: Users,       color: 'var(--teal)',   label: 'Candidate' },
  athlete:         { icon: Trophy,      color: 'var(--gold)',   label: 'Athlete' },
  role:            { icon: Briefcase,   color: 'var(--blue)',   label: 'Role' },
  site:            { icon: MapPin,      color: 'var(--blue)',   label: 'Site' },
  department:      { icon: Network,     color: 'var(--blue)',   label: 'Department' },
  job_role:        { icon: Briefcase,   color: 'var(--blue)',   label: 'Job role' },
  training_course: { icon: GraduationCap, color: 'var(--teal)', label: 'Training course' },
  document:        { icon: FileText,    color: 'var(--purple)', label: 'Document' },
  hs_document:     { icon: FileText,    color: 'var(--purple)', label: 'H&S document' },
  action:          { icon: CheckSquare, color: 'var(--gold)',   label: 'Action' },
  incident:        { icon: AlertTriangle, color: 'var(--red)',  label: 'Incident' },
  investigation:   { icon: ClipboardCheck, color: 'var(--red)', label: 'Investigation' },
  hazard:          { icon: AlertTriangle, color: 'var(--red)',  label: 'Hazard' },
  risk_assessment: { icon: Shield,      color: 'var(--teal)',   label: 'Risk assessment' },
  method_statement:{ icon: FileSignature, color: 'var(--gold)', label: 'RAMS' },
  substance:       { icon: Leaf,        color: 'var(--teal)',   label: 'Substance' },
  coshh_assessment:{ icon: Shield,      color: 'var(--teal)',   label: 'COSHH assessment' },
  audit:           { icon: ClipboardCheck, color: 'var(--teal)', label: 'Audit' },
  equipment:       { icon: Wrench,      color: 'var(--ink-soft)', label: 'Equipment' },
  service_request: { icon: LifeBuoy,    color: 'var(--gold)',   label: 'Request' },
  environmental_aspect: { icon: Leaf,           color: 'var(--teal)',   label: 'Env. aspect' },
  environmental_permit: { icon: Leaf,           color: 'var(--teal)',   label: 'Env. permit' },
  legal_requirement:    { icon: Scale,          color: 'var(--ink-soft)', label: 'Legal requirement' },
  objective:            { icon: Target,         color: 'var(--purple)', label: 'Objective' },
  management_review:    { icon: Users2,         color: 'var(--purple)', label: 'Management review' },
  audit_programme:      { icon: ClipboardList,  color: 'var(--teal)',   label: 'Audit programme' },
  consultation_record:  { icon: MessageSquare,  color: 'var(--gold)',   label: 'Consultation' },
  iso_certification:    { icon: ShieldCheck,    color: 'var(--purple)', label: 'ISO certification' },
  contractor:           { icon: HardHat,        color: 'var(--ink-soft)', label: 'Contractor' },
  permit:                { icon: FileSignature,  color: 'var(--gold)',   label: 'Permit' },
  emergency_plan:        { icon: Siren,          color: 'var(--red)',    label: 'Emergency plan' },
  hs_test:                { icon: GraduationCap,  color: 'var(--teal)',   label: 'Test' },
  compliance_item:       { icon: ShieldCheck,    color: 'var(--red)',    label: 'Register item' },
  control:                { icon: Shield,         color: 'var(--teal)',   label: 'Control' },
  milestone:              { icon: Milestone,      color: 'var(--gold)',   label: 'Milestone' },
  lesson_learned:         { icon: Lightbulb,      color: 'var(--gold)',   label: 'Lesson learned' },
  dev_plan:               { icon: TrendingUp,     color: 'var(--teal)',   label: 'Development plan' },
  report:                 { icon: BarChart3,      color: 'var(--purple)', label: 'Report' },
  hs_activity:            { icon: Calendar,       color: 'var(--blue)',   label: 'Activity' },
};

// Where each kind of record lives in the PORTAL app. A type with no
// sensible portal destination lands on /dashboard rather than a
// guessed path — honest, not a fabricated deep link.
function hrefFor(type: string, id: string): string {
  switch (type) {
    case 'person':            return `/lead/workforce/people/${id}`;
    case 'role':              return `/hire/hiring/${id}`;
    case 'candidate':         return '/hire/hiring';
    case 'athlete':           return '/athletes-to-industry';
    case 'employee':          return '/lead/employee-records';
    case 'job_role':          return '/lead/workforce/roles';
    case 'training_course':   return '/lead/training';
    case 'document':          return '/lead/documents';
    case 'hs_document':       return '/protect/documents';
    case 'action':            return '/protect/actions';
    case 'incident':          return `/protect/incidents/${id}`;
    case 'investigation':     return '/protect/investigations';
    case 'hazard':            return `/protect/hazards/${id}`;
    case 'risk_assessment':   return `/protect/risk-assessments/${id}`;
    case 'method_statement':  return `/protect/rams/${id}`;
    case 'substance':         return `/protect/substances/${id}`;
    case 'coshh_assessment':  return `/protect/coshh/${id}`;
    case 'audit':             return '/protect/audits';
    case 'equipment':         return '/protect/equipment';
    case 'service_request':   return '/support';
    case 'environmental_aspect': return '/protect/environmental-aspects';
    case 'environmental_permit': return '/protect/environmental-permits';
    // Staff-only catalogue (159) — a client's own view is their
    // OBLIGATIONS against it, not the catalogue itself; the portal's
    // own /protect/legal-register page is exactly that per-org view.
    case 'legal_requirement':   return '/protect/legal-register';
    case 'objective':           return '/protect/objectives';
    case 'management_review':   return '/protect/management-review';
    case 'audit_programme':     return '/protect/audit-programmes';
    case 'consultation_record': return '/protect/consultation';
    case 'iso_certification':   return '/protect/iso-readiness';
    case 'contractor':          return '/protect/contractors';
    case 'permit':               return '/protect/permits';
    case 'emergency_plan':       return '/protect/emergency-plans';
    case 'hs_test':               return '/protect/tests';
    case 'compliance_item':       return '/protect/compliance';
    case 'control':                return '/protect/critical-controls';
    case 'milestone':              return '/lead/roadmap';
    case 'lesson_learned':         return '/protect/lessons-learned';
    case 'report':                 return '/protect/reports';
    case 'hs_activity':            return '/protect';
    // No portal page exists for athlete/employee development plans
    // (admin-only, staff-managed on the client's behalf) or for a
    // bare organisation/site/department row — honest fallback, not a
    // guessed destination.
    default:                return '/dashboard';
  }
}

export default function GlobalSearch() {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    const { data, error } = await supabase.rpc('search_records', { p_query: q, p_limit: 40 });
    if (error) console.error('[search] search_records failed:', error.message);

    const all: SearchResult[] = ((data ?? []) as Array<{ entity_type: string; entity_id: string; title: string; subtitle: string | null }>)
      .map(r => ({
        type: r.entity_type, id: r.entity_id, title: r.title,
        subtitle: r.subtitle ?? TYPE_CONFIG[r.entity_type]?.label ?? '',
        href: hrefFor(r.entity_type, r.entity_id),
      }));

    setResults(all);
    setSelectedIdx(0);
    setLoading(false);
  }, [supabase]);

  function handleInput(val: string) {
    setQuery(val);
    clearTimeout(debounceRef.current);
    if (val.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(() => search(val), 400);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      setOpen(false);
      router.push(results[selectedIdx].href);
    }
  }

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-icon" title="Search (⌘K)" aria-label="Search">
        <Search size={15} />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden" style={{ animation: 'fadeUp 0.15s ease' }}>
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <Search size={16} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search people, roles, incidents, documents…"
            className="flex-1 outline-none bg-transparent text-sm"
            style={{ color: 'var(--ink)' }}
          />
          {loading && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--ink-faint)' }} />}
          <button onClick={() => setOpen(false)} className="btn-icon" aria-label="Close search">
            <X size={14} />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {query.length >= 2 && !loading && results.length === 0 && (
            <p className="px-4 py-6 text-sm text-center" style={{ color: 'var(--ink-faint)' }}>No results for &ldquo;{query}&rdquo;</p>
          )}
          {results.map((r, i) => {
            const tc = TYPE_CONFIG[r.type] ?? TYPE_CONFIG.organisation;
            const Icon = tc.icon;
            return (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => navigate(r.href)}
                onMouseEnter={() => setSelectedIdx(i)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
                style={{ background: i === selectedIdx ? 'var(--surface-soft)' : 'transparent' }}
              >
                <Icon size={15} style={{ color: tc.color, flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: 'var(--ink)' }}>{r.title}</p>
                  {r.subtitle && <p className="text-xs truncate" style={{ color: 'var(--ink-faint)' }}>{r.subtitle}</p>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
