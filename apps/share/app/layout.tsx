import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Swimlane Share",
  description: "View shared swimlane diagrams.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&family=Noto+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="min-h-full antialiased"
        style={{ fontFamily: '"Noto Sans JP", "Noto Sans", system-ui, sans-serif' }}
      >
        {children}
      </body>
    </html>
  );
}
