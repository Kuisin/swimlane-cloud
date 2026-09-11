import { describe, expect, it } from "vitest";
import { autoSubject, buildCommitMessage } from "./commit-message";
import type { PendingChange } from "./types";

const change = (path: string, status: PendingChange["status"]): PendingChange => ({
  path,
  status,
});

describe("autoSubject", () => {
  it("names the single file for a one-file change", () => {
    expect(autoSubject([change("diagrams/a.txt", "changed")])).toBe("Update diagrams/a.txt");
    expect(autoSubject([change("diagrams/new.txt", "added")])).toBe("Add diagrams/new.txt");
    expect(autoSubject([change("diagrams/old.txt", "removed")])).toBe("Remove diagrams/old.txt");
  });

  it("counts files when every change shares one status", () => {
    expect(
      autoSubject([
        change("a.txt", "changed"),
        change("b.txt", "changed"),
        change("c.txt", "changed"),
      ]),
    ).toBe("Update 3 diagrams");
    expect(autoSubject([change("a.txt", "added"), change("b.txt", "added")])).toBe(
      "Add 2 diagrams",
    );
  });

  it("qualifies the total with added/removed counts when statuses are mixed", () => {
    expect(
      autoSubject([
        change("a.txt", "changed"),
        change("b.txt", "added"),
        change("c.txt", "removed"),
      ]),
    ).toBe("Update 3 diagrams (1 added, 1 removed)");
    expect(autoSubject([change("a.txt", "changed"), change("b.txt", "added")])).toBe(
      "Update 2 diagrams (1 added)",
    );
  });

  it("truncates a long single path to 72 characters with an ellipsis", () => {
    const longPath = `diagrams/${"a".repeat(80)}.txt`;
    const subject = autoSubject([change(longPath, "changed")]);
    expect(subject.length).toBe(72);
    expect(subject.endsWith("…")).toBe(true);
  });
});

describe("buildCommitMessage", () => {
  const changes = [change("diagrams/new.txt", "added"), change("diagrams/flow.txt", "changed")];
  const base = {
    changes,
    author: "kai",
    branch: "kai/20260905-120000/abc123",
  };

  it("uses the auto subject and lists every file when no message is given", () => {
    const msg = buildCommitMessage(base);
    const lines = msg.split("\n");
    expect(lines[0]).toBe("Update 2 diagrams (1 added)");
    expect(msg).toContain("Edited files:\n- A diagrams/new.txt\n- M diagrams/flow.txt");
    expect(msg).toContain("Edited-Files: diagrams/new.txt, diagrams/flow.txt");
    expect(msg).toContain("Edited-By: kai");
    expect(msg).toContain("Edit-Branch: kai/20260905-120000/abc123");
    expect(msg).toContain("Swimlane-Client: saas");
  });

  it("uses the user's first line as the subject and keeps the rest as the body", () => {
    const msg = buildCommitMessage({
      ...base,
      userMessage: "Fix the approval wording\n\nCustomer asked for clearer copy.",
    });
    const lines = msg.split("\n");
    expect(lines[0]).toBe("Fix the approval wording");
    expect(msg).toContain("Customer asked for clearer copy.");
    expect(msg.indexOf("Customer asked")).toBeLessThan(msg.indexOf("Edited files:"));
  });

  it("falls back to the auto subject when the message is blank", () => {
    const msg = buildCommitMessage({ ...base, userMessage: "   " });
    expect(msg.split("\n")[0]).toBe("Update 2 diagrams (1 added)");
  });

  it("trims leading and trailing blank lines from a multi-line user message", () => {
    const msg = buildCommitMessage({
      ...base,
      userMessage: "Title line\n\n\nBody line\n\n",
    });
    expect(msg).toBe(
      [
        "Title line",
        "",
        "Body line",
        "",
        "Edited files:\n- A diagrams/new.txt\n- M diagrams/flow.txt",
        "",
        "Edited-Files: diagrams/new.txt, diagrams/flow.txt",
        "Edited-By: kai",
        "Edit-Branch: kai/20260905-120000/abc123",
        "Swimlane-Client: saas",
      ].join("\n"),
    );
  });

  it("defaults the client trailer to saas and allows an override", () => {
    expect(buildCommitMessage(base)).toContain("Swimlane-Client: saas");
    expect(buildCommitMessage({ ...base, client: "hub" })).toContain("Swimlane-Client: hub");
  });
});
