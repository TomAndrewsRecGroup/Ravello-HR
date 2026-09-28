// A plain GET form: filters live in the URL, so a filtered list can be
// bookmarked, shared and printed, and works without JavaScript.
export interface FilterField {
  name: string;
  label: string;
  type?: 'select' | 'date' | 'search' | 'checkbox';
  options?: { value: string; label: string }[];
  value?: string;
}
export default function FilterForm({ fields, action }: { fields: FilterField[]; action?: string }) {
  return (
    <form method="get" action={action} className="card p-3 flex flex-wrap items-end gap-3">
      {fields.map(f => (
        <label key={f.name} className="block min-w-[140px] flex-1 sm:flex-none">
          <span className="label">{f.label}</span>
          {f.type === 'date' ? (
            <input className="input" type="date" name={f.name} defaultValue={f.value ?? ''} />
          ) : f.type === 'search' ? (
            <input className="input" type="search" name={f.name} defaultValue={f.value ?? ''} maxLength={100} placeholder="Reference or title" />
          ) : f.type === 'checkbox' ? (
            <span className="flex items-center gap-2 h-[38px]">
              <input type="checkbox" name={f.name} value="1" defaultChecked={f.value === '1'} />
              <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>Yes</span>
            </span>
          ) : (
            <select className="input" name={f.name} defaultValue={f.value ?? ''}>
              <option value="">All</option>
              {(f.options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
        </label>
      ))}
      <div className="flex gap-2">
        <button className="btn-secondary btn-sm" type="submit">Apply</button>
        <a className="btn-ghost btn-sm" href={action ?? '?'}>Clear</a>
      </div>
    </form>
  );
}
