export default function Loading() {
  return (
    <div className="admin-page flex-1 animate-pulse space-y-6">
      <div>
        <div className="h-6 w-40 rounded-[8px] mb-2" style={{ background: 'var(--surface-alt)' }} />
        <div className="h-3 w-72 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(9)].map((_, i) => <div key={i} className="card h-44" />)}
      </div>
    </div>
  );
}
