import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "kai-swimlane DSL — MCP server",
  description: "A public MCP server that teaches an LLM the kai-swimlane DSL and validates it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
          margin: 0,
          color: "#1e293b",
          background: "#f8fafc",
        }}
      >
        {children}
      </body>
    </html>
  );
}
