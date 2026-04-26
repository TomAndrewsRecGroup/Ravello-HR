export default function Loading() {
  return (
    <div className="admin-page flex-1 animate-pulse space-y-8">
      <div>
        <div className="h-6 w-56 rounded-[8px] mb-2" style={{ background: 'var(--surface-alt)' }} />
        <div className="h-3 w-72 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
      </div>
      <section className="space-y-4">
        <div className="h-4 w-40 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="card p-4 h-32" />)}
        </div>
      </section>
      <section className="space-y-4">
        <div className="h-4 w-40 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
        <div className="card divide-y" style={{ borderColor: 'var(--line)' }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-full" style={{ background: 'var(--surface-alt)' }} />
              <div className="h-3 w-48 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
              <div className="ml-auto h-3 w-20 rounded-[6px]" style={{ background: 'var(--surface-alt)' }} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
