export default function Loading() {
  return (
    <div className="admin-page flex-1 animate-pulse">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="h-6 w-44 rounded-[8px] mb-2" style={{ background: 'var(--surface-alt)' }} />
          <div className="h-3 w-56 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
        </div>
      </div>
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card p-4 h-20" style={{ background: 'var(--surface)' }} />
        ))}
      </div>
    </div>
  );
}
