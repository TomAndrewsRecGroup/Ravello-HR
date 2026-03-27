export default function Loading() {
  return (
    <div className="admin-page flex-1 animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-6 w-40 rounded-[8px] mb-2" style={{ background: 'var(--surface-alt)' }} />
          <div className="h-3 w-52 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
        </div>
        <div className="flex gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-8 w-24 rounded-[8px]" style={{ background: 'var(--surface-alt)' }} />
          ))}
        </div>
      </div>
      <div className="card">
        <div className="p-4 border-b flex gap-3" style={{ borderColor: 'var(--line)' }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-8 w-28 rounded-[8px]" style={{ background: 'var(--surface-alt)' }} />
          ))}
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b" style={{ borderColor: 'var(--line)' }}>
            <div className="h-4 w-40 rounded" style={{ background: 'var(--surface-alt)' }} />
            <div className="h-4 w-28 rounded" style={{ background: 'var(--surface-alt)' }} />
            <div className="h-4 w-20 rounded ml-auto" style={{ background: 'var(--surface-alt)' }} />
            <div className="h-5 w-16 rounded-full" style={{ background: 'var(--surface-alt)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
