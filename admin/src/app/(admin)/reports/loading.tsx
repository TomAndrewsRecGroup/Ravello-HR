export default function Loading() {
  return (
    <div className="admin-page flex-1 animate-pulse">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="h-6 w-36 rounded-[8px] mb-2" style={{ background: 'var(--surface-alt)' }} />
          <div className="h-3 w-48 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-6 h-32" style={{ background: 'var(--surface)' }} />
        ))}
      </div>
    </div>
  );
}
