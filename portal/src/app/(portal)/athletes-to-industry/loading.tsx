export default function Loading() {
  return (
    <div className="portal-page flex-1 animate-pulse">
      <div className="mb-8">
        <div className="h-7 w-56 rounded-[8px] mb-2" style={{ background: 'var(--surface-alt)' }} />
        <div className="h-3 w-72 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        {[...Array(2)].map((_, panel) => (
          <div key={panel} className="card p-6 space-y-4">
            <div className="h-4 w-32 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
            <div className="grid sm:grid-cols-2 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-[8px] h-24" style={{ background: 'var(--surface-alt)' }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
