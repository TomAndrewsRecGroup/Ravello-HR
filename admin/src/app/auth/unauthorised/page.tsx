import Link from 'next/link'

export default function UnauthorisedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--surface)' }}>
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <div
            className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}
          >
            <svg
              className="w-8 h-8"
              style={{ color: 'var(--danger)' }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold mb-3" style={{ color: 'var(--ink)' }}>Access Denied</h1>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
            You don&apos;t have permission to access the People Office admin panel. This area is
            restricted to People Office staff members only.
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/auth/login"
            className="btn-cta block w-full justify-center py-2.5"
          >
            Sign in with a different account
          </Link>
          <a
            href="https://thepeopleoffice.co.uk"
            className="btn-secondary block w-full text-center py-2.5"
          >
            Return to The People Office
          </a>
        </div>

        <p className="mt-8 text-xs" style={{ color: 'var(--ink-faint)' }}>
          If you believe this is an error, contact your People Office administrator.
        </p>
      </div>
    </div>
  )
}
