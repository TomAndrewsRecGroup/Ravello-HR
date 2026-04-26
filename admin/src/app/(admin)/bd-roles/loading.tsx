export default function Loading() {
  return (
    <div className="admin-page flex-1 animate-pulse">
      <div className="mb-8">
        <div className="h-6 w-48 rounded-[8px] mb-2" style={{ background: 'var(--surface-alt)' }} />
        <div className="h-3 w-72 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
      </div>
      <div className="card overflow-hidden">
        {[...Array(10)].map((_, row) => (
          <div key={row} className="grid grid-cols-[1fr_180px_120px_100px] gap-3 px-4 py-3.5 border-b" style={{ borderColor: 'var(--line)' }}>
            {[...Array(4)].map((_, col) => (
              <div key={col} className="h-3 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
