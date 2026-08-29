/**
 * Generates the static download site.
 *
 *   node tools/release/build-site.mjs <versions.json> <outDir> [--repo owner/name]
 *
 * Output:
 *   index.html            latest, with the visitor's platform surfaced first
 *   v/<version>/index.html  a permanent page per release
 *   versions.json         the manifest, for scripts
 *   latest/<platform>/index.html  stable redirect, for links that must not
 *                                 change when a new version ships
 *
 * Everything is static because GitHub Pages has no server side: the "redirect"
 * pages are meta-refresh documents regenerated on every release.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { formatBytes, PLATFORMS } from "./manifest.mjs";

const [, , manifestPath, outDir, ...rest] = process.argv;
if (!manifestPath || !outDir) {
  console.error("usage: build-site.mjs <versions.json> <outDir> [--repo owner/name]");
  process.exit(1);
}
const repo = rest[rest.indexOf("--repo") + 1] ?? "Kuisin/swimlane-downloads";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function write(relPath, contents) {
  const full = join(outDir, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents);
}

const CSS = `
:root { --bg:#ffffff; --fg:#111827; --muted:#6b7280; --line:#e5e7eb; --accent:#111827; --card:#f9fafb; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#0b0e14; --fg:#e5e7eb; --muted:#9ca3af; --line:#1f2937; --accent:#e5e7eb; --card:#111827; }
}
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans JP", sans-serif;
  line-height:1.5; }
main { max-width: 780px; margin: 0 auto; padding: 48px 20px 80px; }
h1 { font-size: 1.6rem; margin: 0 0 4px; }
h2 { font-size: 1rem; margin: 32px 0 10px; }
.sub { color: var(--muted); margin: 0 0 28px; }
.primary { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom: 8px; }
a.btn { display:inline-block; background:var(--accent); color:var(--bg); text-decoration:none;
  padding:10px 16px; border-radius:8px; font-weight:600; font-size:.95rem; }
a.btn.secondary { background:transparent; color:var(--fg); border:1px solid var(--line); font-weight:500; }
.meta { color:var(--muted); font-size:.82rem; }
table { width:100%; border-collapse:collapse; font-size:.9rem; }
th, td { text-align:left; padding:9px 8px; border-bottom:1px solid var(--line); }
th { color:var(--muted); font-weight:500; font-size:.78rem; text-transform:uppercase; letter-spacing:.04em; }
td.num { color:var(--muted); white-space:nowrap; }
code { background:var(--card); padding:2px 6px; border-radius:4px; font-size:.85em;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
pre { background:var(--card); padding:12px 14px; border-radius:8px; overflow:auto; font-size:.82rem;
  border:1px solid var(--line); }
.note { border:1px solid var(--line); background:var(--card); border-radius:8px; padding:12px 14px;
  font-size:.86rem; color:var(--muted); }
ul.versions { list-style:none; padding:0; margin:0; }
ol.steps { padding-left: 20px; }
ol.steps > li { margin: 0 0 18px; }
ol.steps > li > strong { display:inline-block; margin-bottom:4px; }
ol.sub-steps { padding-left: 18px; margin: 6px 0; }
ol.sub-steps li { margin: 3px 0; }
kbd { background:var(--card); border:1px solid var(--line); border-bottom-width:2px; border-radius:4px;
  padding:1px 5px; font-size:.8em; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
h3 { font-size:.95rem; margin:22px 0 8px; }
table.tight td { vertical-align:top; font-size:.86rem; }
table.tight td:first-child { white-space:nowrap; color:var(--muted); width:34%; }
p { margin: 8px 0; }
ul.versions li { padding:8px 0; border-bottom:1px solid var(--line); display:flex; gap:12px; align-items:baseline; }
a { color:inherit; }
footer { margin-top:48px; color:var(--muted); font-size:.8rem; }
`;

function page({ title, body, canonical }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ""}
<style>${CSS}</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function assetRows(release) {
  const order = ["mac-arm64", "mac-x64", "win-x64", "linux-x64", "linux-deb", "vsix"];
  return order
    .filter((k) => release.assets[k])
    .map((k) => {
      const a = release.assets[k];
      const p = PLATFORMS[k];
      return `<tr>
  <td><strong>${esc(p.label)}</strong> <span class="meta">${esc(p.detail)}</span></td>
  <td class="num">${esc(formatBytes(a.size))}</td>
  <td><a href="${esc(a.url)}">${esc(a.name)}</a></td>
</tr>`;
    })
    .join("\n");
}

/**
 * Browsers cannot reliably distinguish Apple silicon from Intel, so rather than
 * guessing wrong we surface the likely choice and keep the other one visible.
 */
const DETECT = `
<script>
(function () {
  var ua = navigator.userAgent;
  var plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  var key = null;
  if (/Mac/i.test(plat) || /Mac OS X/i.test(ua)) key = "mac-arm64";
  else if (/Win/i.test(plat) || /Windows/i.test(ua)) key = "win-x64";
  else if (/Linux/i.test(plat)) key = "linux-x64";
  if (!key) return;
  var el = document.querySelector('[data-platform="' + key + '"]');
  if (!el) return;
  var slot = document.getElementById("primary-download");
  if (slot) { slot.innerHTML = el.innerHTML; slot.hidden = false; }
})();
</script>`;

