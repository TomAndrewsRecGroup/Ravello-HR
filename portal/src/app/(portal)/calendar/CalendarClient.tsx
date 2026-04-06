'use client';
import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, Plus, X, Loader2,
  CalendarDays, Palmtree, Thermometer, Building2, Star,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────── */
interface CalendarEvent {
  id: string;
  title: string;
  event_type: string;
  start_date: string;
  end_date: string;
  all_day: boolean;
  recurring_yearly: boolean;
  notes: string | null;
}

interface LeaveRecord {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  status: string;
  notes: string | null;
  employee_records?: { full_name: string; job_title: string } | null;
}

interface Employee {
  id: string;
  full_name: string;
  job_title: string;
}

interface Props {
  companyId: string;
  isAdmin: boolean;
  initialEvents: CalendarEvent[];
  initialLeave: LeaveRecord[];
  employees: Employee[];
}

/* ─── Helpers ───────────────────────────────────────── */
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const EVENT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  closed_day:    { bg: 'rgba(217,68,68,0.10)',  border: '#D94444', text: '#B02020' },
  bank_holiday:  { bg: 'rgba(124,58,237,0.10)', border: '#7C3AED', text: '#5A1EC0' },
  company_event: { bg: 'rgba(59,111,255,0.10)', border: '#3B6FFF', text: '#1848CC' },
  other:         { bg: 'rgba(148,163,184,0.10)', border: '#94A3B8', text: '#475569' },
};

const LEAVE_COLORS: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  annual_leave:   { bg: 'rgba(52,211,153,0.14)', text: '#047857', icon: Palmtree },
  sick_day:       { bg: 'rgba(245,158,11,0.14)', text: '#92400E', icon: Thermometer },
  bank_holiday:   { bg: 'rgba(124,58,237,0.10)', text: '#5A1EC0', icon: Star },
  unpaid:         { bg: 'rgba(148,163,184,0.10)', text: '#475569', icon: CalendarDays },
  maternity:      { bg: 'rgba(234,61,196,0.10)', text: '#9E1880', icon: CalendarDays },
  paternity:      { bg: 'rgba(59,111,255,0.10)', text: '#1848CC', icon: CalendarDays },
  compassionate:  { bg: 'rgba(148,163,184,0.10)', text: '#475569', icon: CalendarDays },
  other:          { bg: 'rgba(148,163,184,0.10)', text: '#475569', icon: CalendarDays },
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1; // Monday = 0
}

function dateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function isInRange(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

/* ─── Component ─────────────────────────────────────── */
export default function CalendarClient({ companyId, isAdmin, initialEvents, initialLeave, employees }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [leave, setLeave] = useState<LeaveRecord[]>(initialLeave);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Event form
  const [eventForm, setEventForm] = useState({
    title: '', event_type: 'closed_day', start_date: '', end_date: '',
    recurring_yearly: false, notes: '',
  });

  // Leave form
  const [leaveForm, setLeaveForm] = useState({
    employee_id: '', leave_type: 'annual_leave', start_date: '', end_date: '',
    days_count: '1', status: 'approved', notes: '',
  });

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  // Build calendar grid
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const calendarDays = useMemo(() => {
    const days: { date: string; day: number; inMonth: boolean }[] = [];
    // Previous month padding
    const prevDays = getDaysInMonth(year, month - 1);
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevDays - i;
      const m = month === 0 ? 11 : month - 1;
      const y = month === 0 ? year - 1 : year;
      days.push({ date: dateStr(y, m, d), day: d, inMonth: false });
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ date: dateStr(year, month, d), day: d, inMonth: true });
    }
    // Next month padding
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const m = month === 11 ? 0 : month + 1;
      const y = month === 11 ? year + 1 : year;
      days.push({ date: dateStr(y, m, d), day: d, inMonth: false });
    }
    return days;
  }, [year, month, daysInMonth, firstDay]);

  // Events/leave for a given date
  function getEventsForDate(date: string) {
    return events.filter(e => isInRange(date, e.start_date, e.end_date));
  }
  function getLeaveForDate(date: string) {
    return leave.filter(l => isInRange(date, l.start_date, l.end_date) && l.status !== 'rejected' && l.status !== 'cancelled');
  }

  // Items for the selected date
  const selectedEvents = selectedDate ? getEventsForDate(selectedDate) : [];
  const selectedLeave = selectedDate ? getLeaveForDate(selectedDate) : [];

  const todayStr = new Date().toISOString().split('T')[0];

  /* ─── Save handlers ─────────────────────────────── */
  async function saveEvent() {
    if (!eventForm.title || !eventForm.start_date || !eventForm.end_date) return;
    setSaving(true);
    const { data } = await supabase
      .from('company_calendar_events')
      .insert({
        company_id: companyId,
        title: eventForm.title,
        event_type: eventForm.event_type,
        start_date: eventForm.start_date,
        end_date: eventForm.end_date,
        recurring_yearly: eventForm.recurring_yearly,
        notes: eventForm.notes || null,
      })
      .select()
      .single();
    if (data) setEvents(prev => [...prev, data as CalendarEvent]);
    setSaving(false);
    setShowEventForm(false);
    setEventForm({ title: '', event_type: 'closed_day', start_date: '', end_date: '', recurring_yearly: false, notes: '' });
    router.refresh();
  }

  async function saveLeave() {
    if (!leaveForm.employee_id || !leaveForm.start_date || !leaveForm.end_date) return;
    setSaving(true);
    const { data } = await supabase
      .from('leave_records')
      .insert({
        company_id: companyId,
        employee_id: leaveForm.employee_id,
        leave_type: leaveForm.leave_type,
        start_date: leaveForm.start_date,
        end_date: leaveForm.end_date,
        days_count: parseFloat(leaveForm.days_count) || 1,
        status: leaveForm.status,
        notes: leaveForm.notes || null,
      })
      .select('*, employee_records(full_name, job_title)')
      .single();
    if (data) setLeave(prev => [...prev, data as LeaveRecord]);
    setSaving(false);
    setShowLeaveForm(false);
    setLeaveForm({ employee_id: '', leave_type: 'annual_leave', start_date: '', end_date: '', days_count: '1', status: 'approved', notes: '' });
    router.refresh();
  }

  function openEventForm(date?: string) {
    setEventForm(prev => ({
      ...prev,
      start_date: date ?? '',
      end_date: date ?? '',
    }));
    setShowEventForm(true);
  }

  function openLeaveForm(date?: string) {
    setLeaveForm(prev => ({
      ...prev,
      start_date: date ?? '',
      end_date: date ?? '',
    }));
    setShowLeaveForm(true);
  }

  return (
    <div>
      {/* Header + Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-4">
          <button onClick={prevMonth} className="btn-icon"><ChevronLeft size={18} /></button>
          <h2 className="section-title text-xl min-w-[180px] text-center">
            {MONTHS[month]} {year}
          </h2>
          <button onClick={nextMonth} className="btn-icon"><ChevronRight size={18} /></button>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button onClick={() => openEventForm(selectedDate ?? undefined)} className="btn-secondary btn-sm">
              <Plus size={13} /> Company Event
            </button>
            <button onClick={() => openLeaveForm(selectedDate ?? undefined)} className="btn-cta btn-sm">
              <Plus size={13} /> Log Leave
            </button>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: '#B02020' }}>
          <span className="w-2.5 h-2.5 rounded" style={{ background: EVENT_COLORS.closed_day.bg, border: `1px solid ${EVENT_COLORS.closed_day.border}` }} /> Closed
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: '#5A1EC0' }}>
          <span className="w-2.5 h-2.5 rounded" style={{ background: EVENT_COLORS.bank_holiday.bg, border: `1px solid ${EVENT_COLORS.bank_holiday.border}` }} /> Bank Holiday
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: '#047857' }}>
          <span className="w-2.5 h-2.5 rounded" style={{ background: LEAVE_COLORS.annual_leave.bg }} /> Annual Leave
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: '#92400E' }}>
          <span className="w-2.5 h-2.5 rounded" style={{ background: LEAVE_COLORS.sick_day.bg }} /> Sick Day
        </span>
      </div>

      {/* Calendar Grid — needs horizontal scroll on mobile */}
      <div className="card overflow-hidden overflow-x-auto">
        {/* Day headers */}
        <div className="grid grid-cols-7 min-w-[600px]">
          {DAYS.map(d => (
            <div key={d} className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)', background: 'var(--surface-soft)', borderBottom: '1px solid var(--line)' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7 min-w-[600px]">
          {calendarDays.map((cell, i) => {
            const dayEvents = getEventsForDate(cell.date);
            const dayLeave = getLeaveForDate(cell.date);
            const isToday = cell.date === todayStr;
            const isSelected = cell.date === selectedDate;
            const isWeekend = i % 7 >= 5;

            return (
              <div
                key={i}
                className="min-h-[72px] sm:min-h-[90px] p-1 sm:p-1.5 border-b border-r cursor-pointer transition-colors"
                style={{
                  borderColor: 'var(--line)',
                  background: isSelected ? 'rgba(124,58,237,0.04)' : isWeekend ? 'rgba(0,0,0,0.015)' : 'transparent',
                  opacity: cell.inMonth ? 1 : 0.35,
                }}
                onClick={() => setSelectedDate(cell.date)}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span
                    className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'text-white' : ''}`}
                    style={{
                      background: isToday ? 'var(--purple)' : 'transparent',
                      color: isToday ? '#fff' : cell.inMonth ? 'var(--ink)' : 'var(--ink-faint)',
                    }}
                  >
                    {cell.day}
                  </span>
                </div>

                {/* Event indicators */}
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 2).map(ev => {
                    const c = EVENT_COLORS[ev.event_type] ?? EVENT_COLORS.other;
                    return (
                      <div
                        key={ev.id}
                        className="text-[9px] sm:text-[10px] font-medium px-1 py-0.5 rounded truncate"
                        style={{ background: c.bg, color: c.text }}
                      >
                        {ev.title}
                      </div>
                    );
                  })}
                  {dayLeave.slice(0, 2).map(l => {
                    const c = LEAVE_COLORS[l.leave_type] ?? LEAVE_COLORS.other;
                    const name = (l.employee_records as any)?.full_name?.split(' ')[0] ?? 'Employee';
                    return (
                      <div
                        key={l.id}
                        className="text-[9px] sm:text-[10px] font-medium px-1 py-0.5 rounded truncate"
                        style={{ background: c.bg, color: c.text }}
                      >
                        {name}
                      </div>
                    );
                  })}
                  {(dayEvents.length + dayLeave.length) > 4 && (
                    <div className="text-[9px] font-medium px-1" style={{ color: 'var(--ink-faint)' }}>
                      +{dayEvents.length + dayLeave.length - 4} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Date Detail Panel */}
      {selectedDate && (
        <div className="mt-6 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-base font-semibold" style={{ color: 'var(--ink)' }}>
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </h3>
            <button onClick={() => setSelectedDate(null)} className="btn-icon"><X size={14} /></button>
          </div>

          {selectedEvents.length === 0 && selectedLeave.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No events or leave for this date.</p>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map(ev => {
                const c = EVENT_COLORS[ev.event_type] ?? EVENT_COLORS.other;
                return (
                  <div key={ev.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: c.bg, borderLeft: `3px solid ${c.border}` }}>
                    <Building2 size={14} style={{ color: c.text, flexShrink: 0 }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium" style={{ color: c.text }}>{ev.title}</p>
                      <p className="text-xs" style={{ color: c.text, opacity: 0.7 }}>
                        {ev.event_type.replace(/_/g, ' ')}
                        {ev.start_date !== ev.end_date ? ` · ${ev.start_date} — ${ev.end_date}` : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
              {selectedLeave.map(l => {
                const c = LEAVE_COLORS[l.leave_type] ?? LEAVE_COLORS.other;
                const Icon = c.icon;
                const empName = (l.employee_records as any)?.full_name ?? 'Unknown';
                return (
                  <div key={l.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: c.bg }}>
                    <Icon size={14} style={{ color: c.text, flexShrink: 0 }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium" style={{ color: c.text }}>{empName}</p>
                      <p className="text-xs" style={{ color: c.text, opacity: 0.7 }}>
                        {l.leave_type.replace(/_/g, ' ')} · {l.days_count} day{l.days_count !== 1 ? 's' : ''}
                        {' · '}{l.status}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {isAdmin && (
            <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
              <button onClick={() => openEventForm(selectedDate)} className="btn-secondary btn-sm">
                <Plus size={12} /> Event
              </button>
              <button onClick={() => openLeaveForm(selectedDate)} className="btn-cta btn-sm">
                <Plus size={12} /> Leave
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── Event Modal ──────────────────────────────── */}
      {showEventForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowEventForm(false)} />
          <div className="relative card p-6 w-full max-w-md" style={{ animation: 'fadeUp 0.2s ease' }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg" style={{ color: 'var(--ink)' }}>Add Company Event</h3>
              <button onClick={() => setShowEventForm(false)} className="btn-icon"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div className="form-group">
                <label className="label">Title *</label>
                <input className="input" value={eventForm.title} onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Christmas Closure" />
              </div>
              <div className="form-group">
                <label className="label">Type</label>
                <select className="input" value={eventForm.event_type} onChange={e => setEventForm(f => ({ ...f, event_type: e.target.value }))}>
                  <option value="closed_day">Closed Day</option>
                  <option value="bank_holiday">Bank Holiday</option>
                  <option value="company_event">Company Event</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="label">Start Date *</label>
                  <input className="input" type="date" value={eventForm.start_date} onChange={e => setEventForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="label">End Date *</label>
                  <input className="input" type="date" value={eventForm.end_date} onChange={e => setEventForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={eventForm.recurring_yearly} onChange={e => setEventForm(f => ({ ...f, recurring_yearly: e.target.checked }))} className="w-4 h-4 rounded" />
                <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>Recurring yearly</span>
              </label>
              <div className="form-group">
                <label className="label">Notes</label>
                <textarea className="input" rows={2} value={eventForm.notes} onChange={e => setEventForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowEventForm(false)} className="btn-secondary btn-sm">Cancel</button>
              <button onClick={saveEvent} disabled={saving || !eventForm.title || !eventForm.start_date || !eventForm.end_date} className="btn-cta btn-sm">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Save Event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Leave Modal ──────────────────────────────── */}
      {showLeaveForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowLeaveForm(false)} />
          <div className="relative card p-6 w-full max-w-md" style={{ animation: 'fadeUp 0.2s ease' }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg" style={{ color: 'var(--ink)' }}>Log Employee Leave</h3>
              <button onClick={() => setShowLeaveForm(false)} className="btn-icon"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div className="form-group">
                <label className="label">Employee *</label>
                <select className="input" value={leaveForm.employee_id} onChange={e => setLeaveForm(f => ({ ...f, employee_id: e.target.value }))}>
                  <option value="">Select employee...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.full_name} — {emp.job_title}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Leave Type</label>
                <select className="input" value={leaveForm.leave_type} onChange={e => setLeaveForm(f => ({ ...f, leave_type: e.target.value }))}>
                  <option value="annual_leave">Annual Leave</option>
                  <option value="sick_day">Sick Day</option>
                  <option value="unpaid">Unpaid Leave</option>
                  <option value="maternity">Maternity</option>
                  <option value="paternity">Paternity</option>
                  <option value="compassionate">Compassionate</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="label">Start Date *</label>
                  <input className="input" type="date" value={leaveForm.start_date} onChange={e => setLeaveForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="label">End Date *</label>
                  <input className="input" type="date" value={leaveForm.end_date} onChange={e => setLeaveForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="label">Days Count (supports half days, e.g. 0.5)</label>
                <input className="input" type="number" step="0.5" min="0.5" value={leaveForm.days_count} onChange={e => setLeaveForm(f => ({ ...f, days_count: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="label">Status</label>
                <select className="input" value={leaveForm.status} onChange={e => setLeaveForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Notes</label>
                <textarea className="input" rows={2} value={leaveForm.notes} onChange={e => setLeaveForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowLeaveForm(false)} className="btn-secondary btn-sm">Cancel</button>
              <button onClick={saveLeave} disabled={saving || !leaveForm.employee_id || !leaveForm.start_date || !leaveForm.end_date} className="btn-cta btn-sm">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Log Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
