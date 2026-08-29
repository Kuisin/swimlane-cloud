/**
 * The version manifest that drives the download site.
 *
 * `versions.json` is the machine-readable source of truth. It exists so that
 * scripts and CI never have to scrape HTML or guess an asset filename — a
 * download URL embeds its version, so there is no stable "latest.dmg" to
 * hard-code. Callers resolve one:
 *
 *   curl -fsSL https://kuisin.github.io/swimlane-downloads/versions.json \
 *     | jq -r '.versions[0].assets["mac-arm64"].url'
 */

/** Asset filename -> the platform key the site groups by. */
export function classifyAsset(name) {
  if (name.endsWith(".vsix")) return "vsix";
  if (name.endsWith(".dmg")) return name.includes("arm64") ? "mac-arm64" : "mac-x64";
  if (name.endsWith(".exe")) return "win-x64";
  if (name.endsWith(".AppImage")) return "linux-x64";
  if (name.endsWith(".deb")) return "linux-deb";
  return null;
}

export const PLATFORMS = {
  "mac-arm64": { label: "macOS", detail: "Apple silicon", kind: "desktop" },
  "mac-x64": { label: "macOS", detail: "Intel", kind: "desktop" },
  "win-x64": { label: "Windows", detail: "64-bit installer", kind: "desktop" },
  "linux-x64": { label: "Linux", detail: "AppImage", kind: "desktop" },
  "linux-deb": { label: "Linux", detail: "Debian package", kind: "desktop" },
  vsix: { label: "VS Code", detail: "extension", kind: "extension" },
};

/**
 * Merge one release into the manifest, newest first.
 *
 * Re-publishing an existing version replaces its entry rather than appending a
 * duplicate, so re-running a failed release job is safe.
 */
export function upsertRelease(manifest, release) {
  const versions = (manifest.versions ?? []).filter((v) => v.version !== release.version);
  versions.unshift(release);
  versions.sort((a, b) => compareVersions(b.version, a.version));
  return {
    updated: release.date,
    latest: versions[0]?.version ?? null,
    versions,
  };
}

/** Semver-ish ordering; falls back to string compare for anything exotic. */
export function compareVersions(a, b) {
  const pa = String(a).split(/[.-]/);
  const pb = String(b).split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = Number(pa[i]);
    const nb = Number(pb[i]);
    if (Number.isNaN(na) || Number.isNaN(nb)) {
      const s = String(pa[i] ?? "").localeCompare(String(pb[i] ?? ""));
      if (s !== 0) return s;
      continue;
    }
    if (na !== nb) return na - nb;
  }
  return 0;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
