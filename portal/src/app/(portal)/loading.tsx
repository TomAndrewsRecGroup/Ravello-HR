export default function Loading() {
  return (
    <div className="portal-page flex-1 animate-pulse">
      <div className="mb-8">
        <div className="h-7 w-48 rounded-[8px] mb-2" style={{ background: 'var(--surface-alt)' }} />
        <div className="h-3 w-64 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-5 h-24" />
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="card p-6 h-56" />
        ))}
      </div>
    </div>
  );
}
