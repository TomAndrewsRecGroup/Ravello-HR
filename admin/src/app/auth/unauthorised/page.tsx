import Link from 'next/link'

export default function UnauthorisedPage() {
  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-red-400"
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
          <h1 className="text-2xl font-semibold text-white mb-3">Access Denied</h1>
          <p className="text-[#8b8fa8] text-sm leading-relaxed">
            You don&apos;t have permission to access the Ravello admin panel. This area is
            restricted to Ravello staff members only.
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/auth/login"
            className="block w-full py-2.5 px-4 bg-[#635bff] hover:bg-[#5147e5] text-white text-sm font-medium rounded-lg transition-colors"
          >
            Sign in with a different account
          </Link>
          <a
            href="https://ravellohr.co.uk"
            className="block w-full py-2.5 px-4 bg-[#1e2030] hover:bg-[#252840] text-[#c8cad8] text-sm font-medium rounded-lg transition-colors border border-[#2a2d3e]"
          >
            Return to Ravello
          </a>
        </div>

        <p className="mt-8 text-xs text-[#555870]">
          If you believe this is an error, contact your Ravello administrator.
        </p>
      </div>
    </div>
  )
}