function indexPage() {
  const latest = manifest.versions[0];
  if (!latest) {
    return page({ title: "Swimlane — Downloads", body: "<h1>No releases yet</h1>" });
  }

  const buttons = Object.keys(latest.assets)
    .map((k) => {
      const a = latest.assets[k];
      const p = PLATFORMS[k];
      return `<template data-platform="${esc(k)}"><a class="btn" href="${esc(a.url)}">Download for ${esc(p.label)} <span style="opacity:.7">(${esc(p.detail)})</span></a></template>`;
    })
    .join("\n");

  const others = manifest.versions
    .slice(1, 11)
    .map(
      (v) =>
        `<li><a href="v/${esc(v.version)}/">${esc(v.version)}</a> <span class="meta">${esc(v.date?.slice(0, 10) ?? "")}</span></li>`,
    )
    .join("\n");

  return page({
    title: "Swimlane — Downloads",
    body: `
<h1>Swimlane</h1>
<p class="sub">Desktop app and VS Code extension. Current version <strong>${esc(latest.version)}</strong>${latest.date ? ` &middot; released ${esc(latest.date.slice(0, 10))}` : ""}.</p>

${buttons}
<div class="primary"><div id="primary-download" hidden></div></div>

<h2>All downloads for ${esc(latest.version)}</h2>
<table><thead><tr><th>Platform</th><th>Size</th><th>File</th></tr></thead>
<tbody>${assetRows(latest)}</tbody></table>

<h2 id="install-vscode">Installing the VS Code extension</h2>
<p>The extension is not on the Marketplace, so it installs from the <code>.vsix</code> file. Pick whichever route you prefer &mdash; they do the same thing.</p>

<ol class="steps">
  <li>
    <strong>Download the <code>.vsix</code>.</strong>
    <div class="primary"><a class="btn" href="${esc(latest.assets.vsix?.url ?? "#")}">Download swimlane-diagrams-${esc(latest.version)}.vsix</a></div>
    <p class="meta">Your browser may warn that a <code>.vsix</code> is unusual. It is a zip archive; keep it.</p>
  </li>

  <li>
    <strong>Install it.</strong>
    <p><em>From the command line</em> &mdash; needs the <code>code</code> command on your PATH
    (in VS Code: <em>Command Palette &rarr; Shell Command: Install 'code' command in PATH</em>):</p>
<pre>code --install-extension ~/Downloads/swimlane-diagrams-${esc(latest.version)}.vsix</pre>
    <p><em>Or from inside VS Code</em>, without the terminal:</p>
    <ol class="sub-steps">
      <li>Open the <strong>Extensions</strong> view &mdash; <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> on macOS, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> on Windows and Linux.</li>
      <li>Click the <strong>&hellip;</strong> menu at the top of that panel.</li>
      <li>Choose <strong>Install from VSIX&hellip;</strong> and pick the downloaded file.</li>
    </ol>
    <p class="meta">Dragging the <code>.vsix</code> onto the Extensions panel also works.</p>
  </li>

  <li>
    <strong>Reload the window</strong> if VS Code asks &mdash; <em>Command Palette &rarr; Developer: Reload Window</em>.
  </li>

  <li>
    <strong>Check it is there.</strong> Open the Command Palette
    (<kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) and type <code>Swimlane</code>.
    You should see <strong>Swimlane: Open Diagram Editor</strong>. Or run:
<pre>code --list-extensions | grep swimlane</pre>
  </li>
</ol>

<h3>Using it</h3>
<p>Open a folder containing <code>.txt</code> diagrams, then run <strong>Swimlane: Open Diagram Editor</strong>. The extension edits the diagrams in place and commits them with your own git; it never touches unrelated changes in your working tree.</p>
<p class="meta">Point it at a subfolder with the <code>swimlane.diagramsRoot</code> setting, or commit a <code>.swimlane.json</code> to the repository so everyone shares the same configuration.</p>

<h3>Updating and removing</h3>
<pre>code --install-extension swimlane-diagrams-&lt;new-version&gt;.vsix   # installing over the top upgrades
code --uninstall-extension swimlane-cloud.swimlane-diagrams</pre>
<p class="meta">There is no auto-update for a manually installed extension. Check this page, or watch <code>versions.json</code>.</p>

<h3>If it will not install</h3>
<table class="tight">
  <tbody>
    <tr><td><code>command not found: code</code></td><td>The CLI is not on your PATH. Use the Extensions-panel route above, or run <em>Shell Command: Install 'code' command in PATH</em> from the Command Palette.</td></tr>
    <tr><td>"is not a valid VSIX"</td><td>The download was truncated. Check the size matches ${esc(formatBytes(latest.assets.vsix?.size))} and download again.</td></tr>
    <tr><td>Commands do not appear</td><td>Reload the window. If they are still missing, open <em>Output &rarr; Log (Extension Host)</em> for the activation error.</td></tr>
    <tr><td>Git actions are greyed out</td><td>The workspace is not trusted. Committing runs the repository's hooks, so the extension refuses in an untrusted workspace &mdash; trust it from the banner or <em>Workspaces: Manage Workspace Trust</em>.</td></tr>
  </tbody>
</table>

<h2 id="install-desktop">Installing the desktop app</h2>
<p>The desktop app is <strong>signed ad-hoc, not notarized</strong>, because notarizing needs a paid Apple Developer ID. It launches, but the first open needs one extra confirmation.</p>

<h3>macOS</h3>
<ol class="steps">
  <li>Open the <code>.dmg</code> and drag <strong>Swimlane Cloud</strong> into <strong>Applications</strong>.</li>
  <li><strong>Right-click the app and choose Open</strong> &mdash; then <strong>Open</strong> again in the dialog. Double-clicking the first time will not work; right-click is what offers the override.</li>
  <li>macOS remembers the choice, so later launches are normal.</li>
</ol>
<p class="note">If macOS says the app <strong>&ldquo;is damaged and can&rsquo;t be opened&rdquo;</strong>, that is the quarantine flag rather than a corrupt download. Clear it:
<pre>xattr -dr com.apple.quarantine "/Applications/Swimlane Cloud.app"</pre>
Then open the app normally. On Apple silicon you can also allow it under <em>System Settings &rarr; Privacy &amp; Security</em>, where a blocked app appears with an <strong>Open Anyway</strong> button.</p>
<p class="meta">Apple silicon: take the <strong>arm64</strong> build. Intel Macs need <strong>x64</strong>. If unsure, check <em>&#63743; menu &rarr; About This Mac</em>.</p>

<h3>Windows</h3>
<p>Run the installer. SmartScreen will show &ldquo;Windows protected your PC&rdquo; &mdash; choose <strong>More info</strong>, then <strong>Run anyway</strong>. The warning is because the installer is unsigned, not because anything is wrong with the download.</p>

<h2>Scripting</h2>
<p>Download URLs embed their version, so there is no stable filename to hard-code. Resolve one from the manifest instead:</p>
<pre>curl -fsSL https://kuisin.github.io/swimlane-downloads/versions.json \\
  | jq -r '.versions[0].assets["mac-arm64"].url'</pre>
<p>Install the newest extension in one line:</p>
<pre>curl -fsSL -o /tmp/swimlane.vsix \\
  "$(curl -fsSL https://kuisin.github.io/swimlane-downloads/versions.json | jq -r '.versions[0].assets.vsix.url')" \\
  && code --install-extension /tmp/swimlane.vsix</pre>
<p class="meta">Stable redirects also exist: <code>/latest/vsix/</code>, <code>/latest/mac-arm64/</code>, <code>/latest/mac-x64/</code>, <code>/latest/win-x64/</code>.</p>

${others ? `<h2>Previous versions</h2><ul class="versions">${others}</ul>` : ""}

<footer>Built from <a href="https://github.com/${esc(repo)}">${esc(repo)}</a>.</footer>
${DETECT}`,
  });
}

