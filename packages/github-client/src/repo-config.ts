/**
 * `.swimlane.json`, committed at the repo root.
 *
 * The hub is stateless — no database, so nowhere to record which folder holds a
 * repo's diagrams. Putting it in the repo solves that and is better than a
 * server-side setting anyway: the config is versioned with the content, a tag
 * carries the config it was released with, and the VS Code extension reads the
 * exact same file. Absent config is normal, not an error.
 */

export interface RepoConfig {
  /** POSIX folder the diagram tree is rooted at. "" means the whole repo. */
  diagramsRoot: string;
  /** Display name; falls back to the repo name. */
  title: string | null;
  themeKey: string;
  /** Overridable for teams whose staging branch is not called `test`. */
  integrationBranch: string;
  /**
   * Overrides for the renderer's `DIAGRAM_LAYOUT` table (margins, gutter
   * widths, lane grid sizing). Only keys that differ from the engine default
   * are stored, so reverting a field is a deletion and improvements to the
   * engine defaults keep reaching repositories that never pinned a value.
   */
  layout: Record<string, number>;
}

export const DEFAULT_REPO_CONFIG: RepoConfig = {
  diagramsRoot: "",
  title: null,
  themeKey: "basic",
  integrationBranch: "test",
  layout: {},
};

export const REPO_CONFIG_PATH = ".swimlane.json";

/** Ceiling for any layout override. Generous, but keeps a typo from producing a 2 GB SVG. */
const LAYOUT_MAX = 10000;
const LAYOUT_MAX_KEYS = 64;

function normalizeRoot(value: string): string {
  return value.replace(/^\.?\/+/, "").replace(/\/+$/, "");
}

function isLayoutValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= LAYOUT_MAX;
}

/**
 * Parse leniently: a malformed or partial config degrades to defaults rather
 * than taking down a page. A viewer should still see the diagram when someone
 * fat-fingers the JSON.
 */
export function parseRepoConfig(raw: string | null): RepoConfig {
  if (!raw) return { ...DEFAULT_REPO_CONFIG, layout: {} };

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_REPO_CONFIG, layout: {} };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ...DEFAULT_REPO_CONFIG, layout: {} };
  }

  const obj = data as Record<string, unknown>;
  const str = (key: string): string | null =>
    typeof obj[key] === "string" ? (obj[key] as string) : null;

  const root = str("diagramsRoot");
  const title = str("title");
  const themeKey = str("themeKey");
  const integration = str("integrationBranch");

  // Keep only usable numbers. A junk entry is dropped, not fatal: the renderer
  // falls back to its own default for any key that is missing.
  const layout: Record<string, number> = {};
  const rawLayout = obj.layout;
  if (rawLayout && typeof rawLayout === "object" && !Array.isArray(rawLayout)) {
    for (const [key, value] of Object.entries(rawLayout as Record<string, unknown>)) {
      if (isLayoutValue(value)) layout[key] = value;
    }
  }

  return {
    diagramsRoot: root === null ? DEFAULT_REPO_CONFIG.diagramsRoot : normalizeRoot(root),
    title: title && title.trim() ? title.trim() : null,
    themeKey: themeKey && themeKey.trim() ? themeKey.trim() : DEFAULT_REPO_CONFIG.themeKey,
    integrationBranch:
      integration && integration.trim()
        ? integration.trim()
        : DEFAULT_REPO_CONFIG.integrationBranch,
    layout,
  };
}

/** True when `path` is inside the configured diagrams root. */
export function isWithinRoot(config: RepoConfig, path: string): boolean {
  if (!config.diagramsRoot) return true;
  return path === config.diagramsRoot || path.startsWith(`${config.diagramsRoot}/`);
}

/** A rejected field from `validateRepoConfig`, ready to show beside its input. */
export interface RepoConfigError {
  field: keyof RepoConfig;
  message: string;
}

