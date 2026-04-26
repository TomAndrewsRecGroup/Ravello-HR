export default function Loading() {
  return (
    <div className="admin-page flex-1 animate-pulse">
      <div className="mb-8">
        <div className="h-6 w-56 rounded-[8px] mb-2" style={{ background: 'var(--surface-alt)' }} />
        <div className="h-3 w-72 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
      </div>
      <div className="card overflow-hidden">
        <div className="border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="grid grid-cols-[1fr_140px_140px_120px_120px] gap-3 px-4 py-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-3 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
            ))}
          </div>
        </div>
        {[...Array(8)].map((_, row) => (
          <div key={row} className="grid grid-cols-[1fr_140px_140px_120px_120px] gap-3 px-4 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
            {[...Array(5)].map((_, col) => (
              <div key={col} className="h-3 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
