export default function Loading() {
  return (
    <div className="portal-page flex-1 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-4 h-20" style={{ background: 'var(--surface)' }} />
        ))}
      </div>
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card p-4 h-16" style={{ background: 'var(--surface)' }} />
        ))}
      </div>
    </div>
  );
}
