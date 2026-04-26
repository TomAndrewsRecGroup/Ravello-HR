export default function Loading() {
  return (
    <div className="admin-page flex-1 animate-pulse">
      <div className="mb-8">
        <div className="h-6 w-56 rounded-[8px] mb-2" style={{ background: 'var(--surface-alt)' }} />
        <div className="h-3 w-72 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
      </div>
      <div className="grid lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, col) => (
          <div key={col} className="card p-4 space-y-3 min-h-[400px]">
            <div className="h-4 w-24 rounded-[6px] mb-2" style={{ background: 'var(--surface-alt)' }} />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 rounded-[8px]" style={{ background: 'var(--surface-alt)' }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
