const card: React.CSSProperties = {
  maxWidth: 640,
  margin: "64px auto",
  padding: "32px 40px",
  background: "#fff",
  borderRadius: 12,
  border: "1px solid #e2e8f0",
};
const code: React.CSSProperties = {
  display: "block",
  background: "#0f172a",
  color: "#e2e8f0",
  borderRadius: 8,
  padding: "12px 16px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 14,
  overflowX: "auto",
};

export default function Home() {
  return (
    <main style={card}>
      <h1>kai-swimlane DSL — MCP server</h1>
      <p>
        A public, read-only <a href="https://modelcontextprotocol.io">MCP</a> server for the{" "}
        <a href="https://github.com/Kuisin/swimlane-cloud">kai-swimlane</a> swimlane-diagram DSL.
        Point an MCP-capable client at the endpoint below and it gets two tools:
      </p>
      <ul>
        <li>
          <strong>get_dsl_syntax</strong> — the grammar spec, by section
        </li>
        <li>
          <strong>validate_dsl</strong> — parse a draft document and list every syntax error and
          warning, with line numbers
        </li>
      </ul>
      <p>
        Endpoint: this site's own origin, with <code>/api/mcp</code> appended — e.g. if this page is
        at <code>https://your-deployment.example</code>, the endpoint is:
      </p>
      <code style={code}>{"https://your-deployment.example/api/mcp"}</code>
      <p>
        No API key, no write access to anything — it only ever reads the bundled spec and parses
        whatever text it's given.
      </p>
    </main>
  );
}
