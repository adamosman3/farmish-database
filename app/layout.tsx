import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Farmish Database",
  description: "Dashboard for Farmish data from Postgres and Amplitude",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  );
}
