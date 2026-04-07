export default function Loading() {
  return (
    <div className="admin-page flex-1 animate-pulse">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="h-6 w-32 rounded-[8px] mb-2" style={{ background: 'var(--surface-alt)' }} />
          <div className="h-3 w-48 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
        </div>
        <div className="h-8 w-28 rounded-[8px]" style={{ background: 'var(--surface-alt)' }} />
      </div>
      <div className="table-wrapper">
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-12 rounded-[8px]" style={{ background: 'var(--surface-alt)' }} />
          ))}
        </div>
      </div>
    </div>
  );
}
