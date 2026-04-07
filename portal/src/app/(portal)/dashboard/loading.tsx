export default function Loading() {
  return (
    <div className="portal-page flex-1 animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-6 w-56 rounded-[8px] mb-2" style={{ background: 'var(--surface-alt)' }} />
          <div className="h-3 w-36 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
        </div>
        <div className="h-8 w-28 rounded-[8px]" style={{ background: 'var(--surface-alt)' }} />
      </div>
      <div className="mb-6 p-5 rounded-xl h-12" style={{ background: 'var(--surface-alt)' }} />
      <div className="flex flex-wrap gap-2 mb-6">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 w-28 rounded-lg" style={{ background: 'var(--surface-alt)' }} />
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-5 mb-6">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="card p-5 h-48" style={{ background: 'var(--surface)' }} />
        ))}
      </div>
    </div>
  );
}