function versionPage(v) {
  return page({
    title: `Swimlane ${v.version} — Downloads`,
    canonical: `https://kuisin.github.io/swimlane-downloads/v/${v.version}/`,
    body: `
<h1>Swimlane ${esc(v.version)}</h1>
<p class="sub">${v.date ? `Released ${esc(v.date.slice(0, 10))}. ` : ""}This page is permanent — these files will not change.</p>
<table><thead><tr><th>Platform</th><th>Size</th><th>File</th></tr></thead>
<tbody>${assetRows(v)}</tbody></table>
${v.notes ? `<h2>Release notes</h2><pre>${esc(v.notes)}</pre>` : ""}
<footer><a href="../../">&larr; All versions</a></footer>`,
  });
}

/** Meta-refresh, because Pages cannot issue a real 302. */
function redirectPage(url, label) {
  return page({
    title: `Downloading ${label}…`,
    body: `<meta http-equiv="refresh" content="0; url=${esc(url)}">
<h1>Downloading…</h1>
<p class="sub">If nothing happens, <a href="${esc(url)}">download ${esc(label)} directly</a>.</p>
<script>location.replace(${JSON.stringify(url)});</script>`,
  });
}

// ── emit ─────────────────────────────────────────────────────────────────────
write("index.html", indexPage());
write("versions.json", JSON.stringify(manifest, null, 2));
// Tells Pages not to run the output through Jekyll, which would drop files
// whose names begin with an underscore.
write(".nojekyll", "");

for (const v of manifest.versions) {
  write(join("v", v.version, "index.html"), versionPage(v));
}

const latest = manifest.versions[0];
if (latest) {
  for (const [key, asset] of Object.entries(latest.assets)) {
    write(join("latest", key, "index.html"), redirectPage(asset.url, `${key} ${latest.version}`));
  }
}

console.log(
  `built ${manifest.versions.length} version page(s) into ${outDir} (latest ${manifest.latest ?? "none"})`,
);
