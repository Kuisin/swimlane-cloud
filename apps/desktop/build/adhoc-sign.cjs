/**
 * Ad-hoc sign the packaged macOS app.
 *
 * Why this is necessary rather than optional:
 *
 * Electron's own binaries ship with a *linker* ad-hoc signature. electron-builder
 * then repackages the bundle — renames the executable, injects our app files —
 * which invalidates that inherited signature. With no Developer ID available it
 * skips signing entirely, so the shipped bundle carries a signature that no
 * longer describes its contents. `codesign --verify` reports
 *
 *   code has no resources but signature indicates they must be present
 *
 * and macOS refuses to launch it with **"the application is damaged and can't
 * be opened"** — which, unlike the ordinary unidentified-developer prompt,
 * cannot be dismissed by right-click → Open.
 *
 * Apple silicon makes this non-negotiable: arm64 binaries must carry a valid
 * signature to execute at all. Ad-hoc signing produces one. It does not make
 * the app *trusted* — users still see an unidentified-developer prompt until
 * the app is signed with a Developer ID and notarized — but it does make it
 * launchable.
 */
const { execFileSync } = require("node:child_process");
const { existsSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;

  // Skip when a real identity is configured — a Developer ID signature must not
  // be overwritten with an ad-hoc one.
  if (context.packager.platformSpecificBuildOptions.identity) {
    console.log("  • real signing identity configured; skipping ad-hoc signing");
    return;
  }

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = join(context.appOutDir, appName);
  if (!existsSync(appPath)) {
    throw new Error(`adhoc-sign: expected app bundle at ${appPath}`);
  }

  // Nested code must be signed before the bundle that contains it, so sign
  // frameworks and helpers first and the outer app last.
  const frameworks = join(appPath, "Contents", "Frameworks");
  const inner = existsSync(frameworks)
    ? readdirSync(frameworks)
        .filter((n) => n.endsWith(".app") || n.endsWith(".framework") || n.endsWith(".dylib"))
        .map((n) => join(frameworks, n))
    : [];

  for (const target of [...inner, appPath]) {
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", "--timestamp=none", target], {
      stdio: "pipe",
    });
  }

  // Fail the build rather than ship an unlaunchable app: this is the exact
  // check that was silently failing before.
  execFileSync("codesign", ["--verify", "--deep", "--strict", appPath], { stdio: "pipe" });
  console.log(
    `  • ad-hoc signed and verified ${appName} (${context.arch === 1 ? "x64" : "arm64"})`,
  );
};
