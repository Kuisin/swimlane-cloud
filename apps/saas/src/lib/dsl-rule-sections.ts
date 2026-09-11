import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `dsl-rule.md` split on its top-level `## ` headings, so a tool call can
 * fetch one section instead of the whole ~1,100-line spec. Read fresh every
 * call rather than cached at module scope — cheap, and it means a redeploy
 * is the only staleness window, not a warm serverless instance too.
 */
export function readDslRule(): { name: string; body: string }[] {
  const text = readFileSync(join(process.cwd(), "content/dsl-rule.md"), "utf8");
  const lines = text.split("\n");
  const sections: { name: string; body: string }[] = [];
  let name = "Preamble";
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^## (.+)$/.exec(lines[i]);
    if (!m) continue;
    sections.push({ name, body: lines.slice(start, i).join("\n").trim() });
    name = m[1].trim();
    start = i;
  }
  sections.push({ name, body: lines.slice(start).join("\n").trim() });
  return sections;
}

export function sectionNames(sections: { name: string }[]): string[] {
  return sections.filter((s) => s.name !== "Preamble").map((s) => s.name);
}
