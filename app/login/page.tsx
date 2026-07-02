const ERROR_MESSAGES: Record<string, string> = {
  not_admin:
    "Your Farmish account doesn't have admin access. Only Farmish admins can use this dashboard.",
  oauth_denied: "Sign-in was cancelled. Try again when you're ready.",
  oauth_failed: "Something went wrong during sign-in. Please try again.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const error = searchParams.error
    ? ERROR_MESSAGES[searchParams.error] ?? ERROR_MESSAGES.oauth_failed
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Farmish Database</h1>
        <p className="mt-2 text-sm text-gray-600">
          Sign in with your Farmish admin account to view the dashboard.
        </p>
        {error && (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <a
          href="/api/auth/login"
          className="mt-6 inline-block w-full rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
        >
          Sign in with Farmish
        </a>
      </div>
    </main>
  );
}
