export default function Loading() {
  return (
    <div className="portal-page flex-1 animate-pulse">
      <div className="flex items-center justify-between mb-5">
        <div className="h-5 w-44 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
        <div className="h-8 w-28 rounded-[8px]" style={{ background: 'var(--surface-alt)' }} />
      </div>
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="card p-4 h-16" style={{ background: 'var(--surface)' }} />
        ))}
      </div>
    </div>
  );
}
