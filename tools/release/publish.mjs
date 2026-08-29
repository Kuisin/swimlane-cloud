/**
 * Publishes one version to the public downloads repo.
 *
 *   node tools/release/publish.mjs --version 0.1.0 --assets <dir> [--dry-run]
 *
 * The source repository is private, and **release assets from a private repo
 * always require authentication** — so a download link from it would 404 for
 * everyone. Everything public therefore lives in a separate repo that contains
 * nothing but the generated site and the release assets. No source is copied.
 *
 * Order matters: the release is created first, because the site's download URLs
 * are the asset URLs GitHub hands back.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyAsset, upsertRelease } from "./manifest.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const dryRun = args.includes("--dry-run");

const version = opt("version");
const assetsDir = opt("assets");
const repo = opt("repo", "Kuisin/swimlane-downloads");
const workDir = opt("work", "/tmp/swimlane-downloads");
const notes = opt("notes", "");

if (!version || !assetsDir) {
  console.error("usage: publish.mjs --version <x.y.z> --assets <dir> [--repo owner/name] [--dry-run]");
  process.exit(1);
}

const sh = (cmd, cmdArgs, cwd) => {
  if (dryRun) {
    console.log(`  [dry-run] ${cmd} ${cmdArgs.join(" ")}`);
    return "";
  }
  return execFileSync(cmd, cmdArgs, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
};

const tag = `v${version}`;
const files = readdirSync(assetsDir)
  .filter((f) => classifyAsset(f))
  .map((f) => join(assetsDir, f));

if (files.length === 0) {
  console.error(`No recognised artifacts in ${assetsDir}`);
  process.exit(1);
}
console.log(`Publishing ${tag} to ${repo}:`);
for (const f of files) console.log(`  ${f.split("/").pop()}  ${(statSync(f).size / 1048576).toFixed(1)} MB`);

/**
 * 0. The repo must have a commit before anything can be tagged: GitHub rejects
 *    a release on an empty repository with "Repository is empty". So bootstrap
 *    it, then create the release, then regenerate the site from the asset URLs
 *    GitHub hands back.
 */
function ensureCheckout() {
  if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });

  // Do NOT pre-create the directory: `gh repo clone` refuses an existing
  // destination, and falling through to `git init` would build unrelated
  // history whose push is then rejected as a non-fast-forward.
  // Plain git over HTTPS rather than `gh repo clone`: gh honours the user's
  // configured git protocol, and on a machine set to SSH that fails with
  // "Host key verification failed" in any non-interactive context (CI included).
  // HTTPS needs no host key, and gh's credential helper still supplies auth.
  let cloned = false;
  try {
    execFileSync("git", ["clone", "--depth", "1", `https://github.com/${repo}.git`, workDir], {
      stdio: "pipe",
    });
    cloned = existsSync(join(workDir, ".git"));
  } catch (err) {
    // An empty repository cannot be cloned with a branch; anything else is a
    // real failure and must not be papered over.
    const text = String(err.stderr ?? err.stdout ?? err.message);
    if (!/empty repository|warning: You appear to have cloned an empty/i.test(text)) {
      throw new Error(`Could not clone ${repo}: ${text.trim()}`);
    }
  }

  if (!cloned) {
    mkdirSync(workDir, { recursive: true });
    execFileSync("git", ["init", "-q", "-b", "main", workDir]);
    execFileSync("git", ["remote", "add", "origin", `https://github.com/${repo}.git`], { cwd: workDir });
  }

  const hasCommits = (() => {
    try {
      execFileSync("git", ["rev-parse", "HEAD"], { cwd: workDir, stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();

  if (!hasCommits) {
    // A tag needs a commit to point at; GitHub rejects a release on an empty
    // repository with "Repository is empty".
    writeFileSync(join(workDir, "index.html"), "<!DOCTYPE html><title>Swimlane downloads</title><p>Publishing…");
    writeFileSync(join(workDir, ".nojekyll"), "");
    execFileSync("git", ["add", "-A"], { cwd: workDir });
    execFileSync("git", [
      "-c", "user.name=swimlane-release", "-c", "user.email=release@swimlane.local",
      "commit", "-qm", "Initialise downloads site",
    ], { cwd: workDir });
    execFileSync("git", ["push", "-q", "-u", "origin", "main"], { cwd: workDir });
    console.log("Bootstrapped an empty downloads repo.");
  }
}

if (!dryRun) ensureCheckout();

// 1. Release — its asset URLs are what the site links to.
const exists = (() => {
  try {
    execFileSync("gh", ["release", "view", tag, "--repo", repo], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

if (exists) {
  console.log(`\nRelease ${tag} exists; replacing its assets.`);
  sh("gh", ["release", "upload", tag, ...files, "--repo", repo, "--clobber"]);
} else {
  console.log(`\nCreating release ${tag}.`);
  sh("gh", [
    "release", "create", tag, ...files,
    "--repo", repo,
    "--title", `Swimlane ${version}`,
    "--notes", notes || `Swimlane ${version}`,
  ]);
}

// 2. Ask GitHub for the canonical asset URLs rather than constructing them.
const released = dryRun
  ? { assets: files.map((f) => ({ name: f.split("/").pop(), size: statSync(f).size, url: `https://example/${f.split("/").pop()}` })), publishedAt: new Date().toISOString() }
  : JSON.parse(execFileSync("gh", ["release", "view", tag, "--repo", repo, "--json", "assets,publishedAt"], { encoding: "utf8" }));

const assets = {};
for (const a of released.assets) {
  const key = classifyAsset(a.name);
  if (!key) continue;
  assets[key] = { name: a.name, size: a.size, url: a.url ?? `https://github.com/${repo}/releases/download/${tag}/${a.name}` };
}

// 3. Merge into the manifest held in the downloads repo.
if (dryRun) {
  if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
}

const manifestPath = join(workDir, "versions.json");
const current = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { versions: [] };
const merged = upsertRelease(current, {
  version,
  date: released.publishedAt ?? new Date().toISOString(),
  notes,
  assets,
});
writeFileSync(manifestPath, JSON.stringify(merged, null, 2));

// 4. Regenerate the whole site from the manifest.
// fileURLToPath, not .pathname: this checkout lives under a path with
// spaces and parentheses, and .pathname would hand node a %20-encoded path.
const buildSite = fileURLToPath(new URL("./build-site.mjs", import.meta.url));
execFileSync("node", [buildSite, manifestPath, workDir, "--repo", repo], {
  stdio: "inherit",
});

if (dryRun) {
  console.log(`\n[dry-run] site generated in ${workDir}; nothing pushed.`);
  process.exit(0);
}

sh("git", ["add", "-A"], workDir);
try {
  sh("git", ["-c", "user.name=swimlane-release", "-c", "user.email=release@swimlane.local", "commit", "-m", `Publish ${tag}`], workDir);
} catch {
  console.log("Nothing changed in the site.");
}
sh("git", ["push", "-u", "origin", "main"], workDir);

console.log(`\nPublished. https://kuisin.github.io/${repo.split("/")[1]}/`);
