import { describe, expect, it } from "vitest";
import { httpsRemoteUrl, parseRemoteUrl } from "./remote-url.ts";

describe("parseRemoteUrl", () => {
  it("parses the three forms git itself writes", () => {
    for (const url of [
      "https://github.com/Kuisin/swimlane-cloud.git",
      "git@github.com:Kuisin/swimlane-cloud.git",
      "ssh://git@github.com/Kuisin/swimlane-cloud.git",
    ]) {
      expect(parseRemoteUrl(url)).toMatchObject({ owner: "Kuisin", repo: "swimlane-cloud" });
    }
  });

  it("strips the .git suffix but keeps dots inside the name", () => {
    expect(parseRemoteUrl("https://github.com/o/my.repo.git")?.repo).toBe("my.repo");
    expect(parseRemoteUrl("https://github.com/o/my.repo")?.repo).toBe("my.repo");
  });

  it("accepts a browser URL a user would paste, extra path and all", () => {
    expect(parseRemoteUrl("https://github.com/facebook/react/tree/main/packages")).toMatchObject({
      owner: "facebook",
      repo: "react",
    });
  });

  it("accepts a bare owner/repo", () => {
    expect(parseRemoteUrl("facebook/react")).toMatchObject({ owner: "facebook", repo: "react" });
  });

  it("returns null for non-GitHub remotes rather than throwing", () => {
    // Probing a remote that legitimately points elsewhere is not an error.
    expect(parseRemoteUrl("https://gitlab.com/o/r.git")).toBeNull();
    expect(parseRemoteUrl("git@bitbucket.org:o/r.git")).toBeNull();
    expect(parseRemoteUrl("https://github.evil.com/o/r")).toBeNull();
  });

  it("returns null for junk", () => {
    expect(parseRemoteUrl("")).toBeNull();
    expect(parseRemoteUrl("   ")).toBeNull();
    expect(parseRemoteUrl("https://github.com/onlyowner")).toBeNull();
  });

  it("round-trips through httpsRemoteUrl", () => {
    const ref = parseRemoteUrl("git@github.com:o/r.git")!;
    expect(parseRemoteUrl(httpsRemoteUrl(ref))).toMatchObject({ owner: "o", repo: "r" });
  });
});
