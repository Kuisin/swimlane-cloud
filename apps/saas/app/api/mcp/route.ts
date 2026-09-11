import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { readDslRule, sectionNames } from "@/lib/dsl-rule-sections";

/**
 * Public, unauthenticated MCP server for the kai-swimlane DSL: an LLM
 * connects here to read the syntax spec and check a draft document before
 * writing it to a file. Not covered by middleware.ts's auth matcher (it
 * only gates /dashboard, /projects and /new) — deliberately, since this
 * route never sees or touches a user's actual repository, only whatever
 * text a tool call passes it and the bundled copy of dsl-rule.md.
 */
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
    async ({ dsl }) => {
      type Issue = { line?: number; msg: string };
      let errors: Issue[];
      let warnings: Issue[];
      try {
        const model = parseDSL(dsl) as { errors?: Issue[]; warnings?: Issue[] };
        errors = model.errors ?? [];
        warnings = model.warnings ?? [];
      } catch (err) {
        return {
          content: [{ type: "text", text: `Parser crashed: ${(err as Error).message}` }],
          isError: true,
        };
      }
      const format = (e: Issue) => (e.line ? `line ${e.line}: ${e.msg}` : e.msg);
      if (errors.length === 0 && warnings.length === 0) {
        return {
          content: [
            { type: "text", text: "No errors or warnings — this document parses cleanly." },
          ],
        };
      }
      const lines = [
        `${errors.length} error${errors.length === 1 ? "" : "s"}, ${warnings.length} warning${
          warnings.length === 1 ? "" : "s"
        }.`,
      ];
      if (errors.length) lines.push("\nErrors:", ...errors.map((e) => `- ${format(e)}`));
      if (warnings.length) lines.push("\nWarnings:", ...warnings.map((e) => `- ${format(e)}`));
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        isError: errors.length > 0,
      };
    },
  );
});

export { handler as GET, handler as POST };