const THEME_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/** Control characters plus the metacharacters git forbids in a ref name. */
const REF_FORBIDDEN_RE = /[\x00-\x20\x7f~^:?*[\\]/;

function isBranchName(name: string): boolean {
  if (name.length > 255 || REF_FORBIDDEN_RE.test(name)) return false;
  if (name.includes("..") || name.includes("//") || name.includes("@{")) return false;
  if (/^[-./]/.test(name)) return false;
  return !(name.endsWith("/") || name.endsWith(".") || name.endsWith(".lock"));
}

function isFolderPath(path: string): boolean {
  if (path.length > 512 || path.includes("\\")) return false;
  return path.split("/").every((segment) => segment && segment !== "." && segment !== "..");
}

/**
 * Validate a config typed into a settings editor.
 *
 * The mirror image of `parseRepoConfig`. That one degrades silently, because a
 * reader must never be blocked by someone else's typo; this one reports what is
 * wrong, because saving something other than what was typed is worse than
 * refusing to save. An omitted field takes its default.
 *
 * `layout` is checked only for shape — a finite number in range. Which keys
 * actually mean anything is the renderer's business, and this package stays
 * free of that dependency so it remains light enough for the extension host.
 */
export function validateRepoConfig(input: unknown): {
  config: RepoConfig;
  errors: RepoConfigError[];
} {
  const obj: Record<string, unknown> =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const config: RepoConfig = { ...DEFAULT_REPO_CONFIG, layout: {} };
  const errors: RepoConfigError[] = [];
  const fail = (field: keyof RepoConfig, message: string) => errors.push({ field, message });

  const given = (key: keyof RepoConfig): unknown =>
    obj[key] === null || obj[key] === undefined ? undefined : obj[key];

  const root = given("diagramsRoot");
  if (root !== undefined) {
    if (typeof root !== "string") fail("diagramsRoot", "must be text");
    else {
      const normalized = normalizeRoot(root.trim());
      if (normalized && !isFolderPath(normalized)) {
        fail("diagramsRoot", 'must be a folder inside the repository, such as "diagrams"');
      } else config.diagramsRoot = normalized;
    }
  }

  const title = given("title");
  if (title !== undefined) {
    if (typeof title !== "string") fail("title", "must be text");
    else if (title.trim().length > 200) fail("title", "is longer than 200 characters");
    else config.title = title.trim() || null;
  }

  const themeKey = given("themeKey");
  if (themeKey !== undefined) {
    if (typeof themeKey !== "string") fail("themeKey", "must be text");
    else if (themeKey.trim() && !THEME_KEY_RE.test(themeKey.trim())) {
      fail("themeKey", "may only contain letters, digits and . _ -");
    } else if (themeKey.trim()) config.themeKey = themeKey.trim();
  }

  const branch = given("integrationBranch");
  if (branch !== undefined) {
    if (typeof branch !== "string") fail("integrationBranch", "must be text");
    else if (branch.trim() && !isBranchName(branch.trim())) {
      fail("integrationBranch", "is not a valid branch name");
    } else if (branch.trim()) config.integrationBranch = branch.trim();
  }

  const layout = given("layout");
  if (layout !== undefined) {
    if (typeof layout !== "object" || Array.isArray(layout)) {
      fail("layout", "must be an object of numbers");
    } else {
      const entries = Object.entries(layout as Record<string, unknown>);
      if (entries.length > LAYOUT_MAX_KEYS) {
        fail("layout", `has more than ${LAYOUT_MAX_KEYS} entries`);
      } else {
        for (const [key, value] of entries) {
          if (isLayoutValue(value)) config.layout[key] = value;
          else fail("layout", `${key} must be a number between 0 and ${LAYOUT_MAX}`);
        }
      }
    }
  }

  return { config, errors };
}

/**
 * The file to commit for `config`, formatted the way the seed writes it.
 *
 * `existingRaw` is the file being replaced: keys this package does not know
 * about are carried over rather than dropped, so an editor built on the fields
 * above cannot silently delete something a future version added. An empty
 * `layout` is omitted, so a repository that never touches geometry keeps the
 * same file it has today.
 */
export function serializeRepoConfig(config: RepoConfig, existingRaw?: string | null): string {
  const extra: Record<string, unknown> = {};
  if (existingRaw) {
    try {
      const data: unknown = JSON.parse(existingRaw);
      if (data && typeof data === "object" && !Array.isArray(data)) {
        for (const [key, value] of Object.entries(data)) {
          if (!(key in DEFAULT_REPO_CONFIG)) extra[key] = value;
        }
      }
    } catch {
      /* a malformed file carries nothing worth keeping */
    }
  }
  const { layout, ...rest } = config;
  const body: Record<string, unknown> = { ...rest };
  if (Object.keys(layout).length > 0) body.layout = layout;
  return `${JSON.stringify({ ...body, ...extra }, null, 2)}\n`;
}
