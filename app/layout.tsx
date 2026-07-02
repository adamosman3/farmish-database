import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Farmish Database",
  description: "Dashboard for Farmish data from Postgres and Amplitude",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const user = session.user;

  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        {user && (
          <header className="border-b border-gray-200 bg-white">
            <div className="container mx-auto flex items-center justify-end gap-3 px-4 py-2">
              {user.avatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-7 w-7 rounded-full"
                />
              )}
              <span className="text-sm text-gray-600">{user.email}</span>
              <a
                href="/api/auth/logout"
                className="text-sm font-medium text-green-700 hover:underline"
              >
                Sign out
              </a>
            </div>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
