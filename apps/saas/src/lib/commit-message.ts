/**
 * Turns a checkpoint's pending changes into a commit message a non-technical
 * user never has to write by hand: an auto subject when they leave the
 * message blank, and a body that always lists exactly what changed — this is
 * the "metadata such as list of edited files" the flow calls for, expressed
 * as plain commit text so it shows up on GitHub with no app in the loop.
 */
import type { PendingChange } from "./types";

const SUBJECT_MAX = 72;

function truncateSubject(s: string, max = SUBJECT_MAX): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

function verbFor(status: PendingChange["status"]): string {
  return status === "added" ? "Add" : status === "removed" ? "Remove" : "Update";
}

/** e.g. "Update 3 diagrams", "Add diagrams/new.txt", "Update 3 diagrams (1 added, 1 removed)". */
export function autoSubject(changes: PendingChange[]): string {
  if (changes.length === 0) return "Update diagrams";
  if (changes.length === 1) {
    const [only] = changes;
    return truncateSubject(`${verbFor(only!.status)} ${only!.path}`);
  }

  const counts = { added: 0, changed: 0, removed: 0 };
  for (const c of changes) counts[c.status]++;
  const total = changes.length;
  const present = (Object.keys(counts) as (keyof typeof counts)[]).filter((k) => counts[k] > 0);

  if (present.length === 1) {
    return truncateSubject(`${verbFor(present[0]!)} ${total} diagrams`);
  }

  const qualifiers: string[] = [];
  if (counts.added > 0) qualifiers.push(`${counts.added} added`);
  if (counts.removed > 0) qualifiers.push(`${counts.removed} removed`);
  const suffix = qualifiers.length ? ` (${qualifiers.join(", ")})` : "";
  return truncateSubject(`Update ${total} diagrams${suffix}`);
}

function fileMark(status: PendingChange["status"]): string {
  return status === "added" ? "A" : status === "removed" ? "D" : "M";
}

export interface BuildCommitMessageOptions {
  /** What the user typed at push time; only its first line becomes the subject. */
  userMessage?: string;
  changes: PendingChange[];
  /** GitHub login, used for the Edited-By trailer (the commit author is set separately). */
  author: string;
  branch: string;
  /** Which client made the commit. Defaults to "saas". */
  client?: string;
}

/**
 * Subject line (user's first line, else `autoSubject`), the rest of the
 * user's message as the body, a plain-language file list, and machine
 * trailers a future tool could parse without re-diffing the commit.
 */
export function buildCommitMessage(opts: BuildCommitMessageOptions): string {
  const trimmedUser = opts.userMessage?.trim();
  const userLines = trimmedUser ? trimmedUser.split(/\r?\n/) : [];
  const subject = truncateSubject(userLines[0]?.trim() || autoSubject(opts.changes));

  const restLines = userLines.slice(1);
  while (restLines.length && restLines[0]!.trim() === "") restLines.shift();
  while (restLines.length && restLines[restLines.length - 1]!.trim() === "") restLines.pop();

  const fileLines = opts.changes.map((c) => `- ${fileMark(c.status)} ${c.path}`);

  const sections: string[] = [subject];
  if (restLines.length > 0) sections.push(restLines.join("\n"));
  sections.push(["Edited files:", ...fileLines].join("\n"));
  sections.push(
    [
      `Edited-Files: ${opts.changes.map((c) => c.path).join(", ")}`,
      `Edited-By: ${opts.author}`,
      `Edit-Branch: ${opts.branch}`,
      `Swimlane-Client: ${opts.client ?? "saas"}`,
    ].join("\n"),
  );

  return sections.join("\n\n");
}
