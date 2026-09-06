import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Swimlane Cloud",
  description: "Git-backed DSL diagram management SaaS.",
};

// Without this, mobile browsers render at a virtual desktop width (~980px)
// and scale the whole page down to fit — every responsive class in the app
// (flex-wrap, overflow-x-auto, sm: breakpoints) is neutralized by that, since
// the browser never thinks it's on a narrow screen in the first place.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600&family=Noto+Sans:ital,wght@0,400;0,500;0,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="min-h-full antialiased"
        style={{ fontFamily: '"Noto Sans JP", "Noto Sans", system-ui, sans-serif' }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
