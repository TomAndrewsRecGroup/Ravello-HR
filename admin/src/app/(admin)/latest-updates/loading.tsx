export default function Loading() {
  return (
    <div className="admin-page flex-1 animate-pulse space-y-6">
      <div>
        <div className="h-6 w-48 rounded-[8px] mb-2" style={{ background: 'var(--surface-alt)' }} />
        <div className="h-3 w-80 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
      </div>
      <div className="card p-5 h-32" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card p-4 h-44" />
        ))}
      </div>
    </div>
  );
}
