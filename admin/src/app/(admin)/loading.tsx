export default function Loading() {
  return (
    <div className="admin-page flex-1 animate-pulse">
      {/* Topbar skeleton */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="h-6 w-48 rounded-[8px] mb-2" style={{ background: 'var(--surface-alt)' }} />
          <div className="h-3 w-64 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
        </div>
        <div className="h-8 w-24 rounded-[8px]" style={{ background: 'var(--surface-alt)' }} />
      </div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-5 h-24" style={{ background: 'var(--surface)' }} />
        ))}
      </div>
      {/* Content cards */}
      <div className="grid lg:grid-cols-2 gap-6">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="card p-6 h-64" style={{ background: 'var(--surface)' }} />
        ))}
      </div>
    </div>
  );
}
