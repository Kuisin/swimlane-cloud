import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Swimlane Cloud",
  description: "Git-backed DSL diagram management SaaS.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
