import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { readDslRule, sectionNames } from "@/lib/dsl-rule-sections";
import {
  DEFAULT_MAX_SVG_BYTES,
  THEME_KEYS,
  exampleCatalogue,
  formatReport,
  migrateReport,
  readExample,
  readExampleIndex,
  renderReport,
  validateReport,
  type ToolReport,
} from "@/lib/dsl-mcp";

/**
 * Public, unauthenticated MCP server for the kai-swimlane DSL: an LLM
 * connects here to read the syntax spec, read a worked example, check a draft
 * document, see the picture it draws, canonicalise it, and bring an old
 * document across to the current grammar. Not covered by middleware.ts's auth
 * matcher (it only gates /dashboard, /projects and /new) — deliberately,
 * since every tool here is a pure function of the text it is handed plus the
 * bundled copies of dsl-rule.md and the example diagrams. No tool reads a
 * secret, opens a connection, or touches a user's repository.
 *
 * Tool bodies live in src/lib/dsl-mcp.ts so they can be unit-tested; this
 * file is registration, descriptions and the MCP content envelope.
 */
function envelope(report: ToolReport) {
  const content = [{ type: "text" as const, text: report.summary }];
  if (report.payload) content.push({ type: "text" as const, text: report.payload });
  return report.isError ? { content, isError: true } : { content };
}

