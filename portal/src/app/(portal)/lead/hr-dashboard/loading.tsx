export default function Loading() {
  return (
    <div className="portal-page flex-1 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card p-5 h-24" style={{ background: 'var(--surface)' }} />
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="card p-6 h-56" style={{ background: 'var(--surface)' }} />
        ))}
      </div>
    </div>
  );
}