const handler = createMcpHandler((server) => {
  server.registerTool(
    "get_dsl_syntax",
    {
      title: "Get kai-swimlane DSL syntax",
      description:
        "Read the kai-swimlane DSL grammar spec. Call with no arguments first — it returns the " +
        "list of section names plus the two sections almost every document needs (the design " +
        "invariants and a full worked example). Call again with `section` set to one of the " +
        "returned names to read that section in full.",
      inputSchema: z.object({
        section: z
          .string()
          .optional()
          .describe(
            "One of the section names from a prior call with no arguments. Omit to get the " +
              "table of contents plus the invariants and example sections.",
          ),
      }),
    },
    async ({ section }) => {
      const sections = readDslRule();
      if (!section) {
        const toc = sectionNames(sections);
        const starter = sections.filter(
          (s) => s.name === "Design invariants" || s.name === "Example",
        );
        const text = [
          `# kai-swimlane DSL — sections\n\n${toc.map((n) => `- ${n}`).join("\n")}`,
          `Call again with \`section\` set to one of the names above for the full text of that ` +
            `section. Shown in full below since almost every document needs them:`,
          ...starter.map((s) => s.body),
        ].join("\n\n---\n\n");
        return { content: [{ type: "text", text }] };
      }
      const match = sections.find((s) => s.name.toLowerCase() === section.toLowerCase());
      if (!match) {
        const toc = sectionNames(sections);
        return {
          content: [
            {
              type: "text",
              text:
                `No section named "${section}". Available sections:\n` +
                toc.map((n) => `- ${n}`).join("\n"),
            },
          ],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: match.body }] };
    },
  );

  server.registerTool(
    "get_dsl_example",
    {
      title: "Get a worked kai-swimlane document",
      description:
        "Read a complete, real kai-swimlane document that is known to parse cleanly. Call with " +
        "no arguments for the catalogue — each example's title, what it is, and which " +
        "constructs it demonstrates — then again with `name` for its full text. Reach for this " +
        "before writing a document from scratch, and whenever the spec leaves you guessing at " +
        "house style: the grammar says what is legal, an example shows the section order, the " +
        "two-language `ja | en` captions, the indentation, and where ids, remarks and " +
        "descriptions actually go.",
      inputSchema: z.object({
        name: z
          .string()
          .optional()
          .describe(
            "One of the example names from a prior call with no arguments. Omit for the " +
              "catalogue.",
          ),
      }),
    },
    async ({ name }) => {
      const index = readExampleIndex();
      if (!name) return { content: [{ type: "text", text: exampleCatalogue(index) }] };
      const found = readExample(name);
      if (!found) {
        return {
          content: [
            {
              type: "text",
              text:
                `No example named "${name}". Available examples:\n` +
                index.map((e) => `- ${e.name}`).join("\n"),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `# ${found.meta.name} — ${found.meta.title}\n${found.meta.summary}`,
          },
          { type: "text", text: found.text },
        ],
      };
    },
  );

  server.registerTool(
    "validate_dsl",
    {
      title: "Validate kai-swimlane DSL",
      description:
        "Parse a kai-swimlane DSL document and report every syntax error and warning, with " +
        "line numbers. Call this on a draft before presenting or saving it — a document with " +
        "any error does not render. A warning does not block rendering.",
      inputSchema: z.object({
        dsl: z.string().describe("The full document text, including the @kai-swimlane header."),
      }),
    },
    async ({ dsl }) => envelope(validateReport(dsl)),
  );

  server.registerTool(
    "render_dsl",
    {
      title: "Render kai-swimlane DSL to SVG",
      description:
        "Draw the diagram and return the SVG, preceded by its pixel size and byte count. " +
        "`validate_dsl` says the text is legal; this says the picture is sane — that the lanes " +
        "are the ones you meant, the branches land where you expect, and nothing has grown " +
        "absurdly wide. Reach for it once a draft validates, especially for anything with a " +
        "fork, a nested if, or a `[goto:]`, and whenever your client can actually look at an " +
        "image. The SVG is returned whole or not at all (a truncated one will not display): " +
        `past \`maxBytes\` (default ${DEFAULT_MAX_SVG_BYTES}, roughly a large real diagram) ` +
        "only the size and diagnostics come back, with the number to pass to get the markup.",
      inputSchema: z.object({
        dsl: z.string().describe("The full document text, including the @kai-swimlane header."),
        theme: z
          .enum(THEME_KEYS)
          .optional()
          .describe("Colour theme. Defaults to `basic`, which is what the app renders with."),
        maxBytes: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            `Largest SVG to return inline. Defaults to ${DEFAULT_MAX_SVG_BYTES}; raise it only ` +
              "when a previous call reported the document is bigger than that.",
          ),
      }),
    },
    async ({ dsl, theme, maxBytes }) => envelope(renderReport(dsl, { theme, maxBytes })),
  );

  server.registerTool(
    "format_dsl",
    {
      title: "Format kai-swimlane DSL canonically",
      description:
        "Re-serialise a document into exactly the layout the app itself writes — the same " +
        "indentation, property order and spacing the editor produces when a human saves. Call " +
        "it as the last step before you hand a document over, so your output does not show up " +
        "as a diff the moment someone opens it in the editor. It doubles as a round-trip " +
        "check: anything the reader silently dropped will be missing from the text that comes " +
        "back. A document with parse errors is returned unformatted, with the errors — " +
        "reformatting text the reader cannot understand would lose content.",
      inputSchema: z.object({
        dsl: z.string().describe("The full document text, including the @kai-swimlane header."),
      }),
    },
    async ({ dsl }) => envelope(formatReport(dsl)),
  );

  server.registerTool(
    "migrate_dsl",
    {
      title: "Migrate legacy kai-swimlane DSL",
      description:
        "Rewrite a document written in an earlier spelling of the grammar into the current " +
        "one, and validate the result. There is one reader and no compatibility layer, so an " +
        "old file fails on its first old construct: reach for this whenever you are handed a " +
        "document you did not write and `validate_dsl` complains about syntax that looks " +
        "plausible — `@kai-swimlane-v2` headers, a bare `else`, `endif`/`endfork`, a `case` " +
        "line under an `if`, a fork's `and`, `[loop]`, `merge:`/`[merge]`, `section-start`, " +
        "an opener's lane selector (`if [sales] (q)`), `***` comments, or " +
        "`props:`/`arrow:`/`link:` property lines. A few constructs have no " +
        "automatic mapping and are deliberately left alone for you to fix by hand; the " +
        "validation in the reply names them.",
      inputSchema: z.object({
        dsl: z.string().describe("The full document text, in whatever grammar it was written."),
      }),
    },
    async ({ dsl }) => envelope(migrateReport(dsl)),
  );
});

export { handler as GET, handler as POST };
